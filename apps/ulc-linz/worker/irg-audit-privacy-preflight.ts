import { capabilityId, PostgresPermissionStore, principalId } from "@appbasis/permissions";

import { UlcLinzAuthorizationDeniedError } from "./authorization";
import {
  assertActiveUlcStaffSession, assertUlcStaffSessionStillValid,
} from "./staff-session-guard";
import type { UlcTrainingSessionSqlClient } from "./training-session-postgres";

/**
 * N16 review-only, unexposed aggregate retention preflight.
 *
 * Does not return actor IDs, reasons, raw audit events or export files.
 * It makes no deletion, no export, no entitlement edits and no provider call.
 * A future personal-audit export needs a separately approved, audited read
 * service; the legacy M5-E dataset allowlist MUST NOT be bypassed.
 *
 * Actor/session IDs must originate from the SERVER-VERIFIED Better Auth
 * session; the future HTTP body may supply only a permitted organization.
 */
interface TransactionClient extends UlcTrainingSessionSqlClient {
  begin?<T>(callback: (tx: UlcTrainingSessionSqlClient) => Promise<T>): Promise<T>;
}

export interface UlcIrgAuditPreflightInput {
  readonly actorIdentityId: string;
  readonly trustedSessionId: string;
  readonly organizationId: string;
}

export interface UlcIrgAuditPreflightResult {
  readonly organizationId: string;
  readonly personalAuditEvents: number;
  readonly dueForRetentionReview: number;
  readonly oldestRetainedUntil: string | null;
  readonly export: "blocked-until-audited-export-gate";
  readonly purge: "blocked-until-authorized-retention-gate";
}

export async function inspectUlcIrgAuditRetention(
  sql: TransactionClient,
  input: UlcIrgAuditPreflightInput,
): Promise<UlcIrgAuditPreflightResult> {
  const actor = id(input.actorIdentityId);
  const session = id(input.trustedSessionId);
  const organization = id(input.organizationId);
  if (typeof sql.begin !== "function") deny();

  return sql.begin(async tx => {
    await assertActiveUlcStaffSession(tx, session, actor);
    const users = await tx.unsafe(
      'SELECT id,banned FROM "user" WHERE id=$1 FOR SHARE', [actor],
    );
    if (users.length !== 1 || users[0]?.banned === true) deny();
    const security = await tx.unsafe(
      `SELECT disabled_at,must_change_password
       FROM appbasis_identity_security_state WHERE identity_id=$1 FOR SHARE`,
      [actor],
    );
    if (security.length !== 1 || security[0]?.disabled_at != null ||
        security[0]?.must_change_password !== false) deny();
    const members = await tx.unsafe(
      `SELECT organization_id,source_role,active
       FROM ulc_linz_membership WHERE identity_id=$1 FOR SHARE`, [actor],
    );
    if (members.length !== 1 || members[0]?.organization_id !== organization ||
        members[0]?.source_role !== "admin" || members[0]?.active !== true) deny();
    // Match the existing N16 admin route's strict one-role principal contract.
    const principals = await tx.unsafe(
      `SELECT principal_id FROM appbasis_permission_principal
       WHERE principal_id=$1 FOR UPDATE`, [actor],
    );
    if (principals.length !== 1) deny();
    const roles = await tx.unsafe(
      `SELECT role_id FROM appbasis_permission_principal_role
       WHERE principal_id=$1 FOR SHARE`, [actor],
    );
    if (roles.length !== 1 || roles[0]?.role_id !== "ulc-linz:admin") deny();
    const active = await tx.unsafe(
      `SELECT role_id FROM appbasis_permission_role
       WHERE role_id='ulc-linz:admin' AND state='active' FOR SHARE`,
    );
    if (active.length !== 1) deny();
    // Pin direct and role-based capability rows before testing permissions.
    await tx.unsafe(
      `SELECT capability_id FROM appbasis_permission_principal_grant
       WHERE principal_id=$1 FOR SHARE`, [actor],
    );
    await tx.unsafe(
      `SELECT capability_id FROM appbasis_permission_principal_revoke
       WHERE principal_id=$1 FOR SHARE`, [actor],
    );
    await tx.unsafe(
      `SELECT capability_id FROM appbasis_permission_role_capability
       WHERE role_id='ulc-linz:admin' FOR SHARE`,
    );
    const permitted = await new PostgresPermissionStore(tx).evaluatePermission({
      principalId: principalId(actor),
      capability: capabilityId("ulc-linz:module:athletes:edit"),
    });
    if (!permitted) deny();

    // Aggregate only. No PII appears in result or logs; tenant predicate
    // prevents cross-organization disclosure of another admin's events.
    const records = await tx.unsafe(
      `SELECT count(*)::int AS total,
         count(*) FILTER (WHERE retained_until <= clock_timestamp())::int AS due,
         extract(epoch FROM min(retained_until))::double precision AS first_due_epoch
       FROM ulc_linz_irg_module_assignment_audit
       WHERE organization_id=$1`, [organization],
    );
    if (records.length !== 1) deny();
    const row = records[0];
    const total = validCount(row?.total);
    const due = validCount(row?.due);
    if (due > total) deny();
    // Using an explicit SQL float8 epoch prevents postgres-js and custom
    // SQL clients from disagreeing on whether timestamptz is Date or string.
    // Never coerce arbitrary user-provided text into a Date.
    const firstDueEpoch = row?.first_due_epoch;
    if (firstDueEpoch !== null &&
        (typeof firstDueEpoch !== "number" ||
         !Number.isFinite(firstDueEpoch) || firstDueEpoch < 0 ||
         firstDueEpoch > 8640000000000)) deny();
    const firstDue = firstDueEpoch === null
      ? null : new Date(firstDueEpoch * 1000);
    if (firstDue !== null && Number.isNaN(firstDue.getTime())) deny();
    await assertUlcStaffSessionStillValid(tx, session, actor);
    return Object.freeze({
      organizationId: organization,
      personalAuditEvents: total,
      dueForRetentionReview: due,
      oldestRetainedUntil: firstDue === null ? null : firstDue.toISOString(),
      export: "blocked-until-audited-export-gate" as const,
      purge: "blocked-until-authorized-retention-gate" as const,
    });
  });
}
function validCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) ||
      value < 0 || value > 2147483647) deny();
  return value;
}
function id(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 200 ||
      value !== value.trim()) deny();
  return value;
}
function deny(): never { throw new UlcLinzAuthorizationDeniedError(); }
