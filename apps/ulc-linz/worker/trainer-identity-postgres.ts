type SqlParameter = string | number | boolean | null;

export interface UlcLinzTrainerIdentitySqlClient {
  unsafe(
    query: string,
    parameters?: SqlParameter[],
  ): PromiseLike<readonly Record<string, unknown>[]>;
}

export interface UlcLinzTrainerIdentityBinding {
  readonly identityId: string;
  readonly username: string;
  readonly displayName: string;
  readonly trainerId: string | null;
}

export class UlcLinzTrainerIdentityNotFoundError extends Error {
  readonly code = "ULC_LINZ_TRAINER_IDENTITY_NOT_FOUND";

  constructor() {
    super("Trainer identity or trainer was not found.");
    this.name = "UlcLinzTrainerIdentityNotFoundError";
  }
}

export class UlcLinzTrainerIdentityConflictError extends Error {
  readonly code = "ULC_LINZ_TRAINER_IDENTITY_CONFLICT";

  constructor() {
    super("Trainer is already linked to another identity.");
    this.name = "UlcLinzTrainerIdentityConflictError";
  }
}

export class UlcLinzTrainerIdentityPersistenceError extends Error {
  readonly code = "ULC_LINZ_TRAINER_IDENTITY_PERSISTENCE_ERROR";

  constructor() {
    super("Trainer identity persistence returned an inconsistent state.");
    this.name = "UlcLinzTrainerIdentityPersistenceError";
  }
}

export class PostgresUlcLinzTrainerIdentityLinks {
  constructor(private readonly sql: UlcLinzTrainerIdentitySqlClient) {}

  async listBindings(
    organizationId: string,
  ): Promise<readonly UlcLinzTrainerIdentityBinding[]> {
    const normalizedOrganizationId = requiredIdentifier(organizationId);
    const rows = await this.sql.unsafe(
      `SELECT membership.identity_id,
              account.username,
              account.name AS display_name,
              trainer.id AS trainer_id
       FROM ulc_linz_membership AS membership
       JOIN "user" AS account
         ON account.id = membership.identity_id
       LEFT JOIN appbasis_trainer AS trainer
         ON trainer.id = membership.subject_id
        AND trainer.organization_id = membership.organization_id
        AND trainer.is_active = true
       WHERE membership.organization_id = $1
         AND membership.source_role = 'trainer'
         AND membership.active = true
         AND COALESCE(account.banned, false) = false
       ORDER BY account.name ASC, account.username ASC, membership.identity_id ASC`,
      [normalizedOrganizationId],
    );

    const seen = new Set<string>();
    return Object.freeze(
      rows.map((row) => {
        const binding = bindingFromRow(row);
        if (seen.has(binding.identityId)) blocked();
        seen.add(binding.identityId);
        return binding;
      }),
    );
  }

  async bindTrainer(input: {
    organizationId: string;
    actorPrincipalId: string;
    identityId: string;
    trainerId: string;
  }): Promise<UlcLinzTrainerIdentityBinding> {
    const organizationId = requiredIdentifier(input.organizationId);
    const actorPrincipalId = requiredIdentifier(input.actorPrincipalId);
    const identityId = requiredIdentifier(input.identityId);
    const trainerId = requiredIdentifier(input.trainerId);

    let rows: readonly Record<string, unknown>[];
    try {
      rows = await this.sql.unsafe(
      `WITH target_identity AS MATERIALIZED (
         SELECT membership.identity_id,
                membership.subject_id AS previous_subject_id
         FROM ulc_linz_membership AS membership
         JOIN "user" AS account
           ON account.id = membership.identity_id
         WHERE membership.identity_id = $1
           AND membership.organization_id = $2
           AND membership.source_role = 'trainer'
           AND membership.active = true
           AND COALESCE(account.banned, false) = false
         FOR UPDATE OF membership
       ),
       target_trainer AS MATERIALIZED (
         SELECT id
         FROM appbasis_trainer
         WHERE id = $3
           AND organization_id = $2
           AND is_active = true
         FOR SHARE
       ),
       conflicting_binding AS MATERIALIZED (
         SELECT membership.identity_id,
                membership.organization_id,
                membership.source_role,
                membership.active,
                account.id IS NULL AS account_missing,
                COALESCE(account.banned, true) AS account_banned
         FROM ulc_linz_membership AS membership
         LEFT JOIN "user" AS account
           ON account.id = membership.identity_id
         WHERE membership.subject_id = $3
           AND membership.identity_id <> $1
         LIMIT 1
         FOR UPDATE OF membership
       ),
       releasable_conflict AS MATERIALIZED (
         SELECT identity_id
         FROM conflicting_binding
         WHERE organization_id = $2
           AND source_role = 'trainer'
           AND (
             active = false
             OR account_missing = true
             OR account_banned = true
           )
       ),
       released_conflict AS (
         UPDATE ulc_linz_membership
         SET subject_id = 'ulc-detached-trainer:' || md5(identity_id),
             updated_at = now()
         WHERE identity_id IN (SELECT identity_id FROM releasable_conflict)
           AND EXISTS (SELECT 1 FROM target_identity)
           AND EXISTS (SELECT 1 FROM target_trainer)
         RETURNING identity_id, organization_id, subject_id AS new_subject_id
       ),
       updated AS (
         UPDATE ulc_linz_membership
         SET subject_id = $3,
             updated_at = now()
         WHERE identity_id = $1
           AND organization_id = $2
           AND source_role = 'trainer'
           AND active = true
           AND EXISTS (SELECT 1 FROM target_identity)
           AND EXISTS (SELECT 1 FROM target_trainer)
           AND NOT EXISTS (
             SELECT 1
             FROM conflicting_binding
             WHERE active = true
               AND account_missing = false
               AND account_banned = false
           )
           AND (SELECT count(*) FROM released_conflict) =
               (SELECT count(*) FROM releasable_conflict)
         RETURNING identity_id, organization_id, subject_id
       ),
       released_audit AS (
         INSERT INTO ulc_linz_trainer_identity_audit (
           event_type,
           actor_principal_id,
           organization_id,
           target_identity_id,
           previous_subject_id,
           new_subject_id
         )
         SELECT
           'trainer.identity.detach-stale',
           $4,
           released.organization_id,
           released.identity_id,
           $3,
           released.new_subject_id
         FROM released_conflict AS released
         RETURNING event_id
       ),
       target_audit AS (
         INSERT INTO ulc_linz_trainer_identity_audit (
           event_type,
           actor_principal_id,
           organization_id,
           target_identity_id,
           previous_subject_id,
           new_subject_id
         )
         SELECT
           'trainer.identity.bind',
           $4,
           updated.organization_id,
           updated.identity_id,
           target_identity.previous_subject_id,
           updated.subject_id
         FROM updated
         JOIN target_identity
           ON target_identity.identity_id = updated.identity_id
         RETURNING event_id
       )
       SELECT
         EXISTS (SELECT 1 FROM target_identity) AS identity_exists,
         EXISTS (SELECT 1 FROM target_trainer) AS trainer_exists,
         EXISTS (
           SELECT 1
           FROM conflicting_binding
           WHERE active = true
             AND account_missing = false
             AND account_banned = false
         ) AS binding_conflict,
         (SELECT count(*)::int FROM released_conflict) AS released_conflict_count,
         (SELECT count(*)::int FROM released_audit) AS released_audit_count,
         (SELECT count(*)::int FROM target_audit) AS target_audit_count,
         (SELECT count(*)::int FROM updated) AS updated_count,
         updated.identity_id,
         account.username,
         account.name AS display_name,
         trainer.id AS trainer_id
       FROM (VALUES (1)) AS singleton(value)
       LEFT JOIN updated
         ON true
       LEFT JOIN "user" AS account
         ON account.id = updated.identity_id
       LEFT JOIN appbasis_trainer AS trainer
         ON trainer.id = updated.subject_id
        AND trainer.organization_id = updated.organization_id`,
      [identityId, organizationId, trainerId, actorPrincipalId],
      );
    } catch (error) {
      if (isSubjectUniquenessViolation(error)) {
        throw new UlcLinzTrainerIdentityConflictError();
      }
      throw error;
    }

    if (rows.length !== 1 || rows[0] === undefined) blocked();
    const row = rows[0];
    if (row.identity_exists !== true || row.trainer_exists !== true) {
      throw new UlcLinzTrainerIdentityNotFoundError();
    }
    if (row.binding_conflict === true) {
      throw new UlcLinzTrainerIdentityConflictError();
    }
    if (
      typeof row.released_conflict_count !== "number" ||
      !Number.isSafeInteger(row.released_conflict_count) ||
      row.released_conflict_count < 0 ||
      row.released_conflict_count > 1
    ) {
      blocked();
    }
    if (
      row.released_audit_count !== row.released_conflict_count ||
      row.target_audit_count !== 1
    ) {
      blocked();
    }
    if (row.updated_count !== 1) blocked();
    const binding = bindingFromRow(row);
    if (
      binding.identityId !== identityId ||
      binding.trainerId !== trainerId
    ) {
      blocked();
    }
    return binding;
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

function bindingFromRow(
  row: Record<string, unknown>,
): UlcLinzTrainerIdentityBinding {
  return Object.freeze({
    identityId: requiredRowString(row, "identity_id"),
    username: requiredRowString(row, "username"),
    displayName: requiredRowString(row, "display_name"),
    trainerId: nullableRowString(row, "trainer_id"),
  });
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

function requiredRowString(
  row: Record<string, unknown>,
  key: string,
): string {
  return requiredIdentifier(row[key]);
}

function nullableRowString(
  row: Record<string, unknown>,
  key: string,
): string | null {
  const value = row[key];
  if (value === null) return null;
  return requiredIdentifier(value);
}

function blocked(): never {
  throw new UlcLinzTrainerIdentityPersistenceError();
}
