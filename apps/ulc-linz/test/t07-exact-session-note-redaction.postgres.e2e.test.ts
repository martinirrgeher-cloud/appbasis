import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresDatabase } from "@appbasis/database/postgres-provisioning";
import {
  PostgresUlcT07ExactSessionNoteRedactor,
  type UlcT07NoteRedactionSqlPort,
} from "../worker/t07-exact-session-note-redaction";

const databaseUrl = process.env.DATABASE_URL;
const exactNote = "Private training note about member A";
const fingerprint = createHash("sha256").update(exactNote, "utf8").digest("hex");
const approval = {
  organizationId: "ulc-linz", sessionId: "training-redact-1",
  expectedSessionDate: "2026-11-15", expectedNoteSha256: fingerprint,
};

if (!databaseUrl) {
  describe.skip("T07 exact note redaction PostgreSQL E2E", () => {
    it("requires a disposable DATABASE_URL", () => {});
  });
} else {
  describe("T07 exact note redaction PostgreSQL E2E", () => {
    const admin = createPostgresDatabase(databaseUrl);
    const dbName = "appbasis_t07_note_" + randomUUID().replaceAll("-", "").slice(0, 12);
    const url = new URL(databaseUrl);
    url.pathname = "/" + dbName;
    let db: ReturnType<typeof createPostgresDatabase> | null = null;
    let created = false;

    function required() {
      if (!db) throw new Error("T07 disposable PostgreSQL database unavailable.");
      return db;
    }
    const port = {
      begin(callback) {
        return required().client.begin(async (transaction) => callback({
          unsafe(query, parameters) { return transaction.unsafe(query, parameters); },
        }));
      },
    } satisfies UlcT07NoteRedactionSqlPort;

    beforeAll(async () => {
      await admin.client.unsafe("CREATE DATABASE " + dbName);
      created = true;
      db = createPostgresDatabase(url.toString());
      const ddl = await readFile(
        new URL("../migrations/0004_ulc_linz_training_sessions.sql", import.meta.url), "utf8",
      );
      await required().client.unsafe(ddl);
      await required().client.unsafe(
        `INSERT INTO ulc_linz_training_session
          (id,organization_id,module_id,group_id,session_date,note)
         VALUES
          ('training-redact-1','ulc-linz','u12','u12','2026-11-15',$1),
          ('training-keep-2','ulc-linz','u12','u12','2026-11-16','Another member note'),
          ('training-foreign-3','other-club','u12','u12','2026-11-15',$1)`,
        [exactNote],
      );
    });

    afterAll(async () => {
      if (db) await db.client.end();
      if (created) await admin.client.unsafe("DROP DATABASE " + dbName + " WITH (FORCE)");
      await admin.client.end();
    });

    it("redacts exactly one real PostgreSQL note without destroying other sessions or tenants", async () => {
      const result = await new PostgresUlcT07ExactSessionNoteRedactor(port).redact(approval);
      expect(result.status).toBe("one-shared-session-note-redacted-only");
      expect(result.fullPrivacyComplete).toBe(false);
      const rows = await required().client.unsafe(
        "SELECT id,organization_id,note FROM ulc_linz_training_session ORDER BY id",
      );
      expect(rows).toHaveLength(3);
      expect(rows.find(row=>row.id==="training-redact-1")?.note).toBeNull();
      expect(rows.find(row=>row.id==="training-keep-2")?.note).toBe("Another member note");
      expect(rows.find(row=>row.id==="training-foreign-3")?.note).toBe(exactNote);
    });

    it("denies replay, stale hash, wrong date and foreign org in real PostgreSQL", async () => {
      const redactor = new PostgresUlcT07ExactSessionNoteRedactor(port);
      for (const input of [
        approval,
        { ...approval, expectedNoteSha256: "b".repeat(64) },
        { ...approval, expectedSessionDate: "2026-11-16" },
        { ...approval, organizationId: "other-club" },
      ]) {
        await expect(redactor.redact(input)).rejects.toThrow();
      }
      const rows = await required().client.unsafe(
        "SELECT count(*)::int AS total FROM ulc_linz_training_session WHERE note IS NOT NULL",
      );
      expect(rows[0]?.total).toBe(2);
    });
  });
}
