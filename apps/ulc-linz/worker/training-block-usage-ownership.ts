import type { TrainingBlockUsageEvent } from "@appbasis/training-blocks";
import type { TrainingPlanRepository } from "@appbasis/training-plans";

import { trainingPlanUsageEventId } from "./training-plans-service";

type UnresolvedReason =
  | "organization-mismatch"
  | "unsupported-source"
  | "invalid-reference"
  | "invalid-event-identity"
  | "plan-not-found"
  | "plan-scope-mismatch"
  | "source-block-mismatch";

export type UlcVerifiedTrainingBlockUsageOwner =
  | Readonly<{
      status: "verified";
      organizationId: string;
      subjectId: string;
      proof: "current-training-plan";
    }>
  | Readonly<{
      status: "unresolved";
      reason: UnresolvedReason;
    }>;

/**
 * Internal, privileged, READ-ONLY evidence for training-plan-generated usage.
 *
 * This is neither an authorization check nor a historical ownership ledger.
 * It trusts only the current authoritative training-plan owner and verifies
 * the canonical content-derived usage event ID plus the exact source item
 * and block. No legacy rows are automatically backfilled or deleted.
 *
 * Callers must separately authorize access to the organization and must NOT
 * treat an unresolved result as proof that an event is non-personal.
 */
export async function verifyUlcTrainingBlockUsageOwner(
  organizationId: string,
  usage: TrainingBlockUsageEvent,
  plans: Pick<TrainingPlanRepository, "findCurrent">,
): Promise<UlcVerifiedTrainingBlockUsageOwner> {
  if (!validIdentifier(organizationId)) {
    return unresolved("organization-mismatch");
  }
  if (
    usage === null ||
    typeof usage !== "object" ||
    usage.organizationId !== organizationId ||
    !validIdentifier(usage.blockId)
  ) {
    return unresolved("organization-mismatch");
  }
  if (usage.sourceKind !== "training_plan") {
    return unresolved("unsupported-source");
  }

  // v1 uses "planId:itemId". Both identifiers can contain arbitrary
  // characters, so a missing or ambiguous separator is NOT guessed.
  const ref = usage.sourceRef;
  if (typeof ref !== "string" || ref.length > 500) {
    return unresolved("invalid-reference");
  }
  const parts = ref.split(":");
  if (
    parts.length !== 2 ||
    !validIdentifier(parts[0]) ||
    !validIdentifier(parts[1])
  ) {
    return unresolved("invalid-reference");
  }
  const [planId, itemId] = parts as [string, string];
  const expectedId = await trainingPlanUsageEventId(organizationId, planId, itemId);
  if (usage.id !== expectedId) {
    return unresolved("invalid-event-identity");
  }

  // Errors from the authoritative owner must fail closed, never fall back to
  // string inference. A deleted historical plan cannot be verified here.
  const plan = await plans.findCurrent(organizationId, planId);
  if (plan === undefined) return unresolved("plan-not-found");
  if (
    plan.id !== planId ||
    plan.organizationId !== organizationId ||
    !validIdentifier(plan.subjectId) ||
    plan.currentRevision !== plan.revision.revision ||
    plan.revision.planId !== plan.id ||
    plan.revision.organizationId !== organizationId ||
    !Array.isArray(plan.revision.items)
  ) {
    return unresolved("plan-scope-mismatch");
  }
  const matches = plan.revision.items.filter(
    (item) => item.kind === "block" && item.itemId === itemId,
  );
  if (
    matches.length !== 1 ||
    matches[0]?.kind !== "block" ||
    matches[0].sourceBlockId !== usage.blockId
  ) {
    return unresolved("source-block-mismatch");
  }
  return Object.freeze({
    status: "verified",
    organizationId,
    subjectId: plan.subjectId,
    proof: "current-training-plan",
  });
}

function validIdentifier(value: unknown): value is string {
  return typeof value === "string" &&
    value.length >= 1 && value.length <= 200 &&
    value === value.trim() && !value.includes("\u0000");
}

function unresolved(reason: UnresolvedReason): UlcVerifiedTrainingBlockUsageOwner {
  return Object.freeze({ status: "unresolved", reason });
}
