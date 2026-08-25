const ULC_APP_ID = "ulc-linz";
const ULC_SECURITY_EVENT_POSTGRES_PATH = "worker/security-events-postgres.ts";

export function extendUlcLinzSecurityRetentionTemplate(input, generated) {
  if (input?.appId !== ULC_APP_ID) return generated;

  const files = generated.files.map((entry) => {
    if (entry.path !== ULC_SECURITY_EVENT_POSTGRES_PATH) return entry;
    return Object.freeze({
      ...entry,
      content: withServerOwnedUlcSecurityRetention(entry.content),
    });
  });

  if (!files.some((entry) => entry.path === ULC_SECURITY_EVENT_POSTGRES_PATH)) {
    throw new Error("ULC Linz security retention requires the canonical security-event PostgreSQL source.");
  }

  return Object.freeze({
    ...generated,
    files: Object.freeze(files),
  });
}

function withServerOwnedUlcSecurityRetention(content) {
  const oldInterface = `export interface BufferedUlcLinzSecurityEventLogger
  extends UlcLinzSecurityEventLogger {
  flush(): Promise<void>;
}

const INSERT_SECURITY_EVENT_SQL = \``;
  const newInterface = `export interface BufferedUlcLinzSecurityEventLogger
  extends UlcLinzSecurityEventLogger {
  flush(): Promise<void>;
}

export interface UlcLinzSecurityEventPurgeResult {
  cutoff: string;
  deletedRows: bigint;
}

const INSERT_SECURITY_EVENT_SQL = \``;
  const oldCleanup = `const PURGE_SECURITY_EVENT_SQL = \`
DELETE FROM ulc_linz_security_event_log
WHERE retained_until < $1::timestamptz
\`;

export function createPostgresUlcLinzSecurityEventLogger(`;
  const newCleanup = `const PURGE_SECURITY_EVENT_SQL = \`
SELECT
  statement_timestamp() AS cutoff,
  public.appbasis_ulc_linz_purge_expired_security_events()::text AS deleted_rows
\`;

export function createPostgresUlcLinzSecurityEventLogger(`;
  const oldFunction = `export async function purgeExpiredUlcLinzSecurityEvents(
  client: UlcLinzSecurityEventSqlClient,
  now: Date,
): Promise<void> {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error("A valid retention evaluation time is required.");
  }
  await client.unsafe(PURGE_SECURITY_EVENT_SQL, [now.toISOString()]);
}`;
  const newFunction = `/**
 * Invokes the database-owned cleanup function and returns the exact database
 * statement clock used by that purge. The cleanup principal cannot supply or
 * override the cutoff; PostgreSQL owns the twelve-calendar-month boundary.
 */
export async function purgeExpiredUlcLinzSecurityEvents(
  client: UlcLinzSecurityEventSqlClient,
): Promise<UlcLinzSecurityEventPurgeResult> {
  const rows = await client.unsafe(PURGE_SECURITY_EVENT_SQL);
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error("ULC Linz security-event purge result is invalid.");
  }
  const row = rows[0];
  if (row === null || typeof row !== "object") {
    throw new Error("ULC Linz security-event purge result is invalid.");
  }
  const cutoff = new Date((row as { cutoff?: unknown }).cutoff as string);
  if (!Number.isFinite(cutoff.getTime())) {
    throw new Error("ULC Linz security-event purge cutoff is invalid.");
  }
  let deletedRows: bigint;
  try {
    deletedRows = BigInt((row as { deleted_rows?: unknown }).deleted_rows as string);
  } catch {
    throw new Error("ULC Linz security-event purge count is invalid.");
  }
  if (deletedRows < 0n) {
    throw new Error("ULC Linz security-event purge count is invalid.");
  }
  return Object.freeze({ cutoff: cutoff.toISOString(), deletedRows });
}`;

  if (
    !content.includes(oldInterface) ||
    !content.includes(oldCleanup) ||
    !content.includes(oldFunction)
  ) {
    throw new Error("Generated ULC security retention source drifted before server-owned cutoff hardening.");
  }
  return content
    .replace(oldInterface, newInterface)
    .replace(oldCleanup, newCleanup)
    .replace(oldFunction, newFunction);
}
