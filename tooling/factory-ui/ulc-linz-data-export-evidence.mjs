import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

import { createExpectedUlcLinzDatabaseManifest } from "../ulc-linz-database-contract.mjs";

const EMPTY_EVIDENCE = Object.freeze({});
const VERIFIED_EVIDENCE = Object.freeze({ dataExport: true });

export const ULC_LINZ_DATA_EXPORT_EVIDENCE_POLICY = Object.freeze({
  appId: "ulc-linz",
  modules: Object.freeze([]),
  platformServices: Object.freeze(["identity", "permissions"]),
  inventoryGitBlobSha: "7d4e1eebaf60ef618128db99491a38ae76bdba9c",
  requiredPostgresTest: "./test/data-export.postgres.e2e.test.ts",
  evidenceFiles: Object.freeze([
    Object.freeze({ path: "apps/ulc-linz/privacy/m5-export-contract.json", gitBlobSha: "1fc2f45a75ae464e2fac9324ef27f8a03d5b65f4" }),
    Object.freeze({ path: "apps/ulc-linz/worker/data-export.ts", gitBlobSha: "539c2f7455a0b847e0afda39ddfe0acd471cb8d2" }),
    Object.freeze({ path: "apps/ulc-linz/worker/data-export-service.ts", gitBlobSha: "0bb1fefba10668348a6a18e4e296e5fb21497e75" }),
    Object.freeze({ path: "apps/ulc-linz/worker/data-export-postgres.ts", gitBlobSha: "84e0a5eee074609b73e927e738b50e3a40cb87df" }),
    Object.freeze({ path: "apps/ulc-linz/test/data-export.test.ts", gitBlobSha: "de2d4b4d9c6a17b89d115cbcf7e8a141494e9dcf" }),
    Object.freeze({ path: "apps/ulc-linz/test/data-export-service.test.ts", gitBlobSha: "b238266283fa945671f80ae9359ec56505284151" }),
    Object.freeze({ path: "apps/ulc-linz/test/data-export-fail-closed.test.ts", gitBlobSha: "d73b5e2d30c30fa2c94547e1b003fb6c0093f649" }),
    Object.freeze({ path: "apps/ulc-linz/test/data-export.postgres.e2e.test.ts", gitBlobSha: "5b51decd4358d2962ced6d8cc11934533846daf3" }),
    Object.freeze({ path: "apps/ulc-linz/test/m5-export-contract.test.ts", gitBlobSha: "97923ac69499123de6b8ce87e81f6d89a431347e" }),
  ]),
});

/**
 * M5-E owns export acceptance, but does not invent the M5-F audit sink.
 * Production evidence is emitted only when the independent audit/security
 * criterion has already been explicitly verified by its own owner.
 */
export async function deriveUlcLinzDataExportEvidence(
  repositoryRoot,
  definition,
  dependentEvidence,
) {
  if (!isExactCurrentUlcDefinition(definition) || !hasExactAuditEvidence(dependentEvidence)) {
    return EMPTY_EVIDENCE;
  }

  try {
    const root = resolve(repositoryRoot);
    const [databaseManifest, inventory, exportContract, appPackage, filesValid] =
      await Promise.all([
        readJsonObject(join(root, "apps", "ulc-linz", "appbasis.database.json")),
        readJsonObject(join(root, "apps", "ulc-linz", "privacy", "m5-data-inventory.json")),
        readJsonObject(join(root, "apps", "ulc-linz", "privacy", "m5-export-contract.json")),
        readJsonObject(join(root, "apps", "ulc-linz", "package.json")),
        verifyEvidenceFiles(root),
      ]);
    const expectedDatabaseManifest = createExpectedUlcLinzDatabaseManifest(definition);

    if (
      databaseManifest === undefined ||
      !isDeepStrictEqual(databaseManifest, expectedDatabaseManifest) ||
      inventory === undefined ||
      exportContract === undefined ||
      appPackage === undefined ||
      !isCurrentInventory(inventory) ||
      !isCompleteExportClassification(inventory, exportContract) ||
      !executesPostgresAcceptance(appPackage) ||
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
    definition?.appId === ULC_LINZ_DATA_EXPORT_EVIDENCE_POLICY.appId &&
    isDeepStrictEqual(definition.modules, ULC_LINZ_DATA_EXPORT_EVIDENCE_POLICY.modules) &&
    isDeepStrictEqual(
      definition.platformServices,
      ULC_LINZ_DATA_EXPORT_EVIDENCE_POLICY.platformServices,
    )
  );
}

function hasExactAuditEvidence(value) {
  if (!isPlainObject(value) || Object.keys(value).length !== 1) return false;
  const descriptor = Object.getOwnPropertyDescriptor(value, "auditSecurityLogging");
  return descriptor !== undefined && "value" in descriptor && descriptor.value === true;
}

function isCurrentInventory(inventory) {
  return (
    inventory.schemaVersion === 2 &&
    inventory.application === "ulc-linz" &&
    inventory.scope === "current-materialized-v0.1" &&
    Array.isArray(inventory.persistentTables) &&
    inventory.persistentTables.length === 19 &&
    inventory.runtimeModules?.length === 0 &&
    inventory.backingStores?.memberships?.status === "bound" &&
    inventory.backingStores?.subjectScopes?.status === "bound" &&
    inventory.objectStorage?.status === "not-configured" &&
    inventory.m5?.unknownPersistentOwner === "fail-closed" &&
    inventory.m5?.unknownPersistentTable === "fail-closed" &&
    inventory.m5?.unknownRuntimeModule === "fail-closed" &&
    inventory.m5?.unknownBackingStore === "fail-closed" &&
    inventory.m5?.futureObjectStorage === "fail-closed"
  );
}

function isCompleteExportClassification(inventory, exportContract) {
  if (
    exportContract.schemaVersion !== 1 ||
    exportContract.appId !== "ulc-linz" ||
    exportContract.canonicalFormat !== "json" ||
    !isDeepStrictEqual(exportContract.supplementaryFormats, ["csv"]) ||
    exportContract.unknownDataset !== "deny" ||
    !isDeepStrictEqual(exportContract.runtimeModules, []) ||
    !Array.isArray(exportContract.datasets) ||
    !Array.isArray(exportContract.excludedTables)
  ) {
    return false;
  }

  const inventoryRows = inventory.persistentTables.map((row) =>
    `${row.owner}:${row.id}:${row.privacyClass}`,
  );
  const classifiedRows = [
    ...exportContract.datasets.flatMap((dataset) =>
      Array.isArray(dataset.sourceTables)
        ? dataset.sourceTables.map((row) => `${row.owner}:${row.table}:${row.privacyClass}`)
        : [],
    ),
    ...exportContract.excludedTables.map(
      (row) => `${row.owner}:${row.table}:${row.privacyClass}`,
    ),
  ];
  return (
    new Set(inventoryRows).size === inventoryRows.length &&
    new Set(classifiedRows).size === classifiedRows.length &&
    isDeepStrictEqual([...inventoryRows].sort(), [...classifiedRows].sort())
  );
}

function executesPostgresAcceptance(appPackage) {
  const script = appPackage.scripts?.["test:postgres"];
  return (
    typeof script === "string" &&
    script.split(/\s+/u).includes(ULC_LINZ_DATA_EXPORT_EVIDENCE_POLICY.requiredPostgresTest)
  );
}

async function verifyEvidenceFiles(repositoryRoot) {
  const inventoryRaw = await safeRead(
    join(repositoryRoot, "apps", "ulc-linz", "privacy", "m5-data-inventory.json"),
  );
  if (
    inventoryRaw === undefined ||
    gitBlobSha(normalizeLineEndings(inventoryRaw)) !==
      ULC_LINZ_DATA_EXPORT_EVIDENCE_POLICY.inventoryGitBlobSha
  ) {
    return false;
  }

  const results = await Promise.all(
    ULC_LINZ_DATA_EXPORT_EVIDENCE_POLICY.evidenceFiles.map(
      async ({ path, gitBlobSha: expectedSha }) => {
        const raw = await safeRead(join(repositoryRoot, path));
        return raw !== undefined && gitBlobSha(normalizeLineEndings(raw)) === expectedSha;
      },
    ),
  );
  return results.every(Boolean);
}

async function safeRead(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

async function readJsonObject(path) {
  const raw = await safeRead(path);
  if (raw === undefined) return undefined;
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
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  );
}
