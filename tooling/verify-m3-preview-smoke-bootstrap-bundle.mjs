import { rm } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const outputDirectory = path.join(
  repositoryRoot,
  "apps/m3-preview/tooling/.smoke-bootstrap-dist",
);
const outputPath = path.join(outputDirectory, "bootstrap-smoke-principals.mjs");

try {
  await runPnpm([
    "--filter",
    "@appbasis/reference",
    "exec",
    "vite",
    "build",
    "--config",
    "../m3-preview/tooling/vite.smoke-bootstrap.config.ts",
  ]);
  await import(pathToFileURL(outputPath).href);
  console.log("m3-preview smoke bootstrap bundle verified.");
} finally {
  await rm(outputDirectory, { recursive: true, force: true });
}

function runPnpm(args) {
  return new Promise((resolve, reject) => {
    const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      stdio: "inherit",
      env: process.env,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          signal === null
            ? `m3-preview smoke bootstrap bundle build exited with code ${code}.`
            : `m3-preview smoke bootstrap bundle build exited on signal ${signal}.`,
        ),
      );
    });
  });
}
