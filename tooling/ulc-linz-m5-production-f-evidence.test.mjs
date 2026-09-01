import assert from "node:assert/strict";
import test from "node:test";

import { ULC_LINZ_M5_F_CONTROLLED_RETENTION_CONTRACT_DIGEST } from "./ulc-linz-m5-audit-security-logging-evidence.mjs";
import {
  collectUlcLinzM5EarlyDeletePathEvidence,
  completeUlcLinzM5ProductionFBundle,
} from "./ulc-linz-m5-production-f-evidence.mjs";

const SHA = "a".repeat(40);
const NOW = new Date("2026-08-23T22:00:00.000Z");
const OBSERVED_AT = "2026-08-23T21:55:00.000Z";
const VALID_UNTIL = "2026-08-23T22:10:00.000Z";
const VERSION = "12345678-1234-4123-8123-123456789abc";
const HISTORICAL_VERSION = "22345678-1234-4123-8123-123456789abc";
const DEPLOYED_AT = "2026-08-23T21:30:00.000Z";
const CANONICAL_CONSTRAINT = "CHECK ((retained_until = (occurred_at + '1 year'::interval)))";
const CANONICAL_PURGE_BODY = `
DECLARE
  deleted_rows bigint;
BEGIN
  DELETE FROM public.ulc_linz_security_event_log
  WHERE retained_until < statement_timestamp();
  GET DIAGNOSTICS deleted_rows = ROW_COUNT;
  RETURN deleted_rows;
END`;

function resourceBindingEvidence() {
  return {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    observedAt: OBSERVED_AT,
    validUntilOrReviewAt: VALID_UNTIL,
    runtime: {
      entrypoint: "./worker/index.ts",
      contractDigest: `sha256:${"1".repeat(64)}`,
      providerModel: "standard-workers-global-transient",
      euOnly: false,
    },
    neon: {
      projectBindingId: "project-1",
      branchBindingId: "branch-1",
      databaseBindingId: "database-1",
      region: "aws-eu-central-1",
      regionSource: "provider-api",
      identitySource: "provider-api",
      dedicatedProductionResource: true,
    },
    cloudflare: {
      accountBindingId: "account-1",
      runtimeBindingId: "appbasis-ulc-linz-production",
      hostnameBinding: null,
      databaseBindingId: "hyperdrive-main",
      identitySource: "provider-api",
      bindingInventoryComplete: true,
      telemetryInventoryComplete: true,
      unexpectedPersonalDataPersistence: false,
      dedicatedProductionResource: true,
    },
  };
}

function bundle() {
  return {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    observedAt: OBSERVED_AT,
    definition: { appId: "ulc-linz" },
    ownerInputs: {
      providerBoundEvidenceInput: {
        resourceBindingEvidence: resourceBindingEvidence(),
        complianceEvidence: {},
        complianceResourceBindingFingerprint: `sha256:${"2".repeat(64)}`,
      },
    },
  };
}

function cloudflareFetch(url) {
  const value = String(url);
  if (value.endsWith("/workers/scripts/appbasis-ulc-linz-production/deployments")) {
    return Promise.resolve(json({
      success: true,
      result: {
        deployments: [
          { created_on: DEPLOYED_AT, versions: [{ version_id: VERSION, percentage: 100 }] },
          { created_on: "2026-08-22T21:30:00.000Z", versions: [{ version_id: HISTORICAL_VERSION, percentage: 100 }] },
        ],
      },
    }));
  }
  if (value.endsWith(`/workers/scripts/appbasis-ulc-linz-production/versions/${VERSION}`)) {
    return Promise.resolve(json({
      success: true,
      result: {
        id: VERSION,
        annotations: {
          "workers/tag": "ulc-linz-production-runtime-v1",
          "workers/message": `AppBasis ulc-linz production runtime ${SHA} auth-hmac:${"b".repeat(64)}`,
        },
        resources: {
          bindings: [
            { name: "HYPERDRIVE", type: "hyperdrive", id: "hyperdrive-main" },
            { name: "SECURITY_LOG_HYPERDRIVE", type: "hyperdrive", id: "hyperdrive-security" },
          ],
        },
      },
    }));
  }
  if (value.endsWith("/hyperdrive/configs/hyperdrive-security")) {
    return Promise.resolve(json({
      success: true,
      result: {
        id: "hyperdrive-security",
        origin: {
          scheme: "postgresql",
          host: "ep-crimson-boat-b1aqfjwf.c-5.eu-central-1.aws.neon.tech",
          port: 5432,
          database: "neondb",
          user: "ulc_security_ingest_login",
        },
        caching: { disabled: true },
      },
    }));
  }
  throw new Error(`Unexpected Cloudflare URL: ${value}`);
}

function json(value) {
  return { ok: true, async json() { return structuredClone(value); } };
}

function inputs() {
  return {
    cloudflareAccountId: "account-1",
    cloudflareApiToken: "cloudflare-token",
    productionDatabaseUrl: "postgresql://app_owner:pw@origin.example/neondb",
    backupDatabaseUrl: "postgresql://backup:pw@origin.example/neondb",
    cleanupDatabaseUrl: "postgresql://cleanup:pw@origin.example/neondb",
    readDatabaseUrl: "postgresql://reader:pw@origin.example/neondb",
    githubSha: SHA,
  };
}

const validAccess = Object.freeze({
  leastPrivilegeAccessVerified: true,
  protectedOperationalAccessVerified: true,
  providerMinimumRetentionVerified: true,
});
const validEarlyDeletePaths = Object.freeze({ noEarlyDeletePathVerified: true });
const validDelivery = Object.freeze({ postDeploymentSinkActivityObserved: true });

async function complete({
  fetchImpl = cloudflareFetch,
  access = validAccess,
  earlyDeletePaths = validEarlyDeletePaths,
  delivery = validDelivery,
} = {}) {
  return completeUlcLinzM5ProductionFBundle(bundle(), inputs(), {
    fetchImpl,
    now: NOW,
    accessCollector: async (input) => {
      assert.equal(input.backupDatabaseUrl, inputs().backupDatabaseUrl);
      return access;
    },
    earlyDeletePathCollector: async (input) => {
      assert.equal(input.productionDatabaseUrl, inputs().productionDatabaseUrl);
      return earlyDeletePaths;
    },
    deliveryCollector: async (input, options) => {
      assert.equal(input.productionDatabaseUrl, inputs().readDatabaseUrl);
      assert.equal(input.deployedAt, DEPLOYED_AT);
      assert.equal(options.now.toISOString(), NOW.toISOString());
      return delivery;
    },
  });
}

function catalogDatabase({
  functionCount = 0,
  topologyCount = 0,
  constraintDefinition = CANONICAL_CONSTRAINT,
  purgeBody = CANONICAL_PURGE_BODY,
  purgeConfig = ["search_path=pg_catalog"],
  publicExecute = false,
  ownerMemberCount = 0,
} = {}) {
  let calls = 0;
  let ended = false;
  const databaseFactory = () => ({
    client: {
      async unsafe(query) {
        calls += 1;
        const source = String(query);
        if (source.includes("unexpected_delete_function_count")) {
          assert.match(source, /pg_get_functiondef/);
          assert.match(source, /prosecdef/);
          assert.match(source, /has_table_privilege/);
          return [{ unexpected_delete_function_count: functionCount }];
        }
        if (source.includes("unexpected_topology_count")) {
          assert.match(source, /relation\.relkind = 'r'/);
          assert.match(source, /relation\.relispartition = false/);
          assert.match(source, /relation\.relrowsecurity = false/);
          assert.match(source, /relation\.relforcerowsecurity = false/);
          assert.match(source, /pg_catalog\.pg_rewrite/);
          assert.match(source, /constraint_row\.conrelid/);
          assert.match(source, /constraint_row\.confrelid/);
          assert.match(source, /inheritance\.inhrelid/);
          assert.match(source, /inheritance\.inhparent/);
          assert.match(source, /trigger_row\.tgisinternal = false/);
          return [{ unexpected_topology_count: topologyCount }];
        }
        if (source.includes("pg_get_constraintdef")) {
          assert.match(source, /contype = 'c'/);
          return [{ definition: constraintDefinition }];
        }
        if (source.includes("procedure.prosrc AS source_body")) {
          assert.match(source, /pg_catalog\.pg_language/);
          assert.match(source, /pg_catalog\.format_type/);
          assert.match(source, /public_execute/);
          return [{
            security_definer: true,
            argument_count: 0,
            function_kind: "f",
            language_name: "plpgsql",
            return_type: "bigint",
            config: purgeConfig,
            source_body: purgeBody,
            public_execute: publicExecute,
          }];
        }
        if (source.includes("protected_owner_member_count")) {
          assert.match(source, /pg_catalog\.pg_auth_members/);
          assert.match(source, /membership\.roleid = relation\.relowner/);
          assert.match(source, /owner\.rolcanlogin/);
          return [{
            protected_owner_member_count: ownerMemberCount,
            owner_login: false,
            owner_superuser: false,
            owner_create_db: false,
            owner_create_role: false,
            owner_replication: false,
            owner_bypass_rls: false,
          }];
        }
        throw new Error(`Unexpected catalog query: ${source}`);
      },
      async end() { ended = true; },
    },
  });
  return {
    databaseFactory,
    calls: () => calls,
    ended: () => ended,
  };
}

async function collectWithCatalog(options = {}) {
  const catalog = catalogDatabase(options);
  const result = await collectUlcLinzM5EarlyDeletePathEvidence(
    { productionDatabaseUrl: inputs().productionDatabaseUrl },
    { databaseFactory: catalog.databaseFactory },
  );
  assert.equal(catalog.calls(), 5);
  assert.equal(catalog.ended(), true);
  return result;
}

test("adds M5-F from current production sink and verified retention contract without a destructive cleanup run", async () => {
  const result = await complete();
  const f = result.ownerInputs.auditSecurityLoggingEvidenceInput;
  assert.equal(f.resourceBindingEvidence, result.ownerInputs.providerBoundEvidenceInput.resourceBindingEvidence);
  assert.deepEqual(f.loggingEvidence.retentionEvidence, {
    source: "production-database-and-authoritative-contract",
    providerMinimumRetentionVerified: true,
    cutoffSemantics: "occurred-at-strictly-older-than-12-calendar-months",
    calendarConstraintVerified: true,
    cleanupFunctionVerified: true,
    leastPrivilegeCleanupVerified: true,
    noEarlyDeletePathVerified: true,
    clientCutoffOverridePresent: false,
    enforcementContractDigest: ULC_LINZ_M5_F_CONTROLLED_RETENTION_CONTRACT_DIGEST,
  });
  assert.equal(f.loggingEvidence.retentionMode, "controlled-calendar-contract");
  assert.equal("cleanupLastSucceededAt" in f.loggingEvidence.retentionEvidence, false);
  assert.equal(JSON.stringify(result).includes("postgresql://"), false);
});

test("fails closed without real least-privilege access and retention-contract evidence", async () => {
  for (const access of [
    { ...validAccess, leastPrivilegeAccessVerified: false },
    { ...validAccess, protectedOperationalAccessVerified: false },
    { ...validAccess, providerMinimumRetentionVerified: false },
  ]) {
    await assert.rejects(() => complete({ access }), /access evidence is incomplete/);
  }
});

test("fails closed unless the exact protected topology was inventoried", async () => {
  await assert.rejects(
    () => complete({ earlyDeletePaths: {} }),
    /early-delete path inventory is incomplete/,
  );
});

test("canonical production contract accepts only the migration-defined retention boundary", async () => {
  assert.deepEqual(await collectWithCatalog(), { noEarlyDeletePathVerified: true });
});

test("canonical production contract rejects alternate privileged functions or structural drift", async () => {
  for (const options of [{ functionCount: 1 }, { topologyCount: 1 }]) {
    const catalog = catalogDatabase(options);
    await assert.rejects(
      () => collectUlcLinzM5EarlyDeletePathEvidence(
        { productionDatabaseUrl: inputs().productionDatabaseUrl },
        { databaseFactory: catalog.databaseFactory },
      ),
      /canonical retention contract drift exists/,
    );
    assert.equal(catalog.calls(), 5);
    assert.equal(catalog.ended(), true);
  }
});

test("canonical production contract rejects a weakened calendar constraint", async () => {
  const catalog = catalogDatabase({
    constraintDefinition: "CHECK ((retained_until <= (occurred_at + '1 year'::interval)))",
  });
  await assert.rejects(
    () => collectUlcLinzM5EarlyDeletePathEvidence(
      { productionDatabaseUrl: inputs().productionDatabaseUrl },
      { databaseFactory: catalog.databaseFactory },
    ),
    /canonical retention contract drift exists/,
  );
  assert.equal(catalog.ended(), true);
});

test("canonical production contract rejects a drifted purge body or function configuration", async () => {
  for (const options of [
    { purgeBody: `${CANONICAL_PURGE_BODY} DELETE FROM public.ulc_linz_security_event_log;` },
    { purgeConfig: ["search_path=pg_catalog", "statement_timeout=0"] },
    { publicExecute: true },
  ]) {
    const catalog = catalogDatabase(options);
    await assert.rejects(
      () => collectUlcLinzM5EarlyDeletePathEvidence(
        { productionDatabaseUrl: inputs().productionDatabaseUrl },
        { databaseFactory: catalog.databaseFactory },
      ),
      /canonical retention contract drift exists/,
    );
    assert.equal(catalog.ended(), true);
  }
});

test("canonical production contract rejects membership in the protected object owner", async () => {
  const catalog = catalogDatabase({ ownerMemberCount: 1 });
  await assert.rejects(
    () => collectUlcLinzM5EarlyDeletePathEvidence(
      { productionDatabaseUrl: inputs().productionDatabaseUrl },
      { databaseFactory: catalog.databaseFactory },
    ),
    /canonical retention contract drift exists/,
  );
  assert.equal(catalog.ended(), true);
});

test("fails closed without post-deployment sink activity evidence", async () => {
  await assert.rejects(
    () => complete({ delivery: {} }),
    /post-deployment production sink activity evidence is unavailable/,
  );
});

test("fails closed on stale Worker head, missing dedicated binding, missing active deploy timestamp or wrong Hyperdrive origin", async () => {
  const mutations = [
    (body, url) => { if (url.includes("/versions/")) body.result.annotations["workers/message"] = `AppBasis ulc-linz production runtime ${"c".repeat(40)} auth-hmac:x`; },
    (body, url) => { if (url.includes("/versions/")) body.result.resources.bindings = body.result.resources.bindings.filter((entry) => entry.name !== "SECURITY_LOG_HYPERDRIVE"); },
    (body, url) => { if (url.endsWith("/deployments")) delete body.result.deployments[0].created_on; },
    (body, url) => { if (url.includes("/hyperdrive/configs/")) body.result.origin.database = "other"; },
  ];
  for (const mutate of mutations) {
    const fetchImpl = async (url) => {
      const response = await cloudflareFetch(url);
      const body = await response.json();
      mutate(body, String(url));
      return json(body);
    };
    await assert.rejects(() => complete({ fetchImpl }));
  }
});

test("rejects pre-injected or cross-resource F evidence", async () => {
  const prefilled = bundle();
  prefilled.ownerInputs.auditSecurityLoggingEvidenceInput = {};
  await assert.rejects(
    () => completeUlcLinzM5ProductionFBundle(prefilled, inputs(), {
      fetchImpl: cloudflareFetch,
      now: NOW,
      accessCollector: async () => validAccess,
      earlyDeletePathCollector: async () => validEarlyDeletePaths,
      deliveryCollector: async () => validDelivery,
    }),
    /already present/,
  );

  const crossAccount = bundle();
  crossAccount.ownerInputs.providerBoundEvidenceInput.resourceBindingEvidence.cloudflare.accountBindingId = "other-account";
  await assert.rejects(
    () => completeUlcLinzM5ProductionFBundle(crossAccount, inputs(), {
      fetchImpl: cloudflareFetch,
      now: NOW,
      accessCollector: async () => validAccess,
      earlyDeletePathCollector: async () => validEarlyDeletePaths,
      deliveryCollector: async () => validDelivery,
    }),
    /resource binding evidence is invalid/,
  );
});