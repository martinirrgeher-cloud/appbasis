import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(
  new URL("../.github/workflows/reference-preview-smoke.yml", import.meta.url),
  "utf8",
);

test("automates the full demo.user smoke after successful main preview deploys", () => {
  assert.match(workflow, /workflow_run:\n\s+workflows:\n\s+- Reference Preview Deploy/);
  assert.match(workflow, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /github\.event\.workflow_run\.head_branch == 'main'/);
  assert.match(workflow, /APPBASIS_SMOKE_USERNAME: demo\.user/);
  assert.match(workflow, /Run automated Demo v0\.1 acceptance smoke/);
  assert.match(workflow, /APPBASIS_SMOKE_MUTATE: '1'/);
});

test("self-validates smoke workflow changes on main and preserves manual dispatch", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /push:\n\s+branches:\n\s+- main\n\s+paths:/);
  assert.match(workflow, /\.github\/workflows\/reference-preview-smoke\.yml/);
  assert.match(workflow, /tooling\/reference-preview-smoke\.mjs/);
  assert.match(workflow, /inputs\.mutate && '1' \|\| '0'/);
});

test("serializes mutating preview smoke runs", () => {
  assert.match(workflow, /group: reference-preview-smoke/);
  assert.match(workflow, /cancel-in-progress: false/);
});
