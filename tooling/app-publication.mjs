import { randomUUID } from "node:crypto";
import { open, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";

const PUBLICATION_LOCK_PREFIX = ".appbasis-publishing-";

export async function acquireAppPublicationClaim(repositoryRoot, appId) {
  const lockPath = publicationLockPath(repositoryRoot, appId);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = randomUUID();
    let handle;
    try {
      handle = await open(lockPath, "wx");
      await handle.writeFile(
        `${JSON.stringify({ schemaVersion: 1, appId, pid: process.pid, token })}\n`,
        "utf8",
      );
      await handle.close();
      handle = undefined;

      return Object.freeze({
        lockPath,
        token,
        release: () => releaseClaim(lockPath, token),
      });
    } catch (error) {
      if (handle !== undefined) {
        await handle.close().catch(() => undefined);
        await unlink(lockPath).catch(() => undefined);
      }

      if (error?.code !== "EEXIST") throw error;

      const state = await getAppPublicationState(repositoryRoot, appId);
      if (state.kind === "stale") {
        await unlink(lockPath).catch((unlinkError) => {
          if (unlinkError?.code !== "ENOENT") throw unlinkError;
        });
        continue;
      }

      throw new Error(`App publication already in progress: ${appId}.`);
    }
  }

  throw new Error(`Unable to acquire app publication claim: ${appId}.`);
}

export async function getAppPublicationState(repositoryRoot, appId) {
  const lockPath = publicationLockPath(repositoryRoot, appId);
  let raw;
  try {
    raw = await readFile(lockPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return Object.freeze({ kind: "none" });
    throw error;
  }

  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return Object.freeze({ kind: "invalid" });
  }

  if (
    value?.schemaVersion !== 1 ||
    value?.appId !== appId ||
    !Number.isSafeInteger(value?.pid) ||
    value.pid <= 0 ||
    typeof value?.token !== "string" ||
    value.token.length === 0
  ) {
    return Object.freeze({ kind: "invalid" });
  }

  return Object.freeze({
    kind: processIsAlive(value.pid) ? "active" : "stale",
    pid: value.pid,
  });
}

function publicationLockPath(repositoryRoot, appId) {
  return join(repositoryRoot, `${PUBLICATION_LOCK_PREFIX}${appId}.json`);
}

async function releaseClaim(lockPath, expectedToken) {
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
