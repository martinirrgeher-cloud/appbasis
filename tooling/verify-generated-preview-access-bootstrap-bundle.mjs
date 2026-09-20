import { rm } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const outputDirectory = path.join(
  repositoryRoot,
  "apps/reference/tooling/.generated-preview-access-dist",
);
const outputPath = path.join(
  outputDirectory,
  "generated-app-preview-access-bootstrap.mjs",
);

try {
  await runPnpm([
    "--filter",
    "@appbasis/reference",
    "exec",
    "vite",
    "build",
    "--config",
    "tooling/vite.generated-preview-access-bootstrap.config.ts",
  ]);
  await import(pathToFileURL(outputPath).href);
  await verifyBundledRepositoryRoot();
  console.log("Generated preview access bootstrap bundle verified.");
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
            ? `Generated preview access bootstrap bundle build exited with code ${code}.`
            : `Generated preview access bootstrap bundle build exited on signal ${signal}.`,
        ),
      );
    });
  });
}


function verifyBundledRepositoryRoot() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [outputPath], {
      cwd: repositoryRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        APPBASIS_PREVIEW_ACCESS_BOOTSTRAP_APPLY: "1",
        APPBASIS_GENERATED_APP_ID: "unterrichtsverwaltung",
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (
        signal === null &&
        code === 1 &&
        stdout.length === 0 &&
        stderr.trim() === "APPBASIS_DATABASE_URL is required."
      ) {
        resolve();
        return;
      }
      reject(
        new Error(
          `Generated preview access bundle repository-root probe failed (code=${String(
            code,
          )}, signal=${String(signal)}, stdout=${JSON.stringify(
            stdout,
          )}, stderr=${JSON.stringify(stderr)}).`,
        ),
      );
    });
  });
}
