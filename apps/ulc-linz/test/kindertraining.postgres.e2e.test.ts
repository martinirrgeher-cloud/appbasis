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
  if (migrations.length !== 17 || new Set(migrations).size !== migrations.length) {
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
