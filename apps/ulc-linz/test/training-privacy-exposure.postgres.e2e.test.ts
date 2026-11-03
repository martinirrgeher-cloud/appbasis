import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresDatabase } from "@appbasis/database/postgres-provisioning";
import { principalId, roleId, type PermissionStore } from "@appbasis/permissions";
import {
  PostgresTrainingDocumentationRepository,
  TrainingDocumentationService,
  type TrainingDocumentationPostgresClient,
} from "@appbasis/training-documentation";

import type { UlcLinzCurrentIdentity } from "../worker/authorization";
import { inspectUlcLinzAthleteTrainingPrivacyExposure } from "../worker/lifecycle-service";
import { PostgresUlcTrainingSubjectPrivacyInspector } from "../worker/training-subject-privacy-postgres";

const databaseUrl = process.env.DATABASE_URL;
const ORG = "org-training-privacy";
const OTHER_ORG = "org-not-training-privacy";
const SUBJECT = "athlete-private";
const ADMIN = "admin-training-privacy";

function current(): UlcLinzCurrentIdentity {
  return {
    identity: {
      identityId: ADMIN, username: "ulc.privacy.admin",
      displayName: "Privacy administrator",
      contactEmail: null, personId: null,
      mustChangePassword: false,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      passwordChangedAt: new Date("2026-01-01T00:00:00.000Z"),
      disabledAt: null, accountStatus: "active",
    },
    access: "full", sessionToken: "test-session",
  };
}

function permissions(): PermissionStore {
  return {
    async findPrincipal(id) {
      if (id !== principalId(ADMIN)) return null;
      return {
        principalId: id, roleIds: [roleId("ulc-linz:admin")],
        grants: [], revokes: [],
      };
    },
    async findRole() { return null; },
    async isKnownCapability() { return false; },
  };
}

if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  describe.skip("ULC training subject privacy exposure PostgreSQL E2E", () => {
    it("requires DATABASE_URL", () => {});
  });
} else {
  describe("ULC training subject privacy exposure PostgreSQL E2E", () => {
    const administrative = createPostgresDatabase(databaseUrl);
    const dbName = "appbasis_training_privacy_" +
      randomUUID().replaceAll("-", "").slice(0, 12);
    const url = new URL(databaseUrl);
    url.pathname = "/" + dbName;
    let db: ReturnType<typeof createPostgresDatabase> | null = null;
    let created = false;

    function required() {
      if (db === null) throw new Error("PostgreSQL test database is unavailable.");
      return db;
    }

    beforeAll(async () => {
      await administrative.client.unsafe("CREATE DATABASE " + dbName);
      created = true;
      db = createPostgresDatabase(url.toString());
      for (const path of [
        "../../../modules/training-documentation/migrations/0000_appbasis_training_documentation_foundation.sql",
        "../migrations/0004_ulc_linz_training_sessions.sql",
        "../migrations/0008_ulc_linz_session_registration.sql",
      ]) {
        const sql = await readFile(new URL(path, import.meta.url), "utf8");
        await required().client.unsafe(sql);
      }
    });

    afterAll(async () => {
      if (db !== null) {
        await db.client.end();
        db = null;
      }
      if (created) {
        await administrative.client.unsafe("DROP DATABASE " + dbName + " WITH (FORCE)");
      }
      await administrative.client.end();
    });

    it("finds cross-subject attendance in old revisions and retains tenant isolation", async () => {
      const client = required().client;
      const documentation = new PostgresTrainingDocumentationRepository({
        unsafe(query, parameters) { return client.unsafe(query, parameters); },
        begin(callback) {
          return client.begin(async (tx) => callback({
            unsafe(query, parameters) { return tx.unsafe(query, parameters); },
          }));
        },
      } satisfies TrainingDocumentationPostgresClient);
      let nextId = 0;
      const ids = ["doc-private", "doc-foreign", "doc-other-tenant"];
      const service = new TrainingDocumentationService({
        repository: documentation,
        createId: () => ids[nextId++] ?? "unexpected-document-id",
        now: () => new Date("2026-10-26T10:00:00.000Z"),
      });
      const own = await service.create(ORG, {
        subjectId: SUBJECT, sessionDate: "2026-10-26",
        sourcePlanId: "plan-private", sourcePlanRevision: 1,
        attendance: [{
          participantId: SUBJECT, displayName: "Person To Be Deleted",
          status: "present",
        }],
      });
      const foreign = await service.create(ORG, {
        subjectId: "athlete-other", sessionDate: "2026-10-27",
        sourcePlanId: "plan-other", sourcePlanRevision: 1,
        attendance: [{
          participantId: SUBJECT, displayName: "Person To Be Deleted",
          status: "present",
        }],
      });
      await service.update(ORG, foreign.id, 1, {
        note: "Private historical note",
        attendance: [
          { participantId: SUBJECT, displayName: "Person To Be Deleted", status: "absent" },
          { participantId: "athlete-other", displayName: "Another athlete", status: "present" },
        ],
      });
      await service.create(OTHER_ORG, {
        subjectId: "athlete-other", sessionDate: "2026-10-27",
        sourcePlanId: "plan-other-tenant", sourcePlanRevision: 1,
        attendance: [{
          participantId: SUBJECT, displayName: "Person To Be Deleted",
          status: "present",
        }],
      });

      const insertSession = async (org: string, session: string, group: string) => {
        await client.unsafe(
          `INSERT INTO ulc_linz_training_session
             (id, organization_id, module_id, group_id, session_date)
           VALUES ($1, $2, 'kindertraining', $3, '2026-10-26'::date)`,
          [session, org, group],
        );
      };
      await insertSession(ORG, "session-main", "group-main");
      await insertSession(OTHER_ORG, "session-other", "group-other");
      for (const [org, session, athlete] of [
        [ORG, "session-main", SUBJECT],
        [ORG, "session-main", "athlete-other"],
        [OTHER_ORG, "session-other", SUBJECT],
      ] as const) {
        await client.unsafe(
          `INSERT INTO ulc_linz_training_attendance
             (organization_id, session_id, athlete_id, status)
           VALUES ($1, $2, $3, 'present')`,
          [org, session, athlete],
        );
        await client.unsafe(
          `INSERT INTO ulc_linz_training_registration
             (organization_id, session_id, athlete_id, intention, updated_by_identity_id)
           VALUES ($1, $2, $3, 'attending', 'trainer-identity')`,
          [org, session, athlete],
        );
      }
      for (const [id, org, session, athlete, revision] of [
        ["history-1", ORG, "session-main", SUBJECT, 1],
        ["history-2", ORG, "session-main", SUBJECT, 2],
        ["history-other-athlete", ORG, "session-main", "athlete-other", 1],
        ["history-other-org", OTHER_ORG, "session-other", SUBJECT, 1],
      ] as const) {
        await client.unsafe(
          `INSERT INTO ulc_linz_training_registration_change
             (id, organization_id, session_id, athlete_id,
              intention, revision, actor_identity_id)
           VALUES ($1, $2, $3, $4, 'attending', $5, 'trainer-identity')`,
          [id, org, session, athlete, revision],
        );
      }

      const training = new PostgresUlcTrainingSubjectPrivacyInspector(client);
      await expect(documentation.inspectSubjectPrivacy(ORG, SUBJECT))
        .resolves.toEqual({
          organizationId: ORG, subjectId: SUBJECT,
          ownedDocuments: 1, ownedRevisions: 1,
          otherSubjectDocumentsWithParticipant: 1,
          otherSubjectRevisionsWithParticipant: 2,
        });
      await expect(training.inspectSubjectPrivacy(ORG, SUBJECT))
        .resolves.toEqual({
          organizationId: ORG, subjectId: SUBJECT,
          attendanceRows: 1, registrationRows: 1,
          registrationHistoryRows: 2,
        });
      await expect(documentation.inspectSubjectPrivacy(OTHER_ORG, SUBJECT))
        .resolves.toMatchObject({
          ownedDocuments: 0, ownedRevisions: 0,
          otherSubjectDocumentsWithParticipant: 1,
          otherSubjectRevisionsWithParticipant: 1,
        });
      await expect(training.inspectSubjectPrivacy(OTHER_ORG, SUBJECT))
        .resolves.toMatchObject({
          attendanceRows: 1, registrationRows: 1,
          registrationHistoryRows: 1,
        });

      const scoped = {
        async resolveMembership({ identityId, organizationId }: {
          identityId: string; organizationId: string;
        }) {
          return identityId === ADMIN && organizationId === ORG
            ? { organizationId: ORG, sourceRole: "admin" as const, active: true }
            : null;
        },
        async hasRelation() { return false; },
      };
      const dependencies = {
        permissions: permissions(), scopes: scoped, documentation, training,
      };
      const result = await inspectUlcLinzAthleteTrainingPrivacyExposure(
        current(), dependencies, { organizationId: ORG, subjectId: SUBJECT },
      );
      expect(result).toMatchObject({
        risk: "structured-subject-rows-present",
        documentation: {
          ownedDocuments: 1, ownedRevisions: 1,
          otherSubjectDocumentsWithParticipant: 1,
          otherSubjectRevisionsWithParticipant: 2,
        },
        training: {
          attendanceRows: 1, registrationRows: 1, registrationHistoryRows: 2,
        },
      });
      expect(JSON.stringify(result)).not.toContain("Person To Be Deleted");
      expect(JSON.stringify(result)).not.toContain("Private historical note");
      await expect(inspectUlcLinzAthleteTrainingPrivacyExposure(
        current(), dependencies,
        { organizationId: OTHER_ORG, subjectId: SUBJECT },
      )).rejects.toThrow();

      // No inspected row was changed or erased.
      expect(await documentation.findCurrent(ORG, own.id)).toBeDefined();
      expect(await documentation.listRevisions(ORG, foreign.id)).toHaveLength(2);
      const preserved = await client.unsafe(
        "SELECT count(*)::int AS total FROM ulc_linz_training_registration_change",
      );
      expect(preserved[0]?.total).toBe(4);
    });
  });
}
