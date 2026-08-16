import assert from "node:assert/strict";
import test from "node:test";

import { verifyGeneratedPreviewDatabaseBinding } from "./generated-preview-database-smoke.mjs";

const BASE_URL = "https://appbasis-tasks-minimal.example.test";
const TASKS_APP_ID = "tasks-minimal";

test("probes the explicit generated preview database health route", async () => {
  let observedURL;
  let observedOptions;
  const result = await verifyGeneratedPreviewDatabaseBinding({
    baseURL: BASE_URL,
    appId: TASKS_APP_ID,
    fetchImpl: async (url, options) => {
      observedURL = url;
      observedOptions = options;
      return Response.json({
        status: "ok",
        appId: TASKS_APP_ID,
        database: "reachable",
      });
    },
  });

  assert.deepEqual(result, {
    status: "database-reachable",
    appId: TASKS_APP_ID,
  });
  assert.equal(observedURL, `${BASE_URL}/api/health/database`);
  assert.equal(observedOptions.method, "GET");
  assert.equal(observedOptions.redirect, "error");
  assert.equal(observedOptions.headers.accept, "application/json");
  assert.equal("cookie" in observedOptions.headers, false);
  assert.equal("authorization" in observedOptions.headers, false);
  assert.ok(observedOptions.signal instanceof AbortSignal);
});

test("accepts the selected m3-preview application only when the payload matches", async () => {
  const result = await verifyGeneratedPreviewDatabaseBinding({
    baseURL: "https://appbasis-m3-preview.example.test",
    appId: "m3-preview",
    fetchImpl: async () =>
      Response.json({
        status: "ok",
        appId: "m3-preview",
        database: "reachable",
      }),
  });
  assert.deepEqual(result, {
    status: "database-reachable",
    appId: "m3-preview",
  });

  await assert.rejects(
    verifyGeneratedPreviewDatabaseBinding({
      baseURL: "https://appbasis-m3-preview.example.test",
      appId: "m3-preview",
      fetchImpl: async () =>
        Response.json({
          status: "ok",
          appId: TASKS_APP_ID,
          database: "reachable",
        }),
    }),
    /invalid payload/,
  );
});

test("fails closed when the Worker reports database unavailability", async () => {
  for (const response of [
    Response.json(
      {
        error: {
          code: "DATABASE_NOT_CONFIGURED",
          message: "The generated preview database is unavailable.",
        },
      },
      { status: 503 },
    ),
    Response.json(
      {
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "The generated preview database is unavailable.",
        },
      },
      { status: 503 },
    ),
  ]) {
    await assert.rejects(
      verifyGeneratedPreviewDatabaseBinding({
        baseURL: BASE_URL,
        appId: TASKS_APP_ID,
        fetchImpl: async () => response,
      }),
      /database health probe did not succeed/,
    );
  }
});

test("requires the exact database-health success payload without session side effects", async () => {
  await assert.rejects(
    verifyGeneratedPreviewDatabaseBinding({
      baseURL: BASE_URL,
      appId: TASKS_APP_ID,
      fetchImpl: async () =>
        Response.json({
          status: "ok",
          appId: TASKS_APP_ID,
          database: "unknown",
        }),
    }),
    /invalid payload/,
  );

  await assert.rejects(
    verifyGeneratedPreviewDatabaseBinding({
      baseURL: BASE_URL,
      appId: TASKS_APP_ID,
      fetchImpl: async () =>
        Response.json(
          {
            status: "ok",
            appId: TASKS_APP_ID,
            database: "reachable",
          },
          { headers: { "set-cookie": "unexpected=session" } },
        ),
    }),
    /unexpectedly established a session/,
  );
});

test("keeps the timeout active while the response body is consumed", async () => {
  const verification = verifyGeneratedPreviewDatabaseBinding({
    baseURL: BASE_URL,
    appId: TASKS_APP_ID,
    timeoutMs: 10,
    fetchImpl: async (_url, options) => {
      const body = new ReadableStream({
        start(controller) {
          options.signal.addEventListener(
            "abort",
            () => controller.error(new Error("aborted")),
            { once: true },
          );
        },
      });
      return new Response(body, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  const watchdog = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("database smoke watchdog expired")), 250);
  });

  await assert.rejects(
    Promise.race([verification, watchdog]),
    /database health probe returned invalid JSON/,
  );
});

test("rejects invalid app IDs, non-canonical origins, invalid transports and excessive timeouts", async () => {
  await assert.rejects(
    verifyGeneratedPreviewDatabaseBinding({
      baseURL: BASE_URL,
      appId: "Not Valid",
      fetchImpl: async () => Response.json({}),
    }),
    /appId must match/,
  );
  await assert.rejects(
    verifyGeneratedPreviewDatabaseBinding({
      baseURL: "http://appbasis-tasks-minimal.example.test",
      appId: TASKS_APP_ID,
      fetchImpl: async () => Response.json({}),
    }),
    /canonical HTTPS origin/,
  );
  await assert.rejects(
    verifyGeneratedPreviewDatabaseBinding({
      baseURL: BASE_URL,
      appId: TASKS_APP_ID,
      fetchImpl: null,
    }),
    /fetchImpl must be a function/,
  );
  await assert.rejects(
    verifyGeneratedPreviewDatabaseBinding({
      baseURL: BASE_URL,
      appId: TASKS_APP_ID,
      timeoutMs: 30_001,
      fetchImpl: async () => Response.json({}),
    }),
    /timeoutMs/,
  );
});
