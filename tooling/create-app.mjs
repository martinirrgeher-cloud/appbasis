import { randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseAppDefinition } from "./app-definition.mjs";
import { acquireAppPublicationClaim } from "./app-publication.mjs";

const STAGING_PREFIX = ".appbasis-create-";

export async function createAppSkeleton(input, options = {}) {
  const repositoryRoot = resolve(options.repositoryRoot ?? process.cwd());
  const definition = parseAppDefinition(
    {
      schemaVersion: 1,
      appId: input.appId,
      displayName: input.displayName,
      modules: input.modules ?? [],
    },
    { directoryName: input.appId },
  );

  const availableModules = new Set(
    await directoryNames(join(repositoryRoot, "modules")),
  );
  for (const moduleName of definition.modules) {
    if (!availableModules.has(moduleName)) {
      throw new Error(`Unknown AppBasis module: ${moduleName}.`);
    }
  }

  const appsDirectory = join(repositoryRoot, "apps");
  await mkdir(appsDirectory, { recursive: true });
  const destination = join(appsDirectory, definition.appId);
  if (await pathExists(destination)) {
    throw new Error(`App destination already exists: apps/${definition.appId}.`);
  }

  const stagingDirectory = join(
    repositoryRoot,
    `${STAGING_PREFIX}${definition.appId}-${randomUUID()}`,
  );
  await mkdir(stagingDirectory);

  let publicationClaim;
  let destinationReserved = false;
  let published = false;

  try {
    await writeFile(
      join(stagingDirectory, "appbasis.app.json"),
      `${JSON.stringify(definition, null, 2)}\n`,
      { flag: "wx" },
    );
    await writeFile(
      join(stagingDirectory, "README.md"),
      generatedReadme(definition),
      { flag: "wx" },
    );

    await options.testingHooks?.afterStage?.({
      destination,
      stagingDirectory,
    });

    publicationClaim = await acquireAppPublicationClaim(
      repositoryRoot,
      definition.appId,
    );

    try {
      await mkdir(destination);
      destinationReserved = true;
    } catch (error) {
      if (error?.code === "EEXIST") {
        throw new Error(`App destination already exists: apps/${definition.appId}.`);
      }
      throw error;
    }

    await options.testingHooks?.afterReserve?.({
      destination,
      stagingDirectory,
    });

    // Publish the manifest last. While the destination is reserved but the
    // manifest is absent, verify:apps recognizes the live publication claim
    // and does not mistake the in-flight directory for a completed app.
    await rename(
      join(stagingDirectory, "README.md"),
      join(destination, "README.md"),
    );
    await rename(
      join(stagingDirectory, "appbasis.app.json"),
      join(destination, "appbasis.app.json"),
    );
    await rm(stagingDirectory, { recursive: true, force: true });
    published = true;
  } catch (error) {
    if (destinationReserved && !published) {
      await rm(destination, { recursive: true, force: true });
    }
    await rm(stagingDirectory, { recursive: true, force: true });
    throw error;
  } finally {
    await publicationClaim?.release();
  }

  return Object.freeze({
    definition,
    destination,
    relativeDestination: relative(repositoryRoot, destination),
  });
}

export function parseCreateAppArguments(args) {
  let appId;
  let displayName;
  const modules = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--app-id") {
      appId = requiredFlagValue(args, ++index, argument);
      continue;
    }
    if (argument === "--display-name") {
      displayName = requiredFlagValue(args, ++index, argument);
      continue;
    }
    if (argument === "--module") {
      modules.push(requiredFlagValue(args, ++index, argument));
      continue;
    }
    throw new Error(`Unknown app generator argument: ${argument}.`);
  }

  if (appId === undefined) throw new Error("Missing required --app-id.");
  if (displayName === undefined) {
    throw new Error("Missing required --display-name.");
  }

  return Object.freeze({
    appId,
    displayName,
    modules: Object.freeze(modules),
  });
}

async function runCli() {
  const input = parseCreateAppArguments(process.argv.slice(2));
  const result = await createAppSkeleton(input);
  console.log(`Created AppBasis app skeleton: ${result.relativeDestination}.`);
}

function generatedReadme(definition) {
  const modules =
    definition.modules.length === 0 ? "none" : definition.modules.join(", ");
  return `# ${definition.displayName}\n\nGenerated AppBasis app skeleton.\n\n- App ID: \`${definition.appId}\`\n- Modules: ${modules}\n\nThis Phase 3B skeleton intentionally contains only the versioned app definition. Runtime composition is added by later factory slices rather than copied from another app.\n`;
}

async function directoryNames(path) {
  const entries = await readdir(path, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function requiredFlagValue(args, index, flag) {
  const value = args[index];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  resolve(invokedPath) === resolve(fileURLToPath(import.meta.url))
) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
