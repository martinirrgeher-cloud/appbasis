import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

import { createExpectedUlcLinzDatabaseManifest } from "../ulc-linz-database-contract.mjs";
import { evaluateUlcLinzProductionResourceBinding } from "../ulc-linz-m6-production-resource-binding.mjs";

const EMPTY_EVIDENCE = Object.freeze({});
const VERIFIED_EVIDENCE = Object.freeze({
  deletionConcept: true,
  retention: true,
});
const ACTIVATION_ROOT_FIELDS = Object.freeze([
  "resourceBindingEvidence",
  "activationEvidence",
]);
const ACTIVATION_FIELDS = Object.freeze([
  "schemaVersion",
  "application",
  "environment",
  "observedAt",
  "validUntilOrReviewAt",
  "evidenceSource",
  "executionBoundary",
  "lifecycleContractDigest",
  "activationInventoryComplete",
  "deletionExecutorBound",
  "retentionExecutorBound",
  "restoreReconciliationExecutorBound",
  "publicIngressPresent",
]);
const LIFECYCLE_CONTRACT_PATHS = Object.freeze([
  "pnpm-lock.yaml",
  "tooling/ulc-linz-database-contract.mjs",
  "apps/ulc-linz/appbasis.app.json",
  "apps/ulc-linz/appbasis.database.json",
  "apps/ulc-linz/package.json",
  "modules/countdown/appbasis.module.json",
  "modules/countdown/package.json",
  "modules/athletes/appbasis.module.json",
  "modules/athletes/package.json",
  "modules/athletes/migrations/0000_appbasis_athletes_foundation.sql",
  "modules/athletes/migrations/0001_appbasis_athletes_deletion_markers.sql",
  "packages/database/package.json",
  "packages/identity/package.json",
  "packages/permissions/package.json",
  "packages/identity/drizzle/0000_appbasis_identity_foundation.sql",
  "packages/identity/drizzle/0001_appbasis_identity_foundation.sql",
  "packages/permissions/migrations/0000_appbasis_permissions_foundation.sql",
  "packages/permissions/migrations/0001_appbasis_permission_role_lifecycle.sql",
  "packages/permissions/migrations/0002_appbasis_permission_administration_audit.sql",
  "packages/permissions/migrations/0003_appbasis_principal_permission_administration_audit.sql",
  "apps/ulc-linz/migrations/0000_ulc_linz_lifecycle_scope.sql",
  "apps/ulc-linz/migrations/0001_ulc_linz_retention_deletion_claim.sql",
  "apps/ulc-linz/migrations/0002_ulc_linz_security_event_log.sql",
  "apps/ulc-linz/migrations/0003_ulc_linz_security_event_access.sql",
  ".github/workflows/m5-ulc-protected-lifecycle-operations.yml",
  "apps/ulc-linz/worker/lifecycle.ts",
  "apps/ulc-linz/worker/lifecycle-service.ts",
  "apps/ulc-linz/worker/scope-persistence.ts",
  "apps/ulc-linz/worker/retention.ts",
  "apps/ulc-linz/worker/restore-reconciliation.ts",
  "packages/identity/src/postgres-deletion.ts",
  "packages/identity/src/postgres-deletion-retention.ts",
  "packages/permissions/src/principal-lifecycle-administration.ts",
  "packages/permissions/src/permission-administration-audit-retention.ts",
]);
const LIFECYCLE_CONTRACT_DIRECTORIES = Object.freeze([
  "apps/ulc-linz/worker",
  "modules/countdown/src",
  "modules/athletes/src",
  "packages/database/src",
  "packages/identity/src",
  "packages/permissions/src",
]);

export const ULC_LINZ_LIFECYCLE_EVIDENCE_POLICY = Object.freeze({
  appId: "ulc-linz",
  modules: Object.freeze(["countdown", "athletes"]),
  platformServices: Object.freeze(["identity", "permissions"]),
  lifecycleContractPaths: LIFECYCLE_CONTRACT_PATHS,
  lifecycleContractDirectories: LIFECYCLE_CONTRACT_DIRECTORIES,
  evidenceFiles: Object.freeze([
    Object.freeze({
      path: "apps/ulc-linz/privacy/m5-data-inventory.json",
      gitBlobSha: "184f8faa1b9f9d34f5259f50462315d099e82b90",
    }),
    Object.freeze({
      path: "tooling/ulc-linz-database-contract.mjs",
      gitBlobSha: "6c43892ab601eb1d9468a799afbc711355770d3d",
    }),
    Object.freeze({
      path: "apps/ulc-linz/migrations/0000_ulc_linz_lifecycle_scope.sql",
      gitBlobSha: "c8db1d7d437ac8f575fad268bc219c588c666bd8",
    }),
    Object.freeze({
      path: "apps/ulc-linz/migrations/0001_ulc_linz_retention_deletion_claim.sql",
      gitBlobSha: "3c89747fcd089f6569a9532c71594d622c59cd88",
    }),
    Object.freeze({
      path: "apps/ulc-linz/migrations/0002_ulc_linz_security_event_log.sql",
      gitBlobSha: "0dea6b9c751e559b06e14d2d2e603bb9a99372d4",
    }),
    Object.freeze({
      path: "apps/ulc-linz/migrations/0003_ulc_linz_security_event_access.sql",
      gitBlobSha: "1d1ef22e037fedbe8aa3206ce931e44a9ea2c672",
    }),
    Object.freeze({
      path: "modules/athletes/migrations/0000_appbasis_athletes_foundation.sql",
      gitBlobSha: "7abe0cda515ac4bf8bd97feb583aad5418b5aed1",
    }),
    Object.freeze({
      path: "modules/athletes/migrations/0001_appbasis_athletes_deletion_markers.sql",
      gitBlobSha: "088e29173e17f8d957765f89ea04130778fb31c8",
    }),
    Object.freeze({
      path: "apps/ulc-linz/package.json",
      gitBlobSha: "734505199c00b9ef7b160145202348f559d02f27",
    }),
    Object.freeze({
      path: "modules/athletes/appbasis.module.json",
      gitBlobSha: "92a1a44449f3a6f0e5c7d5b5398ab8b9f652a225",
    }),
    Object.freeze({
      path: "modules/athletes/package.json",
      gitBlobSha: "1c45ec7666a76a4c59a51ddbedbdfc1dfc6d4af9",
    }),
    Object.freeze({
      path: "modules/athletes/src/domain/masterdata.ts",
      gitBlobSha: "80bca98f5607d996a98137d3217253e1872050e6",
    }),
    Object.freeze({
      path: "modules/athletes/src/postgres-masterdata-repository.ts",
      gitBlobSha: "b682e8cbbf6c2c90f8ff2533478e8aaf69333057",
    }),
    Object.freeze({
      path: "modules/athletes/src/restore-reconciliation.ts",
      gitBlobSha: "9db064c3511f0d21d7df7d0bd38a1004675c3df5",
    }),
    Object.freeze({
      path: "apps/ulc-linz/worker/app.ts",
      gitBlobSha: "3acdcd47bf696c23334c15a11fe80c70368d608c",
    }),
    Object.freeze({
      path: "packages/identity/src/better-auth.ts",
      gitBlobSha: "6a16b0ca73961c970a57ef03cdad41670735734e",
    }),
    Object.freeze({
      path: "packages/identity/src/http.ts",
      gitBlobSha: "b920cc91c44efc953c89083adea4c85351c2470e",
    }),
    Object.freeze({
      path: "packages/identity/src/service.ts",
      gitBlobSha: "24b6f126f2beac3fec066d920310bc15043a3786",
    }),
    Object.freeze({
      path: "packages/identity/src/server.ts",
      gitBlobSha: "9fb9929a405a38e4bc91c56799690e22e63ef95c",
    }),
    Object.freeze({
      path: "packages/identity/src/postgres-runtime.ts",
      gitBlobSha: "626c744335405351dc6be176929cacd4ec709c08",
    }),
    Object.freeze({
      path: "apps/ulc-linz/worker/lifecycle.ts",
      gitBlobSha: "677019b4d0d4e784519120b450b57291aaa3f836",
    }),
    Object.freeze({
      path: "apps/ulc-linz/worker/lifecycle-service.ts",
      gitBlobSha: "9c933ecbc0f82d5a4f138da8aa530e11760c5951",
    }),
    Object.freeze({
      path: "apps/ulc-linz/worker/scope-persistence.ts",
      gitBlobSha: "19b2e44436c6e661e7885f0eeeacfdbf33c6264e",
    }),
    Object.freeze({
      path: "apps/ulc-linz/worker/retention.ts",
      gitBlobSha: "fdce5bff5b0d29093a868867b564ef20781c0b11",
    }),
    Object.freeze({
      path: "apps/ulc-linz/worker/protected-lifecycle-operations.ts",
      gitBlobSha: "ba3e24784f52ccdfceda3cce5b694f912785ea2a",
    }),
    Object.freeze({
      path: ".github/workflows/m5-ulc-protected-lifecycle-operations.yml",
      gitBlobSha: "4066ebb3f3485cfd94a2c8952f35f01802be84e1",
    }),
    Object.freeze({
      path: "apps/ulc-linz/worker/restore-reconciliation.ts",
      gitBlobSha: "31b0637b08cde518fc10a7a4fcd2fbf8cf40aa53",
    }),
    Object.freeze({
      path: "packages/identity/src/postgres-deletion.ts",
      gitBlobSha: "a787b9d1823a70f17a923bca9ec2fc790d0dcb5f",
    }),
    Object.freeze({
      path: "packages/identity/src/postgres-deletion-retention.ts",
      gitBlobSha: "492deda96c02ec12e1396322e1399a37a79088ca",
    }),
    Object.freeze({
      path: "packages/permissions/src/principal-lifecycle-administration.ts",
      gitBlobSha: "4f3c48f62b265183d076f0ec69c4fb90bc70fd28",
    }),
    Object.freeze({
      path: "packages/permissions/src/permission-administration-audit-retention.ts",
      gitBlobSha: "afa469cfbf77fc5487de56ac7ed3ebbb126db7c6",
    }),
    Object.freeze({
      path: "apps/ulc-linz/test/lifecycle.postgres.e2e.test.ts",
      gitBlobSha: "8edcfb05b2769247ceee9b3e2e2c6dac2d6aa92b",
    }),
    Object.freeze({
      path: "apps/ulc-linz/test/lifecycle-persistence.postgres.e2e.test.ts",
      gitBlobSha: "a9536d9d2552a54342a0fcb045c0966f7de32558",
    }),
    Object.freeze({
      path: "apps/ulc-linz/test/lifecycle-audit.postgres.e2e.test.ts",
      gitBlobSha: "01b9c301f9d893e9128c702a9faa0a674cec211c",
    }),
    Object.freeze({
      path: "apps/ulc-linz/test/retention-claim.postgres.e2e.test.ts",
      gitBlobSha: "fd193208f50ac8360209fd7f99811c534f744574",
    }),
    Object.freeze({
      path: "apps/ulc-linz/test/retention-state.test.ts",
      gitBlobSha: "32566b66903137b49a5c49f554b808e2d2f6f163",
    }),
    Object.freeze({
      path: "apps/ulc-linz/test/athletes-masterdata.postgres.e2e.test.ts",
      gitBlobSha: "66a718ad564fb8790be65fefc6250c20d7a5277e",
    }),
    Object.freeze({
      path: "apps/ulc-linz/test/athletes-restore-reconciliation.postgres.e2e.test.ts",
      gitBlobSha: "e19160f891b8dcfc4765a9bba93f8bfdd4550282",
    }),
    Object.freeze({
      path: "modules/athletes/test/postgres-masterdata-repository.test.ts",
      gitBlobSha: "74460a4a91e0c0ea8d13b9b30f949fd68f761cab",
    }),
    Object.freeze({
      path: "apps/ulc-linz/test/m5-data-inventory.test.ts",
      gitBlobSha: "ceed10912911548b78bd7d95571cbf7b64f9e270",
    }),
    Object.freeze({
      path: "packages/permissions/test/permission-administration-audit-retention.postgres.e2e.ts",
      gitBlobSha: "1ae4f25db8d1ed632901d50a3382d0a86f82a3a5",
    }),
  ]),
});

export async function deriveUlcLinzLifecycleContractDigest(repositoryRoot) {
  const root = resolve(repositoryRoot);
  const paths = await collectLifecycleContractPaths(root);
  const hash = createHash("sha256");
  for (const path of paths) {
    const content = await readFile(join(root, path));
    hash.update(path, "utf8");
    hash.update("\0", "utf8");
    hash.update(content);
    hash.update("\0", "utf8");
  }
  return `sha256:${hash.digest("hex")}`;
}

export async function deriveUlcLinzLifecycleEvidence(
  repositoryRoot,
  definition,
  lifecycleActivationEvidenceInput,
  { now = new Date() } = {},
) {
  if (!isExactCurrentUlcDefinition(definition)) return EMPTY_EVIDENCE;

  try {
    const root = resolve(repositoryRoot);
    const [databaseManifest, inventory, filesValid] = await Promise.all([
      readJsonObject(join(root, "apps", "ulc-linz", "appbasis.database.json")),
      readJsonObject(join(root, "apps", "ulc-linz", "privacy", "m5-data-inventory.json")),
      verifyEvidenceFiles(root),
    ]);
    const expectedDatabaseManifest = createExpectedUlcLinzDatabaseManifest(definition);

    if (
      databaseManifest === undefined ||
      !isDeepStrictEqual(databaseManifest, expectedDatabaseManifest) ||
      inventory === undefined ||
      !isClosedCurrentInventory(inventory) ||
      !filesValid
    ) {
      return EMPTY_EVIDENCE;
    }

    const lifecycleContractDigest = await deriveUlcLinzLifecycleContractDigest(root);
    if (
      !isProductionLifecycleActivationVerified(
        lifecycleActivationEvidenceInput,
        lifecycleContractDigest,
        requiredDate(now),
      )
    ) {
      return EMPTY_EVIDENCE;
    }

    return VERIFIED_EVIDENCE;
  } catch {
    return EMPTY_EVIDENCE;
  }
}

async function collectLifecycleContractPaths(repositoryRoot) {
  const paths = new Set(LIFECYCLE_CONTRACT_PATHS);
  for (const directory of LIFECYCLE_CONTRACT_DIRECTORIES) {
    for (const path of await collectRegularFiles(repositoryRoot, directory)) {
      paths.add(path);
    }
  }
  return [...paths].sort((left, right) => left.localeCompare(right));
}

async function collectRegularFiles(repositoryRoot, relativeDirectory) {
  const entries = await readdir(join(repositoryRoot, relativeDirectory), {
    withFileTypes: true,
  });
  const paths = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = `${relativeDirectory}/${entry.name}`;
    if (entry.isDirectory()) {
      paths.push(...(await collectRegularFiles(repositoryRoot, relativePath)));
      continue;
    }
    if (!entry.isFile()) {
      throw new Error("ULC Linz lifecycle contract contains an unsupported filesystem entry.");
    }
    paths.push(relativePath);
  }
  return paths;
}

function isProductionLifecycleActivationVerified(input, lifecycleContractDigest, now) {
  try {
    const root = exactRecord(input, ACTIVATION_ROOT_FIELDS);
    const resourceBinding = evaluateUlcLinzProductionResourceBinding(
      root.resourceBindingEvidence,
      { now },
    );
    const activation = exactRecord(root.activationEvidence, ACTIVATION_FIELDS);
    if (
      activation.schemaVersion !== 1 ||
      activation.application !== "ulc-linz" ||
      activation.environment !== "production" ||
      activation.evidenceSource !== "controlled-production-activation-run" ||
      activation.executionBoundary !== "protected-operations" ||
      activation.lifecycleContractDigest !== lifecycleContractDigest ||
      activation.activationInventoryComplete !== true ||
      activation.deletionExecutorBound !== true ||
      activation.retentionExecutorBound !== true ||
      activation.restoreReconciliationExecutorBound !== true ||
      activation.publicIngressPresent !== false ||
      activation.observedAt !== resourceBinding.observedAt ||
      activation.validUntilOrReviewAt !== resourceBinding.validUntilOrReviewAt
    ) {
      return false;
    }
    return canonicalTimestamp(activation.observedAt) !== null &&
      canonicalTimestamp(activation.validUntilOrReviewAt) !== null;
  } catch {
    return false;
  }
}

function isExactCurrentUlcDefinition(definition) {
  return (
    definition?.appId === ULC_LINZ_LIFECYCLE_EVIDENCE_POLICY.appId &&
    isDeepStrictEqual(definition.modules, ULC_LINZ_LIFECYCLE_EVIDENCE_POLICY.modules) &&
    isDeepStrictEqual(
      definition.platformServices,
      ULC_LINZ_LIFECYCLE_EVIDENCE_POLICY.platformServices,
    )
  );
}

function isClosedCurrentInventory(inventory) {
  return (
    inventory.schemaVersion === 2 &&
    inventory.application === "ulc-linz" &&
    inventory.scope === "current-materialized-v0.2" &&
    isDeepStrictEqual(inventory.runtimeModules, ["countdown", "athletes"]) &&
    inventory.objectStorage?.status === "not-configured" &&
    inventory.objectStorage?.futureIntroduction ===
      "invalidates-current-evidence" &&
    inventory.m5?.deletionPolicy === "verified-current-scope" &&
    inventory.m5?.retentionPolicy === "verified-current-scope" &&
    inventory.m5?.restoreReconciliation === "verified-current-scope" &&
    inventory.m5?.unknownPersistentOwner === "fail-closed" &&
    inventory.m5?.unknownPersistentTable === "fail-closed" &&
    inventory.m5?.unknownRuntimeModule === "fail-closed" &&
    inventory.m5?.unknownBackingStore === "fail-closed" &&
    inventory.m5?.futureObjectStorage === "fail-closed"
  );
}

async function verifyEvidenceFiles(repositoryRoot) {
  const results = await Promise.all(
    ULC_LINZ_LIFECYCLE_EVIDENCE_POLICY.evidenceFiles.map(
      async ({ path, gitBlobSha: expectedSha }) => {
        let raw;
        try {
          raw = await readFile(join(repositoryRoot, path), "utf8");
        } catch {
          return false;
        }
        return gitBlobSha(normalizeLineEndings(raw)) === expectedSha;
      },
    ),
  );
  return results.every(Boolean);
}

async function readJsonObject(path) {
  let raw;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return undefined;
  }
  try {
    const value = JSON.parse(raw);
    return isPlainObject(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function exactRecord(value, fields) {
  if (
    !isPlainObject(value) ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) {
    throw new Error("ULC Linz lifecycle activation evidence is invalid.");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors);
  if (
    keys.length !== fields.length ||
    fields.some((field) => !Object.hasOwn(descriptors, field)) ||
    keys.some((key) => !fields.includes(key))
  ) {
    throw new Error("ULC Linz lifecycle activation evidence is invalid.");
  }
  for (const descriptor of Object.values(descriptors)) {
    if (
      !Object.hasOwn(descriptor, "value") ||
      descriptor.enumerable !== true ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    ) {
      throw new Error("ULC Linz lifecycle activation evidence is invalid.");
    }
  }
  return value;
}

function gitBlobSha(content) {
  const size = Buffer.byteLength(content, "utf8");
  return createHash("sha1")
    .update(`blob ${size}\0`, "utf8")
    .update(content, "utf8")
    .digest("hex");
}

function normalizeLineEndings(value) {
  return value.replaceAll("\r\n", "\n");
}

function canonicalTimestamp(value) {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    return null;
  }
  return parsed;
}

function requiredDate(value) {
  const parsed =
    value instanceof Date
      ? new Date(value.getTime())
      : typeof value === "string"
        ? new Date(value)
        : null;
  if (
    parsed === null ||
    !Number.isFinite(parsed.getTime()) ||
    (typeof value === "string" && parsed.toISOString() !== value)
  ) {
    throw new Error("ULC Linz lifecycle evidence clock is invalid.");
  }
  return parsed;
}

function isPlainObject(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}