import assert from "node:assert/strict";
import test from "node:test";

import {
  ensureUlcLinzProductionHyperdrive,
  parseUlcLinzProductionDatabaseUrl,
  resolveUlcLinzProductionHyperdrive,
  ULC_LINZ_M6_PRODUCTION_HYPERDRIVE,
  validateUlcLinzProductionHyperdrive,
} from "./ulc-linz-m6-production-hyperdrive.mjs";

const ACCOUNT_ID = "0123456789abcdef0123456789abcdef";
const API_TOKEN = "cloudflare-test-token-000000000000";
const DATABASE_URL =
  "postgresql://neondb_owner:runtime-password@ep-crimson-boat-b1aqfjwf.c-5.eu-central-1.aws.neon.tech/neondb?sslmode=require";
const WRONG_PROJECT_DATABASE_URL =
  "postgresql://neondb_owner:runtime-password@ep-other-project.c-5.eu-central-1.aws.neon.tech/neondb?sslmode=require";
const TARGET_ID = "abcdef0123456789abcdef0123456789";

function targetConfig(overrides = {}) {
  return {
    id: TARGET_ID,
    name: ULC_LINZ_M6_PRODUCTION_HYPERDRIVE.name,
    origin: {
      scheme: "postgresql",
      host: "ep-crimson-boat-b1aqfjwf.c-5.eu-central-1.aws.neon.tech",
      port: 5432,
      database: "neondb",
      user: "neondb_owner",
      ...(overrides.origin ?? {}),
    },
    caching: { disabled: true, ...(overrides.caching ?? {}) },
    ...Object.fromEntries(
      Object.entries(overrides).filter(
        ([key]) => key !== "origin" && key !== "caching",
      ),
    ),
  };
}

function apiResponse(result) {
  return Response.json({ success: true, result });
}

function expectedWriteBody() {
  return {
    name: "appbasis-ulc-linz-production-db",
    origin: {
      scheme: "postgres",
      host: "ep-crimson-boat-b1aqfjwf.c-5.eu-central-1.aws.neon.tech",
      port: 5432,
      database: "neondb",
      user: "neondb_owner",
      password: "runtime-password",
    },
    caching: { disabled: true },
  };
}

test("pins the ULC production Hyperdrive target", () => {
  assert.deepEqual(ULC_LINZ_M6_PRODUCTION_HYPERDRIVE, {
    appId: "ulc-linz",
    environment: "production",
    name: "appbasis-ulc-linz-production-db",
    database: "neondb",
  });
  assert.equal(Object.isFrozen(ULC_LINZ_M6_PRODUCTION_HYPERDRIVE), true);
});

test("accepts only the direct exact ULC production database URL", () => {
  assert.deepEqual(parseUlcLinzProductionDatabaseUrl(DATABASE_URL), {
    scheme: "postgres",
    host: "ep-crimson-boat-b1aqfjwf.c-5.eu-central-1.aws.neon.tech",
    port: 5432,
    database: "neondb",
    user: "neondb_owner",
    password: "runtime-password",
  });

  assert.throws(
    () =>
      parseUlcLinzProductionDatabaseUrl(
        "postgresql://neondb_owner:secret@ep-crimson-boat-b1aqfjwf-pooler.c-5.eu-central-1.aws.neon.tech/neondb",
      ),
    /direct Neon origin/,
  );
  assert.throws(
    () =>
      parseUlcLinzProductionDatabaseUrl(
        "postgresql://neondb_owner:secret@ep-crimson-boat-b1aqfjwf.c-5.eu-central-1.aws.neon.tech/previewdb",
      ),
    /dedicated generated preview database/,
  );
  assert.throws(
    () => parseUlcLinzProductionDatabaseUrl(WRONG_PROJECT_DATABASE_URL),
    /exact ULC production Neon origin/,
  );
});

test("rejects a different direct Neon project before any Cloudflare request", () => {
  let requestCount = 0;
  assert.throws(
    () =>
      ensureUlcLinzProductionHyperdrive({
        accountId: ACCOUNT_ID,
        apiToken: API_TOKEN,
        databaseUrl: WRONG_PROJECT_DATABASE_URL,
        apply: true,
        fetchImpl: async () => {
          requestCount += 1;
          return apiResponse([]);
        },
      }),
    /exact ULC production Neon origin/,
  );
  assert.equal(requestCount, 0);
});

test("resolves and validates only the exact cache-disabled production target", async () => {
  const result = await resolveUlcLinzProductionHyperdrive({
    accountId: ACCOUNT_ID,
    apiToken: API_TOKEN,
    databaseUrl: DATABASE_URL,
    fetchImpl: async (_url, options) => {
      assert.equal(options.method, "GET");
      return apiResponse([targetConfig()]);
    },
  });

  assert.deepEqual(result, {
    id: TARGET_ID,
    name: "appbasis-ulc-linz-production-db",
  });
  assert.equal(
    validateUlcLinzProductionHyperdrive(targetConfig(), DATABASE_URL).id,
    TARGET_ID,
  );

  assert.throws(
    () =>
      validateUlcLinzProductionHyperdrive(
        targetConfig({ caching: { disabled: false } }),
        DATABASE_URL,
      ),
    /does not match the database binding contract/,
  );
});

test("fails closed when the production target is absent or ambiguous", async () => {
  for (const configs of [[], [targetConfig(), targetConfig({ id: "second" })]]) {
    await assert.rejects(
      resolveUlcLinzProductionHyperdrive({
        accountId: ACCOUNT_ID,
        apiToken: API_TOKEN,
        databaseUrl: DATABASE_URL,
        fetchImpl: async () => apiResponse(configs),
      }),
      /not found|not unique/,
    );
  }
});

test("does not create a missing production Hyperdrive without explicit approval", async () => {
  let requestCount = 0;
  await assert.rejects(
    ensureUlcLinzProductionHyperdrive({
      accountId: ACCOUNT_ID,
      apiToken: API_TOKEN,
      databaseUrl: DATABASE_URL,
      apply: false,
      fetchImpl: async () => {
        requestCount += 1;
        return apiResponse([]);
      },
    }),
    /creation was not explicitly confirmed/,
  );
  assert.equal(requestCount, 1);
});

test("does not reconcile an existing production Hyperdrive without explicit approval", async () => {
  let requestCount = 0;
  await assert.rejects(
    ensureUlcLinzProductionHyperdrive({
      accountId: ACCOUNT_ID,
      apiToken: API_TOKEN,
      databaseUrl: DATABASE_URL,
      apply: false,
      fetchImpl: async (_url, options) => {
        requestCount += 1;
        assert.equal(options.method, "GET");
        return apiResponse([targetConfig()]);
      },
    }),
    /credential reconciliation was not explicitly confirmed/,
  );
  assert.equal(requestCount, 1);
});

test("creates the exact cache-disabled production Hyperdrive only after approval", async () => {
  const requests = [];
  const result = await ensureUlcLinzProductionHyperdrive({
    accountId: ACCOUNT_ID,
    apiToken: API_TOKEN,
    databaseUrl: DATABASE_URL,
    apply: true,
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      if (options.method === "GET") return apiResponse([]);
      return apiResponse(targetConfig());
    },
  });

  assert.equal(result.id, TARGET_ID);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].options.method, "POST");
  assert.deepEqual(JSON.parse(requests[1].options.body), expectedWriteBody());
});

test("reconciles an existing production Hyperdrive with the approved current credentials", async () => {
  const requests = [];
  const result = await ensureUlcLinzProductionHyperdrive({
    accountId: ACCOUNT_ID,
    apiToken: API_TOKEN,
    databaseUrl: DATABASE_URL,
    apply: true,
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      if (options.method === "GET") return apiResponse([targetConfig()]);
      return apiResponse(targetConfig());
    },
  });

  assert.equal(result.id, TARGET_ID);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].options.method, "PUT");
  assert.match(requests[1].url, new RegExp(`/hyperdrive/configs/${TARGET_ID}$`));
  assert.deepEqual(JSON.parse(requests[1].options.body), expectedWriteBody());
});

test("reconciles a stale existing production Hyperdrive only after explicit approval", async () => {
  const requests = [];
  const stale = targetConfig({
    origin: { user: "legacy_runtime_role" },
    caching: { disabled: false },
  });
  const result = await ensureUlcLinzProductionHyperdrive({
    accountId: ACCOUNT_ID,
    apiToken: API_TOKEN,
    databaseUrl: DATABASE_URL,
    apply: true,
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      if (options.method === "GET") return apiResponse([stale]);
      return apiResponse(targetConfig());
    },
  });

  assert.equal(result.id, TARGET_ID);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].options.method, "PUT");
  assert.match(requests[1].url, new RegExp(`/hyperdrive/configs/${TARGET_ID}$`));
  assert.deepEqual(JSON.parse(requests[1].options.body), expectedWriteBody());
});
