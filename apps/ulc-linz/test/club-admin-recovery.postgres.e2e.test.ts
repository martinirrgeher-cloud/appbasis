import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresDatabase } from "@appbasis/database/postgres-provisioning";

const adminUrl = process.env.DATABASE_URL;
if (!adminUrl || !adminUrl.trim()) {
  describe.skip("ULC club admin expiring recovery PostgreSQL E2E", () => {
    it("requires a disposable PostgreSQL test server", () => {});
  });
} else {
  describe("ULC club admin expiring recovery PostgreSQL E2E", () => {
    const owner = createPostgresDatabase(adminUrl);
    const database = "ulc_recovery_" + randomUUID().replaceAll("-", "").slice(0, 14);
    const isolated = new URL(adminUrl);
    isolated.pathname = "/" + database;
    let connection: ReturnType<typeof createPostgresDatabase> | null = null;
    let created = false;

    async function apply(path: string) {
      if (!connection) throw new Error("Isolated connection missing.");
      const text = await readFile(new URL(path, import.meta.url), "utf8");
      for (const statement of text.split("--> statement-breakpoint").map(s => s.trim()).filter(Boolean)) {
        await connection.client.unsafe(statement);
      }
    }

    beforeAll(async () => {
      await owner.client.unsafe("CREATE DATABASE " + database);
      created = true;
      connection = createPostgresDatabase(isolated.toString());
      await apply("../../../packages/identity/drizzle/0000_appbasis_identity_foundation.sql");
      await apply("../../../packages/identity/drizzle/0001_appbasis_identity_foundation.sql");
      await apply("../../../packages/identity/drizzle/0002_appbasis_identity_provisioning_audit.sql");
      await apply("../recovery/0001_ulc_linz_club_admin_recovery.sql");
    });
    afterAll(async () => {
      if (connection) await connection.client.end();
      if (created) await owner.client.unsafe("DROP DATABASE " + database + " WITH (FORCE)");
      await owner.client.end();
    });

    it("records actor/reason and rejects an expired admin password change atomically", async () => {
      if (!connection) throw new Error("Missing test database.");
      const db = connection.client;
      const id = "recovery-admin";
      await db.unsafe(
        'INSERT INTO public."user" (id,name,email,username,updated_at) VALUES ($1,$2,$3,$4,now())',
        [id, "Club Admin", "ulc.recovery@example.invalid", "ulc.admin"],
      );
      await db.unsafe(
        "INSERT INTO public.appbasis_identity_security_state(identity_id,must_change_password) VALUES ($1,true)",
        [id],
      );
      await db.unsafe(
        "INSERT INTO public.account(id,account_id,provider_id,user_id,password,updated_at) VALUES ($1,$2,$3,$4,$5,now())",
        ["recovery-account", id, "credential", id, "old-hash"],
      );
      await db.unsafe(
        "INSERT INTO ulc_linz_operations.club_admin_recovery_audit " +
        "(operation_id,actor_principal_id,target_identity_id,reason,created_at,expires_at,retained_until) " +
        "VALUES ($1,$2,$3,$4,now()-interval '3 hours',now()-interval '1 hour'," +
        "now()-interval '3 hours'+interval '1 year')",
        [randomUUID(), "technical-root", id, "Owner authorized recovery"],
      );
      await expect(db.unsafe(
        "INSERT INTO public.session(id,expires_at,token,updated_at,user_id) " +
        "VALUES($1,now()+interval '1 hour',$2,now(),$3)",
        ["expired-admin-session", "expired-admin-session-token", id],
      )).rejects.toBeTruthy();
      await expect(db.unsafe(
        "UPDATE public.account SET password=$1 WHERE id=$2",
        ["too-late", "recovery-account"],
      )).rejects.toBeTruthy();
      const [failed] = await db.unsafe("SELECT password FROM public.account WHERE id=$1", ["recovery-account"]);
      expect(failed?.password).toBe("old-hash");
      await db.unsafe("DELETE FROM ulc_linz_operations.club_admin_recovery_audit WHERE target_identity_id=$1", [id]);
      await db.unsafe(
        "INSERT INTO ulc_linz_operations.club_admin_recovery_audit " +
        "(operation_id,actor_principal_id,target_identity_id,reason,created_at,expires_at,retained_until) " +
        "VALUES ($1,$2,$3,$4,now(),now()+interval '2 hours',now()+interval '1 year')",
        [randomUUID(), "technical-root", id, "Owner authorized recovery"],
      );
      await db.unsafe("UPDATE public.account SET password=$1 WHERE id=$2", ["new-hash", "recovery-account"]);
      await db.unsafe(
        "INSERT INTO public.session(id,expires_at,token,updated_at,user_id) " +
        "VALUES($1,now()+interval '1 hour',$2,now(),$3)",
        ["valid-admin-session", "valid-admin-session-token", id],
      );
      const [current] = await db.unsafe(
        "SELECT a.password, r.actor_principal_id, r.reason, r.expires_at>now() AS active, " +
        "r.retained_until>now() AS audit_retained " +
        "FROM public.account a JOIN ulc_linz_operations.club_admin_recovery_audit r ON r.target_identity_id=a.user_id " +
        "WHERE a.id=$1",
        ["recovery-account"],
      );
      expect(current).toMatchObject({
        password: "new-hash", actor_principal_id: "technical-root",
        reason: "Owner authorized recovery", active: true, audit_retained: true,
      });
    });
  });
}
