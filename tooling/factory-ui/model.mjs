import { access, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  readAppDefinitions,
  SUPPORTED_PLATFORM_SERVICES,
} from "../app-definition.mjs";
import { readAppTheme } from "../app-theme.mjs";
import { createGeneratedDatabaseManifest } from "../generated-database-manifest.mjs";
import { verifyModuleDefinitions } from "../module-definition.mjs";
import { deriveGeneratedPreviewLifecycle } from "./generated-preview-lifecycle.mjs";
import { deriveM3PreviewAcceptanceEvidence } from "./m3-preview-acceptance-evidence.mjs";
import { deriveUlcLinzD4PreviewAcceptanceEvidence } from "./ulc-linz-d4-preview-acceptance-evidence.mjs";
import { evaluateM6ProductionReleaseReadiness } from "./production-release-readiness.mjs";
import { evaluateProductionReadiness } from "./production-readiness.mjs";
import { deriveRepositoryProductionReadinessEvidence } from "./repository-production-readiness-evidence.mjs";
import { deriveUlcLinzM5JProductionEvidence } from "./ulc-linz-production-readiness-evidence.mjs";

export async function loadFactorySnapshot(repositoryRoot = process.cwd(), options = {}) {
  const root = resolve(repositoryRoot);
  const m3PreviewAcceptanceFetchImpl =
    options.m3PreviewAcceptanceFetchImpl ?? fetch;
  const ulcLinzD4PreviewAcceptanceFetchImpl =
    options.ulcLinzD4PreviewAcceptanceFetchImpl ?? m3PreviewAcceptanceFetchImpl;
  const generatedPreviewPublicationFetchImpl =
    options.generatedPreviewPublicationFetchImpl ?? fetch;
  const generatedPreviewRunEvidenceFetchImpl =
    options.generatedPreviewRunEvidenceFetchImpl ?? fetch;
  const generatedPreviewRepositoryStateImpl =
    options.generatedPreviewRepositoryStateImpl;
  const ulcLinzM5JOwnerInputs = options.ulcLinzM5JOwnerInputs ?? {};
  const m5EvidenceNow = options.m5EvidenceNow ?? new Date();
  const [appDefinitions, moduleDefinitions] = await Promise.all([
    readAppDefinitions(root),
    verifyModuleDefinitions(root),
  ]);
  const modules = moduleDefinitions.map((definition) => definition.moduleId);
  const apps = await Promise.all(
    appDefinitions.map((definition) =>
      withFactoryReadiness(root, definition, {
        m3PreviewAcceptanceFetchImpl,
        ulcLinzD4PreviewAcceptanceFetchImpl,
        generatedPreviewPublicationFetchImpl,
        generatedPreviewRunEvidenceFetchImpl,
        generatedPreviewRepositoryStateImpl,
        moduleDefinitions,
        ulcLinzM5JOwnerInputs,
        m5EvidenceNow,
      }),
    ),
  );

  return Object.freeze({
    apps: Object.freeze(apps),
    catalog: Object.freeze({
      modules: Object.freeze(modules),
      platformServices: SUPPORTED_PLATFORM_SERVICES,
    }),
    capabilities: Object.freeze({
      createApp: true,
      previewWorkflow: true,
      deployPreview: false,
      releaseProduction: false,
    }),
  });
}

async function withFactoryReadiness(
  repositoryRoot,
  definition,
  {
    m3PreviewAcceptanceFetchImpl,
    ulcLinzD4PreviewAcceptanceFetchImpl,
    generatedPreviewPublicationFetchImpl,
    generatedPreviewRunEvidenceFetchImpl,
    generatedPreviewRepositoryStateImpl,
    moduleDefinitions,
    ulcLinzM5JOwnerInputs,
    m5EvidenceNow,
  },
) {
  const appRoot = join(repositoryRoot, "apps", definition.appId);
  const databaseManifestRequired =
    createGeneratedDatabaseManifest(definition, { moduleDefinitions }) !== null;
  const [
    workerEntrypointPresent,
    packageManifestPresent,
    databaseManifestPresent,
    appTheme,
    generatedPreviewLifecycle,
    previewAcceptanceEvidence,
    productionReadinessEvidence,
  ] = await Promise.all([
    pathExists(join(appRoot, "worker", "index.ts")),
    pathExists(join(appRoot, "package.json")),
    databaseManifestRequired
      ? pathExists(join(appRoot, "appbasis.database.json"))
      : Promise.resolve(false),
    readAppTheme(repositoryRoot, definition),
    deriveGeneratedPreviewLifecycle(repositoryRoot, definition, {
      publicationFetchImpl: generatedPreviewPublicationFetchImpl,
      repositoryStateImpl: generatedPreviewRepositoryStateImpl,
      runEvidenceFetchImpl: generatedPreviewRunEvidenceFetchImpl,
    }),
    definition.appId === "ulc-linz"
      ? deriveUlcLinzD4PreviewAcceptanceEvidence(repositoryRoot, definition, {
          fetchImpl: ulcLinzD4PreviewAcceptanceFetchImpl,
        })
      : deriveM3PreviewAcceptanceEvidence(definition, {
          fetchImpl: m3PreviewAcceptanceFetchImpl,
        }),
    definition.appId === "ulc-linz"
      ? deriveUlcLinzM5JProductionEvidence(
          repositoryRoot,
          definition,
          ulcLinzM5JOwnerInputs,
          { now: m5EvidenceNow },
        )
      : Promise.resolve(
          deriveRepositoryProductionReadinessEvidence(definition),
        ),
  ]);
  const repositoryReady =
    workerEntrypointPresent &&
    packageManifestPresent &&
    (!databaseManifestRequired || databaseManifestPresent);
  const productionReadiness = evaluateProductionReadiness(
    productionReadinessEvidence,
  );
  const productionReleaseReadiness = evaluateM6ProductionReleaseReadiness({
    ...previewAcceptanceEvidence,
    securityPrivacyReady: productionReadiness.productionReady === true,
  });

  return Object.freeze({
    ...definition,
    theme: appTheme,
    previewReadiness: Object.freeze({
      status: repositoryReady ? "repository-ready" : "repository-incomplete",
      workerEntrypointPresent,
      packageManifestPresent,
      databaseManifestRequired,
      databaseManifestPresent,
    }),
    previewLifecycle: generatedPreviewLifecycle,
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
