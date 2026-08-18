import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createExpectedUlcLinzDatabaseManifest } from "../ulc-linz-database-contract.mjs";
import {
  deriveUlcLinzLifecycleEvidence,
  ULC_LINZ_LIFECYCLE_EVIDENCE_POLICY,
} from "./ulc-linz-lifecycle-evidence.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const VALID_ULC_DEFINITION = Object.freeze({
  schemaVersion: 2,
  appId: "ulc-linz",
  displayName: "ULC Linz",
  modules: Object.freeze([]),
  platformServices: Object.freeze(["identity", "permissions"]),
});

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), "appbasis-ulc-m5-cd-evidence-"));
  const databasePath = join(root, "apps", "ulc-linz", "appbasis.database.json");
  await mkdir(dirname(databasePath), { recursive: true });
  await writeFile(
    databasePath,
    `${JSON.stringify(createExpectedUlcLinzDatabaseManifest(VALID_ULC_DEFINITION), null, 2)}\n`,
    "utf8",
  );

  for (const { path } of ULC_LINZ_LIFECYCLE_EVIDENCE_POLICY.evidenceFiles) {
    const destination = join(root, path);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(join(repositoryRoot, path), destination);
  }
  return root;
}

test("emits M5-C/D evidence only for the exact current ULC persistence and acceptance scope", async () => {
  const root = await createFixture();
  try {
    assert.deepEqual(
      await deriveUlcLinzLifecycleEvidence(root, VALID_ULC_DEFINITION),
      { deletionConcept: true, retention: true },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("keeps C/D fail closed for another app or a future module set", async () => {
  assert.deepEqual(
    await deriveUlcLinzLifecycleEvidence("/not-read", {
      ...VALID_ULC_DEFINITION,
      appId: "reference",
    }),
    {},
  );
  assert.deepEqual(
    await deriveUlcLinzLifecycleEvidence("/not-read", {
      ...VALID_ULC_DEFINITION,
      modules: ["tasks"],
    }),
    {},
  );
});

test("fails closed when the current app-owned database contract drifts", async () => {
  const root = await createFixture();
  try {
    const manifest = createExpectedUlcLinzDatabaseManifest(VALID_ULC_DEFINITION);
    const changed = JSON.parse(JSON.stringify(manifest));
    changed.owners.find((owner) => owner.id === "ulc-linz-lifecycle").schemaVersion = 2;
    await writeFile(
      join(root, "apps", "ulc-linz", "appbasis.database.json"),
      `${JSON.stringify(changed, null, 2)}\n`,
      "utf8",
    );
    assert.deepEqual(
      await deriveUlcLinzLifecycleEvidence(root, VALID_ULC_DEFINITION),
      {},
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fails closed when inventory policy or future object-storage scope changes", async () => {
  const root = await createFixture();
  const inventoryPath = join(root, "apps", "ulc-linz", "privacy", "m5-data-inventory.json");
  try {
    const inventory = JSON.parse(await import("node:fs/promises").then(({ readFile }) => readFile(inventoryPath, "utf8")));
    inventory.objectStorage.status = "configured";
    await writeFile(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
    assert.deepEqual(
      await deriveUlcLinzLifecycleEvidence(root, VALID_ULC_DEFINITION),
      {},
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fails closed when a required C/D runtime or acceptance file changes or disappears", async () => {
  const root = await createFixture();
  const { path } = ULC_LINZ_LIFECYCLE_EVIDENCE_POLICY.evidenceFiles.find(
    (entry) => entry.path.endsWith("lifecycle-persistence.postgres.e2e.test.ts"),
  );
  try {
    await writeFile(join(root, path), "// weakened C/D evidence\n", "utf8");
    assert.deepEqual(
      await deriveUlcLinzLifecycleEvidence(root, VALID_ULC_DEFINITION),
      {},
    );
    await rm(join(root, path), { force: true });
    assert.deepEqual(
      await deriveUlcLinzLifecycleEvidence(root, VALID_ULC_DEFINITION),
      {},
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
