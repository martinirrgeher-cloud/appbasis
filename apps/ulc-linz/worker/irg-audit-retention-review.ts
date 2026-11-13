import { UlcLinzAuthorizationDeniedError } from "./authorization";
import {
  inspectUlcIrgAuditRetention,
  type UlcIrgAuditPreflightInput,
} from "./irg-audit-privacy-preflight";
import type { UlcTrainingSessionSqlClient } from "./training-session-postgres";

/**
 * N16 read-only retention review – NEVER a purge authorization.
 * The SQL owner controls the time cut-off in the already tested preflight.
 * No connection to the active router, retention scheduler or data export.
 *
 * The 12-month DB marker only proposes *candidates*; it is NOT proof of a
 * legal basis or absence of legal holds. Backup/restore snapshots can
 * reintroduce purged PII, which needs independent controller approval.
 */
interface TransactionalClient extends UlcTrainingSessionSqlClient {
  begin?<T>(callback: (tx: UlcTrainingSessionSqlClient) => Promise<T>): Promise<T>;
}

export type UlcIrgRetentionBlocker =
  | "controller-legal-basis-unapproved"
  | "legal-holds-not-independently-cleared"
  | "backup-restore-reconciliation-unverified"
  | "subject-access-and-erasure-procedure-unapproved"
  | "purge-operator-and-access-audit-unapproved"
  | "organization-once-marker-erasure-unapproved"
  | "separate-migration-and-execution-approval-required";

const BLOCKERS: readonly UlcIrgRetentionBlocker[] = Object.freeze([
  "controller-legal-basis-unapproved",
  "legal-holds-not-independently-cleared",
  "backup-restore-reconciliation-unverified",
  "subject-access-and-erasure-procedure-unapproved",
  "purge-operator-and-access-audit-unapproved",
  "organization-once-marker-erasure-unapproved",
  "separate-migration-and-execution-approval-required",
]);

export interface UlcIrgAuditRetentionReview {
  readonly organizationId: string;
  readonly assignmentAuditCandidates: number;
  readonly accessAuditCandidates: number;
  readonly totalCandidates: number;
  readonly retentionClock: "postgres-retained_until-at-or-before-clock_timestamp";
  readonly candidateStatus: "review-only-not-deletable";
  readonly decisionStatus: "blocked-pending-controller-privacy-and-recovery-approval";
  readonly unverifiedBlockers: readonly UlcIrgRetentionBlocker[];
  readonly executePurge: false;
  readonly deletedRows: 0;
  readonly activeRoute: false;
}

export async function reviewUlcIrgAuditRetentionWithoutDeleting(
  sql: TransactionalClient,
  input: UlcIrgAuditPreflightInput,
): Promise<UlcIrgAuditRetentionReview> {
  // This helper reuses exactly the organization-bound, transacted admin
  // preflight. It never queries a row id, actor, reason or other PII.
  const snapshot = await inspectUlcIrgAuditRetention(sql, input);
  const assignments = validatedCount(snapshot.dueForRetentionReview);
  const access = validatedCount(snapshot.auditAccessDueForRetentionReview);
  if (snapshot.purge !== "blocked-until-authorized-retention-gate" ||
      snapshot.export !== "blocked-until-audited-export-gate" ||
      snapshot.organizationId !== input.organizationId ||
      assignments > validatedCount(snapshot.personalAuditEvents) ||
      access > validatedCount(snapshot.auditAccessEvents) ||
      !Number.isSafeInteger(assignments + access)) {
    throw new UlcLinzAuthorizationDeniedError();
  }
  return Object.freeze({
    organizationId: snapshot.organizationId,
    assignmentAuditCandidates: assignments,
    accessAuditCandidates: access,
    totalCandidates: assignments + access,
    retentionClock: "postgres-retained_until-at-or-before-clock_timestamp" as const,
    candidateStatus: "review-only-not-deletable" as const,
    decisionStatus: "blocked-pending-controller-privacy-and-recovery-approval" as const,
    unverifiedBlockers: BLOCKERS,
    executePurge: false as const,
    deletedRows: 0 as const,
    activeRoute: false as const,
  });
}

function validatedCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) ||
      value < 0 || value > 2147483647) {
    throw new UlcLinzAuthorizationDeniedError();
  }
  return value;
}
