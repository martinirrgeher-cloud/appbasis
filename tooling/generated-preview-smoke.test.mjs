import assert from "node:assert/strict";
import test from "node:test";

import {
  verifyGeneratedPreviewHealth,
  verifyGeneratedPreviewRuntimeBoundary,
} from "./generated-preview-smoke.mjs";

const BASE_URL = "https://appbasis-tasks-minimal.example.test";

test("accepts only the expected generated app health response", async () => {
  let observedURL;
  let observedOptions;
  const result = await verifyGeneratedPreviewHealth({
    baseURL: BASE_URL,
    appId: "tasks-minimal",
    fetchImpl: async (url, options) => {
      observedURL = url;
      observedOptions = options;
      return Response.json({ status: "ok", appId: "tasks-minimal" });
    },
  });

  assert.deepEqual(result, { status: "ok", appId: "tasks-minimal" });
  assert.equal(observedURL, `${BASE_URL}/api/health`);
  assert.equal(observedOptions.method, "GET");
  assert.equal(observedOptions.redirect, "error");
  assert.equal(observedOptions.headers.accept, "application/json");
  assert.ok(observedOptions.signal instanceof AbortSignal);
});

test("fails closed on an unexpected health status without consuming response details", async () => {
  await assert.rejects(
    verifyGeneratedPreviewHealth({
      baseURL: BASE_URL,
      appId: "tasks-minimal",
      fetchImpl: async () =>
        Response.json(
          { error: "postgres://user:password@example.test/database" },
          { status: 503 },
        ),
    }),
    /unexpected status/,
  );
});

test("fails closed when health belongs to a different app", async () => {
  await assert.rejects(
    verifyGeneratedPreviewHealth({
      baseURL: BASE_URL,
      appId: "tasks-minimal",
      fetchImpl: async () =>
        Response.json({ status: "ok", appId: "different-app" }),
    }),
    /did not match the app/,
  );
});

test("accepts the protected runtime only when it denies an anonymous tasks request", async () => {
  let observedURL;
  let observedOptions;
  const result = await verifyGeneratedPreviewRuntimeBoundary({
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

  assert.deepEqual(result, { status: "session-required" });
  assert.equal(observedURL, `${BASE_URL}/api/tasks`);
  assert.equal(observedOptions.method, "GET");
  assert.equal(observedOptions.redirect, "error");
  assert.deepEqual(observedOptions.headers, { accept: "application/json" });
  assert.equal("cookie" in observedOptions.headers, false);
  assert.equal("authorization" in observedOptions.headers, false);
  assert.ok(observedOptions.signal instanceof AbortSignal);
});

test("protected runtime smoke rejects an unexpected status without exposing response details", async () => {
  await assert.rejects(
    verifyGeneratedPreviewRuntimeBoundary({
      baseURL: BASE_URL,
      fetchImpl: async () =>
        Response.json(
          { error: "postgres://user:password@example.test/database" },
          { status: 500 },
        ),
    }),
    /protected runtime returned an unexpected status/,
  );
});

test("protected runtime smoke requires the exact fail-closed session error", async () => {
  await assert.rejects(
    verifyGeneratedPreviewRuntimeBoundary({
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
    /did not fail closed at the session boundary/,
  );

  await assert.rejects(
    verifyGeneratedPreviewRuntimeBoundary({
      baseURL: BASE_URL,
      fetchImpl: async () =>
        Response.json(
          {
            error: {
              code: "SESSION_INVALID",
              message: "A valid session is required.",
              details: "unexpected",
            },
          },
          { status: 401 },
        ),
    }),
    /did not fail closed at the session boundary/,
  );
});

test("protected runtime smoke rejects a response that establishes a session", async () => {
  await assert.rejects(
    verifyGeneratedPreviewRuntimeBoundary({
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
            headers: { "set-cookie": "appbasis_session=unexpected" },
          },
        ),
    }),
    /unexpectedly established a session/,
  );
});

test("rejects non-canonical origins, invalid app ids and excessive timeouts", async () => {
  await assert.rejects(
    verifyGeneratedPreviewHealth({
      baseURL: "http://appbasis-tasks-minimal.example.test",
      appId: "tasks-minimal",
      fetchImpl: async () => Response.json({ status: "ok" }),
    }),
    /canonical HTTPS origin/,
  );
  await assert.rejects(
    verifyGeneratedPreviewHealth({
      baseURL: BASE_URL,
      appId: "Tasks-Minimal",
      fetchImpl: async () => Response.json({ status: "ok" }),
    }),
    /appId must match/,
  );
  await assert.rejects(
    verifyGeneratedPreviewRuntimeBoundary({
      baseURL: BASE_URL,
      timeoutMs: 30_001,
      fetchImpl: async () => Response.json({ status: "ok" }),
    }),
    /timeoutMs/,
  );
});

test("requires a real Response object from the smoke transport", async () => {
  await assert.rejects(
    verifyGeneratedPreviewHealth({
      baseURL: BASE_URL,
      appId: "tasks-minimal",
      fetchImpl: async () => ({
        status: 200,
        json: async () => ({ status: "ok", appId: "tasks-minimal" }),
      }),
    }),
    /invalid response/,
  );

  await assert.rejects(
    verifyGeneratedPreviewRuntimeBoundary({
      baseURL: BASE_URL,
      fetchImpl: async () => ({ status: 401 }),
    }),
    /invalid response/,
  );
});
