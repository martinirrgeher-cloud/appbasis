/**
 * K2 private media byte-restore rehearsal: no network, provider, credentials,
 * SQL, object delete, upload or promotion. Strict manifest vs files extracted
 * to a DISCONNECTED, externally isolated directory. Never log media keys.
 *
 * The caller must independently establish the source snapshot/version fence
 * and offline quarantine. We CANNOT attest either from local file contents.
 * An empty inventory cannot prove a nonempty media backup or restore.
 */
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readdir } from "node:fs/promises";
import { join } from "node:path";
import { indexK2PrivateMediaRecords } from "./ulc-linz-k2-media-inventory.mjs";

const MAX_BYTES = 100 * 1024 * 1024;
const CHUNK_BYTES = 1024 * 1024;
const MAX_ITEMS = 100_000;

export class K2OfflineMediaRecoveryError extends Error {
  constructor(code) {
    super("K2_OFFLINE_MEDIA_" + code);
    this.name = "K2OfflineMediaRecoveryError";
  }
}
function fail(code) { throw new K2OfflineMediaRecoveryError(code); }
function checkedSnapshot(value) {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(value);
}

async function fingerprint(path, expected) {
  // O_NOFOLLOW also denies the last-component symlink in a race. Parent
  // directories are examined below; real isolation requires NO concurrent
  // writer or symlink swaps in the quarantine.
  let file;
  try {
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = await file.stat();
    if (!before.isFile() || before.nlink !== 1 ||
        before.size < 0 || before.size > MAX_BYTES) fail("UNSAFE_FILE");
    const digest = createHash("sha256");
    const buffer = Buffer.allocUnsafe(CHUNK_BYTES);
    let size = 0;
    for (;;) {
      const read = await file.read(buffer, 0, buffer.length, null);
      if (read.bytesRead === 0) break;
      size += read.bytesRead;
      if (size > MAX_BYTES) fail("SIZE_LIMIT");
      digest.update(buffer.subarray(0, read.bytesRead));
    }
    const after = await file.stat();
    if (!after.isFile() || after.nlink !== 1 ||
        before.size !== size || after.size !== size ||
        before.ino !== after.ino || before.dev !== after.dev ||
        before.mtimeMs !== after.mtimeMs) fail("FILE_CHANGED_DURING_READ");
    if (size !== expected.size || digest.digest("hex") !== expected.sha256) {
      fail("BYTE_MISMATCH");
    }
    return size;
  } catch (error) {
    if (error instanceof K2OfflineMediaRecoveryError) throw error;
    fail("UNREADABLE_FILE");
  } finally {
    await file?.close().catch(() => {});
  }
}

export async function verifyK2OfflineMediaRecovery({
  inventory, rootDir, sourceSnapshot, restoredSnapshot,
  snapshotFenceVerified = false, offlineQuarantineVerified = false,
} = {}) {
  // These flags are independently collected operator evidence. A local
  // pass alone does NOT set mediaRestoreVerified=true.
  if (snapshotFenceVerified !== true || offlineQuarantineVerified !== true ||
      !checkedSnapshot(sourceSnapshot) || sourceSnapshot !== restoredSnapshot) {
    fail("UNVERIFIED_ISOLATION_OR_SNAPSHOT");
  }
  if (typeof rootDir !== "string" || rootDir.length === 0) fail("ROOT_INVALID");
  const expected = indexK2PrivateMediaRecords(inventory, "recovery");
  let base;
  try { base = await lstat(rootDir); }
  catch { fail("ROOT_UNAVAILABLE"); }
  if (!base.isDirectory() || base.isSymbolicLink()) fail("ROOT_UNSAFE");

  const allowedDirectories = new Set();
  for (const key of expected.keys()) {
    const parts = key.split("/");
    for (let i = 1; i < 4; i++) {
      allowedDirectories.add(parts.slice(0, i).join("/"));
    }
  }
  let count = 0;
  let bytes = 0;
  const found = new Set();
  async function walk(dir, segments) {
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); }
    catch { fail("DIRECTORY_UNREADABLE"); }
    if (segments.length > 0 && entries.length === 0) fail("EMPTY_EXTRA_DIRECTORY");
    for (const entry of entries) {
      if (entry.name === "." || entry.name === ".." ||
          entry.name.includes("/") || entry.name.includes("\\")) fail("PATH_INVALID");
      const nested = [...segments, entry.name];
      const key = nested.join("/");
      const full = join(dir, entry.name);
      if (entry.isSymbolicLink()) fail("SYMLINK_DISALLOWED");
      if (entry.isDirectory()) {
        if (nested.length >= 4 || !allowedDirectories.has(key)) {
          fail("EXTRA_DIRECTORY");
        }
        await walk(full, nested);
      } else if (entry.isFile()) {
        if (nested.length !== 4 || !expected.has(key) || found.has(key)) {
          fail("UNKNOWN_OR_DUPLICATE_OBJECT");
        }
        found.add(key);
        count++;
        if (count > MAX_ITEMS) fail("TOO_MANY_OBJECTS");
        bytes += await fingerprint(full, expected.get(key));
      } else {
        fail("NON_FILE_OBJECT");
      }
    }
  }
  await walk(rootDir, []);
  if (found.size !== expected.size) fail("MISSING_OBJECT");

  return Object.freeze({
    status: count > 0 ? "offline-bytes-match-only" : "empty-inventory-only",
    filesVerified: count,
    bytesVerified: bytes,
    contentHashesMatched: true,
    offlineDirectoryParity: true,
    // The validated files could be synthetic and have never left localhost.
    // A provider-backed, independently verified media restore is still needed.
    providerBackupVerified: false,
    mediaRestoreVerified: false,
    productionReady: false,
  });
}
