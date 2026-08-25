import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CONTRACT_PATH = "docs/ULC-LINZ-PRODUCTION-BACKUP-RESTORE.md";
const CONTRACT_GIT_BLOB_SHA = "7363464b8e34e0d39d1ec1bb9e93f1c5bfb05ef3";

export async function verifyUlcLinzM5BackupContract(repositoryRoot) {
  const content = await readFile(resolve(repositoryRoot, CONTRACT_PATH));
  const digest = createHash("sha1")
    .update(`blob ${content.length}\0`, "utf8")
    .update(content)
    .digest("hex");
  if (digest !== CONTRACT_GIT_BLOB_SHA) {
    throw new Error("ULC production backup/restore contract drifted.");
  }
  return Object.freeze({
    preMigrationBackupDefined: true,
    restoreProcedureDocumented: true,
  });
}

async function main() {
  const result = await verifyUlcLinzM5BackupContract(process.cwd());
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "ULC production backup contract verification failed.");
    process.exitCode = 1;
  });
}
