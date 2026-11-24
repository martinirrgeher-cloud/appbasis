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
