import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  PREVIEW_EXERCISE_CATEGORY_KEY,
  readUlcTrainingPlansPreviewAcceptanceEnvironment,
  UlcTrainingPlansPreviewAcceptanceError,
} from "./ulc-linz-training-plans-preview-acceptance.mjs";

const repositoryRoot = resolve(
  fileURLToPath(new URL("../", import.meta.url)),
);

test("E7B9 acceptance requires only the isolated preview origin and protected preview-admin credential", () => {
  assert.deepEqual(
    readUlcTrainingPlansPreviewAcceptanceEnvironment({
      APPBASIS_GENERATED_PREVIEW_URL:
        "https://appbasis-ulc-linz.example.workers.dev",
      APPBASIS_PREVIEW_USER_PASSWORD: "protected-preview-password",
    }),
    {
      baseURL:
        "https://appbasis-ulc-linz.example.workers.dev",
      username: "preview.admin",
      password: "protected-preview-password",
    },
  );

  assert.throws(
    () =>
      readUlcTrainingPlansPreviewAcceptanceEnvironment({
        APPBASIS_GENERATED_PREVIEW_URL:
          "https://appbasis-ulc-linz.example.workers.dev",
      }),
    UlcTrainingPlansPreviewAcceptanceError,
  );
  assert.throws(
    () =>
      readUlcTrainingPlansPreviewAcceptanceEnvironment({
        APPBASIS_GENERATED_PREVIEW_URL:
          "http://appbasis-ulc-linz.example.workers.dev",
        APPBASIS_PREVIEW_USER_PASSWORD: "x",
      }),
    /canonical HTTPS origin/,
  );
});


test("E7B9 acceptance fixture uses a configured ULC exercise category", async () => {
  const domainSource = await readFile(
    resolve(
      repositoryRoot,
      "apps/ulc-linz/worker/exercise-catalog-domain.ts",
    ),
    "utf8",
  );

  assert.ok(
    domainSource.includes(
      `{ key: "${PREVIEW_EXERCISE_CATEGORY_KEY}", label:`,
    ),
    "Acceptance exercise category must exist in the ULC catalog definition.",
  );
});

test("E7B9 acceptance uses only public HTTP contracts and never accepts client-owned organization scope", async () => {
  const source = await readFile(
    resolve(
      repositoryRoot,
      "tooling/ulc-linz-training-plans-preview-acceptance.mjs",
    ),
    "utf8",
  );

  for (const route of [
    "/api/auth/sign-in",
    "/api/modules/kindertraining",
    "/api/modules/kindertraining/session",
    "/api/modules/athletes/masterdata/athletes",
    "/api/modules/athletes/masterdata/athlete-group-memberships",
    "/api/modules/exercise-catalog",
    "/api/modules/training-blocks",
    "/api/modules/training-plans",
    "/api/modules/training-plans/week",
    "/api/modules/training-plans/block-templates",
  ]) {
    assert.match(source, new RegExp(route.replaceAll("/", "\\/")));
  }
  assert.doesNotMatch(source, /organizationId\s*:/);
  assert.match(source, /TRAINING_PLAN_CONFLICT/);
  assert.match(source, /sourceBlockRevision !== 1/);
  assert.match(source, /usageCount/);
  assert.match(source, /lastUsedAt/);
  assert.match(source, /status === "present"/);
  assert.match(source, /currentRevision !== 1/);
});
