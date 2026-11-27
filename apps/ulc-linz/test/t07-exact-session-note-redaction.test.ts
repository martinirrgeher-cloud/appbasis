import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { PostgresUlcT07ExactSessionNoteRedactor } from
  "../worker/t07-exact-session-note-redaction";

const org = "ulc-linz";
const session = "session-27";
const date = "2026-11-15";
const note = "Only this exact shared-session note requires redaction";
const digest = createHash("sha256").update(note, "utf8").digest("hex");
const decision = {
  organizationId: org,
  sessionId: session,
  expectedSessionDate: date,
  expectedNoteSha256: digest,
};

function fixture(
  overrides: { storedDate?: string; storedHash?: string | null;
    updatedRows?: number; verified?: boolean } = {},
) {
  const statements: { sql: string; args: unknown[] }[] = [];
  const unsafe = vi.fn(async (sql: string, args: unknown[] = []) => {
    statements.push({ sql, args });
    if (sql.startsWith("SET TRANSACTION")) return [];
    if (sql.includes("FOR UPDATE")) {
      return [{ session_date: overrides.storedDate ?? date,
        note_sha256: overrides.storedHash === undefined ? digest : overrides.storedHash }];
    }
    if (sql.startsWith("UPDATE")) {
      return overrides.updatedRows === 0 ? [] : [{ id: session }];
    }
    if (sql.includes(" AS redacted")) {
      return [{ redacted: overrides.verified ?? true }];
    }
    throw new Error("Unexpected T07 SQL statement.");
  });
  const begin = vi.fn(async <T>(callback: (tx: { unsafe: typeof unsafe }) => Promise<T>) =>
    callback({ unsafe }));
  return { begin, unsafe, statements, port: { begin } };
}

describe("T07 protected manual redaction of a single shared session note", () => {
  it("changes one exact organization/session/date/hash and reads back inside one transaction", async () => {
    const db = fixture();
    const result = await new PostgresUlcT07ExactSessionNoteRedactor(db.port)
      .redact(decision);
    expect(result).toEqual({
      status: "one-shared-session-note-redacted-only", redacted: true,
      fullPrivacyComplete: false, olderRestorePromotionAllowed: false,
    });
    expect(db.begin).toHaveBeenCalledTimes(1);
    expect(db.statements.map(x => x.sql.match(/^\w+/)?.[0])).toEqual([
      "SET", "SELECT", "UPDATE", "SELECT",
    ]);
    const lock = db.statements[1]!;
    const write = db.statements[2]!;
    expect(lock.sql).toContain("FOR UPDATE");
    expect(lock.sql).toContain("organization_id = $1 AND id = $2");
    expect(write.sql).toContain("SET note = NULL");
    expect(write.sql).toContain("session_date = $3::date");
    expect(write.sql).toContain("sha256(convert_to(note, 'UTF8'))");
    expect(write.args).toEqual([org, session, date, digest]);
    expect(JSON.stringify(result)).not.toContain(session);
    expect(JSON.stringify(result)).not.toContain(digest);
    expect(db.statements.some(x => x.sql.includes("DELETE FROM"))).toBe(false);
  });

  it("rejects missing or invalid explicit scope before the first SQL statement", async () => {
    const invalid = [
      null, {}, { ...decision, organizationId: "" },
      { ...decision, organizationId: "other organization" },
      { ...decision, sessionId: "session\0bad" },
      { ...decision, expectedSessionDate: "yesterday" },
      { ...decision, expectedSessionDate: "not-a-date" },
      { ...decision, expectedNoteSha256: "" },
      { ...decision, expectedNoteSha256: digest.toUpperCase() },
      { ...decision, expectedNoteSha256: "f".repeat(63) },
    ];
    const db = fixture();
    const service = new PostgresUlcT07ExactSessionNoteRedactor(db.port);
    for (const input of invalid) {
      await expect(service.redact(input as typeof decision)).rejects.toThrow();
    }
    expect(db.begin).not.toHaveBeenCalled();
  });

  it("rejects stale note, empty note and wrong session day without updating", async () => {
    for (const overrides of [
      { storedHash: "a".repeat(64) },
      { storedHash: null },
      { storedDate: "2026-11-16" },
    ]) {
      const db = fixture(overrides);
      await expect(new PostgresUlcT07ExactSessionNoteRedactor(db.port)
        .redact(decision)).rejects.toThrow(/changed or has no exact approved match/);
      expect(db.statements.some(x => x.sql.startsWith("UPDATE"))).toBe(false);
    }
  });

  it("requires exactly one affected row and a true post-write readback", async () => {
    for (const overrides of [{ updatedRows: 0 }, { verified: false }]) {
      const db = fixture(overrides);
      await expect(new PostgresUlcT07ExactSessionNoteRedactor(db.port)
        .redact(decision)).rejects.toThrow(/could not be redacted|readback failed/);
      expect(db.begin).toHaveBeenCalledTimes(1);
    }
  });
});
