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

const REAL_FETCH = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const url = String(input);
  if (url.endsWith("/repos/martinirrgeher-cloud/appbasis/commits/main")) {
    return Response.json({ sha: GITHUB_SHA });
  }
  if (url.includes("/actions/workflows/m5-ulc-protected-lifecycle-operations.yml/runs")) {
    const updatedAt = new Date(Date.now() - 1_000).toISOString();
    return Response.json({
      total_count: 1,
      workflow_runs: [{
        id: 1,
        run_attempt: 1,
        name: "M5 ULC Protected Lifecycle Operations",
        path: ".github/workflows/m5-ulc-protected-lifecycle-operations.yml",
        event: "workflow_dispatch",
        head_branch: "main",
        head_sha: GITHUB_SHA,
        status: "completed",
        conclusion: "success",
        created_at: updatedAt,
        updated_at: updatedAt,
        repository: { full_name: "martinirrgeher-cloud/appbasis" },
      }],
    });
  }
  return REAL_FETCH(input, options);
};
test.after(() => {
  globalThis.fetch = REAL_FETCH;
});

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
  if (value.endsWith("/workers/scripts/appbasis-ulc-linz-production/subdomain")) {
    return Promise.resolve(response({ success: true, result: { enabled: false, previews_enabled: false } }));
  }
  if (value.includes("/workers/domains?") && value.includes("service=appbasis-ulc-linz-production")) {
    return Promise.resolve(response({ success: true, result: [] }));
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

test("observer reports lifecycle executors unbound before repository binding while the canonical runner verifies the protected operations", async () => {
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
  for (const id of [
    "deletionConcept",
    "retention",
    "privilegedControlPlaneIsolation",
  ]) {
    assert.equal(result.criteria.find((criterion) => criterion.id === id)?.status, "verified");
  }
  for (const id of [
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
  const publicSubdomainFetch = async (url, options) => {
    const result = await providerFetch(url, options);
    if (String(url).endsWith("/workers/scripts/appbasis-ulc-linz-production/subdomain")) {
      const body = await result.json();
      body.result.enabled = true;
      return response(body);
    }
    return result;
  };
  await assert.rejects(
    () => collect({ fetchImpl: publicSubdomainFetch }),
    /public ingress is not closed/,
  );

  const publicDomainFetch = async (url, options) => {
    if (String(url).includes("/workers/domains?")) {
      return response({
        success: true,
        result: [{ service: "appbasis-ulc-linz-production", hostname: "app.ulc-linz.at" }],
      });
    }
    return providerFetch(url, options);
  };
  await assert.rejects(
    () => collect({ fetchImpl: publicDomainFetch }),
    /public ingress is not closed/,
  );

  for (const resultInfo of [
    { count: 1, page: 1, per_page: 20, total_count: 1, total_pages: 1 },
    { count: 0, page: 2, per_page: 20, total_count: 0, total_pages: 2 },
  ]) {
    const inconsistentDomainFetch = async (url, options) => {
      if (String(url).includes("/workers/domains?")) {
        return response({ success: true, result: [], result_info: resultInfo });
      }
      return providerFetch(url, options);
    };
    await assert.rejects(
      () => collect({ fetchImpl: inconsistentDomainFetch }),
      /custom-domain result metadata is inconsistent/,
    );
  }

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
    ["/workers/scripts/appbasis-ulc-linz-production/subdomain", "subdomain"],
    ["/workers/domains?", "custom-domains"],
    ["/workers/scripts/appbasis-ulc-linz-production/deployments", "deployments"],
    ["/workers/scripts", "script-inventory"],
    ["/workers/scripts/appbasis-ulc-linz-production/script-settings", "script-settings"],
    [`/versions/${CURRENT_VERSION}`, "version"],
  ];

  for (const [needle, requestClass] of cases) {
    const failingFetch = async (url, options) => {
      const value = String(url);
      const matches = needle === "/workers/domains?"
        ? value.includes(needle)
        : value.endsWith(needle);
      if (matches) {
        return {
          ok: false,
          status: 403,
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
          `Cloudflare provider evidence request failed: ${requestClass}:http-403.`,
        );
        assert.doesNotMatch(error.message, /provider-token-value|account-1|sensitive-provider-detail|https?:\/\//);
        return true;
      },
    );
  }
});

test("observer classifies bounded script-settings failure modes without provider leakage", async () => {
  const cases = [
    [
      "http-404",
      async () => ({
        ok: false,
        status: 404,
        async json() {
          return { errors: [{ message: "provider-token-value sensitive-provider-detail" }] };
        },
      }),
    ],
    [
      "http-5xx",
      async () => ({
        ok: false,
        status: 503,
        async json() {
          return { errors: [{ message: "provider-token-value sensitive-provider-detail" }] };
        },
      }),
    ],
    [
      "invalid-json",
      async () => ({
        ok: true,
        status: 200,
        async json() {
          throw new Error("provider-token-value sensitive-provider-detail");
        },
      }),
    ],
    [
      "api-unsuccessful",
      async () => response({
        success: false,
        errors: [{ message: "provider-token-value sensitive-provider-detail" }],
      }),
    ],
  ];

  for (const [failureClass, scriptSettingsResponse] of cases) {
    const failingFetch = async (url, options) => {
      if (String(url).endsWith("/workers/scripts/appbasis-ulc-linz-production/script-settings")) {
        return scriptSettingsResponse();
      }
      return providerFetch(url, options);
    };

    await assert.rejects(
      () => collect({ fetchImpl: failingFetch }),
      (error) => {
        assert.equal(
          error?.message,
          `Cloudflare provider evidence request failed: script-settings:${failureClass}.`,
        );
        assert.doesNotMatch(error.message, /provider-token-value|account-1|sensitive-provider-detail|https?:\/\//);
        return true;
      },
    );
  }

  const transportFetch = async (url, options) => {
    if (String(url).endsWith("/workers/scripts/appbasis-ulc-linz-production/script-settings")) {
      throw new Error("provider-token-value sensitive-provider-detail");
    }
    return providerFetch(url, options);
  };
  await assert.rejects(
    () => collect({ fetchImpl: transportFetch }),
    (error) => {
      assert.equal(
        error?.message,
        "Cloudflare provider evidence request failed: script-settings:transport.",
      );
      assert.doesNotMatch(error.message, /provider-token-value|account-1|sensitive-provider-detail|https?:\/\//);
      return true;
    },
  );
});

test("observer classifies null Cloudflare payloads", async () => {
  const nullFetch = async (url, options) => {
    if (String(url).endsWith("/workers/scripts/appbasis-ulc-linz-production/subdomain")) {
      return response(null);
    }
    return providerFetch(url, options);
  };

  await assert.rejects(
    () => collect({ fetchImpl: nullFetch }),
    (error) => {
      assert.equal(
        error?.message,
        "Cloudflare provider evidence request failed: subdomain:api-unsuccessful.",
      );
      return true;
    },
  );
});