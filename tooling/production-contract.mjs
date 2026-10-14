import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { parseAppDefinition } from "./app-definition.mjs";
import { createGeneratedDatabaseManifest } from "./generated-database-manifest.mjs";
import {
  assertAppModuleCompatibility,
  verifySelectedModuleDefinitions,
} from "./module-definition.mjs";

const PRODUCTION_CONTRACT_FILE = "appbasis.production.json";
const CONTRACT_STATUS = new Set(["ready", "blocked"]);
const REQUIREMENT_STATUS = new Set(["verified", "not-applicable", "blocked"]);
const MODULE_REQUIREMENTS = Object.freeze([
  "authorization",
  "database",
  "lifecycle",
]);
const APP_REQUIREMENTS = Object.freeze([
  "dataExport",
  "applicationLifecycle",
  "privacy",
]);

export async function evaluateAppProductionComposition(
  repositoryRoot,
  appId,
) {
  const root = resolve(repositoryRoot);
  const appDefinition = parseAppDefinition(
    await readJson(
      join(root, "apps", appId, "appbasis.app.json"),
      `apps/${appId}/appbasis.app.json`,
    ),
    { directoryName: appId },
  );
  const appContract = parseAppProductionContract(
    await readJson(
      join(root, "apps", appId, PRODUCTION_CONTRACT_FILE),
      `apps/${appId}/${PRODUCTION_CONTRACT_FILE}`,
    ),
    appDefinition,
  );
  await verifyEvidenceBindings(root, appContract.evidence);

  const moduleDefinitions = await verifySelectedModuleDefinitions(
    root,
    appDefinition.modules,
  );
  const moduleById = new Map(
    moduleDefinitions.map((definition) => [definition.moduleId, definition]),
  );
  const databaseManifest = await readOptionalJson(
    join(root, "apps", appId, "appbasis.database.json"),
  );
  const canonicalDatabaseManifest = createGeneratedDatabaseManifest(
    appDefinition,
    { moduleDefinitions },
  );
  if (!isDeepStrictEqual(databaseManifest, canonicalDatabaseManifest)) {
    throw new Error(
      "App database manifest does not match canonical generated ownership.",
    );
  }
  const databaseOwners = new Map(
    (canonicalDatabaseManifest?.owners ?? []).map((owner) => [owner.id, owner]),
  );

  const modules = [];
  const blockers = [...appContract.blockers];

  for (const moduleId of appDefinition.modules) {
    const definition = moduleById.get(moduleId);
    if (definition === undefined) {
      throw new Error(
        `Production composition references unknown module ${moduleId}.`,
      );
    }
    assertAppModuleCompatibility(appDefinition, definition);
    const contract = parseModuleProductionContract(
      await readJson(
        join(root, "modules", moduleId, PRODUCTION_CONTRACT_FILE),
        `modules/${moduleId}/${PRODUCTION_CONTRACT_FILE}`,
      ),
      definition,
    );
    await verifyEvidenceBindings(root, contract.evidence);
    verifyDatabaseBinding(definition, contract, databaseOwners);

    modules.push(
      Object.freeze({
        moduleId,
        status: contract.status,
        requirements: contract.requirements,
        blockers: contract.blockers,
      }),
    );
    for (const blocker of contract.blockers) {
      blockers.push(`${moduleId}: ${blocker}`);
    }
  }

  const ready =
    appContract.status === "ready" &&
    modules.every((module) => module.status === "ready");

  return deepFreeze({
    schemaVersion: 1,
    application: appDefinition.appId,
    modules,
    platformServices: [...appDefinition.platformServices],
    crossCutting: appContract.crossCutting,
    status: ready ? "ready" : "blocked",
    compositionReady: ready,
    blockers,
    productionReleaseAuthorized: false,
  });
}

export function parseModuleProductionContract(value, moduleDefinition) {
  const contract = exactRecord(
    value,
    ["schemaVersion", "moduleId", "status", "requirements", "evidence", "blockers"],
    "module production contract",
  );
  if (
    contract.schemaVersion !== 1 ||
    contract.moduleId !== moduleDefinition?.moduleId ||
    !CONTRACT_STATUS.has(contract.status)
  ) {
    throw new Error("Module production contract target is invalid.");
  }
  const requirements = parseRequirements(
    contract.requirements,
    MODULE_REQUIREMENTS,
    "module",
  );
  const evidence = parseEvidence(
    contract.evidence,
    MODULE_REQUIREMENTS,
    `modules/${moduleDefinition.moduleId}`,
    "module",
  );
  const blockers = parseBlockers(contract.blockers, "module");

  assertVerifiedRequirementsHaveEvidence(requirements, evidence, "module");

  if (
    Array.isArray(moduleDefinition?.capabilities) &&
    moduleDefinition.capabilities.length > 0 &&
    requirements.authorization === "not-applicable"
  ) {
    throw new Error(
      `Module ${contract.moduleId} with capabilities cannot mark authorization production readiness not-applicable.`,
    );
  }

  if (moduleDefinition.database === null) {
    if (requirements.database !== "not-applicable") {
      throw new Error(
        `Module ${contract.moduleId} without a database must mark database production readiness not-applicable.`,
      );
    }
  } else if (requirements.database === "not-applicable") {
    throw new Error(
      `Module ${contract.moduleId} with a database cannot mark database production readiness not-applicable.`,
    );
  }

  assertStatusMatches(contract.status, requirements, blockers, "module");
  return deepFreeze({
    schemaVersion: 1,
    moduleId: contract.moduleId,
    status: contract.status,
    requirements,
    evidence,
    blockers,
  });
}

export function parseAppProductionContract(value, appDefinition) {
  const contract = exactRecord(
    value,
    [
      "schemaVersion",
      "appId",
      "modules",
      "platformServices",
      "status",
      "crossCutting",
      "evidence",
      "blockers",
    ],
    "app production contract",
  );
  if (
    contract.schemaVersion !== 1 ||
    contract.appId !== appDefinition?.appId ||
    !CONTRACT_STATUS.has(contract.status)
  ) {
    throw new Error("App production contract target is invalid.");
  }
  if (
    !isDeepStrictEqual(contract.modules, [...appDefinition.modules]) ||
    !isDeepStrictEqual(
      contract.platformServices,
      [...appDefinition.platformServices],
    )
  ) {
    throw new Error(
      "App production contract must match the exact selected module and platform-service composition.",
    );
  }
  const crossCutting = parseRequirements(
    contract.crossCutting,
    APP_REQUIREMENTS,
    "app",
  );
  const evidence = parseEvidence(
    contract.evidence,
    APP_REQUIREMENTS,
    `apps/${appDefinition.appId}`,
    "app",
  );
  const blockers = parseBlockers(contract.blockers, "app");
  assertVerifiedRequirementsHaveEvidence(crossCutting, evidence, "app");
  assertStatusMatches(contract.status, crossCutting, blockers, "app");

  return deepFreeze({
    schemaVersion: 1,
    appId: contract.appId,
    modules: [...contract.modules],
    platformServices: [...contract.platformServices],
    status: contract.status,
    crossCutting,
    evidence,
    blockers,
  });
}

function verifyDatabaseBinding(definition, contract, ownersById) {
  const owner = ownersById.get(definition.moduleId);
  if (definition.database === null) {
    if (owner !== undefined) {
      throw new Error(
        `Database manifest unexpectedly contains owner ${definition.moduleId}.`,
      );
    }
    return;
  }
  if (contract.requirements.database !== "verified") return;
  if (
    owner === undefined ||
    owner?.id !== definition.moduleId ||
    owner?.root !== `modules/${definition.moduleId}` ||
    owner?.schemaVersion !== definition.database.schemaVersion ||
    !isDeepStrictEqual(owner?.migrations, [...definition.database.migrations])
  ) {
    throw new Error(
      `Database manifest is not bound to the selected ${definition.moduleId} module contract.`,
    );
  }
}

function parseRequirements(value, fields, label) {
  const record = exactRecord(value, fields, `${label} production requirements`);
  const result = {};
  for (const field of fields) {
    const status = record[field];
    if (!REQUIREMENT_STATUS.has(status)) {
      throw new Error(
        `${label} production requirement ${field} has an invalid status.`,
      );
    }
    result[field] = status;
  }
  return Object.freeze(result);
}

function parseEvidence(value, fields, scopeRoot, label) {
  const record = exactRecord(
    value,
    fields,
    `${label} production evidence`,
  );
  const result = {};
  for (const field of fields) {
    const entries = record[field];
    if (!Array.isArray(entries)) {
      throw new Error(
        `${label} production evidence ${field} must be an array.`,
      );
    }
    const seen = new Set();
    result[field] = Object.freeze(
      entries.map((entry) => {
        const normalized = exactRecord(
          entry,
          ["path", "gitBlobSha"],
          `${label} production evidence entry`,
        );
        if (
          typeof normalized.path !== "string" ||
          !normalized.path.startsWith(`${scopeRoot}/`) ||
          normalized.path.includes("\\") ||
          normalized.path.split("/").some(
            (segment) =>
              segment.length === 0 ||
              segment === "." ||
              segment === "..",
          ) ||
          normalized.path.length > 300
        ) {
          throw new Error(
            `${label} production evidence path must stay within ${scopeRoot}.`,
          );
        }
        if (
          typeof normalized.gitBlobSha !== "string" ||
          !/^[0-9a-f]{40}$/.test(normalized.gitBlobSha)
        ) {
          throw new Error(
            `${label} production evidence gitBlobSha is invalid.`,
          );
        }
        if (seen.has(normalized.path)) {
          throw new Error(
            `${label} production evidence paths must not contain duplicates.`,
          );
        }
        seen.add(normalized.path);
        return Object.freeze({
          path: normalized.path,
          gitBlobSha: normalized.gitBlobSha,
        });
      }),
    );
  }
  return Object.freeze(result);
}

function assertVerifiedRequirementsHaveEvidence(requirements, evidence, label) {
  for (const [requirement, status] of Object.entries(requirements)) {
    if (status === "verified" && evidence[requirement].length === 0) {
      throw new Error(
        `${label} production requirement ${requirement} is verified without pinned evidence.`,
      );
    }
    if (status === "not-applicable" && evidence[requirement].length !== 0) {
      throw new Error(
        `${label} production requirement ${requirement} is not-applicable but still declares evidence.`,
      );
    }
  }
}

async function verifyEvidenceBindings(repositoryRoot, evidence) {
  for (const entries of Object.values(evidence)) {
    for (const entry of entries) {
      await assertEvidencePathIsRegularFile(repositoryRoot, entry.path);
      const content = await readFile(join(repositoryRoot, entry.path));
      const digest = createHash("sha1")
        .update(`blob ${content.length}\0`, "utf8")
        .update(content)
        .digest("hex");
      if (digest !== entry.gitBlobSha) {
        throw new Error(
          `Production evidence drifted: ${entry.path}.`,
        );
      }
    }
  }
}

async function assertEvidencePathIsRegularFile(repositoryRoot, relativePath) {
  let absolutePath = repositoryRoot;
  let stats;

  for (const segment of relativePath.split("/")) {
    absolutePath = join(absolutePath, segment);
    try {
      stats = await lstat(absolutePath);
    } catch (error) {
      if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
        throw new Error(
          `Production evidence path is missing or invalid: ${relativePath}.`,
        );
      }
      throw error;
    }
    if (stats.isSymbolicLink()) {
      throw new Error(
        `Production evidence must not contain symbolic links: ${relativePath}.`,
      );
    }
  }

  if (!stats?.isFile()) {
    throw new Error(
      `Production evidence must resolve to a regular file: ${relativePath}.`,
    );
  }
}

function parseBlockers(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} production blockers must be an array.`);
  }
  const blockers = [];
  const seen = new Set();
  for (const blocker of value) {
    if (
      typeof blocker !== "string" ||
      blocker.length < 1 ||
      blocker.length > 240 ||
      blocker.trim() !== blocker ||
      seen.has(blocker)
    ) {
      throw new Error(`${label} production blocker is invalid.`);
    }
    seen.add(blocker);
    blockers.push(blocker);
  }
  return Object.freeze(blockers);
}

function assertStatusMatches(status, requirements, blockers, label) {
  const blocked = Object.values(requirements).includes("blocked");
  if (status === "ready" && (blocked || blockers.length !== 0)) {
    throw new Error(
      `${label} production contract cannot be ready with blocked requirements or blockers.`,
    );
  }
  if (status === "blocked" && !blocked && blockers.length === 0) {
    throw new Error(
      `${label} production contract must identify a blocked requirement or blocker.`,
    );
  }
}

async function readJson(path, label) {
  let raw;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`${label} is missing.`);
    }
    throw error;
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
}

async function readOptionalJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function exactRecord(value, fields, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a JSON object.`);
  }
  const keys = Object.keys(value);
  if (
    keys.length !== fields.length ||
    fields.some((field) => !Object.hasOwn(value, field)) ||
    keys.some((key) => !fields.includes(key))
  ) {
    throw new Error(`${label} has an invalid shape.`);
  }
  return value;
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

async function main(argv = process.argv.slice(2)) {
  if (
    argv.length < 1 ||
    argv.length > 2 ||
    (argv[1] !== undefined && argv[1] !== "--require-ready")
  ) {
    throw new Error(
      "Usage: node tooling/production-contract.mjs <app-id> [--require-ready]",
    );
  }
  const result = await evaluateAppProductionComposition(process.cwd(), argv[0]);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (argv[1] === "--require-ready" && result.compositionReady !== true) {
    const detail =
      result.blockers.length === 0
        ? "unknown"
        : result.blockers.join("; ");
    console.error(
      `Production composition blocked for ${result.application}: ${detail}`,
    );
    process.exitCode = 2;
  }
}

if (
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : "Production composition evaluation failed.",
    );
    process.exitCode = 1;
  });
}