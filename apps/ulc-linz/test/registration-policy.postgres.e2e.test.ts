import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresAthleteMasterdataRepository } from "@appbasis/athletes";
import { createPostgresDatabase } from "../../../packages/database/src/client.ts";
import { PostgresUlcTrainingSessionRepository } from "../worker/training-session-postgres";
import {
  PostgresUlcRegistrationPolicyRepository,
  UlcRegistrationPolicyConflictError,
  UlcRegistrationPolicyDataError,
} from "../worker/registration-policy-postgres";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  describe.skip("A02.4 registration-policy PostgreSQL E2E", () => {
    it("requires DATABASE_URL", () => {});
  });
} else {
  describe("A02.4 registration-policy PostgreSQL E2E, unpublished migration", () => {
    const admin = createPostgresDatabase(databaseUrl);
    const dbName = "appbasis_ulc_a024_" +
      randomUUID().replaceAll("-", "").slice(0, 10);
    const url = new URL(databaseUrl);
    url.pathname = "/" + dbName;
    let target: ReturnType<typeof createPostgresDatabase> | null = null;
    let created = false;

    function connection() {
      if (!target) throw new Error("The isolated A02.4 DB was not initialized.");
      return target;
    }

    beforeAll(async () => {
      await admin.client.unsafe("CREATE DATABASE " + dbName);
      created = true;
      target = createPostgresDatabase(url.toString());
      const manifest = JSON.parse(await readFile(
        new URL("../appbasis.database.json", import.meta.url), "utf8",
      )) as { owners: readonly { migrations: readonly string[] }[] };
      const paths = manifest.owners.flatMap((owner) => owner.migrations);
      // The new v12 migration is deliberately not published in the manifest
      // while full registration writer/permission integration is incomplete.
      if (paths.length !== 36 || paths.some((path) => path.endsWith("0011_ulc_linz_registration_schedule.sql"))) {
        throw new Error("Unexpected registered migration state for A02.4.");
      }
      for (const path of [...paths, "apps/ulc-linz/migrations/0011_ulc_linz_registration_schedule.sql"]) {
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
    });

    it("requires active same-organization self-registration group and CAS revision", async () => {
      const athletes = new PostgresAthleteMasterdataRepository(
        connection().client, () => randomUUID(),
      );
      const policy = new PostgresUlcRegistrationPolicyRepository(connection().client);
      const group = await athletes.createTrainingGroup("verein-a02", {
        name: "Leistungsgruppe A", attendanceMode: "self_registration",
      });
      const otherMode = await athletes.createTrainingGroup("verein-a02", {
        name: "Kindertraining", attendanceMode: "trainer_roll_call",
      });
      const defaultSchedule = {
        weekdays: [1, 3, 5], weeksAhead: 5,
        deadline: { daysBefore: 1, localTime: "18:00" }, lateMode: "block",
      };

      expect(await policy.read("verein-a02", group.id)).toBeNull();
      const saved = await policy.save("verein-a02", group.id,
        "admin-identity", null, defaultSchedule);
      expect(saved).toEqual({
        revision: 1, schedule: defaultSchedule,
      });
      expect(await policy.read("verein-a02", group.id)).toEqual(saved);
      await expect(policy.save("verein-a02", group.id,
        "admin-identity", null, defaultSchedule))
        .rejects.toBeInstanceOf(UlcRegistrationPolicyConflictError);

      const next = await policy.save("verein-a02", group.id,
        "admin-identity-2", saved.revision, {
          ...defaultSchedule, weekdays: [2, 4], lateMode: "allow", deadline: null,
        });
      expect(next).toMatchObject({
        revision: 2, schedule: {
          weekdays: [2, 4], lateMode: "allow", deadline: null,
        },
      });
      const audit = await connection().client.unsafe(
        `SELECT revision, updated_by_identity_id
         FROM ulc_linz_registration_group_policy
         WHERE organization_id = $1 AND group_id = $2`,
        ["verein-a02", group.id],
      );
      expect(audit).toEqual([{ revision: 2, updated_by_identity_id: "admin-identity-2" }]);

      await expect(policy.save("verein-a02", group.id,
        "admin-identity", saved.revision, defaultSchedule))
        .rejects.toBeInstanceOf(UlcRegistrationPolicyConflictError);
      await expect(policy.save("foreign-org", group.id,
        "admin-identity", null, defaultSchedule))
        .rejects.toBeInstanceOf(UlcRegistrationPolicyConflictError);
      await expect(policy.save("verein-a02", otherMode.id,
        "admin-identity", null, defaultSchedule))
        .rejects.toBeInstanceOf(UlcRegistrationPolicyConflictError);
      await expect(policy.save("verein-a02", "missing-group",
        "admin-identity", null, defaultSchedule))
        .rejects.toBeInstanceOf(UlcRegistrationPolicyConflictError);
      expect(await policy.read("foreign-org", group.id)).toBeNull();
    });

    it("never infers explicit extra-day approval from a prior registration session", async () => {
      const athletes = new PostgresAthleteMasterdataRepository(
        connection().client, () => randomUUID(),
      );
      const policy = new PostgresUlcRegistrationPolicyRepository(connection().client);
      const group = await athletes.createTrainingGroup("verein-exception", {
        name: "Leistungsgruppe B", attendanceMode: "self_registration",
      });
      expect(await policy.isApprovedExtraDay("verein-exception", group.id, "2026-11-07"))
        .toBe(false);
      // This direct SQL is a privileged fixture, not a callable user route.
      await connection().client.unsafe(
        `INSERT INTO ulc_linz_registration_extra_day
          (organization_id, group_id, session_date, approved_by_identity_id, updated_by_identity_id)
         VALUES ($1, $2, $3::date, $4, $4)`,
        ["verein-exception", group.id, "2026-11-07", "admin-actor"],
      );
      expect(await policy.isApprovedExtraDay("verein-exception", group.id, "2026-11-07"))
        .toBe(true);
      expect(await policy.isApprovedExtraDay("other-org", group.id, "2026-11-07"))
        .toBe(false);
      expect(await policy.isApprovedExtraDay("verein-exception", group.id, "2026-11-08"))
        .toBe(false);
      await expect(policy.isApprovedExtraDay("verein-exception", group.id, "2026-02-30"))
        .rejects.toBeInstanceOf(UlcRegistrationPolicyDataError);
    });

    it("rejects direct DB registration outside configured days and deadlines", async () => {
      const db = connection().client;
      const athletes = new PostgresAthleteMasterdataRepository(db, () => randomUUID());
      const sessions = new PostgresUlcTrainingSessionRepository(db, () => randomUUID());
      const repository = new PostgresUlcRegistrationPolicyRepository(db);
      const organizationId = "verein-guard";
      const group = await athletes.createTrainingGroup(organizationId, {
        name: "Trainingsgruppe Regeln", attendanceMode: "self_registration",
      });
      const athlete = await athletes.createAthlete(organizationId, {
        firstName: "Karin", lastName: "Guard",
      });
      await athletes.createAthleteGroupMembership(organizationId, {
        athleteId: athlete.id, groupId: group.id, startedOn: "2020-01-01",
      });

      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Vienna",
        year: "numeric", month: "2-digit", day: "2-digit",
      }).formatToParts(new Date());
      const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
      const today = part("year") + "-" + part("month") + "-" + part("day");
      const plusDays = (date: string, days: number) => {
        const value = new Date(date + "T12:00:00Z");
        value.setUTCDate(value.getUTCDate() + days);
        return value.toISOString().slice(0, 10);
      };
      const isoDay = (date: string) => {
        const day = new Date(date + "T12:00:00Z").getUTCDay();
        return day === 0 ? 7 : day;
      };
      const permittedDate = Array.from({ length: 7 }, (_, i) => plusDays(today, i + 1))
        .find((day) => isoDay(day) === 3);
      if (!permittedDate) throw new Error("Unable to find next Wednesday");
      const forbiddenDate = plusDays(permittedDate, 1);
      const schedule = {
        weekdays: [3], weeksAhead: 26, deadline: null, lateMode: "block",
      };
      const policy = await repository.save(
        organizationId, group.id, "policy-actor", null, schedule,
      );

      const allowed = await sessions.ensureScheduledSession(
        organizationId, "kindertraining", group.id, permittedDate,
      );
      const registered = await sessions.saveRegistration(
        organizationId, allowed.session.id, athlete.id, "attending", null, "actor-identity",
      );
      expect(registered.revision).toBe(1);

      // The old ensureScheduledSession path can create an ad-hoc session,
      // but its presence alone no longer grants an editable registration.
      const adHoc = await sessions.ensureScheduledSession(
        organizationId, "kindertraining", group.id, forbiddenDate,
      );
      await expect(sessions.saveRegistration(
        organizationId, adHoc.session.id, athlete.id, "attending", null, "actor-identity",
      )).rejects.toThrow();
      const deniedCount = await db.unsafe(
        `SELECT count(*)::int AS total
         FROM ulc_linz_training_registration WHERE session_id = $1`,
        [adHoc.session.id],
      );
      expect(deniedCount).toEqual([{ total: 0 }]);

      // A transactional self-registration write must also roll back the
      // ad-hoc session itself if its registration violates the policy.
      const transactionalForbiddenDate = plusDays(forbiddenDate, 7);
      await expect(sessions.withRegistrationTransaction(async (scoped) => {
        const pending = await scoped.ensureScheduledSession(
          organizationId, "kindertraining", group.id, transactionalForbiddenDate,
        );
        return scoped.saveRegistration(
          organizationId, pending.session.id, athlete.id,
          "attending", null, "actor-identity",
        );
      })).rejects.toThrow();
      expect(await sessions.readSession(
        organizationId, "kindertraining", group.id, transactionalForbiddenDate,
      )).toBeNull();

      // Only the separate privileged approval makes an exceptional day writable.
      await db.unsafe(
        `INSERT INTO ulc_linz_registration_extra_day
           (organization_id, group_id, session_date, approved_by_identity_id, updated_by_identity_id)
         VALUES ($1, $2, $3::date, $4, $4)`,
        [organizationId, group.id, forbiddenDate, "policy-admin"],
      );
      await expect(sessions.saveRegistration(
        organizationId, adHoc.session.id, athlete.id, "attending", null, "actor-identity",
      )).resolves.toMatchObject({ revision: 1 });

      // Revoking a once-approved exception closes even an already-existing
      // registration. History and previous intention are retained unchanged.
      expect(await repository.readExtraDay(organizationId, group.id, forbiddenDate))
        .toEqual({ approved: true, revision: 1 });
      await repository.setExtraDay(
        organizationId, group.id, forbiddenDate, "admin-revoke", false, 1,
      );
      await expect(sessions.saveRegistration(
        organizationId, adHoc.session.id, athlete.id, "maybe", 1, "actor-identity",
      )).rejects.toThrow();
      const afterRevocation = await db.unsafe(
        `SELECT intention, revision FROM ulc_linz_training_registration
         WHERE session_id = $1 AND athlete_id = $2`,
        [adHoc.session.id, athlete.id],
      );
      expect(afterRevocation).toEqual([{ intention: "attending", revision: 1 }]);

      // The deadline changes atomically via CAS. An existing registration
      // does not let a direct UPDATE bypass the new closed window.
      await repository.save(organizationId, group.id, "policy-actor",
        policy.revision, {
          ...schedule, deadline: { daysBefore: 14, localTime: "00:00" },
        });
      await expect(sessions.saveRegistration(
        organizationId, allowed.session.id, athlete.id, "maybe", 1, "actor-identity",
      )).rejects.toThrow();
      const unchanged = await db.unsafe(
        `SELECT intention, revision FROM ulc_linz_training_registration
         WHERE session_id = $1 AND athlete_id = $2`,
        [allowed.session.id, athlete.id],
      );
      expect(unchanged).toEqual([{ intention: "attending", revision: 1 }]);
    });

    it("approves, revokes and reapproves extra days with atomic revision history", async () => {
      const db = connection().client;
      const athletes = new PostgresAthleteMasterdataRepository(db, () => randomUUID());
      const repository = new PostgresUlcRegistrationPolicyRepository(db);
      const group = await athletes.createTrainingGroup("verein-exception-audit", {
        name: "Gruppe Sondertermine", attendanceMode: "self_registration",
      });
      const other = await athletes.createTrainingGroup("verein-exception-audit", {
        name: "Trainergruppe", attendanceMode: "trainer_roll_call",
      });
      const friday = (reference: Date) => {
        const weekday = reference.getUTCDay() || 7;
        reference.setUTCDate(reference.getUTCDate() + ((5 - weekday + 7) % 7) + 7);
        return reference.toISOString().slice(0, 10);
      };
      const date = friday(new Date());
      const schedule = {
        weekdays: [1, 3], weeksAhead: 10, deadline: null, lateMode: "allow",
      };
      await repository.save("verein-exception-audit", group.id, "owner", null, schedule);
      expect(await repository.readExtraDay("verein-exception-audit", group.id, date))
        .toBeNull();
      await expect(repository.setExtraDay(
        "verein-exception-audit", other.id, date, "actor", true, null,
      )).rejects.toBeInstanceOf(UlcRegistrationPolicyConflictError);
      await expect(repository.setExtraDay(
        "other-org", group.id, date, "actor", true, null,
      )).rejects.toBeInstanceOf(UlcRegistrationPolicyConflictError);
      await expect(repository.setExtraDay(
        "verein-exception-audit", group.id, date, "actor", false, null,
      )).rejects.toBeInstanceOf(UlcRegistrationPolicyConflictError);
      const approved = await repository.setExtraDay(
        "verein-exception-audit", group.id, date, "admin-one", true, null,
      );
      expect(approved).toEqual({ approved: true, revision: 1 });
      expect(await repository.isApprovedExtraDay("verein-exception-audit", group.id, date))
        .toBe(true);
      await expect(repository.setExtraDay(
        "verein-exception-audit", group.id, date, "stale", false, null,
      )).rejects.toBeInstanceOf(UlcRegistrationPolicyConflictError);
      const revoked = await repository.setExtraDay(
        "verein-exception-audit", group.id, date, "admin-two", false, 1,
      );
      expect(revoked).toEqual({ approved: false, revision: 2 });
      expect(await repository.isApprovedExtraDay("verein-exception-audit", group.id, date))
        .toBe(false);
      await expect(repository.setExtraDay(
        "verein-exception-audit", group.id, date, "stale", true, 1,
      )).rejects.toBeInstanceOf(UlcRegistrationPolicyConflictError);
      const reapproved = await repository.setExtraDay(
        "verein-exception-audit", group.id, date, "admin-three", true, 2,
      );
      expect(reapproved).toEqual({ approved: true, revision: 3 });
      const history = await db.unsafe(
        `SELECT revision, is_approved, actor_identity_id
         FROM ulc_linz_registration_extra_day_change
         WHERE organization_id = $1 AND group_id = $2 AND session_date = $3::date
         ORDER BY revision`,
        ["verein-exception-audit", group.id, date],
      );
      expect(history).toEqual([
        { revision: 1, is_approved: true, actor_identity_id: "admin-one" },
        { revision: 2, is_approved: false, actor_identity_id: "admin-two" },
        { revision: 3, is_approved: true, actor_identity_id: "admin-three" },
      ]);
      expect(await repository.readExtraDay("other-org", group.id, date)).toBeNull();
    });

    it("rechecks active trainer membership and group assignment inside extra-day writes", async () => {
      const db = connection().client;
      const org = "verein-trainer-scoped-extras";
      const athletes = new PostgresAthleteMasterdataRepository(db, () => randomUUID());
      const repo = new PostgresUlcRegistrationPolicyRepository(db);
      const trainer = await athletes.createTrainer(org, {
        firstName: "Martina", lastName: "Sprint",
      });
      const assigned = await athletes.createTrainingGroup(org, {
        name: "Assigned self registration", attendanceMode: "self_registration",
      });
      const other = await athletes.createTrainingGroup(org, {
        name: "Other self registration", attendanceMode: "self_registration",
      });
      await athletes.createTrainerGroupMembership(org, {
        trainerId: trainer.id, groupId: assigned.id,
      });
      const actor = "trainer-extra-identity";
      await db.unsafe(
        `INSERT INTO ulc_linz_membership
           (identity_id, organization_id, subject_id, source_role, active)
         VALUES ($1, $2, $3, 'trainer', true)`,
        [actor, org, trainer.id],
      );
      const policy = {
        weekdays: [1, 3], weeksAhead: 12, deadline: null, lateMode: "allow",
      };
      await repo.save(org, assigned.id, "admin", null, policy);
      await repo.save(org, other.id, "admin", null, policy);
      const localDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Vienna", year: "numeric", month: "2-digit", day: "2-digit",
      }).format(new Date());
      const date = new Date(localDate + "T12:00:00Z");
      let upcomingFriday = "";
      for (let i = 1; i <= 10; i++) {
        date.setUTCDate(date.getUTCDate() + 1);
        if (date.getUTCDay() === 5) {
          upcomingFriday = date.toISOString().slice(0, 10);
          break;
        }
      }
      if (!upcomingFriday) throw new Error("No Friday in the next 10 days");
      const approve = (groupId: string, expected: number | null, trainerId: string | null) =>
        repo.setExtraDay(org, groupId, upcomingFriday, actor, true, expected, trainerId);
      await expect(approve(other.id, null, trainer.id))
        .rejects.toBeInstanceOf(UlcRegistrationPolicyConflictError);
      await expect(approve(assigned.id, null, "another-trainer"))
        .rejects.toBeInstanceOf(UlcRegistrationPolicyConflictError);
      expect(await approve(assigned.id, null, trainer.id))
        .toEqual({ approved: true, revision: 1 });
      await db.unsafe(
        `DELETE FROM appbasis_trainer_group_membership
         WHERE organization_id = $1 AND trainer_id = $2 AND group_id = $3`,
        [org, trainer.id, assigned.id],
      );
      await expect(repo.setExtraDay(
        org, assigned.id, upcomingFriday, actor, false, 1, trainer.id,
      )).rejects.toBeInstanceOf(UlcRegistrationPolicyConflictError);
      expect(await repo.readExtraDay(org, assigned.id, upcomingFriday))
        .toEqual({ approved: true, revision: 1 });
      // Explicit organization-wide administrator can still revoke after a
      // trainer loses the assignment, without granting the trainer access.
      await expect(repo.setExtraDay(
        org, assigned.id, upcomingFriday, "admin", false, 1,
      )).resolves.toEqual({ approved: false, revision: 2 });
    });

    it("rejects malformed stored policy values with database constraints", async () => {
      await expect(connection().client.unsafe(
        `INSERT INTO ulc_linz_registration_group_policy
           (organization_id, group_id, weekdays_mask, weeks_ahead,
            deadline_days_before, deadline_local_time, late_mode,
            updated_by_identity_id)
         VALUES ('org-invalid', 'group-invalid', 128, 2, NULL, NULL, 'allow', 'actor')`,
      )).rejects.toThrow();
      await expect(connection().client.unsafe(
        `INSERT INTO ulc_linz_registration_group_policy
           (organization_id, group_id, weekdays_mask, weeks_ahead,
            deadline_days_before, deadline_local_time, late_mode,
            updated_by_identity_id)
         VALUES ('org-invalid', 'group-invalid', 1, 2, 1, NULL, 'allow', 'actor')`,
      )).rejects.toThrow();
    });
  });
}
