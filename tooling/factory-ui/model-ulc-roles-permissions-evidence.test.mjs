import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createExpectedUlcLinzDatabaseManifest } from "../ulc-linz-database-contract.mjs";
import { ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY } from "../ulc-linz-m5-role-data-scope.mjs";
import { loadFactorySnapshot } from "./model.mjs";
import { ULC_LINZ_LIFECYCLE_EVIDENCE_POLICY } from "./ulc-linz-lifecycle-evidence.mjs";
import { ULC_LINZ_ROLES_PERMISSIONS_EVIDENCE_POLICY } from "./ulc-linz-roles-permissions-evidence.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const M5_SNAPSHOT_PATH = "apps/ulc-linz/privacy/m5-security-privacy-readiness.json";
const VALID_ULC_DEFINITION = Object.freeze({
  schemaVersion: 2,
  appId: "ulc-linz",
  displayName: "ULC Linz",
  modules: Object.freeze([]),
  platformServices: Object.freeze(["identity", "permissions"]),
});

async function createFactoryFixture({ rolePolicy } = {}) {
  const root = await mkdtemp(join(tmpdir(), "appbasis-factory-ulc-m5-bcd-"));
  const appRoot = join(root, "apps", "ulc-linz");
  await mkdir(join(appRoot, "worker"), { recursive: true });
  await mkdir(join(root, "modules"), { recursive: true });

  await writeFile(
    join(appRoot, "appbasis.app.json"),
    `${JSON.stringify(VALID_ULC_DEFINITION, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    join(appRoot, "appbasis.database.json"),
    `${JSON.stringify(
      createExpectedUlcLinzDatabaseManifest(VALID_ULC_DEFINITION),
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    join(appRoot, "worker", "role-data-scope.json"),
    `${JSON.stringify(
      rolePolicy ?? ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY,
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(join(appRoot, "worker", "index.ts"), "export {};\n", "utf8");
  await writeFile(
    join(appRoot, "package.json"),
    `${JSON.stringify({ name: "@appbasis/app-ulc-linz", private: true }, null, 2)}\n`,
    "utf8",
  );

  const m5Snapshot = JSON.parse(
    await readFile(join(repositoryRoot, M5_SNAPSHOT_PATH), "utf8"),
  );
  const evidencePaths = new Set([
    M5_SNAPSHOT_PATH,
    ...m5Snapshot.criteria.flatMap(({ evidence }) => evidence),
    ...ULC_LINZ_ROLES_PERMISSIONS_EVIDENCE_POLICY.acceptanceTests.map(
      ({ path }) => path,
    ),
    ...ULC_LINZ_LIFECYCLE_EVIDENCE_POLICY.evidenceFiles.map(({ path }) => path),
  ]);
  for (const path of evidencePaths) {
    const destination = join(root, path);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(join(repositoryRoot, path), destination);
  }

  return root;
}

function criterion(app, id) {
  return app.productionReadiness.criteria.find((candidate) => candidate.id === id);
}

test("Factory keeps M5 static criteria independent from production lifecycle activation", async () => {
  const root = await createFactoryFixture();
  try {
    const snapshot = await loadFactorySnapshot(root);
    const app = snapshot.apps[0];

    assert.equal(app.appId, "ulc-linz");
    assert.equal(app.productionReadiness.productionReady, false);
    assert.equal(app.productionReadiness.requiredCount, 12);
    assert.equal(criterion(app, "secretsOutsideAppManifests").status, "verified");
    assert.equal(criterion(app, "rolesAndPermissions").status, "verified");
    assert.equal(criterion(app, "deletionConcept").status, "verified");
    assert.equal(criterion(app, "retention").status, "verified");
    assert.equal(criterion(app, "dataRegion").status, "open");
    assert.equal(snapshot.capabilities.releaseProduction, false);
    assert.equal(app.productionReleaseReadiness.technicalEvidenceVerified, false);
    assert.equal(app.productionReleaseReadiness.releaseAuthorized, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Factory still fails the roles criterion closed on canonical B-policy drift", async () => {
  const rolePolicy = JSON.parse(
    JSON.stringify(ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY),
  );
  rolePolicy.principalPermissionMapping.unknownModule = "allow";
  const root = await createFactoryFixture({ rolePolicy });

  try {
    const snapshot = await loadFactorySnapshot(root);
    const app = snapshot.apps[0];

    assert.equal(criterion(app, "secretsOutsideAppManifests").status, "verified");
    assert.equal(criterion(app, "rolesAndPermissions").status, "open");
    assert.equal(criterion(app, "deletionConcept").status, "verified");
    assert.equal(criterion(app, "retention").status, "verified");
    assert.equal(app.productionReadiness.productionReady, false);
    assert.equal(snapshot.capabilities.releaseProduction, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
