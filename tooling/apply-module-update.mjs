import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { parseAppDefinition } from "./app-definition.mjs";
import { acquireAppRegistryLock } from "./app-publication.mjs";
import {
  planModuleUpdate,
  readPnpmImporterDependency,
} from "./module-update-plan.mjs";
import { acquireWorkspacePublicationLock } from "./workspace-publication.mjs";

const IDENTIFIER_PATTERN = /^[a-z][a-z0-9-]*$/;
const WORKSPACE_DEPENDENCY = "workspace:*";
const WORKSPACE_FINALIZATION_TIMEOUT_MS = 90_000;
const WORKSPACE_FINALIZATION_KILL_GRACE_MS = 5_000;

export async function applyModuleUpdate(input, options = {}) {
  const repositoryRoot = resolve(options.repositoryRoot ?? process.cwd());
  const appId = requiredIdentifier(input?.appId, "appId");
  const moduleId = requiredIdentifier(input?.moduleId, "moduleId");

  const paths = updatePaths(repositoryRoot, appId, moduleId);
  const initialSnapshot = await readInputSnapshot(paths);
  const plan = await planModuleUpdate(
    { appId, moduleId },
    { repositoryRoot },
  );

  if (
    plan.state === "install" &&
    plan.module.databaseSchemaVersion !== null
  ) {
    throw new Error(
      "FC5-B does not install database-owning modules before a migration execution contract exists.",
    );
  }

  await options.testingHooks?.afterPlan?.({
    plan,
    repositoryRoot,
  });

  let appRegistryLock;
  let workspacePublicationLock;
  let mutationStarted = false;

  try {
    appRegistryLock = await acquireAppRegistryLock(repositoryRoot, "publish");
    workspacePublicationLock =
      await acquireWorkspacePublicationLock(repositoryRoot);

    const lockedSnapshot = await readInputSnapshot(paths);
    assertSnapshotUnchanged(initialSnapshot, lockedSnapshot);

    if (plan.state === "already-installed") {
      assertNoopPlan(plan);
      return Object.freeze({
        state: "already-installed",
        plan,
      });
    }

    if (plan.state !== "install") {
      throw new Error(`Unsupported module update plan state: ${String(plan.state)}.`);
    }

    assertInstallWriteSet(plan, appId);

    const currentAppDefinition = parseAppDefinition(
      parseJsonObject(
        initialSnapshot.appDefinition,
        `apps/${appId}/appbasis.app.json`,
      ),
      { directoryName: appId },
    );
    const nextModules = plan.changes.appDefinition?.afterModules;
    if (!Array.isArray(nextModules)) {
      throw new Error("Module install plan is missing the next app module list.");
    }
    const nextAppDefinition = Object.freeze({
      ...currentAppDefinition,
      modules: Object.freeze([...nextModules]),
    });

    const currentPackage = parseJsonObject(
      initialSnapshot.appPackage,
      `apps/${appId}/package.json`,
    );
    if (!plainObject(currentPackage.dependencies)) {
      throw new Error(
        `apps/${appId}/package.json dependencies must be an object.`,
      );
    }
    const dependencyChange = plan.changes.packageDependency;
    if (
      dependencyChange === null ||
      dependencyChange?.dependency !== plan.module.packageName ||
      dependencyChange?.after !== WORKSPACE_DEPENDENCY
    ) {
      throw new Error("Module install plan package dependency is invalid.");
    }
    if (currentPackage.dependencies[plan.module.packageName] !== undefined) {
      throw new Error(
        `App ${appId} already contains package dependency ${plan.module.packageName}.`,
      );
    }

    const nextPackage = {
      ...currentPackage,
      dependencies: sortedObject({
        ...currentPackage.dependencies,
        [plan.module.packageName]: WORKSPACE_DEPENDENCY,
      }),
    };

    await atomicWriteFile(
      paths.appPackage,
      `${JSON.stringify(nextPackage, null, 2)}\n`,
    );
    mutationStarted = true;

    if (plan.changes.databaseManifest !== null) {
      const databaseChange = plan.changes.databaseManifest;
      if (databaseChange.path !== `apps/${appId}/appbasis.database.json`) {
        throw new Error("Module install plan database manifest path is invalid.");
      }
      await atomicWriteFile(
        paths.databaseManifest,
        `${JSON.stringify(databaseChange.after, null, 2)}\n`,
      );
    }

    await options.testingHooks?.beforeWorkspaceFinalization?.({
      plan,
      repositoryRoot,
    });

    const workspaceFinalizer =
      options.testingHooks?.workspaceFinalizer ?? finalizeWorkspace;
    await workspaceFinalizer({
      repositoryRoot,
      lockfilePath: paths.lockfile,
    });

    await assertFinalizedWorkspace({
      paths,
      appId,
      moduleId,
      modulePackageName: plan.module.packageName,
    });

    await options.testingHooks?.afterWorkspaceFinalization?.({
      plan,
      repositoryRoot,
    });

    // The app definition is the publication marker and is written last.
    await atomicWriteFile(
      paths.appDefinition,
      `${JSON.stringify(nextAppDefinition, null, 2)}\n`,
    );

    const publishedDefinition = parseAppDefinition(
      parseJsonObject(
        await readFile(paths.appDefinition, "utf8"),
        `apps/${appId}/appbasis.app.json`,
      ),
      { directoryName: appId },
    );
    if (
      JSON.stringify(publishedDefinition.modules) !==
      JSON.stringify(nextAppDefinition.modules)
    ) {
      throw new Error("Published app module list does not match the update plan.");
    }

    return Object.freeze({
      state: "installed",
      plan,
    });
  } catch (error) {
    if (!mutationStarted) throw error;

    const rollbackErrors = await restoreSnapshot(paths, initialSnapshot);
    if (rollbackErrors.length > 0) {
      throw new AggregateError(
        [error, ...rollbackErrors],
        "Module update failed and rollback was incomplete.",
      );
    }
    throw error;
  } finally {
    await workspacePublicationLock?.release();
    await appRegistryLock?.release();
  }
}

export function parseApplyModuleUpdateArguments(args) {
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
    throw new Error(`Unknown module update executor argument: ${argument}.`);
  }

  if (appId === undefined) throw new Error("Missing required --app-id.");
  if (moduleId === undefined) throw new Error("Missing required --module.");

  return Object.freeze({ appId, moduleId });
}

function updatePaths(repositoryRoot, appId, moduleId) {
  return Object.freeze({
    appDefinition: join(repositoryRoot, "apps", appId, "appbasis.app.json"),
    appPackage: join(repositoryRoot, "apps", appId, "package.json"),
    databaseManifest: join(
      repositoryRoot,
      "apps",
      appId,
      "appbasis.database.json",
    ),
    lockfile: join(repositoryRoot, "pnpm-lock.yaml"),
    moduleDefinition: join(
      repositoryRoot,
      "modules",
      moduleId,
      "appbasis.module.json",
    ),
    modulePackage: join(
      repositoryRoot,
      "modules",
      moduleId,
      "package.json",
    ),
  });
}

async function readInputSnapshot(paths) {
  const [
    appDefinition,
    appPackage,
    databaseManifest,
    lockfile,
    moduleDefinition,
    modulePackage,
  ] = await Promise.all([
    readRequiredText(paths.appDefinition, "Target app definition"),
    readRequiredText(paths.appPackage, "Target app package"),
    readOptionalText(paths.databaseManifest),
    readRequiredText(paths.lockfile, "Workspace lockfile"),
    readRequiredText(paths.moduleDefinition, "Target module definition"),
    readRequiredText(paths.modulePackage, "Target module package"),
  ]);

  return Object.freeze({
    appDefinition,
    appPackage,
    databaseManifest,
    lockfile,
    moduleDefinition,
    modulePackage,
  });
}

function assertSnapshotUnchanged(before, after) {
  for (const key of Object.keys(before)) {
    if (before[key] !== after[key]) {
      throw new Error(
        `Module update input changed during planning: ${snapshotLabel(key)}.`,
      );
    }
  }
}

function snapshotLabel(key) {
  return (
    {
      appDefinition: "app definition",
      appPackage: "app package",
      databaseManifest: "database manifest",
      lockfile: "workspace lockfile",
      moduleDefinition: "module definition",
      modulePackage: "module package",
    }[key] ?? key
  );
}

function assertNoopPlan(plan) {
  if (
    plan.changes.appDefinition !== null ||
    plan.changes.packageDependency !== null ||
    plan.changes.databaseManifest !== null ||
    plan.changes.workspaceLockfile !== null ||
    plan.writes.length !== 0
  ) {
    throw new Error("Already-installed module update plan must be a no-op.");
  }
}

function assertInstallWriteSet(plan, appId) {
  const expected = [
    `apps/${appId}/appbasis.app.json`,
    `apps/${appId}/package.json`,
    ...(plan.changes.databaseManifest === null
      ? []
      : [`apps/${appId}/appbasis.database.json`]),
    "pnpm-lock.yaml",
  ];
  if (
    plan.writes.length !== expected.length ||
    plan.writes.some((path, index) => path !== expected[index])
  ) {
    throw new Error("Module install plan write set is not canonical.");
  }
}

async function assertFinalizedWorkspace({
  paths,
  appId,
  moduleId,
  modulePackageName,
}) {
  const packageJson = parseJsonObject(
    await readFile(paths.appPackage, "utf8"),
    `apps/${appId}/package.json`,
  );
  if (
    !plainObject(packageJson.dependencies) ||
    packageJson.dependencies[modulePackageName] !== WORKSPACE_DEPENDENCY
  ) {
    throw new Error(
      `Workspace finalization lost dependency ${modulePackageName}.`,
    );
  }

  const lockfile = await readFile(paths.lockfile, "utf8");
  const lockDependency = readPnpmImporterDependency(
    lockfile,
    `apps/${appId}`,
    modulePackageName,
  );
  const appRoot = dirname(paths.appPackage);
  const moduleRoot = join(dirname(dirname(paths.modulePackage)), moduleId);
  const expectedLink = `link:${toPosixPath(relative(appRoot, moduleRoot))}`;
  if (
    lockDependency === null ||
    lockDependency.specifier !== WORKSPACE_DEPENDENCY ||
    lockDependency.version !== expectedLink
  ) {
    throw new Error(
      `Workspace finalization did not publish the canonical ${modulePackageName} importer.`,
    );
  }
}

async function restoreSnapshot(paths, snapshot) {
  const rollbackErrors = [];
  for (const [key, path] of [
    ["appDefinition", paths.appDefinition],
    ["appPackage", paths.appPackage],
    ["databaseManifest", paths.databaseManifest],
    ["lockfile", paths.lockfile],
  ]) {
    try {
      const content = snapshot[key];
      if (content === null) {
        await rm(path, { force: true });
      } else {
        await atomicWriteFile(path, content);
      }
    } catch (error) {
      rollbackErrors.push(error);
    }
  }
  return rollbackErrors;
}

async function atomicWriteFile(path, content) {
  const temporaryPath = join(
    dirname(path),
    `.${fileName(path)}.appbasis-update-${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporaryPath, content, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

function fileName(path) {
  const normalized = toPosixPath(path);
  return normalized.slice(normalized.lastIndexOf("/") + 1);
}

async function finalizeWorkspace({ repositoryRoot }) {
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
              `Workspace finalization exceeded ${WORKSPACE_FINALIZATION_TIMEOUT_MS} ms.`,
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
        reject(new Error(`Workspace finalization failed (${detail}).`));
      });
    });
  });
}

async function readRequiredText(path, label) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`${label} is missing.`);
    }
    throw error;
  }
}

async function readOptionalText(path) {
  try {
    return await readFile(path, "utf8");
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

function sortedObject(value) {
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function requiredIdentifier(value, field) {
  if (typeof value !== "string" || !IDENTIFIER_PATTERN.test(value)) {
    throw new Error(`${field} must be a lowercase kebab-case identifier.`);
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

function toPosixPath(value) {
  return sep === "/" ? value : value.split(sep).join("/");
}

async function runCli() {
  const input = parseApplyModuleUpdateArguments(process.argv.slice(2));
  const result = await applyModuleUpdate(input);
  console.log(
    result.state === "already-installed"
      ? `AppBasis module already installed: ${input.appId} <- ${input.moduleId}.`
      : `Installed AppBasis module: ${input.appId} <- ${input.moduleId}.`,
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
