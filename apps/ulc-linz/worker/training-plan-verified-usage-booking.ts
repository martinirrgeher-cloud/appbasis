import type {
  TrainingBlockSubjectUsageLifecycleRepository,
  TrainingBlockUsageEvent,
} from "@appbasis/training-blocks";
import type {
  TrainingPlanItemRevision,
  TrainingPlanRepository,
  TrainingPlanSnapshot,
} from "@appbasis/training-plans";

import { verifyUlcTrainingBlockUsageOwner } from "./training-block-usage-ownership";
import { trainingPlanUsageEventId } from "./training-plans-service";

/**
 * Optional, privileged application booking boundary. Its explicit injection
 * replaces the legacy usage writer for newly saved sourced block items.
 * Do NOT attach it to a live runtime before schema v6, subject lifecycle,
 * restore reconciliation and the legacy writer cutoff are approved.
 */
export interface UlcTrainingPlanVerifiedUsageBooking {
  book(
    organizationId: string,
    savedPlan: TrainingPlanSnapshot,
    blockItemId: string,
  ): Promise<TrainingBlockUsageEvent>;
}

export interface UlcVerifiedUsageBookingDependencies {
  readonly plans: Pick<TrainingPlanRepository, "findCurrent" | "listRevisions">;
  readonly usage: Pick<
    TrainingBlockSubjectUsageLifecycleRepository,
    "recordVerifiedSubjectUsageOnce"
  >;
}

export function createUlcTrainingPlanVerifiedUsageBooking(
  { plans, usage }: UlcVerifiedUsageBookingDependencies,
): UlcTrainingPlanVerifiedUsageBooking {
  if (
    !plans || typeof plans.findCurrent !== "function" ||
    typeof plans.listRevisions !== "function" ||
    !usage || typeof usage.recordVerifiedSubjectUsageOnce !== "function"
  ) {
    throw new Error("Verified training-plan usage booking dependencies are invalid.");
  }
  return Object.freeze({
    async book(
      organizationId: string,
      savedPlan: TrainingPlanSnapshot,
      blockItemId: string,
    ): Promise<TrainingBlockUsageEvent> {
      if (
        !validId(organizationId) ||
        !validId(savedPlan?.id) ||
        savedPlan.organizationId !== organizationId ||
        !validId(savedPlan.subjectId) ||
        !validId(blockItemId) ||
        savedPlan.id.includes(":") ||
        blockItemId.includes(":")
      ) {
        throw new Error("Verified training-plan usage scope is invalid.");
      }

      // The caller's saved snapshot is only a consistency expectation.
      // Current plan and subject authority ALWAYS come from the plan owner.
      const current = await plans.findCurrent(organizationId, savedPlan.id);
      if (
        current === undefined ||
        current.id !== savedPlan.id ||
        current.organizationId !== organizationId ||
        current.subjectId !== savedPlan.subjectId ||
        !validId(current.subjectId) ||
        current.currentRevision !== savedPlan.currentRevision ||
        current.updatedAt !== savedPlan.updatedAt ||
        !current.revision ||
        current.revision.planId !== current.id ||
        current.revision.organizationId !== organizationId ||
        current.revision.revision !== current.currentRevision ||
        !Array.isArray(current.revision.items) ||
        !savedPlan.revision ||
        !Array.isArray(savedPlan.revision.items)
      ) {
        throw new Error("Verified training-plan usage source is missing or stale.");
      }

      const matching = current.revision.items.filter(
        (item) => item.kind === "block" && item.itemId === blockItemId,
      );
      const savedMatching = savedPlan.revision.items.filter(
        (item) => item.kind === "block" && item.itemId === blockItemId,
      );
      const item = matching[0];
      if (
        matching.length !== 1 ||
        savedMatching.length !== 1 ||
        item?.kind !== "block" ||
        !validId(item.sourceBlockId) ||
        savedMatching[0]?.kind !== "block" ||
        savedMatching[0].sourceBlockId !== item.sourceBlockId
      ) {
        throw new Error("Verified training-plan usage block source is invalid.");
      }

      // The idempotency key is the stable plan/item identity. The event
      // timestamp must also remain stable across later autosaves, otherwise
      // a safe retry of a previously successful booking would conflict.
      // Derive first appearance exclusively from the canonical plan owner.
      const revisions = await plans.listRevisions(organizationId, current.id);
      if (!Array.isArray(revisions) || revisions.length === 0) {
        throw new Error("Verified training-plan usage revision history is unavailable.");
      }
      let firstRevision: number | null = null;
      let firstOccurredAt: string | null = null;
      const seenRevisions = new Set<number>();
      for (const revision of revisions) {
        if (
          revision.organizationId !== organizationId ||
          revision.planId !== current.id ||
          !Number.isSafeInteger(revision.revision) ||
          revision.revision < 1 ||
          revision.revision > current.currentRevision ||
          seenRevisions.has(revision.revision) ||
          !Array.isArray(revision.items) ||
          typeof revision.createdAt !== "string" ||
          !Number.isFinite(Date.parse(revision.createdAt)) ||
          new Date(revision.createdAt).toISOString() !== revision.createdAt
        ) {
          throw new Error("Verified training-plan usage revision history is inconsistent.");
        }
        seenRevisions.add(revision.revision);
        const occurrences = revision.items.filter(
          (candidate: TrainingPlanItemRevision) => candidate.kind === "block" && candidate.itemId === blockItemId,
        );
        if (occurrences.length > 1 ||
            (occurrences.length === 1 &&
              (occurrences[0]?.kind !== "block" ||
               occurrences[0].sourceBlockId !== item.sourceBlockId))) {
          throw new Error("Verified training-plan usage source history changed.");
        }
        if (occurrences.length === 1 &&
            (firstRevision === null || revision.revision < firstRevision)) {
          firstRevision = revision.revision;
          firstOccurredAt = revision.createdAt;
        }
      }
      if (
        !Number.isSafeInteger(current.currentRevision) ||
        current.currentRevision < 1 ||
        seenRevisions.size !== current.currentRevision
      ) {
        throw new Error("Verified training-plan usage revision history is incomplete.");
      }
      if (firstRevision === null || firstOccurredAt === null) {
        throw new Error("Verified training-plan usage source history is missing.");
      }

      const event: TrainingBlockUsageEvent = Object.freeze({
        id: await trainingPlanUsageEventId(organizationId, current.id, blockItemId),
        organizationId,
        blockId: item.sourceBlockId,
        occurredAt: firstOccurredAt,
        sourceKind: "training_plan",
        sourceRef: current.id + ":" + blockItemId,
        note: null,
      });

      // Second authoritative proof fails closed if the plan was changed
      // between the initial read and booking preparation.
      const proof = await verifyUlcTrainingBlockUsageOwner(
        organizationId,
        event,
        plans,
      );
      if (proof.status !== "verified" || proof.subjectId !== current.subjectId) {
        throw new Error("Verified training-plan usage ownership proof failed.");
      }

      const persisted = await usage.recordVerifiedSubjectUsageOnce({
        event,
        subjectId: proof.subjectId,
        sourcePlanId: current.id,
        sourceItemId: blockItemId,
      });
      if (
        persisted === undefined ||
        persisted.id !== event.id ||
        persisted.organizationId !== event.organizationId ||
        persisted.blockId !== event.blockId ||
        persisted.occurredAt !== event.occurredAt ||
        persisted.sourceKind !== event.sourceKind ||
        persisted.sourceRef !== event.sourceRef ||
        persisted.note !== event.note
      ) {
        throw new Error("Verified training-plan usage persistence did not confirm the event.");
      }
      return persisted;
    },
  });
}

function validId(value: unknown): value is string {
  return typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 200 &&
    value.trim() === value &&
    !value.includes("\u0000");
}
