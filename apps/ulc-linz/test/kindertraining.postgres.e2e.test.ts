import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PostgresAthleteMasterdataRepository } from "@appbasis/athletes";
import { createPostgresDatabase } from "../../../packages/database/src/client.ts";

import { createUlcKindertrainingService } from "../worker/kindertraining-service";
import { PostgresUlcTrainingSessionRepository } from "../worker/training-session-postgres";

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
      expect(typeof sessionId).toBe("string");

      const second = await service.saveSession("verein-1", {
        groupId: group.id,
        sessionDate: "2026-09-27",
        state: "cancelled",
        note: null,
        attendance: [
          { athleteId: anna.id, status: "absent" },
          { athleteId: berta.id, status: "present" },
        ],
      });
      expect(second.session).toEqual({
        id: sessionId,
        state: "cancelled",
        note: null,
      });

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
  if (migrations.length !== 13 || new Set(migrations).size !== migrations.length) {
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
