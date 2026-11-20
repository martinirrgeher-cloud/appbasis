import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPostgresDatabase } from "@appbasis/database/postgres-provisioning";

import {
  PostgresUlcMarkedTrainingHistoryRehearsalRepository,
} from "../worker/training-subject-marked-history-rehearsal";
import {
  type UlcTrainingSubjectHistoryTransactionClient,
} from "../worker/training-subject-history-deletion-postgres";

const DATABASE_URL = process.env.DATABASE_URL;
const ORG = "p03-e-original-org";
const FOREIGN_ORG = "p03-e-foreign-org";
const TARGET = "p03-e-subject";
const NEIGHBOR = "p03-e-neighbor";
const TIMESTAMP = "2026-01-01T07:00:00Z";
const PURGE = "2026-02-05T07:00:00Z";

/**
 * P03-E is only legal on the disposable CI PostgreSQL service.
 * This test explicitly rejects provider URLs (even if supplied by accident).
 */
if (DATABASE_URL) {
  const target = new URL(DATABASE_URL);
  if (
    !["localhost", "127.0.0.1", "::1"].includes(target.hostname) ||
    target.username !== "postgres" ||
    target.port !== "5432" ||
    target.pathname !== "/appbasis_identity_e2e"
  ) {
    throw new Error("P03-E canonical erasure rehearsal requires local PostgreSQL only.");
  }
}

if (!DATABASE_URL) {
  describe.skip("P03-E canonical marked training erasure PostgreSQL integration", () => {
    it("requires local DATABASE_URL; skip is NOT an E2E PASS", () => {});
  });
} else {
  describe("P03-E canonical marked training erasure PostgreSQL integration", () => {
    const admin = createPostgresDatabase(DATABASE_URL);
    const name = "ulc_p03_e_" + randomUUID().replaceAll("-", "").slice(0, 12);
    const url = new URL(DATABASE_URL);
    url.pathname = "/" + name;
    let database: ReturnType<typeof createPostgresDatabase> | null = null;
    let created = false;

    function db() {
      if (!database) throw new Error("P03-E isolated database not initialized.");
      return database;
    }

    function client(
      intercept?: (sql: string) => Promise<void>,
    ): UlcTrainingSubjectHistoryTransactionClient {
      return {
        unsafe(sql, parameters) {
          return db().client.unsafe(sql, parameters);
        },
        begin(callback) {
          return db().client.begin(async tx => callback({
            async unsafe(sql, parameters) {
              const rows = await tx.unsafe(sql, parameters);
              if (intercept) await intercept(sql);
              return rows;
            },
          }));
        },
      };
    }

    function repository(
      intercept?: (sql: string) => Promise<void>,
    ) {
      return new PostgresUlcMarkedTrainingHistoryRehearsalRepository(
        client(intercept),
      );
    }

    async function sqlFile(path: string) {
      const sql = await readFile(new URL(path, import.meta.url), "utf8");
      for (const statement of sql.split("--> statement-breakpoint")) {
        if (statement.trim()) await db().client.unsafe(statement);
      }
    }

    async function seed(
      organization: string,
      session: string,
      athlete: string,
      suffix: string,
    ) {
      await db().client.unsafe(
        `INSERT INTO ulc_linz_training_attendance
          (organization_id, session_id, athlete_id, status)
          VALUES ($1, $2, $3, 'present')`,
        [organization, session, athlete],
      );
      await db().client.unsafe(
        `INSERT INTO ulc_linz_training_registration
          (organization_id, session_id, athlete_id, intention, updated_by_identity_id)
          VALUES ($1, $2, $3, 'attending', 'p03-e-actor')`,
        [organization, session, athlete],
      );
      await db().client.unsafe(
        `INSERT INTO ulc_linz_training_registration_change
          (id, organization_id, session_id, athlete_id, intention, revision, actor_identity_id)
          VALUES ($1, $2, $3, $4, 'attending', 1, 'p03-e-actor')`,
        ["change-" + suffix, organization, session, athlete],
      );
    }

    async function canonicalMarker(organization: string = ORG) {
      await db().client.unsafe(
        `INSERT INTO appbasis_athletes_deletion
          (entity_type, entity_id, organization_id, completed_at, purge_after)
          VALUES ('athlete', $1, $2, $3::timestamptz, $4::timestamptz)`,
        [TARGET, organization, TIMESTAMP, PURGE],
      );
    }

    async function counts(organization: string, athlete: string) {
      const rows = await db().client.unsafe(
        `SELECT
          (SELECT count(*)::int FROM ulc_linz_training_attendance
            WHERE organization_id=$1 AND athlete_id=$2) AS attendance,
          (SELECT count(*)::int FROM ulc_linz_training_registration
            WHERE organization_id=$1 AND athlete_id=$2) AS registration,
          (SELECT count(*)::int FROM ulc_linz_training_registration_change
            WHERE organization_id=$1 AND athlete_id=$2) AS history`,
        [organization, athlete],
      );
      return rows[0];
    }

    async function appMarkerCount() {
      const rows = await db().client.unsafe(
        "SELECT count(*)::int AS total FROM ulc_linz_training_subject_deletion",
      );
      return Number(rows[0]?.total);
    }

    beforeAll(async () => {
      const version = await admin.client.unsafe("SHOW server_version_num");
      if (Number(version[0]?.server_version_num) < 180000) {
        throw new Error("P03-E requires PostgreSQL 18.");
      }
      await admin.client.unsafe("CREATE DATABASE " + name);
      created = true;
      database = createPostgresDatabase(url.toString());
      for (const file of [
        "../../../modules/athletes/migrations/0001_appbasis_athletes_deletion_markers.sql",
        "../migrations/0004_ulc_linz_training_sessions.sql",
        "../migrations/0008_ulc_linz_session_registration.sql",
        "../migrations/0010_ulc_linz_registration_notes.sql",
        "./fixtures/p03-d-training-subject-write-fence.candidate.sql",
      ]) {
        await sqlFile(file);
      }
    });

    beforeEach(async () => {
      await db().client.unsafe(
        `TRUNCATE TABLE
          ulc_linz_training_registration_change,
          ulc_linz_training_registration,
          ulc_linz_training_attendance,
          ulc_linz_training_subject_deletion,
          ulc_linz_training_session,
          appbasis_athletes_deletion`,
      );
      for (const [organization, session] of [
        [ORG, "p03-e-session"],
        [FOREIGN_ORG, "p03-e-foreign-session"],
      ] as const) {
        await db().client.unsafe(
          `INSERT INTO ulc_linz_training_session
            (id, organization_id, module_id, group_id, session_date, note)
            VALUES ($1, $2, 'u12', 'p03-e-group', '2026-10-12', 'Shared session note')`,
          [session, organization],
        );
      }
      await seed(ORG, "p03-e-session", TARGET, "target");
      await seed(ORG, "p03-e-session", NEIGHBOR, "neighbor");
      await seed(FOREIGN_ORG, "p03-e-foreign-session", TARGET, "foreign");
    });

    afterAll(async () => {
      if (database) {
        await database.client.end();
        database = null;
      }
      if (created) {
        await admin.client.unsafe("DROP DATABASE " + name + " WITH (FORCE)");
      }
      await admin.client.end();
    });

    it("rejects missing, foreign-org or invalid scoped canonical deletion authority", async () => {
      await expect(repository().markAndEraseOnIsolatedStore(ORG, TARGET))
        .rejects.toThrow(/canonical athlete deletion authority missing/);
      await canonicalMarker(FOREIGN_ORG);
      await expect(repository().markAndEraseOnIsolatedStore(ORG, TARGET))
        .rejects.toThrow(/canonical athlete deletion authority missing/);
      for (const organization of ["", " p03-e-original-org", "other\u0000org"]) {
        await expect(repository().markAndEraseOnIsolatedStore(organization, TARGET))
          .rejects.toThrow(/scope is invalid/);
      }
      expect(await appMarkerCount()).toBe(0);
      expect(await counts(ORG, TARGET)).toEqual({
        attendance: 1, registration: 1, history: 1,
      });
    });

    it("copies canonical marker and atomically erases only exact subject; repeat is idempotent", async () => {
      await canonicalMarker();
      await expect(repository().markAndEraseOnIsolatedStore(ORG, TARGET))
        .resolves.toEqual({
          markerInserted: true,
          deletedAttendanceRows: 1,
          deletedRegistrationRows: 1,
          deletedRegistrationHistoryRows: 1,
        });
      expect(await appMarkerCount()).toBe(1);
      expect(await counts(ORG, TARGET)).toEqual({
        attendance: 0, registration: 0, history: 0,
      });
      expect(await counts(ORG, NEIGHBOR)).toEqual({
        attendance: 1, registration: 1, history: 1,
      });
      expect(await counts(FOREIGN_ORG, TARGET)).toEqual({
        attendance: 1, registration: 1, history: 1,
      });
      const marker = await db().client.unsafe(
        `SELECT completed_at, purge_after FROM ulc_linz_training_subject_deletion
          WHERE organization_id=$1 AND athlete_id=$2`,
        [ORG, TARGET],
      );
      expect(new Date(marker[0]?.completed_at as string).toISOString())
        .toBe("2026-01-01T07:00:00.000Z");
      expect(new Date(marker[0]?.purge_after as string).toISOString())
        .toBe("2026-02-05T07:00:00.000Z");
      await expect(repository().markAndEraseOnIsolatedStore(ORG, TARGET))
        .resolves.toEqual({
          markerInserted: false,
          deletedAttendanceRows: 0,
          deletedRegistrationRows: 0,
          deletedRegistrationHistoryRows: 0,
        });
      // Expired marker still blocks stale writers; a 35-day clock must not
      // silently erase No-Resurrection authority before backup expiry.
      await expect(db().client.unsafe(
        `INSERT INTO ulc_linz_training_registration
          (organization_id, session_id, athlete_id, intention, updated_by_identity_id)
          VALUES ($1, 'p03-e-session', $2, 'attending', 'old-phone')`,
        [ORG, TARGET],
      )).rejects.toThrow(/deletion marker/i);
    });

    it("rolls back both marker and all deletes on a mid-erasure failure", async () => {
      await canonicalMarker();
      let failed = false;
      const interrupted = repository(async sql => {
        if (!failed && sql.includes("DELETE FROM ulc_linz_training_registration\n")) {
          failed = true;
          throw new Error("P03-E_SYNTHETIC_STORAGE_FAULT");
        }
      });
      await expect(interrupted.markAndEraseOnIsolatedStore(ORG, TARGET))
        .rejects.toThrow("P03-E_SYNTHETIC_STORAGE_FAULT");
      expect(failed).toBe(true);
      expect(await appMarkerCount()).toBe(0);
      expect(await counts(ORG, TARGET)).toEqual({
        attendance: 1, registration: 1, history: 1,
      });
      await expect(repository().markAndEraseOnIsolatedStore(ORG, TARGET))
        .resolves.toMatchObject({ markerInserted: true });
      expect(await counts(ORG, TARGET)).toEqual({
        attendance: 0, registration: 0, history: 0,
      });
    });

    it("rejects a preexisting marker with a different canonical deletion timestamp", async () => {
      await canonicalMarker();
      await db().client.unsafe(
        `INSERT INTO ulc_linz_training_subject_deletion
           (organization_id, athlete_id, completed_at, purge_after)
         VALUES ($1, $2, '2025-12-31T07:00:00Z', '2026-02-04T07:00:00Z')`,
        [ORG, TARGET],
      );
      await expect(repository().markAndEraseOnIsolatedStore(ORG, TARGET))
        .rejects.toThrow(/marker is inconsistent with canonical owner/);
      expect(await appMarkerCount()).toBe(1);
      expect(await counts(ORG, TARGET)).toEqual({
        attendance: 1, registration: 1, history: 1,
      });
    });

    it("serializes an overlapping old SQL writer behind marker+erasure commit", async () => {
      await canonicalMarker();
      let reached!: () => void;
      let resume!: () => void;
      const atMarker = new Promise<void>(resolve => { reached = resolve; });
      const held = new Promise<void>(resolve => { resume = resolve; });
      const fenced = repository(async sql => {
        if (sql.includes("INSERT INTO ulc_linz_training_subject_deletion")) {
          reached();
          await held;
        }
      });
      const erasure = fenced.markAndEraseOnIsolatedStore(ORG, TARGET);
      await atMarker;
      // Concurrent SQL on another connection: the P03-D trigger must
      // wait on the same advisory key, then observe the committed marker.
      const staleWrite = Promise.resolve(db().client.unsafe(
        `INSERT INTO ulc_linz_training_attendance
          (organization_id, session_id, athlete_id, status)
          VALUES ($1, 'p03-e-session', $2, 'present')
          ON CONFLICT (session_id, athlete_id)
          DO UPDATE SET status='present'`,
        [ORG, TARGET],
      ));
      const denied = expect(staleWrite).rejects.toThrow(/deletion marker/i);
      resume();
      await expect(erasure).resolves.toMatchObject({
        markerInserted: true,
        deletedAttendanceRows: 1,
      });
      await denied;
      expect(await counts(ORG, TARGET)).toEqual({
        attendance: 0, registration: 0, history: 0,
      });
    });
  });
}
