import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

interface BackupCandidate {
  readonly documentType: string;
  readonly intentSource: string;
  readonly provider: string;
  readonly status: string;
  readonly approvals: Record<string, boolean>;
  readonly applicationBindings: {
    readonly productionDatabase: string;
    readonly googleAccountType: string;
    readonly driveId: string | null;
    readonly folderId: string | null;
    readonly folderSetupStatus: string;
    readonly folderShared: boolean;
    readonly interactiveConnectorAccess: boolean;
    readonly scheduledJobOAuthAvailable: boolean;
    readonly credentialsConfigured: boolean;
    readonly jobConfigured: boolean;
    readonly uploadEnabled: boolean;
  };
  readonly provisionalSchedule: {
    readonly frequency: string;
    readonly retentionDays: number;
    readonly status: string;
    readonly safety: string;
  };
  readonly encryption: {
    readonly requiredBeforeUpload: boolean;
    readonly cleartextUploadAllowed: boolean;
    readonly keyStoredInDrive: boolean;
    readonly plaintextFilenameWithPersonIdentifiersAllowed: boolean;
    readonly recoveryPrivateKeyCustodian: string;
  };
  readonly identityAndPermissions: {
    readonly personalAccountAsDefault: boolean;
    readonly privateMyDriveSelected: boolean;
    readonly userAccountConsentForConnection: boolean;
    readonly googleAccountIdentityVerified: boolean;
    readonly backupFolderOwnerVerified: boolean;
    readonly accountLossAndSuccessionPlanApproved: boolean;
    readonly appFolderOnlyOAuthIntended: boolean;
    readonly privateKeyAccessibleToClubWithoutUserAccount: boolean;
    readonly publicSharingAllowed: boolean;
    readonly leastPrivilegeRequired: boolean;
    readonly thirdPartyAppAndGoogleDpaReviewed: boolean;
    readonly transferRiskReviewed: boolean;
  };
  readonly lifecycle: {
    readonly currentAthleteDeletionMarkerDays: number;
    readonly postExpiryRetry: string;
    readonly allowLongerPersonRetainingLedger: boolean;
    readonly requireRealBackupAndExportHorizonEvidence: boolean;
    readonly requirePermanentDeleteNotTrash: boolean;
    readonly requireAllEightOwnerReDeletion: boolean;
    readonly requireNewerIndependentErasureEvidence: boolean;
    readonly requireRestoreQuarantine: boolean;
    readonly noLiveRestoreUntilOperatorApproval: boolean;
    readonly driveTrashCanKeepFilesDays: number;
    readonly driveTrashCannotCountAsDeletion: boolean;
    readonly effectiveMaxRecoverableAge: string;
    readonly missingDeletionEvidence: string;
    readonly missingProviderProof: string;
    readonly staleBackup: string;
    readonly sourceMarkerExpired: string;
  };
  readonly plannedWorkflow: readonly string[];
  readonly blockers: readonly string[];
}

async function readJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(
    await readFile(new URL(relativePath, import.meta.url), "utf8"),
  ) as T;
}

describe("ULC P04-B future Google Drive backup – offline requirements only", () => {
  it("explicitly treats Google Drive as a future target with no credentials, file upload or job", async () => {
    const plan = await readJson<BackupCandidate>(
      "../privacy/p04-google-drive-offsite-backup-candidate.json",
    );
    expect(plan.provider).toBe("google-drive");
    expect(plan.documentType).toBe(
      "future-offsite-backup-candidate-not-deployment-config",
    );
    expect(plan.intentSource).toContain("future database backups");
    expect(plan.intentSource).toContain("mein google drive");
    expect(plan.status).toBe("planned-not-configured");
    expect(Object.keys(plan.approvals).length).toBeGreaterThan(5);
    expect(plan.approvals.backupTargetSelection).toBe(true);
    expect(Object.entries(plan.approvals).filter(
      ([name]) => name !== "backupTargetSelection",
    ).every(([, approved]) => approved === false)).toBe(true);
    expect(plan.applicationBindings).toMatchObject({
      productionDatabase: "unverified",
      googleAccountType: "user-owned-my-drive-consumer-or-workspace-not-verified",
      driveId: null,
      folderId: "1GpEzbPYeg-3KYHJUses7va8llYWpbl85",
      folderSetupStatus: "empty-folder-created-and-readback-verified-via-interactive-connector",
      folderShared: false,
      interactiveConnectorAccess: true,
      scheduledJobOAuthAvailable: false,
      credentialsConfigured: false,
      jobConfigured: false,
      uploadEnabled: false,
    });
  });

  it("requires encryption before upload, separate recovery keys and private club ownership", async () => {
    const plan = await readJson<BackupCandidate>(
      "../privacy/p04-google-drive-offsite-backup-candidate.json",
    );
    expect(plan.encryption).toMatchObject({
      requiredBeforeUpload: true,
      cleartextUploadAllowed: false,
      keyStoredInDrive: false,
      plaintextFilenameWithPersonIdentifiersAllowed: false,
    });
    expect(plan.encryption.recoveryPrivateKeyCustodian).toContain("outside-drive");
    expect(plan.identityAndPermissions).toMatchObject({
      personalAccountAsDefault: true,
      privateMyDriveSelected: true,
      userAccountConsentForConnection: false,
      googleAccountIdentityVerified: false,
      backupFolderOwnerVerified: false,
      accountLossAndSuccessionPlanApproved: false,
      appFolderOnlyOAuthIntended: true,
      privateKeyAccessibleToClubWithoutUserAccount: false,
      publicSharingAllowed: false,
      leastPrivilegeRequired: true,
      thirdPartyAppAndGoogleDpaReviewed: false,
      transferRiskReviewed: false,
    });
  });

  it("cannot claim a 14-day Drive rotation is a 14-day effective restore horizon", async () => {
    const plan = await readJson<BackupCandidate>(
      "../privacy/p04-google-drive-offsite-backup-candidate.json",
    );
    expect(plan.provisionalSchedule).toMatchObject({
      frequency: "daily", retentionDays: 14,
      status: "unapproved-engineering-candidate",
    });
    expect(plan.provisionalSchedule.retentionDays).toBeLessThan(
      plan.lifecycle.currentAthleteDeletionMarkerDays,
    );
    expect(plan.lifecycle.driveTrashCanKeepFilesDays).toBe(30);
    expect(
      plan.provisionalSchedule.retentionDays +
      plan.lifecycle.driveTrashCanKeepFilesDays,
    ).toBeGreaterThan(plan.lifecycle.currentAthleteDeletionMarkerDays);
    expect(plan.lifecycle).toMatchObject({
      requirePermanentDeleteNotTrash: true,
      driveTrashCannotCountAsDeletion: true,
      effectiveMaxRecoverableAge:
        "unknown-until-drive-versions-trash-provider-and-external-copies-audited",
      requireRealBackupAndExportHorizonEvidence: true,
    });
  });

  it("denies restoration without newer deletion decisions, owner checks and operator clearance", async () => {
    const plan = await readJson<BackupCandidate>(
      "../privacy/p04-google-drive-offsite-backup-candidate.json",
    );
    expect(plan.lifecycle).toMatchObject({
      requireAllEightOwnerReDeletion: true,
      requireNewerIndependentErasureEvidence: true,
      requireRestoreQuarantine: true,
      noLiveRestoreUntilOperatorApproval: true,
      allowLongerPersonRetainingLedger: false,
      missingDeletionEvidence: "BLOCKED",
      missingProviderProof: "BLOCKED",
      staleBackup: "BLOCKED",
      sourceMarkerExpired: "BLOCKED",
    });
    expect(plan.blockers).toContain("no-active-backup-workflow");
    expect(plan.blockers).toContain(
      "personal-my-drive-ownership-and-club-access-after-account-loss-not-approved",
    );
    expect(plan.blockers).toContain(
      "user-specific-oauth-consent-and-scope-not-granted",
    );
  });

  it("preserves the existing 35-day authority and every production privacy/backup gate", async () => {
    const plan = await readJson<BackupCandidate>(
      "../privacy/p04-google-drive-offsite-backup-candidate.json",
    );
    const deletion = await readJson<{
      status: string;
      currentSourceAuthority: {
        markerRetentionDays: number;
        postExpiryRetry: string;
      };
      deployment: {
        databaseMigration: boolean;
        runtimeWiring: boolean;
        productionGate: boolean;
      };
    }>("../privacy/athlete-deletion-recovery-policy.json");
    const provider = await readJson<{
      m5: { unknownProvider: string; providerScope: string };
      providerScope: readonly { id: string; appSpecificProductionEvidence: string }[];
    }>("../privacy/m5-provider-compliance-inventory.json");
    const app = await readJson<{
      status: string;
      crossCutting: { privacy: string; applicationLifecycle: string };
    }>("../appbasis.production.json");
    expect(plan.lifecycle.currentAthleteDeletionMarkerDays).toBe(35);
    expect(plan.lifecycle.postExpiryRetry).toBe("deny");
    expect(deletion.currentSourceAuthority).toMatchObject({
      markerRetentionDays: 35,
      postExpiryRetry: "deny",
    });
    expect(deletion.deployment).toMatchObject({
      databaseMigration: false,
      runtimeWiring: false,
      productionGate: false,
    });
    expect(deletion.status).toBe("blocked-pending-operator-privacy-policy");
    expect(provider.m5.unknownProvider).toBe("fail-closed");
    expect(provider.m5.providerScope).toBe("cloudflare-and-neon-postgresql-only");
    expect(provider.providerScope.every((entry) =>
      entry.appSpecificProductionEvidence === "open")).toBe(true);
    expect(app.status).toBe("blocked");
    expect(app.crossCutting).toMatchObject({
      privacy: "blocked",
      applicationLifecycle: "blocked",
    });
  });
});
