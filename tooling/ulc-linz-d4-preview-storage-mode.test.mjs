import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveUlcPreviewExerciseCatalogStorageMode,
  UlcPreviewExerciseCatalogStorageModeError,
} from "./ulc-linz-d4-preview-storage-mode.mjs";

const origin = "https://appbasis-ulc-linz.example.workers.dev";

test("preserves an explicit deployed exercise-catalog storage mode", async () => {
  const requests = [];
  const mode = await resolveUlcPreviewExerciseCatalogStorageMode(
    { baseURL: origin },
    {
      async fetchImpl(url) {
        requests.push(url.toString());
        return Response.json({
          status: "ok",
          appId: "ulc-linz",
          exerciseCatalogStorageMode: "standard",
        });
      },
    },
  );
  assert.equal(mode, "standard");
  assert.deepEqual(requests, [
    origin + "/api/health/exercise-catalog-storage",
  ]);
});

test("maps the one-time pre-C3C worker to legacy only after canonical base health", async () => {
  const requests = [];
  const mode = await resolveUlcPreviewExerciseCatalogStorageMode(
    { baseURL: origin },
    {
      async fetchImpl(url) {
        requests.push(url.toString());
        if (url.pathname.endsWith("exercise-catalog-storage")) {
          return new Response("", { status: 404 });
        }
        return Response.json({ status: "ok", appId: "ulc-linz" });
      },
    },
  );
  assert.equal(mode, "legacy");
  assert.deepEqual(requests, [
    origin + "/api/health/exercise-catalog-storage",
    origin + "/api/health",
  ]);
});

test("fails closed on unknown modes or non-canonical bootstrap workers", async () => {
  await assert.rejects(
    resolveUlcPreviewExerciseCatalogStorageMode(
      { baseURL: origin },
      {
        async fetchImpl() {
          return Response.json({
            status: "ok",
            appId: "ulc-linz",
            exerciseCatalogStorageMode: "target",
          });
        },
      },
    ),
    UlcPreviewExerciseCatalogStorageModeError,
  );

  await assert.rejects(
    resolveUlcPreviewExerciseCatalogStorageMode(
      { baseURL: origin },
      {
        async fetchImpl(url) {
          if (url.pathname.endsWith("exercise-catalog-storage")) {
            return new Response("", { status: 404 });
          }
          return Response.json({ status: "ok", appId: "other-app" });
        },
      },
    ),
    /not the canonical ULC worker/,
  );
});
