import type {
  UlcLinzMembershipResolution,
  UlcLinzMembershipResolver,
  UlcLinzSubjectRelation,
  UlcLinzSubjectScopeResolver,
} from "./authorization";

const SOURCE_ROLES = new Set(["admin", "trainer", "athlete", "parent"] as const);
const DELETABLE_SOURCE_ROLES = new Set(["trainer", "athlete", "parent"] as const);
const DELETION_MARKER_RETENTION_DAYS = 35;
const MAX_RETENTION_EXCEPTION_REASON_LENGTH = 1000;

type UlcLinzSqlParameter = string | number | boolean | null;

export interface UlcLinzSqlClient {
  unsafe(
    query: string,
    parameters?: UlcLinzSqlParameter[],
  ): PromiseLike<readonly Record<string, unknown>[]>;
}

export type UlcLinzSourceRole = "admin" | "trainer" | "athlete" | "parent";
export type UlcLinzDeletableSourceRole = Exclude<UlcLinzSourceRole, "admin">;

export interface UlcLinzLifecycleTarget {
  readonly identityId: string;
  readonly organizationId: string;
  readonly subjectId: string;
  readonly sourceRole: UlcLinzSourceRole;
  readonly active: boolean;
  readonly endedAt: Date | null;
}

export interface UlcLinzDeletionMarker {
  readonly identityId: string;
  readonly organizationId: string;
  readonly subjectId: string;
  readonly sourceRole: UlcLinzDeletableSourceRole;
  readonly completedAt: Date;
  readonly purgeAfter: Date;
}

export type UlcLinzRetentionState =
  | Readonly<{ status: "active"; target: UlcLinzLifecycleTarget }>
  | Readonly<{ status: "due"; target: UlcLinzLifecycleTarget }>
  | Readonly<{
      status: "exception";
      target: UlcLinzLifecycleTarget;
      reason: string;
      actor: string;
      createdAt: Date;
      reviewAt: Date;
    }>;

export type UlcLinzRetentionException = Extract<
  UlcLinzRetentionState,
  { status: "exception" }
>;

export class UlcLinzScopePersistenceBlockedError extends Error {
  readonly code = "ULC_LINZ_SCOPE_PERSISTENCE_BLOCKED";

  constructor() {
    super("ULC Linz scope persistence is inconsistent.");
    this.name = "UlcLinzScopePersistenceBlockedError";
  }
}

/**
 * App-owned PostgreSQL persistence for the ULC-specific organization membership,
 * subject relations and lifecycle audit. It consumes a narrow SQL port and
 * deliberately does not create another AppBasis platform service.
 */
export class PostgresUlcLinzScopePersistence
  implements UlcLinzMembershipResolver, UlcLinzSubjectScopeResolver
{
  constructor(
    private readonly sql: UlcLinzSqlClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async resolveMembership(input: {
    identityId: string;
    organizationId: string;
  }): Promise<UlcLinzMembershipResolution | null> {
    const identityId = requiredIdentifier(input.identityId);
    const organizationId = requiredIdentifier(input.organizationId);
    const rows = await this.sql.unsafe(
      `SELECT organization_id, source_role, active
       FROM ulc_linz_membership
       WHERE identity_id = $1 AND organization_id = $2`,
      [identityId, organizationId],
    );
    if (rows.length === 0) return null;
    if (rows.length !== 1) blocked();
    const row = rows[0];
    if (row === undefined) blocked();
    return Object.freeze({
      organizationId: requiredRowString(row, "organization_id"),
      sourceRole: requiredSourceRole(row.source_role),
      active: requiredBoolean(row, "active"),
    });
  }

  async hasRelation(input: {
    identityId: string;
    organizationId: string;
    subjectId: string;
    relationType: UlcLinzSubjectRelation;
  }): Promise<boolean> {
    const identityId = requiredIdentifier(input.identityId);
    const organizationId = requiredIdentifier(input.organizationId);
    const subjectId = requiredIdentifier(input.subjectId);
    if (input.relationType !== "self" && input.relationType !== "managed") blocked();
    const rows = await this.sql.unsafe(
      `SELECT 1 AS present
       FROM ulc_linz_subject_scope
       WHERE identity_id = $1
         AND organization_id = $2
         AND subject_id = $3
         AND relation_type = $4
       LIMIT 1`,
      [identityId, organizationId, subjectId, input.relationType],
    );
    return rows.length === 1;
  }

  async findLifecycleTarget(identityId: string): Promise<UlcLinzLifecycleTarget | null> {
    const normalizedIdentityId = requiredIdentifier(identityId);
    const rows = await this.sql.unsafe(
      `SELECT identity_id, organization_id, subject_id, source_role, active, ended_at
       FROM ulc_linz_membership
       WHERE identity_id = $1`,
      [normalizedIdentityId],
    );
    if (rows.length === 0) return null;
    if (rows.length !== 1) blocked();
    return lifecycleTarget(rows[0]);
  }

  async findDeletionMarker(identityId: string): Promise<UlcLinzDeletionMarker | null> {
    return findDeletionMarker(this.sql, requiredIdentifier(identityId));
  }

  /**
   * Persist a narrow retention exception only after the ordinary 12-month member
   * retention is already due. State update and immutable audit metadata are one
   * PostgreSQL statement, so a privileged exception cannot exist without audit.
   */
  async setRetentionException(input: {
    identityId: string;
    organizationId: string;
    actor: string;
    reason: string;
    reviewAt: Date;
  }): Promise<UlcLinzRetentionException> {
    const identityId = requiredIdentifier(input.identityId);
    const organizationId = requiredIdentifier(input.organizationId);
    const actor = requiredIdentifier(input.actor);
    const reason = requiredReason(input.reason);
    const now = validNow(this.now());
    const reviewAt = requiredDate(input.reviewAt);
    if (reviewAt.getTime() <= now.getTime()) blocked();

    const rows = await this.sql.unsafe(
      `WITH updated AS (
         UPDATE ulc_linz_membership
         SET retention_exception_reason = $4,
             retention_exception_actor = $3,
             retention_exception_created_at = $6,
             retention_review_at = $5,
             updated_at = $6
         WHERE identity_id = $1
           AND organization_id = $2
           AND active = false
           AND source_role IN ('trainer', 'athlete', 'parent')
           AND ended_at IS NOT NULL
           AND ended_at + interval '12 months' < $6::timestamptz
         RETURNING identity_id, organization_id, subject_id, source_role, active, ended_at,
                   retention_exception_reason, retention_exception_actor,
                   retention_exception_created_at, retention_review_at
       ),
       audit_event AS (
         INSERT INTO ulc_linz_lifecycle_audit (
           event_type,
           actor_principal_id,
           target_identity_id,
           organization_id,
           reason,
           review_at,
           created_at
         )
         SELECT 'retention.exception.set', $3, identity_id, organization_id, $4, $5, $6
         FROM updated
         RETURNING event_id
       )
       SELECT updated.*,
              (SELECT count(*)::int FROM audit_event) AS audit_count
       FROM updated`,
      [
        identityId,
        organizationId,
        actor,
        reason,
        reviewAt.toISOString(),
        now.toISOString(),
      ],
    );
    if (rows.length !== 1 || rows[0]?.audit_count !== 1) blocked();
    const row = rows[0];
    if (row === undefined) blocked();
    const state = retentionState(row, now);
    if (state.status !== "exception") blocked();
    return state;
  }

  /**
   * Final app-owner cleanup after the identity/permission owners have completed.
   * Delete marker, completion audit, inbound/outbound scope cleanup and membership
   * deletion execute as one PostgreSQL statement. Existing markers make replay safe.
   */
  async completeIdentityDeletion(input: {
    identityId: string;
    actor: string;
    reason: string;
  }): Promise<UlcLinzDeletionMarker> {
    const normalizedIdentityId = requiredIdentifier(input.identityId);
    const actor = requiredIdentifier(input.actor);
    const reason = requiredReason(input.reason);
    const existing = await findDeletionMarker(this.sql, normalizedIdentityId);
    if (existing !== null) {
      await assertNoLiveScopeRows(this.sql, existing);
      return existing;
    }

    const completedAt = validNow(this.now()).toISOString();
    const rows = await this.sql.unsafe(
      `WITH inserted AS (
         INSERT INTO ulc_linz_lifecycle_deletion (
           identity_id,
           organization_id,
           subject_id,
           source_role,
           completed_at,
           purge_after
         )
         SELECT identity_id,
                organization_id,
                subject_id,
                source_role,
                $2::timestamptz,
                $2::timestamptz + interval '35 days'
         FROM ulc_linz_membership
         WHERE identity_id = $1
           AND source_role IN ('trainer', 'athlete', 'parent')
         ON CONFLICT (identity_id) DO NOTHING
         RETURNING identity_id, organization_id, subject_id, source_role, completed_at, purge_after
       ),
       audit_event AS (
         INSERT INTO ulc_linz_lifecycle_audit (
           event_type,
           actor_principal_id,
           target_identity_id,
           organization_id,
           reason,
           review_at,
           created_at
         )
         SELECT 'identity.delete.completed', $3, identity_id, organization_id, $4, NULL, $2
         FROM inserted
         RETURNING event_id
       ),
       deleted_scopes AS (
         DELETE FROM ulc_linz_subject_scope AS scope
         USING inserted AS marker
         WHERE scope.identity_id = marker.identity_id
            OR (
              scope.organization_id = marker.organization_id
              AND scope.subject_id = marker.subject_id
            )
         RETURNING scope.identity_id
       ),
       deleted_membership AS (
         DELETE FROM ulc_linz_membership AS membership
         USING inserted AS marker
         WHERE membership.identity_id = marker.identity_id
         RETURNING membership.identity_id
       )
       SELECT marker.identity_id,
              marker.organization_id,
              marker.subject_id,
              marker.source_role,
              marker.completed_at,
              marker.purge_after,
              (SELECT count(*)::int FROM audit_event) AS audit_count,
              (SELECT count(*)::int FROM deleted_membership) AS deleted_membership_count
       FROM inserted AS marker`,
      [normalizedIdentityId, completedAt, actor, reason],
    );

    if (rows.length === 0) {
      const raced = await findDeletionMarker(this.sql, normalizedIdentityId);
      if (raced === null) blocked();
      await assertNoLiveScopeRows(this.sql, raced);
      return raced;
    }
    if (
      rows.length !== 1 ||
      rows[0]?.audit_count !== 1 ||
      rows[0]?.deleted_membership_count !== 1
    ) {
      blocked();
    }

    const marker = deletionMarker(rows[0]);
    await assertNoLiveScopeRows(this.sql, marker);
    return marker;
  }

  /** Deterministic 12-calendar-month member/contact retention evaluation. */
  async evaluateRetention(): Promise<readonly UlcLinzRetentionState[]> {
    const now = validNow(this.now());
    const rows = await this.sql.unsafe(
      `SELECT identity_id, organization_id, subject_id, source_role, active, ended_at,
              retention_exception_reason, retention_exception_actor,
              retention_exception_created_at, retention_review_at
       FROM ulc_linz_membership
       ORDER BY identity_id ASC`,
    );
    return Object.freeze(rows.map((row) => retentionState(row, now)));
  }

  async purgeExpiredDeletionMarkers(): Promise<number> {
    const now = validNow(this.now()).toISOString();
    const rows = await this.sql.unsafe(
      `DELETE FROM ulc_linz_lifecycle_deletion
       WHERE purge_after < $1
       RETURNING identity_id`,
      [now],
    );
    return rows.length;
  }

  async purgeExpiredLifecycleAuditEvents(): Promise<number> {
    const now = validNow(this.now()).toISOString();
    const rows = await this.sql.unsafe(
      `DELETE FROM ulc_linz_lifecycle_audit
       WHERE created_at < $1::timestamptz - interval '12 months'
       RETURNING event_id`,
      [now],
    );
    return rows.length;
  }
}

function retentionState(
  row: Record<string, unknown>,
  now: Date,
): UlcLinzRetentionState {
  const target = lifecycleTarget(row);
  const reason = nullableRowString(row, "retention_exception_reason");
  const actor = nullableRowString(row, "retention_exception_actor");
  const createdAt = nullableDate(row.retention_exception_created_at);
  const reviewAt = nullableDate(row.retention_review_at);
  const exceptionFields = [reason, actor, createdAt, reviewAt].filter(
    (value) => value !== null,
  ).length;
  if (exceptionFields !== 0 && exceptionFields !== 4) blocked();

  if (target.active) {
    if (target.endedAt !== null || exceptionFields !== 0) blocked();
    return Object.freeze({ status: "active", target });
  }
  if (target.endedAt === null || target.sourceRole === "admin") blocked();

  const dueAt = addCalendarMonthsClamped(target.endedAt, 12);
  if (now.getTime() <= dueAt.getTime()) {
    if (exceptionFields !== 0) blocked();
    return Object.freeze({ status: "active", target });
  }
  if (
    reason !== null &&
    actor !== null &&
    createdAt !== null &&
    reviewAt !== null &&
    reviewAt.getTime() > createdAt.getTime() &&
    reviewAt.getTime() > now.getTime()
  ) {
    return Object.freeze({ status: "exception", target, reason, actor, createdAt, reviewAt });
  }
  return Object.freeze({ status: "due", target });
}

function addCalendarMonthsClamped(value: Date, months: number): Date {
  const absoluteMonth = value.getUTCMonth() + months;
  const year = value.getUTCFullYear() + Math.floor(absoluteMonth / 12);
  const month = ((absoluteMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(value.getUTCDate(), lastDay);
  return new Date(
    Date.UTC(
      year,
      month,
      day,
      value.getUTCHours(),
      value.getUTCMinutes(),
      value.getUTCSeconds(),
      value.getUTCMilliseconds(),
    ),
  );
}

async function findDeletionMarker(
  sql: UlcLinzSqlClient,
  identityId: string,
): Promise<UlcLinzDeletionMarker | null> {
  const rows = await sql.unsafe(
    `SELECT identity_id, organization_id, subject_id, source_role, completed_at, purge_after
     FROM ulc_linz_lifecycle_deletion
     WHERE identity_id = $1`,
    [identityId],
  );
  if (rows.length === 0) return null;
  if (rows.length !== 1) blocked();
  return deletionMarker(rows[0]);
}

async function assertNoLiveScopeRows(
  sql: UlcLinzSqlClient,
  marker: UlcLinzDeletionMarker,
): Promise<void> {
  const rows = await sql.unsafe(
    `SELECT
       (SELECT count(*)::int FROM ulc_linz_membership WHERE identity_id = $1) AS membership_count,
       (SELECT count(*)::int FROM ulc_linz_subject_scope
          WHERE identity_id = $1 OR (organization_id = $2 AND subject_id = $3)) AS scope_count`,
    [marker.identityId, marker.organizationId, marker.subjectId],
  );
  const row = rows[0];
  if (row === undefined || row.membership_count !== 0 || row.scope_count !== 0) blocked();
}

function lifecycleTarget(row: Record<string, unknown> | undefined): UlcLinzLifecycleTarget {
  if (row === undefined) blocked();
  return Object.freeze({
    identityId: requiredRowString(row, "identity_id"),
    organizationId: requiredRowString(row, "organization_id"),
    subjectId: requiredRowString(row, "subject_id"),
    sourceRole: requiredSourceRole(row.source_role),
    active: requiredBoolean(row, "active"),
    endedAt: nullableDate(row.ended_at),
  });
}

function deletionMarker(row: Record<string, unknown> | undefined): UlcLinzDeletionMarker {
  if (row === undefined) blocked();
  const completedAt = requiredDate(row.completed_at);
  const purgeAfter = requiredDate(row.purge_after);
  if (purgeAfter.getTime() <= completedAt.getTime()) blocked();
  return Object.freeze({
    identityId: requiredRowString(row, "identity_id"),
    organizationId: requiredRowString(row, "organization_id"),
    subjectId: requiredRowString(row, "subject_id"),
    sourceRole: requiredDeletableSourceRole(row.source_role),
    completedAt,
    purgeAfter,
  });
}

function requiredSourceRole(value: unknown): UlcLinzSourceRole {
  if (typeof value !== "string" || !SOURCE_ROLES.has(value as UlcLinzSourceRole)) blocked();
  return value as UlcLinzSourceRole;
}

function requiredDeletableSourceRole(value: unknown): UlcLinzDeletableSourceRole {
  if (
    typeof value !== "string" ||
    !DELETABLE_SOURCE_ROLES.has(value as UlcLinzDeletableSourceRole)
  ) {
    blocked();
  }
  return value as UlcLinzDeletableSourceRole;
}

function requiredIdentifier(value: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 200 ||
    value !== value.trim()
  ) {
    blocked();
  }
  return value;
}

function requiredReason(value: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_RETENTION_EXCEPTION_REASON_LENGTH ||
    value !== value.trim()
  ) {
    blocked();
  }
  return value;
}

function requiredRowString(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== "string") blocked();
  return requiredIdentifier(value);
}

function nullableRowString(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) blocked();
  return value;
}

function requiredBoolean(row: Record<string, unknown>, key: string): boolean {
  const value = row[key];
  if (typeof value !== "boolean") blocked();
  return value;
}

function requiredDate(value: unknown): Date {
  const result = nullableDate(value);
  if (result === null) blocked();
  return result;
}

function nullableDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(String(value));
  if (Number.isNaN(date.getTime())) blocked();
  return date;
}

function validNow(value: Date): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) blocked();
  return new Date(value.getTime());
}

function blocked(): never {
  throw new UlcLinzScopePersistenceBlockedError();
}

export const ULC_LINZ_DELETION_MARKER_RETENTION_DAYS = DELETION_MARKER_RETENTION_DAYS;
