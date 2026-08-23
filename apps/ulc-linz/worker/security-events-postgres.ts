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
  schema_version, app_id, category, event_type, occurred_at, actor_principal_id,
  organization_id, action, target_type, target_id, operation, http_status,
  error_code, reason_code, retained_until
)
VALUES (
  $1, $2, $3, $4, $5::timestamptz, $6, $7, $8, $9, $10, $11, $12, $13, $14,
  $5::timestamptz + interval '12 months'
)
`;

const PURGE_SECURITY_EVENT_SQL = `
SELECT public.appbasis_ulc_linz_purge_expired_security_events() AS deleted_rows
`;

export function createPostgresUlcLinzSecurityEventLogger(
  client: UlcLinzSecurityEventSqlClient,
): BufferedUlcLinzSecurityEventLogger {
  let pending: UlcLinzSecurityEvent[] = [];
  return Object.freeze({
    record(event: UlcLinzSecurityEvent): void {
      pending.push(event);
    },
    async flush(): Promise<void> {
      const batch = pending;
      pending = [];
      if (batch.length === 0) return;
      const results = await Promise.all(batch.map((event) => persistEvent(client, event)));
      if (results.some((result) => result !== true)) {
        throw new Error("ULC Linz security-event persistence failed.");
      }
    },
  });
}

/**
 * Invokes the database-owned cleanup function. The cleanup principal needs no
 * table DELETE privilege and cannot supply a clock or cutoff; PostgreSQL owns
 * the exact twelve-calendar-month boundary.
 */
export async function purgeExpiredUlcLinzSecurityEvents(
  client: UlcLinzSecurityEventSqlClient,
): Promise<void> {
  await client.unsafe(PURGE_SECURITY_EVENT_SQL);
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

function eventParameters(event: UlcLinzSecurityEvent): UlcLinzSecurityEventSqlParameter[] {
  if (event.eventType === "identity.request.denied") {
    return [event.schemaVersion, event.appId, event.category, event.eventType, event.occurredAt,
      event.actorPrincipalId, event.organizationId, event.action, event.targetType, event.targetId,
      event.operation, event.httpStatus, event.errorCode, null];
  }
  return [event.schemaVersion, event.appId, event.category, event.eventType, event.occurredAt,
    event.actorPrincipalId, event.organizationId, event.action, event.targetType, event.targetId,
    null, null, null, event.reasonCode];
}
