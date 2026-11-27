import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresDatabase } from "@appbasis/database/postgres-provisioning";
import { PostgresUlcT07ExactOwnerTextRedactor } from
  "../worker/t07-exact-owner-text-redaction";
import type { UlcT07NoteRedactionSqlPort } from
  "../worker/t07-exact-session-note-redaction";

const databaseUrl = process.env.DATABASE_URL;
const content = "synthetic exact subject note - redact this value";
const digest = createHash("sha256").update(content, "utf8").digest("hex");

if (!databaseUrl) {
  describe.skip("T07 exact owner-text PostgreSQL E2E", () => {
    it("requires a disposable DATABASE_URL", () => {});
  });
} else {
  describe("T07 exact owner-text PostgreSQL E2E", () => {
    const admin = createPostgresDatabase(databaseUrl);
    const dbName = "appbasis_t07_owner_text_" + randomUUID().replaceAll("-", "").slice(0, 12);
    const targetUrl = new URL(databaseUrl);
    targetUrl.pathname = "/" + dbName;
    let target: ReturnType<typeof createPostgresDatabase> | null = null;
    let sourceAt = "";
    let created = false;
    function required() {
      if (!target) throw new Error("Missing T07 disposable PostgreSQL DB.");
      return target;
    }
    const port: UlcT07NoteRedactionSqlPort = {
      begin(callback) {
        return required().client.begin(async tx => callback({
          unsafe(query, params) { return tx.unsafe(query, params); },
        }));
      },
    };

    beforeAll(async () => {
      await admin.client.unsafe("CREATE DATABASE " + dbName);
      created = true;
      target = createPostgresDatabase(targetUrl.toString());
      await required().client.unsafe(`
        CREATE TABLE ulc_linz_lifecycle_deletion (
          organization_id text NOT NULL, subject_id text NOT NULL,
          source_role text NOT NULL, completed_at timestamptz NOT NULL,
          purge_after timestamptz NOT NULL,
          PRIMARY KEY (organization_id,subject_id)
        );
        CREATE TABLE appbasis_training_plan_revision_item (
          organization_id text NOT NULL, plan_id text NOT NULL,
          revision integer NOT NULL, item_id text NOT NULL,
          note text, comment text,
          PRIMARY KEY (organization_id,plan_id,revision,item_id)
        );
        CREATE TABLE appbasis_training_documentation_revision (
          organization_id text NOT NULL, documentation_id text NOT NULL,
          revision integer NOT NULL, note text,
          PRIMARY KEY (organization_id,documentation_id,revision)
        );
        CREATE TABLE appbasis_training_block_usage (
          organization_id text NOT NULL, id text NOT NULL,
          note text, source_ref text,
          PRIMARY KEY (organization_id,id)
        );
      `);
      const now = new Date(Date.now() - 60_000);
      now.setMilliseconds(0);
      sourceAt = now.toISOString();
      await required().client.unsafe(`
        INSERT INTO ulc_linz_lifecycle_deletion
          (organization_id,subject_id,source_role,completed_at,purge_after)
        VALUES ('ulc-linz','athlete-old','athlete',$1::timestamptz,
                $1::timestamptz + interval '840 hours')
      `, [sourceAt]);
      await required().client.unsafe(`
        INSERT INTO appbasis_training_plan_revision_item
          (organization_id,plan_id,revision,item_id,comment,note)
        VALUES ('ulc-linz','plan-old',2,'item-1',$1,'Preserve note'),
               ('ulc-linz','plan-old',2,'item-2','Other participant',NULL),
               ('other-club','plan-old',2,'item-1',$1,NULL)
      `, [content]);
      await required().client.unsafe(`
        INSERT INTO appbasis_training_documentation_revision
          (organization_id,documentation_id,revision,note)
        VALUES ('ulc-linz','doc-old',1,$1), ('other-club','doc-old',1,$1)
      `, [content]);
      await required().client.unsafe(`
        INSERT INTO appbasis_training_block_usage
          (organization_id,id,note,source_ref)
        VALUES ('ulc-linz','usage-old',$1,'Do not remove this ref')
      `, [content]);
    });

    afterAll(async () => {
      if (target) await target.client.end();
      if (created) await admin.client.unsafe("DROP DATABASE " + dbName + " WITH (FORCE)");
      await admin.client.end();
    });

    const input = (which: "training-plan-item-comment" |
      "documentation-revision-note" | "training-block-usage-note",
    keys: string[]) => ({
      organizationId: "ulc-linz", subjectId: "athlete-old",
      expectedSourceCompletedAt: sourceAt, target: which, keys,
      expectedValueSha256: digest,
    });

    it("redacts only the manually selected historic plan-revision comment", async () => {
      const service = new PostgresUlcT07ExactOwnerTextRedactor(port);
      const res = await service.redact(input("training-plan-item-comment",
        ["plan-old","2","item-1"]));
      expect(res.fullPrivacyComplete).toBe(false);
      expect(res.redacted).toBe(true);
      const rows = await required().client.unsafe(`
        SELECT organization_id,item_id,note,comment
        FROM appbasis_training_plan_revision_item ORDER BY organization_id,item_id
      `);
      expect(rows).toHaveLength(3);
      expect(rows.find(x=>x.organization_id==="ulc-linz"&&x.item_id==="item-1")?.comment).toBeNull();
      expect(rows.find(x=>x.organization_id==="ulc-linz"&&x.item_id==="item-1")?.note).toBe("Preserve note");
      expect(rows.find(x=>x.organization_id==="ulc-linz"&&x.item_id==="item-2")?.comment).toBe("Other participant");
      expect(rows.find(x=>x.organization_id==="other-club")?.comment).toBe(content);
      await expect(service.redact(input("training-plan-item-comment",
        ["plan-old","2","item-1"]))).rejects.toThrow(/no longer matches/);
    });

    it("redacts a historic documentation note and usage note without touching other columns", async () => {
      const service = new PostgresUlcT07ExactOwnerTextRedactor(port);
      await service.redact(input("documentation-revision-note",["doc-old","1"]));
      await service.redact(input("training-block-usage-note",["usage-old"]));
      const docs = await required().client.unsafe(
        "SELECT organization_id,note FROM appbasis_training_documentation_revision ORDER BY organization_id",
      );
      expect(docs.find(x=>x.organization_id==="ulc-linz")?.note).toBeNull();
      expect(docs.find(x=>x.organization_id==="other-club")?.note).toBe(content);
      const usage = await required().client.unsafe(
        "SELECT note,source_ref FROM appbasis_training_block_usage WHERE organization_id='ulc-linz'",
      );
      expect(usage[0]?.note).toBeNull();
      expect(usage[0]?.source_ref).toBe("Do not remove this ref");
    });

    it("rejects foreign org, mismatched SHA and expired source without any new mutation", async () => {
      const service = new PostgresUlcT07ExactOwnerTextRedactor(port);
      for (const decision of [
        { ...input("documentation-revision-note",["doc-old","1"]),
          organizationId: "other-club" },
        { ...input("training-block-usage-note",["usage-old"]),
          expectedValueSha256: "f".repeat(64) },
      ]) await expect(service.redact(decision)).rejects.toThrow();
      await required().client.unsafe(`
        UPDATE ulc_linz_lifecycle_deletion
           SET purge_after = now() - interval '1 minute'
         WHERE organization_id='ulc-linz'
      `);
      await expect(service.redact(input("training-block-usage-note",["usage-old"])))
        .rejects.toThrow(/expired, missing or conflicting/);
      const others = await required().client.unsafe(
        "SELECT count(*)::int AS total FROM appbasis_training_plan_revision_item WHERE organization_id='other-club' AND comment IS NOT NULL",
      );
      expect(others[0]?.total).toBe(1);
    });
  });
}
