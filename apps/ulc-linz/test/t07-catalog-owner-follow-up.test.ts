import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PostgresUlcT07CatalogOwnerFollowUp,
} from "../worker/t07-catalog-owner-follow-up";

const completed = new Date("2026-11-23T08:00:00.000Z");
const expiry = new Date(completed.getTime() + 35 * 24 * 60 * 60 * 1000);
const now = new Date("2026-11-24T08:00:00.000Z");
const identityLink = {
  identity_id: "deleted-athlete-identity",
  completed_at: completed,
  purge_after: expiry,
};
const sql = vi.fn(async (query: string) =>
  query.includes("ulc_linz_lifecycle_deletion")
    ? [identityLink]
    : []);
const mark = vi.fn(async () => ({
  markerInserted: true, deletedFavorites: 2, deletedUsageEvents: 3,
}));
function executor() {
  return new PostgresUlcT07CatalogOwnerFollowUp(
    { unsafe: sql }, { markPrincipalDeletedAndDeletePersonalCatalogData: mark },
    () => now,
  );
}

describe("T07 protected fifth catalogue owner", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses only canonical deleted identity, never athlete subject key or historical note attribution", async () => {
    const result = await executor().erase("ulc-linz", "athlete-subject", "ulc.admin");
    expect(mark).toHaveBeenCalledWith("ulc-linz", identityLink.identity_id, completed);
    expect(result).toEqual({
      markerInserted: true, deletedFavorites: 2, deletedUsageEvents: 3,
      scope: "catalogue-verified-identity-only",
      humanTextReviewed: false, providerMediaAbsenceVerified: false,
      olderRestorePromotionAllowed: false,
    });
    expect(JSON.stringify(result)).not.toContain(identityLink.identity_id);
    expect(JSON.stringify(result)).not.toContain("athlete-subject");
  });

  it("has no fallback when identity link is absent, duplicated, expired or self-owned", async () => {
    for (const links of [
      [], [identityLink, { ...identityLink, identity_id: "other" }],
      [{ ...identityLink, purge_after: new Date("2026-11-23T20:00:00Z") }],
    ]) {
      sql.mockResolvedValueOnce(links);
      await expect(executor().erase("ulc-linz", "athlete-subject", "ulc.admin"))
        .rejects.toThrow();
    }
    await expect(executor().erase(
      "ulc-linz", "athlete-subject", identityLink.identity_id,
    )).rejects.toThrow(/authority/);
    expect(mark).not.toHaveBeenCalled();
  });

  it("denies a pre-existing unrelated catalog deletion marker before any write", async () => {
    sql.mockResolvedValueOnce([identityLink]);
    sql.mockResolvedValueOnce([{
      completed_at: new Date("2026-11-21T08:00:00.000Z"),
      purge_after: new Date("2026-12-26T08:00:00.000Z"),
    }]);
    await expect(executor().erase("ulc-linz", "athlete-subject", "ulc.admin"))
      .rejects.toThrow(/conflicts/);
    expect(mark).not.toHaveBeenCalled();
  });

  it("supports exact same-marker retry, but never upgrades full privacy/restore", async () => {
    const marker = { completed_at: completed, purge_after: expiry };
    sql.mockResolvedValueOnce([identityLink]);
    sql.mockResolvedValueOnce([marker]);
    mark.mockResolvedValueOnce({
      markerInserted: false, deletedFavorites: 0, deletedUsageEvents: 0,
    });
    const result = await executor().erase("ulc-linz", "athlete-subject", "ulc.admin");
    expect(result.markerInserted).toBe(false);
    expect(result.providerMediaAbsenceVerified).toBe(false);
    expect(result.olderRestorePromotionAllowed).toBe(false);
  });

  it("propagates protected owner transaction failure and rejects malformed outcomes", async () => {
    mark.mockRejectedValueOnce(new Error("CATALOG_OWNER_TRANSACTION_FAILURE"));
    await expect(executor().erase("ulc-linz", "athlete-subject", "ulc.admin"))
      .rejects.toThrow(/CATALOG_OWNER/);
    mark.mockResolvedValueOnce({
      markerInserted: true, deletedFavorites: -1, deletedUsageEvents: 0,
    });
    await expect(executor().erase("ulc-linz", "athlete-subject", "ulc.admin"))
      .rejects.toThrow(/result invalid/);
  });
});
