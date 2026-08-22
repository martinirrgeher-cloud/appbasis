import assert from "node:assert/strict";
import test from "node:test";

import { M3_PREVIEW_ACCEPTANCE_RUN } from "./factory-ui/m3-preview-acceptance-evidence.mjs";
import { ULC_LINZ_M6_PRODUCTION_WORKER_CREATE_PLAN_CONTRACT } from "./ulc-linz-m6-production-worker-create-plan.mjs";
import {
  UlcLinzM6ProductionWorkerM3GateError,
  evaluateUlcLinzM6ProductionWorkerM3Gate,
} from "./ulc-linz-m6-production-worker-m3-gate.mjs";

function successfulAcceptanceFetch() {
  return async () => ({
    ok: true,
    headers: {
      get(name) {
        return name.toLowerCase() === "content-type" ? "application/json; charset=utf-8" : null;
      },
    },
    async json() {
      return {
        id: M3_PREVIEW_ACCEPTANCE_RUN.workflowRunId,
        run_attempt: M3_PREVIEW_ACCEPTANCE_RUN.workflowRunAttempt,
        name: M3_PREVIEW_ACCEPTANCE_RUN.workflowName,
        path: M3_PREVIEW_ACCEPTANCE_RUN.workflowPath,
        event: M3_PREVIEW_ACCEPTANCE_RUN.workflowRunEvent,
        head_branch: M3_PREVIEW_ACCEPTANCE_RUN.workflowRunBranch,
        head_sha: M3_PREVIEW_ACCEPTANCE_RUN.workflowRunHeadSha,
        status: "completed",
        conclusion: "success",
        repository: {
          full_name: M3_PREVIEW_ACCEPTANCE_RUN.repository,
        },
      };
    },
  });
}

test("M6 worker gate consumes canonical M3 preview acceptance without authorizing provider write", async () => {
  const result = await evaluateUlcLinzM6ProductionWorkerM3Gate(
    ULC_LINZ_M6_PRODUCTION_WORKER_CREATE_PLAN_CONTRACT,
    process.cwd(),
    { fetchImpl: successfulAcceptanceFetch() },
  );

  assert.deepEqual(result, {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    phase: "production-preparation",
    stepId: "production-worker",
    status: "worker-create-prepared-awaiting-operator-approval",
    workerName: "appbasis-ulc-linz-production",
    requiredPreparationGateEvidence: ["M3_DONE"],
    productionPreparationGateEvidenceConsumed: true,
    productionPreparationEligible: true,
    providerWriteRequired: true,
    providerWriteAllowed: false,
    executionAuthorized: false,
    explicitApprovalRequired: true,
    publicExposureAllowed: false,
    productionReady: false,
    releaseAuthorized: false,
    providerStateReverificationRequired: true,
    betaCapabilityReverificationRequired: true,
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.requiredPreparationGateEvidence), true);
});

test("M6 worker gate stays blocked when canonical M3 acceptance cannot be verified", async () => {
  const result = await evaluateUlcLinzM6ProductionWorkerM3Gate(
    ULC_LINZ_M6_PRODUCTION_WORKER_CREATE_PLAN_CONTRACT,
    process.cwd(),
    { fetchImpl: async () => ({ ok: false }) },
  );

  assert.equal(result.status, "worker-create-blocked-m3-evidence-unverified");
  assert.equal(result.productionPreparationGateEvidenceConsumed, false);
  assert.equal(result.productionPreparationEligible, false);
  assert.equal(result.providerWriteAllowed, false);
  assert.equal(result.executionAuthorized, false);
  assert.equal(result.publicExposureAllowed, false);
  assert.equal(result.productionReady, false);
  assert.equal(result.releaseAuthorized, false);
  assert.equal(result.providerStateReverificationRequired, true);
  assert.equal(result.betaCapabilityReverificationRequired, true);
});

for (const mutate of [
  (plan) => {
    plan.productionPreparationEligible = true;
  },
  (plan) => {
    plan.providerWriteAllowed = true;
  },
  (plan) => {
    plan.executionAuthorized = true;
  },
  (plan) => {
    plan.publicExposureAllowed = true;
  },
  (plan) => {
    plan.betaCapabilityReverificationRequired = false;
  },
  (plan) => {
    plan.body.tags.push("unexpected");
  },
  (plan) => {
    plan.body.subdomain.enabled = true;
  },
  (plan) => {
    plan.body.subdomain.previews_enabled = true;
  },
  (plan) => {
    plan.body.observability.enabled = true;
  },
  (plan) => {
    plan.body.logpush = true;
  },
  (plan) => {
    plan.body.tail_consumers.push({ service: "unexpected" });
  },
]) {
  test("M6 worker gate rejects drifted or prematurely authorized create plan", async () => {
    const plan = structuredClone(ULC_LINZ_M6_PRODUCTION_WORKER_CREATE_PLAN_CONTRACT);
    mutate(plan);
    await assert.rejects(
      () =>
        evaluateUlcLinzM6ProductionWorkerM3Gate(plan, process.cwd(), {
          fetchImpl: successfulAcceptanceFetch(),
        }),
      errorWithCode("WORKER_M3_GATE_PRECONDITIONS_NOT_MET"),
    );
  });
}

test("M6 worker gate rejects additional create-plan fields", async () => {
  const plan = structuredClone(ULC_LINZ_M6_PRODUCTION_WORKER_CREATE_PLAN_CONTRACT);
  plan.executor = "unexpected";
  await assert.rejects(
    () =>
      evaluateUlcLinzM6ProductionWorkerM3Gate(plan, process.cwd(), {
        fetchImpl: successfulAcceptanceFetch(),
      }),
    errorWithCode("INVALID_CREATE_PLAN"),
  );
});

test("M6 worker gate rejects additional create-body fields", async () => {
  const plan = structuredClone(ULC_LINZ_M6_PRODUCTION_WORKER_CREATE_PLAN_CONTRACT);
  plan.body.script = "unexpected";
  await assert.rejects(
    () =>
      evaluateUlcLinzM6ProductionWorkerM3Gate(plan, process.cwd(), {
        fetchImpl: successfulAcceptanceFetch(),
      }),
    errorWithCode("INVALID_CREATE_PLAN"),
  );
});

test("M6 worker gate rejects non-enumerable create-plan fields", async () => {
  const plan = structuredClone(ULC_LINZ_M6_PRODUCTION_WORKER_CREATE_PLAN_CONTRACT);
  Object.defineProperty(plan, "executor", { value: "unexpected", enumerable: false });
  await assert.rejects(
    () =>
      evaluateUlcLinzM6ProductionWorkerM3Gate(plan, process.cwd(), {
        fetchImpl: successfulAcceptanceFetch(),
      }),
    errorWithCode("INVALID_CREATE_PLAN"),
  );
});

test("M6 worker gate rejects non-enumerable create-body fields", async () => {
  const plan = structuredClone(ULC_LINZ_M6_PRODUCTION_WORKER_CREATE_PLAN_CONTRACT);
  Object.defineProperty(plan.body, "script", { value: "unexpected", enumerable: false });
  await assert.rejects(
    () =>
      evaluateUlcLinzM6ProductionWorkerM3Gate(plan, process.cwd(), {
        fetchImpl: successfulAcceptanceFetch(),
      }),
    errorWithCode("INVALID_CREATE_PLAN"),
  );
});

test("M6 worker gate rejects non-enumerable subdomain fields", async () => {
  const plan = structuredClone(ULC_LINZ_M6_PRODUCTION_WORKER_CREATE_PLAN_CONTRACT);
  Object.defineProperty(plan.body.subdomain, "route", { value: "unexpected", enumerable: false });
  await assert.rejects(
    () =>
      evaluateUlcLinzM6ProductionWorkerM3Gate(plan, process.cwd(), {
        fetchImpl: successfulAcceptanceFetch(),
      }),
    errorWithCode("INVALID_CREATE_PLAN"),
  );
});

test("M6 worker gate rejects non-enumerable gate-evidence fields", async () => {
  const plan = structuredClone(ULC_LINZ_M6_PRODUCTION_WORKER_CREATE_PLAN_CONTRACT);
  Object.defineProperty(plan.requiredPreparationGateEvidence, "hidden", {
    value: "unexpected",
    enumerable: false,
  });
  await assert.rejects(
    () =>
      evaluateUlcLinzM6ProductionWorkerM3Gate(plan, process.cwd(), {
        fetchImpl: successfulAcceptanceFetch(),
      }),
    errorWithCode("WORKER_M3_GATE_PRECONDITIONS_NOT_MET"),
  );
});

test("M6 worker gate rejects accessor-backed create safety state", async () => {
  const plan = structuredClone(ULC_LINZ_M6_PRODUCTION_WORKER_CREATE_PLAN_CONTRACT);
  Object.defineProperty(plan, "providerWriteAllowed", {
    enumerable: true,
    get() {
      return false;
    },
  });
  await assert.rejects(
    () =>
      evaluateUlcLinzM6ProductionWorkerM3Gate(plan, process.cwd(), {
        fetchImpl: successfulAcceptanceFetch(),
      }),
    errorWithCode("INVALID_CREATE_PLAN"),
  );
});

function errorWithCode(code) {
  return (error) => {
    assert.equal(error instanceof UlcLinzM6ProductionWorkerM3GateError, true);
    assert.equal(error.code, code);
    return true;
  };
}
