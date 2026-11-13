import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPostgresDatabase } from "@appbasis/database/postgres-provisioning";
import {
  PostgresTrainingDocumentationRepository,
  TrainingDocumentationService,
  type TrainingDocumentationPostgresClient,
} from "@appbasis/training-documentation";

import {
  PostgresUlcTrainingSubjectFrozenHistoryRepository,
  type UlcTrainingSubjectHistoryTransactionClient,
} from "../worker/training-subject-history-deletion-postgres";
import { PostgresUlcTrainingSubjectPrivacyInspector } from "../worker/training-subject-privacy-postgres";

/**
 * P03: cross-owner, FROZEN/ISOLATED database rehearsal only.
 * This is intentionally not a runtime coordinator or deletion authorization.
 * ULC training-session writers have no live subject tombstone yet.
 */
const url = process.env.DATABASE_URL;
const ORG = "p03-org";
const OTHER_ORG = "p03-other-org";
const SUBJECT = "p03-subject";
const NEIGHBOR = "p03-neighbor";

if (!url) {
  describe.skip("ULC P03 cross-owner frozen PostgreSQL proof", () => {
    it("requires DATABASE_URL", () => {});
  });
} else {
  describe("ULC P03 cross-owner frozen PostgreSQL proof", () => {
    const admin = createPostgresDatabase(url);
    const name = "ulc_p03_" + randomUUID().replaceAll("-", "").slice(0, 16);
    const databaseUrl = new URL(url);
    databaseUrl.pathname = "/" + name;
    let db: ReturnType<typeof createPostgresDatabase> | null = null;
    let created = false;

    function required() {
      if (!db) throw new Error("Isolated P03 PostgreSQL database unavailable.");
      return db;
    }

    function docsRepository() {
      const connection = required().client;
      const client: TrainingDocumentationPostgresClient = {
        unsafe(query, parameters) {
          return connection.unsafe(query, parameters);
        },
        begin(callback) {
          return connection.begin(async (transaction) => callback({
            unsafe(query, parameters) {
              return transaction.unsafe(query, parameters);
            },
          }));
        },
      };
      return new PostgresTrainingDocumentationRepository(client);
    }

    function frozenHistoryRepository(failRegistrationOnce = false) {
      const connection = required().client;
      let shouldFail = failRegistrationOnce;
      const client: UlcTrainingSubjectHistoryTransactionClient = {
        unsafe(query, parameters) {
          return connection.unsafe(query, parameters);
        },
        begin(callback) {
          return connection.begin(async (transaction) => callback({
            unsafe(query, parameters) {
              if (shouldFail &&
                  query.includes("DELETE FROM ulc_linz_training_registration\n")) {
                shouldFail = false;
                throw new Error("simulated app-owned registration database failure");
              }
              return transaction.unsafe(query, parameters);
            },
          }));
        },
      };
      return new PostgresUlcTrainingSubjectFrozenHistoryRepository(client);
    }

    beforeAll(async () => {
      await admin.client.unsafe("CREATE DATABASE " + name);
      created = true;
      db = createPostgresDatabase(databaseUrl.toString());
      for (const path of [
        "../../../modules/training-documentation/migrations/0000_appbasis_training_documentation_foundation.sql",
        "../../../modules/training-documentation/migrations/0001_appbasis_training_documentation_subject_deletion.sql",
        "../migrations/0004_ulc_linz_training_sessions.sql",
        "../migrations/0008_ulc_linz_session_registration.sql",
      ]) {
        await required().client.unsafe(
          await readFile(new URL(path, import.meta.url), "utf8"),
        );
      }
    });

    beforeEach(async () => {
      await required().client.unsafe(
        `TRUNCATE TABLE
          appbasis_training_documentation_revision,
          appbasis_training_documentation,
          appbasis_training_documentation_subject_deletion,
          ulc_linz_training_registration_change,
          ulc_linz_training_registration,
          ulc_linz_training_attendance,
          ulc_linz_training_session CASCADE`,
      );
    });

    afterAll(async () => {
      if (db) {
        await db.client.end();
        db = null;
      }
      if (created) {
        await admin.client.unsafe("DROP DATABASE " + name + " WITH (FORCE)");
      }
      await admin.client.end();
    });

    it("does not claim app-wide erasure when documentation committed but attendance deletion failed", async () => {
      const documentation = docsRepository();
      const ids = ["p03-owned-document", "p03-neighbor-document", "p03-other-organization-document"];
      let nextId = 0;
      const service = new TrainingDocumentationService({
        repository: documentation,
        createId: () => ids[nextId++] ?? "unexpected-p03-id",
        now: () => new Date("2026-10-26T10:00:00.000Z"),
      });

      const owned = await service.create(ORG, {
        subjectId: SUBJECT, sessionDate: "2026-10-26",
        sourcePlanId: "p03-owned-plan", sourcePlanRevision: 1,
        attendance: [{ participantId: SUBJECT, displayName: "P03 Target", status: "present" }],
      });
      const neighbor = await service.create(ORG, {
        subjectId: NEIGHBOR, sessionDate: "2026-10-27",
        sourcePlanId: "p03-neighbor-plan", sourcePlanRevision: 1,
        note: "Trainer free text may still name P03 Target",
        attendance: [
          { participantId: SUBJECT, displayName: "P03 Target", status: "present" },
          { participantId: NEIGHBOR, displayName: "P03 Neighbor", status: "present" },
        ],
      });
      await service.update(ORG, neighbor.id, 1, {
        attendance: [
          { participantId: SUBJECT, displayName: "P03 Target", status: "absent" },
          { participantId: NEIGHBOR, displayName: "P03 Neighbor", status: "present" },
        ],
      });
      const foreign = await service.create(OTHER_ORG, {
        subjectId: NEIGHBOR, sessionDate: "2026-10-27",
        sourcePlanId: "p03-foreign-plan", sourcePlanRevision: 1,
        attendance: [{ participantId: SUBJECT, displayName: "P03 Target", status: "present" }],
      });

      for (const [org, id] of [
        [ORG, "p03-session"], [OTHER_ORG, "p03-other-session"],
      ] as const) {
        await required().client.unsafe(
          `INSERT INTO ulc_linz_training_session
             (id, organization_id, module_id, group_id, session_date, note)
           VALUES ($1, $2, 'kindertraining', $1, '2026-10-26'::date, 'Shared training session')`,
          [id, org],
        );
      }
      for (const [org, session, subject] of [
        [ORG, "p03-session", SUBJECT],
        [ORG, "p03-session", NEIGHBOR],
        [OTHER_ORG, "p03-other-session", SUBJECT],
      ] as const) {
        await required().client.unsafe(
          `INSERT INTO ulc_linz_training_attendance
             (organization_id, session_id, athlete_id, status)
           VALUES ($1, $2, $3, 'present')`,
          [org, session, subject],
        );
        await required().client.unsafe(
          `INSERT INTO ulc_linz_training_registration
             (organization_id, session_id, athlete_id, intention, updated_by_identity_id)
           VALUES ($1, $2, $3, 'attending', 'p03-trainer')`,
          [org, session, subject],
        );
      }
      for (const [id, org, session, subject, revision] of [
        ["p03-change-target-1", ORG, "p03-session", SUBJECT, 1],
        ["p03-change-target-2", ORG, "p03-session", SUBJECT, 2],
        ["p03-change-neighbor", ORG, "p03-session", NEIGHBOR, 1],
        ["p03-change-foreign", OTHER_ORG, "p03-other-session", SUBJECT, 1],
      ] as const) {
        await required().client.unsafe(
          `INSERT INTO ulc_linz_training_registration_change
             (id, organization_id, session_id, athlete_id,
              intention, revision, actor_identity_id)
           VALUES ($1, $2, $3, $4, 'attending', $5, 'p03-trainer')`,
          [id, org, session, subject, revision],
        );
      }

      const history = new PostgresUlcTrainingSubjectPrivacyInspector(required().client);
      await expect(documentation.inspectSubjectPrivacy(ORG, SUBJECT))
        .resolves.toMatchObject({
          ownedDocuments: 1, ownedRevisions: 1,
          otherSubjectDocumentsWithParticipant: 1,
          otherSubjectRevisionsWithParticipant: 2,
        });
      await expect(history.inspectSubjectPrivacy(ORG, SUBJECT))
        .resolves.toMatchObject({
          attendanceRows: 1, registrationRows: 1, registrationHistoryRows: 2,
        });

      // The independent module-owner transaction succeeds first. This is
      // NOT proof that the other application-owned tables were erased.
      const completedAt = new Date(Date.now() - 60_000);
      await expect(documentation.removeSubjectDataAfterVerifiedDeletion(
        ORG, SUBJECT, completedAt,
      )).resolves.toEqual({
        markerInserted: true, deletedDocuments: 1, deletedRevisions: 1,
        redactedOtherSubjectRevisions: 2,
      });
      await expect(service.findCurrent(ORG, owned.id)).resolves.toBeUndefined();
      await expect(documentation.inspectSubjectPrivacy(ORG, SUBJECT))
        .resolves.toMatchObject({
          ownedDocuments: 0, ownedRevisions: 0,
          otherSubjectDocumentsWithParticipant: 0,
          otherSubjectRevisionsWithParticipant: 0,
        });

      const failed = frozenHistoryRepository(true);
      await expect(failed.eraseSubjectHistoryOnFrozenStore(ORG, SUBJECT))
        .rejects.toThrow(/simulated app-owned registration database failure/);
      // The app-owned transaction rolled back in full, while the independent
      // documentation transaction already committed. Never report "complete".
      await expect(history.inspectSubjectPrivacy(ORG, SUBJECT))
        .resolves.toMatchObject({
          attendanceRows: 1, registrationRows: 1, registrationHistoryRows: 2,
        });
      await expect(documentation.inspectSubjectPrivacy(ORG, SUBJECT))
        .resolves.toMatchObject({
          ownedDocuments: 0, ownedRevisions: 0,
        });

      // Recovery only on a proven frozen store with independent authority.
      await expect(frozenHistoryRepository().eraseSubjectHistoryOnFrozenStore(
        ORG, SUBJECT,
      )).resolves.toEqual({
        deletedAttendanceRows: 1,
        deletedRegistrationRows: 1,
        deletedRegistrationHistoryRows: 2,
      });
      await expect(frozenHistoryRepository().eraseSubjectHistoryOnFrozenStore(
        ORG, SUBJECT,
      )).resolves.toEqual({
        deletedAttendanceRows: 0,
        deletedRegistrationRows: 0,
        deletedRegistrationHistoryRows: 0,
      });
      await expect(history.inspectSubjectPrivacy(ORG, SUBJECT))
        .resolves.toMatchObject({
          attendanceRows: 0, registrationRows: 0, registrationHistoryRows: 0,
        });
      await expect(history.inspectSubjectPrivacy(ORG, NEIGHBOR))
        .resolves.toMatchObject({
          attendanceRows: 1, registrationRows: 1, registrationHistoryRows: 1,
        });
      await expect(history.inspectSubjectPrivacy(OTHER_ORG, SUBJECT))
        .resolves.toMatchObject({
          attendanceRows: 1, registrationRows: 1, registrationHistoryRows: 1,
        });
      expect(await service.listRevisions(ORG, neighbor.id)).toHaveLength(2);
      await expect(service.listRevisions(OTHER_ORG, foreign.id))
        .resolves.toMatchObject([{
          attendance: [{ participantId: SUBJECT, displayName: "P03 Target" }],
        }]);
      // Structured historical participant references were redacted, but
      // legacy free-text notes are not automatically anonymized.
      const preserved = await service.listRevisions(ORG, neighbor.id);
      expect(preserved.every(rev => !rev.attendance.some(a => a.participantId === SUBJECT)))
        .toBe(true);
      expect(preserved.some(rev => (rev.note ?? "").includes("P03 Target")))
        .toBe(true);

      const sessions = await required().client.unsafe(
        `SELECT id FROM ulc_linz_training_session ORDER BY id`,
      );
      expect(sessions.map(row => row.id))
        .toEqual(["p03-other-session", "p03-session"]);
      await expect(service.create(ORG, {
        subjectId: SUBJECT, sessionDate: "2026-10-28",
        sourcePlanId: "p03-stale-plan", sourcePlanRevision: 1,
      })).rejects.toThrow(/deletion marker/i);

      // CRITICAL LIVE BLOCKER: the app-owned schema has no persistent
      // subject deletion guard. A stale writer could re-create attendance.
      const stillWritable = await required().client.unsafe(
        `INSERT INTO ulc_linz_training_attendance
           (organization_id, session_id, athlete_id, status)
         VALUES ($1, 'p03-session', $2, 'present') RETURNING athlete_id`,
        [ORG, SUBJECT],
      );
      expect(stillWritable).toHaveLength(1);
    });
  });
}
