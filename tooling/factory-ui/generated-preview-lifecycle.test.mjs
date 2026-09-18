import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createGeneratedDatabaseManifest } from "../generated-database-manifest.mjs";
import { deriveGeneratedPreviewLifecycle } from "./generated-preview-lifecycle.mjs";
import {
  GENERATED_PREVIEW_PUBLICATION_FILES,
  GENERATED_PREVIEW_ROOT_PUBLICATION_FILES,
  gitBlobSha,
} from "./generated-preview-publication.mjs";

async function createPreviewFixture(t) {
  const root = await mkdtemp(join(tmpdir(), "appbasis-factory-preview-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  const appRoot = join(root, "apps", "checklist");
  await mkdir(join(appRoot, "worker"), { recursive: true });
  await mkdir(join(root, "modules", "tasks"), { recursive: true });
  await mkdir(join(root, ".github", "workflows"), { recursive: true });
  await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  await writeFile(
    join(root, ".github", "workflows", "generated-app-preview-lifecycle.yml"),
    "name: Generated App Preview Lifecycle\n",
  );

  const definition = {
    schemaVersion: 2,
    appId: "checklist",
    displayName: "Checklist",
    modules: ["tasks"],
    platformServices: ["identity", "permissions"],
  };

  await writeFile(
    join(appRoot, "appbasis.app.json"),
    `${JSON.stringify(definition, null, 2)}\n`,
  );
  await writeFile(
    join(appRoot, "appbasis.theme.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        brandMark: "CL",
        accentColor: "#0f766e",
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(appRoot, "package.json"),
    `${JSON.stringify({ name: "@appbasis/app-checklist" }, null, 2)}\n`,
  );
  await writeFile(
    join(appRoot, "appbasis.database.json"),
    `${JSON.stringify(createGeneratedDatabaseManifest(definition), null, 2)}\n`,
  );
  await writeFile(
    join(appRoot, "worker", "index.ts"),
    "export function createGeneratedWorker() {}\n",
  );
  await writeFile(
    join(appRoot, "worker", "ui.ts"),
    "export function generatedUiResponse() {}\n",
  );
  await writeFile(
    join(appRoot, "worker", "preview.ts"),
    'export function createGeneratedPreviewWorker() {}\nconst path = "/api/health/database";\n',
  );

  return { root, definition };
}


const HEAD = "a".repeat(40);

function previewRun(operation, id, startedAt, completedAt) {
  return {
    id,
    name: "Generated App Preview Lifecycle",
    path: ".github/workflows/generated-app-preview-lifecycle.yml",
    display_title: `Generated Preview · checklist · ${operation}`,
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: HEAD,
    run_attempt: 1,
    status: "completed",
    conclusion: "success",
    run_started_at: startedAt,
    updated_at: completedAt,
    repository: { full_name: "martinirrgeher-cloud/appbasis" },
  };
}

function cleanRepositoryStateImpl(headSha = HEAD) {
  return async () => ({ status: "clean", headSha });
}

function runEvidenceUnavailableFetch() {
  return async (url) => {
    if (url.endsWith("/branches/main")) {
      return Response.json({ commit: { sha: HEAD } });
    }
    if (url.includes("/actions/workflows/generated-app-preview-lifecycle.yml/runs")) {
      return Response.json({ message: "unavailable" }, { status: 503 });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
}

function runEvidenceFetch(runs = []) {
  return async (url) => {
    if (url.endsWith("/branches/main")) {
      return Response.json({ commit: { sha: HEAD } });
    }
    if (url.includes("/actions/workflows/generated-app-preview-lifecycle.yml/runs")) {
      return Response.json({
        total_count: runs.length,
        workflow_runs: runs,
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
}

async function publicationFetch(root) {
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
  for (const relativePath of GENERATED_PREVIEW_ROOT_PUBLICATION_FILES) {
    const source = await readFile(join(root, relativePath));
    tree.push({
      path: relativePath,
      type: "blob",
      sha: gitBlobSha(source),
    });
  }
  const workflowPath = ".github/workflows/generated-app-preview-lifecycle.yml";
  const workflowSource = await readFile(join(root, ...workflowPath.split("/")));
  tree.push({
    path: workflowPath,
    type: "blob",
    sha: gitBlobSha(workflowSource),
  });
  return async () =>
    Response.json({
      truncated: false,
      tree,
    });
}

test("Factory exposes the exact generic preview workflow for a canonical generated app", async (t) => {
  const { root, definition } = await createPreviewFixture(t);
  const lifecycle = await deriveGeneratedPreviewLifecycle(root, definition, {
    publicationFetchImpl: await publicationFetch(root),
    repositoryStateImpl: cleanRepositoryStateImpl(),
    runEvidenceFetchImpl: runEvidenceFetch([]),
  });

  assert.equal(lifecycle.status, "workflow-ready");
  assert.equal(lifecycle.publishedOnMain, true);
  assert.equal(lifecycle.workflowRef, "main");
  assert.equal(lifecycle.exactHeadSha, HEAD);
  assert.equal(lifecycle.initialOperation, "hyperdrive");
  assert.equal(lifecycle.nextOperation, "hyperdrive");
  assert.equal(lifecycle.progressEvidence, "verified");
  assert.deepEqual(lifecycle.completedOperations, []);
  assert.equal(lifecycle.previewVerified, false);
  assert.equal(lifecycle.requiresExplicitApply, true);
  assert.equal(
    lifecycle.workflowPath,
    ".github/workflows/generated-app-preview-lifecycle.yml",
  );
  assert.equal(
    lifecycle.workflowUrl,
    "https://github.com/martinirrgeher-cloud/appbasis/actions/workflows/generated-app-preview-lifecycle.yml",
  );
  assert.deepEqual(
    lifecycle.operations.map((operation) => operation.id),
    ["hyperdrive", "migrate", "bootstrap", "deploy"],
  );
  assert.deepEqual(lifecycle.target, {
    environment: "generated-preview-checklist",
    workerName: "appbasis-checklist",
    hyperdriveName: "appbasis-checklist-preview",
    database: "appbasis_checklist_preview",
  });
});

test("Factory advances the exact next preview operation and marks a complete preview only from ordered successful runs", async (t) => {
  const { root, definition } = await createPreviewFixture(t);
  const runs = [
    previewRun("hyperdrive", 11, "2026-09-18T19:00:00Z", "2026-09-18T19:01:00Z"),
    previewRun("migrate", 12, "2026-09-18T19:01:00Z", "2026-09-18T19:02:00Z"),
    previewRun("bootstrap", 13, "2026-09-18T19:02:00Z", "2026-09-18T19:03:00Z"),
    previewRun("deploy", 14, "2026-09-18T19:03:00Z", "2026-09-18T19:04:00Z"),
  ];
  const lifecycle = await deriveGeneratedPreviewLifecycle(root, definition, {
    publicationFetchImpl: await publicationFetch(root),
    repositoryStateImpl: cleanRepositoryStateImpl(),
    runEvidenceFetchImpl: runEvidenceFetch(runs),
  });

  assert.equal(lifecycle.status, "workflow-ready");
  assert.equal(lifecycle.nextOperation, null);
  assert.deepEqual(lifecycle.completedOperations, [
    "hyperdrive",
    "migrate",
    "bootstrap",
    "deploy",
  ]);
  assert.equal(lifecycle.previewVerified, true);
  assert.deepEqual(
    lifecycle.runs.map((run) => run.runId),
    [11, 12, 13, 14],
  );
});

test("Factory hides mutating preview guidance when run evidence is unavailable", async (t) => {
  const { root, definition } = await createPreviewFixture(t);
  const lifecycle = await deriveGeneratedPreviewLifecycle(root, definition, {
    publicationFetchImpl: await publicationFetch(root),
    repositoryStateImpl: cleanRepositoryStateImpl(),
    runEvidenceFetchImpl: runEvidenceUnavailableFetch(),
  });

  assert.equal(lifecycle.status, "workflow-evidence-unavailable");
  assert.equal(lifecycle.publishedOnMain, true);
  assert.equal(lifecycle.exactHeadSha, null);
  assert.equal(lifecycle.nextOperation, null);
  assert.equal(lifecycle.progressEvidence, "unavailable");
  assert.deepEqual(lifecycle.completedOperations, []);
  assert.equal(lifecycle.previewVerified, false);
});

test("Factory keeps a local generated app pending until its exact preview files are published", async (t) => {
  const { root, definition } = await createPreviewFixture(t);
  const lifecycle = await deriveGeneratedPreviewLifecycle(root, definition, {
    publicationFetchImpl: async () =>
      Response.json({ message: "not published" }, { status: 404 }),
    repositoryStateImpl: cleanRepositoryStateImpl(),
    runEvidenceFetchImpl: runEvidenceFetch([]),
  });

  assert.equal(lifecycle.status, "local-contract-ready");
  assert.equal(lifecycle.publishedOnMain, false);
  assert.equal(lifecycle.workflowRef, null);
  assert.equal(lifecycle.initialOperation, "hyperdrive");
  assert.equal(lifecycle.nextOperation, null);
  assert.equal(lifecycle.progressEvidence, "not-applicable");
  assert.notEqual(lifecycle.target, null);
});

test("Factory refuses Preview evidence from any dirty local worktree", async (t) => {
  const { root, definition } = await createPreviewFixture(t);
  let remoteRead = false;
  const lifecycle = await deriveGeneratedPreviewLifecycle(root, definition, {
    publicationFetchImpl: async () => {
      remoteRead = true;
      throw new Error("publication must not be read for a dirty worktree");
    },
    repositoryStateImpl: async () => ({
      status: "dirty",
      headSha: HEAD,
    }),
    runEvidenceFetchImpl: async () => {
      remoteRead = true;
      throw new Error("runs must not be read for a dirty worktree");
    },
  });

  assert.equal(remoteRead, false);
  assert.equal(lifecycle.status, "local-contract-ready");
  assert.equal(lifecycle.publishedOnMain, false);
  assert.equal(lifecycle.nextOperation, null);
  assert.equal(lifecycle.previewVerified, false);
});

test("Factory refuses Preview progress when local HEAD differs from the exact run head", async (t) => {
  const { root, definition } = await createPreviewFixture(t);
  const lifecycle = await deriveGeneratedPreviewLifecycle(root, definition, {
    publicationFetchImpl: await publicationFetch(root),
    repositoryStateImpl: cleanRepositoryStateImpl("b".repeat(40)),
    runEvidenceFetchImpl: runEvidenceFetch([]),
  });

  assert.equal(lifecycle.status, "local-contract-ready");
  assert.equal(lifecycle.publishedOnMain, false);
  assert.equal(lifecycle.exactHeadSha, null);
  assert.equal(lifecycle.nextOperation, null);
});

test("Factory rechecks main after publication evidence before exposing a mutating next step", async (t) => {
  const { root, definition } = await createPreviewFixture(t);
  let branchReads = 0;
  const movingMainFetch = async (url) => {
    if (url.endsWith("/branches/main")) {
      branchReads += 1;
      return Response.json({
        commit: {
          sha: branchReads <= 3 ? HEAD : "b".repeat(40),
        },
      });
    }
    if (url.includes("/actions/workflows/generated-app-preview-lifecycle.yml/runs")) {
      return Response.json({
        total_count: 0,
        workflow_runs: [],
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const lifecycle = await deriveGeneratedPreviewLifecycle(root, definition, {
    publicationFetchImpl: await publicationFetch(root),
    repositoryStateImpl: cleanRepositoryStateImpl(),
    runEvidenceFetchImpl: movingMainFetch,
  });

  assert.equal(branchReads, 4);
  assert.equal(lifecycle.status, "local-contract-ready");
  assert.equal(lifecycle.publishedOnMain, false);
  assert.equal(lifecycle.nextOperation, null);
  assert.equal(lifecycle.previewVerified, false);
});

test("Factory rechecks the clean local repository state after remote Preview evidence", async (t) => {
  const { root, definition } = await createPreviewFixture(t);
  let repositoryReads = 0;
  const lifecycle = await deriveGeneratedPreviewLifecycle(root, definition, {
    publicationFetchImpl: await publicationFetch(root),
    repositoryStateImpl: async () => {
      repositoryReads += 1;
      return {
        status: repositoryReads === 1 ? "clean" : "dirty",
        headSha: HEAD,
      };
    },
    runEvidenceFetchImpl: runEvidenceFetch([]),
  });

  assert.equal(repositoryReads, 2);
  assert.equal(lifecycle.status, "local-contract-ready");
  assert.equal(lifecycle.publishedOnMain, false);
  assert.equal(lifecycle.nextOperation, null);
});

test("Factory keeps generic preview actions closed when the canonical preview wrapper is absent", async (t) => {
  const { root, definition } = await createPreviewFixture(t);
  await rm(join(root, "apps", "checklist", "worker", "preview.ts"));

  const lifecycle = await deriveGeneratedPreviewLifecycle(root, definition);

  assert.equal(lifecycle.status, "not-eligible");
  assert.equal(lifecycle.publishedOnMain, false);
  assert.equal(lifecycle.initialOperation, null);
  assert.equal(lifecycle.nextOperation, null);
  assert.equal(lifecycle.target, null);
  assert.equal(lifecycle.requiresExplicitApply, true);
  assert.deepEqual(
    lifecycle.operations.map((operation) => operation.id),
    ["hyperdrive", "migrate", "bootstrap", "deploy"],
  );
});
