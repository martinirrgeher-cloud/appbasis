import assert from "node:assert/strict";
import test from "node:test";

import { verifyGeneratedPreviewHealth } from "./generated-preview-smoke.mjs";

test("accepts only the expected generated app health response", async () => {
  let observedURL;
  let observedOptions;
  const result = await verifyGeneratedPreviewHealth({
    baseURL: "https://appbasis-tasks-minimal.example.test",
    appId: "tasks-minimal",
    fetchImpl: async (url, options) => {
      observedURL = url;
      observedOptions = options;
      return Response.json({ status: "ok", appId: "tasks-minimal" });
    },
  });

  assert.deepEqual(result, { status: "ok", appId: "tasks-minimal" });
  assert.equal(
    observedURL,
    "https://appbasis-tasks-minimal.example.test/api/health",
  );
  assert.equal(observedOptions.method, "GET");
  assert.equal(observedOptions.redirect, "error");
  assert.equal(observedOptions.headers.accept, "application/json");
  assert.ok(observedOptions.signal instanceof AbortSignal);
});

test("fails closed on an unexpected status without consuming response details", async () => {
  await assert.rejects(
    verifyGeneratedPreviewHealth({
      baseURL: "https://appbasis-tasks-minimal.example.test",
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
      baseURL: "https://appbasis-tasks-minimal.example.test",
      appId: "tasks-minimal",
      fetchImpl: async () =>
        Response.json({ status: "ok", appId: "different-app" }),
    }),
    /did not match the app/,
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
      baseURL: "https://appbasis-tasks-minimal.example.test",
      appId: "Tasks-Minimal",
      fetchImpl: async () => Response.json({ status: "ok" }),
    }),
    /appId must match/,
  );
  await assert.rejects(
    verifyGeneratedPreviewHealth({
      baseURL: "https://appbasis-tasks-minimal.example.test",
      appId: "tasks-minimal",
      timeoutMs: 30_001,
      fetchImpl: async () => Response.json({ status: "ok" }),
    }),
    /timeoutMs/,
  );
});

test("requires a real Response object from the smoke transport", async () => {
  await assert.rejects(
    verifyGeneratedPreviewHealth({
      baseURL: "https://appbasis-tasks-minimal.example.test",
      appId: "tasks-minimal",
      fetchImpl: async () => ({
        status: 200,
        json: async () => ({ status: "ok", appId: "tasks-minimal" }),
      }),
    }),
    /invalid response/,
  );
});
