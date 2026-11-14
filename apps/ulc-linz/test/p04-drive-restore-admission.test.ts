import { describe, expect, it } from "vitest";

import {
  evaluateUlcBackupRestoreAdmission,
  REQUIRED_ULC_BACKUP_OWNERS,
  type BackupRestoreAdmission,
  type RestoreAdmissionReason,
} from "../backup/restore-admission";

function fullFixture(): BackupRestoreAdmission {
  return {
    nowUTC: "2026-11-14T10:00:00.000Z",
    snapshot: {
      id: "synthetic-restore-test",
      capturedAtUTC: "2026-11-13T10:00:00.000Z",
      verifiedCiphertextSha256: true,
      authenticatedDecryption: true,
      databaseIdentityVerified: true,
      encryptedFormat: "age-x25519",
    },
    quarantine: {
      isolatedNetworkAndDatabase: true,
      publicIngressDisabled: true,
      writersAndSchedulersFrozen: true,
      postgresqlRestoreVerified: true,
    },
    erasureAuthority: {
      independentOfRestoredSnapshot: true,
      sourceCompletenessVerified: true,
      sourceValidUntilUTC: "2026-11-21T10:00:00.000Z",
      capturedThroughUTC: "2026-11-14T09:59:00.000Z",
      allDeletionsSinceSnapshotIncluded: true,
      allOwnersReconciled: true,
      checkpoints: REQUIRED_ULC_BACKUP_OWNERS.map((owner) => ({
        owner, outcome: "verified-clean", checkedAfterReplay: true,
      })),
    },
  };
}
function assertBlocked(
  fixture: BackupRestoreAdmission,
  reason: RestoreAdmissionReason,
): void {
  expect(evaluateUlcBackupRestoreAdmission(fixture)).toEqual({
    decision: "blocked", reason, productionReleaseAllowed: false,
  });
}

describe("P04-C Google Drive backups – quarantine restore gate only", () => {
  it("never grants live release, even for syntactically complete evidence", () => {
    expect(REQUIRED_ULC_BACKUP_OWNERS).toHaveLength(8);
    expect(evaluateUlcBackupRestoreAdmission(fullFixture())).toEqual({
      decision: "quarantine-manual-review-only",
      reason: "operator-privacy-and-go-live-approval-required",
      productionReleaseAllowed: false,
    });
  });

  it("rejects non-canonical timestamps and impossible calendar values", () => {
    const fixture = fullFixture();
    assertBlocked({ ...fixture, nowUTC: "2026-11-14" }, "invalid-timestamp");
    assertBlocked({
      ...fixture,
      snapshot: { ...fixture.snapshot,
        capturedAtUTC: "2026-02-30T10:00:00.000Z" },
    }, "invalid-timestamp");
    assertBlocked({
      ...fixture,
      erasureAuthority: {
        ...fixture.erasureAuthority,
        sourceValidUntilUTC: "2026-11-14T11:00:00+01:00",
      },
    }, "invalid-timestamp");
  });

  it("blocks future snapshots and impossible source timelines", () => {
    const fixture = fullFixture();
    assertBlocked({
      ...fixture,
      snapshot: { ...fixture.snapshot, capturedAtUTC: "2026-11-15T10:00:00.000Z" },
    }, "snapshot-invalid");
    assertBlocked({
      ...fixture,
      erasureAuthority: {
        ...fixture.erasureAuthority,
        capturedThroughUTC: "2026-11-15T10:00:00.000Z",
      },
    }, "snapshot-invalid");
  });

  it("keeps the current 35-day source-authority window fail-closed", () => {
    const fixture = fullFixture();
    assertBlocked({
      ...fixture,
      snapshot: {
        ...fixture.snapshot,
        capturedAtUTC: "2026-10-10T10:00:00.000Z",
      },
    }, "snapshot-marker-window-expired");
    assertBlocked({
      ...fixture,
      snapshot: {
        ...fixture.snapshot,
        capturedAtUTC: "2026-10-09T10:00:00.000Z",
      },
    }, "snapshot-marker-window-expired");
  });

  it("rejects a mere hash, unauthenticated decryption and foreign database identity", () => {
    const fixture = fullFixture();
    assertBlocked({
      ...fixture,
      snapshot: { ...fixture.snapshot, verifiedCiphertextSha256: false },
    }, "ciphertext-or-database-unverified");
    assertBlocked({
      ...fixture,
      snapshot: { ...fixture.snapshot, authenticatedDecryption: false },
    }, "ciphertext-or-database-unverified");
    assertBlocked({
      ...fixture,
      snapshot: { ...fixture.snapshot, databaseIdentityVerified: false },
    }, "ciphertext-or-database-unverified");
    assertBlocked({
      ...fixture,
      snapshot: { ...fixture.snapshot, encryptedFormat: "unknown" },
    }, "ciphertext-or-database-unverified");
  });

  it("requires frozen writers, no public ingress and a quarantined PostgreSQL restore", () => {
    const fixture = fullFixture();
    for (const key of [
      "isolatedNetworkAndDatabase",
      "publicIngressDisabled",
      "writersAndSchedulersFrozen",
      "postgresqlRestoreVerified",
    ] as const) {
      assertBlocked({
        ...fixture, quarantine: { ...fixture.quarantine, [key]: false },
      }, "quarantine-not-closed");
    }
  });

  it("refuses backup-derived, expired or incomplete erasure authorities", () => {
    const fixture = fullFixture();
    assertBlocked({
      ...fixture,
      erasureAuthority: {
        ...fixture.erasureAuthority, independentOfRestoredSnapshot: false,
      },
    }, "independent-erasure-source-missing");
    assertBlocked({
      ...fixture,
      erasureAuthority: {
        ...fixture.erasureAuthority, sourceCompletenessVerified: false,
      },
    }, "independent-erasure-source-missing");
    assertBlocked({
      ...fixture,
      erasureAuthority: {
        ...fixture.erasureAuthority,
        sourceValidUntilUTC: "2026-11-14T09:59:59.999Z",
      },
    }, "erasure-source-expired-or-incomplete");
    assertBlocked({
      ...fixture,
      erasureAuthority: {
        ...fixture.erasureAuthority,
        capturedThroughUTC: "2026-11-12T10:00:00.000Z",
      },
    }, "erasure-source-expired-or-incomplete");
    assertBlocked({
      ...fixture,
      erasureAuthority: {
        ...fixture.erasureAuthority,
        allDeletionsSinceSnapshotIncluded: false,
      },
    }, "erasure-source-expired-or-incomplete");
  });

  it("requires all eight unique verified owner checkpoints after replay", () => {
    const fixture = fullFixture();
    const required = fixture.erasureAuthority.checkpoints;
    assertBlocked({
      ...fixture,
      erasureAuthority: {
        ...fixture.erasureAuthority, checkpoints: required.slice(0, 7),
      },
    }, "owner-checkpoints-incomplete");
    assertBlocked({
      ...fixture,
      erasureAuthority: {
        ...fixture.erasureAuthority,
        checkpoints: [...required.slice(0, 7), required[0]!],
      },
    }, "owner-checkpoints-incomplete");
    assertBlocked({
      ...fixture,
      erasureAuthority: {
        ...fixture.erasureAuthority,
        checkpoints: [
          ...required.slice(0, 7),
          { owner: "unknown-owner", outcome: "verified-clean",
            checkedAfterReplay: true },
        ],
      },
    }, "owner-checkpoints-incomplete");
    assertBlocked({
      ...fixture,
      erasureAuthority: {
        ...fixture.erasureAuthority,
        checkpoints: [
          ...required.slice(0, 7),
          { ...required[7]!, outcome: "unverified" },
        ],
      },
    }, "owner-checkpoints-incomplete");
    assertBlocked({
      ...fixture,
      erasureAuthority: {
        ...fixture.erasureAuthority,
        checkpoints: [
          ...required.slice(0, 7),
          { ...required[7]!, checkedAfterReplay: false },
        ],
      },
    }, "owner-checkpoints-incomplete");
  });
});
