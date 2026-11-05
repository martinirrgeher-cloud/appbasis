import type { UlcLinzDeletionMarker } from "./scope-persistence";
import type {
  PostgresUlcRegistrationScheduleActorErasure,
  UlcRegistrationScheduleActorErasureResult,
} from "./registration-schedule-actor-erasure";

/**
 * Opt-in privacy coordination for an UNPUBLISHED app schema. No production,
 * Preview, HTTP, retention or restore runtime supplies this dependency.
 *
 * The caller must be the canonical, already-authorized ULC lifecycle and
 * MUST invoke this immediately after completeIdentityDeletion, for each
 * applicable manual, retention and restore path. It is not an erasure
 * permission on its own.
 */
export interface UlcRegistrationScheduleLifecyclePrivacyHook {
  readonly erasure: Pick<
    PostgresUlcRegistrationScheduleActorErasure,
    "redactAfterCompletedIdentityDeletion"
  >;
  readonly now: () => Date;
}

export class UlcRegistrationScheduleLifecyclePrivacyBlockedError extends Error {
  constructor() {
    super("A02.4 privacy reconciliation is not verified.");
    this.name = "UlcRegistrationScheduleLifecyclePrivacyBlockedError";
  }
}

function validateCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new UlcRegistrationScheduleLifecyclePrivacyBlockedError();
  }
  return value;
}

/**
 * The trusted marker (not a browser-supplied identity or organization)
 * determines which deleted member may be redacted. A failure aborts the
 * lifecycle orchestration; the canonical tombstone allows an idempotent
 * retry, but the operation is NOT considered fully complete meanwhile.
 */
export async function reconcileDeletedRegistrationScheduleActor(
  privacy: UlcRegistrationScheduleLifecyclePrivacyHook | undefined,
  marker: Pick<UlcLinzDeletionMarker, "identityId" | "organizationId">,
): Promise<UlcRegistrationScheduleActorErasureResult | null> {
  if (privacy === undefined) return null; // Pre-v12 and not-activated flows.
  if (!privacy || typeof privacy.now !== "function" ||
      typeof privacy.erasure?.redactAfterCompletedIdentityDeletion !== "function" ||
      typeof marker?.identityId !== "string" ||
      typeof marker?.organizationId !== "string") {
    throw new UlcRegistrationScheduleLifecyclePrivacyBlockedError();
  }
  const now = privacy.now();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new UlcRegistrationScheduleLifecyclePrivacyBlockedError();
  }
  const result = await privacy.erasure.redactAfterCompletedIdentityDeletion({
    organizationId: marker.organizationId,
    identityId: marker.identityId,
    now,
  });
  if (!result) throw new UlcRegistrationScheduleLifecyclePrivacyBlockedError();
  const groupPolicies = validateCount(result.groupPolicies);
  const extraDays = validateCount(result.extraDays);
  const auditEvents = validateCount(result.auditEvents);
  const totalRows = validateCount(result.totalRows);
  if (groupPolicies + extraDays + auditEvents !== totalRows) {
    throw new UlcRegistrationScheduleLifecyclePrivacyBlockedError();
  }
  return result;
}
