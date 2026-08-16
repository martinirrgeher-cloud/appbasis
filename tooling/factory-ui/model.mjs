import { access, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  readAppDefinitions,
  SUPPORTED_PLATFORM_SERVICES,
} from "../app-definition.mjs";
import { createGeneratedDatabaseManifest } from "../generated-database-manifest.mjs";
import { evaluateM6ProductionReleaseReadiness } from "./production-release-readiness.mjs";
import { evaluateProductionReadiness } from "./production-readiness.mjs";
import { deriveRepositoryProductionReadinessEvidence } from "./repository-production-readiness-evidence.mjs";

export async function loadFactorySnapshot(repositoryRoot = process.cwd()) {
  const root = resolve(repositoryRoot);
  const [appDefinitions, modules] = await Promise.all([
    readAppDefinitions(root),
    directoryNames(join(root, "modules")),
  ]);
  const apps = await Promise.all(
    appDefinitions.map((definition) => withFactoryReadiness(root, definition)),
  );

  return Object.freeze({
    apps: Object.freeze(apps),
    catalog: Object.freeze({
      modules: Object.freeze(modules),
      platformServices: SUPPORTED_PLATFORM_SERVICES,
    }),
    capabilities: Object.freeze({
      createApp: true,
      deployPreview: false,
      releaseProduction: false,
    }),
  });
}

async function withFactoryReadiness(repositoryRoot, definition) {
  const appRoot = join(repositoryRoot, "apps", definition.appId);
  const databaseManifestRequired =
    createGeneratedDatabaseManifest(definition) !== null;
  const [workerEntrypointPresent, packageManifestPresent, databaseManifestPresent] =
    await Promise.all([
      pathExists(join(appRoot, "worker", "index.ts")),
      pathExists(join(appRoot, "package.json")),
      databaseManifestRequired
        ? pathExists(join(appRoot, "appbasis.database.json"))
        : Promise.resolve(false),
    ]);
  const repositoryReady =
    workerEntrypointPresent &&
    packageManifestPresent &&
    (!databaseManifestRequired || databaseManifestPresent);
  const productionReadinessEvidence =
    deriveRepositoryProductionReadinessEvidence(definition);
  const productionReadiness = evaluateProductionReadiness(productionReadinessEvidence);
  const productionReleaseReadiness = evaluateM6ProductionReleaseReadiness({
    securityPrivacyReady: productionReadiness.productionReady === true,
  });

  return Object.freeze({
    ...definition,
    previewReadiness: Object.freeze({
      status: repositoryReady ? "repository-ready" : "repository-incomplete",
      workerEntrypointPresent,
      packageManifestPresent,
      databaseManifestRequired,
      databaseManifestPresent,
    }),
    productionReadiness,
    productionReleaseReadiness,
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
