import {
  capabilityId, principalId, roleId, PostgresPermissionStore,
  PostgresPrincipalAccessAdministration,
  PrincipalPermissionAdministrationError, RoleAdministrationError,
} from "@appbasis/permissions";
import { UlcLinzAuthorizationDeniedError } from "./authorization";
import { reviewUlcIrgTrainerPermission } from "./irg-permission-review";
import {
  assertActiveUlcStaffSession, assertUlcStaffSessionStillValid,
} from "./staff-session-guard";
import type { UlcUserAccessChoice } from "./user-admin-permission-profiles";
import type { UlcTrainingSessionSqlClient } from "./training-session-postgres";

/**
 * N16 INACTIVE: no HTTP caller or productive permission mutation.
 *
 * All authorization and Core role/grant/revoke CAS/audits run in ONE SQL
 * transaction. Its nested begin adapter reuses the locked transaction,
 * never opening a connection on which the previously checked actor/group
 * authority is not held. Better Auth session.id + actorIdentityId MUST
 * originate from the trusted server-side session, not request JSON.
 */
export class UlcIrgPermissionStaleError extends Error {
  readonly code = "ULC_IRG_PERMISSION_STALE";
  constructor() {
    super("IRG trainer permission update is stale.");
    this.name = "UlcIrgPermissionStaleError";
  }
}

export interface UlcIrgPermissionAdministrationInput {
  readonly actorIdentityId: string;
  readonly trustedSessionId: string;
  readonly organizationId: string;
  readonly groupId: string;
  readonly targetIdentityId: string;
  readonly choice: UlcUserAccessChoice;
  readonly expectedRoleIds: readonly string[];
  readonly expectedGrants: readonly string[];
  readonly expectedRevokes: readonly string[];
  readonly reason: string;
}

export interface UlcIrgPermissionAdministrationResult {
  readonly actorIdentityId: string;
  readonly targetIdentityId: string;
  readonly organizationId: string;
  readonly groupId: string;
  readonly roleIds: readonly string[];
  readonly grants: readonly string[];
  readonly revokes: readonly string[];
}

interface SqlWithTransaction extends UlcTrainingSessionSqlClient {
  begin?<T>(
    callback: (transaction: UlcTrainingSessionSqlClient) => Promise<T>,
  ): Promise<T>;
}

const ADMIN_ROLE = "ulc-linz:admin";
const TRAINER_ROLE = "ulc-linz:trainer";
const ADMIN_CAPABILITY = "ulc-linz:module:athletes:edit";

export async function replaceUlcIrgTrainerPermissions(
  sql: SqlWithTransaction,
  input: UlcIrgPermissionAdministrationInput,
): Promise<UlcIrgPermissionAdministrationResult> {
  const actor = identifier(input.actorIdentityId);
  const session = identifier(input.trustedSessionId);
  const organization = identifier(input.organizationId);
  const group = identifier(input.groupId);
  const target = identifier(input.targetIdentityId);
  const reason = auditReason(input.reason);
  if (actor === target || typeof sql.begin !== "function") deny();

  try {
    return await sql.begin(async tx => {
      await assertActiveUlcStaffSession(tx, session, actor);
      await validAccount(tx, actor);
      await activeMembership(tx, actor, organization, "admin");
      // FOR UPDATE serializes concurrent Core grant/revoke/role edits.
      await exactPrincipalRole(tx, actor, ADMIN_ROLE);
      const permission = await new PostgresPermissionStore(tx).evaluatePermission({
        principalId: principalId(actor),
        capability: capabilityId(ADMIN_CAPABILITY),
      });
      if (!permission) deny();

      await validAccount(tx, target);
      const trainerId = await activeMembership(tx, target, organization, "trainer");
      await exactPrincipalRole(tx, target, TRAINER_ROLE);
      const roleCapabilityRows = await tx.unsafe(
        `SELECT capability_id FROM appbasis_permission_role_capability
         WHERE role_id=$1 ORDER BY capability_id FOR SHARE`,
        [TRAINER_ROLE],
      );
      const roleCapabilities = roleCapabilityRows.map(row => identifier(row.capability_id));
      const groups = await tx.unsafe(
        `SELECT id FROM appbasis_training_group
         WHERE organization_id=$1 AND id=$2 AND is_active=true
           AND attendance_mode='self_registration' FOR SHARE`,
        [organization, group],
      );
      if (groups.length !== 1) deny();
      const mapped = await tx.unsafe(
        `SELECT module_id FROM ulc_linz_training_module_group
         WHERE organization_id=$1 AND group_id=$2 FOR SHARE`,
        [organization, group],
      );
      if (mapped.length !== 1 || mapped[0]?.module_id !== "performance_registration") deny();
      const trainer = await tx.unsafe(
        `SELECT id FROM appbasis_trainer
         WHERE organization_id=$1 AND id=$2 AND is_active=true FOR SHARE`,
        [organization, trainerId],
      );
      if (trainer.length !== 1) deny();
      const membership = await tx.unsafe(
        `SELECT trainer_id FROM appbasis_trainer_group_membership
         WHERE organization_id=$1 AND trainer_id=$2 AND group_id=$3 FOR SHARE`,
        [organization, trainerId, group],
      );
      if (membership.length !== 1) deny();

      // The target principal is already locked FOR UPDATE. The expected
      // direct override arrays are checked against the actual DB snapshot,
      // not trusted from a client. Other module overrides remain unchanged.
      const grants = await loadOverrides(tx, "appbasis_permission_principal_grant", target);
      const revokes = await loadOverrides(tx, "appbasis_permission_principal_revoke", target);
      if (!sameSorted(input.expectedRoleIds, [TRAINER_ROLE]) ||
          !sameSorted(input.expectedGrants, grants) ||
          !sameSorted(input.expectedRevokes, revokes)) {
        throw new UlcIrgPermissionStaleError();
      }
      const plan = reviewUlcIrgTrainerPermission({
        targetSourceRole: "trainer", expectedRoleIds: [TRAINER_ROLE],
        expectedGrants: grants, expectedRevokes: revokes, roleCapabilities,
        choice: input.choice,
      });
      // Core already records TWO audit entries and enforces separate role
      // and principal-override CAS. The begin callback MUST use this SAME tx.
      const core = new PostgresPrincipalAccessAdministration({
        unsafe(query, params) { return tx.unsafe(query, params); },
        async begin<T>(callback: (transaction: UlcTrainingSessionSqlClient) => Promise<T>) {
          return callback(tx);
        },
      });
      const saved = await core.replacePrincipalAccess(
        principalId(target), [roleId(TRAINER_ROLE)],
        {
          grants: plan.proposedGrants.map(capabilityId),
          revokes: plan.proposedRevokes.map(capabilityId),
        },
        { actorPrincipalId: principalId(actor), reason },
        {
          expectedRoleIds: [roleId(TRAINER_ROLE)],
          expectedGrants: grants.map(capabilityId),
          expectedRevokes: revokes.map(capabilityId),
        },
      );
      await assertUlcStaffSessionStillValid(tx, session, actor);
      return Object.freeze({
        actorIdentityId: actor, targetIdentityId: target,
        organizationId: organization, groupId: group,
        roleIds: Object.freeze(saved.roleIds.map(String)),
        grants: Object.freeze(saved.grants.map(String)),
        revokes: Object.freeze(saved.revokes.map(String)),
      });
    });
  } catch (error) {
    if (
      (error instanceof PrincipalPermissionAdministrationError &&
        error.code === "STALE_PRINCIPAL_PERMISSIONS") ||
      (error instanceof RoleAdministrationError &&
        error.code === "STALE_PRINCIPAL_ROLES")
    ) {
      throw new UlcIrgPermissionStaleError();
    }
    throw error;
  }
}

async function validAccount(tx: UlcTrainingSessionSqlClient, identity: string): Promise<void> {
  const user = await tx.unsafe(
    'SELECT id,banned FROM "user" WHERE id=$1 FOR SHARE', [identity],
  );
  if (user.length !== 1 || user[0]?.banned === true) deny();
  const security = await tx.unsafe(
    `SELECT identity_id,disabled_at,must_change_password
     FROM appbasis_identity_security_state WHERE identity_id=$1 FOR SHARE`,
    [identity],
  );
  if (security.length !== 1 || security[0]?.disabled_at != null ||
      security[0]?.must_change_password !== false) deny();
}

async function activeMembership(
  tx: UlcTrainingSessionSqlClient, identity: string,
  organization: string, role: "admin" | "trainer",
): Promise<string> {
  const rows = await tx.unsafe(
    `SELECT organization_id,subject_id,source_role,active
     FROM ulc_linz_membership WHERE identity_id=$1 FOR SHARE`,
    [identity],
  );
  if (rows.length !== 1 || rows[0]?.organization_id !== organization ||
      rows[0]?.source_role !== role || rows[0]?.active !== true) deny();
  return identifier(rows[0]?.subject_id);
}

async function exactPrincipalRole(
  tx: UlcTrainingSessionSqlClient,
  identity: string, expectedRole: string,
): Promise<void> {
  const principal = await tx.unsafe(
    `SELECT principal_id FROM appbasis_permission_principal
     WHERE principal_id=$1 FOR UPDATE`, [identity],
  );
  if (principal.length !== 1) deny();
  const assigned = await tx.unsafe(
    `SELECT role_id FROM appbasis_permission_principal_role
     WHERE principal_id=$1 ORDER BY role_id FOR SHARE`, [identity],
  );
  if (assigned.length !== 1 || assigned[0]?.role_id !== expectedRole) deny();
  // A role row's FOR UPDATE lock pins the role-capability FK set as well
  // as the role state against concurrent bundle edits.
  const role = await tx.unsafe(
    `SELECT role_id FROM appbasis_permission_role
     WHERE role_id=$1 AND state='active' FOR UPDATE`, [expectedRole],
  );
  if (role.length !== 1) deny();
}

async function loadOverrides(
  tx: UlcTrainingSessionSqlClient,
  table: "appbasis_permission_principal_grant" | "appbasis_permission_principal_revoke",
  identity: string,
): Promise<string[]> {
  // Table name comes from this closed union, NEVER from client input.
  const rows = await tx.unsafe(
    `SELECT capability_id FROM ${table}
     WHERE principal_id=$1 ORDER BY capability_id`, [identity],
  );
  return rows.map(row => identifier(row.capability_id));
}

function sameSorted(a: readonly string[], b: readonly string[]): boolean {
  return Array.isArray(a) && a.length === b.length &&
    a.every((x, i) => typeof x === "string" &&
      x.length > 0 && x.length <= 200 && x === x.trim() && x === b[i]);
}
function identifier(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 ||
      value.length > 200 || value !== value.trim()) deny();
  return value;
}
function auditReason(value: unknown): string {
  if (typeof value !== "string" || value.length < 12 ||
      value.length > 300 || value !== value.trim() ||
      [...value].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) deny();
  return value;
}
function deny(): never { throw new UlcLinzAuthorizationDeniedError(); }
