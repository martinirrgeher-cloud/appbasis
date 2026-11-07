import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PostgresAthleteMasterdataRepository } from "@appbasis/athletes";
import {
  capabilityId,
  InMemoryPermissionStore,
  principalId,
  roleId,
} from "@appbasis/permissions";
import { createPostgresDatabase } from "../../../packages/database/src/client.ts";

import {
  createUlcLinzKindertrainingAccessService,
} from "../worker/kindertraining-access";
import { UlcLinzAuthorizationDeniedError } from "../worker/authorization";
import { createUlcKindertrainingService } from "../worker/kindertraining-service";
import {
  PostgresUlcTrainingSessionRepository,
  UlcTrainingSessionConflictError,
} from "../worker/training-session-postgres";

const databaseUrl = process.env.DATABASE_URL;

type DatabaseManifest = {
  owners: readonly {
    migrations: readonly string[];
  }[];
};

if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  describe.skip("ULC Kindertraining PostgreSQL E2E", () => {
    it("requires DATABASE_URL", () => {});
  });
} else {
  describe("ULC Kindertraining PostgreSQL E2E", () => {
    const administrativeConnection = createPostgresDatabase(databaseUrl);
    const isolatedDatabaseName =
      "appbasis_ulc_kindertraining_" +
      randomUUID().replaceAll("-", "").slice(0, 10);
    const isolatedDatabaseUrl = databaseUrlForName(
      databaseUrl,
      isolatedDatabaseName,
    );
    let isolatedConnection: ReturnType<typeof createPostgresDatabase> | null = null;
    let isolatedDatabaseCreated = false;

    beforeAll(async () => {
      await administrativeConnection.client.unsafe(
        "CREATE DATABASE " + isolatedDatabaseName,
      );
      isolatedDatabaseCreated = true;
      isolatedConnection = createPostgresDatabase(isolatedDatabaseUrl);
      await applyManifestMigrations(requiredConnection().client);
    });

    afterAll(async () => {
      if (isolatedConnection !== null) {
        await isolatedConnection.client.end();
        isolatedConnection = null;
      }
      if (isolatedDatabaseCreated) {
        await administrativeConnection.client.unsafe(
          "DROP DATABASE " + isolatedDatabaseName + " WITH (FORCE)",
        );
      }
      await administrativeConnection.client.end();
    });

    it("persists trainer presence with CAS in real PostgreSQL, preserving historical nonmembers", async () => {
      const repo = new PostgresUlcTrainingSessionRepository(
        requiredConnection().client,
        () => randomUUID(),
      );
      const organizationId = "verein-trainer-presence";
      const input = {
        moduleId: "u12" as const,
        groupId: "trainer-roster-test",
        sessionDate: "2026-11-07",
      };
      const eligible = ["trainer-a", "trainer-b"];
      const created = await repo.saveSession(
        organizationId, input, [], null, [], [], ["trainer-a"], eligible,
      );
      expect(created.trainingTrainerIds).toEqual(["trainer-a"]);
      expect(await repo.readTrainerPresence(
        organizationId, "u12", input.groupId, created.session.id,
      )).toEqual(["trainer-a"]);
      expect(await repo.readTrainerPresence(
        "other-organization", "u12", input.groupId, created.session.id,
      )).toEqual([]);
      expect(await repo.readTrainerPresence(
        organizationId, "u14", input.groupId, created.session.id,
      )).toEqual([]);

      const swapped = await repo.saveSession(
        organizationId, input, [], created.revision, [], [], ["trainer-b"], eligible,
      );
      expect(swapped.trainingTrainerIds).toEqual(["trainer-b"]);
      expect(await repo.readTrainerPresence(
        organizationId, "u12", input.groupId, created.session.id,
      )).toEqual(["trainer-b"]);

      // A legacy save without the trainer argument must not delete present trainers.
      const legacy = await repo.saveSession(
        organizationId, { ...input, note: "Sonderinformation" },
        [], swapped.revision,
      );
      expect(await repo.readTrainerPresence(
        organizationId, "u12", input.groupId, created.session.id,
      )).toEqual(["trainer-b"]);
      await expect(repo.saveSession(
        organizationId, input, [], created.revision, [], [], [], eligible,
      )).rejects.toBeInstanceOf(UlcTrainingSessionConflictError);

      // A trainer who leaves the group is removed from the editable roster,
      // but their historical presence remains until the personal-data lifecycle.
      await repo.saveSession(
        organizationId, input, [], legacy.revision, [], [], [], ["trainer-a"],
      );
      expect(await repo.readTrainerPresence(
        organizationId, "u12", input.groupId, created.session.id,
      )).toEqual(["trainer-b"]);
    });

    it("persists U12 contents and athlete slots atomically with CAS and retention-safe rows", async () => {
      const repo = new PostgresUlcTrainingSessionRepository(
        requiredConnection().client,
        () => randomUUID(),
      );
      const input = {
        moduleId: "u12" as const,
        groupId: "test-u12-contents",
        sessionDate: "2026-11-01",
      };
      const created = await repo.saveSession("verein-u12-content-test", input, [
        { athleteId: "athlete-u12-a", status: "present", contentSlots: [2, 1] },
        { athleteId: "athlete-u12-b", status: "absent", contentSlots: [] },
      ], null, ["Sprint", "Koordination"]);
      expect(created.trainingContentTitles).toEqual(["Sprint", "Koordination"]);
      expect(created.trainingContentAssignments).toEqual([
        { athleteId: "athlete-u12-a", slots: [1, 2] },
        { athleteId: "athlete-u12-b", slots: [] },
      ]);

      const readBack = await repo.readSession(
        "verein-u12-content-test", "u12", input.groupId, input.sessionDate,
      );
      expect(readBack?.trainingContentTitles).toEqual(["Sprint", "Koordination"]);
      expect(readBack?.trainingContentAssignments).toEqual([
        { athleteId: "athlete-u12-a", slots: [1, 2] },
        { athleteId: "athlete-u12-b", slots: [] },
      ]);
      await expect(repo.readSession(
        "another-organization", "u12", input.groupId, input.sessionDate,
      )).resolves.toBeNull();

      const changed = await repo.saveSession("verein-u12-content-test", input, [
        { athleteId: "athlete-u12-a", status: "absent", contentSlots: [] },
        { athleteId: "athlete-u12-b", status: "present", contentSlots: [1] },
      ], created.revision, ["Sprint"]);
      const afterChange = await repo.readSession(
        "verein-u12-content-test", "u12", input.groupId, input.sessionDate,
      );
      expect(afterChange?.trainingContentTitles).toEqual(["Sprint"]);
      expect(afterChange?.trainingContentAssignments).toEqual([
        { athleteId: "athlete-u12-a", slots: [] },
        { athleteId: "athlete-u12-b", slots: [1] },
      ]);

      await expect(repo.saveSession("verein-u12-content-test", input, [
        { athleteId: "athlete-u12-a", status: "present", contentSlots: [1] },
        { athleteId: "athlete-u12-b", status: "present", contentSlots: [1] },
      ], created.revision, ["Sprint"])).rejects.toBeInstanceOf(
        UlcTrainingSessionConflictError,
      );

      // Legacy attendance-only saves preserve current contents for present athletes.
      const legacy = await repo.saveSession("verein-u12-content-test", input, [
        { athleteId: "athlete-u12-b", status: "present" },
      ], changed.revision);
      const finalSnapshot = await repo.readSession(
        "verein-u12-content-test", "u12", input.groupId, input.sessionDate,
      );
      expect(finalSnapshot?.trainingContentTitles).toEqual(["Sprint"]);
      expect(finalSnapshot?.trainingContentAssignments).toEqual([
        { athleteId: "athlete-u12-b", slots: [1] },
      ]);
      expect(legacy.attendance.map((entry) => entry.athleteId)).toEqual([
        "athlete-u12-b",
      ]);
    });

    it("reads date-effective participants and atomically replaces the attendance snapshot", async () => {
      const connection = requiredConnection();
      const masterdata = new PostgresAthleteMasterdataRepository(
        connection.client,
        () => randomUUID(),
      );
      const sessions = new PostgresUlcTrainingSessionRepository(
        connection.client,
        () => randomUUID(),
      );
      const service = createUlcKindertrainingService({
        masterdata,
        sessions,
      });

      const group = await masterdata.createTrainingGroup("verein-1", {
        name: "Kindertraining",
        shortName: "KT",
        sortOrder: 10,
      });
      const anna = await masterdata.createAthlete("verein-1", {
        firstName: "Anna",
        lastName: "Auer",
        birthYear: 2017,
      });
      const berta = await masterdata.createAthlete("verein-1", {
        firstName: "Berta",
        lastName: "Zeller",
        birthYear: 2016,
      });
      const foreign = await masterdata.createAthlete("verein-2", {
        firstName: "Fremd",
        lastName: "Athlet",
        birthYear: 2016,
      });

      await masterdata.createAthleteGroupMembership("verein-1", {
        athleteId: anna.id,
        groupId: group.id,
        startedOn: "2026-09-01",
      });
      await masterdata.createAthleteGroupMembership("verein-1", {
        athleteId: berta.id,
        groupId: group.id,
        startedOn: "2026-09-01",
        endedOn: "2026-09-30",
      });

      const before = await service.readSnapshot(
        "verein-1",
        group.id,
        "2026-09-27",
      );
      expect(before.session).toBeNull();
      expect(before.participants.map((entry) => entry.athleteId)).toEqual([
        anna.id,
        berta.id,
      ]);
      expect(before.participants.map((entry) => entry.status)).toEqual([
        "open",
        "open",
      ]);
      expect(JSON.stringify(before)).not.toContain(foreign.id);

      const first = await service.saveSession("verein-1", {
        groupId: group.id,
        sessionDate: "2026-09-27",
        note: "Halle",
        expectedRevision: null,
        attendance: [
          { athleteId: anna.id, status: "present" },
          { athleteId: berta.id, status: "excused" },
        ],
      });
      expect(first.session).toMatchObject({
        state: "scheduled",
        note: "Halle",
      });

      const sessionId = first.session?.id;
      const firstRevision = first.session?.revision;
      expect(typeof sessionId).toBe("string");
      expect(firstRevision).toMatch(/^\d+$/);
      if (sessionId === undefined || firstRevision === undefined) {
        throw new Error("Kindertraining session id was not persisted.");
      }

      await expect(
        service.saveSession("verein-1", {
          groupId: group.id,
          sessionDate: "2026-09-27",
          note: "parallel create",
          expectedRevision: null,
          attendance: [
            { athleteId: anna.id, status: "absent" },
            { athleteId: berta.id, status: "absent" },
          ],
        }),
      ).rejects.toBeInstanceOf(UlcTrainingSessionConflictError);

      const afterParallelCreateConflict = await service.readSnapshot(
        "verein-1",
        group.id,
        "2026-09-27",
      );
      expect(afterParallelCreateConflict.session?.revision).toBe(firstRevision);
      expect(
        afterParallelCreateConflict.participants.map((entry) => entry.status),
      ).toEqual(["present", "excused"]);

      const second = await service.saveSession("verein-1", {
        groupId: group.id,
        sessionDate: "2026-09-27",
        state: "cancelled",
        note: null,
        expectedRevision: firstRevision,
        attendance: [
          { athleteId: anna.id, status: "absent" },
          { athleteId: berta.id, status: "present" },
        ],
      });
      expect(second.session).toMatchObject({
        id: sessionId,
        state: "cancelled",
        note: null,
      });
      expect(second.session?.revision).toMatch(/^\d+$/);
      expect(second.session?.revision).not.toBe(firstRevision);

      await expect(
        service.saveSession("verein-1", {
          groupId: group.id,
          sessionDate: "2026-09-27",
          state: "scheduled",
          note: "stale",
          expectedRevision: firstRevision,
          attendance: [
            { athleteId: anna.id, status: "present" },
            { athleteId: berta.id, status: "present" },
          ],
        }),
      ).rejects.toBeInstanceOf(UlcTrainingSessionConflictError);

      const rows = await connection.client.unsafe(
        `SELECT
           (SELECT count(*)::int
              FROM ulc_linz_training_session
             WHERE organization_id = 'verein-1'
               AND module_id = 'kindertraining'
               AND group_id = $1
               AND session_date = '2026-09-27'::date) AS session_count,
           (SELECT count(*)::int
              FROM ulc_linz_training_attendance attendance
              JOIN ulc_linz_training_session session
                ON session.id = attendance.session_id
             WHERE session.organization_id = 'verein-1'
               AND session.id = $2) AS attendance_count`,
        [group.id, sessionId],
      );
      expect(rows[0]).toEqual({
        session_count: 1,
        attendance_count: 2,
      });

      const readBack = await service.readSnapshot(
        "verein-1",
        group.id,
        "2026-09-27",
      );
      expect(readBack.participants.map((entry) => entry.status)).toEqual([
        "absent",
        "present",
      ]);

      const afterMembershipEnd = await service.readSnapshot(
        "verein-1",
        group.id,
        "2026-10-01",
      );
      expect(afterMembershipEnd.participants.map((entry) => entry.athleteId)).toEqual([
        anna.id,
      ]);
    });

    it("keeps proxy registration and actor history in one authorized group at the SQL write boundary", async () => {
      const connection = requiredConnection();
      const organizationId = "verein-proxy-a02";
      const date = "2026-11-04";
      const masterdata = new PostgresAthleteMasterdataRepository(
        connection.client, () => randomUUID(),
      );
      const sessions = new PostgresUlcTrainingSessionRepository(
        connection.client, () => randomUUID(),
      );
      const group = await masterdata.createTrainingGroup(organizationId, {
        name: "A02 Leistungsgruppe",
        attendanceMode: "self_registration",
      });
      const foreignGroup = await masterdata.createTrainingGroup(organizationId, {
        name: "A02 Fremdgruppe",
        attendanceMode: "self_registration",
      });
      const actor = await masterdata.createAthlete(organizationId, {
        firstName: "Anna", lastName: "A02", birthYear: 2010,
      });
      const target = await masterdata.createAthlete(organizationId, {
        firstName: "Ben", lastName: "A02", birthYear: 2010,
      });
      const outsider = await masterdata.createAthlete(organizationId, {
        firstName: "Chris", lastName: "A02", birthYear: 2010,
      });
      for (const athleteId of [actor.id, target.id]) {
        await masterdata.createAthleteGroupMembership(organizationId, {
          athleteId, groupId: group.id, startedOn: "2026-11-01",
        });
      }
      await masterdata.createAthleteGroupMembership(organizationId, {
        athleteId: outsider.id, groupId: foreignGroup.id, startedOn: "2026-11-01",
      });
      const identityId = "identity-a02-" + randomUUID();
      await connection.client.unsafe(
        `INSERT INTO ulc_linz_membership
           (identity_id, organization_id, subject_id, source_role, active)
         VALUES ($1, $2, $3, 'athlete', true)`,
        [identityId, organizationId, actor.id],
      );
      const created = await sessions.ensureScheduledSession(
        organizationId, "kindertraining", group.id, date,
      );
      const saved = await sessions.saveRegistration(
        organizationId, created.session.id, target.id, "attending",
        null, identityId, actor.id, "Komme 15 Minuten später",
      );
      expect(saved).toMatchObject({
        athleteId: target.id, intention: "attending", revision: 1,
        updatedByIdentityId: identityId, note: "Komme 15 Minuten später",
      });
      const history = await connection.client.unsafe(
        `SELECT athlete_id, actor_identity_id, intention, revision, note
         FROM ulc_linz_training_registration_change
         WHERE organization_id = $1 AND session_id = $2`,
        [organizationId, created.session.id],
      );
      expect(history).toEqual([{
        athlete_id: target.id, actor_identity_id: identityId,
        intention: "attending", revision: 1, note: "Komme 15 Minuten später",
      }]);

      // A pure status change preserves the note; an explicit null clears it.
      // Each transition is an immutable history row by the actual actor.
      const statusOnly = await sessions.saveRegistration(
        organizationId, created.session.id, target.id, "maybe",
        1, identityId, actor.id,
      );
      expect(statusOnly).toMatchObject({
        intention: "maybe", revision: 2, note: "Komme 15 Minuten später",
      });
      const cleared = await sessions.saveRegistration(
        organizationId, created.session.id, target.id, "maybe",
        2, identityId, actor.id, null,
      );
      expect(cleared).toMatchObject({
        intention: "maybe", revision: 3, note: null,
      });
      const noteHistory = await connection.client.unsafe(
        `SELECT intention, revision, note, actor_identity_id
         FROM ulc_linz_training_registration_change
         WHERE session_id = $1
         ORDER BY revision`,
        [created.session.id],
      );
      expect(noteHistory).toEqual([
        { intention: "attending", revision: 1, note: "Komme 15 Minuten später", actor_identity_id: identityId },
        { intention: "maybe", revision: 2, note: "Komme 15 Minuten später", actor_identity_id: identityId },
        { intention: "maybe", revision: 3, note: null, actor_identity_id: identityId },
      ]);

      // No self-proxy, outside group, wrong identity, or stale revision.
      for (const [targetId, actorIdentity, actorId, revision] of [
        [actor.id, identityId, actor.id, null],
        [outsider.id, identityId, actor.id, null],
        [target.id, "identity-unrelated", actor.id, 1],
        [target.id, identityId, actor.id, null],
      ] as const) {
        await expect(sessions.saveRegistration(
          organizationId, created.session.id, targetId, "maybe",
          revision, actorIdentity, actorId,
        )).rejects.toBeInstanceOf(UlcTrainingSessionConflictError);
      }
      // End the actor's training-group membership using the valid date
      // lifecycle. Directly flipping ulc_linz_membership.active would violate
      // that owner's ended_at/check constraint and is intentionally forbidden.
      await connection.client.unsafe(
        `UPDATE appbasis_athlete_group_membership
         SET ended_on = '2026-11-03'::date
         WHERE organization_id = $1 AND athlete_id = $2 AND group_id = $3`,
        [organizationId, actor.id, group.id],
      );
      await expect(sessions.saveRegistration(
        organizationId, created.session.id, target.id, "not_attending",
        3, identityId, actor.id,
      )).rejects.toBeInstanceOf(UlcTrainingSessionConflictError);
      const unchanged = await connection.client.unsafe(
        `SELECT intention, revision, updated_by_identity_id, note
         FROM ulc_linz_training_registration
         WHERE session_id = $1 AND athlete_id = $2`,
        [created.session.id, target.id],
      );
      expect(unchanged).toEqual([{
        intention: "maybe", revision: 3, updated_by_identity_id: identityId, note: null,
      }]);
      const count = await connection.client.unsafe(
        `SELECT count(*)::int AS changes
         FROM ulc_linz_training_registration_change
         WHERE session_id = $1`, [created.session.id],
      );
      expect(count).toEqual([{ changes: 3 }]);
    });

    it("resolves a trainer identity to only its persisted group assignments", async () => {
      const connection = requiredConnection();
      const masterdata = new PostgresAthleteMasterdataRepository(
        connection.client,
        () => randomUUID(),
      );
      const trainer = await masterdata.createTrainer("verein-scope", {
        firstName: "Tina",
        lastName: "Trainer",
      });
      const assigned = await masterdata.createTrainingGroup("verein-scope", {
        name: "Assigned",
      });
      await masterdata.createTrainingGroup("verein-scope", {
        name: "Other",
      });
      await masterdata.createTrainerGroupMembership("verein-scope", {
        trainerId: trainer.id,
        groupId: assigned.id,
      });
      await connection.client.unsafe(
        `INSERT INTO ulc_linz_membership (
           identity_id, organization_id, subject_id, source_role, active
         ) VALUES ($1, $2, $3, 'trainer', true)`,
        ["identity-scope", "verein-scope", trainer.id],
      );

      const view = capabilityId("ulc-linz:module:kindertraining:view");
      const trainerRole = roleId("ulc-linz:trainer");
      const access = createUlcLinzKindertrainingAccessService({
        sql: connection.client,
        permissions: new InMemoryPermissionStore({
          knownCapabilities: [view],
          roles: [{ roleId: trainerRole, capabilities: [] }],
          principals: [
            {
              principalId: principalId("identity-scope"),
              roleIds: [trainerRole],
              grants: [view],
              revokes: [],
            },
          ],
        }),
        memberships: {
          async resolveMembership({ organizationId }) {
            return {
              organizationId,
              sourceRole: "trainer",
              active: true,
            };
          },
        },
        subjectScopes: {
          async hasRelation() {
            return false;
          },
        },
      });
      const current = {
        identity: {
          identityId: "identity-scope",
          username: "trainer.scope",
          displayName: "Trainer Scope",
          contactEmail: null,
          personId: null,
          mustChangePassword: false,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
          passwordChangedAt: new Date("2026-01-01T00:00:00.000Z"),
          disabledAt: null,
          accountStatus: "active" as const,
        },
        sessionToken: "appbasis.session=scope",
        access: "full" as const,
      };

      await expect(access.assertViewAccess(current)).resolves.toEqual({
        organizationId: "verein-scope",
        actorPrincipalId: "identity-scope",
        scope: "trainer",
        trainerId: trainer.id,
        groupIds: [assigned.id],
      });

      await masterdata.deactivateTrainer("verein-scope", trainer.id);
      await expect(access.assertViewAccess(current)).rejects.toBeInstanceOf(
        UlcLinzAuthorizationDeniedError,
      );
    });

    function requiredConnection() {
      if (isolatedConnection === null) {
        throw new Error(
          "The isolated ULC Kindertraining PostgreSQL database is not ready.",
        );
      }
      return isolatedConnection;
    }
  });
}

async function applyManifestMigrations(
  client: ReturnType<typeof createPostgresDatabase>["client"],
) {
  const manifest = JSON.parse(
    await readFile(new URL("../appbasis.database.json", import.meta.url), "utf8"),
  ) as DatabaseManifest;
  const migrations = manifest.owners.flatMap((owner) => owner.migrations);
  if (migrations.length !== 41 || new Set(migrations).size !== migrations.length) {
    throw new Error(
      "ULC Kindertraining E2E requires the exact manifest-owned migration set.",
    );
  }

  for (const migration of migrations) {
    const sql = await readFile(
      new URL(`../../../${migration}`, import.meta.url),
      "utf8",
    );
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim() !== "") await client.unsafe(statement);
    }
  }
}

function databaseUrlForName(baseUrl: string, databaseName: string): string {
  const url = new URL(baseUrl);
  url.pathname = "/" + databaseName;
  return url.toString();
}
