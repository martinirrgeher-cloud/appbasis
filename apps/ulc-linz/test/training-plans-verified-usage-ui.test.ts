import { describe, expect, it, vi } from "vitest";

import { ULC_TRAINING_PLANS_SCRIPT } from "../worker/training-plans-ui";
import { ULC_LINZ_APP_SCRIPT } from "../worker/ui";

type UsageRecovery = {
  planId: string;
  currentRevision: number;
  subjectId: string;
  planDate: string;
};
type RecoveryHarness = {
  save: (
    writer: () => Promise<unknown>,
    subjectId?: string,
    planDate?: string,
  ) => Promise<unknown>;
  pending: () => UsageRecovery | null;
  changeIdentity: () => void;
  request: ReturnType<typeof vi.fn>;
};

const SUBJECT = "athlete-ui";
const DATE = "2026-11-19";
const PLAN = "saved-plan-id";

function recoveryError(planId = PLAN, currentRevision = 2) {
  return Object.assign(new Error("Plan saved but usage incomplete"), {
    code: "ULC_TRAINING_PLAN_USAGE_INCOMPLETE",
    status: 409,
    planId,
    currentRevision,
  });
}

function planResponse(
  { planId, currentRevision, subjectId, planDate }: UsageRecovery = {
    planId: PLAN,
    currentRevision: 2,
    subjectId: SUBJECT,
    planDate: DATE,
  },
) {
  return {
    usageReconciled: true,
    plan: {
      id: planId,
      currentRevision,
      subjectId,
      planDate,
      revision: { revision: currentRevision, items: [] },
    },
  };
}

function harness(handler: (path: string, init: { method: string; body: string }) => Promise<unknown>): RecoveryHarness {
  const begin = ULC_TRAINING_PLANS_SCRIPT.indexOf(
    "function sameTrainingPlanUsageRecovery(pending, subjectId, planDate)",
  );
  const end = ULC_TRAINING_PLANS_SCRIPT.indexOf(
    "\nasync function performTrainingPlanSave()",
    begin,
  );
  expect(begin).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(begin);
  const source = ULC_TRAINING_PLANS_SCRIPT.slice(begin, end);
  const request = vi.fn(handler);
  const make = new Function("requestJson", "isTrainingPlanSnapshot", [
    "let trainingPlanSessionGeneration = 1;",
    "let trainingPlanSessionIdentityId = 'user-one';",
    "let trainingPlanUsageRecovery = null;",
    source,
    "return {",
    "  save: requestTrainingPlanSaveWithUsageRecovery,",
    "  pending: () => trainingPlanUsageRecovery,",
    "  changeIdentity: () => { trainingPlanSessionGeneration += 1; trainingPlanSessionIdentityId = 'user-two'; },",
    "};",
  ].join("\n")) as (
    requestJson: typeof request,
    isTrainingPlanSnapshot: (value: unknown) => boolean,
  ) => Omit<RecoveryHarness, "request">;
  return {
    ...make(request, (value) => !!value && typeof value === "object" &&
      "id" in value && "currentRevision" in value && "subjectId" in value),
    request,
  };
}

describe("P2-D verified training-plan browser recovery", () => {
  it("completes a persisted plan without reissuing its create request", async () => {
    const h = harness(async (path, init) => {
      expect(path).toBe("/api/modules/training-plans/" + PLAN + "/finalize-usage");
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body)).toEqual({ expectedRevision: 2 });
      return planResponse();
    });
    const write = vi.fn().mockRejectedValueOnce(recoveryError());
    await expect(h.save(write, SUBJECT, DATE)).resolves.toEqual(planResponse());
    expect(write).toHaveBeenCalledTimes(1);
    expect(h.request).toHaveBeenCalledTimes(1);
    expect(h.pending()).toBeNull();
  });

  it("retains the exact revision when finalization fails, then retries only finalization", async () => {
    const h = harness(vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("Network lost"), { status: 0 }))
      .mockResolvedValueOnce(planResponse()));
    const write = vi.fn().mockRejectedValueOnce(recoveryError());
    await expect(h.save(write, SUBJECT, DATE)).rejects.toThrow("Network lost");
    expect(h.pending()).toMatchObject({
      planId: PLAN, currentRevision: 2, subjectId: SUBJECT, planDate: DATE,
    });
    await expect(h.save(write, SUBJECT, DATE)).resolves.toEqual(planResponse());
    expect(write).toHaveBeenCalledTimes(1);
    expect(h.request).toHaveBeenCalledTimes(2);
    expect(h.pending()).toBeNull();
  });

  it("keeps a mismatched server result pending and never accepts another athlete's plan", async () => {
    const h = harness(vi.fn()
      .mockResolvedValueOnce(planResponse({
        planId: PLAN, currentRevision: 2, subjectId: "neighbor", planDate: DATE,
      }))
      .mockResolvedValueOnce(planResponse()));
    const write = vi.fn().mockRejectedValueOnce(recoveryError());
    await expect(h.save(write, SUBJECT, DATE))
      .rejects.toThrow("INVALID_TRAINING_PLAN_USAGE_RECOVERY");
    expect(h.pending()).toMatchObject({ planId: PLAN, subjectId: SUBJECT });
    await expect(h.save(write, SUBJECT, DATE)).resolves.toEqual(planResponse());
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("never uses a prior identity's pending write for a new login", async () => {
    const h = harness(vi.fn().mockRejectedValueOnce(new Error("Offline")));
    const firstWrite = vi.fn().mockRejectedValueOnce(recoveryError());
    await expect(h.save(firstWrite, SUBJECT, DATE)).rejects.toThrow("Offline");
    h.changeIdentity();
    const secondWrite = vi.fn().mockResolvedValueOnce({ changedByNewUser: true });
    await expect(h.save(secondWrite, SUBJECT, DATE))
      .resolves.toEqual({ changedByNewUser: true });
    expect(firstWrite).toHaveBeenCalledTimes(1);
    expect(secondWrite).toHaveBeenCalledTimes(1);
    expect(h.request).toHaveBeenCalledTimes(1);
    expect(h.pending()).toBeNull();
  });

  it("exposes only the required recovery metadata from the common fetch helper", () => {
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      'if (error.code === "ULC_TRAINING_PLAN_USAGE_INCOMPLETE")',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "error.planId = payload?.error?.planId;",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "requestTrainingPlanSaveWithUsageRecovery(",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "trainingPlanSetSaveState(\"error\",",
    );
  });
});
