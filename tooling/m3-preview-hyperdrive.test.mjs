import assert from "node:assert/strict";
import test from "node:test";

import { parseGeneratedPreviewDatabaseUrl } from "./generated-preview-hyperdrive.mjs";
import {
  ensureM3PreviewHyperdrive,
  M3_PREVIEW_HYPERDRIVE,
  parseM3PreviewDatabaseUrl,
  resolveM3PreviewHyperdrive,
  validateM3PreviewHyperdrive,
} from "./m3-preview-hyperdrive.mjs";

const ACCOUNT_ID = "0123456789abcdef0123456789abcdef";
const API_TOKEN = "cloudflare-test-token-000000000000";
const DATABASE_URL =
  "postgresql://runtime.user:runtime-password@ep-direct.example.neon.tech/appbasis_m3_preview?sslmode=require";
const TARGET_ID = "abcdef0123456789abcdef0123456789";

function targetConfig(overrides = {}) {
  return {
    id: TARGET_ID,
    name: M3_PREVIEW_HYPERDRIVE.name,
    origin: {
      scheme: "postgresql",
      host: "ep-direct.example.neon.tech",
      port: 5432,
      database: M3_PREVIEW_HYPERDRIVE.database,
      user: "runtime.user",
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

test("pins the concrete m3 preview deployment target", () => {
  assert.deepEqual(M3_PREVIEW_HYPERDRIVE, {
    appId: "m3-preview",
    environment: "m3-preview",
    name: "appbasis-m3-preview-db",
    database: "appbasis_m3_preview",
  });
  assert.equal(Object.isFrozen(M3_PREVIEW_HYPERDRIVE), true);
});

test("accepts only the dedicated direct m3 preview database", () => {
  assert.deepEqual(parseM3PreviewDatabaseUrl(DATABASE_URL), {
    scheme: "postgres",
    host: "ep-direct.example.neon.tech",
    port: 5432,
    database: "appbasis_m3_preview",
    user: "runtime.user",
    password: "runtime-password",
  });

  assert.throws(
    () =>
      parseM3PreviewDatabaseUrl(
        "postgresql://runtime.user:secret@ep-direct.example.neon.tech/appbasis_tasks_preview",
      ),
    /dedicated generated preview database/,
  );
  assert.throws(
    () =>
      parseM3PreviewDatabaseUrl(
        "postgresql://runtime.user:secret@ep-direct-pooler.example.neon.tech/appbasis_m3_preview",
      ),
    /direct Neon origin/,
  );
});

test("rejects frozen but malformed shared Hyperdrive targets", () => {
  const forgedTarget = Object.freeze({
    appId: "m3 preview",
    environment: "m3-preview",
    name: "appbasis-m3-preview-db",
    database: "appbasis_m3_preview",
  });

  assert.throws(
    () => parseGeneratedPreviewDatabaseUrl(DATABASE_URL, forgedTarget),
    /appId must match/,
  );
});

test("resolves only the exact cache-disabled m3 Hyperdrive target", async () => {
  const result = await resolveM3PreviewHyperdrive({
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
    name: M3_PREVIEW_HYPERDRIVE.name,
  });
  assert.equal(
    validateM3PreviewHyperdrive(targetConfig(), DATABASE_URL).id,
    TARGET_ID,
  );

  assert.throws(
    () =>
      validateM3PreviewHyperdrive(
        targetConfig({ name: "appbasis-tasks-minimal-preview" }),
        DATABASE_URL,
      ),
    /does not match the database binding contract/,
  );
});

test("fails closed when the dedicated m3 target is absent or ambiguous", async () => {
  for (const configs of [[], [targetConfig(), targetConfig({ id: "second" })]]) {
    await assert.rejects(
      resolveM3PreviewHyperdrive({
        accountId: ACCOUNT_ID,
        apiToken: API_TOKEN,
        databaseUrl: DATABASE_URL,
        fetchImpl: async () => apiResponse(configs),
      }),
      /not found|not unique/,
    );
  }
});

test("does not create a missing m3 Hyperdrive without explicit confirmation", async () => {
  let requestCount = 0;
  await assert.rejects(
    ensureM3PreviewHyperdrive({
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

test("creates only the dedicated cache-disabled m3 Hyperdrive when explicitly confirmed", async () => {
  const requests = [];
  const result = await ensureM3PreviewHyperdrive({
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

  assert.deepEqual(result, {
    id: TARGET_ID,
    name: M3_PREVIEW_HYPERDRIVE.name,
  });
  assert.equal(requests.length, 2);
  assert.equal(requests[1].options.method, "POST");
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    name: "appbasis-m3-preview-db",
    origin: {
      scheme: "postgres",
      host: "ep-direct.example.neon.tech",
      port: 5432,
      database: "appbasis_m3_preview",
      user: "runtime.user",
      password: "runtime-password",
    },
    caching: { disabled: true },
  });
});

test("reuses a valid existing m3 Hyperdrive without mutation", async () => {
  let requestCount = 0;
  const result = await ensureM3PreviewHyperdrive({
    accountId: ACCOUNT_ID,
    apiToken: API_TOKEN,
    databaseUrl: DATABASE_URL,
    apply: true,
    fetchImpl: async (_url, options) => {
      requestCount += 1;
      assert.equal(options.method, "GET");
      return apiResponse([targetConfig()]);
    },
  });

  assert.equal(result.id, TARGET_ID);
  assert.equal(requestCount, 1);
});
