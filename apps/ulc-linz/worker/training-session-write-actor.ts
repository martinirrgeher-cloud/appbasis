import roleDataScope from "./role-data-scope.json";
import type { UlcTrainingModule } from "./training-session-domain";
import type { UlcTrainingSessionSqlClient } from "./training-session-postgres";

/**
 * P03-I: transaction-scoped, authenticated Trainer/Admin write authority.
 * The caller MUST supply the identity resolved from the trusted HTTP session,
 * never an identity or role from the request body. OFF in normal runtimes.
 */
export class UlcTrainingActorWriteBlockedError extends Error {
  readonly code = "ULC_TRAINING_ACTOR_WRITE_BLOCKED";
  constructor() {
    super("Training write actor no longer has current edit authority.");
    this.name = "UlcTrainingActorWriteBlockedError";
  }
}

function validId(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 ||
      value.length > 200 || value !== value.trim()) {
    throw new UlcTrainingActorWriteBlockedError();
  }
  return value;
}

function matchOne(
  rows: readonly Record<string, unknown>[],
  key: string,
  expected: string,
): void {
  if (rows.length !== 1 || rows[0]?.[key] !== expected) {
    throw new UlcTrainingActorWriteBlockedError();
  }
}

/** All reads are in the SAME BEGIN as the actual training attendance write.
 * Locking the principal row is critical: the canonical permission
 * administration takes FOR UPDATE on precisely this parent row BEFORE it
 * replaces roles, direct grants or revokes. FOR SHARE blocks that FOR UPDATE.
 *
 * Direct hand-written SQL that changes child rows without locking that parent,
 * outside providers, and app-wide restore are NOT protected by this function.
 */
export async function assertUlcLiveTrainingWriterActor(
  sql: UlcTrainingSessionSqlClient,
  input: {
    readonly organizationId: string;
    readonly moduleId: UlcTrainingModule;
    readonly groupId: string;
    readonly authenticatedIdentityId: string;
  },
): Promise<void> {
  const organizationId = validId(input.organizationId);
  const groupId = validId(input.groupId);
  const identityId = validId(input.authenticatedIdentityId);
  if (input.moduleId !== "u12" &&
      input.moduleId !== "u14" &&
      input.moduleId !== "kindertraining") {
    throw new UlcTrainingActorWriteBlockedError();
  }
  const capability = validId(
    roleDataScope.principalPermissionMapping.capabilityNamespace +
    ":" + input.moduleId + ":" +
    roleDataScope.principalPermissionMapping.editAction,
  );

  // Lock parent before reading child override/role rows. The existing
  // PostgresPrincipalAccessAdministration and RoleAdministration lock it FOR UPDATE.
  matchOne(await sql.unsafe(
    `SELECT principal_id FROM appbasis_permission_principal
     WHERE principal_id = $1 FOR SHARE`,
    [identityId],
  ), "principal_id", identityId);

  const membership = await sql.unsafe(
    `SELECT subject_id, source_role FROM ulc_linz_membership
     WHERE identity_id = $1 AND organization_id = $2
       AND active = true AND ended_at IS NULL
       AND source_role IN ('trainer', 'admin')
     FOR SHARE`,
    [identityId, organizationId],
  );
  if (membership.length !== 1 || membership[0] === undefined) {
    throw new UlcTrainingActorWriteBlockedError();
  }
  const sourceRole = membership[0].source_role;
  if (sourceRole !== "trainer" && sourceRole !== "admin") {
    throw new UlcTrainingActorWriteBlockedError();
  }
  const expectedRole = sourceRole === "admin"
    ? roleDataScope.runtimeRoleIds.admin
    : roleDataScope.runtimeRoleIds.trainer;

  // Existing access contract requires exactly ONE matching role.
  // FOR SHARE here protects the existing row; principal-parent lock
  // protects the set against canonical role replacement.
  const roles = await sql.unsafe(
    `SELECT role_id FROM appbasis_permission_principal_role
     WHERE principal_id = $1 ORDER BY role_id FOR SHARE`,
    [identityId],
  );
  matchOne(roles, "role_id", expectedRole);
  matchOne(await sql.unsafe(
    `SELECT role_id FROM appbasis_permission_role
     WHERE role_id = $1 AND state = 'active' FOR SHARE`,
    [expectedRole],
  ), "role_id", expectedRole);
  matchOne(await sql.unsafe(
    `SELECT capability_id FROM appbasis_permission_capability
     WHERE capability_id = $1 FOR SHARE`,
    [capability],
  ), "capability_id", capability);

  // Same revoke > grant > role hierarchy as PostgresPermissionStore.can.
  // Parent lock ensures canonical grant/revoke replacement cannot commit
  // between this decision and the protected session write.
  const revokes = await sql.unsafe(
    `SELECT capability_id FROM appbasis_permission_principal_revoke
     WHERE principal_id = $1 AND capability_id = $2 FOR SHARE`,
    [identityId, capability],
  );
  if (revokes.length !== 0) throw new UlcTrainingActorWriteBlockedError();
  const grants = await sql.unsafe(
    `SELECT capability_id FROM appbasis_permission_principal_grant
     WHERE principal_id = $1 AND capability_id = $2 FOR SHARE`,
    [identityId, capability],
  );
  const roleCaps = await sql.unsafe(
    `SELECT capability_id FROM appbasis_permission_role_capability
     WHERE role_id = $1 AND capability_id = $2 FOR SHARE`,
    [expectedRole, capability],
  );
  if (grants.length !== 1 && roleCaps.length !== 1) {
    throw new UlcTrainingActorWriteBlockedError();
  }

  if (sourceRole === "trainer") {
    const trainerId = validId(membership[0].subject_id);
    matchOne(await sql.unsafe(
      `SELECT id FROM appbasis_trainer
       WHERE id = $1 AND organization_id = $2 AND is_active = true
       FOR SHARE`,
      [trainerId, organizationId],
    ), "id", trainerId);
    matchOne(await sql.unsafe(
      `SELECT trainer_id FROM appbasis_trainer_group_membership
       WHERE organization_id = $1 AND group_id = $2 AND trainer_id = $3
       FOR SHARE`,
      [organizationId, groupId, trainerId],
    ), "trainer_id", trainerId);
  }
}
