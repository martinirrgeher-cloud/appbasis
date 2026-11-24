/**
 * T07 protected identity/permission owner targeting. This component does NOT
 * perform deletion and cannot invent identity links from athlete names,
 * notes, expired deletion markers or historic backups.
 */
export interface UlcT07IdentitySqlClient {
  unsafe(
    query: string,
    parameters?: (string | number | boolean | null)[],
  ): PromiseLike<readonly Record<string, unknown>[]>;
}

const WINDOW_MS = 35 * 24 * 60 * 60 * 1000;

export const ULC_T07_LINKED_IDENTITY_SQL = `
  SELECT identity_id, source_role, 'live' AS record_source,
         NULL::timestamptz AS completed_at, NULL::timestamptz AS purge_after
  FROM ulc_linz_membership
  WHERE organization_id=$1 AND subject_id=$2 AND source_role='athlete'
  UNION ALL
  SELECT identity_id, source_role, 'deleted' AS record_source,
         completed_at, purge_after
  FROM ulc_linz_lifecycle_deletion
  WHERE organization_id=$1 AND subject_id=$2 AND source_role='athlete'`;

export const ULC_T07_BLOCK_FAVORITE_MARKER_SQL = `
  SELECT completed_at, purge_after
  FROM appbasis_training_block_favorite_deletion
  WHERE organization_id=$1 AND principal_id=$2`;

export interface UlcT07CanonicalIdentityTarget {
  readonly identityId: string;
  readonly wasAlreadyDeleted: boolean;
}

/** Call only AFTER same-org admin and current athlete source authorization. */
export async function requireUniqueUlcT07AthleteIdentity(
  sql: UlcT07IdentitySqlClient,
  organizationId: string,
  subjectId: string,
  athleteSourceCompletedAt: Date,
  now: Date,
): Promise<UlcT07CanonicalIdentityTarget> {
  if (![organizationId, subjectId].every(validIdentifier) ||
      !(athleteSourceCompletedAt instanceof Date) ||
      !Number.isFinite(athleteSourceCompletedAt.getTime()) ||
      !(now instanceof Date) || !Number.isFinite(now.getTime()) ||
      athleteSourceCompletedAt.getTime() > now.getTime() ||
      now.getTime() > athleteSourceCompletedAt.getTime() + WINDOW_MS) {
    throw new Error("T07 identity source authority invalid.");
  }
  const rows = await sql.unsafe(ULC_T07_LINKED_IDENTITY_SQL, [
    organizationId, subjectId,
  ]);
  if (rows.length !== 1 || !rows[0] || !validIdentifier(rows[0].identity_id) ||
      rows[0].source_role !== "athlete") {
    throw new Error("T07 identity owner requires one authoritative athlete-linked account.");
  }
  const row = rows[0];
  if (row.record_source === "live") {
    if (row.completed_at !== null || row.purge_after !== null) {
      throw new Error("T07 live identity source has conflicting deletion metadata.");
    }
  } else if (row.record_source === "deleted") {
    const completed = parseDate(row.completed_at);
    const expires = parseDate(row.purge_after);
    if (completed.getTime() > now.getTime() ||
        expires.getTime() <= now.getTime() ||
        expires.getTime() - completed.getTime() !== WINDOW_MS) {
      throw new Error("T07 linked identity deletion marker expired or invalid.");
    }
  } else {
    throw new Error("T07 linked identity source is invalid.");
  }
  return Object.freeze({
    identityId: row.identity_id,
    wasAlreadyDeleted: row.record_source === "deleted",
  });
}

export async function requireMatchingUlcT07BlockFavoriteMarker(
  sql: UlcT07IdentitySqlClient,
  organizationId: string,
  identityId: string,
  athleteSourceCompletedAt: Date,
  now: Date,
): Promise<void> {
  if (![organizationId, identityId].every(validIdentifier) ||
      !(athleteSourceCompletedAt instanceof Date) ||
      !Number.isFinite(athleteSourceCompletedAt.getTime()) ||
      !(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error("T07 block favorite source invalid.");
  }
  const rows = await sql.unsafe(ULC_T07_BLOCK_FAVORITE_MARKER_SQL, [
    organizationId, identityId,
  ]);
  if (rows.length > 1) throw new Error("T07 multiple favorite owner markers.");
  if (rows.length === 0) return;
  const completed = parseDate(rows[0]?.completed_at);
  const expires = parseDate(rows[0]?.purge_after);
  if (
    completed.getTime() !== athleteSourceCompletedAt.getTime() ||
    expires.getTime() - completed.getTime() !== WINDOW_MS ||
    expires.getTime() <= now.getTime()
  ) throw new Error("T07 block favorite marker conflicts with athlete source.");
}

function parseDate(value: unknown): Date {
  const date = value instanceof Date ? value :
    typeof value === "string" ? new Date(value) : new Date(Number.NaN);
  if (!Number.isFinite(date.getTime())) throw new Error("T07 owner marker timestamp invalid.");
  return date;
}

function validIdentifier(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= 200 &&
    v.trim() === v && !v.includes("\0");
}
