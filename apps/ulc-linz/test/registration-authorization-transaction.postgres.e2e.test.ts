import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresDatabase } from "../../../packages/database/src/client.ts";
import {
  PostgresUlcTrainingSessionRepository,
  type UlcTrainingSessionSqlClient,
} from "../worker/training-session-postgres";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl?.trim()) {
  describe.skip("N01 transactional registration guard PostgreSQL E2E", () => {
    it("requires DATABASE_URL", () => {});
  });
} else {
  describe("N01 guarded registration uses one real PostgreSQL transaction", () => {
    const administrator = createPostgresDatabase(databaseUrl);
    const databaseName = "appbasis_n01_guard_" + randomUUID().replaceAll("-", "").slice(0, 12);
    const connectionUrl = new URL(databaseUrl);
    connectionUrl.pathname = "/" + databaseName;

    const organizationId = "n01-guard-organization";
    const trainerId = "n01-guard-trainer";
    const groupId = "n01-guard-group";
    const registrationDate = "2026-12-08";
    const rollbackDate = "2026-12-09";
    const deniedDate = "2026-12-10";

    let connectionA: ReturnType<typeof createPostgresDatabase> | null = null;
    let connectionB: ReturnType<typeof createPostgresDatabase> | null = null;
    let databaseCreated = false;

    function a() {
      if (connectionA === null) throw new Error("N01 isolated PostgreSQL A is missing.");
      return connectionA.client;
    }

    function b() {
      if (connectionB === null) throw new Error("N01 isolated PostgreSQL B is missing.");
      return connectionB.client;
    }

    function sessions() {
      return new PostgresUlcTrainingSessionRepository(a(), () => randomUUID());
    }

    async function verifyTrainerGroup(
      transaction: UlcTrainingSessionSqlClient,
      requestedTrainerId: string,
    ) {
      const isolation = await transaction.unsafe("SHOW transaction_isolation");
      expect(isolation[0]?.transaction_isolation).toBe("read committed");

      // This test supplies the lock contract; the production actor guard is
      // deliberately NOT implemented by this slice.
      const rows = await transaction.unsafe(
        `SELECT link.group_id
           FROM appbasis_trainer_group_membership AS link
           JOIN appbasis_trainer AS trainer
             ON trainer.id = link.trainer_id
            AND trainer.organization_id = link.organization_id
           JOIN appbasis_training_group AS training_group
             ON training_group.id = link.group_id
            AND training_group.organization_id = link.organization_id
          WHERE link.organization_id = $1
            AND link.trainer_id = $2
            AND link.group_id = $3
            AND trainer.is_active = true
            AND training_group.is_active = true
          FOR SHARE OF link, trainer, training_group`,
        [organizationId, requestedTrainerId, groupId],
      );
      if (rows.length !== 1) throw new Error("N01_TEST_ACTOR_DENIED");
    }

    beforeAll(async () => {
      await administrator.client.unsafe("CREATE DATABASE " + databaseName);
      databaseCreated = true;
      connectionA = createPostgresDatabase(connectionUrl.toString());
      connectionB = createPostgresDatabase(connectionUrl.toString());

      const manifest = JSON.parse(await readFile(
        new URL("../appbasis.database.json", import.meta.url),
        "utf8",
      )) as { owners: readonly { migrations: readonly string[] }[] };
      for (const migration of manifest.owners.flatMap((owner) => owner.migrations)) {
        const sql = await readFile(
          new URL("../../../" + migration, import.meta.url),
          "utf8",
        );
        for (const statement of sql.split("--> statement-breakpoint")) {
          if (statement.trim()) await a().unsafe(statement);
        }
      }

      await a().unsafe(
        `INSERT INTO appbasis_training_group (id, organization_id, name)
         VALUES ($1, $2, 'N01 Atomic Guard')`,
        [groupId, organizationId],
      );
      await a().unsafe(
        `INSERT INTO appbasis_trainer (id, organization_id, first_name, last_name)
         VALUES ($1, $2, 'N01', 'Trainer')`,
        [trainerId, organizationId],
      );
      await a().unsafe(
        `INSERT INTO appbasis_trainer_group_membership
           (organization_id, trainer_id, group_id)
         VALUES ($1, $2, $3)`,
        [organizationId, trainerId, groupId],
      );
    }, 120_000);

    afterAll(async () => {
      if (connectionA !== null) {
        await connectionA.client.end();
        connectionA = null;
      }
      if (connectionB !== null) {
        await connectionB.client.end();
        connectionB = null;
      }
      if (databaseCreated) {
        await administrator.client.unsafe("DROP DATABASE " + databaseName + " WITH (FORCE)");
      }
      await administrator.client.end();
    }, 120_000);

    it("holds the guard's row lock through the session write and releases it on commit", async () => {
      let ready!: () => void;
      let release!: () => void;
      const writeReady = new Promise<void>((resolve) => { ready = resolve; });
      const hold = new Promise<void>((resolve) => { release = resolve; });

      const guarded = sessions().withAuthorizedRegistrationTransaction(
        (sql) => verifyTrainerGroup(sql, trainerId),
        async (transactionalSessions) => {
          const snapshot = await transactionalSessions.ensureScheduledSession(
            organizationId, "kindertraining", groupId, registrationDate,
          );
          expect(snapshot.session.state).toBe("scheduled");
          ready();
          await hold;
          return snapshot.session.id;
        },
      );

      let committedSessionId: string;
      try {
        await Promise.race([
          writeReady,
          guarded.then(() => { throw new Error("Guarded write ended before lock check."); }),
        ]);
        await expect(b().begin(async (transaction) => {
          await transaction.unsafe("SET LOCAL lock_timeout = '750ms'");
          await transaction.unsafe("SET LOCAL statement_timeout = '5s'");
          return transaction.unsafe(
            `DELETE FROM appbasis_trainer_group_membership
             WHERE organization_id = $1 AND trainer_id = $2 AND group_id = $3`,
            [organizationId, trainerId, groupId],
          );
        })).rejects.toMatchObject({ code: "55P03" });
      } finally {
        release();
      }
      committedSessionId = await guarded;

      const persisted = await sessions().readSession(
        organizationId, "kindertraining", groupId, registrationDate,
      );
      expect(persisted?.session.id).toBe(committedSessionId);

      // The same deletion succeeds only after the guarding write commits.
      const removed = await b().unsafe(
        `DELETE FROM appbasis_trainer_group_membership
         WHERE organization_id = $1 AND trainer_id = $2 AND group_id = $3
         RETURNING trainer_id`,
        [organizationId, trainerId, groupId],
      );
      expect(removed).toHaveLength(1);
    }, 25_000);

    it("refuses authorization after revocation before any session or audit write", async () => {
      let writeInvoked = false;
      await expect(sessions().withAuthorizedRegistrationTransaction(
        (sql) => verifyTrainerGroup(sql, trainerId),
        async (transactionalSessions) => {
          writeInvoked = true;
          return transactionalSessions.ensureScheduledSession(
            organizationId, "kindertraining", groupId, deniedDate,
          );
        },
      )).rejects.toThrow("N01_TEST_ACTOR_DENIED");
      expect(writeInvoked).toBe(false);
      expect(await sessions().readSession(
        organizationId, "kindertraining", groupId, deniedDate,
      )).toBeNull();
      const counts = await a().unsafe(
        `SELECT count(*)::int AS total
           FROM ulc_linz_training_registration_change
          WHERE organization_id = $1`,
        [organizationId],
      );
      expect(counts[0]?.total).toBe(0);
    }, 25_000);

    it("rolls back session creation if the subsequent registration write fails", async () => {
      // The last test removed the trainer-group link. Recreate only in this
      // disposable database to prove a successful guard followed by rollback.
      await b().unsafe(
        `INSERT INTO appbasis_trainer_group_membership
           (organization_id, trainer_id, group_id)
         VALUES ($1, $2, $3)`,
        [organizationId, trainerId, groupId],
      );

      await expect(sessions().withAuthorizedRegistrationTransaction(
        (sql) => verifyTrainerGroup(sql, trainerId),
        async (transactionalSessions) => {
          await transactionalSessions.ensureScheduledSession(
            organizationId, "kindertraining", groupId, rollbackDate,
          );
          throw new Error("N01_TEST_REGISTRATION_FAILED");
        },
      )).rejects.toThrow("N01_TEST_REGISTRATION_FAILED");

      expect(await sessions().readSession(
        organizationId, "kindertraining", groupId, rollbackDate,
      )).toBeNull();
      const rows = await a().unsafe(
        `SELECT count(*)::int AS total
           FROM ulc_linz_training_registration_change
          WHERE organization_id = $1`,
        [organizationId],
      );
      expect(rows[0]?.total).toBe(0);
    }, 25_000);
  });
}
