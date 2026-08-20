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
      gitBlobSha: "7d4e1eebaf60ef618128db99491a38ae76bdba9c",
    }),
    Object.freeze({
      path: "apps/ulc-linz/migrations/0000_ulc_linz_lifecycle_scope.sql",
      gitBlobSha: "c8db1d7d437ac8f575fad268bc219c588c666bd8",
    }),
    Object.freeze({
      path: "apps/ulc-linz/package.json",
      gitBlobSha: "21180582e2cb2f23e97ccfdd6a0cb95c0f45ce8d",
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
      gitBlobSha: "0c829face28f10b415caf410c664562147caf81f",
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
      gitBlobSha: "d4e99bfa31a15af9ec0ad4faf0bcb0d029aa1790",
    }),
    Object.freeze({
      path: "apps/ulc-linz/worker/retention.ts",
      gitBlobSha: "688c8d641851f0c5e70d9331be913b58d82ecf7b",
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
      gitBlobSha: "24514359a17aae3418034ccd0835ec18f27bf2d9",
    }),
    Object.freeze({
      path: "apps/ulc-linz/test/lifecycle-persistence.postgres.e2e.test.ts",
      gitBlobSha: "5db555f80cf4289d15e26b1211a1e5e6cb6ebe46",
    }),
    Object.freeze({
      path: "apps/ulc-linz/test/lifecycle-audit.postgres.e2e.test.ts",
      gitBlobSha: "b7d4681234af3535c5b45e0319099df3d1ef8c20",
    }),
    Object.freeze({
      path: "apps/ulc-linz/test/retention-state.test.ts",
      gitBlobSha: "9a85ae20482f639940dfe467ac16474074a02939",
    }),
    Object.freeze({
      path: "apps/ulc-linz/test/m5-data-inventory.test.ts",
      gitBlobSha: "d93242bc4042333a29c159882775afac571593e0",
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
