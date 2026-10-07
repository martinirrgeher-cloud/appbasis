import { describe, expect, it } from "vitest";

import {
  createExerciseCatalogRuntimePreviewWorker,
  isExerciseCatalogWriteRequest,
} from "../worker/preview-exercise-catalog-runtime";

describe("ULC exercise catalog preview cutover gate", () => {
  it("fails closed for all exercise-catalog writes while preserving read-only paths", async () => {
    const delegated: string[] = [];
    const worker = createExerciseCatalogRuntimePreviewWorker(
      "legacy-read-writes-blocked",
      {
        async fetch(request) {
          delegated.push(request.method + " " + new URL(request.url).pathname);
          return Response.json({ delegated: true });
        },
      },
    );

    for (const [method, path] of [
      ["POST", "/api/modules/exercise-catalog"],
      ["POST", "/api/modules/exercise-catalog/exercise-1/update"],
      ["POST", "/api/modules/exercise-catalog/exercise-1/deactivate"],
      ["PUT", "/api/modules/exercise-catalog/exercise-1/favorite"],
      ["DELETE", "/api/modules/exercise-catalog/exercise-1/favorite"],
      ["POST", "/api/modules/exercise-catalog/import-apply"],
    ] as const) {
      const response = await worker.fetch(
        new Request("https://ulc.example.test" + path, { method }),
        {},
      );
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "EXERCISE_CATALOG_WRITE_QUIESCED" },
      });
    }

    const list = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/exercise-catalog"),
      {},
    );
    expect(list.status).toBe(200);

    const preview = await worker.fetch(
      new Request(
        "https://ulc.example.test/api/modules/exercise-catalog/import-preview",
        { method: "POST" },
      ),
      {},
    );
    expect(preview.status).toBe(200);
    expect(delegated).toEqual([
      "GET /api/modules/exercise-catalog",
      "POST /api/modules/exercise-catalog/import-preview",
    ]);
  });

  it("publishes the exact runtime mode and delegates standard-module writes", async () => {
    const worker = createExerciseCatalogRuntimePreviewWorker(
      "standard-module",
      {
        async fetch() {
          return new Response("delegated", { status: 202 });
        },
      },
    );

    const health = await worker.fetch(
      new Request(
        "https://ulc.example.test/api/health/exercise-catalog-runtime",
      ),
      {},
    );
    await expect(health.json()).resolves.toEqual({
      status: "ok",
      appId: "ulc-linz",
      exerciseCatalogRuntimeMode: "standard-module",
    });

    const write = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/exercise-catalog", {
        method: "POST",
      }),
      {},
    );
    expect(write.status).toBe(202);
  });

  it("treats future non-read methods under the catalog prefix as writes", () => {
    expect(
      isExerciseCatalogWriteRequest(
        new Request(
          "https://ulc.example.test/api/modules/exercise-catalog/future-route",
          { method: "PATCH" },
        ),
      ),
    ).toBe(true);
    expect(
      isExerciseCatalogWriteRequest(
        new Request("https://ulc.example.test/api/modules/exercise-catalog", {
          method: "GET",
        }),
      ),
    ).toBe(false);
  });
});
