import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseModuleDefinition, verifyModuleDefinitions } from "./module-definition.mjs";

const STAGING_PREFIX = ".appbasis-create-module-";
const WORKSPACE_FINALIZATION_TIMEOUT_MS = 90_000;
const WORKSPACE_FINALIZATION_KILL_GRACE_MS = 5_000;
const CURRENT_APP_DEFINITION_SCHEMA_VERSION = 2;

export async function createModuleSkeleton(input, options = {}) {
  const repositoryRoot = resolve(options.repositoryRoot ?? process.cwd());
  const capabilities = normalizedCapabilities(input.capabilities ?? []);
  const definition = parseModuleDefinition(
    {
      schemaVersion: 1,
      moduleId: input.moduleId,
      displayName: input.displayName,
      packageName: `@appbasis/${input.moduleId}`,
      compatibility: {
        appDefinitionSchemaVersions: [CURRENT_APP_DEFINITION_SCHEMA_VERSION],
      },
      capabilities,
      database: null,
    },
    { directoryName: input.moduleId },
  );

  const modulesDirectory = join(repositoryRoot, "modules");
  await mkdir(modulesDirectory, { recursive: true });
  const existingDefinitions = await verifyModuleDefinitions(repositoryRoot);
  if (
    existingDefinitions.some(
      (moduleDefinition) => moduleDefinition.moduleId === definition.moduleId,
    )
  ) {
    throw new Error(
      `Module destination already exists: modules/${definition.moduleId}.`,
    );
  }

  const destination = join(modulesDirectory, definition.moduleId);
  if (await pathExists(destination)) {
    throw new Error(
      `Module destination already exists: modules/${definition.moduleId}.`,
    );
  }

  const lockfilePath = join(repositoryRoot, "pnpm-lock.yaml");
  const lockfileSnapshot = await readFile(lockfilePath, "utf8");
  const stagingDirectory = join(
    repositoryRoot,
    `${STAGING_PREFIX}${definition.moduleId}-${randomUUID()}`,
  );
  await mkdir(stagingDirectory);

  let destinationPublished = false;
  let workspaceFinalizationStarted = false;

  try {
    for (const generatedFile of generatedModuleFiles(definition)) {
      await stageGeneratedFile(stagingDirectory, generatedFile);
    }

    await options.testingHooks?.afterStage?.({
      destination,
      stagingDirectory,
    });

    if (await pathExists(destination)) {
      throw new Error(
        `Module destination already exists: modules/${definition.moduleId}.`,
      );
    }

    await rename(stagingDirectory, destination);
    destinationPublished = true;

    await verifyModuleDefinitions(repositoryRoot);

    const workspaceFinalizer =
      options.testingHooks?.workspaceFinalizer ?? finalizeGeneratedWorkspace;
    workspaceFinalizationStarted = true;
    await workspaceFinalizer({
      repositoryRoot,
      lockfilePath,
      destination,
    });
  } catch (error) {
    const rollbackErrors = [];

    if (workspaceFinalizationStarted) {
      try {
        await writeFile(lockfilePath, lockfileSnapshot);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (destinationPublished) {
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
        "Module generation failed and rollback was incomplete.",
      );
    }
    throw error;
  }

  return Object.freeze({
    definition,
    destination,
    relativeDestination: relative(repositoryRoot, destination),
  });
}

export function parseCreateModuleArguments(args) {
  let moduleId;
  let displayName;
  const capabilities = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--module-id") {
      moduleId = requiredFlagValue(args, ++index, argument);
      continue;
    }
    if (argument === "--display-name") {
      displayName = requiredFlagValue(args, ++index, argument);
      continue;
    }
    if (argument === "--capability") {
      capabilities.push(requiredFlagValue(args, ++index, argument));
      continue;
    }
    throw new Error(`Unknown module generator argument: ${argument}.`);
  }

  if (moduleId === undefined) {
    throw new Error("Missing required --module-id.");
  }
  if (displayName === undefined) {
    throw new Error("Missing required --display-name.");
  }

  return Object.freeze({
    moduleId,
    displayName,
    capabilities: Object.freeze(capabilities),
  });
}

function generatedModuleFiles(definition) {
  return Object.freeze([
    {
      path: "appbasis.module.json",
      content: `${JSON.stringify(definition, null, 2)}\n`,
    },
    {
      path: "package.json",
      content: `${JSON.stringify(
        {
          name: definition.packageName,
          version: "0.0.0",
          private: true,
          type: "module",
          exports: {
            ".": "./src/index.ts",
          },
          scripts: {
            typecheck: "tsc --noEmit -p tsconfig.json",
          },
          devDependencies: {
            typescript: "5.9.3",
          },
        },
        null,
        2,
      )}\n`,
    },
    {
      path: "tsconfig.json",
      content:
        '{\n  "extends": "../../tsconfig.base.json",\n  "include": ["src/**/*.ts"]\n}\n',
    },
    {
      path: "src/index.ts",
      content: generatedIndex(),
    },
    {
      path: "README.md",
      content: generatedReadme(definition),
    },
  ]);
}

function generatedIndex() {
  return `import moduleDefinition from "../appbasis.module.json";

const manifestCapabilities: readonly string[] = moduleDefinition.capabilities;

export const MODULE_CAPABILITIES: readonly string[] = Object.freeze([
  ...manifestCapabilities,
]);
`;
}

function generatedReadme(definition) {
  const capabilities =
    definition.capabilities.length === 0
      ? "none"
      : definition.capabilities.join(", ");
  return `# ${definition.displayName}

Generated AppBasis module skeleton.

- Module ID: \`${definition.moduleId}\`
- Package: \`${definition.packageName}\`
- App schema compatibility: ${definition.compatibility.appDefinitionSchemaVersions.join(", ")}
- Capabilities: ${capabilities}
- Database: none

The module contract in \`appbasis.module.json\` is the source of truth for compatibility, capabilities and optional database ownership.
`;
}

function normalizedCapabilities(value) {
  if (!Array.isArray(value)) {
    throw new Error("Module generator capabilities must be an array.");
  }
  return [...value].sort((left, right) =>
    String(left).localeCompare(String(right)),
  );
}

async function stageGeneratedFile(stagingDirectory, generatedFile) {
  const target = join(stagingDirectory, generatedFile.path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, generatedFile.content, { flag: "wx" });
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
    let settled = false;
    let timedOut = false;
    let killEscalation;

    const finalizationTimeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      killEscalation = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
        }
      }, WORKSPACE_FINALIZATION_KILL_GRACE_MS);
    }, WORKSPACE_FINALIZATION_TIMEOUT_MS);

    const finish = (operation) => {
      if (settled) return;
      settled = true;
      clearTimeout(finalizationTimeout);
      if (killEscalation !== undefined) clearTimeout(killEscalation);
      operation();
    };

    child.once("error", (error) => finish(() => reject(error)));
    child.once("exit", (code, signal) => {
      finish(() => {
        if (timedOut) {
          reject(
            new Error(
              `Generated workspace finalization exceeded ${WORKSPACE_FINALIZATION_TIMEOUT_MS} ms.`,
            ),
          );
          return;
        }
        if (code === 0) {
          resolvePromise();
          return;
        }
        const detail =
          signal === null ? `exit code ${String(code)}` : `signal ${signal}`;
        reject(
          new Error(`Generated workspace finalization failed (${detail}).`),
        );
      });
    });
  });
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

async function runCli() {
  const input = parseCreateModuleArguments(process.argv.slice(2));
  const result = await createModuleSkeleton(input);
  console.log(
    `Created AppBasis module skeleton: ${result.relativeDestination}.`,
  );
}

const invokedPath =
  process.argv[1] === undefined ? undefined : resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
