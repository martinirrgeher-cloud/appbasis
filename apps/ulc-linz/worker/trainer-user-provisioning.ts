import type { IdentityPostgresProvisioningOwner } from "@appbasis/identity/postgres-runtime";
import {
  PostgresPrincipalAccessAdministration,
  capabilityId,
  principalId,
  roleId,
  type PermissionStore,
  type PrincipalAccessState,
} from "@appbasis/permissions";

import roleDataScope from "./role-data-scope.json";
import {
  type PostgresUlcLinzTrainerIdentityLinks,
  type UlcLinzTrainerIdentityBinding,
} from "./trainer-identity-postgres";

type SqlParameter = string | number | boolean | null;

export interface UlcLinzTrainerUserProvisioningSqlClient {
  unsafe(
    query: string,
    parameters?: SqlParameter[],
  ): PromiseLike<readonly Record<string, unknown>[]>;
}

export type UlcLinzTrainerUserAccessAdministration = Pick<
  PostgresPrincipalAccessAdministration,
  "replacePrincipalAccess"
>;

export interface UlcLinzTrainerUserProvisioningInput {
  readonly administrativeSessionToken: string;
  readonly organizationId: string;
  readonly actorPrincipalId: string;
  readonly username: string;
  readonly displayName: string;
  readonly temporaryPassword: string;
  readonly contactEmail?: string;
  readonly trainerId: string;
}

export interface UlcLinzTrainerUserProvisioningResult {
  readonly identityId: string;
  readonly username: string;
  readonly displayName: string;
  readonly trainerId: string;
  readonly mustChangePassword: true;
}

export class UlcLinzTrainerUserProvisioningNotFoundError extends Error {
  readonly code = "ULC_LINZ_TRAINER_USER_NOT_FOUND";

  constructor() {
    super("Trainer user provisioning target was not found.");
    this.name = "UlcLinzTrainerUserProvisioningNotFoundError";
  }
}

export class UlcLinzTrainerUserProvisioningConflictError extends Error {
  readonly code = "ULC_LINZ_TRAINER_USER_CONFLICT";

  constructor() {
    super("Trainer user provisioning conflicts with existing state.");
    this.name = "UlcLinzTrainerUserProvisioningConflictError";
  }
}

export class UlcLinzTrainerUserProvisioningPersistenceError extends Error {
  readonly code = "ULC_LINZ_TRAINER_USER_PERSISTENCE_ERROR";

  constructor() {
    super("Trainer user provisioning returned an inconsistent state.");
    this.name = "UlcLinzTrainerUserProvisioningPersistenceError";
  }
}

export function createUlcLinzTrainerUserProvisioningService({
  identityProvisioning,
  sql,
  permissions,
  accessAdministration,
  trainerIdentityLinks,
}: {
  readonly identityProvisioning: IdentityPostgresProvisioningOwner;
  readonly sql: UlcLinzTrainerUserProvisioningSqlClient;
  readonly permissions: PermissionStore;
  readonly accessAdministration: UlcLinzTrainerUserAccessAdministration;
  readonly trainerIdentityLinks: Pick<
    PostgresUlcLinzTrainerIdentityLinks,
    "bindTrainer"
  >;
}) {
  assertCanonicalTrainerProvisioningPolicy();

  return Object.freeze({
    async createTrainerUser(
      input: UlcLinzTrainerUserProvisioningInput,
    ): Promise<UlcLinzTrainerUserProvisioningResult> {
      const administrativeSessionToken = requiredText(
        input.administrativeSessionToken,
      );
      const organizationId = requiredIdentifier(input.organizationId);
      const actorPrincipalId = requiredIdentifier(input.actorPrincipalId);
      const trainerId = requiredIdentifier(input.trainerId);

      const identity = await identityProvisioning.createInitialUser(
        administrativeSessionToken,
        {
          username: input.username,
          displayName: input.displayName,
          temporaryPassword: input.temporaryPassword,
          ...(input.contactEmail === undefined
            ? {}
            : { contactEmail: input.contactEmail }),
        },
      );
      if (
        identity.accountStatus !== "active" ||
        identity.mustChangePassword !== true
      ) {
        throw new UlcLinzTrainerUserProvisioningConflictError();
      }

      const membership = await ensureTrainerMembership({
        sql,
        identityId: identity.identityId,
        organizationId,
        trainerId,
      });

      let binding: UlcLinzTrainerIdentityBinding;
      if (membership.subjectId === trainerId) {
        binding = Object.freeze({
          identityId: identity.identityId,
          username: identity.username,
          displayName: identity.displayName,
          trainerId,
        });
      } else if (
        membership.subjectId === unassignedTrainerSubject(identity.identityId)
      ) {
        binding = await trainerIdentityLinks.bindTrainer({
          organizationId,
          actorPrincipalId,
          identityId: identity.identityId,
          trainerId,
        });
      } else {
        throw new UlcLinzTrainerUserProvisioningConflictError();
      }

      if (
        binding.identityId !== identity.identityId ||
        binding.trainerId !== trainerId
      ) {
        blocked();
      }

      await ensureTrainerAccess({
        sql,
        permissions,
        accessAdministration,
        identityId: identity.identityId,
        actorPrincipalId,
      });

      return Object.freeze({
        identityId: identity.identityId,
        username: identity.username,
        displayName: identity.displayName,
        trainerId,
        mustChangePassword: true,
      });
    },
  });
}

async function ensureTrainerMembership({
  sql,
  identityId,
  organizationId,
  trainerId,
}: {
  readonly sql: UlcLinzTrainerUserProvisioningSqlClient;
  readonly identityId: string;
  readonly organizationId: string;
  readonly trainerId: string;
}): Promise<Readonly<{ subjectId: string }>> {
  const subjectId = unassignedTrainerSubject(identityId);
  const rows = await sql.unsafe(
    `WITH target_account AS MATERIALIZED (
       SELECT id
       FROM "user"
       WHERE id = $1
         AND COALESCE(banned, false) = false
     ),
     target_trainer AS MATERIALIZED (
       SELECT id
       FROM appbasis_trainer
       WHERE id = $3
         AND organization_id = $2
         AND is_active = true
     ),
     inserted AS (
       INSERT INTO ulc_linz_membership (
         identity_id,
         organization_id,
         subject_id,
         source_role,
         active
       )
       SELECT account.id, $2, $4, 'trainer', true
       FROM target_account AS account
       WHERE EXISTS (SELECT 1 FROM target_trainer)
       ON CONFLICT (identity_id) DO NOTHING
       RETURNING identity_id
     )
     SELECT
       EXISTS (SELECT 1 FROM target_account) AS identity_exists,
       EXISTS (SELECT 1 FROM target_trainer) AS trainer_exists,
       membership.organization_id,
       membership.subject_id,
       membership.source_role,
       membership.active
     FROM (VALUES (1)) AS singleton(value)
     LEFT JOIN ulc_linz_membership AS membership
       ON membership.identity_id = $1`,
    [identityId, organizationId, trainerId, subjectId],
  );
  if (rows.length !== 1 || rows[0] === undefined) blocked();
  const row = rows[0];
  if (row.identity_exists !== true || row.trainer_exists !== true) {
    throw new UlcLinzTrainerUserProvisioningNotFoundError();
  }
  if (
    row.organization_id !== organizationId ||
    row.source_role !== "trainer" ||
    row.active !== true
  ) {
    throw new UlcLinzTrainerUserProvisioningConflictError();
  }
  const currentSubjectId = requiredRowIdentifier(row.subject_id);
  return Object.freeze({ subjectId: currentSubjectId });
}

async function ensureTrainerAccess({
  sql,
  permissions,
  accessAdministration,
  identityId,
  actorPrincipalId,
}: {
  readonly sql: UlcLinzTrainerUserProvisioningSqlClient;
  readonly permissions: PermissionStore;
  readonly accessAdministration: UlcLinzTrainerUserAccessAdministration;
  readonly identityId: string;
  readonly actorPrincipalId: string;
}): Promise<PrincipalAccessState> {
  const targetPrincipalId = principalId(identityId);
  await sql.unsafe(
    `INSERT INTO appbasis_permission_principal (principal_id)
     VALUES ($1)
     ON CONFLICT (principal_id) DO NOTHING`,
    [targetPrincipalId],
  );

  const current = await permissions.findPrincipal(targetPrincipalId);
  if (current === null) blocked();

  const trainerRole = roleId(roleDataScope.runtimeRoleIds.trainer);
  const grants = trainerCapabilities();
  if (
    !(
      current.roleIds.length === 0 ||
      (current.roleIds.length === 1 && current.roleIds[0] === trainerRole)
    ) ||
    !(
      current.grants.length === 0 ||
      sameStrings(current.grants, grants)
    ) ||
    current.revokes.length !== 0
  ) {
    throw new UlcLinzTrainerUserProvisioningConflictError();
  }

  if (
    current.roleIds.length === 1 &&
    current.roleIds[0] === trainerRole &&
    sameStrings(current.grants, grants)
  ) {
    return Object.freeze({
      roleIds: Object.freeze([...current.roleIds]),
      grants: Object.freeze([...current.grants]),
      revokes: Object.freeze([...current.revokes]),
    });
  }

  return accessAdministration.replacePrincipalAccess(
    targetPrincipalId,
    [trainerRole],
    { grants, revokes: [] },
    {
      actorPrincipalId: principalId(actorPrincipalId),
      reason: "ULC Linz trainer user provisioning",
    },
    {
      expectedRoleIds: current.roleIds,
      expectedGrants: current.grants,
      expectedRevokes: current.revokes,
    },
  );
}

function trainerCapabilities() {
  const mapping = roleDataScope.principalPermissionMapping;
  return Object.freeze(
    [
      capabilityId(
        `${mapping.capabilityNamespace}:kindertraining:${mapping.viewAction}`,
      ),
      capabilityId(
        `${mapping.capabilityNamespace}:kindertraining:${mapping.editAction}`,
      ),
    ].sort((left, right) => String(left).localeCompare(String(right))),
  );
}

function assertCanonicalTrainerProvisioningPolicy(): void {
  const template = roleDataScope.permissionTemplates.kindertrainer;
  const mapping = roleDataScope.principalPermissionMapping;
  if (
    template.sourceRole !== "trainer" ||
    !template.view.includes("kindertraining") ||
    !template.edit.includes("kindertraining") ||
    roleDataScope.runtimeRoleIds.trainer !== "ulc-linz:trainer" ||
    mapping.capabilityNamespace !== "ulc-linz:module" ||
    mapping.viewAction !== "view" ||
    mapping.editAction !== "edit"
  ) {
    throw new Error("ULC Linz trainer provisioning policy drifted.");
  }
}

function unassignedTrainerSubject(identityId: string): string {
  return "ulc-unassigned-trainer:" + requiredIdentifier(identityId);
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length) return false;
  const expected = new Set(right);
  return expected.size === right.length && left.every((value) => expected.has(value));
}

function requiredIdentifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 200 ||
    value.trim() !== value
  ) {
    blocked();
  }
  return value;
}

function requiredRowIdentifier(value: unknown): string {
  return requiredIdentifier(value);
}

function requiredText(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    blocked();
  }
  return value;
}

function blocked(): never {
  throw new UlcLinzTrainerUserProvisioningPersistenceError();
}
