import { beforeEach, describe, expect, it, vi } from "vitest";

import { createProtectedUlcLinzAthleteErasure } from
  "../worker/protected-athlete-erasure-operation";

const fake = vi.hoisted(() => {
  const events: string[] = [];
  const completedAt = new Date("2026-11-21T12:00:00.000Z");
  return {
    events,
    completedAt,
    favoriteMarkerExists: false,
    blockFavoriteDelete: vi.fn(async () => ({
      markerInserted: true, deletedFavorites: 2,
    })),
    canonicalIdentity: vi.fn(async (_c: unknown, dependencies: {
      favorites: { deletePrincipalFavorites: (org: string, id: string) => Promise<{
        markerInserted: boolean; deletedFavorites: number }>; },
    }, request: { organizationId: string; targetIdentityId: string }) => {
      const outcome = await dependencies.favorites.deletePrincipalFavorites(
        request.organizationId, request.targetIdentityId,
      );
      fake.favoriteMarkerExists = true;
      return {
        identityId: request.targetIdentityId,
        identityDeleted: true, permissionPrincipalDeleted: true,
        deletedTrainingBlockFavorites: outcome.deletedFavorites,
      };
    }),
    current: vi.fn(async () => ({ identity: { identityId: "admin-1" }, access: "full" })),
    db: vi.fn(async (sql: string) => {
      if (sql.includes("current_database()")) return [{ database_name: "neondb" }];
      if (sql.includes("ulc_linz_lifecycle_deletion") && sql.includes("'live' AS record_source")) {
        return [{ identity_id: "member-1", source_role: "athlete", record_source: "live",
          completed_at: null, purge_after: null }];
      }
      if (sql.includes("appbasis_training_block_favorite_deletion") &&
          sql.includes("principal_id=$2")) {
        return fake.favoriteMarkerExists
          ? [{ completed_at: completedAt,
              purge_after: new Date(completedAt.getTime() + 35 * 86400_000) }]
          : [];
      }
      if (sql.includes("appbasis_training_documentation_subject_deletion")) return [
        { owner: "documentation", completed_at: completedAt,
          purge_after: new Date(completedAt.getTime() + 35 * 24 * 60 * 60 * 1000) },
        { owner: "history", completed_at: completedAt,
          purge_after: new Date(completedAt.getTime() + 35 * 24 * 60 * 60 * 1000) },
      ];
      throw new Error("unexpected T07 SQL");
    }),
    close: vi.fn(async () => {}),
    inspect: vi.fn(async () => ({
      organizationId: "ulc-linz",
      subjectId: "subject-1",
      status: "owner-markers-match",
      completedAt,
      planMarkerPresent: true,
      usageMarkerPresent: true,
      remainingPlans: 0,
      remainingAttributedUsageEvents: 0,
    })),
    docs: vi.fn(async () => ({
      organizationId: "ulc-linz", subjectId: "subject-1",
      ownedDocuments: 0, ownedRevisions: 0,
      otherSubjectDocumentsWithParticipant: 0,
      otherSubjectRevisionsWithParticipant: 0,
    })),
    history: vi.fn(async () => ({
      organizationId: "ulc-linz", subjectId: "subject-1",
      attendanceRows: 0, registrationRows: 0,
      registrationHistoryRows: 0,
    })),
    guard: vi.fn(async () => {}),
    eight: vi.fn(async () => ({
      owners: [
        "identity", "permissions", "athletes", "exercise-catalog",
        "training-blocks", "training-documentation", "training-plans",
        "ulc-linz-lifecycle",
      ].map(owner => ({
        owner, remainingReferences: null, markerPresent: null,
        status: "identity-link-unverified",
      })),
      linkedIdentityCount: 0,
      actorAuditReferences: null,
      organizationWidePrivateMediaCandidates: 0,
      humanFreeTextReviewRequired: true,
      auditRetentionDecisionRequired: true,
      providerMediaAbsenceRequired: true,
      allEightOwnersProvenComplete: false,
      olderRestorePromotionAllowed: false,
      privacyReady: false,
    })),
    residual: vi.fn(async () => ({
      sourceIdentityLinks: 0,
      subjectScopedReferenceRows: 0,
      identityScopedReferenceRows: null,
      actorAndAuditReferenceRows: null,
      organizationWideFreeTextCandidates: 2,
      organizationWideAmbiguousUsageCandidates: 1,
      organizationWidePrivateMediaMetadata: 0,
      identityMappingReviewRequired: true,
      freeTextReviewed: false,
      actorAuditReviewed: false,
      mediaProviderAbsenceVerified: false,
      fullPrivacyComplete: false,
    })),
    catalogErase: vi.fn(async () => ({
      markerInserted: true, deletedFavorites: 1, deletedUsageEvents: 1,
      scope: "catalogue-verified-identity-only",
      humanTextReviewed: false, providerMediaAbsenceVerified: false,
      olderRestorePromotionAllowed: false,
    })),
    erase: vi.fn(async () => ({
      organizationId: "ulc-linz", subjectId: "subject-1",
      completedAt,
      scope: "structured-owner-data-only",
      deletedPlans: 0, deletedPlanRevisions: 0, deletedPlanItems: 0,
      usageMarkerInserted: false, deletedAttributedUsageEvents: 0,
      documentationMarkerInserted: false,
      deletedDocuments: 0, deletedDocumentationRevisions: 0,
      redactedOtherSubjectRevisions: 0, trainingHistoryMarkerInserted: false,
      deletedAttendanceRows: 0, deletedRegistrationRows: 0,
      deletedRegistrationHistoryRows: 0,
    })),
  };
});

vi.mock("@appbasis/database", () => ({
  createPostgresDatabase: () => ({
    database: {},
    client: { unsafe: (sql: string) => fake.db(sql), end: fake.close },
  }),
}));
vi.mock("@appbasis/identity/better-auth", () => ({
  createBetterAuthRuntime: () => ({}),
}));
vi.mock("@appbasis/identity/postgres-deletion", () => ({
  PostgresIdentityDeletion: class {},
}));
vi.mock("@appbasis/identity/server", () => ({
  createIdentityRuntime: () => ({
    service: { getCurrentIdentity: fake.current },
  }),
}));
vi.mock("@appbasis/exercise-catalog", () => ({
  PostgresExerciseCatalogRepository: class {},
}));
vi.mock("../worker/t07-catalog-owner-follow-up", () => ({
  PostgresUlcT07CatalogOwnerFollowUp: class {
    erase = fake.catalogErase;
  },
}));
vi.mock("@appbasis/permissions", () => ({
  PostgresPermissionStore: class {},
  PostgresPrincipalAccessAdministration: class {},
  PostgresPrincipalLifecycleAdministration: class {},
}));
vi.mock("@appbasis/athletes", () => ({
  PostgresAthleteMasterdataRepository: class {},
}));
vi.mock("@appbasis/training-plans", () => ({
  PostgresTrainingPlanRepository: class {},
}));
vi.mock("@appbasis/training-blocks", () => ({
  PostgresTrainingBlockRepository: class {
    markPrincipalDeletedAndDeleteFavorites = fake.blockFavoriteDelete;
  },
}));
vi.mock("@appbasis/training-documentation", () => ({
  PostgresTrainingDocumentationRepository: class {
    inspectSubjectPrivacy = (...args: unknown[]) => fake.docs(...(args as []));
  },
}));
vi.mock("../worker/scope-persistence", () => ({
  PostgresUlcLinzScopePersistence: class {},
}));
vi.mock("../worker/training-subject-history-protected-postgres", () => ({
  PostgresUlcTrainingSubjectProtectedHistoryRepository: class {
    assertGuardReady = fake.guard;
  },
}));
vi.mock("../worker/t07-eight-owner-reconciliation", () => ({
  PostgresUlcT07EightOwnerInspector: class {
    inspect = (...args: unknown[]) => fake.eight(...(args as []));
  },
}));
vi.mock("../worker/t07-protected-residual-inspector", () => ({
  PostgresUlcT07ResidualInspector: class {
    inspect = (...args: unknown[]) => fake.residual(...(args as []));
  },
}));
vi.mock("../worker/training-subject-privacy-postgres", () => ({
  PostgresUlcTrainingSubjectPrivacyInspector: class {
    inspectSubjectPrivacy = (...args: unknown[]) => fake.history(...(args as []));
  },
}));
vi.mock("../worker/lifecycle-service", () => ({
  deleteUlcLinzIdentityWithCanonicalFavoriteDeletion: fake.canonicalIdentity,
  inspectUlcLinzAthleteSubjectDeletionFollowUp: (...args: unknown[]) =>
    fake.inspect(...(args as [])),
  deleteUlcLinzAthleteFourOwnerStructuredDependentsAfterRetention: (...args: unknown[]) =>
    fake.erase(...(args as [])),
}));

const options = {
  connectionString: "postgres://privileged-owner@localhost/neondb",
  baseURL: "https://app.ulc-linz.at",
  secret: "s".repeat(32),
  administrativeSessionToken: "verified-session",
  expectedDatabaseName: "neondb",
};
const request = { organizationId: "ulc-linz", subjectId: "subject-1" };

describe("T07 real protected owner composition, no live invocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fake.events.length = 0;
    fake.favoriteMarkerExists = false;
  });

  it("rejects malformed binding and foreign DB before any subject read/write", async () => {
    await expect(createProtectedUlcLinzAthleteErasure({
      ...options, secret: "short",
    })).rejects.toThrow(/options/);
    expect(fake.db).not.toHaveBeenCalled();

    fake.db.mockResolvedValueOnce([{ database_name: "other" }]);
    await expect(createProtectedUlcLinzAthleteErasure(options))
      .rejects.toThrow(/database does not match/);
    expect(fake.inspect).not.toHaveBeenCalled();
    expect(fake.erase).not.toHaveBeenCalled();
    expect(fake.close).toHaveBeenCalledTimes(1);
  });

  it("runs real read-only guard and scoped documentation/app inspection only with valid source", async () => {
    const op = await createProtectedUlcLinzAthleteErasure(options);
    const result = await op.inspect(request);
    expect(result.status).toBe("structured-owner-markers-match");
    expect(result.documentationMarkerPresent).toBe(true);
    expect(result.historyMarkerPresent).toBe(true);
    expect(result.freeTextAndAuditReviewed).toBe(false);
    expect(result.residualReview).toMatchObject({
      sourceIdentityLinks: 0, identityMappingReviewRequired: true,
      fullPrivacyComplete: false,
    });
    expect(fake.residual).toHaveBeenCalledWith("ulc-linz", "subject-1");
    expect(result.eightOwnerReview?.owners).toHaveLength(8);
    expect(result.eightOwnerReview?.allEightOwnersProvenComplete).toBe(false);
    expect(fake.eight).toHaveBeenCalledWith("ulc-linz", "subject-1", fake.completedAt);
    expect(result.allowsOlderRestorePromotion).toBe(false);
    expect(result.allowsFullPrivacyReady).toBe(false);
    expect(fake.current).toHaveBeenCalledWith("verified-session");
    expect(fake.inspect).toHaveBeenCalledOnce();
    expect(fake.guard).toHaveBeenCalledOnce();
    expect(fake.docs).toHaveBeenCalledWith("ulc-linz", "subject-1");
    expect(fake.history).toHaveBeenCalledWith("ulc-linz", "subject-1");
    expect(fake.erase).not.toHaveBeenCalled();
    await op.close();
    expect(fake.close).toHaveBeenCalledOnce();
  });

  it("no source marker never queries downstream subjects", async () => {
    fake.inspect.mockResolvedValueOnce({
      organizationId: "ulc-linz", subjectId: "subject-1",
      status: "source-unverifiable", completedAt: null,
      planMarkerPresent: null, usageMarkerPresent: null,
      remainingPlans: null, remainingAttributedUsageEvents: null,
    } as never);
    const op = await createProtectedUlcLinzAthleteErasure(options);
    const result = await op.inspect(request);
    expect(result.status).toBe("source-unverifiable");
    expect(result.documentationOwned).toBeNull();
    expect(fake.guard).not.toHaveBeenCalled();
    expect(fake.docs).not.toHaveBeenCalled();
    expect(fake.history).not.toHaveBeenCalled();
    expect(fake.residual).not.toHaveBeenCalled();
    expect(fake.eight).not.toHaveBeenCalled();
    await op.close();
  });

  it("never calls any owner write with absent/invalid approval or wrong source timestamp", async () => {
    const op = await createProtectedUlcLinzAthleteErasure(options);
    for (const approval of [
      { confirmation: "", expectedSourceCompletedAt: fake.completedAt.toISOString() },
      { confirmation: "ERASE-ULC-T07-FOUR-STRUCTURED-OWNERS",
        expectedSourceCompletedAt: "2026-11-22T12:00:00.000Z" },
      { confirmation: "ERASE-ULC-T07-FOUR-STRUCTURED-OWNERS",
        expectedSourceCompletedAt: "invalid" },
    ]) {
      await expect(op.eraseStructuredOnly(request, approval)).rejects.toThrow();
    }
    expect(fake.erase).not.toHaveBeenCalled();
    await op.close();
  });

  it("performs real four-owner coordinator only on exact operator approval and verifies after write", async () => {
    const op = await createProtectedUlcLinzAthleteErasure(options);
    const result = await op.eraseStructuredOnly(request, {
      confirmation: "ERASE-ULC-T07-FOUR-STRUCTURED-OWNERS",
      expectedSourceCompletedAt: fake.completedAt.toISOString(),
    });
    expect(result.status).toBe("four-structured-owners-complete-only");
    expect(result.result.scope).toBe("structured-owner-data-only");
    expect(result.allowsFullPrivacyReady).toBe(false);
    expect(result.freeTextAndAuditReviewed).toBe(false);
    expect(result.allowsOlderRestorePromotion).toBe(false);
    expect(fake.erase).toHaveBeenCalledOnce();
    expect(fake.inspect).toHaveBeenCalledTimes(2);
    expect(fake.guard).toHaveBeenCalledTimes(2);
    expect(fake.residual).toHaveBeenCalledTimes(2);
    expect(fake.eight).toHaveBeenCalledTimes(2);
    await op.close();
  });

  it("requires separate catalog approval, complete four-owner source and unique deleted identity", async () => {
    const op = await createProtectedUlcLinzAthleteErasure(options);
    const authorize = {
      confirmation: "ERASE-ULC-T07-VERIFIED-CATALOG-OWNER",
      expectedSourceCompletedAt: fake.completedAt.toISOString(),
    };
    await expect(op.eraseCatalogOwnerOnly(request, {
      ...authorize, confirmation: "ERASE-ULC-T07-FOUR-STRUCTURED-OWNERS",
    })).rejects.toThrow(/explicit exact approval/);
    await expect(op.eraseCatalogOwnerOnly(request, authorize))
      .rejects.toThrow(/deleted identity\/permissions/);
    expect(fake.catalogErase).not.toHaveBeenCalled();

    const eligible = {
      ...await fake.eight(),
      linkedIdentityCount: 1,
      owners: [
        "identity","permissions","athletes","exercise-catalog","training-blocks",
        "training-documentation","training-plans","ulc-linz-lifecycle",
      ].map(owner=>({
        owner,
        remainingReferences: 0, markerPresent: owner === "exercise-catalog" ? true : null,
        status: "scoped-evidence-clear-manual-review-required",
      })),
    };
    fake.eight.mockResolvedValueOnce(eligible as never);
    fake.eight.mockResolvedValueOnce(eligible as never);
    // A lawful permissions-audit retention review must not block the
    // already authorized STRUCTURED catalog erasure. Full privacy remains false.
    eligible.owners.find((x: {owner: string}) => x.owner === "permissions")!.status =
      "actor-audit-review-required";
    fake.eight.mockReset();
    fake.eight.mockResolvedValueOnce(eligible as never);
    fake.eight.mockResolvedValueOnce(eligible as never);
    const done = await op.eraseCatalogOwnerOnly(request, authorize);
    expect(done.verified.eightOwnerReview?.owners.find(x=>x.owner==="permissions")?.status)
      .toBe("actor-audit-review-required");
    expect(done.status).toBe("catalog-owner-complete-only");
    expect(done.allowsFullPrivacyReady).toBe(false);
    expect(done.freeTextAndAuditReviewed).toBe(false);
    expect(done.allowsOlderRestorePromotion).toBe(false);
    expect(fake.catalogErase).toHaveBeenCalledWith("ulc-linz", "subject-1", "admin-1");
    expect(fake.erase).not.toHaveBeenCalled();
    await op.close();
  });

  it("executes separately approved canonical identity/permissions plus marked block favorites", async () => {
    const op = await createProtectedUlcLinzAthleteErasure(options);
    const approval = {
      confirmation: "ERASE-ULC-T07-VERIFIED-IDENTITY-OWNER",
      expectedSourceCompletedAt: fake.completedAt.toISOString(),
    };
    await expect(op.eraseIdentityOwnerOnly(request, {
      ...approval, confirmation: "ERASE-ULC-T07-FOUR-STRUCTURED-OWNERS",
    })).rejects.toThrow(/exact authorization/);
    expect(fake.canonicalIdentity).not.toHaveBeenCalled();

    const validOwners = {
      ...await fake.eight(),
      linkedIdentityCount: 1,
      owners: ["identity","permissions","athletes","exercise-catalog",
        "training-blocks","training-documentation","training-plans",
        "ulc-linz-lifecycle"].map(owner=>({
          owner, status: "scoped-evidence-clear-manual-review-required",
          remainingReferences: 0, markerPresent: null,
        })),
    };
    // BEFORE deletion may still have a live identity and no durable link.
    // AFTER deletion must read the newly persisted canonical link and zero
    // physical Identity/Permissions/Block-Favorite references.
    const beforeOwners = await fake.eight();
    fake.eight.mockResolvedValueOnce(beforeOwners as never);
    fake.eight.mockResolvedValueOnce(validOwners as never);
    const done = await op.eraseIdentityOwnerOnly(request, approval);
    expect(done.status).toBe("identity-block-favorites-owner-complete-only");
    expect(done.identityDeleted).toBe(true);
    expect(done.blockFavoriteMarkerVerified).toBe(true);
    expect(done.deletedBlockFavorites).toBe(2);
    expect(done.allowsFullPrivacyReady).toBe(false);
    expect(done.freeTextAndAuditReviewed).toBe(false);
    expect(done.allowsOlderRestorePromotion).toBe(false);
    expect(fake.canonicalIdentity).toHaveBeenCalledOnce();
    expect(fake.blockFavoriteDelete).toHaveBeenCalledWith(
      "ulc-linz", "member-1", fake.completedAt,
    );
    expect(fake.catalogErase).not.toHaveBeenCalled();
    await op.close();
  });

  it("never starts identity owner write on missing source, stale approval or absent identity link", async () => {
    const op = await createProtectedUlcLinzAthleteErasure(options);
    const approve = {
      confirmation: "ERASE-ULC-T07-VERIFIED-IDENTITY-OWNER",
      expectedSourceCompletedAt: fake.completedAt.toISOString(),
    };
    await expect(op.eraseIdentityOwnerOnly(request, {
      ...approve, expectedSourceCompletedAt: "2026-11-19T12:00:00.000Z",
    })).rejects.toThrow(/all four structured/);
    const previous = fake.db.getMockImplementation()!;
    fake.db.mockImplementation(async (query: string) => {
      if (query.includes("ulc_linz_lifecycle_deletion") &&
          query.includes("'live' AS record_source")) return [];
      return previous(query);
    });
    await expect(op.eraseIdentityOwnerOnly(request, approve))
      .rejects.toThrow(/one authoritative/);
    expect(fake.canonicalIdentity).not.toHaveBeenCalled();
    fake.db.mockImplementation(previous);
    await op.close();
  });

  it("never claims successful four-owner completion without physical doc/history owner markers", async () => {
    const op = await createProtectedUlcLinzAthleteErasure(options);
    // SQL marker union on BEFORE inspection reports both markers present,
    // but on postcheck only documentation. No false success.
    const original = fake.db.getMockImplementation()!;
    let markerQueries = 0;
    fake.db.mockImplementation(async (sql: string) => {
      if (sql.includes("appbasis_training_documentation_subject_deletion")) {
        markerQueries++;
        if (markerQueries === 2) return [{
          owner: "documentation",
          completed_at: fake.completedAt,
          purge_after: new Date(fake.completedAt.getTime() + 35 * 24 * 60 * 60 * 1000),
        }];
      }
      return original(sql);
    });
    await expect(op.eraseStructuredOnly(request, {
      confirmation: "ERASE-ULC-T07-FOUR-STRUCTURED-OWNERS",
      expectedSourceCompletedAt: fake.completedAt.toISOString(),
    })).rejects.toThrow(/remains incomplete/);
    expect(fake.erase).toHaveBeenCalledOnce();
    await op.close();
    fake.db.mockImplementation(original);
  });

  it("denies conflicting owner marker, failed SQL guard and partial later-owner failure", async () => {
    fake.inspect.mockResolvedValueOnce({
      organizationId: "ulc-linz", subjectId: "subject-1",
      status: "owner-marker-conflict", completedAt: fake.completedAt,
      planMarkerPresent: true, usageMarkerPresent: true,
      remainingPlans: 1, remainingAttributedUsageEvents: 0,
    } as never);
    const approval = {
      confirmation: "ERASE-ULC-T07-FOUR-STRUCTURED-OWNERS",
      expectedSourceCompletedAt: fake.completedAt.toISOString(),
    };
    const op = await createProtectedUlcLinzAthleteErasure(options);
    await expect(op.eraseStructuredOnly(request, approval)).rejects.toThrow(/source decision/);
    expect(fake.erase).not.toHaveBeenCalled();

    fake.guard.mockRejectedValueOnce(new Error("v19 fence disabled"));
    await expect(op.eraseStructuredOnly(request, approval)).rejects.toThrow(/v19 fence/);
    expect(fake.erase).not.toHaveBeenCalled();

    fake.erase.mockRejectedValueOnce(new Error("documentation owner transaction failed"));
    await expect(op.eraseStructuredOnly(request, approval)).rejects.toThrow(/documentation owner/);
    expect(fake.erase).toHaveBeenCalledTimes(1);
    // Operation cannot be reported as a global erasure success after a failure.
    await op.close();
  });
});
