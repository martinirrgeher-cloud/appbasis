import { describe, expect, it, vi } from "vitest";

import type { TrainingBlockUsageEvent } from "@appbasis/training-blocks";
import type {
  TrainingPlanRepository,
  TrainingPlanSnapshot,
} from "@appbasis/training-plans";

import { verifyUlcTrainingBlockUsageOwner } from "../worker/training-block-usage-ownership";
import { trainingPlanUsageEventId } from "../worker/training-plans-service";

const ORGANIZATION_ID = "org-ownership-a";
const PLAN_ID = "plan-verified";
const ITEM_ID = "item-verified";
const BLOCK_ID = "block-verified";
const SUBJECT_ID = "athlete-verified";

function snapshot(
  overrides: Partial<TrainingPlanSnapshot> = {},
): TrainingPlanSnapshot {
  return {
    id: PLAN_ID,
    organizationId: ORGANIZATION_ID,
    subjectId: SUBJECT_ID,
    planDate: "2026-10-12",
    currentRevision: 1,
    createdAt: "2026-10-12T11:00:00.000Z",
    updatedAt: "2026-10-12T12:00:00.000Z",
    revision: {
      planId: PLAN_ID,
      organizationId: ORGANIZATION_ID,
      revision: 1,
      createdAt: "2026-10-12T11:00:00.000Z",
      note: null,
      items: [{
        kind: "block",
        itemId: ITEM_ID,
        sourceBlockId: BLOCK_ID,
        sourceBlockRevision: 1,
        name: "Block",
        durationMinutes: null,
        note: null,
        exercises: [],
        sortOrder: 0,
      }],
    },
    ...overrides,
  };
}

async function usage(
  overrides: Partial<TrainingBlockUsageEvent> = {},
): Promise<TrainingBlockUsageEvent> {
  return {
    id: await trainingPlanUsageEventId(ORGANIZATION_ID, PLAN_ID, ITEM_ID),
    organizationId: ORGANIZATION_ID,
    blockId: BLOCK_ID,
    occurredAt: "2026-10-12T12:00:00.000Z",
    sourceKind: "training_plan",
    sourceRef: PLAN_ID + ":" + ITEM_ID,
    note: "Contains sensitive person text that must never be returned",
    ...overrides,
  };
}

function source(plan?: TrainingPlanSnapshot) {
  const findCurrent = vi.fn(
    async (_organizationId: string, _planId: string) => plan,
  );
  const reader: Pick<TrainingPlanRepository, "findCurrent"> = { findCurrent };
  return { reader, findCurrent };
}

describe("ULC training-block usage subject ownership evidence", () => {
  it("verifies a current training plan's exact subject and matching block item", async () => {
    const s = source(snapshot());
    const result = await verifyUlcTrainingBlockUsageOwner(
      ORGANIZATION_ID, await usage(), s.reader,
    );
    expect(result).toEqual({
      status: "verified",
      organizationId: ORGANIZATION_ID,
      subjectId: SUBJECT_ID,
      proof: "current-training-plan",
    });
    expect(JSON.stringify(result)).not.toMatch(/sensitive|person text|item-verified/);
    expect(s.findCurrent).toHaveBeenCalledTimes(1);
    expect(s.findCurrent).toHaveBeenCalledWith(ORGANIZATION_ID, PLAN_ID);
  });

  it("does not infer an owner from a forged event id or ambiguous sourceRef", async () => {
    const s = source(snapshot());
    for (const event of [
      await usage({ id: "another-usage-event" }),
      await usage({ sourceRef: "plan-verified:other-item" }),
      await usage({ sourceRef: "plan:verified:item-verified" }),
      await usage({ sourceRef: "plan-verified" }),
      await usage({ sourceRef: null }),
      await usage({ sourceKind: "manual" }),
    ]) {
      const result = await verifyUlcTrainingBlockUsageOwner(
        ORGANIZATION_ID, event, s.reader,
      );
      expect(result.status).toBe("unresolved");
    }
    expect(s.findCurrent).not.toHaveBeenCalled();
  });

  it("does not inspect another organization's event or accept a cross-organization plan", async () => {
    const s = source(snapshot());
    await expect(verifyUlcTrainingBlockUsageOwner(
      "org-ownership-b", await usage(), s.reader,
    )).resolves.toEqual({ status: "unresolved", reason: "organization-mismatch" });
    expect(s.findCurrent).not.toHaveBeenCalled();

    const mismatched = source(snapshot({ organizationId: "org-ownership-b" }));
    await expect(verifyUlcTrainingBlockUsageOwner(
      ORGANIZATION_ID, await usage(), mismatched.reader,
    )).resolves.toEqual({ status: "unresolved", reason: "plan-scope-mismatch" });
  });

  it("rejects missing plans, changed block sources and duplicate item identities", async () => {
    const event = await usage();
    await expect(verifyUlcTrainingBlockUsageOwner(
      ORGANIZATION_ID, event, source(undefined).reader,
    )).resolves.toEqual({ status: "unresolved", reason: "plan-not-found" });

    const changed = snapshot();
    const currentItem = changed.revision.items[0];
    if (currentItem?.kind !== "block") throw new Error("Expected a block fixture.");
    await expect(verifyUlcTrainingBlockUsageOwner(
      ORGANIZATION_ID, event,
      source(snapshot({ revision: {
        ...changed.revision, items: [{
          ...currentItem, sourceBlockId: "another-block",
        }],
      } })).reader,
    )).resolves.toEqual({ status: "unresolved", reason: "source-block-mismatch" });

    await expect(verifyUlcTrainingBlockUsageOwner(
      ORGANIZATION_ID, event,
      source(snapshot({
        revision: {
          ...changed.revision,
          items: [changed.revision.items[0]!, changed.revision.items[0]!],
        },
      })).reader,
    )).resolves.toEqual({ status: "unresolved", reason: "source-block-mismatch" });
  });

  it("denies invalid subject ownership and inconsistent revision snapshots", async () => {
    const event = await usage();
    for (const invalid of [
      snapshot({ subjectId: "" }),
      snapshot({ currentRevision: 2 }),
      snapshot({ revision: { ...snapshot().revision, planId: "other-plan" } }),
    ]) {
      await expect(verifyUlcTrainingBlockUsageOwner(
        ORGANIZATION_ID, event, source(invalid).reader,
      )).resolves.toEqual({ status: "unresolved", reason: "plan-scope-mismatch" });
    }
  });

  it("fails closed if the authoritative training plan store is unavailable", async () => {
    const reader: Pick<TrainingPlanRepository, "findCurrent"> = {
      async findCurrent() { throw new Error("authoritative store unavailable"); },
    };
    await expect(verifyUlcTrainingBlockUsageOwner(
      ORGANIZATION_ID, await usage(), reader,
    )).rejects.toThrow(/authoritative store unavailable/);
  });
});
