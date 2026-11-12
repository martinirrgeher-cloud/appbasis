import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresAthleteMasterdataRepository } from "@appbasis/athletes";
import { PostgresUlcTrainingSessionRepository } from "../worker/training-session-postgres";
import v17Proposal from "../privacy/g04-v17-calendar-inventory-proposal.json";
import {
  UlcRegistrationCalendarActivationError,
  verifyUlcG04PreviewCalendarReadiness,
} from "../worker/registration-calendar-activation";
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

    it("N17 reads one week's exceptions without mixing groups or organizations", async () => {
      const athletes = new PostgresAthleteMasterdataRepository(
        connection().client, () => randomUUID(),
      );
      const group = await athletes.createTrainingGroup("verein-g04-batch", {
        name: "N17 Wochenleser", attendanceMode: "trainer_roll_call",
      });
      const other = await athletes.createTrainingGroup("verein-g04-batch", {
        name: "N17 Fremdgruppe", attendanceMode: "trainer_roll_call",
      });
      const calendar = new PostgresUlcRegistrationCalendarRepository(connection().client);
      await calendar.writeException(
        "verein-g04-batch", group.id, "2026-11-10", null, "extra",
      );
      await calendar.writeException(
        "verein-g04-batch", group.id, "2026-11-12", null, "cancelled",
      );
      await calendar.writeException(
        "verein-g04-batch", group.id, "2026-11-14", null, null,
      );
      await calendar.writeException(
        "verein-g04-batch", group.id, "2026-11-17", null, "extra",
      );
      await calendar.writeException(
        "verein-g04-batch", other.id, "2026-11-11", null, "cancelled",
      );
      const week = await calendar.readWeekExceptions(
        "verein-g04-batch", group.id, "2026-11-09",
      );
      expect([...week.entries()]).toEqual([
        ["2026-11-10", { kind: "extra", revision: 1 }],
        ["2026-11-12", { kind: "cancelled", revision: 1 }],
        ["2026-11-14", { kind: null, revision: 1 }],
      ]);
      expect(await calendar.readWeekExceptions(
        "other-organization", group.id, "2026-11-09",
      )).toEqual(new Map());
      expect(await calendar.readWeekExceptions(
        "verein-g04-batch", other.id, "2026-11-09",
      )).toEqual(new Map([[
        "2026-11-11", { kind: "cancelled", revision: 1 },
      ]]));
      expect([...await calendar.readWeekExceptions(
        "verein-g04-batch", group.id, "2026-11-16",
      )]).toEqual([["2026-11-17", { kind: "extra", revision: 1 }]]);
    });

    it("stores group calendar rules in both modes, refuses cross-org edits and enforces CAS", async () => {
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
      const trainerSchedule = {
        weekdays: [1, 2, 3, 4, 7], weeksAhead: 4,
        deadline: null, lateMode: "allow",
      } as const;
      const trainerRule = await repo.writeRule(
        "verein-g04", attendance.id, null, trainerSchedule,
      );
      expect(trainerRule).toEqual({ schedule: trainerSchedule, revision: 1 });
      expect(await repo.readRule("verein-g04", attendance.id)).toEqual(trainerRule);
      await expect(repo.writeRule("other-verein", attendance.id, 1, trainerSchedule))
        .rejects.toBeInstanceOf(UlcRegistrationCalendarConflictError);
      const trainerExtra = await repo.writeException(
        "verein-g04", attendance.id, "2026-11-14", null, "extra",
      );
      expect(trainerExtra).toEqual({ kind: "extra", revision: 1 });
      // Changing who records attendance cannot discard group training days.
      await connection().client.unsafe(
        "UPDATE appbasis_training_group SET attendance_mode = 'self_registration' WHERE id = $1",
        [attendance.id],
      );
      expect(await repo.readRule("verein-g04", attendance.id)).toEqual(trainerRule);
      expect(await repo.readException("verein-g04", attendance.id, "2026-11-14"))
        .toEqual(trainerExtra);
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

    it("blocks direct SQL registration writes and rolls back rejected orphan sessions", async () => {
      const athletes = new PostgresAthleteMasterdataRepository(
        connection().client, () => randomUUID(),
      );
      const group = await athletes.createTrainingGroup("verein-g04-write", {
        name: "Leistungsgruppe Write G04", attendanceMode: "self_registration",
      });
      const calendar = new PostgresUlcRegistrationCalendarRepository(connection().client);
      const sessions = new PostgresUlcTrainingSessionRepository(
        connection().client, () => randomUUID(),
      );
      const today = new Date();
      const dateAt = (offset: number) => {
        const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(),
          today.getUTCDate() + offset, 12));
        return d.toISOString().slice(0, 10);
      };
      const allowed = dateAt(9);
      const denied = dateAt(10);
      const dayOfWeek = (new Date(allowed + "T12:00:00Z").getUTCDay() || 7);
      await calendar.writeRule("verein-g04-write", group.id, null, {
        weekdays: [dayOfWeek], weeksAhead: 26, deadline: null, lateMode: "block",
      });

      const attempt = (day: string, athleteId: string, proxy?: string) =>
        sessions.withRegistrationTransaction(async (transaction) => {
          const created = await transaction.ensureScheduledSession(
            "verein-g04-write", "kindertraining", group.id, day,
          );
          return transaction.saveRegistration(
            "verein-g04-write", created.session.id, athleteId,
            "attending", null, "identity-g04", proxy,
          );
        });
      const rejected = await attempt(denied, "athlete-direct")
        .then(() => null, (error: unknown) => error);
      expect(rejected).toMatchObject({ code: "UL024" });
      expect(await sessions.readSession(
        "verein-g04-write", "kindertraining", group.id, denied,
      )).toBeNull();

      const created = await attempt(allowed, "athlete-direct");
      expect(created).toMatchObject({ intention: "attending", revision: 1 });
      await calendar.writeException("verein-g04-write", group.id, allowed, null, "cancelled");
      const cancelled = await attempt(allowed, "athlete-after-cancellation")
        .then(() => null, (error: unknown) => error);
      expect(cancelled).toMatchObject({ code: "UL024" });
      await calendar.writeException("verein-g04-write", group.id, allowed, 1, null);
      await calendar.writeException("verein-g04-write", group.id, denied, null, "extra");
      const extra = await attempt(denied, "athlete-extra");
      expect(extra).toMatchObject({ intention: "attending", revision: 1 });
      expect(await sessions.readSession(
        "verein-g04-write", "kindertraining", group.id, denied,
      )).toMatchObject({
        registrations: expect.arrayContaining([
          expect.objectContaining({ athleteId: "athlete-extra" }),
        ]),
      });
    });

    it("retains calendar rules on group deactivation but cascades both tables on physical group deletion", async () => {
      const organizationId = "verein-g04-lifecycle";
      const athletes = new PostgresAthleteMasterdataRepository(
        connection().client, () => randomUUID(),
      );
      const group = await athletes.createTrainingGroup(organizationId, {
        name: "Leistungsgruppe Retention G04", attendanceMode: "self_registration",
      });
      const calendar = new PostgresUlcRegistrationCalendarRepository(connection().client);
      const retainedRule = await calendar.writeRule(organizationId, group.id, null, {
        weekdays: [1, 3], weeksAhead: 4, deadline: null, lateMode: "allow",
      });
      await calendar.writeException(
        organizationId, group.id, "2026-12-02", null, "cancelled",
      );
      // "none" must preserve a monotonic CAS revision even for inactive groups.
      const retainedException = await calendar.writeException(
        organizationId, group.id, "2026-12-02", 1, null,
      );
      await connection().client.unsafe(`
        UPDATE appbasis_training_group SET is_active = false
         WHERE organization_id = $1 AND id = $2
      `, [organizationId, group.id]);
      // Reversible group inactivation must never erase CAS revisions.
      expect(await calendar.readRule(organizationId, group.id)).toEqual(retainedRule);
      expect(await calendar.readException(organizationId, group.id, "2026-12-02"))
        .toEqual(retainedException);
      await expect(calendar.writeRule(organizationId, group.id, 1, {
        weekdays: [2], weeksAhead: 3, deadline: null, lateMode: "block",
      })).rejects.toBeInstanceOf(UlcRegistrationCalendarConflictError);

      // The group is new and has no member / training references. This tests
      // physical group deletion only, not a new public hard-delete endpoint.
      await connection().client.unsafe(`
        DELETE FROM appbasis_training_group
         WHERE organization_id = $1 AND id = $2
      `, [organizationId, group.id]);
      expect(await calendar.readRule(organizationId, group.id)).toBeNull();
      expect(await calendar.readException(organizationId, group.id, "2026-12-02"))
        .toBeNull();
    });

    it("runs the actual v17 runtime attestation query and refuses a non-Preview database", async () => {
      await expect(verifyUlcG04PreviewCalendarReadiness(connection().client))
        .rejects.toBeInstanceOf(UlcRegistrationCalendarActivationError);
    });

    it("matches the staged v17 privacy field inventory to real PostgreSQL columns", async () => {
      const rows = await connection().client.unsafe(`
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN (
            'ulc_linz_registration_calendar_rule',
            'ulc_linz_registration_calendar_exception'
          )
        ORDER BY table_name, ordinal_position
      `);
      const expected = v17Proposal.newTables.flatMap((table) =>
        table.fields.map((field) => ({
          table_name: table.id,
          column_name: field,
        })),
      );
      expect(rows.map(({ table_name, column_name }) => ({
        table_name, column_name,
      }))).toEqual(expected.sort((a,b) =>
        a.table_name.localeCompare(b.table_name) ||
        v17Proposal.newTables.find(t => t.id === a.table_name)!.fields.indexOf(a.column_name) -
        v17Proposal.newTables.find(t => t.id === b.table_name)!.fields.indexOf(b.column_name)
      ));
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
