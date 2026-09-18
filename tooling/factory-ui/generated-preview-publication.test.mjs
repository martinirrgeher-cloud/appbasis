import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  GENERATED_PREVIEW_PUBLICATION_FILES,
  gitBlobSha,
  verifyGeneratedPreviewPublishedOnMain,
} from "./generated-preview-publication.mjs";

async function createPublicationFixture(t) {
  const root = await mkdtemp(join(tmpdir(), "appbasis-preview-publication-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  for (const relativePath of GENERATED_PREVIEW_PUBLICATION_FILES) {
    const path = join(root, "apps", "checklist", ...relativePath.split("/"));
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, `${relativePath}\n`);
  }
  return root;
}

async function exactTree(root) {
  const tree = [];
  for (const relativePath of GENERATED_PREVIEW_PUBLICATION_FILES) {
    const source = await readFile(
      join(root, "apps", "checklist", ...relativePath.split("/")),
    );
    tree.push({
      path: `apps/checklist/${relativePath}`,
      type: "blob",
      sha: gitBlobSha(source),
    });
  }
  return tree;
}

test("accepts only an exact published main-tree match for every preview artifact", async (t) => {
  const root = await createPublicationFixture(t);
  const tree = await exactTree(root);

  const result = await verifyGeneratedPreviewPublishedOnMain(
    root,
    "checklist",
    {
      fetchImpl: async (_url, options) => {
        assert.equal(options.method, "GET");
        assert.equal(options.redirect, "error");
        assert.equal(
          options.headers.accept,
          "application/vnd.github+json",
        );
        assert.ok(options.signal instanceof AbortSignal);
        return Response.json({ truncated: false, tree });
      },
    },
  );

  assert.equal(result, true);
});

test("fails closed on stale, missing, truncated or unavailable publication evidence", async (t) => {
  const root = await createPublicationFixture(t);
  const tree = await exactTree(root);

  const stale = tree.map((entry, index) =>
    index === 0 ? { ...entry, sha: "0".repeat(40) } : entry,
  );
  assert.equal(
    await verifyGeneratedPreviewPublishedOnMain(root, "checklist", {
      fetchImpl: async () =>
        Response.json({ truncated: false, tree: stale }),
    }),
    false,
  );

  assert.equal(
    await verifyGeneratedPreviewPublishedOnMain(root, "checklist", {
      fetchImpl: async () =>
        Response.json({ truncated: false, tree: tree.slice(1) }),
    }),
    false,
  );

  assert.equal(
    await verifyGeneratedPreviewPublishedOnMain(root, "checklist", {
      fetchImpl: async () =>
        Response.json({ truncated: true, tree }),
    }),
    false,
  );

  assert.equal(
    await verifyGeneratedPreviewPublishedOnMain(root, "checklist", {
      fetchImpl: async () =>
        Response.json({ message: "unavailable" }, { status: 503 }),
    }),
    false,
  );
});
