import { describe, expect, it, vi } from "vitest";
import {
  PostgresUlcT07ExactOwnerTextRedactor,
  ULC_T07_EXACT_TEXT_TARGET_NAMES,
  type UlcT07ExactTextTarget,
} from "../worker/t07-exact-owner-text-redaction";
import type {
  UlcT07NoteRedactionSqlPort, UlcT07NoteRedactionSqlTransaction,
} from "../worker/t07-exact-session-note-redaction";

const digest = "a".repeat(64);
const base = {
  organizationId: "ulc-linz",
  subjectId: "athlete-1",
  expectedSourceCompletedAt: "2026-11-27T10:00:00.000Z",
  target: "training-plan-item-comment" as UlcT07ExactTextTarget,
  keys: ["plan-1", "2", "item-1"],
  expectedValueSha256: digest,
};

function fixture(fail?: "source" | "hash" | "row" | "readback") {
  const commands: { query: string; params: readonly (string | number | boolean | null)[] }[] = [];
  const unsafe = vi.fn(async (query: string, params: readonly (string | number | boolean | null)[] = []) => {
    commands.push({ query, params });
    if (query.startsWith("SET TRANSACTION")) return [];
    if (query.includes("FROM ulc_linz_lifecycle_deletion")) {
      return fail === "source" ? [] : [{ completed_at: base.expectedSourceCompletedAt }];
    }
    if (query.startsWith("SELECT") && query.includes(" AS value_hash")) {
      return [{ value_hash: fail === "hash" ? "b".repeat(64) : digest }];
    }
    if (query.startsWith("UPDATE")) return fail === "row" ? [] : [{ affected: 1 }];
    if (query.includes(" AS redacted")) return [{ redacted: fail !== "readback" }];
    throw new Error("Unexpected SQL in isolated test.");
  });
  const opened = vi.fn();
  const port: UlcT07NoteRedactionSqlPort = {
    async begin<T>(cb: (tx: UlcT07NoteRedactionSqlTransaction) => Promise<T>): Promise<T> {
      opened();
      return cb({ unsafe });
    },
  };
  return { port, opened, commands };
}

describe("T07 exact historic free text redaction, all 12 allowlisted targets", () => {
  it("does not accept dynamic tables, columns, arbitrary revisions or forged source", async () => {
    const f = fixture();
    const service = new PostgresUlcT07ExactOwnerTextRedactor(f.port);
    const invalid: unknown[] = [
      { ...base, target: "arbitrary_table" },
      { ...base, organizationId: "other org" },
      { ...base, expectedSourceCompletedAt: "2026-11-28" },
      { ...base, expectedValueSha256: "A".repeat(64) },
      { ...base, keys: ["plan-1", "0", "item-1"] },
      { ...base, keys: ["plan-1", "2", "item id with spaces"] },
      { ...base, keys: ["plan-1", "2"] },
      { ...base, keys: ["plan-1", "2", "item-1", "too-many"] },
      { ...base, subjectId: "" },
      null,
    ];
    for (const attempt of invalid) {
      await expect(service.redact(attempt as typeof base)).rejects.toThrow();
    }
    expect(f.opened).not.toHaveBeenCalled();
    expect(f.commands).toHaveLength(0);
  });

  it("enforces a current, exact canonical athlete marker in the WRITE transaction", async () => {
    const f = fixture("source");
    await expect(new PostgresUlcT07ExactOwnerTextRedactor(f.port).redact(base))
      .rejects.toThrow(/expired, missing or conflicting/);
    expect(f.commands.map(x => x.query)).toHaveLength(2);
    expect(f.commands[1]?.query).toContain("purge_after>now()");
    expect(f.commands[1]?.query).toContain("FOR SHARE");
  });

  it("stops before UPDATE when the text changed, and stops on failed readback", async () => {
    for (const failure of ["hash", "row", "readback"] as const) {
      const f = fixture(failure);
      await expect(new PostgresUlcT07ExactOwnerTextRedactor(f.port).redact(base))
        .rejects.toThrow();
      if (failure === "hash") {
        expect(f.commands.some(x => x.query.startsWith("UPDATE"))).toBe(false);
      }
    }
  });

  it("keeps all 12 static owner/column pairs and never exposes scope or hash", async () => {
    const shapes: Record<UlcT07ExactTextTarget, readonly string[]> = {
      "registration-note": ["session-1", "other-athlete"],
      "registration-change-note": ["history-1"],
      "documentation-revision-note": ["document-1", "1"],
      "training-plan-revision-note": ["plan-1", "2"],
      "training-plan-item-note": ["plan-1", "2", "item-1"],
      "training-plan-item-comment": ["plan-1", "2", "item-1"],
      "training-block-revision-note": ["block-1", "2"],
      "training-block-item-note": ["block-1", "2", "item-1"],
      "training-block-usage-note": ["usage-1"],
      "training-block-usage-source-ref": ["usage-1"],
      "exercise-catalog-usage-note": ["catalog-1"],
      "exercise-catalog-usage-source-ref": ["catalog-1"],
    };
    expect(ULC_T07_EXACT_TEXT_TARGET_NAMES).toHaveLength(12);
    expect(Object.keys(shapes).sort()).toEqual([...ULC_T07_EXACT_TEXT_TARGET_NAMES].sort());
    for (const target of ULC_T07_EXACT_TEXT_TARGET_NAMES) {
      const f = fixture();
      const result = await new PostgresUlcT07ExactOwnerTextRedactor(f.port)
        .redact({ ...base, target, keys: shapes[target] });
      expect(result).toEqual({
        status: "one-exact-owner-text-cell-redacted-only",
        redacted: true, fullPrivacyComplete: false,
        freeTextAndAuditReviewed: false, olderRestorePromotionAllowed: false,
      });
      const update = f.commands.find(x => x.query.startsWith("UPDATE"));
      expect(update?.query).toContain("SET ");
      expect(update?.query).toContain(" = NULL");
      expect(update?.query).toContain("AND organization_id = $1".replace("AND ", ""));
      expect(update?.params.slice(0, -1)).toEqual([base.organizationId, ...shapes[target]]);
      expect(update?.params.at(-1)).toBe(digest);
      expect(JSON.stringify(result)).not.toContain(base.subjectId);
      expect(JSON.stringify(result)).not.toContain(digest);
      expect(f.commands.map(x => x.query.match(/^\w+/)?.[0])).toEqual([
        "SET", "SELECT", "SELECT", "UPDATE", "SELECT",
      ]);
    }
  });
});
