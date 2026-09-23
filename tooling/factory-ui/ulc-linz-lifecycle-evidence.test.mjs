import assert from "node:assert/strict";
import { cp, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createExpectedUlcLinzDatabaseManifest } from "../ulc-linz-database-contract.mjs";
import { ULC_LINZ_M6_PRODUCTION_RUNTIME_CONTRACT_DIGEST } from "../ulc-linz-m6-production-resource-binding.mjs";
import {
  deriveUlcLinzLifecycleContractDigest,
  deriveUlcLinzLifecycleEvidence,
  ULC_LINZ_LIFECYCLE_EVIDENCE_POLICY,
} from "./ulc-linz-lifecycle-evidence.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const NOW = new Date("2026-08-18T12:50:00.000Z");
const OBSERVED_AT = "2026-08-18T12:45:00.000Z";
const VALID_UNTIL = "2026-08-18T13:45:00.000Z";
const VALID_ULC_DEFINITION = Object.freeze({
  schemaVersion: 2,
  appId: "ulc-linz",
  displayName: "ULC Linz",
  modules: Object.freeze([]),
  platformServices: Object.freeze(["identity", "permissions"]),
});

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), "appbasis-ulc-m5-cd-evidence-"));
  for (const directory of ULC_LINZ_LIFECYCLE_EVIDENCE_POLICY.lifecycleContractDirectories) {
    const destination = join(root, directory);
    await mkdir(dirname(destination), { recursive: true });
    await cp(join(repositoryRoot, directory), destination, { recursive: true });
  }

  const databasePath = join(root, "apps", "ulc-linz", "appbasis.database.json");
  await mkdir(dirname(databasePath), { recursive: true });
  await writeFile(
    databasePath,
    `${JSON.stringify(createExpectedUlcLinzDatabaseManifest(VALID_ULC_DEFINITION), null, 2)}\n`,
    "utf8",
  );

  const paths = new Set([
    ...ULC_LINZ_LIFECYCLE_EVIDENCE_POLICY.evidenceFiles.map(({ path }) => path),
    ...ULC_LINZ_LIFECYCLE_EVIDENCE_POLICY.lifecycleContractPaths,
  ]);
  for (const path of paths) {
    if (path === "apps/ulc-linz/appbasis.database.json") continue;
    const destination = join(root, path);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(join(repositoryRoot, path), destination);
  }

  // M5-C/D remains intentionally pinned to the last production-approved
  // module-less ULC scope. Reconstruct that approved scope inside the fixture
  // so the contract itself stays testable while the live FC5 countdown target
  // correctly invalidates current production evidence.
  const appDefinitionPath = join(root, "apps", "ulc-linz", "appbasis.app.json");
  const appDefinition = JSON.parse(await readFile(appDefinitionPath, "utf8"));
  appDefinition.modules = [];
  await writeFile(
    appDefinitionPath,
    `${JSON.stringify(appDefinition, null, 2)}\n`,
    "utf8",
  );

  const packagePath = join(root, "apps", "ulc-linz", "package.json");
  const appPackage = JSON.parse(await readFile(packagePath, "utf8"));
  delete appPackage.dependencies["@appbasis/countdown"];
  await writeFile(
    packagePath,
    `${JSON.stringify(appPackage, null, 2)}\n`,
    "utf8",
  );

  const lockfilePath = join(root, "pnpm-lock.yaml");
  const lockfile = await readFile(lockfilePath, "utf8");
  await writeFile(
    lockfilePath,
    lockfile.replace(
      `      '@appbasis/countdown':\n        specifier: workspace:*\n        version: link:../../modules/countdown\n`,
      "",
    ),
    "utf8",
  );

  const inventoryAcceptancePath = join(
    root,
    "apps",
    "ulc-linz",
    "test",
    "m5-data-inventory.test.ts",
  );
  const inventoryAcceptance = await readFile(inventoryAcceptancePath, "utf8");
  const currentInventoryAssertions = `    expect(appManifest.modules).toEqual(["countdown"]);
    expect(inventory.runtimeModules).toEqual([]);
    expect(inventory.runtimeModules).not.toEqual(appManifest.modules);
    expect(inventory.m5.unknownRuntimeModule).toBe("fail-closed");
`;
  const approvedInventoryAssertions = `    expect(appManifest.modules).toEqual([]);
    expect(inventory.runtimeModules).toEqual(appManifest.modules);
`;
  assert.equal(
    inventoryAcceptance.split(currentInventoryAssertions).length,
    2,
    "FC5 inventory acceptance reconstruction must match exactly once",
  );
  await writeFile(
    inventoryAcceptancePath,
    inventoryAcceptance.replace(
      currentInventoryAssertions,
      approvedInventoryAssertions,
    ),
    "utf8",
  );

  // D2 deliberately moves the password-change guard into the lightweight
  // identity/access contract. M5-C/D remains pinned to the earlier approved
  // Identity source graph, so reconstruct those three source files inside the
  // fixture rather than rebasing production evidence onto D2.
  const identityAccessPath = join(root, "packages", "identity", "src", "access.ts");
  await writeFile(
    identityAccessPath,
    'export { assertIdentityActionAllowed } from "./service";\n',
    "utf8",
  );

  const identityServicePath = join(root, "packages", "identity", "src", "service.ts");
  let identityService = await readFile(identityServicePath, "utf8");
  const currentServiceImports = `import { assertIdentityActionAllowed } from "./access";
export { assertIdentityActionAllowed } from "./access";
import type {
  AuthSession,
  AccountStatus,
  CurrentIdentity,
  IdentityPersistenceState,
`;
  const approvedServiceImports = `import type {
  AuthSession,
  AccountStatus,
  CurrentIdentity,
  IdentityAction,
  IdentityPersistenceState,
`;
  assert.equal(
    identityService.split(currentServiceImports).length,
    2,
    "D2 Identity service import reconstruction must match exactly once",
  );
  identityService = identityService.replace(
    currentServiceImports,
    approvedServiceImports,
  );
  const serviceClassAnchor = `export class IdentityService {
`;
  const approvedAccessFunction = `export function assertIdentityActionAllowed(
  current: CurrentIdentity,
  action: IdentityAction,
): void {
  if (
    current.access === "password-change-required" &&
    action !== "change-password" &&
    action !== "end-session"
  ) {
    throw new IdentityError(
      "PASSWORD_CHANGE_REQUIRED",
      "The password must be changed before using the application.",
    );
  }
}

`;
  assert.equal(
    identityService.split(serviceClassAnchor).length,
    2,
    "D2 Identity service access reconstruction anchor must match exactly once",
  );
  await writeFile(
    identityServicePath,
    identityService.replace(
      serviceClassAnchor,
      `${approvedAccessFunction}${serviceClassAnchor}`,
    ),
    "utf8",
  );

  const identityIndexPath = join(root, "packages", "identity", "src", "index.ts");
  const identityIndex = await readFile(identityIndexPath, "utf8");
  const currentIndexExports = `export { assertIdentityActionAllowed } from "./access";
export {
  IdentityService,
  type CreateInitialUserInput,
} from "./service";
`;
  const approvedIndexExports = `export {
  assertIdentityActionAllowed,
  IdentityService,
  type CreateInitialUserInput,
} from "./service";
`;
  assert.equal(
    identityIndex.split(currentIndexExports).length,
    2,
    "D2 Identity index reconstruction must match exactly once",
  );
  await writeFile(
    identityIndexPath,
    identityIndex.replace(currentIndexExports, approvedIndexExports),
    "utf8",
  );

  return root;
}

function resourceBindingEvidence({ runtimeBindingId = "opaque-worker" } = {}) {
  return {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    observedAt: OBSERVED_AT,
    validUntilOrReviewAt: VALID_UNTIL,
    runtime: {
      entrypoint: "./worker/index.ts",
      contractDigest: ULC_LINZ_M6_PRODUCTION_RUNTIME_CONTRACT_DIGEST,
      providerModel: "standard-workers-global-transient",
      euOnly: false,
    },
    neon: {
      projectBindingId: "opaque-neon-project",
      branchBindingId: "opaque-neon-branch",
      databaseBindingId: "opaque-neon-database",
      region: "aws-eu-central-1",
      regionSource: "provider-api",
      identitySource: "provider-api",
      dedicatedProductionResource: true,
    },
    cloudflare: {
      accountBindingId: "opaque-account",
      runtimeBindingId,
      hostnameBinding: "ulc.example.test",
      databaseBindingId: "opaque-hyperdrive",
      identitySource: "provider-api",
      bindingInventoryComplete: true,
      telemetryInventoryComplete: true,
      unexpectedPersonalDataPersistence: false,
      dedicatedProductionResource: true,
    },
  };
}

async function lifecycleActivationEvidence(root, resource = resourceBindingEvidence()) {
  return {
    resourceBindingEvidence: resource,
    activationEvidence: {
      schemaVersion: 1,
      application: "ulc-linz",
      environment: "production",
      observedAt: resource.observedAt,
      validUntilOrReviewAt: resource.validUntilOrReviewAt,
      evidenceSource: "controlled-production-activation-run",
      executionBoundary: "protected-operations",
      lifecycleContractDigest: await deriveUlcLinzLifecycleContractDigest(root),
      activationInventoryComplete: true,
      deletionExecutorBound: true,
      retentionExecutorBound: true,
      restoreReconciliationExecutorBound: true,
      publicIngressPresent: false,
    },
  };
}

async function deriveWithActivation(root, activation) {
  return deriveUlcLinzLifecycleEvidence(
    root,
    VALID_ULC_DEFINITION,
    activation ?? (await lifecycleActivationEvidence(root)),
    { now: NOW },
  );
}

test("emits M5-C/D evidence only for exact repository contracts plus truthful protected production activation inventory", async () => {
  const root = await createFixture();
  try {
    assert.deepEqual(await deriveWithActivation(root), {
      deletionConcept: true,
      retention: true,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("keeps C/D fail closed without real production lifecycle activation", async () => {
  const root = await createFixture();
  try {
    assert.deepEqual(
      await deriveUlcLinzLifecycleEvidence(root, VALID_ULC_DEFINITION, undefined, {
        now: NOW,
      }),
      {},
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects public, missing-executor or lifecycle-contract-drifted production activation", async () => {
  const root = await createFixture();
  try {
    for (const mutate of [
      (value) => { value.activationEvidence.publicIngressPresent = true; },
      (value) => { value.activationEvidence.retentionExecutorBound = false; },
      (value) => { value.activationEvidence.deletionExecutorBound = false; },
      (value) => { value.activationEvidence.lifecycleContractDigest = `sha256:${"0".repeat(64)}`; },
    ]) {
      const activation = await lifecycleActivationEvidence(root);
      mutate(activation);
      assert.deepEqual(await deriveWithActivation(root, activation), {});
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects lifecycle activation from another production resource snapshot", async () => {
  const root = await createFixture();
  try {
    const activation = await lifecycleActivationEvidence(root);
    activation.activationEvidence.observedAt = "2026-08-18T12:46:00.000Z";
    assert.deepEqual(await deriveWithActivation(root, activation), {});
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
    const activation = await lifecycleActivationEvidence(root);
    const manifest = createExpectedUlcLinzDatabaseManifest(VALID_ULC_DEFINITION);
    const changed = JSON.parse(JSON.stringify(manifest));
    changed.owners.find((owner) => owner.id === "ulc-linz-lifecycle").schemaVersion = 5;
    await writeFile(
      join(root, "apps", "ulc-linz", "appbasis.database.json"),
      `${JSON.stringify(changed, null, 2)}\n`,
      "utf8",
    );
    assert.deepEqual(await deriveWithActivation(root, activation), {});
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fails closed when inventory policy or future object-storage scope changes", async () => {
  const root = await createFixture();
  const inventoryPath = join(root, "apps", "ulc-linz", "privacy", "m5-data-inventory.json");
  try {
    const activation = await lifecycleActivationEvidence(root);
    const inventory = JSON.parse(await readFile(inventoryPath, "utf8"));
    inventory.objectStorage.status = "configured";
    await writeFile(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
    assert.deepEqual(await deriveWithActivation(root, activation), {});
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("pins every destructive C/D implementation used by the current lifecycle claim", async () => {
  const destructivePaths = [
    "apps/ulc-linz/worker/lifecycle.ts",
    "packages/identity/src/postgres-deletion.ts",
    "packages/permissions/src/principal-lifecycle-administration.ts",
  ];
  for (const path of destructivePaths) {
    assert.ok(
      ULC_LINZ_LIFECYCLE_EVIDENCE_POLICY.evidenceFiles.some(
        (entry) => entry.path === path,
      ),
      path,
    );
  }
  assert.ok(
    ULC_LINZ_LIFECYCLE_EVIDENCE_POLICY.evidenceFiles.some(
      (entry) => entry.path === "apps/ulc-linz/test/retention-claim.postgres.e2e.test.ts",
    ),
    "retention claim PostgreSQL acceptance must be pinned",
  );

  const root = await createFixture();
  try {
    const activation = await lifecycleActivationEvidence(root);
    await writeFile(
      join(root, destructivePaths[0]),
      "// destructive lifecycle drift\n",
      "utf8",
    );
    assert.deepEqual(await deriveWithActivation(root, activation), {});
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("lifecycle contract digest covers schemas, dependency versions and executable source roots", () => {
  for (const path of [
    "pnpm-lock.yaml",
    "apps/ulc-linz/appbasis.database.json",
    "packages/identity/drizzle/0000_appbasis_identity_foundation.sql",
    "packages/permissions/migrations/0003_appbasis_principal_permission_administration_audit.sql",
    "apps/ulc-linz/migrations/0000_ulc_linz_lifecycle_scope.sql",
    "apps/ulc-linz/migrations/0001_ulc_linz_retention_deletion_claim.sql",
    "apps/ulc-linz/worker/restore-reconciliation.ts",
  ]) {
    assert.ok(ULC_LINZ_LIFECYCLE_EVIDENCE_POLICY.lifecycleContractPaths.includes(path), path);
  }
  for (const directory of [
    "apps/ulc-linz/worker",
    "packages/database/src",
    "packages/identity/src",
    "packages/permissions/src",
  ]) {
    assert.ok(
      ULC_LINZ_LIFECYCLE_EVIDENCE_POLICY.lifecycleContractDirectories.includes(directory),
      directory,
    );
  }
});

test("lifecycle digest invalidates activation on transitive role-policy or Identity dependency drift", async () => {
  for (const path of [
    "apps/ulc-linz/worker/role-data-scope.json",
    "packages/identity/src/service.ts",
  ]) {
    const root = await createFixture();
    try {
      const activation = await lifecycleActivationEvidence(root);
      const before = activation.activationEvidence.lifecycleContractDigest;
      const original = await readFile(join(root, path), "utf8");
      await writeFile(join(root, path), `${original}\n`, "utf8");
      assert.notEqual(await deriveUlcLinzLifecycleContractDigest(root), before, path);
      assert.deepEqual(await deriveWithActivation(root, activation), {}, path);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("fails closed when a required C/D runtime or acceptance file changes or disappears", async () => {
  const root = await createFixture();
  const { path } = ULC_LINZ_LIFECYCLE_EVIDENCE_POLICY.evidenceFiles.find(
    (entry) => entry.path.endsWith("lifecycle-persistence.postgres.e2e.test.ts"),
  );
  try {
    const activation = await lifecycleActivationEvidence(root);
    await writeFile(join(root, path), "// weakened C/D evidence\n", "utf8");
    assert.deepEqual(await deriveWithActivation(root, activation), {});
    await rm(join(root, path), { force: true });
    assert.deepEqual(await deriveWithActivation(root, activation), {});
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});