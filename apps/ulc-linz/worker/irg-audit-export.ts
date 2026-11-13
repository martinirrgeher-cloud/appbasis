import { UlcLinzAuthorizationDeniedError } from "./authorization";
import { assertUlcIrgAuditAdministrator } from "./irg-audit-privacy-preflight";
import {
  assertUlcStaffSessionStillValid,
} from "./staff-session-guard";
import type { UlcTrainingSessionSqlClient } from "./training-session-postgres";

/**
 * N16 NOT ROUTED – bounded, explicitly audited personal IRG-assignment audit
 * export. This is NOT the old M5-E member-data export. The privileged host
 * must obtain actorIdentityId + trustedSessionId from Better Auth get-session,
 * NOT from HTTP JSON. No provider use or active UI is wired here.
 *
 * The export is returned only AFTER the matching access-audit INSERT and the
 * final session TTL check commit in the SAME SQL transaction. If any step
 * fails, NO partial personal record is returned. Pagination is bounded to
 * 100 records; the only cursor is a validated positive bigint event ID.
 */
interface TransactionClient extends UlcTrainingSessionSqlClient {
  begin?<T>(callback: (tx: UlcTrainingSessionSqlClient) => Promise<T>): Promise<T>;
}

export interface UlcIrgAuditedExportInput {
  readonly actorIdentityId: string;
  readonly trustedSessionId: string;
  readonly organizationId: string;
  readonly reason: string;
  readonly afterEventId: string | null;
  readonly limit: number;
}
export interface UlcIrgAuditedExportRow {
  readonly eventId: string;
  readonly groupId: string;
  readonly moduleId: "performance_registration";
  readonly actorIdentityId: string;
  readonly eventType: "assign";
  readonly reason: string;
  readonly createdAt: string;
  readonly retainedUntil: string;
}
export interface UlcIrgAuditedExportResult {
  readonly organizationId: string;
  readonly rows: readonly UlcIrgAuditedExportRow[];
  readonly nextCursor: string | null;
  readonly accessAuditId: string;
}

const MAX_PAGE_SIZE = 100;

export async function exportUlcIrgAssignmentAudit(
  sql: TransactionClient,
  input: UlcIrgAuditedExportInput,
): Promise<UlcIrgAuditedExportResult> {
  const actor = id(input.actorIdentityId);
  const session = id(input.trustedSessionId);
  const organization = id(input.organizationId);
  const reason = validReason(input.reason);
  const cursor = validCursor(input.afterEventId);
  const limit = input.limit;
  if (!Number.isSafeInteger(limit) || limit < 1 ||
      limit > MAX_PAGE_SIZE || typeof sql.begin !== "function") deny();

  return sql.begin(async tx => {
    await assertUlcIrgAuditAdministrator(tx, actor, session, organization);

    const source = await tx.unsafe(
      `SELECT event_id::text AS event_id, group_id, module_id,
              actor_identity_id, event_type, reason,
              extract(epoch FROM created_at)::double precision AS created_epoch,
              extract(epoch FROM retained_until)::double precision AS retention_epoch
       FROM ulc_linz_irg_module_assignment_audit
       WHERE organization_id=$1
         AND ($2::bigint IS NULL OR event_id > $2::bigint)
       ORDER BY event_id ASC
       LIMIT $3`,
      [organization, cursor, limit],
    );
    if (source.length > limit) deny();
    const rows: UlcIrgAuditedExportRow[] = [];
    let previous = cursor === null ? 0n : BigInt(cursor);
    for (const row of source) {
      const eventId = eventIdentifier(row.event_id);
      const numeric = BigInt(eventId);
      if (numeric <= previous) deny();
      previous = numeric;
      if (row.module_id !== "performance_registration" ||
          row.event_type !== "assign") deny();
      rows.push(Object.freeze({
        eventId,
        groupId: id(row.group_id),
        moduleId: "performance_registration" as const,
        actorIdentityId: id(row.actor_identity_id),
        eventType: "assign" as const,
        reason: validReason(row.reason),
        createdAt: utcEpoch(row.created_epoch),
        retainedUntil: utcEpoch(row.retention_epoch),
      }));
    }

    // Never release raw rows unless THIS page's access audit committed.
    const access = await tx.unsafe(
      `INSERT INTO ulc_linz_irg_audit_export_access
         (organization_id,actor_identity_id,reason,operation,exported_count)
       VALUES ($1,$2,$3,'export',$4)
       RETURNING access_event_id::text AS access_event_id`,
      [organization, actor, reason, rows.length],
    );
    if (access.length !== 1) deny();
    const accessAuditId = eventIdentifier(access[0]?.access_event_id);
    await assertUlcStaffSessionStillValid(tx, session, actor);
    return Object.freeze({
      organizationId: organization,
      rows: Object.freeze(rows),
      nextCursor: rows.length === limit
        ? rows[rows.length-1]?.eventId ?? null : null,
      accessAuditId,
    });
  });
}

function validCursor(value: unknown): string | null {
  if (value === null) return null;
  return eventIdentifier(value);
}
function eventIdentifier(value: unknown): string {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,18}$/.test(value) ||
      BigInt(value) > 9223372036854775807n) deny();
  return value;
}
function utcEpoch(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value) ||
      value < 0 || value > 8640000000000) deny();
  const timestamp = new Date(value * 1000);
  if (Number.isNaN(timestamp.getTime())) deny();
  return timestamp.toISOString();
}
function id(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 200 ||
      value !== value.trim()) deny();
  return value;
}
function validReason(value: unknown): string {
  const reason = id(value);
  if (reason.length < 12 || reason.length > 300 ||
      [...reason].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) deny();
  return reason;
}
function deny(): never { throw new UlcLinzAuthorizationDeniedError(); }
