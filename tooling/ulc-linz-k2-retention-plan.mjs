/**
 * K2 dry-run retention candidate. No AWS SDK, no network, no delete API.
 * Provider inventory input is untrusted; every uncertain object is kept.
 * A candidate is NEVER an authorization to delete.
 */
import { ULC_BACKUP_PREFIX, assertUlcBackupKey, assertUlcDatabaseName } from "./ulc-linz-k2-backup-plan.mjs";

export const K2_RETENTION_STATUS = "NOT_APPROVED";
export const K2_RETENTION_DAYS_CANDIDATE = 21;
const DAY_MS = 86_400_000;

function strictDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(value + "T00:00:00.000Z");
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function dateOfKey(key, databaseName) {
  try {
    assertUlcBackupKey(key, databaseName);
    const day = key.slice(-24, -14); // YYYY-MM-DD.tar.aesgcm
    return strictDay(day) ? day : null;
  } catch {
    return null;
  }
}

export function planK2Retention({
  databaseName, objects, now, days = K2_RETENTION_DAYS_CANDIDATE,
  minimumRecoverableCopies = 2, legalHoldKeys = [], restoreReferencedKeys = [],
} = {}) {
  assertUlcDatabaseName(databaseName);
  if (!Array.isArray(objects) || !Array.isArray(legalHoldKeys) || !Array.isArray(restoreReferencedKeys)) {
    throw new Error("Inventory and protection inputs must be arrays.");
  }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error("A valid UTC evaluation time is required.");
  if (!Number.isSafeInteger(days) || days < 1 || days > 3650) throw new Error("Invalid candidate retention window.");
  if (!Number.isSafeInteger(minimumRecoverableCopies) || minimumRecoverableCopies < 2) {
    throw new Error("At least two recoverable copies must be protected.");
  }
  const prefix = ULC_BACKUP_PREFIX + databaseName + "/daily/";
  const seen = new Set();
  const protectedKeys = new Set([...legalHoldKeys, ...restoreReferencedKeys]);
  const entries = objects.map((object, index) => {
    if (!object || typeof object !== "object" || typeof object.key !== "string") {
      return { index, key: null, decision: "KEEP", reason: "INVALID_INVENTORY" };
    }
    const key = object.key;
    if (seen.has(key)) return { index, key, decision: "KEEP", reason: "DUPLICATE_INVENTORY" };
    seen.add(key);
    const day = dateOfKey(key, databaseName);
    if (!day) return { index, key, decision: "KEEP", reason: key.startsWith(prefix) ? "INVALID_KEY" : "OUT_OF_SCOPE" };
    if (typeof object.lastModified !== "string" || !Number.isFinite(Date.parse(object.lastModified)) ||
        !/^\d{4}-\d{2}-\d{2}T/.test(object.lastModified) || !/(Z|[+-]\d{2}:\d{2})$/.test(object.lastModified)) {
      return { index, key, decision: "KEEP", reason: "UNVERIFIED_PROVIDER_TIMESTAMP" };
    }
    const modified = Date.parse(object.lastModified);
    const created = Date.parse(day + "T00:00:00.000Z");
    if (modified > now.getTime() || created > now.getTime() || modified < created) {
      return { index, key, decision: "KEEP", reason: "INCONSISTENT_TIMESTAMP" };
    }
    if (object.verified !== true || object.restoreTested !== true) {
      return { index, key, decision: "KEEP", reason: "UNVERIFIED_RECOVERABILITY" };
    }
    if (protectedKeys.has(key) || object.legalHold === true) {
      return { index, key, decision: "KEEP", reason: "LEGAL_OR_RESTORE_HOLD" };
    }
    if (object.legalHold !== false) {
      return { index, key, decision: "KEEP", reason: "UNKNOWN_HOLD_STATUS" };
    }
    return { index, key, day, modified, decision: "KEEP", reason: "PENDING_EVALUATION" };
  });
  const valid = entries.filter(x => x.reason === "PENDING_EVALUATION");
  const sorted = [...valid].sort((a,b) => b.day.localeCompare(a.day) || b.modified - a.modified);
  const keepNewest = new Set(sorted.slice(0, minimumRecoverableCopies).map(x => x.key));
  // Conservative: do not mark any key as candidate if fewer than the minimum
  // verified, restore-tested, hold-cleared copies exist in this inventory.
  const enough = valid.length >= minimumRecoverableCopies;
  const cutoff = now.getTime() - days * DAY_MS;
  for (const entry of valid) {
    if (!enough) entry.reason = "INSUFFICIENT_VERIFIED_COPIES";
    else if (keepNewest.has(entry.key)) entry.reason = "MINIMUM_RECOVERY_COPIES";
    else if (entry.modified >= cutoff) entry.reason = "WITHIN_RETENTION";
    else {
      entry.decision = "REVIEW_ONLY";
      entry.reason = "OLDER_THAN_CANDIDATE_WINDOW";
    }
  }
  return Object.freeze({
    status: K2_RETENTION_STATUS,
    dryRun: true,
    deleteAuthorized: false,
    candidateDays: days,
    databaseName,
    evaluatedAt: now.toISOString(),
    inventoryComplete: false, // Never inferred from a supplied array.
    providerLifecycleConfigured: false,
    candidates: entries.filter(x => x.decision === "REVIEW_ONLY").length,
    entries: entries.map(({index,key,decision,reason}) => ({index,key,decision,reason})),
  });
}
