import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyAppDefinitions } from "./app-definition.mjs";
import { createGeneratedDatabaseManifest } from "./generated-database-manifest.mjs";
import {
  assertAppModuleCompatibility,
  verifyModuleDefinitions,
} from "./module-definition.mjs";

const IDENTIFIER_PATTERN = /^[a-z][a-z0-9-]*$/;
const WORKSPACE_DEPENDENCY = "workspace:*";

export async function planModuleUpdate(input, options = {}) {
  const repositoryRoot = resolve(options.repositoryRoot ?? process.cwd());
  const appId = requiredIdentifier(input?.appId, "appId");
  const moduleId = requiredIdentifier(input?.moduleId, "moduleId");

  const [appDefinitions, moduleDefinitions] = await Promise.all([
    verifyAppDefinitions(repositoryRoot),
    verifyModuleDefinitions(repositoryRoot),
  ]);
  const appDefinition = appDefinitions.find(
    (definition) => definition.appId === appId,
  );
  if (appDefinition === undefined) {
    throw new Error(`Unknown AppBasis app: ${appId}.`);
  }
  const moduleDefinition = moduleDefinitions.find(
    (definition) => definition.moduleId === moduleId,
  );
  if (moduleDefinition === undefined) {
    throw new Error(`Unknown AppBasis module: ${moduleId}.`);
  }

  assertAppModuleCompatibility(appDefinition, moduleDefinition);

  const appRoot = join(repositoryRoot, "apps", appId);
  const appPackagePath = join(appRoot, "package.json");
  const modulePackagePath = join(
    repositoryRoot,
    "modules",
    moduleId,
    "package.json",
  );
  const databaseManifestPath = join(appRoot, "appbasis.database.json");

  const [appPackage, modulePackage, currentDatabaseManifest] = await Promise.all([
    readRequiredJson(appPackagePath, `apps/${appId}/package.json`),
    readRequiredJson(
      modulePackagePath,
      `modules/${moduleId}/package.json`,
    ),
    readOptionalJson(
      databaseManifestPath,
      `apps/${appId}/appbasis.database.json`,
    ),
  ]);

  const appPackageName = requiredPackageName(
    appPackage.name,
    `apps/${appId}/package.json name`,
  );
  const appPackageVersion = requiredVersion(
    appPackage.version,
    `apps/${appId}/package.json version`,
  );
  const modulePackageName = requiredPackageName(
    modulePackage.name,
    `modules/${moduleId}/package.json name`,
  );
  const modulePackageVersion = requiredVersion(
    modulePackage.version,
    `modules/${moduleId}/package.json version`,
  );
  if (modulePackageName !== moduleDefinition.packageName) {
    throw new Error(
      `Module ${moduleId} package name drift: expected ${moduleDefinition.packageName}, found ${modulePackageName}.`,
    );
  }

  const dependencies = plainObject(appPackage.dependencies)
    ? appPackage.dependencies
    : {};
  const currentDependency = dependencies[modulePackageName];
  const alreadyDeclared = appDefinition.modules.includes(moduleId);

  if (!alreadyDeclared && currentDependency !== undefined) {
    throw new Error(
      `App ${appId} already depends on ${modulePackageName} but does not declare module ${moduleId}.`,
    );
  }
  if (
    alreadyDeclared &&
    currentDependency !== WORKSPACE_DEPENDENCY
  ) {
    throw new Error(
      `App ${appId} declares module ${moduleId} but dependency ${modulePackageName} is not ${WORKSPACE_DEPENDENCY}.`,
    );
  }

  const expectedCurrentDatabaseManifest = createGeneratedDatabaseManifest(
    appDefinition,
    { moduleDefinitions },
  );
  assertDatabaseManifestMatches(
    appId,
    currentDatabaseManifest,
    expectedCurrentDatabaseManifest,
  );

  const nextModules = alreadyDeclared
    ? [...appDefinition.modules]
    : [...appDefinition.modules, moduleId];
  const nextDefinition = Object.freeze({
    ...appDefinition,
    modules: Object.freeze(nextModules),
  });
  const nextDatabaseManifest = createGeneratedDatabaseManifest(nextDefinition, {
    moduleDefinitions,
  });
  const databaseChanges =
    canonicalJson(currentDatabaseManifest) === canonicalJson(nextDatabaseManifest)
      ? null
      : Object.freeze({
          path: `apps/${appId}/appbasis.database.json`,
          before: currentDatabaseManifest,
          after: nextDatabaseManifest,
        });

  const state = alreadyDeclared ? "already-installed" : "install";
  const writes =
    state === "already-installed"
      ? []
      : [
          `apps/${appId}/appbasis.app.json`,
          `apps/${appId}/package.json`,
          ...(databaseChanges === null
            ? []
            : [`apps/${appId}/appbasis.database.json`]),
          "pnpm-lock.yaml",
        ];

  return Object.freeze({
    schemaVersion: 1,
    operation: "module-install",
    state,
    app: Object.freeze({
      appId,
      definitionSchemaVersion: appDefinition.schemaVersion,
      packageName: appPackageName,
      packageVersion: appPackageVersion,
    }),
    module: Object.freeze({
      moduleId,
      manifestSchemaVersion: moduleDefinition.schemaVersion,
      packageName: modulePackageName,
      packageVersion: modulePackageVersion,
      databaseSchemaVersion: moduleDefinition.database?.schemaVersion ?? null,
    }),
    changes: Object.freeze({
      appDefinition:
        state === "already-installed"
          ? null
          : Object.freeze({
              path: `apps/${appId}/appbasis.app.json`,
              beforeModules: Object.freeze([...appDefinition.modules]),
              afterModules: Object.freeze(nextModules),
            }),
      packageDependency:
        state === "already-installed"
          ? null
          : Object.freeze({
              path: `apps/${appId}/package.json`,
              dependency: modulePackageName,
              before: null,
              after: WORKSPACE_DEPENDENCY,
            }),
      databaseManifest: databaseChanges,
      workspaceLockfile:
        state === "already-installed"
          ? null
          : Object.freeze({
              path: "pnpm-lock.yaml",
              action: "finalize-workspace",
            }),
    }),
    writes: Object.freeze(writes),
  });
}

export function renderModuleUpdatePlan(plan) {
  return `${JSON.stringify(plan, null, 2)}\n`;
}

export function parseModuleUpdatePlanArguments(args) {
  let appId;
  let moduleId;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--app-id") {
      appId = requiredFlagValue(args, ++index, argument);
      continue;
    }
    if (argument === "--module") {
      moduleId = requiredFlagValue(args, ++index, argument);
      continue;
    }
    throw new Error(`Unknown module update planner argument: ${argument}.`);
  }

  if (appId === undefined) throw new Error("Missing required --app-id.");
  if (moduleId === undefined) throw new Error("Missing required --module.");

  return Object.freeze({ appId, moduleId });
}

async function runCli() {
  const input = parseModuleUpdatePlanArguments(process.argv.slice(2));
  const plan = await planModuleUpdate(input);
  process.stdout.write(renderModuleUpdatePlan(plan));
}

function assertDatabaseManifestMatches(appId, actual, expected) {
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error(
      `App ${appId} database manifest has drifted from its verified app/module ownership contract.`,
    );
  }
}

function canonicalJson(value) {
  return value === null ? "null" : JSON.stringify(value);
}

async function readRequiredJson(path, label) {
  let raw;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`${label} is missing.`);
    }
    throw error;
  }
  return parseJsonObject(raw, label);
}

async function readOptionalJson(path, label) {
  try {
    return parseJsonObject(await readFile(path, "utf8"), label);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function parseJsonObject(raw, label) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
  if (!plainObject(value)) {
    throw new Error(`${label} must contain a JSON object.`);
  }
  return value;
}

function requiredIdentifier(value, field) {
  if (typeof value !== "string" || !IDENTIFIER_PATTERN.test(value)) {
    throw new Error(`${field} must be a lowercase kebab-case identifier.`);
  }
  return value;
}

function requiredPackageName(value, field) {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw new Error(`${field} must be a non-empty trimmed string.`);
  }
  return value;
}

function requiredVersion(value, field) {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw new Error(`${field} must be a non-empty trimmed string.`);
  }
  return value;
}

function requiredFlagValue(args, index, flag) {
  const value = args[index];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}

function plainObject(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
