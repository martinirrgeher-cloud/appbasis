import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresDatabase } from "../../../packages/database/src/client.ts";
import { createBetterAuthRuntime } from "../../../packages/identity/src/better-auth.ts";
import {
  BetterAuthIdentityBackend,
  createIdentityRuntime,
} from "../../../packages/identity/src/server.ts";
import { UlcLinzAuthorizationDeniedError } from "../worker/authorization";
import { assertUlcStaffRegistrationGuard } from "../worker/staff-registration-guard";
import {
  assertActiveUlcStaffSession,
  assertUlcStaffSessionStillValid,
} from "../worker/staff-session-guard";
import { bindUlcStaffRegistrationWriter, withGuardedUlcStaffRegistration } from "../worker/staff-registration-transaction";
import { PostgresUlcTrainingSessionRepository, UlcTrainingSessionConflictError } from "../worker/training-session-postgres";
import {
  assignUlcIrgModuleGroup,
  UlcIrgModuleAssignmentConflictError,
} from "../worker/irg-module-administration";

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
        "INSERT INTO appbasis_identity_security_state (identity_id, must_change_password) VALUES ($1, false)",
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
      // Load the unpublished v17 candidate ONLY in the disposable test DB.
      // It is deliberately absent from the runtime migration manifest.
      const candidate = await readFile(new URL(
        "../migrations/0016_ulc_linz_registration_calendar.sql", import.meta.url,
      ), "utf8");
      for (const statement of candidate.split("--> statement-breakpoint")) {
        if (statement.trim()) await a().unsafe(statement);
      }
      // v18 review-only candidate is applied to the disposable CI DB only.
      const irgCandidate = await readFile(new URL(
        "../migrations/0017_ulc_linz_performance_registration_module.sql",
        import.meta.url,
      ), "utf8");
      for (const statement of irgCandidate.split("--> statement-breakpoint")) {
        if (statement.trim()) await a().unsafe(statement);
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
        `INSERT INTO appbasis_training_group (id, organization_id, name, attendance_mode)
         VALUES ($1, $2, 'N01 Guard Group', 'self_registration'),
                ($3, $2, 'N01 Other Group', 'trainer_roll_call'),
                ($4, $5, 'N01 Foreign Group', 'self_registration')`,
        [groupId, organizationId, otherGroupId, foreignGroupId, foreignOrganizationId],
      );
      await a().unsafe(
        `INSERT INTO ulc_linz_training_module_group
           (organization_id, module_id, group_id) VALUES ($1, 'kindertraining', $2)`,
        [organizationId, groupId],
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
        moduleId: "kindertraining", authorizationModuleId: "kindertraining", sessionDate: when,
      });
      const trainer = await guarded();
      expect(trainer).toEqual({
        sourceRole: "trainer", actorIdentityId: actorTrainer,
        organizationId, groupId, targetAthleteId: athleteId, trainerId,
        moduleId: "kindertraining", authorizationModuleId: "kindertraining", sessionDate: when,
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

    it("denies trainer-roll-call mode for both admin and trainer, even with valid membership", async () => {
      try {
        await a().unsafe(
          "UPDATE appbasis_training_group SET attendance_mode='trainer_roll_call' WHERE id=$1",
          [groupId],
        );
        await expect(guarded(request(actorAdmin)))
          .rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
        await expect(guarded(request(actorTrainer)))
          .rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
      } finally {
        await a().unsafe(
          "UPDATE appbasis_training_group SET attendance_mode='self_registration' WHERE id=$1",
          [groupId],
        );
      }
      expect((await guarded()).sourceRole).toBe("trainer");
    });

    it("holds group attendance-mode lock through transaction commit and rejects the changed mode", async () => {
      let signalReady!: () => void;
      let release!: () => void;
      const ready = new Promise<void>((resolve) => { signalReady = resolve; });
      const held = new Promise<void>((resolve) => { release = resolve; });

      const guardTransaction = a().begin(async (transaction) => {
        const scope = await assertUlcStaffRegistrationGuard(
          transaction,
          request(actorAdmin),
        );
        signalReady();
        await held;
        return scope;
      });

      try {
        await Promise.race([
          ready,
          guardTransaction.then(() => {
            throw new Error("N01 mode guard ended before ready.");
          }),
        ]);
        await expect(b().begin(async (transaction) => {
          await transaction.unsafe("SET LOCAL lock_timeout='750ms'");
          await transaction.unsafe("SET LOCAL statement_timeout='5s'");
          return transaction.unsafe(
            "UPDATE appbasis_training_group SET attendance_mode='trainer_roll_call' WHERE id=$1",
            [groupId],
          );
        })).rejects.toMatchObject({ code: "55P03" });
        const rows = await b().unsafe(
          "SELECT attendance_mode FROM appbasis_training_group WHERE id=$1",
          [groupId],
        );
        expect(rows[0]?.attendance_mode).toBe("self_registration");
      } finally {
        release();
      }

      expect((await guardTransaction).sourceRole).toBe("admin");

      try {
        await b().unsafe(
          "UPDATE appbasis_training_group SET attendance_mode='trainer_roll_call' WHERE id=$1",
          [groupId],
        );
        await expect(guarded(request(actorAdmin)))
          .rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
        await expect(guarded(request(actorTrainer)))
          .rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
      } finally {
        await b().unsafe(
          "UPDATE appbasis_training_group SET attendance_mode='self_registration' WHERE id=$1",
          [groupId],
        );
      }
    }, 25_000);

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

    it("N16 denies absent, mismatched, expired and impersonated Better Auth sessions", async () => {
      const sessionId = "n16-auth-session";
      await a().unsafe(
        `INSERT INTO "session" (id, token, user_id, expires_at, updated_at)
         VALUES ($1, $2, $3, now() + interval '1 hour', now())`,
        [sessionId, "n16-auth-token", actorTrainer],
      );
      await a().begin(async (tx) => {
        await assertActiveUlcStaffSession(tx, sessionId, actorTrainer);
        await assertUlcStaffSessionStillValid(tx, sessionId, actorTrainer);
        await expect(assertActiveUlcStaffSession(tx, "nonexistent", actorTrainer))
          .rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
        await expect(assertActiveUlcStaffSession(tx, sessionId, actorAdmin))
          .rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
        await expect(assertActiveUlcStaffSession(tx, " invalid ", actorTrainer))
          .rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
      });
      await a().unsafe(
        `UPDATE "session" SET impersonated_by = 'another-actor' WHERE id = $1`,
        [sessionId],
      );
      await expect(a().begin(tx =>
        assertActiveUlcStaffSession(tx, sessionId, actorTrainer),
      )).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
      await a().unsafe(
        `UPDATE "session" SET impersonated_by = null, expires_at = now() - interval '1 second'
          WHERE id = $1`,
        [sessionId],
      );
      await expect(a().begin(tx =>
        assertActiveUlcStaffSession(tx, sessionId, actorTrainer),
      )).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
    }, 30_000);

    it("N16 locks the exact Better Auth session row against concurrent logout/revoke DELETE", async () => {
      const sessionId = "n16-revoke-locked-session";
      await a().unsafe(
        `INSERT INTO "session" (id, token, user_id, expires_at, updated_at)
         VALUES ($1, $2, $3, now() + interval '1 hour', now())`,
        [sessionId, "n16-revoke-locked-token", actorTrainer],
      );
      let release!: () => void;
      let ready!: () => void;
      const held = new Promise<void>(resolve => { release = resolve; });
      const locked = new Promise<void>(resolve => { ready = resolve; });
      const active = a().begin(async tx => {
        await assertActiveUlcStaffSession(tx, sessionId, actorTrainer);
        ready();
        await held;
        await assertUlcStaffSessionStillValid(tx, sessionId, actorTrainer);
      });
      try {
        await locked;
        await expect(b().begin(async tx => {
          await tx.unsafe("SET LOCAL lock_timeout = '750ms'");
          await tx.unsafe("SET LOCAL statement_timeout = '5s'");
          await tx.unsafe('DELETE FROM "session" WHERE id = $1', [sessionId]);
        })).rejects.toMatchObject({ code: "55P03" });
        const stillPresent = await b().unsafe(
          'SELECT id FROM "session" WHERE id = $1', [sessionId],
        );
        expect(stillPresent).toHaveLength(1);
      } finally {
        release();
      }
      await active;
      await b().unsafe('DELETE FROM "session" WHERE id = $1', [sessionId]);
      await expect(a().begin(tx =>
        assertActiveUlcStaffSession(tx, sessionId, actorTrainer),
      )).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
    }, 30_000);

    it("N16 never starts staff writes without an authorized concrete session", async () => {
      const sessions = new PostgresUlcTrainingSessionRepository(a(), () => randomUUID());
      let enteredWrite = false;
      await expect(withGuardedUlcStaffRegistration(
        sessions, { ...request(actorTrainer), trustedSessionId: "missing-session" },
        async () => {
          enteredWrite = true;
        },
      )).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
      expect(enteredWrite).toBe(false);
    }, 30_000);

    it("N16 rolls back an already-created training session when the actor session expires during the write", async () => {
      const sessionId = "n16-short-lived-session";
      const sessionDate = "2026-11-25";
      await a().unsafe(
        `INSERT INTO "session" (id, token, user_id, expires_at, updated_at)
         VALUES ($1, $2, $3, clock_timestamp() + interval '2 seconds', now())`,
        [sessionId, "n16-short-lived-token", actorTrainer],
      );
      const sessions = new PostgresUlcTrainingSessionRepository(a(), () => randomUUID());
      let enteredWrite = false;
      await expect(withGuardedUlcStaffRegistration(
        sessions,
        { ...request(actorTrainer, { sessionDate }), trustedSessionId: sessionId },
        async (scoped, scope) => {
          expect(scope.sourceRole).toBe("trainer");
          enteredWrite = true;
          await scoped.ensureScheduledSession(
            organizationId, "kindertraining", groupId, sessionDate,
          );
          // PostgreSQL time, not a mocked clock: expiry happens inside the TX.
          await a().unsafe("SELECT pg_sleep(2.4)");
        },
      )).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
      expect(enteredWrite).toBe(true);
      expect(await sessions.readSession(
        organizationId, "kindertraining", groupId, sessionDate,
      )).toBeNull();
    }, 30_000);



    it("N16 explicitly mapped IRG uses performance grants, legacy storage and serializable authority", async () => {
      const irgId = "n16-authorized-irg";
      const cap = "ulc-linz:module:performance_registration:edit";
      await a().unsafe(
        `INSERT INTO appbasis_training_group (id,organization_id,name,attendance_mode)
         VALUES ($1,$2,'N16 mapped IRG','self_registration')`,
        [irgId,organizationId],
      );
      await a().unsafe(
        `INSERT INTO appbasis_athlete_group_membership
           (organization_id,athlete_id,group_id,started_on)
         VALUES ($1,$2,$3,DATE '2026-11-01')`,
        [organizationId,athleteId,irgId],
      );
      await a().unsafe(
        `INSERT INTO appbasis_trainer_group_membership
           (organization_id,trainer_id,group_id) VALUES ($1,$2,$3)`,
        [organizationId,trainerId,irgId],
      );
      await a().unsafe(
        "INSERT INTO appbasis_permission_capability (capability_id) VALUES ($1) ON CONFLICT DO NOTHING",
        [cap],
      );
      await a().unsafe(
        `INSERT INTO appbasis_permission_principal_grant
           (principal_id,capability_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [actorTrainer,cap],
      );
      await expect(guarded(request(actorTrainer,{groupId:irgId})))
        .rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
      await a().unsafe(
        `INSERT INTO ulc_linz_training_module_group
           (organization_id,module_id,group_id)
         VALUES ($1,'performance_registration',$2)`,
        [organizationId,irgId],
      );
      const scope=await guarded(request(actorTrainer,{groupId:irgId}));
      expect(scope).toMatchObject({
        actorIdentityId:actorTrainer,groupId:irgId,organizationId,
        targetAthleteId:athleteId,moduleId:"kindertraining",
        authorizationModuleId:"performance_registration",
      });
      // A performance-only trainer cannot silently acquire youth writes.
      await a().unsafe(
        `DELETE FROM appbasis_permission_role_capability
         WHERE role_id='ulc-linz:trainer' AND capability_id=$1`,[capability],
      );
      try {
        await expect(guarded()).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
        expect((await guarded(request(actorTrainer,{groupId:irgId}))).authorizationModuleId)
          .toBe("performance_registration");
      } finally {
        await a().unsafe(
          `INSERT INTO appbasis_permission_role_capability (role_id,capability_id)
           VALUES ('ulc-linz:trainer',$1)`,[capability],
        );
      }
      const tokenId="n16-explicit-irg-session";
      await a().unsafe(
        `INSERT INTO "session" (id,token,user_id,expires_at,updated_at)
         VALUES ($1,'n16-explicit-irg-token',$2,now()+interval '1 hour',now())`,
        [tokenId,actorTrainer],
      );
      const sessions=new PostgresUlcTrainingSessionRepository(a(),()=>randomUUID());
      const saved=await withGuardedUlcStaffRegistration(
        sessions,{...request(actorTrainer,{groupId:irgId}),trustedSessionId:tokenId},
        (scoped,scope)=>bindUlcStaffRegistrationWriter(scoped,scope).save("attending",null),
      );
      expect(saved).toMatchObject({
        athleteId,intention:"attending",updatedByIdentityId:actorTrainer,revision:1,
      });
      const snapshot=await sessions.readSession(organizationId,"kindertraining",irgId,when);
      expect(snapshot?.registrations).toHaveLength(1);
      const audit=await b().unsafe(
        `SELECT actor_identity_id,athlete_id,revision
         FROM ulc_linz_training_registration_change
         WHERE organization_id=$1 AND session_id=$2`,
        [organizationId,snapshot?.session.id??""],
      );
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        actor_identity_id:actorTrainer,athlete_id:athleteId,revision:1,
      });
      await expect(withGuardedUlcStaffRegistration(
        sessions,{...request(actorTrainer,{groupId:irgId}),trustedSessionId:tokenId},
        (scoped,scope)=>bindUlcStaffRegistrationWriter(scoped,scope).save("not_attending",null),
      )).rejects.toBeInstanceOf(UlcTrainingSessionConflictError);
      let release!:()=>void;let signal!:()=>void;
      const holding=new Promise<void>(r=>{release=r;});
      const ready=new Promise<void>(r=>{signal=r;});
      const active=a().begin(async tx=>{
        const current=await assertUlcStaffRegistrationGuard(
          tx,request(actorTrainer,{groupId:irgId}),
        );signal();await holding;return current;
      });
      try {
        await ready;
        await expect(b().begin(async tx=>{
          await tx.unsafe("SET LOCAL lock_timeout='750ms'");
          await tx.unsafe(
            `UPDATE ulc_linz_training_module_group SET module_id='u12'
             WHERE organization_id=$1 AND group_id=$2`,[organizationId,irgId],
          );
        })).rejects.toMatchObject({code:"55P03"});
        await expect(b().begin(async tx=>{
          await tx.unsafe("SET LOCAL lock_timeout='750ms'");
          await tx.unsafe(
            `DELETE FROM ulc_linz_training_module_group
             WHERE organization_id=$1 AND group_id=$2`,[organizationId,irgId],
          );
        })).rejects.toMatchObject({code:"55P03"});
      } finally {release();}
      expect((await active).authorizationModuleId).toBe("performance_registration");
    },90_000);

    it("N16 keeps IRG deny-by-default even with performance grants, youth grants and spoofed group names", async () => {
      // The real migration has no group->performance_registration authority.
      // Permissions alone cannot classify a self-registration group as IRG.
      const irgId = "n16-irg-capability-matrix";
      const performanceCapability = "ulc-linz:module:performance_registration:edit";
      await a().unsafe(
        `INSERT INTO appbasis_training_group
           (id, organization_id, name, attendance_mode)
         VALUES ($1, $2, 'IRG', 'self_registration')`,
        [irgId, organizationId],
      );
      await a().unsafe(
        `INSERT INTO appbasis_athlete_group_membership
           (organization_id, athlete_id, group_id, started_on)
         VALUES ($1, $2, $3, DATE '2026-11-01')`,
        [organizationId, athleteId, irgId],
      );
      await a().unsafe(
        `INSERT INTO appbasis_trainer_group_membership
           (organization_id, trainer_id, group_id)
         VALUES ($1, $2, $3)`,
        [organizationId, trainerId, irgId],
      );
      await a().unsafe(
        "INSERT INTO appbasis_permission_capability (capability_id) VALUES ($1) ON CONFLICT DO NOTHING",
        [performanceCapability],
      );
      await a().unsafe(
        `INSERT INTO appbasis_permission_principal_grant
           (principal_id, capability_id) VALUES ($1, $2), ($3, $2) ON CONFLICT DO NOTHING`,
        [actorTrainer, performanceCapability, actorAdmin],
      );

      // First prove a Leistungs-trainer-style identity with performance only
      // does not acquire youth permissions. Restore the shared fixture before
      // the remaining test cases.
      await a().unsafe(
        `DELETE FROM appbasis_permission_role_capability
         WHERE role_id = $1 AND capability_id = $2`,
        ["ulc-linz:trainer", capability],
      );
      try {
        await expect(guarded()).rejects.toBeInstanceOf(
          UlcLinzAuthorizationDeniedError,
        );
        await expect(guarded(request(actorTrainer, { groupId: irgId })))
          .rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
      } finally {
        await a().unsafe(
          `INSERT INTO appbasis_permission_role_capability (role_id, capability_id)
           VALUES ($1, $2)`,
          ["ulc-linz:trainer", capability],
        );
      }

      // Neither BOTH capabilities nor the admin role proves an IRG mapping.
      await expect(guarded(request(actorTrainer, { groupId: irgId })))
        .rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
      await expect(guarded(request(actorAdmin, { groupId: irgId })))
        .rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
      await expect(guarded(request(actorFunctionary, { groupId: irgId })))
        .rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);

      // A display-name change cannot mint authority. There is deliberately no
      // inference from the string 'Kindertraining' or attendance mode.
      await a().unsafe(
        `UPDATE appbasis_training_group SET name = 'Kindertraining'
         WHERE organization_id = $1 AND id = $2`,
        [organizationId, irgId],
      );
      await expect(guarded(request(actorTrainer, { groupId: irgId })))
        .rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
      await expect(guarded(request(actorAdmin, { groupId: irgId })))
        .rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
    }, 30_000);
    it("denies unmapped IRG and wrong youth module despite self-registration mode", async () => {
      const irg = "n16-unmapped-irg";
      await a().unsafe(
        `INSERT INTO appbasis_training_group (id, organization_id, name, attendance_mode)
         VALUES ($1,$2,'IRG unmapped','self_registration')`, [irg, organizationId],
      );
      await a().unsafe(
        `INSERT INTO appbasis_athlete_group_membership
           (organization_id, athlete_id, group_id, started_on)
         VALUES ($1,$2,$3,DATE '2026-11-01')`, [organizationId, athleteId, irg],
      );
      await expect(guarded(request(actorAdmin,{groupId:irg})))
        .rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
      try {
        await b().unsafe(
          `UPDATE ulc_linz_training_module_group SET module_id='u12'
           WHERE organization_id=$1 AND group_id=$2`, [organizationId,groupId],
        );
        await expect(guarded()).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
        await expect(guarded(request(actorAdmin)))
          .rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
      } finally {
        await b().unsafe(
          `UPDATE ulc_linz_training_module_group SET module_id='kindertraining'
           WHERE organization_id=$1 AND group_id=$2`, [organizationId,groupId],
        );
      }
    }, 30_000);

    it("holds the canonical group-module row lock until the guard transaction ends", async () => {
      let release!: () => void;
      let signal!: () => void;
      const holding = new Promise<void>(resolve => { release = resolve; });
      const locked = new Promise<void>(resolve => { signal = resolve; });
      const active = a().begin(async tx => {
        const scope = await assertUlcStaffRegistrationGuard(tx, request(actorTrainer));
        signal();
        await holding;
        return scope;
      });
      try {
        await locked;
        await expect(b().begin(async tx => {
          await tx.unsafe("SET LOCAL lock_timeout='750ms'");
          await tx.unsafe(
            `UPDATE ulc_linz_training_module_group SET module_id='u14'
             WHERE organization_id=$1 AND group_id=$2`, [organizationId,groupId],
          );
        })).rejects.toMatchObject({ code: "55P03" });
        await expect(b().begin(async tx => {
          await tx.unsafe("SET LOCAL lock_timeout='750ms'");
          await tx.unsafe(
            `DELETE FROM ulc_linz_training_module_group
             WHERE organization_id=$1 AND group_id=$2`, [organizationId,groupId],
          );
        })).rejects.toMatchObject({ code: "55P03" });
      } finally { release(); }
      expect((await active).moduleId).toBe("kindertraining");
      try {
        await b().unsafe(
          `DELETE FROM ulc_linz_training_module_group
           WHERE organization_id=$1 AND group_id=$2`, [organizationId,groupId],
        );
        await expect(guarded()).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
      } finally {
        await b().unsafe(
          `INSERT INTO ulc_linz_training_module_group (organization_id,module_id,group_id)
           VALUES ($1,'kindertraining',$2)`, [organizationId,groupId],
        );
      }
    }, 30_000);


    it("N16 serializes a REAL Better Auth password change and multi-session revoke with a guarded registration write", async () => {
      // This is the genuine Better Auth implementation, not a mock DELETE.
      // Only the isolated PostgreSQL database is touched; no external provider.
      if (!bClient) throw new Error("N16 isolated Better Auth connection missing.");
      const baseURL = "http://localhost:3000";
      const auth = createBetterAuthRuntime({
        database: bClient.database,
        baseURL,
        secret: "n16-postgres-real-password-race-local-test-secret",
      });
      const identity = createIdentityRuntime({
        auth,
        sql: b(),
        baseURL,
        trustedProvisioning: true,
      }).service;
      const username = "n16.real_password_race";
      const temporaryPassword = "N16-Temporary-Password-42";
      const workingPassword = "N16-Working-Password-84";
      const nextPassword = "N16-Replaced-Password-126";
      const staff = await identity.createInitialUser({
        username, temporaryPassword, displayName: "N16 Real Password Race",
      });
      // Complete the mandatory initial password change before granting Staff.
      const initial = await identity.signInWithUsername({
        username, password: temporaryPassword,
      });
      const activated = await identity.changeRequiredPassword({
        sessionToken: initial.sessionToken,
        currentPassword: temporaryPassword,
        newPassword: workingPassword,
        idempotencyKey: randomUUID(),
      });
      expect(activated.access).toBe("full");
      const staffSession = await identity.signInWithUsername({
        username, password: workingPassword,
      });
      const changeSession = await identity.signInWithUsername({
        username, password: workingPassword,
      });
      const current = await identity.getCurrentIdentity(staffSession.sessionToken);
      const changing = await identity.getCurrentIdentity(changeSession.sessionToken);
      const staffSessionId = current?.sessionId;
      if (!staffSessionId || !changing?.sessionId) {
        throw new Error("Canonical Better Auth session IDs are required.");
      }
      expect(current?.access).toBe("full");
      expect(current?.identity.identityId).toBe(staff.identityId);

      // Every identity/subject pair has a unique owner in the canonical
      // ULC membership table. Use a dedicated trainer subject instead of
      // attaching a second identity to the earlier fixture's trainer.
      const realTrainerId = "n16-real-password-race-trainer";
      await a().unsafe(
        `INSERT INTO appbasis_trainer
           (id, organization_id, first_name, last_name)
         VALUES ($1,$2,'Real','Password Race')`,
        [realTrainerId, organizationId],
      );
      await a().unsafe(
        `INSERT INTO appbasis_trainer_group_membership
           (organization_id, trainer_id, group_id)
         VALUES ($1,$2,$3)`,
        [organizationId, realTrainerId, groupId],
      );
      await a().unsafe(
        `INSERT INTO ulc_linz_membership
           (identity_id, organization_id, subject_id, source_role)
         VALUES ($1,$2,$3,'trainer')`,
        [staff.identityId, organizationId, realTrainerId],
      );
      await a().unsafe(
        "INSERT INTO appbasis_permission_principal (principal_id) VALUES ($1)",
        [staff.identityId],
      );
      await a().unsafe(
        `INSERT INTO appbasis_permission_principal_role (principal_id,role_id)
         VALUES ($1,'ulc-linz:trainer')`,
        [staff.identityId],
      );

      const sessions = new PostgresUlcTrainingSessionRepository(a(), () => randomUUID());
      const date = "2026-12-01";
      const before = await b().unsafe(
        `SELECT count(*)::int AS total FROM ulc_linz_training_registration_change
         WHERE organization_id=$1 AND actor_identity_id=$2`,
        [organizationId, staff.identityId],
      );
      let release!: () => void;
      let signal!: () => void;
      const hold = new Promise<void>(resolve => { release = resolve; });
      const written = new Promise<void>(resolve => { signal = resolve; });
      const guardedWrite = withGuardedUlcStaffRegistration(
        sessions,
        { ...request(staff.identityId, { sessionDate: date }),
          trustedSessionId: staffSessionId },
        async (scoped, scope) => {
          const saved = await bindUlcStaffRegistrationWriter(scoped, scope)
            .save("attending", null);
          signal();
          await hold;
          return saved;
        },
      );
      let changingPassword: Promise<unknown> | null = null;
      let completedPasswordChange = false;
      let passwordChangeError: unknown = null;
      try {
        // The staff write is already performed inside the TX; all its
        // authorization/session row locks remain held until transaction end.
        await Promise.race([
          written,
          guardedWrite.then(
            () => { throw new Error("Staff write committed before the lock check."); },
            error => { throw error; },
          ),
        ]);
        const backend = new BetterAuthIdentityBackend({
          auth, sql: b(), baseURL,
        });
        changingPassword = backend.changePassword({
          operationId: randomUUID(),
          sessionToken: changeSession.sessionToken,
          currentPassword: workingPassword,
          newPassword: nextPassword,
          revokeOtherSessions: true,
        }).then(
          result => {
            completedPasswordChange = true;
            return result;
          },
          error => {
            // Preserve failures until after we release the held transaction,
            // so test errors cannot leave unhandled provider rejections.
            passwordChangeError = error;
            return null;
          },
        );
        // Real Better Auth must wait before it can revoke the session row.
        await new Promise(resolve => setTimeout(resolve, 200));
        expect(completedPasswordChange).toBe(false);
        expect(await b().unsafe(
          'SELECT id FROM "session" WHERE id=$1 AND user_id=$2',
          [staffSessionId, staff.identityId],
        )).toHaveLength(1);
        // The uncommitted registration/audit is still invisible to B.
        expect(await b().unsafe(
          `SELECT id FROM ulc_linz_training_registration_change
           WHERE organization_id=$1 AND actor_identity_id=$2`,
          [organizationId, staff.identityId],
        )).toHaveLength(0);
      } finally {
        release();
      }
      const saved = await guardedWrite;
      if (!changingPassword) throw new Error("Real password change was never invoked.");
      await changingPassword;
      if (passwordChangeError !== null) throw passwordChangeError;
      expect(completedPasswordChange).toBe(true);
      expect(saved.updatedByIdentityId).toBe(staff.identityId);
      expect(await b().unsafe(
        'SELECT id FROM "session" WHERE id=$1', [staffSessionId],
      )).toHaveLength(0);
      const audit = await b().unsafe(
        `SELECT actor_identity_id, athlete_id, revision
         FROM ulc_linz_training_registration_change
         WHERE organization_id=$1 AND actor_identity_id=$2`,
        [organizationId, staff.identityId],
      );
      expect(audit).toHaveLength(Number(before[0]?.total ?? 0) + 1);
      expect(audit.at(-1)).toMatchObject({
        actor_identity_id: staff.identityId,
        athlete_id: athleteId,
        revision: 1,
      });
      await expect(identity.getCurrentIdentity(staffSession.sessionToken))
        .resolves.toBeNull();
      await expect(identity.getCurrentIdentity(changeSession.sessionToken))
        .resolves.toBeNull();

      // Never accept a stale, previously validated actor/session after revoke.
      let subsequentWriteCalled = false;
      await expect(withGuardedUlcStaffRegistration(
        sessions,
        { ...request(staff.identityId, { sessionDate: "2026-12-02" }),
          trustedSessionId: staffSessionId },
        async () => { subsequentWriteCalled = true; },
      )).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
      expect(subsequentWriteCalled).toBe(false);
      expect(await sessions.readSession(
        organizationId, "kindertraining", groupId, "2026-12-02",
      )).toBeNull();
    }, 90_000);

    it("enforces v17 extra/cancel days, CAS, deadlines and trustworthy audit on real staff writes", async () => {
      const authId = "n16-v17-guarded-session";
      await a().unsafe(
        `INSERT INTO "session" (id, token, user_id, expires_at, updated_at)
         VALUES ($1, $2, $3, now() + interval '1 hour', now())`,
        [authId, "n16-v17-guarded-token", actorTrainer],
      );
      const dates = await a().unsafe(
        `SELECT (date_trunc('week', clock_timestamp() AT TIME ZONE 'Europe/Vienna')
                 + interval '7 days')::date::text AS monday,
                (date_trunc('week', clock_timestamp() AT TIME ZONE 'Europe/Vienna')
                 + interval '8 days')::date::text AS tuesday`,
      );
      const monday = String(dates[0]?.monday);
      const tuesday = String(dates[0]?.tuesday);
      const sessions = new PostgresUlcTrainingSessionRepository(a(), () => randomUUID());
      async function save(day: string, revision: number | null,
                          intention: "attending" | "not_attending" = "attending") {
        return withGuardedUlcStaffRegistration(
          sessions, { ...request(actorTrainer, { sessionDate: day }), trustedSessionId: authId },
          (scoped, scope) => bindUlcStaffRegistrationWriter(scoped, scope)
            .save(intention, revision),
        );
      }

      await a().unsafe(
        `INSERT INTO ulc_linz_registration_calendar_rule
           (organization_id, group_id, weekdays_mask, weeks_ahead, late_mode)
         VALUES ($1, $2, 2, 26, 'block')`,
        [organizationId, groupId],
      );

      // Monday is disallowed until an independently stored extra-day rule
      // exists. Failed registration also rolls back session creation.
      await expect(save(monday, null)).rejects.toMatchObject({ code: "UL024" });
      expect(await sessions.readSession(
        organizationId, "kindertraining", groupId, monday,
      )).toBeNull();
      await a().unsafe(
        `INSERT INTO ulc_linz_registration_calendar_exception
           (organization_id, group_id, session_date, kind)
         VALUES ($1, $2, $3::date, 'extra')`,
        [organizationId, groupId, monday],
      );

      const created = await save(monday, null);
      expect(created.revision).toBe(1);
      expect(created.updatedByIdentityId).toBe(actorTrainer);
      const updated = await save(monday, 1, "not_attending");
      expect(updated.revision).toBe(2);
      await expect(save(monday, 1)).rejects.toBeInstanceOf(
        UlcTrainingSessionConflictError,
      );
      const audit = await a().unsafe(
        `SELECT revision, actor_identity_id, athlete_id
         FROM ulc_linz_training_registration_change
         WHERE organization_id = $1 AND session_id = $2 ORDER BY revision`,
        [organizationId, created.sessionId],
      );
      expect(audit.map(row => [row.revision, row.actor_identity_id, row.athlete_id]))
        .toEqual([[1, actorTrainer, athleteId], [2, actorTrainer, athleteId]]);

      // Calendar cancellation overrides a regular Tuesday training day.
      await a().unsafe(
        `INSERT INTO ulc_linz_registration_calendar_exception
           (organization_id, group_id, session_date, kind)
         VALUES ($1, $2, $3::date, 'cancelled')`,
        [organizationId, groupId, tuesday],
      );
      await expect(save(tuesday, null)).rejects.toMatchObject({ code: "UL024" });
      expect(await sessions.readSession(
        organizationId, "kindertraining", groupId, tuesday,
      )).toBeNull();

      // Next Monday is <=13 days ahead; 14 days prior is always expired.
      await a().unsafe(
        `UPDATE ulc_linz_registration_calendar_rule
         SET deadline_days_before=14, deadline_local_time='00:00', late_mode='block'
         WHERE organization_id=$1 AND group_id=$2`,
        [organizationId, groupId],
      );
      await expect(save(monday, 2)).rejects.toMatchObject({ code: "UL024" });
      const current = await a().unsafe(
        `SELECT revision, updated_by_identity_id
         FROM ulc_linz_training_registration
         WHERE organization_id=$1 AND session_id=$2 AND athlete_id=$3`,
        [organizationId, created.sessionId, athleteId],
      );
      expect(current[0]?.revision).toBe(2);
      expect(current[0]?.updated_by_identity_id).toBe(actorTrainer);
      const unchangedAudit = await a().unsafe(
        `SELECT count(*)::int AS total FROM ulc_linz_training_registration_change
         WHERE organization_id=$1 AND session_id=$2`,
        [organizationId, created.sessionId],
      );
      expect(unchangedAudit[0]?.total).toBe(2);
    }, 60_000);


    it("N16 denies unauthorized IRG mapping administration and audits the first assignment atomically", async () => {
      const capabilityAdmin="ulc-linz:module:athletes:edit";
      const sessionId="n16-admin-module-assign-session";
      // Mapping has UNIQUE (organization,module). A previous PG fixture has
      // intentionally already claimed IRG for organizationId, so create a
      // separate fully scoped organization/administrator for this admin flow.
      const mappingOrg="n16-mapping-only-org";
      const mappingAdmin="n16-mapping-only-admin";
      const mappedGroup="n16-audited-irg-group";
      const otherUnmapped="n16-audited-irg-other";
      const existingYouth="n16-audited-existing-youth";
      await a().unsafe(
        `INSERT INTO "user" (id,name,email)
         VALUES ($1,'N16 Mapping Admin','n16-mapping-admin@invalid.test')`,
        [mappingAdmin],
      );
      await a().unsafe(
        `INSERT INTO appbasis_identity_security_state
           (identity_id,must_change_password) VALUES ($1,false)`,
        [mappingAdmin],
      );
      await a().unsafe(
        `INSERT INTO ulc_linz_membership
           (identity_id,organization_id,subject_id,source_role)
         VALUES ($1,$2,$3,'admin')`,
        [mappingAdmin,mappingOrg,"n16-mapping-admin-subject"],
      );
      await a().unsafe(
        `INSERT INTO appbasis_permission_principal (principal_id) VALUES ($1)`,
        [mappingAdmin],
      );
      await a().unsafe(
        `INSERT INTO appbasis_permission_principal_role (principal_id,role_id)
         VALUES ($1,'ulc-linz:admin')`,
        [mappingAdmin],
      );
      await a().unsafe(
        "INSERT INTO appbasis_permission_capability (capability_id) VALUES ($1) ON CONFLICT DO NOTHING",
        [capabilityAdmin],
      );
      await a().unsafe(
        `INSERT INTO appbasis_permission_principal_grant
           (principal_id,capability_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [mappingAdmin,capabilityAdmin],
      );
      await a().unsafe(
        `INSERT INTO "session" (id,token,user_id,expires_at,updated_at)
         VALUES ($1,'n16-admin-module-assign-token',$2,now()+interval '1 hour',now())`,
        [sessionId,mappingAdmin],
      );
      await a().unsafe(
        `INSERT INTO appbasis_training_group(id,organization_id,name,attendance_mode)
         VALUES ($1,$4,'N16 Audited IRG','self_registration'),
                ($2,$4,'N16 Other IRG','self_registration'),
                ($3,$4,'N16 Existing Youth','self_registration')`,
        [mappedGroup,otherUnmapped,existingYouth,mappingOrg],
      );
      await a().unsafe(
        `INSERT INTO ulc_linz_training_module_group
           (organization_id,module_id,group_id)
         VALUES ($1,'kindertraining',$2)`,
        [mappingOrg,existingYouth],
      );
      const input={
        actorIdentityId:mappingAdmin,trustedSessionId:sessionId,
        organizationId:mappingOrg,groupId:mappedGroup,expectedRevision:null as null,
        reason:"Explicit IRG training group assignment after operator review",
      };
      await expect(assignUlcIrgModuleGroup(a(),{
        ...input,actorIdentityId:actorTrainer,
      })).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
      await expect(assignUlcIrgModuleGroup(a(),{
        ...input,actorIdentityId:actorFunctionary,
      })).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
      await expect(assignUlcIrgModuleGroup(a(),{
        ...input,groupId:existingYouth,
      })).rejects.toBeInstanceOf(UlcIrgModuleAssignmentConflictError);
      await expect(assignUlcIrgModuleGroup(a(),{
        ...input,organizationId:foreignOrganizationId,
      })).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
      await expect(assignUlcIrgModuleGroup(a(),{
        ...input,groupId:otherGroupId,
      })).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
      await expect(assignUlcIrgModuleGroup(a(),{
        ...input,expectedRevision:1 as never,
      })).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
      await expect(assignUlcIrgModuleGroup(a(),{
        ...input,reason:"bad",
      })).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
      expect((await b().unsafe(
        `SELECT group_id FROM ulc_linz_training_module_group
         WHERE organization_id=$1 AND group_id=$2`,[mappingOrg,mappedGroup],
      ))).toHaveLength(0);
      const result=await assignUlcIrgModuleGroup(a(),input);
      expect(result).toEqual({
        actorIdentityId:mappingAdmin,organizationId:mappingOrg,groupId:mappedGroup,
        moduleId:"performance_registration",
      });
      const records=await b().unsafe(
        `SELECT group_id,actor_identity_id,event_type,reason
         FROM ulc_linz_irg_module_assignment_audit
         WHERE organization_id=$1 AND group_id=$2`,[mappingOrg,mappedGroup],
      );
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        group_id:mappedGroup,actor_identity_id:mappingAdmin,event_type:"assign",
        reason:input.reason,
      });
      await expect(assignUlcIrgModuleGroup(a(),input))
        .rejects.toBeInstanceOf(UlcIrgModuleAssignmentConflictError);
      await expect(assignUlcIrgModuleGroup(a(),{
        ...input,groupId:otherUnmapped,
      })).rejects.toBeInstanceOf(UlcIrgModuleAssignmentConflictError);
      const count=await b().unsafe(
        `SELECT count(*)::int AS total FROM ulc_linz_irg_module_assignment_audit
         WHERE organization_id=$1`,[mappingOrg],
      );
      expect(count[0]?.total).toBe(1);
    },30_000);

    it("N16 keeps IRG assignment and audit locked until commit; revoked sessions cannot assign", async () => {
      const secondSession="n16-admin-module-race-session";
      const group="n16-module-race-group";
      await a().unsafe(
        `INSERT INTO appbasis_training_group (id,organization_id,name,attendance_mode)
         VALUES ($1,$2,'IRG N16 module race','self_registration')`,
        [group,organizationId],
      );
      await a().unsafe(
        `INSERT INTO "session" (id,token,user_id,expires_at,updated_at)
         VALUES ($1,'n16-admin-module-race-token',$2,now()+interval '1 hour',now())`,
        [secondSession,actorAdmin],
      );
      const args={
        actorIdentityId:actorAdmin,trustedSessionId:secondSession,
        organizationId,groupId:group,expectedRevision:null as null,
        reason:"Authoritative trainer group mapping for security race",
      };
      const db=a();
      const before=await db.unsafe(
        `SELECT id FROM appbasis_training_group WHERE id=$1`,[group],
      );
      expect(before).toHaveLength(1);
      // A concurrent transaction pins the physical group row before mapping.
      let resume!:()=>void;
      let started!:()=>void;
      const held=new Promise<void>(resolve=>{resume=resolve;});
      const ready=new Promise<void>(resolve=>{started=resolve;});
      const locking=a().begin(async tx=>{
        await tx.unsafe(
          `SELECT id FROM appbasis_training_group WHERE id=$1 FOR UPDATE`,[group],
        );
        started();
        await held;
      });
      try {
        await ready;
        await expect(b().begin(async tx=>{
          await tx.unsafe("SET LOCAL lock_timeout='750ms'");
          await tx.unsafe(
            `SELECT id FROM appbasis_training_group WHERE id=$1 FOR UPDATE`,[group],
          );
        })).rejects.toMatchObject({code:"55P03"});
        expect((await b().unsafe(
          `SELECT group_id FROM ulc_linz_irg_module_assignment_audit
           WHERE organization_id=$1 AND group_id=$2`,[organizationId,group],
        ))).toHaveLength(0);
      } finally {resume();}
      await locking;
      await a().unsafe(
        `DELETE FROM "session" WHERE id=$1`,[secondSession],
      );
      await expect(assignUlcIrgModuleGroup(a(),args))
        .rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
      expect((await b().unsafe(
        `SELECT group_id FROM ulc_linz_training_module_group
         WHERE organization_id=$1 AND group_id=$2`,[organizationId,group],
      ))).toHaveLength(0);
    },30_000);

    it("denies password-change-required and serializes a concurrent identity policy change", async () => {
      const authId = "n16-password-policy-session";
      await a().unsafe(
        `INSERT INTO "session" (id, token, user_id, expires_at, updated_at)
         VALUES ($1, $2, $3, now() + interval '1 hour', now())`,
        [authId, "n16-password-policy-token", actorTrainer],
      );
      const sessions = new PostgresUlcTrainingSessionRepository(a(), () => randomUUID());
      try {
        await b().unsafe(
          `UPDATE appbasis_identity_security_state SET must_change_password=true
           WHERE identity_id=$1`, [actorTrainer],
        );
        let enteredWrite = false;
        await expect(withGuardedUlcStaffRegistration(
          sessions, { ...request(actorTrainer), trustedSessionId: authId },
          async () => { enteredWrite = true; },
        )).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
        expect(enteredWrite).toBe(false);
      } finally {
        await b().unsafe(
          `UPDATE appbasis_identity_security_state SET must_change_password=false
           WHERE identity_id=$1`, [actorTrainer],
        );
      }

      let release!: () => void;
      let signal!: () => void;
      const holding = new Promise<void>(resolve => { release = resolve; });
      const ready = new Promise<void>(resolve => { signal = resolve; });
      const active = a().begin(async tx => {
        const scope = await assertUlcStaffRegistrationGuard(tx, request(actorTrainer));
        signal();
        await holding;
        return scope;
      });
      try {
        await ready;
        await expect(b().begin(async tx => {
          await tx.unsafe("SET LOCAL lock_timeout='750ms'");
          await tx.unsafe(
            `UPDATE appbasis_identity_security_state SET must_change_password=true
             WHERE identity_id=$1`, [actorTrainer],
          );
        })).rejects.toMatchObject({ code: "55P03" });
      } finally { release(); }
      expect((await active).actorIdentityId).toBe(actorTrainer);
      try {
        await b().unsafe(
          `UPDATE appbasis_identity_security_state SET must_change_password=true
           WHERE identity_id=$1`, [actorTrainer],
        );
        await expect(guarded()).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
      } finally {
        await b().unsafe(
          `UPDATE appbasis_identity_security_state SET must_change_password=false
           WHERE identity_id=$1`, [actorTrainer],
        );
      }
    }, 30_000);
  });
}
