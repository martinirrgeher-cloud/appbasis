import assert from "node:assert/strict";
import test from "node:test";

import { verifyGeneratedPreviewDatabaseBinding } from "./generated-preview-database-smoke.mjs";

const BASE_URL = "https://appbasis-tasks-minimal.example.test";

test("forces a protected request through the configured database runtime", async () => {
  let observedURL;
  let observedOptions;
  const result = await verifyGeneratedPreviewDatabaseBinding({
    baseURL: BASE_URL,
    fetchImpl: async (url, options) => {
      observedURL = url;
      observedOptions = options;
      return Response.json(
        {
          error: {
            code: "SESSION_INVALID",
            message: "A valid session is required.",
          },
        },
        { status: 401 },
      );
    },
  });

  assert.deepEqual(result, { status: "database-session-miss" });
  assert.equal(observedURL, `${BASE_URL}/api/tasks`);
  assert.equal(observedOptions.method, "GET");
  assert.equal(observedOptions.redirect, "error");
  assert.equal(observedOptions.headers.accept, "application/json");
  assert.equal(
    observedOptions.headers.cookie,
    "appbasis.session=generated-preview-database-binding-missing-session",
  );
  assert.equal("authorization" in observedOptions.headers, false);
  assert.ok(observedOptions.signal instanceof AbortSignal);
});

test("fails closed when the database-bound request cannot complete", async () => {
  await assert.rejects(
    verifyGeneratedPreviewDatabaseBinding({
      baseURL: BASE_URL,
      fetchImpl: async () =>
        Response.json(
          { error: { code: "INTERNAL_ERROR", message: "failed" } },
          { status: 500 },
        ),
    }),
    /unexpected status/,
  );
});

test("requires the exact missing-session response without establishing a session", async () => {
  await assert.rejects(
    verifyGeneratedPreviewDatabaseBinding({
      baseURL: BASE_URL,
      fetchImpl: async () =>
        Response.json(
          {
            error: {
              code: "PERMISSION_DENIED",
              message: "A valid session is required.",
            },
          },
          { status: 401 },
        ),
    }),
    /did not fail closed after session lookup/,
  );

  await assert.rejects(
    verifyGeneratedPreviewDatabaseBinding({
      baseURL: BASE_URL,
      fetchImpl: async () =>
        Response.json(
          {
            error: {
              code: "SESSION_INVALID",
              message: "A valid session is required.",
            },
          },
          {
            status: 401,
            headers: { "set-cookie": "appbasis.session=unexpected" },
          },
        ),
    }),
    /unexpectedly established a session/,
  );
});

test("keeps the timeout active while the response body is consumed", async () => {
  const verification = verifyGeneratedPreviewDatabaseBinding({
    baseURL: BASE_URL,
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
        status: 401,
        headers: { "content-type": "application/json" },
      });
    },
  });
  const watchdog = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("database smoke watchdog expired")), 250);
  });

  await assert.rejects(
    Promise.race([verification, watchdog]),
    /database-bound runtime returned invalid JSON/,
  );
});

test("rejects non-canonical origins, invalid transports and excessive timeouts", async () => {
  await assert.rejects(
    verifyGeneratedPreviewDatabaseBinding({
      baseURL: "http://appbasis-tasks-minimal.example.test",
      fetchImpl: async () => Response.json({}),
    }),
    /canonical HTTPS origin/,
  );
  await assert.rejects(
    verifyGeneratedPreviewDatabaseBinding({
      baseURL: BASE_URL,
      fetchImpl: null,
    }),
    /fetchImpl must be a function/,
  );
  await assert.rejects(
    verifyGeneratedPreviewDatabaseBinding({
      baseURL: BASE_URL,
      timeoutMs: 30_001,
      fetchImpl: async () => Response.json({}),
    }),
    /timeoutMs/,
  );
});
