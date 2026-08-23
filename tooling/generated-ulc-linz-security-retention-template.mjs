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
  const oldCleanup = `const PURGE_SECURITY_EVENT_SQL = \`
DELETE FROM ulc_linz_security_event_log
WHERE retained_until < $1::timestamptz
\`;

export function createPostgresUlcLinzSecurityEventLogger(`;
  const newCleanup = `const PURGE_SECURITY_EVENT_SQL = \`
DELETE FROM ulc_linz_security_event_log
WHERE retained_until < statement_timestamp()
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
 * Deletes only events whose database-enforced twelve-calendar-month boundary is
 * strictly older than the PostgreSQL server's statement timestamp. There is no
 * caller-supplied clock or cutoff, so an HTTP/request/operator value cannot
 * shorten the retention period.
 */
export async function purgeExpiredUlcLinzSecurityEvents(
  client: UlcLinzSecurityEventSqlClient,
): Promise<void> {
  await client.unsafe(PURGE_SECURITY_EVENT_SQL);
}`;

  if (!content.includes(oldCleanup) || !content.includes(oldFunction)) {
    throw new Error("Generated ULC security retention source drifted before server-owned cutoff hardening.");
  }
  return content.replace(oldCleanup, newCleanup).replace(oldFunction, newFunction);
}
