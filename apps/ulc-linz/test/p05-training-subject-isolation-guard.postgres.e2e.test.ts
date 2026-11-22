import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { createPostgresDatabase } from "@appbasis/database/postgres-provisioning";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * P05 security rehearsal against PostgreSQL 18 only.
 *
 * The production v17 training-subject trigger has an advisory lock + marker
 * lookup but does not reject a stale REPEATABLE READ/SERIALIZABLE snapshot.
 * A transaction can acquire its snapshot before a concurrent deletion commits:
 * waiting for the advisory lock alone cannot refresh that snapshot.
 *
 * Apply the proposed complete CREATE OR REPLACE FUNCTION only to a fresh,
 * disposable localhost PostgreSQL database, never preview or production.
 * This is deliberately NOT a release of cross-owner erasure or retention.
 */
const DATABASE_URL = process.env.DATABASE_URL;
if (DATABASE_URL) {
  const url = new URL(DATABASE_URL);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "::1"].includes(url.hostname) ||
    url.port !== "5432" || url.username !== "postgres" ||
    url.pathname !== "/appbasis_identity_e2e"
  ) {
    throw new Error("P05 isolation guard test accepts only disposable localhost PostgreSQL CI.");
  }
}
const suite = DATABASE_URL ? describe : describe.skip;
const ORG = "p05-iso-org";
const FOREIGN_ORG = "p05-iso-foreign";
const ERASED = "p05-erased-athlete";
const NEIGHBOR = "p05-neighbor-athlete";
const SESSION = "p05-session";
const FOREIGN_SESSION = "p05-foreign-session";

suite("P05 subject fence refuses stale transaction snapshots", () => {
  const admin = DATABASE_URL ? createPostgresDatabase(DATABASE_URL) : null;
  const name = "ulc_p05_isolation_" + randomUUID().replaceAll("-", "").slice(0, 12);
  const isolatedUrl = DATABASE_URL ? new URL(DATABASE_URL) : null;
  if (isolatedUrl) isolatedUrl.pathname = "/" + name;
  let database: ReturnType<typeof createPostgresDatabase> | null = null;
  let created = false;

  function sql() {
    if (!database) throw new Error("P05 temporary database unavailable.");
    return database.client;
  }

  const writes = [
    {
      name: "attendance",
      statement: `INSERT INTO ulc_linz_training_attendance
        (organization_id, session_id, athlete_id, status)
        VALUES ($1,$2,$3,'present')`,
      params: (org: string, session: string, subject: string) => [org, session, subject],
    },
    {
      name: "registration",
      statement: `INSERT INTO ulc_linz_training_registration
        (organization_id, session_id, athlete_id, intention, updated_by_identity_id)
        VALUES ($1,$2,$3,'attending','p05-synthetic-actor')`,
      params: (org: string, session: string, subject: string) => [org, session, subject],
    },
    {
      name: "history",
      statement: `INSERT INTO ulc_linz_training_registration_change
        (id, organization_id, session_id, athlete_id, intention, revision, actor_identity_id)
        VALUES ($4,$1,$2,$3,'attending',1,'p05-synthetic-actor')`,
      params: (org: string, session: string, subject: string) =>
        [org, session, subject, "p05-change-" + randomUUID()],
    },
  ] as const;

  beforeAll(async () => {
    if (!admin || !isolatedUrl) throw new Error("P05 CI PostgreSQL unavailable.");
    const present = await admin.client.unsafe(
      "SELECT 1 FROM pg_database WHERE datname = $1", [name],
    );
    if (present.length !== 0) throw new Error("P05 refuses to reuse an existing database.");
    await admin.client.unsafe("CREATE DATABASE " + name);
    created = true;
    database = createPostgresDatabase(isolatedUrl.toString());

    // Exactly the published session schema and its currently installed v17
    // guard; no extra private helper functions or guessed table ownership.
    for (const path of [
      "../migrations/0004_ulc_linz_training_sessions.sql",
      "../migrations/0008_ulc_linz_session_registration.sql",
      "../migrations/0010_ulc_linz_registration_notes.sql",
      "../migrations/0017_ulc_linz_training_subject_write_fence.sql",
    ]) {
      const body = await readFile(new URL(path, import.meta.url), "utf8");
      for (const statement of body.split("--> statement-breakpoint")) {
        if (statement.trim()) await sql().unsafe(statement);
      }
    }

    const source = await readFile(
      new URL("../migrations/0017_ulc_linz_training_subject_write_fence.sql", import.meta.url), "utf8",
    );
    if (!source.includes("CREATE FUNCTION ulc_linz_training_subject_write_fence()") ||
        source.includes("current_setting('transaction_isolation')")) {
      throw new Error("P05 proposed guard requires review against the exact unpatched v17 migration.");
    }

    const proposal = await readFile(
      new URL("../proposals/p05-training-subject-isolation-guard.sql", import.meta.url), "utf8",
    );
    if (!proposal.includes("CREATE OR REPLACE FUNCTION ulc_linz_training_subject_write_fence()") ||
        !proposal.includes("current_setting('transaction_isolation')") ||
        !proposal.includes("SECURITY DEFINER") ||
        proposal.includes("CREATE TRIGGER") || proposal.includes("DROP TABLE")) {
      throw new Error("P05 isolation proposal violates its review-only SQL scope.");
    }
    await sql().unsafe(proposal);

    for (const [org, session] of [
      [ORG, SESSION], [FOREIGN_ORG, FOREIGN_SESSION],
    ] as const) {
      await sql().unsafe(
        `INSERT INTO ulc_linz_training_session
           (id, organization_id, module_id, group_id, session_date, note)
         VALUES ($1,$2,'u12','p05-group','2026-11-22','synthetic')`,
        [session, org],
      );
    }
  }, 120_000);

  afterAll(async () => {
    if (database) {
      await database.client.end();
      database = null;
    }
    if (admin) {
      try {
        if (created) await admin.client.unsafe("DROP DATABASE " + name + " WITH (FORCE)");
      } finally {
        await admin.client.end();
      }
    }
  }, 120_000);

  it("preserves all three trigger bindings, SECURITY DEFINER and current marker retention", async () => {
    const rows = await sql().unsafe(
      `SELECT p.prosecdef AS security_definer,
              pg_get_functiondef(p.oid) LIKE '%current_setting(''transaction_isolation'')%' AS isolation_guard,
              p.proconfig IS NOT NULL AS search_path_pinned
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='public' AND p.proname='ulc_linz_training_subject_write_fence'`,
    );
    expect(rows).toEqual([{ security_definer: true, isolation_guard: true, search_path_pinned: true }]);
    const triggers = await sql().unsafe(
      `SELECT count(*)::int AS total FROM pg_trigger
        WHERE tgname IN (
          'ulc_linz_training_attendance_subject_fence',
          'ulc_linz_training_registration_subject_fence',
          'ulc_linz_training_registration_change_subject_fence'
        ) AND NOT tgisinternal AND tgenabled='O'`,
    );
    expect(triggers[0]?.total).toBe(3);
    const retention = await sql().unsafe(
      `SELECT pg_get_constraintdef(oid) AS definition
         FROM pg_constraint
        WHERE conname='ulc_linz_training_subject_deletion_retention_check'`,
    );
    expect(retention).toHaveLength(1);
    expect(String(retention[0]?.definition)).toContain("840 hours");
  });

  it("rejects REPEATABLE READ and SERIALIZABLE for ALL three direct writers", async () => {
    for (const isolation of ["REPEATABLE READ", "SERIALIZABLE"] as const) {
      for (const writer of writes) {
        await expect(sql().begin(async (tx) => {
          await tx.unsafe("SET TRANSACTION ISOLATION LEVEL " + isolation);
          await tx.unsafe(writer.statement,
            writer.params(ORG, SESSION, "p05-iso-denied-" + writer.name),
          );
        })).rejects.toThrow(/READ COMMITTED isolation/);
      }
    }
    const rows = await sql().unsafe(
      `SELECT (SELECT count(*)::int FROM ulc_linz_training_attendance) AS attendance,
              (SELECT count(*)::int FROM ulc_linz_training_registration) AS registration,
              (SELECT count(*)::int FROM ulc_linz_training_registration_change) AS history`,
    );
    expect(rows[0]).toEqual({ attendance: 0, registration: 0, history: 0 });
  }, 120_000);

  it("keeps READ COMMITTED functional, then blocks marked subjects without harming neighbors", async () => {
    // Normal writes still work in the default isolation.
    for (const writer of writes) {
      await sql().unsafe(writer.statement, writer.params(ORG, SESSION, NEIGHBOR));
    }
    // Use the real 35-day marker constraint; no fake expiry extension.
    await sql().unsafe(
      `INSERT INTO ulc_linz_training_subject_deletion
         (organization_id, athlete_id, completed_at, purge_after)
         VALUES ($1,$2,now(),now() + interval '840 hours')`,
      [ORG, ERASED],
    );
    for (const writer of writes) {
      await expect(sql().unsafe(writer.statement,
        writer.params(ORG, SESSION, ERASED),
      )).rejects.toThrow(/deletion marker/);
      await sql().unsafe(writer.statement,
        writer.params(FOREIGN_ORG, FOREIGN_SESSION, ERASED),
      );
    }
    await expect(sql().unsafe(
      `UPDATE ulc_linz_training_attendance
         SET athlete_id=$1 WHERE organization_id=$2 AND athlete_id=$3`,
      [ERASED, ORG, NEIGHBOR],
    )).rejects.toThrow(/ownership is immutable/);

    const rows = await sql().unsafe(
      `SELECT
        (SELECT count(*)::int FROM ulc_linz_training_attendance
         WHERE organization_id=$1 AND athlete_id=$2) AS blocked_attendance,
        (SELECT count(*)::int FROM ulc_linz_training_registration
         WHERE organization_id=$1 AND athlete_id=$2) AS blocked_registration,
        (SELECT count(*)::int FROM ulc_linz_training_registration_change
         WHERE organization_id=$1 AND athlete_id=$2) AS blocked_history`,
      [ORG, ERASED],
    );
    expect(rows[0]).toEqual({
      blocked_attendance: 0, blocked_registration: 0, blocked_history: 0,
    });
  }, 120_000);
});
