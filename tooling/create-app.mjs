import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseAppDefinition } from "./app-definition.mjs";
import { acquireAppRegistryLock } from "./app-publication.mjs";
import { createIdentityRuntimeTemplate } from "./generated-runtime-template.mjs";

const STAGING_PREFIX = ".appbasis-create-";

export async function createAppSkeleton(input, options = {}) {
  const repositoryRoot = resolve(options.repositoryRoot ?? process.cwd());
  const definition = parseAppDefinition(
    {
      schemaVersion: 2,
      appId: input.appId,
      displayName: input.displayName,
      modules: input.modules ?? [],
      platformServices: input.platformServices ?? [],
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

  const runtimeFiles = generatedRuntimeFiles(definition);
  const publishesWorkspacePackage = runtimeFiles.some(
    (runtimeFile) => runtimeFile.path === "package.json",
  );
  const appsDirectory = join(repositoryRoot, "apps");
  const lockfilePath = join(repositoryRoot, "pnpm-lock.yaml");
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

  let registryLock;
  let destinationReserved = false;
  let published = false;
  let lockfileSnapshot;
  let workspaceFinalizationStarted = false;

  try {
    await writeFile(
      join(stagingDirectory, "appbasis.app.json"),
      `${JSON.stringify(definition, null, 2)}\n`,
      { flag: "wx" },
    );
    await writeFile(
      join(stagingDirectory, "README.md"),
      generatedReadme(definition, runtimeFiles),
      { flag: "wx" },
    );
    for (const runtimeFile of runtimeFiles) {
      await stageGeneratedFile(stagingDirectory, runtimeFile);
    }

    await options.testingHooks?.afterStage?.({
      destination,
      stagingDirectory,
    });

    // Publication and workspace finalization are serialized. Staging stays
    // concurrent and outside app discovery; verify:apps uses the same lock.
    registryLock = await acquireAppRegistryLock(repositoryRoot, "publish");

    if (publishesWorkspacePackage) {
      lockfileSnapshot = await readFile(lockfilePath, "utf8");
    }

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

    await rename(
      join(stagingDirectory, "README.md"),
      join(destination, "README.md"),
    );
    for (const runtimeFile of runtimeFiles) {
      await publishGeneratedFile(stagingDirectory, destination, runtimeFile);
    }

    if (publishesWorkspacePackage) {
      const workspaceFinalizer =
        options.testingHooks?.workspaceFinalizer ??
        options.testingHooks?.lockfileFinalizer ??
        finalizeGeneratedWorkspace;
      workspaceFinalizationStarted = true;
      await workspaceFinalizer({
        repositoryRoot,
        lockfilePath,
        destination,
      });
    }

    // Publish the manifest last. App discovery therefore never observes an
    // app definition before every generated runtime file, workspace lockfile
    // importer and local workspace dependency link are fully in place.
    await rename(
      join(stagingDirectory, "appbasis.app.json"),
      join(destination, "appbasis.app.json"),
    );
    await rm(stagingDirectory, { recursive: true, force: true });
    published = true;
  } catch (error) {
    const rollbackErrors = [];

    if (workspaceFinalizationStarted && lockfileSnapshot !== undefined) {
      try {
        await writeFile(lockfilePath, lockfileSnapshot);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (destinationReserved && !published) {
      try {
        await rm(destination, { recursive: true, force: true });
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    try {
      await rm(stagingDirectory, { recursive: true, force: true });
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError);
    }

    if (rollbackErrors.length > 0) {
      throw new AggregateError(
        [error, ...rollbackErrors],
        "App generation failed and rollback was incomplete.",
      );
    }
    throw error;
  } finally {
    await registryLock?.release();
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
  const platformServices = [];

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
    if (argument === "--platform-service") {
      platformServices.push(requiredFlagValue(args, ++index, argument));
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
    platformServices: Object.freeze(platformServices),
  });
}

async function runCli() {
  const input = parseCreateAppArguments(process.argv.slice(2));
  const result = await createAppSkeleton(input);
  console.log(`Created AppBasis app skeleton: ${result.relativeDestination}.`);
}

function generatedRuntimeFiles(definition) {
  if (!definition.platformServices.includes("identity")) return Object.freeze([]);
  return createIdentityRuntimeTemplate({
    appId: definition.appId,
    displayName: definition.displayName,
  }).files;
}

function generatedReadme(definition, runtimeFiles) {
  const modules =
    definition.modules.length === 0 ? "none" : definition.modules.join(", ");
  const platformServices =
    definition.platformServices.length === 0
      ? "none"
      : definition.platformServices.join(", ");
  const runtimeDescription =
    runtimeFiles.length === 0
      ? "This skeleton contains the versioned app definition only."
      : "This app includes the independently verified generated identity runtime and consumes `@appbasis/identity/http` without copying the Reference app.";
  return `# ${definition.displayName}\n\nGenerated AppBasis app skeleton.\n\n- App ID: \`${definition.appId}\`\n- Modules: ${modules}\n- Platform services: ${platformServices}\n\n${runtimeDescription}\n`;
}

async function stageGeneratedFile(stagingDirectory, runtimeFile) {
  const target = join(stagingDirectory, runtimeFile.path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, runtimeFile.content, { flag: "wx" });
}

async function publishGeneratedFile(stagingDirectory, destination, runtimeFile) {
  const source = join(stagingDirectory, runtimeFile.path);
  const target = join(destination, runtimeFile.path);
  await mkdir(dirname(target), { recursive: true });
  await rename(source, target);
}

async function finalizeGeneratedWorkspace({ repositoryRoot }) {
  const corepack = process.platform === "win32" ? "corepack.cmd" : "corepack";
  const args = [
    "pnpm",
    "install",
    "--no-frozen-lockfile",
    "--ignore-scripts",
  ];

  await new Promise((resolvePromise, reject) => {
    const child = spawn(corepack, args, {
      cwd: repositoryRoot,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      const detail =
        signal === null ? `exit code ${String(code)}` : `signal ${signal}`;
      reject(new Error(`Generated workspace finalization failed (${detail}).`));
    });
  });
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
