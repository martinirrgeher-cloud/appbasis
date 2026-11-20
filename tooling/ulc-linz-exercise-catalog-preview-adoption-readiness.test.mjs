import assert from "node:assert/strict";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { planUlcExerciseCatalogPreviewAdoptionReadiness } from "./ulc-linz-exercise-catalog-preview-adoption-readiness.mjs";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("P1: obsolete E6G-C3A v2 adoption must not replay against published catalog v5", async () => {
  await assert.rejects(
    planUlcExerciseCatalogPreviewAdoptionReadiness({ repositoryRoot }),
    /FC6-B baseline migration contains a statement without a verifiable catalog marker/,
  );
});
