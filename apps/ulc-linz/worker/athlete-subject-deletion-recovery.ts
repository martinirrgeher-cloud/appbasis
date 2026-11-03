import { normalizeTrainingPlanIdentifier } from "@appbasis/training-plans";

import type {
  UlcLinzAthleteSubjectDeletionPreflight,
} from "./lifecycle-service";

/**
 * Read-only decision support; NOT an authorization to erase, store beyond
 * retention, restore, retry or run a background job. No subject identifier
 * or free-text source content is emitted in the result.
 */
export const ULC_ATHLETE_DELETION_MARKER_DAYS = 35;
export const ULC_ATHLETE_DELETION_URGENT_REVIEW_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;
const MARKER_MS = ULC_ATHLETE_DELETION_MARKER_DAYS * DAY_MS;
const URGENT_MS = ULC_ATHLETE_DELETION_URGENT_REVIEW_DAYS * DAY_MS;

export type UlcAthleteDeletionRecoveryState =
  | "source-unverifiable"
  | "source-expired"
  | "owner-conflict"
  | "pending"
  | "urgent-manual-review"
  | "owner-markers-consistent";

export interface UlcAthleteDeletionRecoveryAssessment {
  readonly state: UlcAthleteDeletionRecoveryState;
  readonly sourceAuthorityExpiresAt: Date | null;
  readonly remainingAuthorityDays: number | null;
  /**
   * This flag is intentionally always FALSE. A later recovery path needs
   * separate approved durable authority, backup/restore and operator policy.
   */
  readonly authorizesPostExpiryRetry: false;
  readonly automaticActionAllowed: false;
}

/**
 * Consumes an already server-authorized, read-only ULC preflight snapshot.
 * Snapshots can go stale: even "pending" must be reauthorized by the
 * canonical lifecycle caller before an explicit owner write.
 */
export function assessUlcAthleteDeletionRecovery(
  inspection: UlcLinzAthleteSubjectDeletionPreflight,
  now: Date,
): UlcAthleteDeletionRecoveryAssessment {
  validDate(now, "Review clock");
  if (inspection === null || typeof inspection !== "object") {
    throw new Error("Athlete deletion recovery preflight is invalid.");
  }
  normalizeTrainingPlanIdentifier(inspection.organizationId, "Organization id");
  normalizeTrainingPlanIdentifier(inspection.subjectId, "Subject id");

  const sourceUnknown = inspection.status === "source-unverifiable";
  if (sourceUnknown) {
    if (
      inspection.completedAt !== null ||
      inspection.planMarkerPresent !== null ||
      inspection.usageMarkerPresent !== null ||
      inspection.remainingPlans !== null ||
      inspection.remainingAttributedUsageEvents !== null
    ) {
      throw new Error("Unverifiable athlete deletion source carries contradictory evidence.");
    }
    return assessment("source-unverifiable", null, null);
  }
  const completedAt = validDate(inspection.completedAt, "Source decision");
  if (
    completedAt.getTime() > now.getTime() ||
    !validCount(inspection.remainingPlans) ||
    !validCount(inspection.remainingAttributedUsageEvents) ||
    typeof inspection.planMarkerPresent !== "boolean" ||
    typeof inspection.usageMarkerPresent !== "boolean"
  ) {
    throw new Error("Athlete deletion recovery owner evidence is invalid.");
  }
  const expiresAt = new Date(completedAt.getTime() + MARKER_MS);
  if (!Number.isFinite(expiresAt.getTime())) {
    throw new Error("Athlete deletion recovery expiry is invalid.");
  }
  const remainingMs = expiresAt.getTime() - now.getTime();
  if (remainingMs < 0) {
    // Even a formerly verified snapshot cannot grant post-expiry authority.
    return assessment("source-expired", expiresAt, 0);
  }
  const remainingDays = Math.ceil(remainingMs / DAY_MS);

  switch (inspection.status) {
    case "owner-marker-conflict":
      if (!inspection.planMarkerPresent && !inspection.usageMarkerPresent) {
        throw new Error("Owner conflict lacks a conflicting marker.");
      }
      return assessment("owner-conflict", expiresAt, remainingDays);
    case "owner-markers-match":
      if (
        !inspection.planMarkerPresent ||
        !inspection.usageMarkerPresent ||
        inspection.remainingPlans !== 0 ||
        inspection.remainingAttributedUsageEvents !== 0
      ) {
        throw new Error("Owner marker agreement is contradicted by residual data.");
      }
      return assessment("owner-markers-consistent", expiresAt, remainingDays);
    case "follow-up-pending":
      if (
        inspection.planMarkerPresent &&
        inspection.usageMarkerPresent &&
        inspection.remainingPlans === 0 &&
        inspection.remainingAttributedUsageEvents === 0
      ) {
        throw new Error("Pending follow-up is contradicted by complete owner markers.");
      }
      return assessment(
        remainingMs <= URGENT_MS ? "urgent-manual-review" : "pending",
        expiresAt,
        remainingDays,
      );
    default:
      throw new Error("Athlete deletion recovery status is unknown.");
  }
}

function assessment(
  state: UlcAthleteDeletionRecoveryState,
  expiresAt: Date | null,
  days: number | null,
): UlcAthleteDeletionRecoveryAssessment {
  return Object.freeze({
    state,
    sourceAuthorityExpiresAt: expiresAt === null ? null : new Date(expiresAt),
    remainingAuthorityDays: days,
    authorizesPostExpiryRetry: false as const,
    automaticActionAllowed: false as const,
  });
}

function validDate(value: unknown, label: string): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error(label + " timestamp is invalid.");
  }
  return new Date(value.getTime());
}

function validCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
