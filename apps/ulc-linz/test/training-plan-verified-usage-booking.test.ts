import { describe, expect, it, vi } from "vitest";

import type {
  TrainingBlockUsageEvent,
  TrainingBlockVerifiedSubjectUsage,
} from "@appbasis/training-blocks";
import type {
  TrainingPlanRepository,
  TrainingPlanSnapshot,
} from "@appbasis/training-plans";

import { createUlcTrainingPlanVerifiedUsageBooking } from "../worker/training-plan-verified-usage-booking";
import { trainingPlanUsageEventId } from "../worker/training-plans-service";

const ORG = "org-verified";
const PLAN = "plan-verified";
const ITEM = "item-verified";
const BLOCK = "block-verified";
const SUBJECT = "athlete-verified";

function snapshot(changes: Partial<TrainingPlanSnapshot> = {}): TrainingPlanSnapshot {
  return {
    id: PLAN,
    organizationId: ORG,
    subjectId: SUBJECT,
    planDate: "2026-10-12",
    currentRevision: 2,
    createdAt: "2026-10-12T10:00:00.000Z",
    updatedAt: "2026-10-12T12:00:00.000Z",
    revision: {
      planId: PLAN,
      organizationId: ORG,
      revision: 2,
      createdAt: "2026-10-12T12:00:00.000Z",
      note: null,
      items: [{
        kind: "block",
        itemId: ITEM,
        sourceBlockId: BLOCK,
        sourceBlockRevision: 1,
        name: "Block",
        durationMinutes: null,
        note: null,
        exercises: [],
        sortOrder: 0,
      }],
    },
    ...changes,
  };
}

function harness(plan: TrainingPlanSnapshot | undefined = snapshot()) {
  const findCurrent = vi.fn(async (_org: string, _planId: string) => plan);
  const write = vi.fn(async (input: TrainingBlockVerifiedSubjectUsage):
    Promise<TrainingBlockUsageEvent | undefined> => input.event);
  const service = createUlcTrainingPlanVerifiedUsageBooking({
    plans: { findCurrent } satisfies Pick<TrainingPlanRepository, "findCurrent">,
    usage: { recordVerifiedSubjectUsageOnce: write },
  });
  return { service, findCurrent, write };
}

describe("ULC explicit verified training-plan usage adapter", () => {
  it("derives canonical event and subject from the current persisted plan before atomic write", async () => {
    const h = harness();
    const persisted = await h.service.book(ORG, snapshot(), ITEM);
    expect(persisted).toEqual({
      id: await trainingPlanUsageEventId(ORG, PLAN, ITEM),
      organizationId: ORG,
      blockId: BLOCK,
      occurredAt: "2026-10-12T12:00:00.000Z",
      sourceKind: "training_plan",
      sourceRef: PLAN + ":" + ITEM,
      note: null,
    });
    expect(h.findCurrent).toHaveBeenCalledTimes(2);
    expect(h.findCurrent).toHaveBeenCalledWith(ORG, PLAN);
    expect(h.write).toHaveBeenCalledExactlyOnceWith({
      event: persisted,
      subjectId: SUBJECT,
      sourcePlanId: PLAN,
      sourceItemId: ITEM,
    });
    await expect(h.service.book(ORG, snapshot(), ITEM)).resolves.toEqual(persisted);
  });

  it("fails closed before reading another organization or malformed refs", async () => {
    const h = harness();
    for (const [org, saved, item] of [
      ["org-other", snapshot(), ITEM],
      [ORG, snapshot({ organizationId: "org-other" }), ITEM],
      [ORG, snapshot({ id: "plan:ambiguous" }), ITEM],
      [ORG, snapshot(), "item:ambiguous"],
      [ORG, snapshot({ subjectId: "" }), ITEM],
    ] as const) {
      await expect(h.service.book(org, saved, item)).rejects.toThrow();
    }
    expect(h.findCurrent).not.toHaveBeenCalled();
    expect(h.write).not.toHaveBeenCalled();
  });

  it("rejects missing plan, stale revision, stale updatedAt or wrong subject", async () => {
    const h = harness();
    const absent = harness(undefined);
    await expect(absent.service.book(ORG, snapshot(), ITEM)).rejects.toThrow(/stale/);
    expect(absent.write).not.toHaveBeenCalled();
    for (const saved of [
      snapshot({ currentRevision: 1 }),
      snapshot({ updatedAt: "2026-10-13T12:00:00.000Z" }),
      snapshot({ subjectId: "athlete-other" }),
    ]) {
      await expect(h.service.book(ORG, saved, ITEM)).rejects.toThrow(/stale/);
    }
    expect(h.write).not.toHaveBeenCalled();
  });

  it("rejects a missing, duplicated or changed sourced block", async () => {
    const original = snapshot();
    const h = harness(original);
    await expect(h.service.book(ORG, snapshot(), "other-item"))
      .rejects.toThrow(/block source/);
    await expect(h.service.book(ORG, snapshot({
      revision: { ...original.revision, items: [{
        ...original.revision.items[0]!,
        kind: "block",
        sourceBlockId: "block-other",
      }] },
    }), ITEM)).rejects.toThrow(/block source/);
    const duplicates = harness(snapshot({
      revision: {
        ...original.revision,
        items: [original.revision.items[0]!, original.revision.items[0]!],
      },
    }));
    await expect(duplicates.service.book(ORG, original, ITEM))
      .rejects.toThrow(/block source/);
    expect(h.write).not.toHaveBeenCalled();
    expect(duplicates.write).not.toHaveBeenCalled();
  });

  it("refuses if ownership changed between authoritative reads", async () => {
    const h = harness();
    h.findCurrent
      .mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce(snapshot({ subjectId: "athlete-other" }));
    await expect(h.service.book(ORG, snapshot(), ITEM))
      .rejects.toThrow(/ownership proof/);
    expect(h.write).not.toHaveBeenCalled();
  });

  it("does not accept unconfirmed persistence or mismatched event responses", async () => {
    const h = harness();
    h.write.mockResolvedValueOnce(undefined);
    await expect(h.service.book(ORG, snapshot(), ITEM))
      .rejects.toThrow(/did not confirm/);
    h.write.mockImplementationOnce(async (input) => ({
      ...input.event, blockId: "different-block",
    }));
    await expect(h.service.book(ORG, snapshot(), ITEM))
      .rejects.toThrow(/did not confirm/);
  });

  it("propagates authoritative read and restricted writer failures without fallback", async () => {
    const h = harness();
    h.findCurrent.mockRejectedValueOnce(new Error("plan store unavailable"));
    await expect(h.service.book(ORG, snapshot(), ITEM))
      .rejects.toThrow(/plan store unavailable/);
    expect(h.write).not.toHaveBeenCalled();

    h.write.mockRejectedValueOnce(new Error("subject deletion marker blocks write"));
    await expect(h.service.book(ORG, snapshot(), ITEM))
      .rejects.toThrow(/deletion marker/);
  });

  it("rejects missing protected dependencies rather than allowing unauthenticated fallback", () => {
    expect(() => createUlcTrainingPlanVerifiedUsageBooking({
      plans: { findCurrent: undefined as never },
      usage: { recordVerifiedSubjectUsageOnce: async () => undefined },
    })).toThrow(/dependencies/);
  });
});
