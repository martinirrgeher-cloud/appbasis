import { IdentityProvisioningConflictError } from "@appbasis/identity/service";
import type { IdentityPostgresProvisioningOwner } from "@appbasis/identity/postgres-runtime";
import { ensurePostgresPermissionPrincipal } from "@appbasis/permissions/provisioning";
import {
  PostgresPrincipalAccessAdministration,
  PrincipalPermissionAdministrationError,
  RoleAdministrationError,
  capabilityId,
  principalId,
  roleId,
  type PermissionStore,
  type PrincipalAccessState,
} from "@appbasis/permissions";

import roleDataScope from "./role-data-scope.json";

type SqlParameter = string | number | boolean | null;

export interface UlcLinzAthleteUserProvisioningSqlClient {
  unsafe(
    query: string,
    parameters?: SqlParameter[],
  ): PromiseLike<readonly Record<string, unknown>[]>;
}

export type UlcLinzAthleteUserAccessAdministration = Pick<
  PostgresPrincipalAccessAdministration,
  "replacePrincipalAccess"
>;

export interface UlcLinzAthleteUserProvisioningInput {
  readonly organizationId: string;
  readonly actorPrincipalId: string;
  readonly username: string;
  readonly displayName: string;
  readonly temporaryPassword: string;
  readonly contactEmail?: string;
  readonly athleteId: string;
}

export interface UlcLinzAthleteUserProvisioningResult {
  readonly identityId: string;
  readonly username: string;
  readonly displayName: string;
  readonly athleteId: string;
  readonly mustChangePassword: true;
}

export class UlcLinzAthleteUserProvisioningNotFoundError extends Error {
  readonly code = "ULC_LINZ_ATHLETE_USER_NOT_FOUND";

  constructor() {
    super("Athlete user provisioning target was not found.");
    this.name = "UlcLinzAthleteUserProvisioningNotFoundError";
  }
}

export class UlcLinzAthleteUserProvisioningConflictError extends Error {
  readonly code = "ULC_LINZ_ATHLETE_USER_CONFLICT";

  constructor() {
    super("Athlete user provisioning conflicts with existing state.");
    this.name = "UlcLinzAthleteUserProvisioningConflictError";
  }
}

export class UlcLinzAthleteUserProvisioningPersistenceError extends Error {
  readonly code = "ULC_LINZ_ATHLETE_USER_PERSISTENCE_ERROR";

  constructor() {
    super("Athlete user provisioning returned an inconsistent state.");
    this.name = "UlcLinzAthleteUserProvisioningPersistenceError";
  }
}

export function createUlcLinzAthleteUserProvisioningService({
  identityProvisioning,
  sql,
  permissions,
  accessAdministration,
}: {
  readonly identityProvisioning: IdentityPostgresProvisioningOwner;
  readonly sql: UlcLinzAthleteUserProvisioningSqlClient;
  readonly permissions: PermissionStore;
  readonly accessAdministration: UlcLinzAthleteUserAccessAdministration;
}) {
  assertCanonicalAthleteProvisioningPolicy();

  return Object.freeze({
    async createAthleteUser(
      input: UlcLinzAthleteUserProvisioningInput,
    ): Promise<UlcLinzAthleteUserProvisioningResult> {
      const organizationId = requiredIdentifier(input.organizationId);
      const actorPrincipalId = requiredIdentifier(input.actorPrincipalId);
      const athleteId = requiredIdentifier(input.athleteId);

      let identity;
      try {
        identity = await identityProvisioning.createInitialUser(
          {
            username: input.username,
            displayName: input.displayName,
            temporaryPassword: input.temporaryPassword,
            ...(input.contactEmail === undefined
              ? {}
              : { contactEmail: input.contactEmail }),
          },
          {
            provisioningOwner: "ulc-linz:athlete-user",
            actorPrincipalId,
            reason: "ULC Linz athlete user provisioning",
          },
        );
      } catch (error) {
        if (error instanceof IdentityProvisioningConflictError) {
          throw new UlcLinzAthleteUserProvisioningConflictError();
        }
        throw error;
      }

      if (
        identity.accountStatus !== "active" ||
        identity.mustChangePassword !== true
      ) {
        throw new UlcLinzAthleteUserProvisioningConflictError();
      }

      await ensureAthleteMembership({
        sql,
        identityId: identity.identityId,
        organizationId,
        athleteId,
      });

      await ensureAthleteSelfRelation({
        sql,
        identityId: identity.identityId,
        organizationId,
        athleteId,
      });

      await ensureAthleteAccess({
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
        athleteId,
        mustChangePassword: true,
      });
    },
  });
}

async function ensureAthleteMembership({
  sql,
  identityId,
  organizationId,
  athleteId,
}: {
  readonly sql: UlcLinzAthleteUserProvisioningSqlClient;
  readonly identityId: string;
  readonly organizationId: string;
  readonly athleteId: string;
}): Promise<void> {
  let inserted: readonly Record<string, unknown>[];
  try {
    inserted = await sql.unsafe(
      `INSERT INTO ulc_linz_membership (
         identity_id,
         organization_id,
         subject_id,
         source_role,
         active
       )
       SELECT account.id, $2, athlete.id, 'athlete', true
       FROM "user" AS account
       INNER JOIN appbasis_athlete AS athlete
         ON athlete.id = $3
        AND athlete.organization_id = $2
        AND athlete.is_active = true
       WHERE account.id = $1
         AND COALESCE(account.banned, false) = false
       ON CONFLICT (identity_id) DO NOTHING
       RETURNING organization_id, subject_id, source_role, active`,
      [identityId, organizationId, athleteId],
    );
  } catch (error) {
    if (isSubjectUniquenessViolation(error)) {
      throw new UlcLinzAthleteUserProvisioningConflictError();
    }
    throw error;
  }

  if (inserted.length === 1 && inserted[0] !== undefined) {
    assertAthleteMembership(inserted[0], organizationId, athleteId);
    return;
  }
  if (inserted.length !== 0) blocked();

  const rows = await sql.unsafe(
    `SELECT
       EXISTS (
         SELECT 1
         FROM "user"
         WHERE id = $1
           AND COALESCE(banned, false) = false
       ) AS identity_exists,
       EXISTS (
         SELECT 1
         FROM appbasis_athlete
         WHERE id = $3
           AND organization_id = $2
           AND is_active = true
       ) AS athlete_exists,
       membership.organization_id,
       membership.subject_id,
       membership.source_role,
       membership.active
     FROM (VALUES (1)) AS singleton(value)
     LEFT JOIN ulc_linz_membership AS membership
       ON membership.identity_id = $1`,
    [identityId, organizationId, athleteId],
  );
  if (rows.length !== 1 || rows[0] === undefined) blocked();
  const row = rows[0];
  if (row.identity_exists !== true || row.athlete_exists !== true) {
    throw new UlcLinzAthleteUserProvisioningNotFoundError();
  }
  assertAthleteMembership(row, organizationId, athleteId);
}

function assertAthleteMembership(
  row: Readonly<Record<string, unknown>>,
  organizationId: string,
  athleteId: string,
): void {
  if (
    row.organization_id !== organizationId ||
    row.subject_id !== athleteId ||
    row.source_role !== "athlete" ||
    row.active !== true
  ) {
    throw new UlcLinzAthleteUserProvisioningConflictError();
  }
}

async function ensureAthleteSelfRelation({
  sql,
  identityId,
  organizationId,
  athleteId,
}: {
  readonly sql: UlcLinzAthleteUserProvisioningSqlClient;
  readonly identityId: string;
  readonly organizationId: string;
  readonly athleteId: string;
}): Promise<void> {
  await sql.unsafe(
    `INSERT INTO ulc_linz_subject_scope (
       identity_id,
       organization_id,
       subject_id,
       relation_type
     )
     SELECT membership.identity_id,
            membership.organization_id,
            membership.subject_id,
            'self'
     FROM ulc_linz_membership AS membership
     INNER JOIN appbasis_athlete AS athlete
       ON athlete.id = membership.subject_id
      AND athlete.organization_id = membership.organization_id
      AND athlete.is_active = true
     WHERE membership.identity_id = $1
       AND membership.organization_id = $2
       AND membership.subject_id = $3
       AND membership.source_role = 'athlete'
       AND membership.active = true
     ON CONFLICT (identity_id, organization_id, subject_id, relation_type)
     DO NOTHING`,
    [identityId, organizationId, athleteId],
  );

  const rows = await sql.unsafe(
    `SELECT organization_id, subject_id, relation_type
     FROM ulc_linz_subject_scope
     WHERE identity_id = $1
     ORDER BY organization_id ASC, subject_id ASC, relation_type ASC`,
    [identityId],
  );
  if (
    rows.length !== 1 ||
    rows[0]?.organization_id !== organizationId ||
    rows[0]?.subject_id !== athleteId ||
    rows[0]?.relation_type !== "self"
  ) {
    throw new UlcLinzAthleteUserProvisioningConflictError();
  }
}

async function ensureAthleteAccess({
  sql,
  permissions,
  accessAdministration,
  identityId,
  actorPrincipalId,
}: {
  readonly sql: UlcLinzAthleteUserProvisioningSqlClient;
  readonly permissions: PermissionStore;
  readonly accessAdministration: UlcLinzAthleteUserAccessAdministration;
  readonly identityId: string;
  readonly actorPrincipalId: string;
}): Promise<PrincipalAccessState> {
  const targetPrincipalId = principalId(identityId);
  await ensurePostgresPermissionPrincipal(sql, targetPrincipalId);

  const current = await permissions.findPrincipal(targetPrincipalId);
  if (current === null) blocked();

  const athleteRole = roleId(roleDataScope.runtimeRoleIds.athlete);
  const grants = athleteCapabilities();
  if (
    !(
      current.roleIds.length === 0 ||
      (current.roleIds.length === 1 && current.roleIds[0] === athleteRole)
    ) ||
    !(
      current.grants.length === 0 ||
      sameStrings(current.grants, grants)
    ) ||
    current.revokes.length !== 0
  ) {
    throw new UlcLinzAthleteUserProvisioningConflictError();
  }

  if (
    current.roleIds.length === 1 &&
    current.roleIds[0] === athleteRole &&
    sameStrings(current.grants, grants)
  ) {
    return Object.freeze({
      roleIds: Object.freeze([...current.roleIds]),
      grants: Object.freeze([...current.grants]),
      revokes: Object.freeze([...current.revokes]),
    });
  }

  try {
    return await accessAdministration.replacePrincipalAccess(
      targetPrincipalId,
      [athleteRole],
      { grants, revokes: [] },
      {
        actorPrincipalId: principalId(actorPrincipalId),
        reason: "ULC Linz athlete user provisioning",
      },
      {
        expectedRoleIds: current.roleIds,
        expectedGrants: current.grants,
        expectedRevokes: current.revokes,
      },
    );
  } catch (error) {
    if (!isStalePrincipalAccess(error)) throw error;

    const reconciled = await permissions.findPrincipal(targetPrincipalId);
    if (
      reconciled !== null &&
      reconciled.roleIds.length === 1 &&
      reconciled.roleIds[0] === athleteRole &&
      sameStrings(reconciled.grants, grants) &&
      reconciled.revokes.length === 0
    ) {
      return Object.freeze({
        roleIds: Object.freeze([...reconciled.roleIds]),
        grants: Object.freeze([...reconciled.grants]),
        revokes: Object.freeze([...reconciled.revokes]),
      });
    }
    throw new UlcLinzAthleteUserProvisioningConflictError();
  }
}

function athleteCapabilities() {
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

function assertCanonicalAthleteProvisioningPolicy(): void {
  const template = roleDataScope.permissionTemplates.athlete;
  const mapping = roleDataScope.principalPermissionMapping;
  if (
    template.sourceRole !== "athlete" ||
    !template.view.includes("kindertraining") ||
    !template.edit.includes("kindertraining") ||
    roleDataScope.runtimeRoleIds.athlete !== "ulc-linz:athlete" ||
    mapping.capabilityNamespace !== "ulc-linz:module" ||
    mapping.viewAction !== "view" ||
    mapping.editAction !== "edit"
  ) {
    throw new Error("ULC Linz athlete provisioning policy drifted.");
  }
}

function isSubjectUniquenessViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const value = error as Record<string, unknown>;
  return (
    value.code === "23505" &&
    value.constraint_name === "ulc_linz_membership_subject_id_unique"
  );
}

function isStalePrincipalAccess(error: unknown): boolean {
  return (
    (error instanceof RoleAdministrationError &&
      error.code === "STALE_PRINCIPAL_ROLES") ||
    (error instanceof PrincipalPermissionAdministrationError &&
      error.code === "STALE_PRINCIPAL_PERMISSIONS")
  );
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

function blocked(): never {
  throw new UlcLinzAthleteUserProvisioningPersistenceError();
}
