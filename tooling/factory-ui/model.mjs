import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  SUPPORTED_PLATFORM_SERVICES,
  verifyAppDefinitions,
} from "../app-definition.mjs";

export async function loadFactorySnapshot(repositoryRoot = process.cwd()) {
  const root = resolve(repositoryRoot);
  const [apps, modules] = await Promise.all([
    verifyAppDefinitions(root),
    directoryNames(join(root, "modules")),
  ]);

  return Object.freeze({
    apps: Object.freeze([...apps]),
    catalog: Object.freeze({
      modules: Object.freeze(modules),
      platformServices: SUPPORTED_PLATFORM_SERVICES,
    }),
    capabilities: Object.freeze({
      createApp: false,
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
