import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPostgresDatabase } from "@appbasis/database/postgres-provisioning";

import {
  PostgresUlcTrainingSubjectFrozenHistoryRepository,
  type UlcTrainingSubjectHistoryTransactionClient,
} from "../worker/training-subject-history-deletion-postgres";
import { PostgresUlcTrainingSubjectPrivacyInspector } from "../worker/training-subject-privacy-postgres";

const url = process.env.DATABASE_URL;
const ORG = "org-history-privacy";
const OTHER_ORG = "org-history-neighbor";
const SUBJECT = "athlete-erased";
const OTHER_SUBJECT = "athlete-survivor";

if (url === undefined || url.trim().length === 0) {
  describe.skip("ULC frozen training-history PostgreSQL E2E", () => {
    it("requires DATABASE_URL", () => {});
  });
} else {
  describe("ULC frozen training-history PostgreSQL E2E", () => {
    const admin = createPostgresDatabase(url);
    const databaseName = "ulc_training_subject_" +
      randomUUID().replaceAll("-", "").slice(0, 12);
    const isolatedUrl = new URL(url);
    isolatedUrl.pathname = "/" + databaseName;
    let connection: ReturnType<typeof createPostgresDatabase> | null = null;
    let created = false;

    function db() {
      if (connection === null) {
        throw new Error("Isolated ULC training-history DB unavailable.");
      }
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
      return new PostgresUlcTrainingSubjectFrozenHistoryRepository(sql);
    }

    beforeAll(async () => {
      await admin.client.unsafe("CREATE DATABASE " + databaseName);
      created = true;
      connection = createPostgresDatabase(isolatedUrl.toString());
      for (const file of [
        "../migrations/0004_ulc_linz_training_sessions.sql",
        "../migrations/0008_ulc_linz_session_registration.sql",
      ]) {
        await db().client.unsafe(await readFile(new URL(file, import.meta.url), "utf8"));
      }
    });

    beforeEach(async () => {
      await db().client.unsafe(
        `TRUNCATE TABLE ulc_linz_training_registration_change,
          ulc_linz_training_registration, ulc_linz_training_attendance,
          ulc_linz_training_session`,
      );
      for (const [org, session] of [
        [ORG, "session-private"], [OTHER_ORG, "session-neighbor"],
      ] as const) {
        await db().client.unsafe(
          `INSERT INTO ulc_linz_training_session
             (id, organization_id, module_id, group_id, session_date, note)
           VALUES ($1, $2, 'kindertraining', $1, '2026-10-26'::date, 'Keep shared session')`,
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
           VALUES ($1, $2, $3, 'attending', 'registered-by-trainer')`,
          [org, session, athlete],
        );
      }
      for (const [id, org, session, athlete, revision] of [
        ["change-private-1", ORG, "session-private", SUBJECT, 1],
        ["change-private-2", ORG, "session-private", SUBJECT, 2],
        ["change-other", ORG, "session-private", OTHER_SUBJECT, 1],
        ["change-foreign", OTHER_ORG, "session-neighbor", SUBJECT, 1],
      ] as const) {
        await db().client.unsafe(
          `INSERT INTO ulc_linz_training_registration_change
             (id, organization_id, session_id, athlete_id,
              intention, revision, actor_identity_id)
           VALUES ($1, $2, $3, $4, 'attending', $5, 'registered-by-trainer')`,
          [id, org, session, athlete, revision],
        );
      }
    });

    afterAll(async () => {
      if (connection !== null) {
        await connection.client.end();
        connection = null;
      }
      if (created) {
        await admin.client.unsafe(
          "DROP DATABASE " + databaseName + " WITH (FORCE)",
        );
      }
      await admin.client.end();
    });

    it("deletes only the exact org+subject across all three owners, preserving shared sessions", async () => {
      const inspect = new PostgresUlcTrainingSubjectPrivacyInspector(db().client);
      await expect(inspect.inspectSubjectPrivacy(ORG, SUBJECT)).resolves.toMatchObject({
        attendanceRows: 1, registrationRows: 1, registrationHistoryRows: 2,
      });

      await expect(repository().eraseSubjectHistoryOnFrozenStore(ORG, SUBJECT))
        .resolves.toEqual({
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
      const sessionRows = await db().client.unsafe(
        "SELECT id, note FROM ulc_linz_training_session ORDER BY id",
      );
      expect(sessionRows.map(row => row.id)).toEqual([
        "session-neighbor", "session-private",
      ]);
      expect(sessionRows.every(row => row.note === "Keep shared session")).toBe(true);

      await expect(repository().eraseSubjectHistoryOnFrozenStore(ORG, SUBJECT))
        .resolves.toEqual({
          deletedAttendanceRows: 0,
          deletedRegistrationRows: 0,
          deletedRegistrationHistoryRows: 0,
        });
    });

    it("rolls back every previous DELETE when a later owner query fails", async () => {
      let failed = false;
      const repositoryWithFault = repository((query, params, delegate) => {
        if (!failed && query.includes("DELETE FROM ulc_linz_training_registration\n")) {
          failed = true;
          throw new Error("injected registration storage failure");
        }
        return delegate(query, params);
      });
      await expect(repositoryWithFault.eraseSubjectHistoryOnFrozenStore(ORG, SUBJECT))
        .rejects.toThrow(/registration storage failure/);
      expect(failed).toBe(true);
      await expect(new PostgresUlcTrainingSubjectPrivacyInspector(db().client)
        .inspectSubjectPrivacy(ORG, SUBJECT)).resolves.toMatchObject({
          attendanceRows: 1,
          registrationRows: 1,
          registrationHistoryRows: 2,
        });
    });

    it("denies invalid scope without changing rows", async () => {
      for (const [org, subject] of [
        ["", SUBJECT], [ORG, ""], ["other ", SUBJECT],
        [ORG, " subject"], ["other\u0000org", SUBJECT],
      ] as const) {
        await expect(repository().eraseSubjectHistoryOnFrozenStore(org, subject))
          .rejects.toThrow(/scope/);
      }
      await expect(new PostgresUlcTrainingSubjectPrivacyInspector(db().client)
        .inspectSubjectPrivacy(ORG, SUBJECT)).resolves.toMatchObject({
          attendanceRows: 1, registrationRows: 1, registrationHistoryRows: 2,
        });
    });

    it("documents why this primitive is not runtime-safe without DB write fences", async () => {
      await repository().eraseSubjectHistoryOnFrozenStore(ORG, SUBJECT);
      // The existing published schema v9 has NO tombstone trigger: a stale
      // writer can still insert attendance. This deliberate regression must
      // remain visible until a separately approved DB-level guard is added.
      const inserted = await db().client.unsafe(
        `INSERT INTO ulc_linz_training_attendance
           (organization_id, session_id, athlete_id, status)
         VALUES ($1, 'session-private', $2, 'present')
         RETURNING athlete_id`,
        [ORG, SUBJECT],
      );
      expect(inserted).toHaveLength(1);
    });
  });
}
