import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PostgresUlcT07EightOwnerInspector,
  ULC_T07_EIGHT_OWNER_SQL,
} from "../worker/t07-eight-owner-reconciliation";

const sample = {
  linked_identities: 1,
  identity_remaining: 0, permissions_remaining: 0, athletes_remaining: 0,
  catalog_remaining: 0, catalog_markers: 1,
  blocks_remaining: 0, block_markers: 1,
  documents_remaining: 0, document_markers: 1,
  plans_remaining: 0, plan_markers: 1,
  ulc_remaining: 0, ulc_markers: 1,
  actor_audit_remaining: 2, org_media_candidates: 1,
};
const source = new Date("2026-11-24T11:12:13.000Z");
const sql = vi.fn(async () => [sample]);

describe("T07 real eight-owner read-only reconciliation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("counts permission-administration actor and principal-target audits by verified identity only", () => {
    expect(ULC_T07_EIGHT_OWNER_SQL).toContain("FROM appbasis_permission_administration_audit");
    expect(ULC_T07_EIGHT_OWNER_SQL).toContain(
      "actor_principal_id IN (SELECT identity_id FROM linked_identity)",
    );
    expect(ULC_T07_EIGHT_OWNER_SQL).toContain(
      "target_type='principal' AND target_id IN (SELECT identity_id FROM linked_identity)",
    );
    expect(ULC_T07_EIGHT_OWNER_SQL).toContain("AS actor_audit_remaining");
  });

  it("requires exactly eight owner statuses from ONE bound SQL read and never asserts complete privacy", async () => {
    const report = await new PostgresUlcT07EightOwnerInspector({ unsafe: sql })
      .inspect("ulc-linz", "athlete-1", source);
    expect(sql).toHaveBeenCalledWith(ULC_T07_EIGHT_OWNER_SQL, [
      "ulc-linz", "athlete-1", "2026-11-24T11:12:13.000Z",
    ]);
    expect(report.owners.map(x => x.owner)).toEqual([
      "identity", "permissions", "athletes", "exercise-catalog",
      "training-blocks", "training-documentation", "training-plans",
      "ulc-linz-lifecycle",
    ]);
    expect(report.owners.every(x =>
      x.status === "scoped-evidence-clear-manual-review-required")).toBe(true);
    expect(report.actorAuditReferences).toBe(2);
    expect(report.organizationWidePrivateMediaCandidates).toBe(1);
    expect(report.humanFreeTextReviewRequired).toBe(true);
    expect(report.auditRetentionDecisionRequired).toBe(true);
    expect(report.providerMediaAbsenceRequired).toBe(true);
    expect(report.allEightOwnersProvenComplete).toBe(false);
    expect(report.olderRestorePromotionAllowed).toBe(false);
    expect(report.privacyReady).toBe(false);
    expect(JSON.stringify(report)).not.toContain("athlete-1");
  });

  it("no unique identity deletion link is UNKNOWN, not proof of no actor, catalog or permissions", async () => {
    sql.mockResolvedValueOnce([{ ...sample, linked_identities: 0,
      identity_remaining: 0, permissions_remaining: 0, catalog_remaining: 0,
      catalog_markers: 0, actor_audit_remaining: 0 }]);
    const result = await new PostgresUlcT07EightOwnerInspector({ unsafe: sql })
      .inspect("ulc-linz", "athlete-1", source);
    for (const owner of [
      "identity", "permissions", "exercise-catalog", "training-blocks",
      "ulc-linz-lifecycle",
    ]) {
      const item = result.owners.find(o => o.owner === owner);
      expect(item?.status).toBe("identity-link-unverified");
      expect(item?.remainingReferences).toBeNull();
      expect(item?.markerPresent).toBeNull();
    }
    expect(result.actorAuditReferences).toBeNull();
    expect(result.allEightOwnersProvenComplete).toBe(false);
  });

  it("reports individually missing owner markers and surviving person-linked rows", async () => {
    sql.mockResolvedValueOnce([{
      ...sample, plans_remaining: 3, plan_markers: 0,
      block_markers: 1, documents_remaining: 2, document_markers: 1,
      ulc_remaining: 1,
    }]);
    const result = await new PostgresUlcT07EightOwnerInspector({ unsafe: sql })
      .inspect("ulc-linz", "athlete-1", source);
    expect(result.owners.find(x=>x.owner==="training-plans")).toMatchObject({
      markerPresent: false, remainingReferences: 3,
      status: "owner-marker-missing",
    });
    expect(result.owners.find(x=>x.owner==="training-documentation")).toMatchObject({
      markerPresent: true, remainingReferences: 2,
      status: "explicit-references-remain",
    });
    expect(result.owners.find(x=>x.owner==="ulc-linz-lifecycle")).toMatchObject({
      markerPresent: true, remainingReferences: 1,
      status: "explicit-references-remain",
    });
  });

  it("fails closed on multiple account mappings, malformed counts, foreign/invalid authority", async () => {
    const repo = new PostgresUlcT07EightOwnerInspector({ unsafe: sql });
    await expect(repo.inspect(" ulc", "athlete", source)).rejects.toThrow(/authority/);
    await expect(repo.inspect("ulc", "athlete", new Date("bad"))).rejects.toThrow(/authority/);
    expect(sql).not.toHaveBeenCalled();
    sql.mockResolvedValueOnce([{ ...sample, linked_identities: 2 }]);
    await expect(repo.inspect("ulc", "athlete", source)).rejects.toThrow(/multiple identity/);
    for (const invalid of [null, "1", -1, 0.5, NaN, Number.MAX_SAFE_INTEGER + 1]) {
      sql.mockResolvedValueOnce([{ ...sample, catalog_markers: invalid as number }]);
      await expect(repo.inspect("ulc", "athlete", source)).rejects.toThrow(/count/);
    }
    sql.mockResolvedValueOnce([]);
    await expect(repo.inspect("ulc", "athlete", source)).rejects.toThrow(/one verified row/);
  });
});
