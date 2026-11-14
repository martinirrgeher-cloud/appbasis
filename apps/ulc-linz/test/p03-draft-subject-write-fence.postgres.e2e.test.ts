import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresDatabase } from "@appbasis/database/postgres-provisioning";

import {
  PostgresUlcTrainingSessionRepository,
} from "../worker/training-session-postgres";

/**
 * P03-D: candidate DB write fence installed ONLY in a disposable test DB.
 *
 * NOT a production migration, deletion authority, approved marker duration,
 * runtime security fix, or restore guarantee. P01 approval is still required.
 *
 * The candidate serializes writes and simulated erasure with a shared
 * transaction-scoped advisory lock per organization+subject, then checks
 * a deliberately test-local deletion decision.
 */
const DATABASE_URL = process.env.DATABASE_URL;
const TARGET = "p03d-target";
const NEIGHBOR = "p03d-neighbor";

type Manifest = { owners: readonly { migrations: readonly string[] }[] };
type Client = ReturnType<typeof createPostgresDatabase>["client"];
type SqlClient = Pick<Client, "unsafe">;

if (!DATABASE_URL) {
  describe.skip("ULC P03-D disposable subject write-fence prototype", () => {
    it("requires DATABASE_URL", () => {});
  });
} else {
  describe("ULC P03-D disposable subject write-fence prototype", () => {
    const admin = createPostgresDatabase(DATABASE_URL);
    const name = "ulc_p03d_fence_" + randomUUID().replaceAll("-", "").slice(0, 12);
    const isolatedUrl = new URL(DATABASE_URL);
    isolatedUrl.pathname = "/" + name;
    let database: ReturnType<typeof createPostgresDatabase> | null = null;
    let created = false;

    function db() {
      if (!database) throw new Error("P03-D disposable database unavailable.");
      return database;
    }

    function sessions() {
      return new PostgresUlcTrainingSessionRepository(
        db().client, () => randomUUID(),
      );
    }

    const acquireFence = `
      SELECT pg_advisory_xact_lock(
        hashtextextended(jsonb_build_array($1::text, $2::text)::text, 0)
      )
    `;

    async function markAndErase(
      sql: SqlClient, organizationId: string, subjectId: string,
    ): Promise<void> {
      await sql.unsafe(
        `INSERT INTO p03d_test_subject_fence (organization_id, athlete_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [organizationId, subjectId],
      );
      for (const table of [
        "ulc_linz_training_registration_change",
        "ulc_linz_training_registration",
        "ulc_linz_training_attendance",
      ]) {
        await sql.unsafe(
          `DELETE FROM ${table} WHERE organization_id = $1 AND athlete_id = $2`,
          [organizationId, subjectId],
        );
      }
    }

    async function fenceSubject(
      organizationId: string, subjectId: string,
    ): Promise<void> {
      await db().client.begin(async (transaction) => {
        await transaction.unsafe(acquireFence, [organizationId, subjectId]);
        await markAndErase(transaction, organizationId, subjectId);
      });
    }

    async function fixture(organizationId: string) {
      const input = {
        moduleId: "u12" as const,
        groupId: "p03d-u12",
        sessionDate: "2026-11-13",
        note: "Original shared session note",
      };
      const session = await sessions().saveSession(
        organizationId, input,
        [
          { athleteId: TARGET, status: "present" },
          { athleteId: NEIGHBOR, status: "present" },
        ],
        null,
      );
      await sessions().saveRegistration(
        organizationId, session.session.id, TARGET,
        "attending", null, "p03d-actor",
      );
      await sessions().saveRegistration(
        organizationId, session.session.id, NEIGHBOR,
        "attending", null, "p03d-actor",
      );
      return { input, session };
    }

    async function counters(organizationId: string, subjectId: string) {
      const rows = await db().client.unsafe(
        `SELECT
          (SELECT count(*)::int FROM ulc_linz_training_attendance
            WHERE organization_id = $1 AND athlete_id = $2) AS attendance,
          (SELECT count(*)::int FROM ulc_linz_training_registration
            WHERE organization_id = $1 AND athlete_id = $2) AS registration,
          (SELECT count(*)::int FROM ulc_linz_training_registration_change
            WHERE organization_id = $1 AND athlete_id = $2) AS history`,
        [organizationId, subjectId],
      );
      return rows[0];
    }

    beforeAll(async () => {
      await admin.client.unsafe("CREATE DATABASE " + name);
      created = true;
      database = createPostgresDatabase(isolatedUrl.toString());
      const manifest = JSON.parse(
        await readFile(new URL("../appbasis.database.json", import.meta.url), "utf8"),
      ) as Manifest;
      const migrations = manifest.owners.flatMap((owner) => owner.migrations);
      if (
        migrations.length !== 41 ||
        new Set(migrations).size !== migrations.length ||
        !migrations.some((p) => p.endsWith("0004_ulc_linz_training_sessions.sql")) ||
        !migrations.some((p) => p.endsWith("0008_ulc_linz_session_registration.sql"))
      ) {
        throw new Error("P03-D requires exact canonical ULC migration manifest.");
      }
      for (const migration of migrations) {
        const sql = await readFile(new URL("../../../" + migration, import.meta.url), "utf8");
        for (const statement of sql.split("--> statement-breakpoint")) {
          if (statement.trim()) await db().client.unsafe(statement);
        }
      }

      // Ephemeral test-only objects: NEVER add these to appbasis.database.json.
      await db().client.unsafe(
        `CREATE TABLE p03d_test_subject_fence (
           organization_id text NOT NULL,
           athlete_id text NOT NULL,
           PRIMARY KEY (organization_id, athlete_id)
         )`,
      );
      await db().client.unsafe(
        `CREATE FUNCTION p03d_test_check_subject_fence() RETURNS trigger AS $$
         BEGIN
           PERFORM pg_advisory_xact_lock(
             hashtextextended(
               jsonb_build_array(NEW.organization_id, NEW.athlete_id)::text, 0
             )
           );
           IF EXISTS (
             SELECT 1 FROM p03d_test_subject_fence AS fence
             WHERE fence.organization_id = NEW.organization_id
               AND fence.athlete_id = NEW.athlete_id
           ) THEN
             RAISE EXCEPTION 'P03D_TEST_SUBJECT_WRITE_BLOCKED'
               USING ERRCODE = 'P0001';
           END IF;
           RETURN NEW;
         END
         $$ LANGUAGE plpgsql`,
      );
      for (const table of [
        "ulc_linz_training_attendance",
        "ulc_linz_training_registration",
        "ulc_linz_training_registration_change",
      ]) {
        await db().client.unsafe(
          `CREATE TRIGGER p03d_test_subject_guard BEFORE INSERT OR UPDATE ON ${table}
           FOR EACH ROW EXECUTE FUNCTION p03d_test_check_subject_fence()`,
        );
      }
    });

    afterAll(async () => {
      if (database) {
        await database.client.end();
        database = null;
      }
      if (created) await admin.client.unsafe("DROP DATABASE " + name + " WITH (FORCE)");
      await admin.client.end();
    });

    it("S1 prototype: denies a stale trainer list without rolling back a neighbor or replacing the session", async () => {
      const org = "p03d-trainer";
      const foreign = "p03d-other";
      const { input, session } = await fixture(org);
      await fixture(foreign);
      await fenceSubject(org, TARGET);
      expect(await counters(org, TARGET)).toEqual({
        attendance: 0, registration: 0, history: 0,
      });

      await expect(sessions().saveSession(
        org, { ...input, note: "STALE writer note" },
        [
          { athleteId: TARGET, status: "present" },
          { athleteId: NEIGHBOR, status: "present" },
        ],
        session.revision,
      )).rejects.toThrow(/P03D_TEST_SUBJECT_WRITE_BLOCKED/);

      expect(await counters(org, TARGET)).toEqual({
        attendance: 0, registration: 0, history: 0,
      });
      expect(await counters(org, NEIGHBOR)).toEqual({
        attendance: 1, registration: 1, history: 1,
      });
      expect(await counters(foreign, TARGET)).toEqual({
        attendance: 1, registration: 1, history: 1,
      });
      const roots = await db().client.unsafe(
        "SELECT note FROM ulc_linz_training_session WHERE id = $1",
        [session.session.id],
      );
      expect(roots[0]?.note).toBe("Original shared session note");
    });

    it("S2 prototype: denies stale registration and rolls back new session creation", async () => {
      const org = "p03d-self";
      const { session } = await fixture(org);
      await fenceSubject(org, TARGET);

      await expect(sessions().saveRegistration(
        org, session.session.id, TARGET, "not_attending", null,
        "p03d-actor", undefined, "old personal note",
      )).rejects.toThrow(/P03D_TEST_SUBJECT_WRITE_BLOCKED/);

      const group = "p03d-new-group";
      await expect(sessions().withRegistrationTransaction(async (scoped) => {
        const snapshot = await scoped.ensureScheduledSession(
          org, "kindertraining", group, "2026-11-14",
        );
        return scoped.saveRegistration(
          org, snapshot.session.id, TARGET, "attending", null,
          "p03d-actor",
        );
      })).rejects.toThrow(/P03D_TEST_SUBJECT_WRITE_BLOCKED/);
      const roots = await db().client.unsafe(
        `SELECT count(*)::int AS total FROM ulc_linz_training_session
         WHERE organization_id = $1 AND group_id = $2`,
        [org, group],
      );
      expect(roots[0]?.total).toBe(0);
      expect(await counters(org, TARGET)).toEqual({
        attendance: 0, registration: 0, history: 0,
      });
    });

    it("S5 prototype: denies all three direct SQL insert classes for a fenced subject", async () => {
      const org = "p03d-direct";
      const { session } = await fixture(org);
      await fenceSubject(org, TARGET);

      await expect(db().client.unsafe(
        `INSERT INTO ulc_linz_training_attendance
          (organization_id, session_id, athlete_id, status)
         VALUES ($1, $2, $3, 'present')`,
        [org, session.session.id, TARGET],
      )).rejects.toThrow(/P03D_TEST_SUBJECT_WRITE_BLOCKED/);
      await expect(db().client.unsafe(
        `INSERT INTO ulc_linz_training_registration
          (organization_id, session_id, athlete_id, intention, updated_by_identity_id)
         VALUES ($1, $2, $3, 'attending', 'p03d-actor')`,
        [org, session.session.id, TARGET],
      )).rejects.toThrow(/P03D_TEST_SUBJECT_WRITE_BLOCKED/);
      await expect(db().client.unsafe(
        `INSERT INTO ulc_linz_training_registration_change
          (id, organization_id, session_id, athlete_id,
           intention, revision, actor_identity_id)
         VALUES ($1, $2, $3, $4, 'attending', 1, 'p03d-actor')`,
        [randomUUID(), org, session.session.id, TARGET],
      )).rejects.toThrow(/P03D_TEST_SUBJECT_WRITE_BLOCKED/);

      expect(await counters(org, TARGET)).toEqual({
        attendance: 0, registration: 0, history: 0,
      });
      expect(await counters(org, NEIGHBOR)).toEqual({
        attendance: 1, registration: 1, history: 1,
      });
    });

    it("S6 prototype: writer committed after the deletion fence must be rejected", async () => {
      const org = "p03d-race";
      const { session } = await fixture(org);
      let announceLocked!: () => void;
      let continueDeletion!: () => void;
      const locked = new Promise<void>((resolve) => { announceLocked = resolve; });
      const release = new Promise<void>((resolve) => { continueDeletion = resolve; });
      const deletion = db().client.begin(async (tx) => {
        await tx.unsafe(acquireFence, [org, TARGET]);
        announceLocked();
        await release;
        await markAndErase(tx, org, TARGET);
      });

      await locked;
      // Use a fresh session with no existing registration to force a real
      // INSERT through the fence rather than an unrelated CAS conflict.
      const future = await sessions().ensureScheduledSession(
        org, "kindertraining", "p03d-race-future", "2026-11-14",
      );
      const attempted = sessions().saveRegistration(
        org, future.session.id, TARGET, "attending", null, "p03d-actor",
      ).then(
        () => "unexpected-write-success",
        (error: unknown) => String(error),
      );
      continueDeletion();
      await deletion;
      const outcome = await attempted;
      expect(outcome).toMatch(/P03D_TEST_SUBJECT_WRITE_BLOCKED/);
      expect(await counters(org, TARGET)).toEqual({
        attendance: 0, registration: 0, history: 0,
      });
      expect(await counters(org, NEIGHBOR)).toEqual({
        attendance: 1, registration: 1, history: 1,
      });
    });
  });
}
