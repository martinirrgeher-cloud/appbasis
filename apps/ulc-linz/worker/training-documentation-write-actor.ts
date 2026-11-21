import roleDataScope from "./role-data-scope.json";

/**
 * P03: atomic database-side recheck of the trusted HTTP identity.
 * Invoke inside the SAME transaction as the documentation INSERT/revision.
 * No authority is ever accepted from a JSON request body.
 *
 * Principal/role/membership FOR SHARE locks interlock with the canonical
 * admin revoke/role-replacement updates. Direct hand-written privileged SQL
 * and external restore writers are outside this API's protection.
 */
export class UlcTrainingDocumentationActorWriteBlockedError extends Error {
  readonly code = "ULC_TRAINING_DOCUMENTATION_ACTOR_WRITE_BLOCKED";
  constructor() {
    super("Training documentation edit authority is no longer current.");
    this.name = "UlcTrainingDocumentationActorWriteBlockedError";
  }
}

export interface UlcTrainingDocumentationActorSqlClient {
  unsafe(
    query: string,
    parameters?: Array<string | number | boolean | null>,
  ): PromiseLike<readonly Record<string, unknown>[]>;
}

export interface UlcTrainingDocumentationActorScope {
  readonly organizationId: string;
  readonly subjectId: string;
  readonly authenticatedIdentityId: string | undefined;
}

function requireId(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 ||
      value.length > 200 || value !== value.trim() || value.includes("\0")) {
    throw new UlcTrainingDocumentationActorWriteBlockedError();
  }
  return value;
}

function exactlyOne(
  rows: readonly Record<string, unknown>[],
  key: string,
  expected: string,
): void {
  if (rows.length !== 1 || rows[0]?.[key] !== expected) {
    throw new UlcTrainingDocumentationActorWriteBlockedError();
  }
}

export async function assertUlcLiveTrainingDocumentationActor(
  sql: UlcTrainingDocumentationActorSqlClient,
  input: UlcTrainingDocumentationActorScope,
): Promise<void> {
  const organizationId = requireId(input.organizationId);
  const subjectId = requireId(input.subjectId);
  const actorId = requireId(input.authenticatedIdentityId);
  const mapping = roleDataScope.principalPermissionMapping;
  const capability = requireId(
    mapping.capabilityNamespace + ":training_documentation:" +
    mapping.editAction,
  );

  // A principal parent lock blocks the canonical permission update's
  // FOR UPDATE on the same row until this transaction has committed.
  exactlyOne(await sql.unsafe(
    "SELECT principal_id FROM appbasis_permission_principal " +
    "WHERE principal_id = $1 FOR SHARE",
    [actorId],
  ), "principal_id", actorId);

  const memberships = await sql.unsafe(
    "SELECT subject_id, source_role FROM ulc_linz_membership " +
    "WHERE identity_id = $1 AND organization_id = $2 " +
    "AND active = true AND ended_at IS NULL FOR SHARE",
    [actorId, organizationId],
  );
  if (memberships.length !== 1 || !memberships[0]) {
    throw new UlcTrainingDocumentationActorWriteBlockedError();
  }
  const membership = memberships[0];
  const sourceRole = membership.source_role;

  // Parents are denied by the existing HTTP documentation-access service.
  // The SQL-side guard must independently enforce that exact boundary.
  if (sourceRole !== "admin" && sourceRole !== "trainer" &&
      sourceRole !== "functionary" && sourceRole !== "athlete") {
    throw new UlcTrainingDocumentationActorWriteBlockedError();
  }
  const expectedRole = roleDataScope.runtimeRoleIds[sourceRole];

  exactlyOne(await sql.unsafe(
    "SELECT role_id FROM appbasis_permission_principal_role " +
    "WHERE principal_id = $1 ORDER BY role_id FOR SHARE",
    [actorId],
  ), "role_id", expectedRole);
  exactlyOne(await sql.unsafe(
    "SELECT role_id FROM appbasis_permission_role " +
    "WHERE role_id = $1 AND state = 'active' FOR SHARE",
    [expectedRole],
  ), "role_id", expectedRole);
  exactlyOne(await sql.unsafe(
    "SELECT capability_id FROM appbasis_permission_capability " +
    "WHERE capability_id = $1 FOR SHARE",
    [capability],
  ), "capability_id", capability);

  const revokes = await sql.unsafe(
    "SELECT capability_id FROM appbasis_permission_principal_revoke " +
    "WHERE principal_id = $1 AND capability_id = $2 FOR SHARE",
    [actorId, capability],
  );
  if (revokes.length !== 0) {
    throw new UlcTrainingDocumentationActorWriteBlockedError();
  }
  const grants = await sql.unsafe(
    "SELECT capability_id FROM appbasis_permission_principal_grant " +
    "WHERE principal_id = $1 AND capability_id = $2 FOR SHARE",
    [actorId, capability],
  );
  const inherited = await sql.unsafe(
    "SELECT capability_id FROM appbasis_permission_role_capability " +
    "WHERE role_id = $1 AND capability_id = $2 FOR SHARE",
    [expectedRole, capability],
  );
  if (grants.length > 1 || inherited.length > 1 ||
      (grants.length !== 1 && inherited.length !== 1)) {
    throw new UlcTrainingDocumentationActorWriteBlockedError();
  }

  if (sourceRole === "athlete") {
    // One athlete can edit only their current own documentation subject.
    if (membership.subject_id !== subjectId) {
      throw new UlcTrainingDocumentationActorWriteBlockedError();
    }
    exactlyOne(await sql.unsafe(
      "SELECT subject_id FROM ulc_linz_subject_scope " +
      "WHERE identity_id = $1 AND organization_id = $2 " +
      "AND subject_id = $3 AND relation_type = 'self' FOR SHARE",
      [actorId, organizationId, subjectId],
    ), "subject_id", subjectId);
  }
}
