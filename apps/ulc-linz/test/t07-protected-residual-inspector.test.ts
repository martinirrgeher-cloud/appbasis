import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PostgresUlcT07ResidualInspector,
  ULC_T07_RESIDUAL_INVENTORY_SQL,
} from "../worker/t07-protected-residual-inspector";

const good = {
  identity_links: 1,
  subject_rows: 0,
  identity_rows: 2,
  actor_audit_rows: 5,
  free_text_candidates: 11,
  ambiguous_usage_candidates: 3,
  private_media_metadata: 0,
};
const sql = vi.fn(async () => [good]);
describe("T07 count-only residual review never implies complete privacy", () => {
  beforeEach(() => vi.clearAllMocks());

  it("also inventories nonempty nested session and documentation JSON as REVIEW candidates", () => {
    expect(ULC_T07_RESIDUAL_INVENTORY_SQL).toContain("AS free_text_candidates");
    for (const name of ["training_content_items", "items_json", "attendance_json"]) {
      expect(ULC_T07_RESIDUAL_INVENTORY_SQL).toContain(
        `${name} <> '[]'::jsonb`,
      );
      expect(ULC_T07_RESIDUAL_INVENTORY_SQL).toContain(
        `${name} <> '{}'::jsonb`,
      );
    }
    expect(ULC_T07_RESIDUAL_INVENTORY_SQL).toContain("organization_id=$1");
  });

  it("uses bound organization+subject SQL and returns only counts and explicit open reviews", async () => {
    const inspector = new PostgresUlcT07ResidualInspector({ unsafe: sql });
    const result = await inspector.inspect("ulc-linz", "athlete-1");
    expect(sql).toHaveBeenCalledWith(
      ULC_T07_RESIDUAL_INVENTORY_SQL,
      ["ulc-linz", "athlete-1"],
    );
    expect(result).toMatchObject({
      sourceIdentityLinks: 1,
      subjectScopedReferenceRows: 0,
      identityScopedReferenceRows: 2,
      actorAndAuditReferenceRows: 5,
      organizationWideFreeTextCandidates: 11,
      organizationWideAmbiguousUsageCandidates: 3,
      organizationWidePrivateMediaMetadata: 0,
      identityMappingReviewRequired: false,
      freeTextReviewed: false,
      actorAuditReviewed: false,
      mediaProviderAbsenceVerified: false,
      fullPrivacyComplete: false,
    });
    expect(JSON.stringify(result)).not.toContain("athlete-1");
  });

  it("never interprets no identity marker as proof of no actor/favorite rows", async () => {
    sql.mockResolvedValueOnce([{ ...good, identity_links: 0, identity_rows: 0, actor_audit_rows: 0 }]);
    const r = await new PostgresUlcT07ResidualInspector({ unsafe: sql })
      .inspect("ulc-linz", "athlete-1");
    expect(r.identityMappingReviewRequired).toBe(true);
    expect(r.identityScopedReferenceRows).toBeNull();
    expect(r.actorAndAuditReferenceRows).toBeNull();
    expect(r.fullPrivacyComplete).toBe(false);
  });

  it("fails closed on impossible counts, unexpected row count and unsafe identifiers", async () => {
    const inspector = new PostgresUlcT07ResidualInspector({ unsafe: sql });
    await expect(inspector.inspect(" bad", "athlete-1")).rejects.toThrow(/scope/);
    await expect(inspector.inspect("ulc-linz", "\0")).rejects.toThrow(/scope/);
    expect(sql).not.toHaveBeenCalled();
    for (const invalid of [null, -1, Number.NaN, 3.5, Number.MAX_SAFE_INTEGER + 1, "0"]) {
      sql.mockResolvedValueOnce([{ ...good, actor_audit_rows: invalid as number }]);
      await expect(inspector.inspect("ulc-linz", "athlete-1")).rejects.toThrow(/count/);
    }
    sql.mockResolvedValueOnce([{ ...good, free_text_candidates: -1 }]);
    await expect(inspector.inspect("ulc-linz", "athlete-1")).rejects.toThrow(/count/);
    sql.mockResolvedValueOnce([]);
    await expect(inspector.inspect("ulc-linz", "athlete-1")).rejects.toThrow(/invalid result/);
  });
});
