import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresAthleteMasterdataRepository } from "@appbasis/athletes";
import { createPostgresDatabase } from "../../../packages/database/src/client.ts";
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
          (organization_id, group_id, session_date, approved_by_identity_id)
         VALUES ($1, $2, $3::date, $4)`,
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
