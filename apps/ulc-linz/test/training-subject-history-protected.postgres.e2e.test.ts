import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPostgresDatabase } from "@appbasis/database/postgres-provisioning";

import {
  PostgresUlcTrainingSubjectProtectedHistoryRepository,
} from "../worker/training-subject-history-protected-postgres";
import type {
  UlcTrainingSubjectHistoryTransactionClient,
} from "../worker/training-subject-history-deletion-postgres";
import {
  PostgresUlcTrainingSubjectPrivacyInspector,
} from "../worker/training-subject-privacy-postgres";

const url = process.env.DATABASE_URL;
const ORG = "org-protected-history";
const OTHER_ORG = "org-protected-neighbor";
const SUBJECT = "athlete-removed";
const OTHER_SUBJECT = "athlete-surviving";

if (!url || !url.trim()) {
  describe.skip("ULC v19-protected training history PostgreSQL E2E", () => {
    it("requires DATABASE_URL", () => {});
  });
} else {
  describe("ULC v19-protected training history PostgreSQL E2E", () => {
    const admin = createPostgresDatabase(url);
    const databaseName = "ulc_guarded_history_" + randomUUID().replaceAll("-", "").slice(0, 12);
    const isolatedUrl = new URL(url);
    isolatedUrl.pathname = "/" + databaseName;
    let connection: ReturnType<typeof createPostgresDatabase> | null = null;
    let created = false;

    function db() {
      if (!connection) throw new Error("Isolated guarded training-history DB unavailable.");
      return connection;
    }

    function repository(
      wrapper?: (
        query: string,
        params: (string | number | boolean | null)[] | undefined,
        delegate: (query: string, params?: (string | number | boolean | null)[]) =>
          PromiseLike<readonly Record<string, unknown>[]>,
      ) => PromiseLike<readonly Record<string, unknown>[]>,
    ) {
      const sql: UlcTrainingSubjectHistoryTransactionClient = {
        unsafe(query, params) { return db().client.unsafe(query, params); },
        begin(callback) {
          return db().client.begin(async (tx) => callback({
            unsafe(query, params) {
              const delegate = (text: string, values?: (string | number | boolean | null)[]) =>
                tx.unsafe(text, values);
              return wrapper ? wrapper(query, params, delegate) : delegate(query, params);
            },
          }));
        },
      };
      return new PostgresUlcTrainingSubjectProtectedHistoryRepository(sql);
    }

    async function applyMigration(relativePath: string) {
      const text = await readFile(new URL(relativePath, import.meta.url), "utf8");
      for (const sql of text.split("--> statement-breakpoint").map(x => x.trim()).filter(Boolean)) {
        await db().client.unsafe(sql);
      }
    }

    const sourceAt = new Date(Date.now() - 60 * 60 * 1000);

    beforeAll(async () => {
      await admin.client.unsafe("CREATE DATABASE " + databaseName);
      created = true;
      connection = createPostgresDatabase(isolatedUrl.toString());
      for (const migration of [
        "../migrations/0004_ulc_linz_training_sessions.sql",
        "../migrations/0008_ulc_linz_session_registration.sql",
        "../migrations/0017_ulc_linz_training_subject_write_fence.sql",
        "../migrations/0018_ulc_linz_training_subject_isolation_reconciliation.sql",
      ]) await applyMigration(migration);
    });

    beforeEach(async () => {
      await db().client.unsafe(
        `TRUNCATE ulc_linz_training_subject_deletion,
          ulc_linz_training_registration_change,
          ulc_linz_training_registration,
          ulc_linz_training_attendance,
          ulc_linz_training_session`,
      );
      for (const [org, session] of [
        [ORG, "session-private"], [OTHER_ORG, "session-neighbor"],
      ] as const) {
        await db().client.unsafe(
          `INSERT INTO ulc_linz_training_session
             (id, organization_id, module_id, group_id, session_date, note)
           VALUES ($1, $2, 'kindertraining', $1, '2026-10-26'::date, 'Shared session retained')`,
          [session, org],
        );
      }
      for (const [org, session, athlete] of [
        [ORG, "session-private", SUBJECT],
        [ORG, "session-private", OTHER_SUBJECT],
        [OTHER_ORG, "session-neighbor", SUBJECT],
      ] as const) {
        await db().client.unsafe(
          `INSERT INTO ulc_linz_training_attendance
             (organization_id, session_id, athlete_id, status)
           VALUES ($1, $2, $3, 'present')`,
          [org, session, athlete],
        );
        await db().client.unsafe(
          `INSERT INTO ulc_linz_training_registration
             (organization_id, session_id, athlete_id, intention, updated_by_identity_id)
           VALUES ($1, $2, $3, 'attending', 'trainer-test')`,
          [org, session, athlete],
        );
      }
      for (const [id, org, session, athlete, revision] of [
        ["removed-1", ORG, "session-private", SUBJECT, 1],
        ["removed-2", ORG, "session-private", SUBJECT, 2],
        ["other-1", ORG, "session-private", OTHER_SUBJECT, 1],
        ["foreign-1", OTHER_ORG, "session-neighbor", SUBJECT, 1],
      ] as const) {
        await db().client.unsafe(
          `INSERT INTO ulc_linz_training_registration_change
             (id, organization_id, session_id, athlete_id,
              intention, revision, actor_identity_id)
           VALUES ($1, $2, $3, $4, 'attending', $5, 'trainer-test')`,
          [id, org, session, athlete, revision],
        );
      }
    });

    afterAll(async () => {
      if (connection) {
        await connection.client.end();
        connection = null;
      }
      if (created) {
        await admin.client.unsafe("DROP DATABASE " + databaseName + " WITH (FORCE)");
      }
      await admin.client.end();
    });

    it("atomically marks and erases all three app-owned history tables and denies recreation", async () => {
      const inspect = new PostgresUlcTrainingSubjectPrivacyInspector(db().client);
      await expect(inspect.inspectSubjectPrivacy(ORG, SUBJECT)).resolves.toMatchObject({
        attendanceRows: 1, registrationRows: 1, registrationHistoryRows: 2,
      });
      await expect(repository().markSubjectDeletedAndEraseHistory(ORG, SUBJECT, sourceAt))
        .resolves.toEqual({
          markerInserted: true,
          deletedAttendanceRows: 1,
          deletedRegistrationRows: 1,
          deletedRegistrationHistoryRows: 2,
        });
      await expect(inspect.inspectSubjectPrivacy(ORG, SUBJECT)).resolves.toMatchObject({
        attendanceRows: 0, registrationRows: 0, registrationHistoryRows: 0,
      });
      await expect(inspect.inspectSubjectPrivacy(ORG, OTHER_SUBJECT)).resolves.toMatchObject({
        attendanceRows: 1, registrationRows: 1, registrationHistoryRows: 1,
      });
      await expect(inspect.inspectSubjectPrivacy(OTHER_ORG, SUBJECT)).resolves.toMatchObject({
        attendanceRows: 1, registrationRows: 1, registrationHistoryRows: 1,
      });
      const sessions = await db().client.unsafe("SELECT id FROM ulc_linz_training_session ORDER BY id");
      expect(sessions.map(x => x.id)).toEqual(["session-neighbor", "session-private"]);

      const recreate = [
        `INSERT INTO ulc_linz_training_attendance
          (organization_id, session_id, athlete_id, status)
          VALUES ($1,'session-private',$2,'present')`,
        `INSERT INTO ulc_linz_training_registration
          (organization_id, session_id, athlete_id, intention, updated_by_identity_id)
          VALUES ($1,'session-private',$2,'attending','trainer-test')`,
        `INSERT INTO ulc_linz_training_registration_change
          (id, organization_id, session_id, athlete_id, intention, revision, actor_identity_id)
          VALUES ('removed-new',$1,'session-private',$2,'attending',3,'trainer-test')`,
      ];
      for (const sql of recreate) {
        await expect(db().client.unsafe(sql, [ORG, SUBJECT]))
          .rejects.toThrow(/deletion marker/);
      }
      // Unmarked subject remains writable in the SAME organization.
      const neighbor = await db().client.unsafe(
        `INSERT INTO ulc_linz_training_attendance
           (organization_id, session_id, athlete_id, status)
         VALUES ($1,'session-private','athlete-new','present')
         RETURNING athlete_id`, [ORG],
      );
      expect(neighbor).toHaveLength(1);

      // Same canonical source replay is idempotent and keeps the DB fence.
      await expect(repository().markSubjectDeletedAndEraseHistory(ORG, SUBJECT, sourceAt))
        .resolves.toEqual({
          markerInserted: false,
          deletedAttendanceRows: 0,
          deletedRegistrationRows: 0,
          deletedRegistrationHistoryRows: 0,
        });
    });

    it("rolls back the marker AND previous deletes if any owner query fails", async () => {
      let injected = false;
      const faulty = repository((query, params, delegate) => {
        if (!injected && query.includes("DELETE FROM ulc_linz_training_registration\n")) {
          injected = true;
          throw new Error("synthetic registration delete failure");
        }
        return delegate(query, params);
      });
      await expect(faulty.markSubjectDeletedAndEraseHistory(ORG, SUBJECT, sourceAt))
        .rejects.toThrow(/synthetic registration delete failure/);
      expect(injected).toBe(true);
      const markers = await db().client.unsafe(
        "SELECT count(*)::int AS total FROM ulc_linz_training_subject_deletion",
      );
      expect(markers[0]?.total).toBe(0);
      await expect(new PostgresUlcTrainingSubjectPrivacyInspector(db().client)
        .inspectSubjectPrivacy(ORG, SUBJECT)).resolves.toMatchObject({
        attendanceRows: 1, registrationRows: 1, registrationHistoryRows: 2,
      });
      await expect(repository().markSubjectDeletedAndEraseHistory(ORG, SUBJECT, sourceAt))
        .resolves.toMatchObject({ markerInserted: true, deletedRegistrationHistoryRows: 2 });
    });

    it("refuses incorrect/expired source and conflicting marker without touching other subjects", async () => {
      await expect(repository().markSubjectDeletedAndEraseHistory(ORG, SUBJECT,
        new Date(Date.now() - 36 * 24 * 60 * 60 * 1000))).rejects.toThrow(/current/);
      await expect(repository().markSubjectDeletedAndEraseHistory(
        "bad ", SUBJECT, sourceAt,
      )).rejects.toThrow(/scope/);
      await repository().markSubjectDeletedAndEraseHistory(ORG, SUBJECT, sourceAt);
      await expect(repository().markSubjectDeletedAndEraseHistory(
        ORG, SUBJECT, new Date(sourceAt.getTime() + 1000),
      )).rejects.toThrow(/conflicts/);
      await expect(new PostgresUlcTrainingSubjectPrivacyInspector(db().client)
        .inspectSubjectPrivacy(ORG, OTHER_SUBJECT)).resolves.toMatchObject({
        attendanceRows: 1, registrationRows: 1, registrationHistoryRows: 1,
      });
    });

    it("refuses to mutate when any required v19 trigger is unavailable", async () => {
      await db().client.unsafe(
        "ALTER TABLE ulc_linz_training_registration_change DISABLE TRIGGER ulc_linz_training_registration_change_subject_fence",
      );
      try {
        await expect(repository().markSubjectDeletedAndEraseHistory(ORG, SUBJECT, sourceAt))
          .rejects.toThrow(/all three v19 fences/);
        const markers = await db().client.unsafe(
          "SELECT count(*)::int AS total FROM ulc_linz_training_subject_deletion",
        );
        expect(markers[0]?.total).toBe(0);
      } finally {
        await db().client.unsafe(
          "ALTER TABLE ulc_linz_training_registration_change ENABLE TRIGGER ulc_linz_training_registration_change_subject_fence",
        );
      }
    });
  });
}
