import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { parseAppDefinition } from "./app-definition.mjs";
import { verifyModuleDefinitions } from "./module-definition.mjs";

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

  const moduleDefinitions = await verifyModuleDefinitions(root);
  const moduleById = new Map(
    moduleDefinitions.map((definition) => [definition.moduleId, definition]),
  );
  const databaseManifest = await readOptionalJson(
    join(root, "apps", appId, "appbasis.database.json"),
  );
  const databaseOwners = new Map(
    Array.isArray(databaseManifest?.owners)
      ? databaseManifest.owners.map((owner) => [owner?.id, owner])
      : [],
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
    const contract = parseModuleProductionContract(
      await readJson(
        join(root, "modules", moduleId, PRODUCTION_CONTRACT_FILE),
        `modules/${moduleId}/${PRODUCTION_CONTRACT_FILE}`,
      ),
      definition,
    );
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
    ["schemaVersion", "moduleId", "status", "requirements", "blockers"],
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
  const blockers = parseBlockers(contract.blockers, "module");

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
  const blockers = parseBlockers(contract.blockers, "app");
  assertStatusMatches(contract.status, crossCutting, blockers, "app");

  return deepFreeze({
    schemaVersion: 1,
    appId: contract.appId,
    modules: [...contract.modules],
    platformServices: [...contract.platformServices],
    status: contract.status,
    crossCutting,
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
