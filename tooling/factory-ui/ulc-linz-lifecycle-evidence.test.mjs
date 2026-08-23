import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  deriveUlcLinzLifecycleContractDigest,
  deriveUlcLinzLifecycleEvidence,
  ULC_LINZ_LIFECYCLE_EVIDENCE_POLICY,
} from "./ulc-linz-lifecycle-evidence.mjs";
import { createExpectedUlcLinzDatabaseManifest } from "../ulc-linz-database-contract.mjs";

const VALID_ULC_DEFINITION = Object.freeze({
  schemaVersion: 2,
  appId: "ulc-linz",
  displayName: "ULC Linz",
  modules: Object.freeze([]),
  platformServices: Object.freeze(["identity", "permissions"]),
});

const VALID_RESOURCE_BINDING = Object.freeze({
  schemaVersion: 1,
  application: "ulc-linz",
  environment: "production",
  observedAt: "2026-08-17T12:00:00.000Z",
  validUntilOrReviewAt: "2026-08-17T14:00:00.000Z",
  neon: Object.freeze({
    projectIdentitySource: "provider-api",
    projectBindingId: "project-binding-prod-123",
    databaseBindingId: "database-binding-prod-123",
    regionId: "aws-eu-central-1",
    regionVerificationSource: "provider-api",
    environment: "production",
    dedicatedProductionResource: true,
  }),
  cloudflare: Object.freeze({
    accountIdentitySource: "provider-api",
    accountBindingId: "account-binding-prod-123",
    runtimeBindingId: "runtime-binding-prod-123",
    workerIsolationMode: "standard-workers-global-runtime",
    dataLocalizationSuiteEnabled: false,
    regionalServicesEnabled: false,
    customerMetadataBoundaryEnabled: false,
    hostnameBindingSource: "provider-api",
    hostnameBindingState: "bound-production-hostname",
    routeBindingSource: "provider-api",
    routeBindingState: "bound-production-route",
    telemetryEvidenceSource: "provider-api",
    telemetryEvidenceState: "provider-retained-runtime-telemetry",
  }),
});

const VALID_ACTIVATION = Object.freeze({
  schemaVersion: 1,
  application: "ulc-linz",
  environment: "production",
  observedAt: VALID_RESOURCE_BINDING.observedAt,
  validUntilOrReviewAt: VALID_RESOURCE_BINDING.validUntilOrReviewAt,
  evidenceSource: "controlled-production-activation-run",
  executionBoundary: "protected-operations",
  lifecycleContractDigest: "sha256:placeholder",
  activationInventoryComplete: true,
  deletionExecutorBound: true,
  retentionExecutorBound: true,
  restoreReconciliationExecutorBound: true,
  publicIngressPresent: false,
});

test("emits M5-C/D evidence only for exact repository contracts plus protected production activation", async () => {
  const root = await createFixture();
  try {
    const activation = await lifecycleActivationEvidence(root);
    assert.deepEqual(await deriveWithActivation(root, activation), {
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
        now: new Date("2026-08-17T12:30:00.000Z"),
      }),
      {},
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects public, incomplete or lifecycle-contract-drifted production activation", async () => {
  const root = await createFixture();
  try {
    const activation = await lifecycleActivationEvidence(root);
    for (const changed of [
      { ...activation.activationEvidence, publicIngressPresent: true },
      { ...activation.activationEvidence, retentionExecutorBound: false },
      {
        ...activation.activationEvidence,
        lifecycleContractDigest: `sha256:${"0".repeat(64)}`,
      },
      { ...activation.activationEvidence, executionBoundary: "public-runtime" },
    ]) {
      assert.deepEqual(
        await deriveWithActivation(root, {
          ...activation,
          activationEvidence: changed,
        }),
        {},
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects lifecycle activation from another production resource snapshot", async () => {
  const root = await createFixture();
  try {
    const activation = await lifecycleActivationEvidence(root);
    assert.deepEqual(
      await deriveWithActivation(root, {
        ...activation,
        activationEvidence: {
          ...activation.activationEvidence,
          observedAt: "2026-08-17T11:59:59.000Z",
        },
      }),
      {},
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
    const activation = await lifecycleActivationEvidence(root);
    const manifest = createExpectedUlcLinzDatabaseManifest(VALID_ULC_DEFINITION);
    const changed = JSON.parse(JSON.stringify(manifest));
    changed.owners.find((owner) => owner.id === "ulc-linz-lifecycle").schemaVersion = 4;
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
  const root = await createFixture();
  try {
    for (const evidence of ULC_LINZ_LIFECYCLE_EVIDENCE_POLICY.evidenceFiles) {
      const path = join(root, evidence.path);
      const content = await readFile(path, "utf8");
      assert.equal(gitBlobSha(content.replaceAll("\r\n", "\n")), evidence.gitBlobSha);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("lifecycle contract digest covers schemas, dependency versions and executable source roots", async () => {
  const root = await createFixture();
  try {
    const digest = await deriveUlcLinzLifecycleContractDigest(root);
    assert.match(digest, /^sha256:[0-9a-f]{64}$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("lifecycle digest invalidates activation on transitive role-policy or Identity dependency drift", async () => {
  for (const relativePath of [
    "apps/ulc-linz/worker/role-data-scope.json",
    "packages/identity/src/better-auth.ts",
  ]) {
    const root = await createFixture();
    try {
      const activation = await lifecycleActivationEvidence(root);
      await writeFile(
        join(root, relativePath),
        `${await readFile(join(root, relativePath), "utf8")}\n// drift\n`,
        "utf8",
      );
      assert.deepEqual(await deriveWithActivation(root, activation), {});
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("fails closed when a required C/D runtime or acceptance file changes or disappears", async () => {
  for (const evidence of ULC_LINZ_LIFECYCLE_EVIDENCE_POLICY.evidenceFiles) {
    const root = await createFixture();
    try {
      const activation = await lifecycleActivationEvidence(root);
      const path = join(root, evidence.path);
      await writeFile(path, `${await readFile(path, "utf8")}\n`, "utf8");
      assert.deepEqual(await deriveWithActivation(root, activation), {});
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

async function deriveWithActivation(root, activation) {
  return deriveUlcLinzLifecycleEvidence(root, VALID_ULC_DEFINITION, activation, {
    now: new Date("2026-08-17T12:30:00.000Z"),
  });
}

async function lifecycleActivationEvidence(root) {
  const lifecycleContractDigest = await deriveUlcLinzLifecycleContractDigest(root);
  return {
    resourceBindingEvidence: VALID_RESOURCE_BINDING,
    activationEvidence: {
      ...VALID_ACTIVATION,
      lifecycleContractDigest,
    },
  };
}

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), "appbasis-ulc-lifecycle-evidence-"));
  const repositoryRoot = resolve(new URL("../../", import.meta.url).pathname);

  const requiredPaths = new Set([
    ...ULC_LINZ_LIFECYCLE_EVIDENCE_POLICY.lifecycleContractPaths,
    ...ULC_LINZ_LIFECYCLE_EVIDENCE_POLICY.evidenceFiles.map((entry) => entry.path),
    "apps/ulc-linz/appbasis.database.json",
    "apps/ulc-linz/privacy/m5-data-inventory.json",
  ]);
  for (const directory of ULC_LINZ_LIFECYCLE_EVIDENCE_POLICY.lifecycleContractDirectories) {
    await collectRegularFiles(repositoryRoot, directory, requiredPaths);
  }

  for (const relativePath of requiredPaths) {
    const source = join(repositoryRoot, relativePath);
    const destination = join(root, relativePath);
    await mkdir(join(destination, ".."), { recursive: true });
    await writeFile(destination, await readFile(source));
  }
  return root;
}

async function collectRegularFiles(repositoryRoot, relativeDirectory, output) {
  const entries = await (await import("node:fs/promises")).readdir(
    join(repositoryRoot, relativeDirectory),
    { withFileTypes: true },
  );
  for (const entry of entries) {
    const relativePath = `${relativeDirectory}/${entry.name}`;
    if (entry.isDirectory()) {
      await collectRegularFiles(repositoryRoot, relativePath, output);
    } else if (entry.isFile()) {
      output.add(relativePath);
    }
  }
}

function gitBlobSha(content) {
  const size = Buffer.byteLength(content, "utf8");
  return createHash("sha1")
    .update(`blob ${size}\0`, "utf8")
    .update(content, "utf8")
    .digest("hex");
}
