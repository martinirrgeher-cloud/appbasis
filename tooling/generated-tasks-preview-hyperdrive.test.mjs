import assert from "node:assert/strict";
import test from "node:test";

import {
  ensureGeneratedTasksPreviewHyperdrive,
  GENERATED_TASKS_PREVIEW_HYPERDRIVE,
  parseGeneratedTasksPreviewDatabaseUrl,
  resolveGeneratedTasksPreviewHyperdrive,
  validateGeneratedTasksPreviewHyperdrive,
} from "./generated-tasks-preview-hyperdrive.mjs";

const ACCOUNT_ID = "0123456789abcdef0123456789abcdef";
const API_TOKEN = "cloudflare-test-token-000000000000";
const DATABASE_URL =
  "postgresql://runtime.user:runtime-password@ep-direct.example.neon.tech/appbasis_tasks_preview?sslmode=require";
const TARGET_ID = "abcdef0123456789abcdef0123456789";

function targetConfig(overrides = {}) {
  return {
    id: TARGET_ID,
    name: GENERATED_TASKS_PREVIEW_HYPERDRIVE.name,
    origin: {
      scheme: "postgresql",
      host: "ep-direct.example.neon.tech",
      port: 5432,
      database: "appbasis_tasks_preview",
      user: "runtime.user",
      ...(overrides.origin ?? {}),
    },
    caching: { disabled: true, ...(overrides.caching ?? {}) },
    ...Object.fromEntries(
      Object.entries(overrides).filter(([key]) => key !== "origin" && key !== "caching"),
    ),
  };
}

function apiResponse(result, resultInfo) {
  return Response.json({
    success: true,
    result,
    ...(resultInfo === undefined ? {} : { result_info: resultInfo }),
  });
}

test("parses only the dedicated direct PostgreSQL target", () => {
  assert.deepEqual(parseGeneratedTasksPreviewDatabaseUrl(DATABASE_URL), {
    scheme: "postgresql",
    host: "ep-direct.example.neon.tech",
    port: 5432,
    database: "appbasis_tasks_preview",
    user: "runtime.user",
    password: "runtime-password",
  });

  assert.throws(
    () =>
      parseGeneratedTasksPreviewDatabaseUrl(
        "postgresql://runtime.user:secret@ep-direct-pooler.example.neon.tech/appbasis_tasks_preview",
      ),
    /direct Neon origin/,
  );
  assert.throws(
    () =>
      parseGeneratedTasksPreviewDatabaseUrl(
        "postgresql://runtime.user:secret@ep-direct.example.neon.tech/neondb",
      ),
    /dedicated generated preview database/,
  );
  assert.throws(
    () =>
      parseGeneratedTasksPreviewDatabaseUrl(
        "postgresql://runtime.user:secret@ep-direct.example.neon.tech/appbasis_tasks_preview?database=neondb",
      ),
    /must not override the database/,
  );
});

test("resolves the exact cache-disabled target across paginated Cloudflare results", async () => {
  const observed = [];
  const result = await resolveGeneratedTasksPreviewHyperdrive({
    accountId: ACCOUNT_ID,
    apiToken: API_TOKEN,
    databaseUrl: DATABASE_URL,
    fetchImpl: async (url, options) => {
      observed.push({ url: String(url), options });
      const page = new URL(url).searchParams.get("page");
      if (page === "1") {
        return apiResponse(
          [{ id: "other", name: "other-hyperdrive", origin: {}, caching: {} }],
          { page: 1, per_page: 100, total_count: 2 },
        );
      }
      return apiResponse([targetConfig()], {
        page: 2,
        per_page: 100,
        total_count: 2,
      });
    },
  });

  assert.deepEqual(result, {
    id: TARGET_ID,
    name: GENERATED_TASKS_PREVIEW_HYPERDRIVE.name,
  });
  assert.equal(observed.length, 2);
  assert.equal(observed[0].options.method, "GET");
  assert.equal(observed[0].options.headers.authorization, `Bearer ${API_TOKEN}`);
});

test("fails closed for duplicate or mismatched existing targets", async () => {
  await assert.rejects(
    resolveGeneratedTasksPreviewHyperdrive({
      accountId: ACCOUNT_ID,
      apiToken: API_TOKEN,
      databaseUrl: DATABASE_URL,
      fetchImpl: async () => apiResponse([targetConfig(), targetConfig({ id: "second" })]),
    }),
    /not unique/,
  );

  for (const config of [
    targetConfig({ origin: { database: "neondb" } }),
    targetConfig({ origin: { host: "wrong.example.neon.tech" } }),
    targetConfig({ origin: { user: "wrong-user" } }),
    targetConfig({ caching: { disabled: false } }),
  ]) {
    assert.throws(
      () => validateGeneratedTasksPreviewHyperdrive(config, DATABASE_URL),
      /does not match the database binding contract/,
    );
  }
});

test("does not create a missing target without explicit confirmation", async () => {
  let requestCount = 0;
  await assert.rejects(
    ensureGeneratedTasksPreviewHyperdrive({
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

test("creates only the dedicated cache-disabled target when explicitly confirmed", async () => {
  const requests = [];
  const result = await ensureGeneratedTasksPreviewHyperdrive({
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
    name: GENERATED_TASKS_PREVIEW_HYPERDRIVE.name,
  });
  assert.equal(requests.length, 2);
  assert.equal(requests[1].options.method, "POST");
  const body = JSON.parse(requests[1].options.body);
  assert.deepEqual(body, {
    name: GENERATED_TASKS_PREVIEW_HYPERDRIVE.name,
    origin: {
      scheme: "postgresql",
      host: "ep-direct.example.neon.tech",
      port: 5432,
      database: "appbasis_tasks_preview",
      user: "runtime.user",
      password: "runtime-password",
    },
    caching: { disabled: true },
  });
});

test("valid existing target is idempotently reused without POST", async () => {
  let requestCount = 0;
  const result = await ensureGeneratedTasksPreviewHyperdrive({
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

test("Cloudflare failures stay generic and never echo provider response bodies", async () => {
  await assert.rejects(
    resolveGeneratedTasksPreviewHyperdrive({
      accountId: ACCOUNT_ID,
      apiToken: API_TOKEN,
      databaseUrl: DATABASE_URL,
      fetchImpl: async () =>
        Response.json(
          { success: false, errors: [{ message: DATABASE_URL }] },
          { status: 403 },
        ),
    }),
    (error) => {
      assert.match(error.message, /rejected the request/);
      assert.equal(error.message.includes("runtime-password"), false);
      return true;
    },
  );
});
