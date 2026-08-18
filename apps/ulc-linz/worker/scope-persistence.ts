import type { createPostgresDatabase } from "@appbasis/database";

import type {
  UlcLinzMembershipResolution,
  UlcLinzMembershipResolver,
  UlcLinzSubjectRelation,
  UlcLinzSubjectScopeResolver,
} from "./authorization";

const SOURCE_ROLES = new Set(["admin", "trainer", "athlete", "parent"] as const);
const DELETABLE_SOURCE_ROLES = new Set(["trainer", "athlete", "parent"] as const);
const DELETION_MARKER_RETENTION_DAYS = 35;

type SqlClient = ReturnType<typeof createPostgresDatabase>["client"];
type SqlExecutor = Pick<SqlClient, "unsafe">;

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
      reviewAt: Date;
    }>;

export class UlcLinzScopePersistenceBlockedError extends Error {
  readonly code = "ULC_LINZ_SCOPE_PERSISTENCE_BLOCKED";

  constructor() {
    super("ULC Linz scope persistence is inconsistent.");
    this.name = "UlcLinzScopePersistenceBlockedError";
  }
}

/**
 * App-owned PostgreSQL persistence for the ULC-specific organization membership
 * and self/managed subject relations. This deliberately stays under apps/ulc-linz
 * instead of becoming another AppBasis platform service from a single consumer.
 */
export class PostgresUlcLinzScopePersistence
  implements UlcLinzMembershipResolver, UlcLinzSubjectScopeResolver
{
  constructor(
    private readonly sql: SqlClient,
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
   * Final app-owner cleanup after the identity/permission owners have completed.
   * The transaction retains only a 35-day marker, matching the confirmed maximum
   * backup rotation window needed for retry and restore reconciliation.
   */
  async completeIdentityDeletion(identityId: string): Promise<UlcLinzDeletionMarker> {
    const normalizedIdentityId = requiredIdentifier(identityId);
    const completedAt = validNow(this.now());

    return this.sql.begin(async (transaction) => {
      const existing = await findDeletionMarker(transaction, normalizedIdentityId);
      if (existing !== null) {
        await assertNoLiveScopeRows(transaction, existing);
        return existing;
      }

      const membershipRows = await transaction.unsafe(
        `SELECT identity_id, organization_id, subject_id, source_role, active, ended_at
         FROM ulc_linz_membership
         WHERE identity_id = $1
         FOR UPDATE`,
        [normalizedIdentityId],
      );
      if (membershipRows.length !== 1) blocked();
      const target = lifecycleTarget(membershipRows[0]);
      const sourceRole = requiredDeletableSourceRole(target.sourceRole);

      const markerRows = await transaction.unsafe(
        `INSERT INTO ulc_linz_lifecycle_deletion (
           identity_id,
           organization_id,
           subject_id,
           source_role,
           completed_at,
           purge_after
         )
         VALUES ($1, $2, $3, $4, $5, $5::timestamptz + interval '35 days')
         RETURNING identity_id, organization_id, subject_id, source_role, completed_at, purge_after`,
        [
          normalizedIdentityId,
          target.organizationId,
          target.subjectId,
          sourceRole,
          completedAt.toISOString(),
        ],
      );
      if (markerRows.length !== 1) blocked();

      await transaction.unsafe(
        `DELETE FROM ulc_linz_subject_scope
         WHERE identity_id = $1
            OR (organization_id = $2 AND subject_id = $3)`,
        [normalizedIdentityId, target.organizationId, target.subjectId],
      );
      const deletedMembership = await transaction.unsafe(
        `DELETE FROM ulc_linz_membership
         WHERE identity_id = $1
         RETURNING identity_id`,
        [normalizedIdentityId],
      );
      if (deletedMembership.length !== 1) blocked();

      const marker = deletionMarker(markerRows[0]);
      await assertNoLiveScopeRows(transaction, marker);
      return marker;
    });
  }

  /** Deterministic 12-calendar-month member/contact retention evaluation. */
  async evaluateRetention(): Promise<readonly UlcLinzRetentionState[]> {
    const now = validNow(this.now());
    const rows = await this.sql.unsafe(
      `SELECT identity_id, organization_id, subject_id, source_role, active, ended_at,
              retention_exception_reason, retention_exception_actor, retention_review_at
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
}

function retentionState(
  row: Record<string, unknown>,
  now: Date,
): UlcLinzRetentionState {
  const target = lifecycleTarget(row);
  if (target.active) {
    if (target.endedAt !== null) blocked();
    return Object.freeze({ status: "active", target });
  }
  if (target.endedAt === null) blocked();

  const reason = nullableRowString(row, "retention_exception_reason");
  const actor = nullableRowString(row, "retention_exception_actor");
  const reviewAt = nullableDate(row.retention_review_at);
  const exceptionFields = [reason, actor, reviewAt].filter((value) => value !== null).length;
  if (exceptionFields !== 0 && exceptionFields !== 3) blocked();

  const dueAt = addCalendarMonths(target.endedAt, 12);
  if (now.getTime() <= dueAt.getTime()) {
    return Object.freeze({ status: "active", target });
  }
  if (reason !== null && actor !== null && reviewAt !== null && reviewAt.getTime() > now.getTime()) {
    return Object.freeze({ status: "exception", target, reason, actor, reviewAt });
  }
  return Object.freeze({ status: "due", target });
}

function addCalendarMonths(value: Date, months: number): Date {
  const result = new Date(value.getTime());
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

async function findDeletionMarker(
  sql: SqlExecutor,
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
  sql: SqlExecutor,
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
  return Object.freeze({
    identityId: requiredRowString(row, "identity_id"),
    organizationId: requiredRowString(row, "organization_id"),
    subjectId: requiredRowString(row, "subject_id"),
    sourceRole: requiredDeletableSourceRole(row.source_role),
    completedAt: requiredDate(row.completed_at),
    purgeAfter: requiredDate(row.purge_after),
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

function requiredRowString(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== "string") blocked();
  return requiredIdentifier(value);
}

function nullableRowString(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  if (value === null) return null;
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
  if (value === null) return null;
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
