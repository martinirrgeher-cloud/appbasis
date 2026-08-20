import assert from "node:assert/strict";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  deriveUlcLinzProductionRuntimeContractDigest,
  evaluateUlcLinzProductionResourceBinding,
  ULC_LINZ_M6_PRODUCTION_RUNTIME_CONTRACT_DIGEST,
  UlcLinzProductionResourceBindingError,
} from "./ulc-linz-m6-production-resource-binding.mjs";

const NOW = new Date("2026-08-18T05:30:00.000Z");
const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const RUNTIME_CONTRACT_FILES = Object.freeze([
  "pnpm-lock.yaml",
  "apps/ulc-linz/appbasis.app.json",
  "apps/ulc-linz/appbasis.database.json",
  "apps/ulc-linz/package.json",
  "packages/database/package.json",
  "packages/identity/package.json",
  "packages/permissions/package.json",
]);
const RUNTIME_CONTRACT_DIRECTORIES = Object.freeze([
  "apps/ulc-linz/worker",
  "packages/database/src",
  "packages/identity/src",
  "packages/permissions/src",
]);

function validEvidence() {
  return {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    observedAt: "2026-08-18T05:25:00.000Z",
    validUntilOrReviewAt: "2026-08-18T06:25:00.000Z",
    runtime: {
      entrypoint: "./worker/index.ts",
      contractDigest: ULC_LINZ_M6_PRODUCTION_RUNTIME_CONTRACT_DIGEST,
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

function expectBlocked(run, code) {
  assert.throws(run, (error) => {
    assert.ok(error instanceof UlcLinzProductionResourceBindingError);
    assert.equal(error.code, code);
    assert.equal(
      error.message,
      "ULC Linz production resource binding evidence is not valid.",
    );
    return true;
  });
}

function evaluate(evidence) {
  return evaluateUlcLinzProductionResourceBinding(evidence, { now: NOW });
}

function copyRuntimeContractFixture(targetRoot) {
  for (const path of RUNTIME_CONTRACT_FILES) {
    const target = join(targetRoot, path);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(REPOSITORY_ROOT, path), target);
  }
  for (const directory of RUNTIME_CONTRACT_DIRECTORIES) {
    const target = join(targetRoot, directory);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(REPOSITORY_ROOT, directory), target, { recursive: true });
  }
}

test("accepts only a complete dedicated ULC production resource binding and emits a sanitized semantic snapshot", () => {
  const result = evaluate(validEvidence());

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
  for (const internal of [
    "project-ulc-production-1",
    "branch-ulc-production-1",
    "database-ulc-production-1",
    "account-1",
    "worker-ulc-production-1",
    "hyperdrive-ulc-production-1",
    "ulc.example.test",
    ULC_LINZ_M6_PRODUCTION_RUNTIME_CONTRACT_DIGEST,
  ]) {
    assert.equal(serialized.includes(internal), false);
  }
});

test("runtime contract digest invalidates on transitive runtime and dependency drift", () => {
  const fixtureRoot = mkdtempSync(
    join(tmpdir(), "appbasis-ulc-runtime-contract-"),
  );
  try {
    copyRuntimeContractFixture(fixtureRoot);
    const baseline = deriveUlcLinzProductionRuntimeContractDigest(fixtureRoot);
    assert.equal(
      baseline,
      ULC_LINZ_M6_PRODUCTION_RUNTIME_CONTRACT_DIGEST,
    );

    for (const path of [
      "apps/ulc-linz/worker/security-events.ts",
      "packages/database/src/node-runtime.mjs",
      "packages/identity/src/http.ts",
      "packages/permissions/src/index.ts",
      "pnpm-lock.yaml",
    ]) {
      const target = join(fixtureRoot, path);
      const original = readFileSync(target);
      writeFileSync(
        target,
        Buffer.concat([original, Buffer.from("\n// runtime-contract-drift\n")]),
      );
      assert.notEqual(
        deriveUlcLinzProductionRuntimeContractDigest(fixtureRoot),
        baseline,
        path,
      );
      writeFileSync(target, original);
    }
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("rejects another app, non-production environment and schema drift", () => {
  for (const mutate of [
    (evidence) => (evidence.application = "reference"),
    (evidence) => (evidence.environment = "preview"),
    (evidence) => (evidence.schemaVersion = 2),
  ]) {
    const evidence = validEvidence();
    mutate(evidence);
    expectBlocked(() => evaluate(evidence), "INVALID_EVIDENCE");
  }
});

test("rejects runtime drift and never upgrades Standard Workers to EU-only", () => {
  for (const mutate of [
    (evidence) => (evidence.runtime.entrypoint = "./worker/other.ts"),
    (evidence) => (evidence.runtime.contractDigest = `sha256:${"0".repeat(64)}`),
    (evidence) => (evidence.runtime.providerModel = "regional-workers"),
    (evidence) => (evidence.runtime.euOnly = true),
  ]) {
    const evidence = validEvidence();
    mutate(evidence);
    expectBlocked(() => evaluate(evidence), "RUNTIME_CONTRACT_MISMATCH");
  }
});

test("requires authoritative Frankfurt Neon identity and a dedicated production resource", () => {
  for (const mutate of [
    (evidence) => (evidence.neon.region = "aws-us-east-2"),
    (evidence) => (evidence.neon.regionSource = "hostname-inference"),
    (evidence) => (evidence.neon.identitySource = "repository-name"),
    (evidence) => (evidence.neon.projectBindingId = ""),
    (evidence) => (evidence.neon.dedicatedProductionResource = false),
  ]) {
    const evidence = validEvidence();
    mutate(evidence);
    expectBlocked(() => evaluate(evidence), "NEON_BINDING_MISMATCH");
  }
});

test("requires complete Cloudflare identity, hostname, binding and telemetry evidence", () => {
  for (const mutate of [
    (evidence) => (evidence.cloudflare.identitySource = "repository-name"),
    (evidence) => (evidence.cloudflare.bindingInventoryComplete = false),
    (evidence) => (evidence.cloudflare.telemetryInventoryComplete = false),
    (evidence) => (evidence.cloudflare.unexpectedPersonalDataPersistence = true),
    (evidence) => (evidence.cloudflare.dedicatedProductionResource = false),
    (evidence) => (evidence.cloudflare.hostnameBinding = "https://ulc.example.test/path"),
    (evidence) => (evidence.cloudflare.databaseBindingId = ""),
  ]) {
    const evidence = validEvidence();
    mutate(evidence);
    expectBlocked(() => evaluate(evidence), "CLOUDFLARE_BINDING_MISMATCH");
  }
});

test("fails closed on stale, future or malformed evidence timestamps", () => {
  const stale = validEvidence();
  stale.validUntilOrReviewAt = NOW.toISOString();
  expectBlocked(() => evaluate(stale), "STALE_EVIDENCE");

  const future = validEvidence();
  future.observedAt = "2026-08-18T05:31:00.000Z";
  expectBlocked(() => evaluate(future), "STALE_EVIDENCE");

  const malformed = validEvidence();
  malformed.observedAt = "2026-08-18 05:25:00Z";
  expectBlocked(() => evaluate(malformed), "INVALID_EVIDENCE");
});

test("rejects secret-like fields and credential-shaped values before normalization", () => {
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
    expectBlocked(() => evaluate(evidence), "UNSAFE_EVIDENCE");
  }
});

test("does not invoke accessors, accept symbols or accept inherited evidence", () => {
  let getterCalls = 0;
  const accessorEvidence = validEvidence();
  Object.defineProperty(accessorEvidence.cloudflare, "runtimeBindingId", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "worker-ulc-production-1";
    },
  });
  expectBlocked(() => evaluate(accessorEvidence), "UNSAFE_EVIDENCE");
  assert.equal(getterCalls, 0);

  const symbolEvidence = validEvidence();
  symbolEvidence[Symbol("hidden")] = "value";
  expectBlocked(() => evaluate(symbolEvidence), "UNSAFE_EVIDENCE");

  const inherited = Object.create(validEvidence());
  expectBlocked(() => evaluate(inherited), "UNSAFE_EVIDENCE");
});

test("does not infer environment or resource purpose from provider identifier names", () => {
  const evidence = validEvidence();
  evidence.neon.projectBindingId = "opaque-resource-123";
  evidence.cloudflare.runtimeBindingId = "opaque-runtime-456";
  evidence.cloudflare.databaseBindingId = "opaque-binding-789";

  assert.equal(evaluate(evidence).scopeComplete, true);
});
