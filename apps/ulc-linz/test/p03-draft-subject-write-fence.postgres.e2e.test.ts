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

    it("S3: proxy write re-checks revoked target group enrollment and actor identity before SQL commit", async () => {
      const org = "p03e-proxy";
      const group = "p03e-proxy-group";
      const actorAthlete = "p03e-actor-athlete";
      const actorIdentity = "p03e-actor-identity";
      await db().client.unsafe(
        `INSERT INTO appbasis_training_group
          (id, organization_id, name, attendance_mode)
         VALUES ($1, $2, 'P03E Proxy Group', 'self_registration')`,
        [group, org],
      );
      for (const [id, first] of [
        [actorAthlete, "Proxy"],
        [TARGET, "Target"],
      ] as const) {
        await db().client.unsafe(
          `INSERT INTO appbasis_athlete
             (id, organization_id, first_name, last_name)
           VALUES ($1, $2, $3, 'Example')`,
          [id, org, first],
        );
        await db().client.unsafe(
          `INSERT INTO appbasis_athlete_group_membership
             (organization_id, athlete_id, group_id, started_on)
           VALUES ($1, $2, $3, '2026-01-01'::date)`,
          [org, id, group],
        );
      }
      await db().client.unsafe(
        `INSERT INTO ulc_linz_membership
           (identity_id, organization_id, subject_id, source_role)
         VALUES ($1, $2, $3, 'athlete')`,
        [actorIdentity, org, actorAthlete],
      );
      const session = await sessions().ensureScheduledSession(
        org, "kindertraining", group, "2026-11-13",
      );

      const saved = await sessions().saveRegistration(
        org, session.session.id, TARGET, "attending", null,
        actorIdentity, actorAthlete,
      );
      expect(saved.revision).toBe(1);
      await db().client.unsafe(
        `UPDATE appbasis_athlete_group_membership
         SET ended_on = '2026-11-12'::date
         WHERE organization_id = $1 AND group_id = $2 AND athlete_id = $3`,
        [org, group, TARGET],
      );
      await expect(sessions().saveRegistration(
        org, session.session.id, TARGET, "maybe", 1,
        actorIdentity, actorAthlete,
      )).rejects.toThrow();
      await db().client.unsafe(
        `UPDATE appbasis_athlete_group_membership
         SET ended_on = NULL
         WHERE organization_id = $1 AND group_id = $2 AND athlete_id = $3`,
        [org, group, TARGET],
      );
      await db().client.unsafe(
        `UPDATE ulc_linz_membership
         SET active = false, ended_at = now()
         WHERE identity_id = $1`,
        [actorIdentity],
      );
      await expect(sessions().saveRegistration(
        org, session.session.id, TARGET, "maybe", 1,
        actorIdentity, actorAthlete,
      )).rejects.toThrow();
      const rows = await db().client.unsafe(
        `SELECT revision, intention FROM ulc_linz_training_registration
         WHERE session_id = $1 AND athlete_id = $2`,
        [session.session.id, TARGET],
      );
      expect(rows[0]).toMatchObject({ revision: 1, intention: "attending" });
      const history = await db().client.unsafe(
        `SELECT count(*)::int AS total
         FROM ulc_linz_training_registration_change
         WHERE session_id = $1 AND athlete_id = $2`,
        [session.session.id, TARGET],
      );
      expect(history[0]?.total).toBe(1);
    });

    it("S4 gap: database repository still accepts trainer write after role revocation (not an HTTP proof)", async () => {
      const org = "p03e-revoked-trainer";
      const { input, session } = await fixture(org);
      const identity = "p03e-revoked-trainer-identity";
      await db().client.unsafe(
        `INSERT INTO ulc_linz_membership
          (identity_id, organization_id, subject_id, source_role)
         VALUES ($1, $2, $3, 'trainer')`,
        [identity, org, "p03e-trainer-subject"],
      );
      await db().client.unsafe(
        `UPDATE ulc_linz_membership
         SET active = false, ended_at = now()
         WHERE identity_id = $1`,
        [identity],
      );
      // No actor/principal parameter exists on saveSession. An authorized
      // HTTP handler MAY still refuse the request; this is strictly the
      // DB-repository authorization boundary under direct reuse.
      const replay = await sessions().saveSession(
        org, { ...input, note: "Repository accepted revoked trainer" },
        [{ athleteId: NEIGHBOR, status: "present" }],
        session.revision,
      );
      expect(replay.session.note).toBe("Repository accepted revoked trainer");
      expect(await counters(org, NEIGHBOR)).toMatchObject({
        attendance: 1, registration: 1, history: 1,
      });
    });

    it("S8 gap: shared session free text, other athlete history actor and trainer identity survive subject erasure", async () => {
      const org = "p03e-freetext";
      const { session } = await fixture(org);
      const deletedPersonName = "P03E Target Person";
      const deletedActorIdentity = "p03e-erased-person-identity";
      const historicalTrainerId = "p03e-departed-trainer";
      await db().client.unsafe(
        `UPDATE ulc_linz_training_session SET note = $1
         WHERE id = $2`,
        ["Trainer mentioned " + deletedPersonName, session.session.id],
      );
      await sessions().saveRegistration(
        org, session.session.id, NEIGHBOR, "maybe", 1,
        deletedActorIdentity, undefined, "Met " + deletedPersonName,
      );
      await db().client.unsafe(
        `INSERT INTO ulc_linz_training_trainer_attendance
          (organization_id, session_id, trainer_id)
         VALUES ($1, $2, $3)`,
        [org, session.session.id, historicalTrainerId],
      );
      await fenceSubject(org, TARGET);
      expect(await counters(org, TARGET)).toEqual({
        attendance: 0, registration: 0, history: 0,
      });

      const sharedNote = await db().client.unsafe(
        "SELECT note FROM ulc_linz_training_session WHERE id = $1",
        [session.session.id],
      );
      expect(String(sharedNote[0]?.note)).toContain(deletedPersonName);
      const related = await db().client.unsafe(
        `SELECT note, actor_identity_id
         FROM ulc_linz_training_registration_change
         WHERE organization_id = $1 AND session_id = $2
           AND athlete_id = $3 AND revision = 2`,
        [org, session.session.id, NEIGHBOR],
      );
      expect(related[0]?.note).toBe("Met " + deletedPersonName);
      expect(related[0]?.actor_identity_id).toBe(deletedActorIdentity);
      const trainer = await db().client.unsafe(
        `SELECT trainer_id FROM ulc_linz_training_trainer_attendance
         WHERE organization_id = $1 AND session_id = $2`,
        [org, session.session.id],
      );
      expect(trainer.map((row) => row.trainer_id)).toContain(historicalTrainerId);
      // Existing subject-count preflight is structurally correct, but it
      // cannot certify unrelated shared free text or trainer identity.
    });

  });
}
