import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateUlcLinzProductionResourceBinding,
  UlcLinzProductionResourceBindingError,
} from "./ulc-linz-m6-production-resource-binding.mjs";

const NOW = new Date("2026-08-18T05:30:00.000Z");

function validEvidence() {
  return {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    observedAt: "2026-08-18T05:25:00.000Z",
    validUntilOrReviewAt: "2026-08-18T06:25:00.000Z",
    runtime: {
      entrypoint: "./worker/index.ts",
      providerModel: "standard-workers-global-transient",
      euOnly: false,
    },
    neon: {
      projectBindingId: "project-ulc-production-1",
      branchBindingId: "branch-ulc-production-1",
      databaseBindingId: "database-ulc-production-1",
      region: "aws-eu-central-1",
      regionSource: "provider-api",
      identitySource: "provider-api",
      dedicatedProductionResource: true,
    },
    cloudflare: {
      accountBindingId: "account-1",
      runtimeBindingId: "worker-ulc-production-1",
      hostnameBinding: "ulc.example.test",
      databaseBindingId: "hyperdrive-ulc-production-1",
      identitySource: "provider-api",
      bindingInventoryComplete: true,
      telemetryInventoryComplete: true,
      unexpectedPersonalDataPersistence: false,
      dedicatedProductionResource: true,
    },
  };
}

async function expectBlocked(run, code) {
  await assert.rejects(run, (error) => {
    assert.ok(error instanceof UlcLinzProductionResourceBindingError);
    assert.equal(error.code, code);
    assert.equal(
      error.message,
      "ULC Linz production resource binding evidence is not valid.",
    );
    return true;
  });
}

test("accepts only a complete dedicated ULC production resource binding and emits a sanitized semantic snapshot", () => {
  const result = evaluateUlcLinzProductionResourceBinding(validEvidence(), {
    now: NOW,
  });

  assert.deepEqual(result, {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    observedAt: "2026-08-18T05:25:00.000Z",
    validUntilOrReviewAt: "2026-08-18T06:25:00.000Z",
    runtimeContractVerified: true,
    productionDatabaseBound: true,
    productionWorkerBound: true,
    productionHostnameBound: true,
    databaseBindingBound: true,
    providerModel: "standard-workers-global-transient",
    euOnly: false,
    neonRegion: "aws-eu-central-1",
    scopeComplete: true,
  });
  assert.ok(Object.isFrozen(result));

  const serialized = JSON.stringify(result);
  for (const sensitiveOrInternal of [
    "project-ulc-production-1",
    "branch-ulc-production-1",
    "database-ulc-production-1",
    "account-1",
    "worker-ulc-production-1",
    "hyperdrive-ulc-production-1",
    "ulc.example.test",
  ]) {
    assert.equal(serialized.includes(sensitiveOrInternal), false);
  }
});

test("rejects another app, non-production environment and schema drift", async () => {
  for (const mutate of [
    (evidence) => {
      evidence.application = "reference";
    },
    (evidence) => {
      evidence.environment = "preview";
    },
    (evidence) => {
      evidence.schemaVersion = 2;
    },
  ]) {
    const evidence = validEvidence();
    mutate(evidence);
    await expectBlocked(
      () => Promise.resolve(evaluateUlcLinzProductionResourceBinding(evidence, { now: NOW })),
      "INVALID_EVIDENCE",
    );
  }
});

test("rejects runtime drift and never upgrades Standard Workers to EU-only", async () => {
  for (const mutate of [
    (evidence) => {
      evidence.runtime.entrypoint = "./worker/other.ts";
    },
    (evidence) => {
      evidence.runtime.providerModel = "regional-workers";
    },
    (evidence) => {
      evidence.runtime.euOnly = true;
    },
  ]) {
    const evidence = validEvidence();
    mutate(evidence);
    await expectBlocked(
      () => Promise.resolve(evaluateUlcLinzProductionResourceBinding(evidence, { now: NOW })),
      "RUNTIME_CONTRACT_MISMATCH",
    );
  }
});

test("requires authoritative Frankfurt Neon identity and a dedicated production resource", async () => {
  for (const mutate of [
    (evidence) => {
      evidence.neon.region = "aws-us-east-2";
    },
    (evidence) => {
      evidence.neon.regionSource = "hostname-inference";
    },
    (evidence) => {
      evidence.neon.identitySource = "repository-name";
    },
    (evidence) => {
      evidence.neon.projectBindingId = "";
    },
    (evidence) => {
      evidence.neon.dedicatedProductionResource = false;
    },
  ]) {
    const evidence = validEvidence();
    mutate(evidence);
    await expectBlocked(
      () => Promise.resolve(evaluateUlcLinzProductionResourceBinding(evidence, { now: NOW })),
      "NEON_BINDING_MISMATCH",
    );
  }
});

test("requires complete Cloudflare identity, hostname, binding and telemetry evidence", async () => {
  for (const mutate of [
    (evidence) => {
      evidence.cloudflare.identitySource = "repository-name";
    },
    (evidence) => {
      evidence.cloudflare.bindingInventoryComplete = false;
    },
    (evidence) => {
      evidence.cloudflare.telemetryInventoryComplete = false;
    },
    (evidence) => {
      evidence.cloudflare.unexpectedPersonalDataPersistence = true;
    },
    (evidence) => {
      evidence.cloudflare.dedicatedProductionResource = false;
    },
    (evidence) => {
      evidence.cloudflare.hostnameBinding = "https://ulc.example.test/path";
    },
    (evidence) => {
      evidence.cloudflare.databaseBindingId = "";
    },
  ]) {
    const evidence = validEvidence();
    mutate(evidence);
    await expectBlocked(
      () => Promise.resolve(evaluateUlcLinzProductionResourceBinding(evidence, { now: NOW })),
      "CLOUDFLARE_BINDING_MISMATCH",
    );
  }
});

test("fails closed on stale, future or malformed evidence timestamps", async () => {
  const stale = validEvidence();
  stale.validUntilOrReviewAt = NOW.toISOString();
  await expectBlocked(
    () => Promise.resolve(evaluateUlcLinzProductionResourceBinding(stale, { now: NOW })),
    "STALE_EVIDENCE",
  );

  const future = validEvidence();
  future.observedAt = "2026-08-18T05:31:00.000Z";
  await expectBlocked(
    () => Promise.resolve(evaluateUlcLinzProductionResourceBinding(future, { now: NOW })),
    "STALE_EVIDENCE",
  );

  const malformed = validEvidence();
  malformed.observedAt = "2026-08-18 05:25:00Z";
  await expectBlocked(
    () => Promise.resolve(evaluateUlcLinzProductionResourceBinding(malformed, { now: NOW })),
    "INVALID_EVIDENCE",
  );
});

test("rejects secret-like fields and credential-shaped values before normalization", async () => {
  for (const mutate of [
    (evidence) => {
      evidence.connectionString = "postgresql://user:password@example.test/db";
    },
    (evidence) => {
      evidence.cloudflare.token = "provider-token";
    },
    (evidence) => {
      evidence.neon.projectBindingId = "postgresql://user:password@example.test/db";
    },
  ]) {
    const evidence = validEvidence();
    mutate(evidence);
    await expectBlocked(
      () => Promise.resolve(evaluateUlcLinzProductionResourceBinding(evidence, { now: NOW })),
      "UNSAFE_EVIDENCE",
    );
  }
});

test("does not invoke accessors, accept symbols or accept inherited evidence", async () => {
  let getterCalls = 0;
  const accessorEvidence = validEvidence();
  Object.defineProperty(accessorEvidence.cloudflare, "runtimeBindingId", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "worker-ulc-production-1";
    },
  });
  await expectBlocked(
    () => Promise.resolve(evaluateUlcLinzProductionResourceBinding(accessorEvidence, { now: NOW })),
    "UNSAFE_EVIDENCE",
  );
  assert.equal(getterCalls, 0);

  const symbolEvidence = validEvidence();
  symbolEvidence[Symbol("hidden")] = "value";
  await expectBlocked(
    () => Promise.resolve(evaluateUlcLinzProductionResourceBinding(symbolEvidence, { now: NOW })),
    "UNSAFE_EVIDENCE",
  );

  const inherited = Object.create(validEvidence());
  await expectBlocked(
    () => Promise.resolve(evaluateUlcLinzProductionResourceBinding(inherited, { now: NOW })),
    "UNSAFE_EVIDENCE",
  );
});

test("does not infer environment or resource purpose from provider identifier names", () => {
  const evidence = validEvidence();
  evidence.neon.projectBindingId = "opaque-resource-123";
  evidence.cloudflare.runtimeBindingId = "opaque-runtime-456";
  evidence.cloudflare.databaseBindingId = "opaque-binding-789";

  const result = evaluateUlcLinzProductionResourceBinding(evidence, { now: NOW });
  assert.equal(result.scopeComplete, true);
});
