import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { collectUlcLinzM5ProductionEvidenceBundle } from "./ulc-linz-m5-production-evidence-observer.mjs";
import { evaluateUlcLinzM5ProductionEvidenceBundle } from "./ulc-linz-m5-production-evidence-runner.mjs";

const NOW = new Date("2026-08-23T14:10:00.000Z");
const GITHUB_SHA = "a".repeat(40);
const CURRENT_VERSION = "12345678-1234-4123-8123-123456789abc";
const OTHER_VERSION = "87654321-4321-4123-8123-cba987654321";
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

function workerVersion(id, sha = GITHUB_SHA) {
  return {
    success: true,
    result: {
      id,
      annotations: {
        "workers/tag": "ulc-linz-production-runtime-v1",
        "workers/message": `AppBasis ulc-linz production runtime ${sha} auth-hmac:${"b".repeat(64)}`,
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
  };
}

function deployment(versionId, percentage = 100) {
  return { versions: [{ version_id: versionId, percentage }] };
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
    return Promise.resolve(response({
      success: true,
      result: {
        deployments: [deployment(CURRENT_VERSION)],
      },
    }));
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
  if (value.endsWith(`/versions/${CURRENT_VERSION}`)) {
    return Promise.resolve(response(workerVersion(CURRENT_VERSION)));
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

test("observer accepts Cloudflare deployment history when the first active deployment is the trusted current runtime", async () => {
  const historyFetch = async (url, options) => {
    const result = await providerFetch(url, options);
    if (String(url).endsWith("/workers/scripts/appbasis-ulc-linz-production/deployments")) {
      return response({
        success: true,
        result: {
          deployments: [
            deployment(CURRENT_VERSION),
            deployment(OTHER_VERSION),
          ],
        },
      });
    }
    return result;
  };
  const bundle = await collect({ fetchImpl: historyFetch });
  assert.equal(
    bundle.ownerInputs.providerBoundEvidenceInput.resourceBindingEvidence.cloudflare.runtimeBindingId,
    "appbasis-ulc-linz-production",
  );
});

test("observer never lets a later matching deployment hide active runtime drift", async () => {
  const driftFetch = async (url, options) => {
    const value = String(url);
    if (value.endsWith("/workers/scripts/appbasis-ulc-linz-production/deployments")) {
      return response({
        success: true,
        result: {
          deployments: [
            deployment(OTHER_VERSION),
            deployment(CURRENT_VERSION),
          ],
        },
      });
    }
    if (value.endsWith(`/versions/${OTHER_VERSION}`)) {
      return response(workerVersion(OTHER_VERSION, "c".repeat(40)));
    }
    return providerFetch(url, options);
  };
  await assert.rejects(
    () => collect({ fetchImpl: driftFetch }),
    /not bound to the current main runtime/,
  );
});

test("observer fails closed when the active Cloudflare deployment is malformed or split", async () => {
  const malformedFetch = async (url, options) => {
    if (String(url).endsWith("/workers/scripts/appbasis-ulc-linz-production/deployments")) {
      return response({
        success: true,
        result: {
          deployments: [
            { versions: [
              { version_id: CURRENT_VERSION, percentage: 50 },
              { version_id: OTHER_VERSION, percentage: 50 },
            ] },
            deployment(CURRENT_VERSION),
          ],
        },
      });
    }
    return providerFetch(url, options);
  };
  await assert.rejects(
    () => collect({ fetchImpl: malformedFetch }),
    /current deployment is not a single-version deployment/,
  );
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
    if (String(url).includes(`/versions/${CURRENT_VERSION}`)) {
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
    if (String(url).includes(`/versions/${CURRENT_VERSION}`)) {
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

test("observer classifies Cloudflare request failures without leaking provider context", async () => {
  const cases = [
    ["/workers/workers/appbasis-ulc-linz-production", "worker-metadata"],
    ["/workers/scripts/appbasis-ulc-linz-production/deployments", "deployments"],
    ["/workers/scripts", "script-inventory"],
    ["/workers/scripts/appbasis-ulc-linz-production/script-settings", "script-settings"],
    [`/versions/${CURRENT_VERSION}`, "version"],
  ];

  for (const [suffix, requestClass] of cases) {
    const failingFetch = async (url, options) => {
      const value = String(url);
      if (value.endsWith(suffix)) {
        return {
          ok: false,
          async json() {
            return {
              success: false,
              errors: [{ message: "provider-token-value account-1 sensitive-provider-detail" }],
            };
          },
        };
      }
      return providerFetch(url, options);
    };

    await assert.rejects(
      () => collect({ fetchImpl: failingFetch }),
      (error) => {
        assert.equal(
          error?.message,
          `Cloudflare provider evidence request failed: ${requestClass}.`,
        );
        assert.doesNotMatch(error.message, /provider-token-value|account-1|sensitive-provider-detail|https?:\/\//);
        return true;
      },
    );
  }
});
