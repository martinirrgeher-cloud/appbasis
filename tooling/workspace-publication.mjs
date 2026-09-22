import { randomUUID } from "node:crypto";
import { link, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const WORKSPACE_LOCK_FILE = ".appbasis-workspace-publication.lock";
const LOCK_CANDIDATE_PREFIX = ".appbasis-workspace-publication-candidate-";
const DEFAULT_WAIT_TIMEOUT_MS = 120_000;
const RETRY_DELAY_MS = 20;

export async function acquireWorkspacePublicationLock(
  repositoryRoot,
  options = {},
) {
  const lockPath = join(repositoryRoot, WORKSPACE_LOCK_FILE);
  const timeoutMs = options.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;

  while (true) {
    const token = randomUUID();
    const candidatePath = join(
      repositoryRoot,
      `${LOCK_CANDIDATE_PREFIX}${token}.json`,
    );
    await writeFile(
      candidatePath,
      `${JSON.stringify({
        schemaVersion: 1,
        pid: process.pid,
        token,
      })}\n`,
      { encoding: "utf8", flag: "wx" },
    );

    try {
      await link(candidatePath, lockPath);
      await unlink(candidatePath).catch(() => undefined);
      return Object.freeze({
        token,
        release: () => releaseLock(lockPath, token, candidatePath),
      });
    } catch (error) {
      await unlink(candidatePath).catch(() => undefined);
      if (error?.code !== "EEXIST") throw error;

      const state = await readLockState(lockPath);
      if (state.kind === "invalid") {
        throw new Error("Invalid workspace publication lock requires cleanup.");
      }
      if (state.kind === "stale") {
        throw new Error("Stale workspace publication lock requires cleanup.");
      }
      if (Date.now() >= deadline) {
        throw new Error("Timed out waiting for active workspace publication lock.");
      }
      await delay(RETRY_DELAY_MS);
    }
  }
}

async function readLockState(lockPath) {
  let value;
  try {
    value = JSON.parse(await readFile(lockPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return Object.freeze({ kind: "released" });
    return Object.freeze({ kind: "invalid" });
  }

  if (
    value?.schemaVersion !== 1 ||
    !Number.isSafeInteger(value?.pid) ||
    value.pid <= 0 ||
    typeof value?.token !== "string" ||
    value.token.length === 0
  ) {
    return Object.freeze({ kind: "invalid" });
  }

  return Object.freeze({
    kind: processIsAlive(value.pid) ? "active" : "stale",
  });
}

async function releaseLock(lockPath, expectedToken, candidatePath) {
  await unlink(candidatePath).catch(() => undefined);

  let value;
  try {
    value = JSON.parse(await readFile(lockPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return;
    return;
  }

  if (value?.token !== expectedToken) return;
  await unlink(lockPath).catch((error) => {
    if (error?.code !== "ENOENT") throw error;
  });
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "EPERM") return true;
    if (error?.code === "ESRCH") return false;
    return false;
  }
}
