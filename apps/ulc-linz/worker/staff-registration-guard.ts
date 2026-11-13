import {
  capabilityId,
  PostgresPermissionStore,
  principalId,
} from "@appbasis/permissions";

import { UlcLinzAuthorizationDeniedError } from "./authorization";
import roleDataScope from "./role-data-scope.json";
import type { UlcTrainingSessionSqlClient } from "./training-session-postgres";

/**
 * N01.10 – server-only authorization prerequisite for a future staff proxy
 * registration. Run this with the SAME SQL transaction used for the write.
 *
 * This helper deliberately does not expose an HTTP route or modify the
 * existing athlete-to-athlete proxy flow. The caller must provide the trusted
 * identity from the authenticated server session, never from request JSON.
 */
export interface UlcStaffRegistrationGuardInput {
  readonly actorIdentityId: string;
  readonly organizationId: string;
  readonly groupId: string;
  readonly targetAthleteId: string;
  readonly sessionDate: string;
}

export type UlcStaffRegistrationGuardScope =
  | Readonly<{
      sourceRole: "admin";
      actorIdentityId: string;
      organizationId: string;
      groupId: string;
      targetAthleteId: string;
      sessionDate: string;
      moduleId: "kindertraining";
    }>
  | Readonly<{
      sourceRole: "trainer";
      actorIdentityId: string;
      organizationId: string;
      groupId: string;
      targetAthleteId: string;
      sessionDate: string;
      moduleId: "kindertraining";
      trainerId: string;
    }>;

export async function assertUlcStaffRegistrationGuard(
  transaction: UlcTrainingSessionSqlClient,
  input: UlcStaffRegistrationGuardInput,
): Promise<UlcStaffRegistrationGuardScope> {
  const identityId = requiredIdentifier(input.actorIdentityId);
  const organizationId = requiredIdentifier(input.organizationId);
  const groupId = requiredIdentifier(input.groupId);
  const targetAthleteId = requiredIdentifier(input.targetAthleteId);
  const sessionDate = requiredDate(input.sessionDate);

  // Deterministic lock order matters: identity -> ULC membership -> principal
  // -> canonical role -> group -> trainer/link -> target athlete/membership.
  // Guard and all subsequent writes must share this transaction's lifetime.
  const users = await transaction.unsafe(
    'SELECT id, banned FROM "user" WHERE id = $1 FOR SHARE',
    [identityId],
  );
  if (users.length !== 1 || users[0]?.banned === true) deny();

  const security = await transaction.unsafe(
    `SELECT identity_id, disabled_at, must_change_password
     FROM appbasis_identity_security_state
     WHERE identity_id = $1 FOR SHARE`,
    [identityId],
  );
  if (security.length !== 1 || security[0]?.disabled_at != null ||
      security[0]?.must_change_password !== false) deny();

  const memberships = await transaction.unsafe(
    `SELECT organization_id, subject_id, source_role, active
     FROM ulc_linz_membership
     WHERE identity_id = $1 FOR SHARE`,
    [identityId],
  );
  const membership = memberships[0];
  if (
    memberships.length !== 1 ||
    membership?.organization_id !== organizationId ||
    membership.active !== true ||
    (membership.source_role !== "admin" && membership.source_role !== "trainer")
  ) {
    deny();
  }
  const sourceRole = membership.source_role;
  const expectedRoleId = sourceRole === "admin"
    ? roleDataScope.runtimeRoleIds.admin
    : roleDataScope.runtimeRoleIds.trainer;

  const principal = await transaction.unsafe(
    `SELECT principal_id FROM appbasis_permission_principal
     WHERE principal_id = $1 FOR SHARE`,
    [identityId],
  );
  if (principal.length !== 1) deny();

  const principalRoles = await transaction.unsafe(
    `SELECT role_id FROM appbasis_permission_principal_role
     WHERE principal_id = $1 ORDER BY role_id FOR SHARE`,
    [identityId],
  );
  if (principalRoles.length !== 1 ||
      principalRoles[0]?.role_id !== expectedRoleId) {
    deny();
  }

  // Global role changes take FOR UPDATE on this canonical row. Reading the
  // capability only AFTER this lock prevents a role-change TOCTOU window.
  const roles = await transaction.unsafe(
    `SELECT role_id, state FROM appbasis_permission_role
     WHERE role_id = $1 FOR SHARE`,
    [expectedRoleId],
  );
  if (roles.length !== 1 || roles[0]?.state !== "active") deny();

  // The group row lock also pins attendance_mode until the staff write commits.
  // A trainer-roll-call group is never a self-registration target, even for admin.
  const groups = await transaction.unsafe(
    `SELECT id FROM appbasis_training_group
     WHERE organization_id = $1
       AND id = $2
       AND is_active = true
       AND attendance_mode = 'self_registration'
     FOR SHARE`,
    [organizationId, groupId],
  );
  if (groups.length !== 1) deny();

  // Canonical youth module mapping: the group row alone does not distinguish
  // IRG from Kindertraining. Hold the mapping under FOR SHARE until commit.
  // Unmapped IRG or differently mapped youth groups must fail closed.
  const mappings = await transaction.unsafe(
    `SELECT module_id FROM ulc_linz_training_module_group
     WHERE organization_id = $1 AND group_id = $2 FOR SHARE`,
    [organizationId, groupId],
  );
  if (mappings.length !== 1 || mappings[0]?.module_id !== "kindertraining") deny();
  const moduleId = "kindertraining" as const;
  const permission = await new PostgresPermissionStore(transaction).evaluatePermission({
    principalId: principalId(identityId),
    capability: capabilityId(`ulc-linz:module:${moduleId}:edit`),
  });
  if (!permission) deny();

  let trainerId: string | null = null;
  if (sourceRole === "trainer") {
    trainerId = requiredIdentifier(membership.subject_id);
    const trainers = await transaction.unsafe(
      `SELECT id FROM appbasis_trainer
       WHERE organization_id = $1 AND id = $2 AND is_active = true FOR SHARE`,
      [organizationId, trainerId],
    );
    if (trainers.length !== 1) deny();

    const assigned = await transaction.unsafe(
      `SELECT group_id FROM appbasis_trainer_group_membership
       WHERE organization_id = $1 AND trainer_id = $2 AND group_id = $3 FOR SHARE`,
      [organizationId, trainerId, groupId],
    );
    if (assigned.length !== 1) deny();
  }

  const athletes = await transaction.unsafe(
    `SELECT id FROM appbasis_athlete
     WHERE organization_id = $1 AND id = $2 AND is_active = true FOR SHARE`,
    [organizationId, targetAthleteId],
  );
  if (athletes.length !== 1) deny();

  const eligible = await transaction.unsafe(
    `SELECT group_id
     FROM appbasis_athlete_group_membership
     WHERE organization_id = $1
       AND athlete_id = $2
       AND group_id = $3
       AND started_on <= $4::date
       AND (ended_on IS NULL OR ended_on >= $4::date)
     ORDER BY started_on
     FOR SHARE`,
    [organizationId, targetAthleteId, groupId, sessionDate],
  );
  // Duplicated overlapping active membership periods are ambiguous: fail
  // closed rather than choosing a row and silently widening permission.
  if (eligible.length !== 1) deny();

  if (sourceRole === "admin") {
    return Object.freeze({
      sourceRole, actorIdentityId: identityId, organizationId,
      groupId, targetAthleteId, moduleId, sessionDate,
    });
  }

  return Object.freeze({
    sourceRole, actorIdentityId: identityId, organizationId,
    groupId, targetAthleteId, moduleId, sessionDate,
    trainerId: requiredIdentifier(trainerId),
  });
}

function requiredIdentifier(value: unknown): string {
  if (
    typeof value !== "string" || value.length === 0 || value.length > 200 ||
    value !== value.trim()
  ) {
    deny();
  }
  return value;
}

function requiredDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    deny();
  }
  const date = new Date(value + "T00:00:00.000Z");
  if (!Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value) {
    deny();
  }
  return value;
}

function deny(): never {
  throw new UlcLinzAuthorizationDeniedError();
}
