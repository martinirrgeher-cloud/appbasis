import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { createPostgresDatabase } from "@appbasis/database/postgres-provisioning";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * P06 v18 -> v19 forward migration / fresh-install recovery boundary.
 * Exactly the currently registered 47 owner migrations are rehearsed in a
 * disposable localhost PostgreSQL 18 database. The historical v18 function
 * must be replaced by the identical live-approved v19 function.
 *
 * This is NOT a Neon restore, data-erasure authorization, policy activation
 * or evidence that all eight persistent owners completed an erasure replay.
 */
const DATABASE_URL = process.env.DATABASE_URL;
if (DATABASE_URL) {
  const source = new URL(DATABASE_URL);
  if (!["localhost", "127.0.0.1", "::1"].includes(source.hostname) ||
      source.username !== "postgres" || source.port !== "5432" ||
      source.pathname !== "/appbasis_identity_e2e") {
    throw new Error("P06 migration rehearsal accepts disposable local PostgreSQL only.");
  }
}

const suite = DATABASE_URL ? describe : describe.skip;
const ORG = "p06-new-schema-org";
const OTHER = "p06-neighbor-org";
const SUBJECT = "p06-erased";
const NEIGHBOR = "p06-kept";
const SESSION = "p06-session";
const FOREIGN_SESSION = "p06-foreign-session";

suite("P06 published 47-migration restore/fresh-install fencing", () => {
  const admin = DATABASE_URL ? createPostgresDatabase(DATABASE_URL) : null;
  const name = "ulc_p06_v19_" + randomUUID().replaceAll("-", "").slice(0, 12);
  const isolated = DATABASE_URL ? new URL(DATABASE_URL) : null;
  if (isolated) isolated.pathname = "/" + name;
  let db: ReturnType<typeof createPostgresDatabase> | null = null;
  let created = false;
  let previousOid: string | null = null;

  function client() {
    if (!db) throw new Error("P06 disposable database was not created.");
    return db.client;
  }

  const writers = [
    {
      kind: "attendance",
      sql: "INSERT INTO ulc_linz_training_attendance " +
        "(organization_id,session_id,athlete_id,status) VALUES ($1,$2,$3,'present')",
      args: (org: string, session: string, subject: string) => [org, session, subject],
    },
    {
      kind: "registration",
      sql: "INSERT INTO ulc_linz_training_registration " +
        "(organization_id,session_id,athlete_id,intention,updated_by_identity_id) " +
        "VALUES ($1,$2,$3,'attending','p06-trainer')",
      args: (org: string, session: string, subject: string) => [org, session, subject],
    },
    {
      kind: "history",
      sql: "INSERT INTO ulc_linz_training_registration_change " +
        "(id,organization_id,session_id,athlete_id,intention,revision,actor_identity_id) " +
        "VALUES ($4,$1,$2,$3,'attending',1,'p06-trainer')",
      args: (org: string, session: string, subject: string) =>
        [org, session, subject, "p06-revision-" + randomUUID()],
    },
  ] as const;

  beforeAll(async () => {
    if (!admin || !isolated) throw new Error("P06 localhost PostgreSQL unavailable.");
    const existing = await admin.client.unsafe(
      "SELECT 1 FROM pg_database WHERE datname=$1", [name],
    );
    if (existing.length !== 0) throw new Error("P06 refuses reused PostgreSQL databases.");
    await admin.client.unsafe("CREATE DATABASE " + name);
    created = true;
    db = createPostgresDatabase(isolated.toString());

    const manifest = JSON.parse(
      await readFile(new URL("../appbasis.database.json", import.meta.url), "utf8"),
    ) as { owners: { id: string; schemaVersion: number; migrations: string[] }[] };
    const paths = manifest.owners.flatMap(o => o.migrations);
    const lifecycle = manifest.owners.find(o => o.id === "ulc-linz-lifecycle");
    const v19 = "apps/ulc-linz/migrations/0018_ulc_linz_training_subject_isolation_reconciliation.sql";
    if (manifest.owners.length !== 8 || paths.length !== 47 ||
        new Set(paths).size !== 47 || lifecycle?.schemaVersion !== 19 ||
        lifecycle.migrations.length !== 19 || paths.at(-1) !== v19 ||
        lifecycle.migrations[17] !==
          "apps/ulc-linz/migrations/0017_ulc_linz_training_subject_write_fence.sql") {
      throw new Error("P06 refuses ambiguous or incomplete v19 owner manifest.");
    }

    const proposal = await readFile(
      new URL("../proposals/p05-training-subject-isolation-guard.sql", import.meta.url), "utf8",
    );
    const forward = await readFile(
      new URL("../migrations/0018_ulc_linz_training_subject_isolation_reconciliation.sql",
        import.meta.url), "utf8",
    );
    const source = (sql: string) =>
      sql.match(/AS \$fence\$([\s\S]*?)\$fence\$;/)?.[1];
    if (!source(proposal) || source(forward) !== source(proposal) ||
        !source(forward)?.includes("current_setting('transaction_isolation')") ||
        forward.split("\n").filter(line => !line.trimStart().startsWith("--"))
          .some(line => /\b(?:CREATE\s+TRIGGER|DROP\s+TABLE|GRANT\s+|DELETE\s+FROM)\b/i.test(line))) {
      throw new Error("P06 forward DDL deviates from exactly reviewed proposal.");
    }

    // Recreate an actual pre-hotfix v18 state, then apply exactly the 47th
    // registered migration. This also rehearses the full fresh-install order.
    for (let index = 0; index < paths.length; index++) {
      if (index === 46) {
        const old = await client().unsafe(
          "SELECT oid::text AS oid, prosrc AS source FROM pg_proc " +
          "WHERE oid='public.ulc_linz_training_subject_write_fence()'::regprocedure",
        );
        expect(old).toHaveLength(1);
        expect(String(old[0]?.source)).not.toContain("transaction_isolation");
        previousOid = String(old[0]?.oid);
      }
      const sql = await readFile(new URL("../../../" + paths[index], import.meta.url), "utf8");
      for (const statement of sql.split("--> statement-breakpoint")) {
        if (statement.trim()) await client().unsafe(statement);
      }
    }
    const after = await client().unsafe(
      "SELECT oid::text AS oid, prosrc AS source FROM pg_proc " +
      "WHERE oid='public.ulc_linz_training_subject_write_fence()'::regprocedure",
    );
    expect(after).toHaveLength(1);
    expect(after[0]?.oid).toBe(previousOid);
    expect(after[0]?.source).toBe(source(proposal));

    for (const [org, session] of [[ORG, SESSION], [OTHER, FOREIGN_SESSION]] as const) {
      await client().unsafe(
        "INSERT INTO ulc_linz_training_session " +
        "(id,organization_id,module_id,group_id,session_date,note) " +
        "VALUES ($1,$2,'u12','p06-group','2026-11-22','synthetic')",
        [session, org],
      );
    }
  }, 120_000);

  afterAll(async () => {
    if (db) {
      await db.client.end();
      db = null;
    }
    if (admin) {
      try {
        if (created) {
          await admin.client.unsafe("DROP DATABASE " + name + " WITH (FORCE)");
        }
      } finally {
        await admin.client.end();
      }
    }
  }, 120_000);

  it("keeps 69 tables, three enabled original triggers, owner-only execution and source retention", async () => {
    const rows = await client().unsafe(
      "SELECT p.oid::text AS oid, p.prosecdef AS security_definer, " +
      "p.proconfig AS settings, p.proacl::text AS acl, " +
      "(SELECT count(*)::int FROM pg_trigger t WHERE t.tgfoid=p.oid " +
      " AND NOT t.tgisinternal AND t.tgenabled='O') AS triggers, " +
      "(SELECT count(*)::int FROM pg_tables WHERE schemaname='public') AS tables " +
      "FROM pg_proc p WHERE p.oid='public.ulc_linz_training_subject_write_fence()'::regprocedure",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      oid: previousOid,
      security_definer: true,
      settings: ["search_path=pg_catalog, pg_temp"],
      triggers: 3,
      tables: 69,
    });
    const publicGrants = await client().unsafe(
      "SELECT count(*)::int AS total FROM pg_proc p " +
      "CROSS JOIN LATERAL aclexplode(p.proacl) AS acl " +
      "WHERE p.oid='public.ulc_linz_training_subject_write_fence()'::regprocedure " +
      "AND acl.grantee=0 AND acl.privilege_type='EXECUTE'",
    );
    expect(publicGrants[0]?.total).toBe(0);
    const retention = await client().unsafe(
      "SELECT count(*)::int AS total FROM pg_constraint " +
      "WHERE conname='ulc_linz_training_subject_deletion_retention_check' " +
      "AND contype='c' AND convalidated",
    );
    expect(retention[0]?.total).toBe(1);
  });

  it("rejects old snapshot writes on every guarded owner while keeping read committed writes", async () => {
    for (const isolation of ["REPEATABLE READ", "SERIALIZABLE"] as const) {
      for (const writer of writers) {
        await expect(client().begin(async tx => {
          await tx.unsafe("SET TRANSACTION ISOLATION LEVEL " + isolation);
          await tx.unsafe(writer.sql,
            writer.args(ORG, SESSION, "p06-denied-" + writer.kind),
          );
        })).rejects.toThrow(/READ COMMITTED isolation/);
      }
    }
    for (const writer of writers) {
      await client().unsafe(writer.sql, writer.args(ORG, SESSION, NEIGHBOR));
    }
    await client().unsafe(
      "INSERT INTO ulc_linz_training_subject_deletion " +
      "(organization_id,athlete_id,completed_at,purge_after) " +
      "VALUES ($1,$2,now(),now()+interval '840 hours')",
      [ORG, SUBJECT],
    );
    for (const writer of writers) {
      await expect(client().unsafe(writer.sql,
        writer.args(ORG, SESSION, SUBJECT))).rejects.toThrow(/deletion marker/);
      await client().unsafe(writer.sql, writer.args(OTHER, FOREIGN_SESSION, SUBJECT));
    }
    const counts = await client().unsafe(
      "SELECT (SELECT count(*)::int FROM ulc_linz_training_attendance " +
      "WHERE organization_id=$1 AND athlete_id=$2) AS attendance, " +
      "(SELECT count(*)::int FROM ulc_linz_training_registration " +
      "WHERE organization_id=$1 AND athlete_id=$2) AS registration, " +
      "(SELECT count(*)::int FROM ulc_linz_training_registration_change " +
      "WHERE organization_id=$1 AND athlete_id=$2) AS history",
      [ORG, SUBJECT],
    );
    expect(counts[0]).toEqual({ attendance: 0, registration: 0, history: 0 });
  }, 120_000);
});
