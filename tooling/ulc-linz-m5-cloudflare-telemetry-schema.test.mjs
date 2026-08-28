import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { collectUlcLinzM5ProductionEvidenceBundle } from "./ulc-linz-m5-production-evidence-observer.mjs";

const NOW = new Date("2026-08-23T14:10:00.000Z");
const GITHUB_SHA = "a".repeat(40);
const CURRENT_VERSION = "12345678-1234-4123-8123-123456789abc";
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

function workerVersion() {
  return {
    success: true,
    result: {
      id: CURRENT_VERSION,
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
  };
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

function providerFetch(settingsResult) {
  return async (url) => {
    const value = String(url);
    if (value.includes("console.neon.tech/api/v2/projects?") || value.endsWith("/api/v2/projects")) {
      return response({ projects: [{ id: "project-1", name: "appbasis-ulc-linz-production", region_id: "aws-eu-central-1", history_retention_seconds: 21600 }] });
    }
    if (value.endsWith("/projects/project-1/branches")) {
      return response({ branches: [{ id: "branch-1", name: "production", primary: true }] });
    }
    if (value.endsWith("/projects/project-1/branches/branch-1/databases")) {
      return response({ databases: [{ id: 123, name: "neondb" }] });
    }
    if (value.endsWith("/workers/workers/appbasis-ulc-linz-production")) {
      return response({ success: true, result: { name: "appbasis-ulc-linz-production", subdomain: { enabled: false, previews_enabled: false }, references: { domains: [] } } });
    }
    if (value.endsWith("/workers/scripts/appbasis-ulc-linz-production/deployments")) {
      return response({ success: true, result: { deployments: [{ versions: [{ version_id: CURRENT_VERSION, percentage: 100 }] }] } });
    }
    if (value.endsWith("/workers/scripts/appbasis-ulc-linz-production/script-settings")) {
      return response({ success: true, result: settingsResult });
    }
    if (value.endsWith("/workers/scripts")) {
      return response({ success: true, result: [{ id: "appbasis-ulc-linz-production", routes: [] }] });
    }
    if (value.endsWith(`/versions/${CURRENT_VERSION}`)) {
      return response(workerVersion());
    }
    throw new Error(`Unexpected provider URL: ${value}`);
  };
}

function collect(settingsResult) {
  return collectUlcLinzM5ProductionEvidenceBundle(
    {
      repositoryRoot: process.cwd(),
      cloudflareAccountId: "account-1",
      cloudflareApiToken: "provider-token-value",
      neonApiKey: "neon-api-key-value",
      neonOrgId: "org-1",
      productionDatabaseUrl: "postgresql://readonly:password@database.example.test/appbasis?sslmode=require",
      githubSha: GITHUB_SHA,
      restoreObservation: restoreObservation(),
    },
    {
      fetchImpl: providerFetch(settingsResult),
      now: NOW,
      readProductionTables: async () => PRODUCTION_TABLES,
    },
  );
}

test("observer accepts the current Cloudflare nullable tags and log query-redaction shape", async () => {
  const bundle = await collect({
    logpush: false,
    observability: {
      enabled: false,
      logs: {
        enabled: false,
        invocation_logs: false,
        redact_query_string: true,
      },
      traces: {
        enabled: false,
      },
    },
    tags: null,
    tail_consumers: [],
  });

  assert.equal(
    bundle.ownerInputs.providerBoundEvidenceInput.resourceBindingEvidence.cloudflare.unexpectedPersonalDataPersistence,
    false,
  );
});

test("observer still fails closed on unknown or malformed Cloudflare telemetry fields", async () => {
  await assert.rejects(
    () => collect({
      logpush: false,
      observability: {
        enabled: false,
        logs: {
          enabled: false,
          invocation_logs: false,
          redact_query_string: true,
          unknown_provider_field: false,
        },
      },
      tags: null,
      tail_consumers: [],
    }),
    /Cloudflare Worker logs settings is invalid/,
  );

  await assert.rejects(
    () => collect({
      logpush: false,
      observability: {
        enabled: false,
        logs: {
          enabled: false,
          invocation_logs: false,
          redact_query_string: "true",
        },
      },
      tags: null,
      tail_consumers: [],
    }),
    /Cloudflare Worker telemetry inventory is invalid/,
  );
});
