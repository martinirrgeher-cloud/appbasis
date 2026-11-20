/**
 * P3-C offline, fail-closed restoration inventory across ALL eight persistent
 * data owners. This is a diagnostic only, not a deployed endpoint, deletion
 * authority, production-ready marker, or permission to promote a restore.
 *
 * Every input must originate from a separately validated, isolated owner probe.
 * This function cannot independently authenticate who created those probes.
 */
export const ULC_P3_PERSISTENT_OWNERS = Object.freeze([
  "identity",
  "permissions",
  "athletes",
  "exercise-catalog",
  "training-blocks",
  "training-documentation",
  "training-plans",
  "ulc-linz-lifecycle",
] as const);

export type UlcP3OwnerId = typeof ULC_P3_PERSISTENT_OWNERS[number];
export type UlcP3Risk =
  | "SOURCE_INVALID"
  | "SOURCE_EXPIRED"
  | "RESTORE_NOT_FROZEN"
  | "MISSING_OWNER"
  | "DUPLICATE_OWNER"
  | "UNKNOWN_OWNER"
  | "FOREIGN_SCOPE"
  | "OWNER_TIMESTAMP_DRIFT"
  | "OWNER_REPLAY_UNPROVEN"
  | "STRUCTURED_RESIDUAL"
  | "UNSTRUCTURED_REVIEW_OPEN"
  | "STALE_WRITER_FENCE_UNPROVEN"
  | "MEDIA_ABSENCE_UNPROVEN"
  | "OWNER_PROOF_STALE";

export interface UlcP3AuthoritativeSource {
  readonly organizationId: string;
  readonly subjectId: string;
  readonly completedAt: Date;
  readonly purgeAfter: Date;
  /** Independently verified newer source, never data from the restored DB. */
  readonly independentSourceVerified: boolean;
  readonly fullRestoreBackupHorizonVerified: boolean;
}

export interface UlcP3QuarantineContext {
  /** This is operator-collected evidence for a quarantined offline database. */
  readonly kind: "isolated-restore-review";
  readonly now: Date;
  readonly writesFrozenAndIsolated: boolean;
  readonly source: UlcP3AuthoritativeSource;
}

export interface UlcP3OwnerInspection {
  readonly owner: UlcP3OwnerId;
  readonly organizationId: string;
  readonly subjectId: string;
  readonly sourceCompletedAt: Date;
  readonly inspectedAt: Date;
  /** Checked by owner's actual persisted storage, not a self-reported intent. */
  readonly subjectDeletionReplayed: boolean;
  readonly structuredResidualRows: number | null;
  /** Free text in *all* revisions/foreign-owner references is still personal until reviewed. */
  readonly historicalUnstructuredData: "reviewed-clear" | "personal-data-present" | "unverified";
  readonly staleWriterFence: "verified" | "unverified";
  /** The catalog must prove provider absence, not merely SQL row removal. */
  readonly privateMedia: "provider-absence-verified" | "no-private-media-verified" | "not-applicable" | "unverified";
}

export interface UlcP3ReviewResult {
  readonly status: "QUARANTINE_BLOCKED" | "OPERATOR_REVIEW_REQUIRED";
  readonly risks: readonly Readonly<{owner: UlcP3OwnerId | "all"; code: UlcP3Risk}>[];
  /** Never a production release authorization, even when risks is empty. */
  readonly permitsPromotion: false;
  readonly permitsDeployment: false;
  readonly permitsDeletion: false;
}

const RETENTION_MS = 35 * 24 * 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const ownerSet = new Set<string>(ULC_P3_PERSISTENT_OWNERS);

function validId(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= 200 &&
    v === v.trim() && !v.includes("\0");
}
function validDate(v: unknown): v is Date {
  return v instanceof Date && Number.isFinite(v.getTime());
}
function validCount(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
}

export function assessUlcP3CrossOwnerRestoreQuarantine(
  context: UlcP3QuarantineContext,
  inspections: readonly UlcP3OwnerInspection[],
): UlcP3ReviewResult {
  const risks: Array<{owner: UlcP3OwnerId | "all"; code: UlcP3Risk}> = [];
  const flag = (owner: UlcP3OwnerId | "all", code: UlcP3Risk) => risks.push({owner,code});
  if (!context || context.kind !== "isolated-restore-review" ||
      !validDate(context.now) || !context.source ||
      !validId(context.source.organizationId) ||
      !validId(context.source.subjectId) ||
      !validDate(context.source.completedAt) ||
      !validDate(context.source.purgeAfter) ||
      context.source.independentSourceVerified !== true ||
      context.source.fullRestoreBackupHorizonVerified !== true ||
      context.source.purgeAfter.getTime() - context.source.completedAt.getTime() !== RETENTION_MS ||
      context.source.completedAt.getTime() > context.now?.getTime()) {
    flag("all","SOURCE_INVALID");
  }
  if (context?.writesFrozenAndIsolated !== true) flag("all","RESTORE_NOT_FROZEN");
  if (validDate(context?.now) && validDate(context?.source?.purgeAfter) &&
      context.now.getTime() >= context.source.purgeAfter.getTime()) {
    flag("all","SOURCE_EXPIRED");
  }
  // Missing/invalid authority stops all owner interpretation. A forged or
  // outdated marker must never yield "operator review" from empty reports.
  if (!Array.isArray(inspections)) {
    flag("all","MISSING_OWNER");
  } else {
    const seen = new Set<string>();
    for (const inspection of inspections) {
      if (!inspection || !ownerSet.has(inspection.owner)) {
        flag("all","UNKNOWN_OWNER");
        continue;
      }
      const owner = inspection.owner;
      if (seen.has(owner)) {
        flag(owner,"DUPLICATE_OWNER");
        continue;
      }
      seen.add(owner);
      if (!validId(inspection.organizationId) || !validId(inspection.subjectId) ||
          inspection.organizationId !== context?.source?.organizationId ||
          inspection.subjectId !== context?.source?.subjectId) {
        flag(owner,"FOREIGN_SCOPE");
      }
      if (!validDate(inspection.sourceCompletedAt) ||
          !validDate(context?.source?.completedAt) ||
          inspection.sourceCompletedAt.getTime() !== context.source.completedAt.getTime()) {
        flag(owner,"OWNER_TIMESTAMP_DRIFT");
      }
      if (inspection.subjectDeletionReplayed !== true) flag(owner,"OWNER_REPLAY_UNPROVEN");
      if (!validCount(inspection.structuredResidualRows) ||
          inspection.structuredResidualRows !== 0) flag(owner,"STRUCTURED_RESIDUAL");
      if (inspection.historicalUnstructuredData !== "reviewed-clear")
        flag(owner,"UNSTRUCTURED_REVIEW_OPEN");
      if (inspection.staleWriterFence !== "verified")
        flag(owner,"STALE_WRITER_FENCE_UNPROVEN");
      if (owner === "exercise-catalog") {
        if (inspection.privateMedia !== "provider-absence-verified" &&
            inspection.privateMedia !== "no-private-media-verified") {
          flag(owner,"MEDIA_ABSENCE_UNPROVEN");
        }
      } else if (inspection.privateMedia !== "not-applicable") {
        flag(owner,"MEDIA_ABSENCE_UNPROVEN");
      }
      if (!validDate(inspection.inspectedAt) ||
          !validDate(context?.source?.completedAt) ||
          !validDate(context?.now) ||
          inspection.inspectedAt.getTime() < context.source.completedAt.getTime() ||
          inspection.inspectedAt.getTime() > context.now.getTime() + MAX_CLOCK_SKEW_MS) {
        flag(owner,"OWNER_PROOF_STALE");
      }
    }
    for (const owner of ULC_P3_PERSISTENT_OWNERS) {
      if (!seen.has(owner)) flag(owner,"MISSING_OWNER");
    }
  }
  // Every outcome is explicitly non-executable; "operator review" means
  // recorded technical evidence needs independent human/legal verification.
  return Object.freeze({
    status: risks.length > 0 ? "QUARANTINE_BLOCKED" : "OPERATOR_REVIEW_REQUIRED",
    risks: Object.freeze(risks.map(x=>Object.freeze(x))),
    permitsPromotion: false,
    permitsDeployment: false,
    permitsDeletion: false,
  });
}
