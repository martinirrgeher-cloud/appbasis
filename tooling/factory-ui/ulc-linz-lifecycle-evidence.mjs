import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

import { createExpectedUlcLinzDatabaseManifest } from "../ulc-linz-database-contract.mjs";

const EMPTY_EVIDENCE = Object.freeze({});
const VERIFIED_EVIDENCE = Object.freeze({
  deletionConcept: true,
  retention: true,
});

export const ULC_LINZ_LIFECYCLE_EVIDENCE_POLICY = Object.freeze({
  appId: "ulc-linz",
  modules: Object.freeze([]),
  platformServices: Object.freeze(["identity", "permissions"]),
  evidenceFiles: Object.freeze([
    Object.freeze({
      path: "apps/ulc-linz/privacy/m5-data-inventory.json",
      gitBlobSha: "e46cd5d1a769cc431da7b458798770506c3c8fe0",
    }),
    Object.freeze({
      path: "apps/ulc-linz/migrations/0000_ulc_linz_lifecycle_scope.sql",
      gitBlobSha: "7537cb735a897502f128b15600a77fbcd7aff053",
    }),
    Object.freeze({
      path: "apps/ulc-linz/worker/lifecycle-service.ts",
      gitBlobSha: "161b097219440d35d802bf2407885a46286d7fb9",
    }),
    Object.freeze({
      path: "apps/ulc-linz/worker/scope-persistence.ts",
      gitBlobSha: "14353510303efec4edcbf32251caa12cb81bfb46",
    }),
    Object.freeze({
      path: "apps/ulc-linz/worker/retention.ts",
      gitBlobSha: "078445fb916dec88aa68402f0bae1776bdfee8e6",
    }),
    Object.freeze({
      path: "apps/ulc-linz/worker/restore-reconciliation.ts",
      gitBlobSha: "7f802ea2ec123c424cbc704d31f2d763be89c939",
    }),
    Object.freeze({
      path: "packages/identity/src/postgres-deletion-retention.ts",
      gitBlobSha: "492deda96c02ec12e1396322e1399a37a79088ca",
    }),
    Object.freeze({
      path: "packages/permissions/src/permission-administration-audit-retention.ts",
      gitBlobSha: "afa469cfbf77fc5487de56ac7ed3ebbb126db7c6",
    }),
    Object.freeze({
      path: "apps/ulc-linz/test/lifecycle.postgres.e2e.test.ts",
      gitBlobSha: "24514359a17aae3418034ccd0835ec18f27bf2d9",
    }),
    Object.freeze({
      path: "apps/ulc-linz/test/lifecycle-persistence.postgres.e2e.test.ts",
      gitBlobSha: "d9e3d4d4591facca564a62d59c3958bf67cba5cf",
    }),
    Object.freeze({
      path: "apps/ulc-linz/test/m5-data-inventory.test.ts",
      gitBlobSha: "b3127e29511ec85a6cb52f0dd2658a428cfe769b",
    }),
    Object.freeze({
      path: "packages/permissions/test/permission-administration-audit-retention.postgres.e2e.ts",
      gitBlobSha: "1ae4f25db8d1ed632901d50a3382d0a86f82a3a5",
    }),
  ]),
});

export async function deriveUlcLinzLifecycleEvidence(repositoryRoot, definition) {
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

    return VERIFIED_EVIDENCE;
  } catch {
    return EMPTY_EVIDENCE;
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
    inventory.scope === "current-materialized-v0.1" &&
    inventory.objectStorage?.status === "not-configured" &&
    inventory.objectStorage?.futureIntroduction ===
      "invalidates-current-cd-evidence" &&
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

function isPlainObject(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}
