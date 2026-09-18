import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { readAppDefinitions } from "./app-definition.mjs";
import { readAppTheme } from "./app-theme.mjs";
import { defineGeneratedAppPreviewTarget } from "./generated-app-preview-target.mjs";

export async function loadGeneratedAppPreviewContract(
  repositoryRoot,
  appId,
) {
  const target = defineGeneratedAppPreviewTarget({ appId });
  const definitions = await readAppDefinitions(repositoryRoot);
  const definition = definitions.find((candidate) => candidate.appId === target.appId);
  if (definition === undefined) {
    throw new Error(`Generated preview app was not found: ${target.appId}.`);
  }
  if (!definition.platformServices.includes("identity")) {
    throw new Error("Generated preview requires the identity platform service.");
  }

  const appRoot = join(repositoryRoot, "apps", target.appId);
  const [packageJson, databaseManifest, workerIndex, workerUi, workerPreview, theme] =
    await Promise.all([
    readJson(join(appRoot, "package.json"), "Generated preview package manifest"),
    readJson(join(appRoot, "appbasis.database.json"), "Generated preview database manifest"),
    readRequiredText(join(appRoot, "worker", "index.ts"), "Generated preview Worker entrypoint"),
      readRequiredText(join(appRoot, "worker", "ui.ts"), "Generated preview web UI"),
      readRequiredText(
        join(appRoot, "worker", "preview.ts"),
        "Generated preview database-health Worker",
      ),
      readAppTheme(repositoryRoot, definition),
    ]);

  if (packageJson?.name !== `@appbasis/app-${target.appId}`) {
    throw new Error("Generated preview package name does not match the app id.");
  }
  if (databaseManifest?.application !== target.appId) {
    throw new Error("Generated preview database manifest does not match the app id.");
  }
  if (!workerIndex.includes("createGeneratedWorker")) {
    throw new Error("Generated preview Worker entrypoint is not the canonical generated runtime.");
  }
  if (!workerUi.includes("generatedUiResponse")) {
    throw new Error("Generated preview web UI is not the canonical generated UI runtime.");
  }
  if (
    !workerPreview.includes("createGeneratedPreviewWorker") ||
    !workerPreview.includes("/api/health/database")
  ) {
    throw new Error(
      "Generated preview database-health Worker is not the canonical preview wrapper.",
    );
  }

  return Object.freeze({
    definition,
    theme,
    target,
    packageName: packageJson.name,
    databaseManifest,
  });
}

async function readJson(path, label) {
  let source;
  try {
    source = await readFile(path, "utf8");
  } catch {
    throw new Error(`${label} is missing.`);
  }
  try {
    return JSON.parse(source);
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
}

async function readRequiredText(path, label) {
  try {
    const source = await readFile(path, "utf8");
    if (source.length === 0) throw new Error("empty");
    return source;
  } catch {
    throw new Error(`${label} is missing or empty.`);
  }
}
