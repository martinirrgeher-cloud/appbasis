import {
  capabilityId, PostgresPermissionStore, principalId,
} from "@appbasis/permissions";

import { UlcLinzAuthorizationDeniedError } from "./authorization";
import {
  assertActiveUlcStaffSession, assertUlcStaffSessionStillValid,
} from "./staff-session-guard";
import type { UlcTrainingSessionSqlClient } from "./training-session-postgres";

/**
 * INACTIVE N16 draft. Single-purpose administrator-only initial IRG mapping.
 * There is NO HTTP route, no migration registration and no live callers.
 *
 * Caller MUST supply actorIdentityId + trustedSessionId from a server-
 * validated Better Auth identity, NEVER a JSON body. The same transaction
 * pins the account, security state, session, membership, technical role,
 * principal, group and new mapping. Assignment and audit commit together.
 *
 * Replacing an existing mapping, deleting, reassigning another group's IRG
 * role or granting permissions is deliberately outside this contract.
 */
export class UlcIrgModuleAssignmentConflictError extends Error {
  readonly code = "ULC_IRG_MODULE_ASSIGNMENT_CONFLICT";
  constructor() {
    super("IRG module assignment is stale, in use, or already configured.");
    this.name = "UlcIrgModuleAssignmentConflictError";
  }
}

type SqlParameter = string | number | boolean | null;
interface IrgModuleAssignmentSql extends UlcTrainingSessionSqlClient {
  begin?<T>(
    callback: (transaction: UlcTrainingSessionSqlClient) => Promise<T>,
  ): Promise<T>;
}

export interface UlcIrgModuleAssignmentInput {
  readonly actorIdentityId: string;
  readonly trustedSessionId: string;
  readonly organizationId: string;
  readonly groupId: string;
  /** Null is the only valid revision for an initial assignment. */
  readonly expectedRevision: null;
  readonly reason: string;
}

export interface UlcIrgModuleAssignmentResult {
  readonly organizationId: string;
  readonly groupId: string;
  readonly moduleId: "performance_registration";
  readonly actorIdentityId: string;
}

export async function assignUlcIrgModuleGroup(
  sql: IrgModuleAssignmentSql,
  input: UlcIrgModuleAssignmentInput,
): Promise<UlcIrgModuleAssignmentResult> {
  const actor = validId(input.actorIdentityId);
  const organization = validId(input.organizationId);
  const group = validId(input.groupId);
  const session = validId(input.trustedSessionId);
  const reason = validReason(input.reason);
  if (input.expectedRevision !== null || typeof sql.begin !== "function") {
    throw new UlcLinzAuthorizationDeniedError();
  }

  try {
    return await sql.begin(async tx => {
      // This precise order follows the existing N16 Staff guard: session,
      // identity, security state, membership, principal, role, group.
      await assertActiveUlcStaffSession(tx, session, actor);
      const users = await tx.unsafe(
        'SELECT id, banned FROM "user" WHERE id=$1 FOR SHARE', [actor],
      );
      if (users.length !== 1 || users[0]?.banned === true) deny();
      const state = await tx.unsafe(
        `SELECT disabled_at,must_change_password
         FROM appbasis_identity_security_state
         WHERE identity_id=$1 FOR SHARE`, [actor],
      );
      if (state.length !== 1 || state[0]?.disabled_at != null ||
          state[0]?.must_change_password !== false) deny();
      const memberships = await tx.unsafe(
        `SELECT organization_id,source_role,active
         FROM ulc_linz_membership WHERE identity_id=$1 FOR SHARE`, [actor],
      );
      if (memberships.length !== 1 ||
          memberships[0]?.organization_id !== organization ||
          memberships[0]?.source_role !== "admin" ||
          memberships[0]?.active !== true) deny();
      const principals = await tx.unsafe(
        `SELECT principal_id FROM appbasis_permission_principal
         WHERE principal_id=$1 FOR SHARE`, [actor],
      );
      if (principals.length !== 1) deny();
      const assignments = await tx.unsafe(
        `SELECT role_id FROM appbasis_permission_principal_role
         WHERE principal_id=$1 ORDER BY role_id FOR SHARE`, [actor],
      );
      if (assignments.length !== 1 ||
          assignments[0]?.role_id !== "ulc-linz:admin") deny();
      const roles = await tx.unsafe(
        `SELECT role_id,state FROM appbasis_permission_role
         WHERE role_id='ulc-linz:admin' FOR SHARE`,
      );
      if (roles.length !== 1 || roles[0]?.state !== "active") deny();
      // This is the existing organization-level admin capability, NOT a
      // performance_registration grant. Admins cannot add a grant here.
      const permitted = await new PostgresPermissionStore(tx).evaluatePermission({
        principalId: principalId(actor),
        capability: capabilityId("ulc-linz:module:athletes:edit"),
      });
      if (!permitted) deny();

      // FOR UPDATE is essential when there is NO mapping row yet. A lock on
      // an absent mapping would not serialize two initial assignments.
      const groups = await tx.unsafe(
        `SELECT id FROM appbasis_training_group
         WHERE id=$1 AND organization_id=$2 AND is_active=true
           AND attendance_mode='self_registration'
         FOR UPDATE`, [group, organization],
      );
      if (groups.length !== 1) deny();
      const prior = await tx.unsafe(
        `SELECT module_id FROM ulc_linz_training_module_group
         WHERE organization_id=$1 AND group_id=$2 FOR SHARE`,
        [organization, group],
      );
      if (prior.length !== 0) throw new UlcIrgModuleAssignmentConflictError();

      // The existing (organization,module) and (organization,group) unique
      // keys reject competing assignments; the audit unique key prevents
      // silent reuse after a separate DELETE.
      const mapped = await tx.unsafe(
        `INSERT INTO ulc_linz_training_module_group
           (organization_id,module_id,group_id)
         VALUES ($1,'performance_registration',$2)
         RETURNING group_id`, [organization, group],
      );
      if (mapped.length !== 1 || mapped[0]?.group_id !== group) deny();
      const audited = await tx.unsafe(
        `INSERT INTO ulc_linz_irg_module_assignment_audit
           (organization_id,group_id,module_id,actor_identity_id,event_type,reason)
         VALUES ($1,$2,'performance_registration',$3,'assign',$4)
         RETURNING event_id`, [organization, group, actor, reason],
      );
      if (audited.length !== 1) deny();
      await assertUlcStaffSessionStillValid(tx, session, actor);
      return Object.freeze({
        organizationId: organization, groupId: group,
        moduleId: "performance_registration" as const, actorIdentityId: actor,
      });
    });
  } catch (error) {
    if (hasSqlCode(error, "23505") || hasSqlCode(error, "23514")) {
      throw new UlcIrgModuleAssignmentConflictError();
    }
    throw error;
  }
}

function hasSqlCode(error: unknown, code: string): boolean {
  return error !== null && typeof error === "object" &&
    "code" in error && error.code === code;
}
function validId(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 200 ||
      value !== value.trim()) deny();
  return value;
}
function validReason(value: unknown): string {
  if (typeof value !== "string" || value.length < 12 || value.length > 300 ||
      value !== value.trim() ||
      [...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) deny();
  return value;
}
function deny(): never { throw new UlcLinzAuthorizationDeniedError(); }
