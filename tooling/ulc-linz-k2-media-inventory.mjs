/**
 * Offline-only reconciliation of private exercise-catalog media metadata and
 * provider object inventory. No credentials, networking, writes or raw keys in
 * the result. A PASS is inventory parity, NOT recoverability or legal clearance.
 */
const MAX_RECORDS = 100000;
const SHA256 = /^[a-f0-9]{64}$/;
const KEY = /^exercise-catalog\/([^/]+)\/([^/]+)\/([^/]+)$/;
const SEGMENT = /^(?:[A-Za-z0-9_.~-]|%[0-9A-F]{2})+$/;

export class K2MediaInventoryError extends Error {
  constructor(message) {
    super(message);
    this.name = "K2MediaInventoryError";
  }
}
function requireArray(value, label) {
  if (!Array.isArray(value) || value.length > MAX_RECORDS) {
    throw new K2MediaInventoryError(label + " inventory is invalid or too large.");
  }
  return value;
}
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function requireKey(value) {
  if (typeof value !== "string" || value.length > 1000) {
    throw new K2MediaInventoryError("Invalid media key.");
  }
  const parts = KEY.exec(value);
  if (!parts || parts.slice(1).some((s) => !SEGMENT.test(s))) {
    throw new K2MediaInventoryError("Invalid media key.");
  }
  for (const part of parts.slice(1)) {
    let decoded;
    try { decoded = decodeURIComponent(part); }
    catch { throw new K2MediaInventoryError("Invalid media key."); }
    if (!decoded || decoded.length > 200 || decoded.trim() !== decoded ||
        /[\u0000-\u001f\u007f/\\]/u.test(decoded) ||
        encodeURIComponent(decoded) !== part) {
      throw new K2MediaInventoryError("Invalid media key.");
    }
  }
  return value;
}
function requireSize(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 100 * 1024 * 1024) {
    throw new K2MediaInventoryError("Invalid media size.");
  }
  return value;
}
function requireHash(value) {
  if (typeof value !== "string" || !SHA256.test(value)) {
    throw new K2MediaInventoryError("Invalid SHA-256 digest.");
  }
  return value;
}
function index(items, label) {
  const map = new Map();
  for (const item of requireArray(items, label)) {
    if (!record(item)) throw new K2MediaInventoryError("Invalid " + label + " record.");
    const key = requireKey(item.key);
    const size = requireSize(item.size);
    const sha256 = requireHash(item.sha256);
    if (map.has(key)) throw new K2MediaInventoryError("Duplicate " + label + " key.");
    map.set(key, { size, sha256 });
  }
  return map;
}
/**
 * metadata and objects are independent snapshots with SHA-256 hashes of actual
 * content, supplied by a separate authorized read-only inventory collector.
 * An ordinary R2 ETag is NOT a SHA-256 digest and must not be substituted.
 * Both snapshots must be quiescent or version-fenced; otherwise fail closed.
 */
export function reconcileK2PrivateMedia({
  metadata, objects, metadataSnapshot, objectSnapshot,
  versionFenceVerified = false,
} = {}) {
  if (versionFenceVerified !== true ||
      typeof metadataSnapshot !== "string" || metadataSnapshot.length === 0 ||
      metadataSnapshot !== objectSnapshot) {
    throw new K2MediaInventoryError("Independent media snapshots are not version-fenced.");
  }
  const a = index(metadata, "metadata");
  const b = index(objects, "provider");
  let missing = 0;
  let unexpected = 0;
  let sizeMismatch = 0;
  let digestMismatch = 0;
  for (const [key, value] of a) {
    const actual = b.get(key);
    if (!actual) { missing++; continue; }
    if (actual.size !== value.size) sizeMismatch++;
    if (actual.sha256 !== value.sha256) digestMismatch++;
  }
  for (const key of b.keys()) if (!a.has(key)) unexpected++;
  const verified = missing === 0 && unexpected === 0 &&
    sizeMismatch === 0 && digestMismatch === 0;
  return Object.freeze({
    status: verified ? "inventory-parity-only" : "inventory-mismatch",
    verified, metadataCount: a.size, objectCount: b.size,
    missing, unexpected, sizeMismatch, digestMismatch,
    mediaRestoreVerified: false, legalDeletionApproved: false,
    productionReady: false,
  });
}
