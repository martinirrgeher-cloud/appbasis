import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { getAppPublicationState } from "./app-publication.mjs";

const APP_DEFINITION_FILE = "appbasis.app.json";
const APP_DEFINITION_KEYS = new Set([
  "schemaVersion",
  "appId",
  "displayName",
  "modules",
]);
const IDENTIFIER_PATTERN = /^[a-z][a-z0-9-]*$/;

export function parseAppDefinition(value, options = {}) {
  const directoryName = options.directoryName;
  if (!isPlainObject(value)) {
    throw new Error("App definition must be a JSON object.");
  }

  for (const key of Object.keys(value)) {
    if (!APP_DEFINITION_KEYS.has(key)) {
      throw new Error(`Unknown app definition field: ${key}.`);
    }
  }

  if (value.schemaVersion !== 1) {
    throw new Error("App definition schemaVersion must be 1.");
  }

  const appId = requiredIdentifier(value.appId, "appId");
  if (directoryName !== undefined && appId !== directoryName) {
    throw new Error(
      `App definition appId ${appId} must match apps/${directoryName}.`,
    );
  }

  if (
    typeof value.displayName !== "string" ||
    value.displayName.length === 0 ||
    value.displayName.length > 80 ||
    value.displayName.trim() !== value.displayName
  ) {
    throw new Error(
      "App definition displayName must be a non-empty trimmed string with at most 80 characters.",
    );
  }

  if (!Array.isArray(value.modules)) {
    throw new Error("App definition modules must be an array.");
  }

  const modules = value.modules.map((moduleName, index) =>
    requiredIdentifier(moduleName, `modules[${index}]`),
  );
  if (new Set(modules).size !== modules.length) {
    throw new Error("App definition modules must not contain duplicates.");
  }

  return Object.freeze({
    schemaVersion: 1,
    appId,
    displayName: value.displayName,
    modules: Object.freeze([...modules]),
  });
}

export async function verifyAppDefinitions(repositoryRoot = process.cwd()) {
  const appsDirectory = join(repositoryRoot, "apps");
  const modulesDirectory = join(repositoryRoot, "modules");
  const appEntries = await directoryNames(appsDirectory);
  const moduleNames = new Set(await directoryNames(modulesDirectory));

  if (appEntries.length === 0) {
    throw new Error("AppBasis requires at least one application under apps/.");
  }

  const appIds = new Set();
  const definitions = [];

  for (const directoryName of appEntries) {
    const manifestPath = join(appsDirectory, directoryName, APP_DEFINITION_FILE);
    let parsed;
    try {
      parsed = JSON.parse(await readFile(manifestPath, "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") {
        const publication = await getAppPublicationState(
          repositoryRoot,
          directoryName,
        );
        if (publication.kind === "active") continue;
        if (publication.kind === "stale") {
          throw new Error(
            `apps/${directoryName} is incomplete after interrupted app publication.`,
          );
        }
        if (publication.kind === "invalid") {
          throw new Error(
            `apps/${directoryName} has an invalid app publication claim.`,
          );
        }
        throw new Error(`apps/${directoryName} is missing ${APP_DEFINITION_FILE}.`);
      }
      if (error instanceof SyntaxError) {
        throw new Error(`apps/${directoryName}/${APP_DEFINITION_FILE} is not valid JSON.`);
      }
      throw error;
    }

    const definition = parseAppDefinition(parsed, { directoryName });
    if (appIds.has(definition.appId)) {
      throw new Error(`Duplicate appId: ${definition.appId}.`);
    }
    appIds.add(definition.appId);

    for (const moduleName of definition.modules) {
      if (!moduleNames.has(moduleName)) {
        throw new Error(
          `App ${definition.appId} references unknown module ${moduleName}.`,
        );
      }
    }

    definitions.push(definition);
  }

  return Object.freeze(definitions);
}

async function directoryNames(path) {
  const entries = await readdir(path, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function requiredIdentifier(value, field) {
  if (typeof value !== "string" || !IDENTIFIER_PATTERN.test(value)) {
    throw new Error(
      `App definition ${field} must match ${IDENTIFIER_PATTERN.source}.`,
    );
  }
  return value;
}

function isPlainObject(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}
