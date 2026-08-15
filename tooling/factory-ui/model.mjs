import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  readAppDefinitions,
  SUPPORTED_PLATFORM_SERVICES,
} from "../app-definition.mjs";

export async function loadFactorySnapshot(repositoryRoot = process.cwd()) {
  const root = resolve(repositoryRoot);
  const [apps, modules] = await Promise.all([
    readAppDefinitions(root),
    directoryNames(join(root, "modules")),
  ]);

  return Object.freeze({
    apps: Object.freeze([...apps]),
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

async function directoryNames(path) {
  const entries = await readdir(path, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}
