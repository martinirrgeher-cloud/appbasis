import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  ULC_LINZ_D4_PREVIEW_ACCEPTANCE_RUNS,
  deriveUlcLinzD4PreviewAcceptanceEvidence,
} from "./ulc-linz-d4-preview-acceptance-evidence.mjs";

const repositoryRoot = process.cwd();
const currentDefinition = JSON.parse(
  await readFile(join(repositoryRoot, "apps/ulc-linz/appbasis.app.json"), "utf8"),
);
const acceptedCountdownDefinition = Object.freeze({
  ...currentDefinition,
  modules: Object.freeze(["countdown"]),
});

function successfulFetch() {
  return async (url) => {
    const id = Number(String(url).split("/").at(-1));
    const expected = Object.values(ULC_LINZ_D4_PREVIEW_ACCEPTANCE_RUNS).find(
      (entry) => entry.id === id,
    );
    if (expected === undefined) return { ok: false };
    return {
      ok: true,
      headers: { get: () => "application/json; charset=utf-8" },
      async json() {
        return {
          id: expected.id,
          run_attempt: expected.attempt,
          name: expected.name,
          path: expected.path,
          event: expected.event,
          head_branch: expected.branch,
          head_sha: expected.headSha,
          status: "completed",
          conclusion: "success",
          repository: { full_name: "martinirrgeher-cloud/appbasis" },
        };
      },
    };
  };
}

test("ULC D4 acceptance remains valid only for the accepted countdown-only definition", async () => {
  assert.deepEqual(
    await deriveUlcLinzD4PreviewAcceptanceEvidence(
      repositoryRoot,
      acceptedCountdownDefinition,
      { fetchImpl: successfulFetch() },
    ),
    { previewAccepted: true },
  );

  assert.deepEqual(
    await deriveUlcLinzD4PreviewAcceptanceEvidence(
      repositoryRoot,
      currentDefinition,
      { fetchImpl: successfulFetch() },
    ),
    {},
  );
});

test("ULC D4 acceptance fails closed on run or app-definition drift", async () => {
  assert.deepEqual(
    await deriveUlcLinzD4PreviewAcceptanceEvidence(
      repositoryRoot,
      acceptedCountdownDefinition,
      { fetchImpl: async () => ({ ok: false }) },
    ),
    {},
  );
  assert.deepEqual(
    await deriveUlcLinzD4PreviewAcceptanceEvidence(
      repositoryRoot,
      { ...acceptedCountdownDefinition, modules: ["tasks"] },
      { fetchImpl: successfulFetch() },
    ),
    {},
  );
});
