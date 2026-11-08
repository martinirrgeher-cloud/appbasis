import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresAthleteMasterdataRepository } from "@appbasis/athletes";
import { createPostgresDatabase } from "../../../packages/database/src/client.ts";
import {
  PostgresUlcRegistrationCalendarRepository,
  UlcRegistrationCalendarConflictError,
  UlcRegistrationCalendarDataError,
} from "../worker/registration-calendar-postgres";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  describe.skip("G-04 isolated PostgreSQL calendar migration E2E", () => {
    it("requires DATABASE_URL", () => {});
  });
} else {
  describe("G-04 proposed non-personal calendar on isolated PostgreSQL 18", () => {
    const admin = createPostgresDatabase(databaseUrl);
    const dbName = "appbasis_ulc_g04_" + randomUUID().replaceAll("-", "").slice(0, 12);
    const url = new URL(databaseUrl);
    url.pathname = "/" + dbName;
    let target: ReturnType<typeof createPostgresDatabase> | null = null;
    let created = false;
    function connection() {
      if (!target) throw new Error("G-04 isolated database has not been initialized.");
      return target;
    }
    beforeAll(async () => {
      await admin.client.unsafe("CREATE DATABASE " + dbName);
      created = true;
      target = createPostgresDatabase(url.toString());
      const manifest = JSON.parse(await readFile(
        new URL("../appbasis.database.json", import.meta.url), "utf8",
      )) as { owners: readonly { migrations: readonly string[] }[] };
      const installed = manifest.owners.flatMap((owner) => owner.migrations);
      const candidate = "apps/ulc-linz/migrations/0016_ulc_linz_registration_calendar.sql";
      if (installed.includes(candidate)) {
        throw new Error("G-04 migration unexpectedly activated in manifest.");
      }
      for (const path of [...installed, candidate]) {
        const sql = await readFile(new URL("../../../" + path, import.meta.url), "utf8");
        for (const statement of sql.split("--> statement-breakpoint")) {
          if (statement.trim()) await connection().client.unsafe(statement);
        }
      }
    }, 120_000);

    afterAll(async () => {
      if (target) {
        await target.client.end();
        target = null;
      }
      if (created) await admin.client.unsafe("DROP DATABASE " + dbName + " WITH (FORCE)");
      await admin.client.end();
    }, 120_000);

    const schedule = {
      weekdays: [1, 3, 5],
      weeksAhead: 4,
      deadline: { daysBefore: 1, localTime: "18:00" },
      lateMode: "block",
    } as const;

    it("stores scoped weekday rules, refuses cross-org and wrong-mode edits, enforces CAS", async () => {
      const athletes = new PostgresAthleteMasterdataRepository(
        connection().client, () => randomUUID(),
      );
      const group = await athletes.createTrainingGroup("verein-g04", {
        name: "Leistungsgruppe G04", attendanceMode: "self_registration",
      });
      const attendance = await athletes.createTrainingGroup("verein-g04", {
        name: "Kindertraining G04", attendanceMode: "trainer_roll_call",
      });
      const repo = new PostgresUlcRegistrationCalendarRepository(connection().client);
      expect(await repo.readRule("verein-g04", group.id)).toBeNull();
      const created = await repo.writeRule("verein-g04", group.id, null, schedule);
      expect(created).toEqual({ schedule, revision: 1 });
      expect(await repo.readRule("verein-g04", group.id)).toEqual(created);
      await expect(repo.writeRule("verein-g04", group.id, null, schedule))
        .rejects.toBeInstanceOf(UlcRegistrationCalendarConflictError);
      await expect(repo.writeRule("other-verein", group.id, null, schedule))
        .rejects.toBeInstanceOf(UlcRegistrationCalendarConflictError);
      await expect(repo.writeRule("verein-g04", attendance.id, null, schedule))
        .rejects.toBeInstanceOf(UlcRegistrationCalendarConflictError);
      await expect(repo.writeRule("verein-g04", "does-not-exist", null, schedule))
        .rejects.toBeInstanceOf(UlcRegistrationCalendarConflictError);
      expect(await repo.readRule("other-verein", group.id)).toBeNull();
      const next = await repo.writeRule("verein-g04", group.id, 1, {
        weekdays: [2, 4], weeksAhead: 2, deadline: null, lateMode: "allow",
      });
      expect(next).toEqual({
        revision: 2,
        schedule: { weekdays: [2, 4], weeksAhead: 2, deadline: null, lateMode: "allow" },
      });
      await expect(repo.writeRule("verein-g04", group.id, 1, schedule))
        .rejects.toBeInstanceOf(UlcRegistrationCalendarConflictError);
      const competitors = await Promise.allSettled([
        repo.writeRule("verein-g04", group.id, 2, schedule),
        repo.writeRule("verein-g04", group.id, 2, {
          weekdays: [7], weeksAhead: 1, deadline: null, lateMode: "block",
        }),
      ]);
      expect(competitors.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(competitors.filter((result) => result.status === "rejected")).toHaveLength(1);
      expect((await repo.readRule("verein-g04", group.id))?.revision).toBe(3);
    });

    it("supports one date exception and a versioned reset without stale revival", async () => {
      const athletes = new PostgresAthleteMasterdataRepository(
        connection().client, () => randomUUID(),
      );
      const group = await athletes.createTrainingGroup("verein-g04-extra", {
        name: "Leistungsgruppe Extra G04", attendanceMode: "self_registration",
      });
      const repo = new PostgresUlcRegistrationCalendarRepository(connection().client);
      const day = "2026-11-12";
      expect(await repo.readException("verein-g04-extra", group.id, day)).toBeNull();
      expect(await repo.writeException("verein-g04-extra", group.id, day, null, "extra"))
        .toEqual({ kind: "extra", revision: 1 });
      expect(await repo.writeException("verein-g04-extra", group.id, day, 1, "cancelled"))
        .toEqual({ kind: "cancelled", revision: 2 });
      expect(await repo.writeException("verein-g04-extra", group.id, day, 2, null))
        .toEqual({ kind: null, revision: 3 });
      expect(await repo.readException("verein-g04-extra", group.id, day))
        .toEqual({ kind: null, revision: 3 });
      await expect(repo.writeException("verein-g04-extra", group.id, day, 1, "extra"))
        .rejects.toBeInstanceOf(UlcRegistrationCalendarConflictError);
      await expect(repo.writeException("other-verein", group.id, day, null, "extra"))
        .rejects.toBeInstanceOf(UlcRegistrationCalendarConflictError);
      await expect(repo.writeException("verein-g04-extra", group.id, "2026-02-30", null, "extra"))
        .rejects.toBeInstanceOf(UlcRegistrationCalendarDataError);
      await expect(repo.writeException("verein-g04-extra", group.id, day, 3, "unsafe" as "extra"))
        .rejects.toBeInstanceOf(UlcRegistrationCalendarDataError);
    });

    it("keeps the new calendar tables free of member identifiers and free text", async () => {
      const rows = await connection().client.unsafe(`
        SELECT table_name, column_name
          FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name IN (
             'ulc_linz_registration_calendar_rule',
             'ulc_linz_registration_calendar_exception'
           ) ORDER BY table_name, ordinal_position
      `);
      expect([...new Set(rows.map((row) => row.table_name))]).toHaveLength(2);
      const forbidden = /(?:athlete|member|identity|actor|note|phone|email|description)/i;
      expect(rows.map((row) => row.column_name).filter((column) => forbidden.test(String(column))))
        .toEqual([]);
    });
  });
}
