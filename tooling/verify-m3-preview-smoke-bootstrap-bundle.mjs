import { rm } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const outputDirectory = path.join(
  repositoryRoot,
  "apps/m3-preview/tooling/.smoke-bootstrap-dist",
);
const outputPaths = [
  path.join(outputDirectory, "bootstrap-smoke-principals.mjs"),
  path.join(outputDirectory, "m4-restored-functional-smoke.mjs"),
];

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
  for (const outputPath of outputPaths) {
    await import(pathToFileURL(outputPath).href);
  }
  console.log("m3-preview operational bundles verified.");
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
            ? `m3-preview operational bundle build exited with code ${code}.`
            : `m3-preview operational bundle build exited on signal ${signal}.`,
        ),
      );
    });
  });
}
