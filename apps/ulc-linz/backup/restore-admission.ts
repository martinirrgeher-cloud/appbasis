/**
 * P04-C offline restore admission evidence classifier.
 * No SQL, Provider I/O, permissions mutation, or runtime wiring.
 * A complete result is still ONLY eligible for manual quarantined review.
 */
export const REQUIRED_ULC_BACKUP_OWNERS = Object.freeze([
  "identity",
  "permissions",
  "athletes",
  "ulc-linz-lifecycle",
  "exercise-catalog",
  "training-blocks",
  "training-plans",
  "training-documentation",
] as const);

type OwnerId = (typeof REQUIRED_ULC_BACKUP_OWNERS)[number];
export interface RestoreOwnerCheckpoint {
  readonly owner: OwnerId | string;
  readonly outcome: "verified-clean" | "unverified" | "error";
  readonly checkedAfterReplay: boolean;
}

export interface BackupRestoreAdmission {
  readonly nowUTC: string;
  readonly snapshot: {
    readonly id: string;
    readonly capturedAtUTC: string;
    readonly verifiedCiphertextSha256: boolean;
    readonly authenticatedDecryption: boolean;
    readonly databaseIdentityVerified: boolean;
    readonly encryptedFormat: "age-x25519" | string;
  };
  readonly quarantine: {
    readonly isolatedNetworkAndDatabase: boolean;
    readonly publicIngressDisabled: boolean;
    readonly writersAndSchedulersFrozen: boolean;
    readonly postgresqlRestoreVerified: boolean;
  };
  readonly erasureAuthority: {
    readonly independentOfRestoredSnapshot: boolean;
    readonly sourceCompletenessVerified: boolean;
    readonly sourceValidUntilUTC: string;
    readonly capturedThroughUTC: string;
    readonly allDeletionsSinceSnapshotIncluded: boolean;
    readonly allOwnersReconciled: boolean;
    readonly checkpoints: readonly RestoreOwnerCheckpoint[];
  };
}

export type RestoreAdmissionReason =
  | "invalid-timestamp"
  | "snapshot-invalid"
  | "snapshot-marker-window-expired"
  | "ciphertext-or-database-unverified"
  | "quarantine-not-closed"
  | "independent-erasure-source-missing"
  | "erasure-source-expired-or-incomplete"
  | "owner-checkpoints-incomplete";

export type RestoreAdmissionResult =
  | Readonly<{
      decision: "blocked";
      reason: RestoreAdmissionReason;
      productionReleaseAllowed: false;
    }>
  | Readonly<{
      decision: "quarantine-manual-review-only";
      reason: "operator-privacy-and-go-live-approval-required";
      productionReleaseAllowed: false;
    }>;

const SOURCE_MARKER_WINDOW_MS = 35 * 24 * 60 * 60 * 1000;

function parseUTC(value: unknown): number | null {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    return null;
  }
  const milliseconds = Date.parse(value);
  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== value
  ) {
    return null;
  }
  return milliseconds;
}

function deny(reason: RestoreAdmissionReason): RestoreAdmissionResult {
  return Object.freeze({
    decision: "blocked",
    reason,
    productionReleaseAllowed: false,
  });
}

export function evaluateUlcBackupRestoreAdmission(
  evidence: BackupRestoreAdmission,
): RestoreAdmissionResult {
  const now = parseUTC(evidence?.nowUTC);
  const snapshotAt = parseUTC(evidence?.snapshot?.capturedAtUTC);
  const authorityUntil = parseUTC(
    evidence?.erasureAuthority?.sourceValidUntilUTC,
  );
  const sourceCapturedThrough = parseUTC(
    evidence?.erasureAuthority?.capturedThroughUTC,
  );
  if (
    now === null ||
    snapshotAt === null ||
    authorityUntil === null ||
    sourceCapturedThrough === null
  ) {
    return deny("invalid-timestamp");
  }
  if (
    !/^[a-z0-9][a-z0-9_-]{7,100}$/.test(evidence.snapshot.id) ||
    snapshotAt > now ||
    sourceCapturedThrough > now
  ) {
    return deny("snapshot-invalid");
  }
  if (now - snapshotAt >= SOURCE_MARKER_WINDOW_MS) {
    return deny("snapshot-marker-window-expired");
  }
  if (
    !evidence.snapshot.verifiedCiphertextSha256 ||
    !evidence.snapshot.authenticatedDecryption ||
    !evidence.snapshot.databaseIdentityVerified ||
    evidence.snapshot.encryptedFormat !== "age-x25519"
  ) {
    return deny("ciphertext-or-database-unverified");
  }
  if (
    !evidence.quarantine?.isolatedNetworkAndDatabase ||
    !evidence.quarantine.publicIngressDisabled ||
    !evidence.quarantine.writersAndSchedulersFrozen ||
    !evidence.quarantine.postgresqlRestoreVerified
  ) {
    return deny("quarantine-not-closed");
  }
  const authority = evidence.erasureAuthority;
  if (
    !authority.independentOfRestoredSnapshot ||
    !authority.sourceCompletenessVerified
  ) {
    return deny("independent-erasure-source-missing");
  }
  if (
    authorityUntil < now ||
    sourceCapturedThrough < snapshotAt ||
    !authority.allDeletionsSinceSnapshotIncluded ||
    !authority.allOwnersReconciled
  ) {
    return deny("erasure-source-expired-or-incomplete");
  }
  const expected = new Set<string>(REQUIRED_ULC_BACKUP_OWNERS);
  const checked = new Set<string>();
  if (
    !Array.isArray(authority.checkpoints) ||
    authority.checkpoints.length !== expected.size
  ) {
    return deny("owner-checkpoints-incomplete");
  }
  for (const checkpoint of authority.checkpoints) {
    if (
      !checkpoint ||
      !expected.has(checkpoint.owner) ||
      checked.has(checkpoint.owner) ||
      checkpoint.outcome !== "verified-clean" ||
      checkpoint.checkedAfterReplay !== true
    ) {
      return deny("owner-checkpoints-incomplete");
    }
    checked.add(checkpoint.owner);
  }
  if (checked.size !== expected.size) {
    return deny("owner-checkpoints-incomplete");
  }

  // Even syntactically complete evidence is not cryptographic provenance,
  // a real restore check, legal clearance, or authorization to reconnect.
  return Object.freeze({
    decision: "quarantine-manual-review-only",
    reason: "operator-privacy-and-go-live-approval-required",
    productionReleaseAllowed: false,
  });
}
