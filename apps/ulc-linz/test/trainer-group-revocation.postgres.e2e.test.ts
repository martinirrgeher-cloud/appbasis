import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { PostgresAthleteMasterdataRepository } from "@appbasis/athletes";
import { createPostgresDatabase } from "../../../packages/database/src/client.ts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// N01.8c: This is the group-membership lock contract only. It deliberately
// does not authorize trainer/admin proxy registrations or touch production DBs.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl?.trim()) {
  throw new Error("DATABASE_URL is required for isolated N01 group-lock E2E.");
}

const admin = createPostgresDatabase(databaseUrl);
const isolatedName = "appbasis_n01_group_" + randomUUID().replaceAll("-", "").slice(0, 14);
const isolatedUrl = new URL(databaseUrl);
isolatedUrl.pathname = "/" + isolatedName;

let created = false;
let connectionA: ReturnType<typeof createPostgresDatabase> | null = null;
let connectionB: ReturnType<typeof createPostgresDatabase> | null = null;

const organization = "n01-isolated-org";
const group = "n01-isolated-group";
const trainer = "n01-isolated-trainer";
const athlete = "n01-isolated-athlete";

function a() {
  if (!connectionA) throw new Error("Isolated A connection is missing.");
  return connectionA.client;
}

function b() {
  if (!connectionB) throw new Error("Isolated B connection is missing.");
  return connectionB.client;
}

type SqlReader = {
  unsafe(
    query: string,
    parameters?: (string | number | boolean | null)[],
  ): PromiseLike<readonly Record<string, unknown>[]>;
};

async function trainerHasGroup(client: SqlReader): Promise<boolean> {
  // Lock concrete rows from non-nullable joins, not a nullable LEFT JOIN.
  const rows = await client.unsafe(
    `SELECT membership.group_id
     FROM appbasis_trainer_group_membership AS membership
     JOIN appbasis_trainer AS trainer
       ON trainer.id = membership.trainer_id
      AND trainer.organization_id = membership.organization_id
     JOIN appbasis_training_group AS training_group
       ON training_group.id = membership.group_id
      AND training_group.organization_id = membership.organization_id
     WHERE membership.organization_id = $1
       AND membership.trainer_id = $2
       AND membership.group_id = $3
       AND trainer.is_active = true
       AND training_group.is_active = true
     FOR SHARE OF membership, trainer, training_group`,
    [organization, trainer, group],
  );
  return rows.length === 1;
}

async function athleteHasMembership(client: SqlReader): Promise<boolean> {
  // The prospective training day is AFTER today, so deactivation ending the
  // membership at CURRENT_DATE must revoke access to that day.
  const rows = await client.unsafe(
    `SELECT membership.group_id
     FROM appbasis_athlete_group_membership AS membership
     JOIN appbasis_athlete AS athlete
       ON athlete.id = membership.athlete_id
      AND athlete.organization_id = membership.organization_id
     JOIN appbasis_training_group AS training_group
       ON training_group.id = membership.group_id
      AND training_group.organization_id = membership.organization_id
     WHERE membership.organization_id = $1
       AND membership.athlete_id = $2
       AND membership.group_id = $3
       AND athlete.is_active = true
       AND training_group.is_active = true
       AND membership.started_on <= CURRENT_DATE + 7
       AND (membership.ended_on IS NULL OR membership.ended_on >= CURRENT_DATE + 7)
     FOR SHARE OF membership, athlete, training_group`,
    [organization, athlete, group],
  );
  return rows.length === 1;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeAll(async () => {
  await admin.client.unsafe("CREATE DATABASE " + isolatedName);
  created = true;
  connectionA = createPostgresDatabase(isolatedUrl.toString());
  connectionB = createPostgresDatabase(isolatedUrl.toString());

  const foundation = await readFile(
    new URL("../../../modules/athletes/migrations/0000_appbasis_athletes_foundation.sql", import.meta.url),
    "utf8",
  );
  await a().unsafe(foundation);
  await a().unsafe(
    `INSERT INTO appbasis_training_group (id, organization_id, name)
     VALUES ($1, $2, 'N01 Isolated Group')`,
    [group, organization],
  );
  await a().unsafe(
    `INSERT INTO appbasis_trainer (id, organization_id, first_name, last_name)
     VALUES ($1, $2, 'N01', 'Trainer')`,
    [trainer, organization],
  );
  await a().unsafe(
    `INSERT INTO appbasis_athlete (id, organization_id, first_name, last_name)
     VALUES ($1, $2, 'N01', 'Athlete')`,
    [athlete, organization],
  );
  await a().unsafe(
    `INSERT INTO appbasis_trainer_group_membership (organization_id, trainer_id, group_id)
     VALUES ($1, $2, $3)`,
    [organization, trainer, group],
  );
  await a().unsafe(
    `INSERT INTO appbasis_athlete_group_membership
       (organization_id, athlete_id, group_id, started_on)
     VALUES ($1, $2, $3, CURRENT_DATE - 30)`,
    [organization, athlete, group],
  );
}, 120_000);

afterAll(async () => {
  if (connectionA) {
    await connectionA.client.end();
    connectionA = null;
  }
  if (connectionB) {
    await connectionB.client.end();
    connectionB = null;
  }
  if (created) {
    await admin.client.unsafe("DROP DATABASE " + isolatedName + " WITH (FORCE)");
  }
  await admin.client.end();
}, 120_000);

describe("N01 trainer and athlete group lock ordering (isolated PostgreSQL)", () => {
  it("blocks trainer-group link removal while an authorized guard holds its row", async () => {
    const ready = deferred();
    const release = deferred();
    const guard = a().begin(async (tx) => {
      await tx.unsafe("SET LOCAL statement_timeout = '10s'");
      const isolation = await tx.unsafe("SHOW transaction_isolation");
      expect(isolation[0]?.transaction_isolation).toBe("read committed");
      expect(await trainerHasGroup(tx)).toBe(true);
      ready.resolve();
      await release.promise;
      return trainerHasGroup(tx);
    });

    try {
      await Promise.race([
        ready.promise,
        guard.then(() => { throw new Error("Trainer guard ended before signaling readiness."); }),
      ]);

      await expect(b().begin(async (tx) => {
        await tx.unsafe("SET LOCAL lock_timeout = '750ms'");
        await tx.unsafe("SET LOCAL statement_timeout = '5s'");
        return tx.unsafe(
          `DELETE FROM appbasis_trainer_group_membership
           WHERE organization_id = $1 AND trainer_id = $2 AND group_id = $3
           RETURNING trainer_id`,
          [organization, trainer, group],
        );
      })).rejects.toMatchObject({ code: "55P03" });

      expect(await trainerHasGroup(b())).toBe(true);
    } finally {
      release.resolve();
    }
    expect(await guard).toBe(true);

    const removed = await b().unsafe(
      `DELETE FROM appbasis_trainer_group_membership
       WHERE organization_id = $1 AND trainer_id = $2 AND group_id = $3
       RETURNING trainer_id`,
      [organization, trainer, group],
    );
    expect(removed).toHaveLength(1);
    expect(await a().begin((tx) => trainerHasGroup(tx))).toBe(false);
  }, 25_000);

  it("blocks canonical athlete deactivation during a guarded dated membership read", async () => {
    const ready = deferred();
    const release = deferred();
    const guard = a().begin(async (tx) => {
      await tx.unsafe("SET LOCAL statement_timeout = '10s'");
      const isolation = await tx.unsafe("SHOW transaction_isolation");
      expect(isolation[0]?.transaction_isolation).toBe("read committed");
      expect(await athleteHasMembership(tx)).toBe(true);
      ready.resolve();
      await release.promise;
      return athleteHasMembership(tx);
    });

    try {
      await Promise.race([
        ready.promise,
        guard.then(() => { throw new Error("Athlete guard ended before signaling readiness."); }),
      ]);

      await expect(b().begin(async (tx) => {
        await tx.unsafe("SET LOCAL lock_timeout = '750ms'");
        await tx.unsafe("SET LOCAL statement_timeout = '5s'");
        return new PostgresAthleteMasterdataRepository(tx).deactivateAthlete(
          organization, athlete,
        );
      })).rejects.toMatchObject({ code: "55P03" });
      expect(await athleteHasMembership(b())).toBe(true);
    } finally {
      release.resolve();
    }
    expect(await guard).toBe(true);

    const repository = new PostgresAthleteMasterdataRepository(b());
    await expect(repository.deactivateAthlete(organization, athlete)).resolves.toBe(true);
    expect(await a().begin((tx) => athleteHasMembership(tx))).toBe(false);
    const rows = await a().unsafe(
      `SELECT athlete.is_active, membership.ended_on::text AS ended_on
       FROM appbasis_athlete AS athlete
       JOIN appbasis_athlete_group_membership AS membership
         ON membership.athlete_id = athlete.id
       WHERE athlete.id = $1 AND athlete.organization_id = $2`,
      [athlete, organization],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.is_active).toBe(false);
    expect(rows[0]?.ended_on).not.toBeNull();
  }, 25_000);
});
