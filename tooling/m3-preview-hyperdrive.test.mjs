import assert from "node:assert/strict";
import test from "node:test";

import {
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
      Object.entries(overrides).filter(([key]) => key !== "origin" && key !== "caching"),
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
