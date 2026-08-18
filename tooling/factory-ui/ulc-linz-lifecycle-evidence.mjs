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
      gitBlobSha: "812f3bd9782c1481d109d6d99a4220ba97264d85",
    }),
    Object.freeze({
      path: "apps/ulc-linz/migrations/0000_ulc_linz_lifecycle_scope.sql",
      gitBlobSha: "1254dc8bee280d6bec4a4436f792e83386461ef7",
    }),
    Object.freeze({
      path: "apps/ulc-linz/worker/lifecycle-service.ts",
      gitBlobSha: "afcc8440506dc99748a6f5c82cd0be776232902d",
    }),
    Object.freeze({
      path: "apps/ulc-linz/worker/scope-persistence.ts",
      gitBlobSha: "bc03bcac6095d0bb3569b4bde8ec24bcb232b5c9",
    }),
    Object.freeze({
      path: "apps/ulc-linz/worker/retention.ts",
      gitBlobSha: "078445fb916dec88aa68402f0bae1776bdfee8e6",
    }),
    Object.freeze({
      path: "apps/ulc-linz/worker/restore-reconciliation.ts",
      gitBlobSha: "600864fad72cfb4b38c3987f693955d896c1bd74",
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
      gitBlobSha: "5db555f80cf4289d15e26b1211a1e5e6cb6ebe46",
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
