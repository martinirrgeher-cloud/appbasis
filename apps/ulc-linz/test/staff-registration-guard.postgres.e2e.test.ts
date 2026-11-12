import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresDatabase } from "../../../packages/database/src/client.ts";
import { UlcLinzAuthorizationDeniedError } from "../worker/authorization";
import { assertUlcStaffRegistrationGuard } from "../worker/staff-registration-guard";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl?.trim()) {
  describe.skip("N01.10 staff registration guard PostgreSQL E2E", () => {
    it("requires DATABASE_URL", () => {});
  });
} else {
  describe("N01.10 staff registration guard on isolated PostgreSQL", () => {
    const admin = createPostgresDatabase(databaseUrl);
    const isolatedName = "appbasis_n01_staff_" + randomUUID().replaceAll("-", "").slice(0, 12);
    const url = new URL(databaseUrl);
    url.pathname = "/" + isolatedName;

    let aClient: ReturnType<typeof createPostgresDatabase> | null = null;
    let bClient: ReturnType<typeof createPostgresDatabase> | null = null;
    let created = false;

    const organizationId = "n01-org";
    const foreignOrganizationId = "n01-other-org";
    const groupId = "n01-group";
    const otherGroupId = "n01-other-group";
    const foreignGroupId = "n01-foreign-group";
    const athleteId = "n01-athlete";
    const trainerId = "n01-trainer-subject";
    const actorAdmin = "n01-admin-identity";
    const actorTrainer = "n01-trainer-identity";
    const actorFunctionary = "n01-functionary-identity";
    const when = "2026-11-17";
    const capability = "ulc-linz:module:kindertraining:edit";

    function a() {
      if (!aClient) throw new Error("N01.10 isolated A missing.");
      return aClient.client;
    }

    function b() {
      if (!bClient) throw new Error("N01.10 isolated B missing.");
      return bClient.client;
    }

    function request(identityId: string, overrides: Partial<{
      organizationId: string; groupId: string; targetAthleteId: string; sessionDate: string;
    }> = {}) {
      return {
        actorIdentityId: identityId,
        organizationId: overrides.organizationId ?? organizationId,
        groupId: overrides.groupId ?? groupId,
        targetAthleteId: overrides.targetAthleteId ?? athleteId,
        sessionDate: overrides.sessionDate ?? when,
      };
    }

    async function guarded(input = request(actorTrainer)) {
      return a().begin((tx) => assertUlcStaffRegistrationGuard(tx, input));
    }

    async function seedActor(
      identity: string,
      sourceRole: "admin" | "trainer" | "functionary",
      subject: string,
    ) {
      await a().unsafe(
        `INSERT INTO "user" (id, name, email)
         VALUES ($1, $2, $3)`,
        [identity, identity, identity + "@n01.test.invalid"],
      );
      await a().unsafe(
        "INSERT INTO appbasis_identity_security_state (identity_id) VALUES ($1)",
        [identity],
      );
      await a().unsafe(
        `INSERT INTO ulc_linz_membership
           (identity_id, organization_id, subject_id, source_role)
         VALUES ($1, $2, $3, $4)`,
        [identity, organizationId, subject, sourceRole],
      );
      await a().unsafe(
        "INSERT INTO appbasis_permission_principal (principal_id) VALUES ($1)",
        [identity],
      );
      await a().unsafe(
        `INSERT INTO appbasis_permission_principal_role (principal_id, role_id)
         VALUES ($1, $2)`,
        [identity, "ulc-linz:" + sourceRole],
      );
    }

    beforeAll(async () => {
      await admin.client.unsafe("CREATE DATABASE " + isolatedName);
      created = true;
      aClient = createPostgresDatabase(url.toString());
      bClient = createPostgresDatabase(url.toString());

      const manifest = JSON.parse(await readFile(
        new URL("../appbasis.database.json", import.meta.url),
        "utf8",
      )) as { owners: readonly { migrations: readonly string[] }[] };
      for (const migration of manifest.owners.flatMap((owner) => owner.migrations)) {
        const sql = await readFile(new URL("../../../" + migration, import.meta.url), "utf8");
        for (const statement of sql.split("--> statement-breakpoint")) {
          if (statement.trim()) await a().unsafe(statement);
        }
      }

      await a().unsafe(
        "INSERT INTO appbasis_permission_capability (capability_id) VALUES ($1)",
        [capability],
      );
      for (const role of ["admin", "trainer", "functionary"]) {
        await a().unsafe(
          `INSERT INTO appbasis_permission_role
             (role_id, display_name, state, kind)
           VALUES ($1, $2, 'active', 'managed')`,
          ["ulc-linz:" + role, "N01 " + role],
        );
        // Functionary receives this test capability on purpose: the source
        // role restriction must still refuse proxy registration.
        await a().unsafe(
          `INSERT INTO appbasis_permission_role_capability
             (role_id, capability_id) VALUES ($1, $2)`,
          ["ulc-linz:" + role, capability],
        );
      }

      await a().unsafe(
        `INSERT INTO appbasis_training_group (id, organization_id, name)
         VALUES ($1, $2, 'N01 Guard Group'),
                ($3, $2, 'N01 Other Group'),
                ($4, $5, 'N01 Foreign Group')`,
        [groupId, organizationId, otherGroupId, foreignGroupId, foreignOrganizationId],
      );
      await a().unsafe(
        `INSERT INTO appbasis_athlete
           (id, organization_id, first_name, last_name)
         VALUES ($1, $2, 'N01', 'Athlete')`,
        [athleteId, organizationId],
      );
      await a().unsafe(
        `INSERT INTO appbasis_trainer
           (id, organization_id, first_name, last_name)
         VALUES ($1, $2, 'N01', 'Trainer')`,
        [trainerId, organizationId],
      );
      await a().unsafe(
        `INSERT INTO appbasis_trainer_group_membership
           (organization_id, trainer_id, group_id) VALUES ($1, $2, $3)`,
        [organizationId, trainerId, groupId],
      );
      await a().unsafe(
        `INSERT INTO appbasis_athlete_group_membership
           (organization_id, athlete_id, group_id, started_on)
         VALUES ($1, $2, $3, DATE '2026-11-01')`,
        [organizationId, athleteId, groupId],
      );
      await seedActor(actorAdmin, "admin", "n01-admin-subject");
      await seedActor(actorTrainer, "trainer", trainerId);
      await seedActor(actorFunctionary, "functionary", "n01-functionary-subject");
    }, 120_000);

    afterAll(async () => {
      if (aClient) {
        await aClient.client.end();
        aClient = null;
      }
      if (bClient) {
        await bClient.client.end();
        bClient = null;
      }
      if (created) {
        await admin.client.unsafe("DROP DATABASE " + isolatedName + " WITH (FORCE)");
      }
      await admin.client.end();
    }, 120_000);

    it("authorizes only correctly scoped active admin/trainer with the module edit capability", async () => {
      const administrator = await guarded(request(actorAdmin));
      expect(administrator).toEqual({
        sourceRole: "admin", actorIdentityId: actorAdmin,
        organizationId, groupId, targetAthleteId: athleteId,
      });
      const trainer = await guarded();
      expect(trainer).toEqual({
        sourceRole: "trainer", actorIdentityId: actorTrainer,
        organizationId, groupId, targetAthleteId: athleteId, trainerId,
      });
    });

    it("denies functionary even with capability, wrong organization, group, target or date", async () => {
      await expect(guarded(request(actorFunctionary)))
        .rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
      await expect(guarded(request(actorAdmin, { organizationId: foreignOrganizationId })))
        .rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
      await expect(guarded(request(actorAdmin, { groupId: foreignGroupId })))
        .rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
      await expect(guarded(request(actorTrainer, { groupId: otherGroupId })))
        .rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
      await expect(guarded(request(actorAdmin, { targetAthleteId: "n01-foreign-athlete" })))
        .rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
      await expect(guarded(request(actorTrainer, { sessionDate: "2026-10-31" })))
        .rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
      await expect(guarded(request(actorTrainer, { sessionDate: "2026-02-30" })))
        .rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
    });

    it("fails closed for user ban, identity disable, explicit revoke and inactive targets", async () => {
      try {
        await a().unsafe('UPDATE "user" SET banned = true WHERE id = $1', [actorTrainer]);
        await expect(guarded()).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
      } finally {
        await a().unsafe('UPDATE "user" SET banned = false WHERE id = $1', [actorTrainer]);
      }

      try {
        await a().unsafe(
          `UPDATE appbasis_identity_security_state SET disabled_at = now()
           WHERE identity_id = $1`,
          [actorTrainer],
        );
        await expect(guarded()).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
      } finally {
        await a().unsafe(
          `UPDATE appbasis_identity_security_state SET disabled_at = null
           WHERE identity_id = $1`,
          [actorTrainer],
        );
      }

      try {
        await a().unsafe(
          `INSERT INTO appbasis_permission_principal_revoke
             (principal_id, capability_id) VALUES ($1, $2)`,
          [actorTrainer, capability],
        );
        await expect(guarded()).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
      } finally {
        await a().unsafe(
          `DELETE FROM appbasis_permission_principal_revoke
           WHERE principal_id = $1 AND capability_id = $2`,
          [actorTrainer, capability],
        );
      }

      try {
        await a().unsafe("UPDATE appbasis_athlete SET is_active=false WHERE id=$1", [athleteId]);
        await expect(guarded()).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
      } finally {
        await a().unsafe("UPDATE appbasis_athlete SET is_active=true WHERE id=$1", [athleteId]);
      }

      try {
        await a().unsafe("UPDATE appbasis_training_group SET is_active=false WHERE id=$1", [groupId]);
        await expect(guarded()).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
      } finally {
        await a().unsafe("UPDATE appbasis_training_group SET is_active=true WHERE id=$1", [groupId]);
      }
    }, 30_000);

    it("holds account row lock until the guarded transaction commits", async () => {
      let signalReady!: () => void;
      let release!: () => void;
      const ready = new Promise<void>((resolve) => { signalReady = resolve; });
      const held = new Promise<void>((resolve) => { release = resolve; });

      const guardTransaction = a().begin(async (transaction) => {
        const isolation = await transaction.unsafe("SHOW transaction_isolation");
        expect(isolation[0]?.transaction_isolation).toBe("read committed");
        const scope = await assertUlcStaffRegistrationGuard(transaction, request(actorTrainer));
        signalReady();
        await held;
        return scope;
      });

      try {
        await Promise.race([
          ready,
          guardTransaction.then(() => {
            throw new Error("N01 guard transaction ended before signaling ready.");
          }),
        ]);

        await expect(b().begin(async (transaction) => {
          await transaction.unsafe("SET LOCAL lock_timeout = '750ms'");
          await transaction.unsafe("SET LOCAL statement_timeout = '5s'");
          return transaction.unsafe(
            'UPDATE "user" SET banned=true WHERE id=$1',
            [actorTrainer],
          );
        })).rejects.toMatchObject({ code: "55P03" });

        const rows = await b().unsafe('SELECT banned FROM "user" WHERE id=$1', [actorTrainer]);
        expect(rows[0]?.banned).not.toBe(true);
      } finally {
        release();
      }

      expect((await guardTransaction).sourceRole).toBe("trainer");

      try {
        await b().unsafe('UPDATE "user" SET banned=true WHERE id=$1', [actorTrainer]);
        await expect(guarded()).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
      } finally {
        await b().unsafe('UPDATE "user" SET banned=false WHERE id=$1', [actorTrainer]);
      }
    }, 25_000);
  });
}
