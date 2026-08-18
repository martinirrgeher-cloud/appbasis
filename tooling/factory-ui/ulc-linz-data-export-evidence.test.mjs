import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { deriveUlcLinzDataExportEvidence } from "./ulc-linz-data-export-evidence.mjs";

const repositoryRoot = process.cwd();
const definition = JSON.parse(
  await readFile(join(repositoryRoot, "apps", "ulc-linz", "appbasis.app.json"), "utf8"),
);
const AUDIT_EVIDENCE = Object.freeze({ auditSecurityLogging: true });

test("emits M5-E evidence only for exact current export acceptance plus independent audit evidence", async () => {
  assert.deepEqual(
    await deriveUlcLinzDataExportEvidence(repositoryRoot, definition, AUDIT_EVIDENCE),
    { dataExport: true },
  );
  assert.deepEqual(
    await deriveUlcLinzDataExportEvidence(repositoryRoot, definition, {}),
    {},
  );
});

test("keeps M5-E open for future module scope or malformed audit evidence", async () => {
  assert.deepEqual(
    await deriveUlcLinzDataExportEvidence(
      repositoryRoot,
      { ...definition, modules: ["tasks"] },
      AUDIT_EVIDENCE,
    ),
    {},
  );
  assert.deepEqual(
    await deriveUlcLinzDataExportEvidence(
      repositoryRoot,
      definition,
      { auditSecurityLogging: "true" },
    ),
    {},
  );
  assert.deepEqual(
    await deriveUlcLinzDataExportEvidence(
      repositoryRoot,
      definition,
      { auditSecurityLogging: true, extra: true },
    ),
    {},
  );
});

test("does not invoke accessor-shaped dependent audit evidence", async () => {
  let getterCalls = 0;
  const evidence = {};
  Object.defineProperty(evidence, "auditSecurityLogging", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return true;
    },
  });
  assert.deepEqual(
    await deriveUlcLinzDataExportEvidence(repositoryRoot, definition, evidence),
    {},
  );
  assert.equal(getterCalls, 0);
});

test("fails closed when pinned export implementation or acceptance drifts", async () => {
  await withTemporaryUlc(async (root) => {
    const path = join(root, "apps", "ulc-linz", "privacy", "m5-export-contract.json");
    await writeFile(path, `${await readFile(path, "utf8")}\n`, "utf8");
    assert.deepEqual(
      await deriveUlcLinzDataExportEvidence(root, definition, AUDIT_EVIDENCE),
      {},
    );
  });
});

test("fails closed when the PostgreSQL E2E stops being executed", async () => {
  await withTemporaryUlc(async (root) => {
    const path = join(root, "apps", "ulc-linz", "package.json");
    const appPackage = JSON.parse(await readFile(path, "utf8"));
    appPackage.scripts["test:postgres"] = appPackage.scripts["test:postgres"].replace(
      " ./test/data-export.postgres.e2e.test.ts",
      "",
    );
    await writeFile(path, `${JSON.stringify(appPackage, null, 2)}\n`, "utf8");
    assert.deepEqual(
      await deriveUlcLinzDataExportEvidence(root, definition, AUDIT_EVIDENCE),
      {},
    );
  });
});

test("fails closed when the E evidence test stops being part of verify:apps", async () => {
  await withTemporaryUlc(async (root) => {
    const path = join(root, "package.json");
    const rootPackage = JSON.parse(await readFile(path, "utf8"));
    rootPackage.scripts["verify:apps"] = rootPackage.scripts["verify:apps"].replace(
      " ./tooling/factory-ui/ulc-linz-data-export-evidence.test.mjs",
      "",
    );
    await writeFile(path, `${JSON.stringify(rootPackage, null, 2)}\n`, "utf8");
    assert.deepEqual(
      await deriveUlcLinzDataExportEvidence(root, definition, AUDIT_EVIDENCE),
      {},
    );
  });
});

async function withTemporaryUlc(run) {
  const root = await mkdtemp(join(tmpdir(), "appbasis-m5e-"));
  try {
    await cp(
      join(repositoryRoot, "apps", "ulc-linz"),
      join(root, "apps", "ulc-linz"),
      { recursive: true },
    );
    await cp(join(repositoryRoot, "package.json"), join(root, "package.json"));
    await mkdir(join(root, "tooling", "factory-ui"), { recursive: true });
    await cp(
      join(repositoryRoot, "tooling", "factory-ui", "ulc-linz-data-export-evidence.test.mjs"),
      join(root, "tooling", "factory-ui", "ulc-linz-data-export-evidence.test.mjs"),
    );
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
