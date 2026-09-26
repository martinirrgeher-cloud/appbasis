import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  ULC_LINZ_D4_PREVIEW_ACCEPTANCE_RUNS,
  deriveUlcLinzD4PreviewAcceptanceEvidence,
} from "./ulc-linz-d4-preview-acceptance-evidence.mjs";

const repositoryRoot = process.cwd();
const definition = JSON.parse(
  await readFile(join(repositoryRoot, "apps/ulc-linz/appbasis.app.json"), "utf8"),
);

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

test("ULC D4 acceptance requires the exact deploy, access and operator acceptance record", async () => {
  assert.deepEqual(
    await deriveUlcLinzD4PreviewAcceptanceEvidence(repositoryRoot, definition, {
      fetchImpl: successfulFetch(),
    }),
    { previewAccepted: true },
  );
});

test("ULC D4 acceptance fails closed on run or app-definition drift", async () => {
  assert.deepEqual(
    await deriveUlcLinzD4PreviewAcceptanceEvidence(repositoryRoot, definition, {
      fetchImpl: async () => ({ ok: false }),
    }),
    {},
  );
  assert.deepEqual(
    await deriveUlcLinzD4PreviewAcceptanceEvidence(
      repositoryRoot,
      { ...definition, modules: ["tasks"] },
      { fetchImpl: successfulFetch() },
    ),
    {},
  );
});
