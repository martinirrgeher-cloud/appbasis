import assert from "node:assert/strict";
import test from "node:test";

import {
  verifyUlcExerciseCatalogPreviewRuntime,
} from "./ulc-linz-exercise-catalog-preview-runtime-smoke.mjs";

const BASE_URL = "https://appbasis-ulc-linz.example.workers.dev";

test("C3C runtime smoke tolerates stale 404s until the new Worker version propagates", async () => {
  const responses = [
    new Response("not found", { status: 404 }),
    Response.json({
      status: "ok",
      appId: "ulc-linz",
      exerciseCatalogRuntimeMode: "legacy",
    }),
    Response.json({
      status: "ok",
      appId: "ulc-linz",
      exerciseCatalogRuntimeMode: "legacy-read-writes-blocked",
    }),
  ];
  let sleeps = 0;
  const result = await verifyUlcExerciseCatalogPreviewRuntime({
    baseURL: BASE_URL,
    expectedMode: "legacy-read-writes-blocked",
    attempts: 5,
    delayMs: 0,
    timeoutMs: 1_000,
    sleep: async () => {
      sleeps += 1;
    },
    fetchImpl: async () => responses.shift(),
  });

  assert.equal(result.status, "preview-runtime-ready");
  assert.equal(result.exerciseCatalogRuntimeMode, "legacy-read-writes-blocked");
  assert.equal(result.attempt, 3);
  assert.equal(sleeps, 2);
});

test("C3C runtime smoke accepts the standard-module runtime only after an exact health payload", async () => {
  const result = await verifyUlcExerciseCatalogPreviewRuntime({
    baseURL: BASE_URL,
    expectedMode: "standard-module",
    attempts: 1,
    delayMs: 0,
    timeoutMs: 1_000,
    sleep: async () => {},
    fetchImpl: async () =>
      Response.json({
        status: "ok",
        appId: "ulc-linz",
        exerciseCatalogRuntimeMode: "standard-module",
      }),
  });

  assert.deepEqual(result, {
    status: "preview-runtime-ready",
    appId: "ulc-linz",
    exerciseCatalogRuntimeMode: "standard-module",
    attempt: 1,
  });
});

test("C3C runtime smoke fails closed when the expected runtime never appears", async () => {
  await assert.rejects(
    verifyUlcExerciseCatalogPreviewRuntime({
      baseURL: BASE_URL,
      expectedMode: "legacy-read-writes-blocked",
      attempts: 2,
      delayMs: 0,
      timeoutMs: 1_000,
      sleep: async () => {},
      fetchImpl: async () =>
        Response.json({
          status: "ok",
          appId: "ulc-linz",
          exerciseCatalogRuntimeMode: "legacy",
        }),
    }),
    /did not converge to legacy-read-writes-blocked.*mode=legacy/,
  );
});

test("C3C runtime smoke rejects non-canonical targets and unsupported modes", async () => {
  await assert.rejects(
    verifyUlcExerciseCatalogPreviewRuntime({
      baseURL: "http://example.test",
      expectedMode: "legacy-read-writes-blocked",
    }),
    /canonical HTTPS origin/,
  );
  await assert.rejects(
    verifyUlcExerciseCatalogPreviewRuntime({
      baseURL: BASE_URL,
      expectedMode: "legacy",
    }),
    /expected mode is invalid/,
  );
});
