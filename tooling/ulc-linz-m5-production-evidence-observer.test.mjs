import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { collectUlcLinzM5ProductionEvidenceBundle } from "./ulc-linz-m5-production-evidence-observer.mjs";
import { evaluateUlcLinzM5ProductionEvidenceBundle } from "./ulc-linz-m5-production-evidence-runner.mjs";

const NOW = new Date("2026-08-23T14:10:00.000Z");
const GITHUB_SHA = "a".repeat(40);
const INVENTORY = JSON.parse(
  await readFile(
    new URL("../apps/ulc-linz/privacy/m5-data-inventory.json", import.meta.url),
    "utf8",
  ),
);
const PRODUCTION_TABLES = INVENTORY.persistentTables.map((entry) => entry.id);

function response(value) {
  return { ok: true, async json() { return structuredClone(value); } };
}

function providerFetch(url) {
  const value = String(url);
  if (value.includes("console.neon.tech/api/v2/projects?") || value.endsWith("/api/v2/projects")) {
    return Promise.resolve(response({ projects: [{ id: "project-1", name: "appbasis-ulc-linz-production", region_id: "aws-eu-central-1", history_retention_seconds: 21600 }] }));
  }
  if (value.endsWith("/projects/project-1/branches")) {
    return Promise.resolve(response({ branches: [{ id: "branch-1", name: "production", primary: true }] }));
  }
  if (value.endsWith("/projects/project-1/branches/branch-1/databases")) {
    return Promise.resolve(response({ databases: [{ id: 123, name: "neondb" }] }));
  }
  if (value.endsWith("/workers/workers/appbasis-ulc-linz-production")) {
    return Promise.resolve(response({ success: true, result: { name: "appbasis-ulc-linz-production", subdomain: { enabled: false, previews_enabled: false }, references: { domains: [] } } }));
  }
  if (value.endsWith("/workers/scripts/appbasis-ulc-linz-production/deployments")) {
    return Promise.resolve(response({ success: true, result: { deployments: [{ versions: [{ version_id: "12345678-1234-4123-8123-123456789abc", percentage: 100 }] }] } }));
  }
  if (value.endsWith("/workers/scripts/appbasis-ulc-linz-production/script-settings")) {
    return Promise.resolve(response({
      success: true,
      result: {
        logpush: false,
        observability: { enabled: false },
        tags: [],
        tail_consumers: [],
      },
    }));
  }
  if (value.endsWith("/workers/scripts")) {
    return Promise.resolve(response({ success: true, result: [{ id: "appbasis-ulc-linz-production", routes: [] }] }));
  }
  if (value.endsWith("/versions/12345678-1234-4123-8123-123456789abc")) {
    return Promise.resolve(response({
      success: true,
      result: {
        id: "12345678-1234-4123-8123-123456789abc",
        annotations: {
          "workers/tag": "ulc-linz-production-runtime-v1",
          "workers/message": `AppBasis ulc-linz production runtime ${GITHUB_SHA} auth-hmac:${"b".repeat(64)}`,
        },
        resources: {
          bindings: [
            { name: "APPBASIS_BASE_URL", type: "plain_text", text: "https://app.ulc-linz.at" },
            { name: "HYPERDRIVE", type: "hyperdrive", id: "hyperdrive-1" },
            { name: "SECURITY_LOG_HYPERDRIVE", type: "hyperdrive", id: "hyperdrive-security-1" },
            { name: "BETTER_AUTH_SECRET", type: "secret_text" },
          ],
        },
      },
    }));
  }
  throw new Error(`Unexpected provider URL: ${value}`);
}

function restoreObservation() {
  return {
    restoreTargetBindingId: "restore-target-1",
    restoreTestedAt: "2026-08-23T14:09:00.000Z",
    restoreSucceeded: true,
    dataIntegrityVerified: true,
    authVerified: true,
    permissionsVerified: true,
    applicationSmokeVerified: true,
    restoreReconciliationVerified: true,
  };
}

function collect(options = {}, inputOverrides = {}) {
  return collectUlcLinzM5ProductionEvidenceBundle(
    {
      repositoryRoot: process.cwd(),
      cloudflareAccountId: "account-1",
      cloudflareApiToken: "provider-token-value",
      neonApiKey: "neon-api-key-value",
      neonOrgId: "org-1",
      productionDatabaseUrl:
        "postgresql://readonly:password@database.example.test/appbasis?sslmode=require",
      githubSha: GITHUB_SHA,
      restoreObservation: restoreObservation(),
      ...inputOverrides,
    },
    {
      fetchImpl: providerFetch,
      now: NOW,
      readProductionTables: async () => PRODUCTION_TABLES,
      ...options,
    },
  );
}

test("observer derives authoritative provider recovery/control-plane evidence and reports lifecycle executors truthfully unbound", async () => {
  const bundle = await collect();
  assert.deepEqual(Object.keys(bundle.ownerInputs).sort(), [
    "backupRestoreEvidenceInput",
    "controlPlaneEvidenceInput",
    "lifecycleActivationEvidenceInput",
    "providerBoundEvidenceInput",
  ]);
  assert.equal(
    bundle.ownerInputs.providerBoundEvidenceInput.resourceBindingEvidence.neon.databaseBindingId,
    "123",
  );
  assert.equal(
    bundle.ownerInputs.backupRestoreEvidenceInput.sourceDatabaseBindingId,
    "123",
  );
  assert.equal(
    bundle.ownerInputs.lifecycleActivationEvidenceInput.activationEvidence.deletionExecutorBound,
    false,
  );
  assert.equal(
    bundle.ownerInputs.lifecycleActivationEvidenceInput.activationEvidence.retentionExecutorBound,
    false,
  );

  const result = await evaluateUlcLinzM5ProductionEvidenceBundle(
    process.cwd(),
    bundle,
    { now: NOW },
  );

  assert.equal(result.securityPrivacyReady, false);
  assert.equal(result.productionReleaseAuthorized, false);
  assert.match(result.resourceBindingFingerprint, /^sha256:[0-9a-f]{64}$/);
  assert.equal(
    result.criteria.find((criterion) => criterion.id === "privilegedControlPlaneIsolation")?.status,
    "verified",
  );
  for (const id of [
    "deletionConcept",
    "retention",
    "auditSecurityLogging",
    "dataRegion",
    "dpa",
    "encryption",
    "subprocessors",
    "dataExport",
    "highPrivacyProfile",
  ]) {
    assert.equal(result.criteria.find((criterion) => criterion.id === id)?.status, "open");
  }
});

test("observer accepts only the native positive safe-integer Neon database ID shape", async () => {
  for (const invalidId of ["123", 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const invalidDatabaseFetch = async (url, options) => {
      const result = await providerFetch(url, options);
      if (String(url).endsWith("/projects/project-1/branches/branch-1/databases")) {
        return response({ databases: [{ id: invalidId, name: "neondb" }] });
      }
      return result;
    };
    await assert.rejects(
      () => collect({ fetchImpl: invalidDatabaseFetch }),
      /Neon database ID is invalid/,
    );
  }
});

test("observer fails closed on public ingress or stale restore evidence", async () => {
  const publicFetch = async (url, options) => {
    const result = await providerFetch(url, options);
    if (String(url).endsWith("/workers/workers/appbasis-ulc-linz-production")) {
      const body = await result.json();
      body.result.subdomain.enabled = true;
      return response(body);
    }
    return result;
  };
  await assert.rejects(
    () => collect({ fetchImpl: publicFetch }),
    /public ingress is not closed/,
  );

  const stale = restoreObservation();
  stale.restoreTestedAt = "2026-08-23T13:00:00.000Z";
  await assert.rejects(
    () => collect({}, { restoreObservation: stale }),
    /outside the M5 evidence window/,
  );
});

test("observer binds Cloudflare deployment to the current exact main SHA", async () => {
  const driftFetch = async (url, options) => {
    const result = await providerFetch(url, options);
    if (String(url).includes("/versions/12345678-1234-4123-8123-123456789abc")) {
      const body = await result.json();
      body.result.annotations["workers/message"] = `AppBasis ulc-linz production runtime ${"c".repeat(40)} auth-hmac:${"b".repeat(64)}`;
      return response(body);
    }
    return result;
  };
  await assert.rejects(
    () => collect({ fetchImpl: driftFetch }),
    /not bound to the current main runtime/,
  );
});

test("observer requires a distinct dedicated security-log Hyperdrive binding", async () => {
  const sharedBindingFetch = async (url, options) => {
    const result = await providerFetch(url, options);
    if (String(url).includes("/versions/12345678-1234-4123-8123-123456789abc")) {
      const body = await result.json();
      const securityBinding = body.result.resources.bindings.find(
        (binding) => binding.name === "SECURITY_LOG_HYPERDRIVE",
      );
      securityBinding.id = "hyperdrive-1";
      return response(body);
    }
    return result;
  };
  await assert.rejects(
    () => collect({ fetchImpl: sharedBindingFetch }),
    /bindings drifted from the approved runtime contract/,
  );
});

test("observer refuses to claim the current five-flow scope when Cloudflare telemetry persists data", async () => {
  const telemetryFetch = async (url, options) => {
    const result = await providerFetch(url, options);
    if (String(url).endsWith("/script-settings")) {
      const body = await result.json();
      body.result.observability = { enabled: true };
      return response(body);
    }
    return result;
  };
  await assert.rejects(
    () => collect({ fetchImpl: telemetryFetch }),
    /production resource binding evidence is not valid/,
  );
});

test("observer refuses lifecycle activation when the real production table inventory drifts", async () => {
  await assert.rejects(
    () => collect({ readProductionTables: async () => PRODUCTION_TABLES.slice(1) }),
    /lifecycle persistence inventory is not exact/,
  );
  await assert.rejects(
    () => collect({ readProductionTables: async () => [...PRODUCTION_TABLES, "unexpected_personal_data"] }),
    /lifecycle persistence inventory is not exact/,
  );
});