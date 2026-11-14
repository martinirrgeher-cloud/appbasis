import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresDatabase } from "@appbasis/database/postgres-provisioning";

import {
  PostgresUlcTrainingSessionRepository,
} from "../worker/training-session-postgres";
import {
  PostgresUlcTrainingSubjectFrozenHistoryRepository,
  type UlcTrainingSubjectHistoryTransactionClient,
} from "../worker/training-subject-history-deletion-postgres";
import { PostgresUlcTrainingSubjectPrivacyInspector } from "../worker/training-subject-privacy-postgres";

/**
 * P03-C – REAL PostgreSQL, isolated database, CURRENT-VULNERABILITY PROOF.
 *
 * The expected successes below are explicitly UNSAFE post-deletion writes,
 * NOT security acceptance tests. Replace these expectations with database-
 * enforced write denials only in a separately approved security implementation.
 * No production migration, runtime route, or live deletion is changed here.
 */
const DATABASE_URL = process.env.DATABASE_URL;
const TARGET = "p03-stale-target";
const NEIGHBOR = "p03-stale-neighbor";

type Manifest = { owners: readonly { migrations: readonly string[] }[] };

if (!DATABASE_URL) {
  describe.skip("ULC P03-C stale training writer PostgreSQL proof", () => {
    it("requires DATABASE_URL", () => {});
  });
} else {
  describe("ULC P03-C stale training writer PostgreSQL proof", () => {
    const admin = createPostgresDatabase(DATABASE_URL);
    const name = "ulc_p03_stale_" + randomUUID().replaceAll("-", "").slice(0, 12);
    const isolatedUrl = new URL(DATABASE_URL);
    isolatedUrl.pathname = "/" + name;
    let database: ReturnType<typeof createPostgresDatabase> | null = null;
    let created = false;

    function db() {
      if (!database) throw new Error("Isolated P03-C PostgreSQL database unavailable.");
      return database;
    }

    function sessions() {
      return new PostgresUlcTrainingSessionRepository(
        db().client, () => randomUUID(),
      );
    }

    function frozenHistory() {
      const client: UlcTrainingSubjectHistoryTransactionClient = {
        unsafe(query, parameters) {
          return db().client.unsafe(query, parameters);
        },
        begin(callback) {
          return db().client.begin(async (transaction) => callback({
            unsafe(query, parameters) {
              return transaction.unsafe(query, parameters);
            },
          }));
        },
      };
      return new PostgresUlcTrainingSubjectFrozenHistoryRepository(client);
    }

    async function fixture(org: string, note?: string) {
      const input = {
        moduleId: "u12" as const,
        groupId: "p03-u12",
        sessionDate: "2026-11-12",
        ...(note === undefined ? {} : { note }),
      };
      const session = await sessions().saveSession(org, input, [
        { athleteId: TARGET, status: "present" },
        { athleteId: NEIGHBOR, status: "present" },
      ], null);
      const s = sessions();
      await s.saveRegistration(
        org, session.session.id, TARGET, "attending", null, "p03-actor-target",
      );
      await s.saveRegistration(
        org, session.session.id, NEIGHBOR, "attending", null, "p03-actor-neighbor",
      );
      return { input, session };
    }

    beforeAll(async () => {
      await admin.client.unsafe("CREATE DATABASE " + name);
      created = true;
      database = createPostgresDatabase(isolatedUrl.toString());

      const manifest = JSON.parse(await readFile(
        new URL("../appbasis.database.json", import.meta.url), "utf8",
      )) as Manifest;
      const migrations = manifest.owners.flatMap((owner) => owner.migrations);
      if (
        migrations.length < 41 ||
        new Set(migrations).size !== migrations.length ||
        !migrations.some((p) => p.endsWith("0004_ulc_linz_training_sessions.sql")) ||
        !migrations.some((p) => p.endsWith("0008_ulc_linz_session_registration.sql"))
      ) {
        throw new Error("P03-C needs the complete unique ULC owned migration manifest.");
      }
      for (const migration of migrations) {
        const sql = await readFile(
          new URL("../../../" + migration, import.meta.url), "utf8",
        );
        for (const statement of sql.split("--> statement-breakpoint")) {
          if (statement.trim() !== "") await db().client.unsafe(statement);
        }
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

    it("S1: old trainer attendance snapshot can currently reinsert the erased athlete", async () => {
      const org = "p03-stale-trainer";
      const foreign = "p03-stale-trainer-other";
      const { input, session } = await fixture(org, "Session note may name P03 Target");
      await fixture(foreign, "Foreign organization retained");

      await expect(frozenHistory().eraseSubjectHistoryOnFrozenStore(org, TARGET))
        .resolves.toEqual({
          deletedAttendanceRows: 1,
          deletedRegistrationRows: 1,
          deletedRegistrationHistoryRows: 1,
        });
      const inspector = new PostgresUlcTrainingSubjectPrivacyInspector(db().client);
      await expect(inspector.inspectSubjectPrivacy(org, TARGET))
        .resolves.toMatchObject({
          attendanceRows: 0, registrationRows: 0, registrationHistoryRows: 0,
        });
      // The trainer had a valid session revision before deletion. Erasing
      // app-owned rows does not invalidate that revision or install a DB fence.
      const replay = await sessions().saveSession(org, input, [
        { athleteId: TARGET, status: "present" },
        { athleteId: NEIGHBOR, status: "present" },
      ], session.revision);
      expect(replay.attendance.some((a) => a.athleteId === TARGET)).toBe(true);
      await expect(inspector.inspectSubjectPrivacy(org, TARGET))
        .resolves.toMatchObject({
          attendanceRows: 1, registrationRows: 0, registrationHistoryRows: 0,
        });
      await expect(inspector.inspectSubjectPrivacy(org, NEIGHBOR))
        .resolves.toMatchObject({
          attendanceRows: 1, registrationRows: 1, registrationHistoryRows: 1,
        });
      await expect(inspector.inspectSubjectPrivacy(foreign, TARGET))
        .resolves.toMatchObject({
          attendanceRows: 1, registrationRows: 1, registrationHistoryRows: 1,
        });
      const root = await db().client.unsafe(
        "SELECT note FROM ulc_linz_training_session WHERE id = $1",
        [session.session.id],
      );
      expect(root[0]?.note).toBe("Session note may name P03 Target");
    });

    it("S2: stale self-registration currently recreates the row AND change history", async () => {
      const org = "p03-stale-registration";
      const { session } = await fixture(org);
      await frozenHistory().eraseSubjectHistoryOnFrozenStore(org, TARGET);

      const saved = await sessions().saveRegistration(
        org, session.session.id, TARGET, "not_attending", null,
        "p03-actor-target", undefined, "Replayed stale athlete note",
      );
      expect(saved).toMatchObject({
        athleteId: TARGET, intention: "not_attending", revision: 1,
        note: "Replayed stale athlete note",
      });
      const inspector = new PostgresUlcTrainingSubjectPrivacyInspector(db().client);
      await expect(inspector.inspectSubjectPrivacy(org, TARGET))
        .resolves.toMatchObject({
          attendanceRows: 0, registrationRows: 1, registrationHistoryRows: 1,
        });
      await expect(inspector.inspectSubjectPrivacy(org, NEIGHBOR))
        .resolves.toMatchObject({
          attendanceRows: 1, registrationRows: 1, registrationHistoryRows: 1,
        });
    });

    it("S5: direct SQL reinsert remains possible without an app-owned deletion marker", async () => {
      const org = "p03-direct-sql";
      const { session } = await fixture(org);
      await frozenHistory().eraseSubjectHistoryOnFrozenStore(org, TARGET);

      const attendance = await db().client.unsafe(
        `INSERT INTO ulc_linz_training_attendance
           (organization_id, session_id, athlete_id, status)
         VALUES ($1, $2, $3, 'present') RETURNING athlete_id`,
        [org, session.session.id, TARGET],
      );
      const registration = await db().client.unsafe(
        `INSERT INTO ulc_linz_training_registration
           (organization_id, session_id, athlete_id, intention, updated_by_identity_id)
         VALUES ($1, $2, $3, 'attending', 'p03-stale-identity') RETURNING athlete_id`,
        [org, session.session.id, TARGET],
      );
      const change = await db().client.unsafe(
        `INSERT INTO ulc_linz_training_registration_change
           (id, organization_id, session_id, athlete_id,
            intention, revision, actor_identity_id)
         VALUES ($1, $2, $3, $4, 'attending', 1, 'p03-stale-identity')
         RETURNING athlete_id`,
        [randomUUID(), org, session.session.id, TARGET],
      );
      expect(attendance).toHaveLength(1);
      expect(registration).toHaveLength(1);
      expect(change).toHaveLength(1);
      const inspector = new PostgresUlcTrainingSubjectPrivacyInspector(db().client);
      await expect(inspector.inspectSubjectPrivacy(org, TARGET))
        .resolves.toMatchObject({
          attendanceRows: 1, registrationRows: 1, registrationHistoryRows: 1,
        });
    });
  });
}
