import type {
  UlcLinzSecurityEvent,
  UlcLinzSecurityEventLogger,
} from "./security-events";

export type UlcLinzSecurityEventSqlParameter = string | number | boolean | null;

export interface UlcLinzSecurityEventSqlClient {
  unsafe(
    query: string,
    parameters?: UlcLinzSecurityEventSqlParameter[],
  ): PromiseLike<unknown>;
}

export interface BufferedUlcLinzSecurityEventLogger
  extends UlcLinzSecurityEventLogger {
  flush(): Promise<void>;
}

const INSERT_SECURITY_EVENT_SQL = `
INSERT INTO ulc_linz_security_event_log (
  schema_version,
  app_id,
  category,
  event_type,
  occurred_at,
  actor_principal_id,
  organization_id,
  action,
  target_type,
  target_id,
  operation,
  http_status,
  error_code,
  reason_code,
  retained_until
)
VALUES (
  $1,
  $2,
  $3,
  $4,
  $5::timestamptz,
  $6,
  $7,
  $8,
  $9,
  $10,
  $11,
  $12,
  $13,
  $14,
  $5::timestamptz + interval '12 months'
)
`;

const PURGE_SECURITY_EVENT_SQL = `
DELETE FROM ulc_linz_security_event_log
WHERE retained_until < $1::timestamptz
`;

/**
 * Request-scoped production sink for the already-normalized ULC security event
 * envelope. It never accepts raw request bodies, cookies, credentials or
 * arbitrary JSON payloads.
 *
 * Writes are buffered so denied application responses keep their original
 * semantics. The Worker flushes the buffer before closing the request-scoped
 * PostgreSQL runtime; a sink failure is reported only through the fixed
 * secrets-free Worker diagnostic path.
 */
export function createPostgresUlcLinzSecurityEventLogger(
  client: UlcLinzSecurityEventSqlClient,
): BufferedUlcLinzSecurityEventLogger {
  let pending: Array<Promise<boolean>> = [];

  return Object.freeze({
    record(event: UlcLinzSecurityEvent): void {
      pending.push(persistEvent(client, event));
    },
    async flush(): Promise<void> {
      const batch = pending;
      pending = [];
      if (batch.length === 0) return;
      const results = await Promise.all(batch);
      if (results.some((result) => result !== true)) {
        throw new Error("ULC Linz security-event persistence failed.");
      }
    },
  });
}

export async function purgeExpiredUlcLinzSecurityEvents(
  client: UlcLinzSecurityEventSqlClient,
  now: Date,
): Promise<void> {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error("A valid retention evaluation time is required.");
  }
  await client.unsafe(PURGE_SECURITY_EVENT_SQL, [now.toISOString()]);
}

async function persistEvent(
  client: UlcLinzSecurityEventSqlClient,
  event: UlcLinzSecurityEvent,
): Promise<boolean> {
  try {
    await client.unsafe(INSERT_SECURITY_EVENT_SQL, eventParameters(event));
    return true;
  } catch {
    return false;
  }
}

function eventParameters(
  event: UlcLinzSecurityEvent,
): UlcLinzSecurityEventSqlParameter[] {
  if (event.eventType === "identity.request.denied") {
    return [
      event.schemaVersion,
      event.appId,
      event.category,
      event.eventType,
      event.occurredAt,
      event.actorPrincipalId,
      event.organizationId,
      event.action,
      event.targetType,
      event.targetId,
      event.operation,
      event.httpStatus,
      event.errorCode,
      null,
    ];
  }

  return [
    event.schemaVersion,
    event.appId,
    event.category,
    event.eventType,
    event.occurredAt,
    event.actorPrincipalId,
    event.organizationId,
    event.action,
    event.targetType,
    event.targetId,
    null,
    null,
    null,
    event.reasonCode,
  ];
}
