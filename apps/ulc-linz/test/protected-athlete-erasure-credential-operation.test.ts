import { beforeEach, describe, expect, it, vi } from "vitest";

import { runProtectedUlcLinzAthleteErasureWithCredentials } from
  "../worker/protected-athlete-erasure-credential-operation";

const harness = vi.hoisted(() => ({
  create: vi.fn(async () => {}),
  closeDb: vi.fn(async () => {}),
  closeOwner: vi.fn(async () => {}),
  login: vi.fn(async () => ({
    sessionToken: "signed-session",
    identityId: "admin-identity",
  })),
  logout: vi.fn(async () => {}),
  getSession: vi.fn(async () => null),
  inspect: vi.fn(async () => ({
    status: "structured-follow-up-pending",
    preflight: {
      completedAt: new Date("2026-11-23T12:00:00.000Z"),
      planMarkerPresent: false, usageMarkerPresent: true,
    },
    documentationMarkerPresent: false,
    historyMarkerPresent: false,
    documentationOwned: 1,
    documentationOtherRevisions: 2,
    attendanceRows: 3,
    registrationRows: 4,
    registrationHistoryRows: 5,
    residualReview: { sourceIdentityLinks: 0, identityScopedReferenceRows: null, actorAndAuditReferenceRows: null, fullPrivacyComplete: false },
    eightOwnerReview: {
      linkedIdentityCount: 0,
      owners: ["identity","permissions","athletes","exercise-catalog",
        "training-blocks","training-documentation","training-plans",
        "ulc-linz-lifecycle"].map(owner=>({
          owner, remainingReferences: null, markerPresent: null,
          status: "identity-link-unverified",
        })),
      actorAuditReferences: null, organizationWidePrivateMediaCandidates: 0,
      humanFreeTextReviewRequired: true, auditRetentionDecisionRequired: true,
      providerMediaAbsenceRequired: true, allEightOwnersProvenComplete: false,
      olderRestorePromotionAllowed: false, privacyReady: false,
    },
  })),
  text: vi.fn(async () => ({
    status: "one-exact-owner-text-cell-redacted-only", redacted: true,
    freeTextAndAuditReviewed: false,
    allowsFullPrivacyReady: false, allowsOlderRestorePromotion: false,
  })),
  note: vi.fn(async () => ({
    status: "one-shared-session-note-redacted-only", redacted: true,
    freeTextAndAuditReviewed: false, allowsFullPrivacyReady: false,
    allowsOlderRestorePromotion: false,
  })),
  identityOwner: vi.fn(async () => ({
    status: "identity-block-favorites-owner-complete-only",
    identityDeleted: true, blockFavoriteMarkerVerified: true,
    verified: { preflight: {
      completedAt: new Date("2026-11-23T12:00:00.000Z"),
    } },
  })),
  catalog: vi.fn(async () => ({
    status: "catalog-owner-complete-only",
    result: { deletedFavorites: 1, deletedUsageEvents: 1 },
    verified: {
      preflight: { completedAt: new Date("2026-11-23T12:00:00.000Z") },
    },
  })),
  erase: vi.fn(async () => ({
    status: "four-structured-owners-complete-only",
    result: { completedAt: new Date("2026-11-23T12:00:00.000Z") },
  })),
}));

vi.mock("@appbasis/database", () => ({
  createPostgresDatabase: (...args: unknown[]) => {
    harness.create(...(args as []));
    return { database: {}, client: { end: harness.closeDb } };
  },
}));
vi.mock("@appbasis/identity/better-auth", () => ({
  createBetterAuthRuntime: () => ({}),
}));
vi.mock("@appbasis/identity/server", () => ({
  BetterAuthIdentityBackend: class {
    signInWithUsername = harness.login;
    endSession = harness.logout;
    getSession = harness.getSession;
  },
}));
vi.mock("../worker/protected-athlete-erasure-operation", () => ({
  createProtectedUlcLinzAthleteErasure: vi.fn(async () => ({
    inspect: harness.inspect,
    eraseStructuredOnly: harness.erase,
    eraseCatalogOwnerOnly: harness.catalog,
    eraseIdentityOwnerOnly: harness.identityOwner,
    redactSessionNoteOnly: harness.note,
    redactExactOwnerTextOnly: harness.text,
    close: harness.closeOwner,
  })),
}));

const options = {
  connectionString: "postgresql://privileged-owner@localhost/neondb",
  baseURL: "https://app.ulc-linz.at",
  secret: "s".repeat(32),
  administratorUsername: "ulc.admin",
  administratorPassword: "validpassword",
};
const request = { organizationId: "ulc-linz", subjectId: "athlete-1" };

describe("T07 transient-credential four-owner operation is separately guarded", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns only sanitized counts from a private inspection and always revokes admin session", async () => {
    const result = await runProtectedUlcLinzAthleteErasureWithCredentials(
      options, request, "inspect",
    );
    expect(result).toEqual({
      status: "structured-follow-up-pending",
      sourceDecisionAt: "2026-11-23T12:00:00.000Z",
      planMarkerPresent: false,
      usageMarkerPresent: true,
      documentationMarkerPresent: false,
      historyMarkerPresent: false,
      documentationOwned: 1,
      documentationOtherRevisions: 2,
      attendanceRows: 3,
      registrationRows: 4,
      registrationHistoryRows: 5,
      residualReview: { sourceIdentityLinks: 0, identityScopedReferenceRows: null, actorAndAuditReferenceRows: null, fullPrivacyComplete: false },
      eightOwnerReview: {
        linkedIdentityCount: 0,
        owners: ["identity","permissions","athletes","exercise-catalog",
          "training-blocks","training-documentation","training-plans",
          "ulc-linz-lifecycle"].map(owner=>({
            owner, remainingReferences: null, markerPresent: null,
            status: "identity-link-unverified",
          })),
        actorAuditReferences: null, organizationWidePrivateMediaCandidates: 0,
        humanFreeTextReviewRequired: true, auditRetentionDecisionRequired: true,
        providerMediaAbsenceRequired: true, allEightOwnersProvenComplete: false,
        olderRestorePromotionAllowed: false, privacyReady: false,
      },
      fullErasureAuthorized: false,
      olderRestorePromotionAuthorized: false,
    });
    expect(JSON.stringify(result)).not.toContain("athlete-1");
    expect(harness.create).toHaveBeenCalledTimes(1);
    expect(harness.inspect).toHaveBeenCalledWith(request);
    expect(harness.erase).not.toHaveBeenCalled();
    expect(harness.login).toHaveBeenCalledOnce();
    expect(harness.logout).toHaveBeenCalledWith("signed-session");
    expect(harness.getSession).toHaveBeenCalledWith("signed-session");
    expect(harness.closeOwner).toHaveBeenCalledOnce();
    expect(harness.closeDb).toHaveBeenCalledOnce();
  });

  it("rejects malformed credentials, foreign base URL or destructive mode before login and connection", async () => {
    const failures = [
      { options: { ...options, secret: "short" }, mode: "inspect" },
      { options: { ...options, baseURL: "https://example.org" }, mode: "inspect" },
      { options: { ...options, administratorPassword: "bad" }, mode: "inspect" },
      { options, mode: "unrecognized" },
      { options, mode: "erase-structured-only" },
    ];
    for (const failure of failures) {
      await expect(runProtectedUlcLinzAthleteErasureWithCredentials(
        failure.options, request, failure.mode as never,
      )).rejects.toThrow();
    }
    expect(harness.create).not.toHaveBeenCalled();
    expect(harness.login).not.toHaveBeenCalled();
  });

  it("only accepts an explicit structured-only confirmation and returns no personal identifiers", async () => {
    const r = await runProtectedUlcLinzAthleteErasureWithCredentials(
      options, request, "erase-structured-only",
      { confirmation: "ERASE-ULC-T07-FOUR-STRUCTURED-OWNERS",
        expectedSourceCompletedAt: "2026-11-23T12:00:00.000Z" },
    );
    expect(r).toEqual({
      status: "four-structured-owners-complete-only",
      sourceDecisionAt: "2026-11-23T12:00:00.000Z",
      structuredOwnersVerified: true,
      fullErasureAuthorized: false,
      olderRestorePromotionAuthorized: false,
    });
    expect(harness.erase).toHaveBeenCalledTimes(1);
    expect(harness.logout).toHaveBeenCalledTimes(1);
    expect(harness.closeDb).toHaveBeenCalledTimes(1);
  });

  it("has a separately confirmed fifth catalogue owner mode and no broader erasure certificate", async () => {
    await expect(runProtectedUlcLinzAthleteErasureWithCredentials(
      options, request, "erase-catalog-owner-only",
      { confirmation: "ERASE-ULC-T07-FOUR-STRUCTURED-OWNERS",
        expectedSourceCompletedAt: "2026-11-23T12:00:00.000Z" },
    )).rejects.toThrow(/explicit operator approval/);
    expect(harness.login).not.toHaveBeenCalled();
    const result = await runProtectedUlcLinzAthleteErasureWithCredentials(
      options, request, "erase-catalog-owner-only",
      { confirmation: "ERASE-ULC-T07-VERIFIED-CATALOG-OWNER",
        expectedSourceCompletedAt: "2026-11-23T12:00:00.000Z" },
    );
    expect(result).toEqual({
      status: "catalog-owner-complete-only",
      sourceDecisionAt: "2026-11-23T12:00:00.000Z",
      catalogOwnerProofVerified: true,
      fullErasureAuthorized: false,
      olderRestorePromotionAuthorized: false,
    });
    expect(harness.catalog).toHaveBeenCalledOnce();
    expect(harness.erase).not.toHaveBeenCalled();
    expect(harness.logout).toHaveBeenCalledWith("signed-session");
    expect(harness.closeDb).toHaveBeenCalledOnce();
  });

  it("separately authorizes canonical identity and block favorite deletion, returns only safe flags", async () => {
    await expect(runProtectedUlcLinzAthleteErasureWithCredentials(
      options, request, "erase-identity-owner-only",
      { confirmation: "ERASE-ULC-T07-VERIFIED-CATALOG-OWNER",
        expectedSourceCompletedAt: "2026-11-23T12:00:00.000Z" },
    )).rejects.toThrow(/explicit operator approval/);
    expect(harness.login).not.toHaveBeenCalled();
    const result = await runProtectedUlcLinzAthleteErasureWithCredentials(
      options, request, "erase-identity-owner-only",
      { confirmation: "ERASE-ULC-T07-VERIFIED-IDENTITY-OWNER",
        expectedSourceCompletedAt: "2026-11-23T12:00:00.000Z" },
    );
    expect(result).toEqual({
      status: "identity-block-favorites-owner-complete-only",
      sourceDecisionAt: "2026-11-23T12:00:00.000Z",
      identityOwnerProofVerified: true,
      blockFavoriteMarkerVerified: true,
      fullErasureAuthorized: false,
      olderRestorePromotionAuthorized: false,
    });
    expect(JSON.stringify(result)).not.toContain("athlete-1");
    expect(harness.identityOwner).toHaveBeenCalledOnce();
    expect(harness.erase).not.toHaveBeenCalled();
    expect(harness.catalog).not.toHaveBeenCalled();
    expect(harness.logout).toHaveBeenCalledWith("signed-session");
    expect(harness.closeDb).toHaveBeenCalledOnce();
  });

  it("requires a distinct exact-note approval and never exports session fields", async () => {
    const auth = {
      confirmation: "REDACT-ULC-T07-EXACT-SESSION-NOTE",
      expectedSourceCompletedAt: "2026-11-23T12:00:00.000Z",
      sessionId: "session-1", expectedSessionDate: "2026-11-15",
      expectedNoteSha256: "a".repeat(64),
    };
    await expect(runProtectedUlcLinzAthleteErasureWithCredentials(
      options, request, "redact-session-note-only",
      { ...auth, confirmation: "ERASE-ULC-T07-FOUR-STRUCTURED-OWNERS" },
    )).rejects.toThrow(/explicit operator approval/);
    expect(harness.login).not.toHaveBeenCalled();
    const result = await runProtectedUlcLinzAthleteErasureWithCredentials(
      options, request, "redact-session-note-only", auth,
    );
    expect(result).toEqual({
      status: "one-shared-session-note-redacted-only",
      sessionNoteProofVerified: true, fullErasureAuthorized: false,
      olderRestorePromotionAuthorized: false,
    });
    expect(JSON.stringify(result)).not.toContain("session-1");
    expect(JSON.stringify(result)).not.toContain(auth.expectedNoteSha256);
    expect(harness.note).toHaveBeenCalledWith(request, auth);
    expect(harness.logout).toHaveBeenCalledWith("signed-session");
    expect(harness.closeOwner).toHaveBeenCalledOnce();
  });

  it("requires a distinct exact-owner-cell approval and returns no personal field IDs", async () => {
    const approval = {
      confirmation: "REDACT-ULC-T07-EXACT-OWNER-TEXT",
      expectedSourceCompletedAt: "2026-11-23T12:00:00.000Z",
      textTarget: "training-plan-item-comment",
      textKeys: ["plan-1","2","item-1"],
      expectedValueSha256: "a".repeat(64),
    };
    await expect(runProtectedUlcLinzAthleteErasureWithCredentials(
      options, request, "redact-exact-owner-text-only",
      { ...approval, confirmation: "ERASE-ULC-T07-FOUR-STRUCTURED-OWNERS" },
    )).rejects.toThrow(/explicit operator approval/);
    expect(harness.login).not.toHaveBeenCalled();
    const output = await runProtectedUlcLinzAthleteErasureWithCredentials(
      options, request, "redact-exact-owner-text-only", approval,
    );
    expect(output).toEqual({
      status: "one-exact-owner-text-cell-redacted-only",
      exactOwnerTextProofVerified: true, fullErasureAuthorized: false,
      olderRestorePromotionAuthorized: false,
    });
    expect(JSON.stringify(output)).not.toContain("plan-1");
    expect(JSON.stringify(output)).not.toContain("item-1");
    expect(JSON.stringify(output)).not.toContain(approval.expectedValueSha256);
    expect(harness.text).toHaveBeenCalledWith(request, {
      organizationId: "ulc-linz", subjectId: "athlete-1",
      expectedSourceCompletedAt: approval.expectedSourceCompletedAt,
      confirmation: approval.confirmation, target: approval.textTarget,
      keys: approval.textKeys, expectedValueSha256: approval.expectedValueSha256,
    });
    expect(harness.logout).toHaveBeenCalledOnce();
    expect(harness.closeDb).toHaveBeenCalledOnce();
  });

  it("still ends temporary session and both connections after a partial owner failure", async () => {
    harness.erase.mockRejectedValueOnce(new Error("owner failed after earlier writes"));
    await expect(runProtectedUlcLinzAthleteErasureWithCredentials(
      options, request, "erase-structured-only",
      { confirmation: "ERASE-ULC-T07-FOUR-STRUCTURED-OWNERS",
        expectedSourceCompletedAt: "2026-11-23T12:00:00.000Z" },
    )).rejects.toThrow(/owner failed/);
    expect(harness.logout).toHaveBeenCalledOnce();
    expect(harness.getSession).toHaveBeenCalledOnce();
    expect(harness.closeOwner).toHaveBeenCalledOnce();
    expect(harness.closeDb).toHaveBeenCalledOnce();
  });

  it("does not claim success when transient administrator session is not revoked", async () => {
    harness.getSession.mockResolvedValueOnce({ identityId: "admin-identity" } as never);
    await expect(runProtectedUlcLinzAthleteErasureWithCredentials(
      options, request, "inspect",
    )).rejects.toThrow(/session cleanup failed/);
    expect(harness.closeOwner).toHaveBeenCalledOnce();
    expect(harness.closeDb).toHaveBeenCalledOnce();
  });
});
