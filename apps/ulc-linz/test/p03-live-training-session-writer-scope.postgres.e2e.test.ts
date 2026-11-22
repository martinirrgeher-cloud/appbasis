import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresDatabase } from "@appbasis/database/postgres-provisioning";

import {
  PostgresUlcTrainingSessionRepository,
  type UlcTrainingSessionSqlClient,
} from "../worker/training-session-postgres";
import { UlcTrainingScopeWriteBlockedError } from "../worker/training-session-write-scope";

const DATABASE_URL = process.env.DATABASE_URL;
const DATE = "2026-11-14";
const GUARD = "require-live-athlete-group-transaction" as const;
type Database = ReturnType<typeof createPostgresDatabase>;
type Manifest = { owners: readonly { migrations: readonly string[] }[] };

function latch() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

if (!DATABASE_URL) {
  describe.skip("ULC P03-H live S4 group/actor writer scope PostgreSQL", () => {
    it("requires DATABASE_URL", () => {});
  });
} else {
  describe("ULC P03-H live S4 group/actor writer scope PostgreSQL", () => {
    const admin = createPostgresDatabase(DATABASE_URL);
    const name = "ulc_p03h_" + randomUUID().replaceAll("-", "").slice(0, 16);
    const uri = new URL(DATABASE_URL);
    uri.pathname = "/" + name;
    let instance: Database | null = null;
    let created = false;

    function db(): Database {
      if (!instance) throw new Error("P03-H disposable DB missing");
      return instance;
    }

    function repo(sql: UlcTrainingSessionSqlClient = db().client) {
      return new PostgresUlcTrainingSessionRepository(sql, () => randomUUID(), GUARD);
    }

    async function seed(org: string, selfRegistration = false) {
      const target = org + "-target";
      const proxy = org + "-proxy";
      const trainer = org + "-trainer";
      const group = org + "-group";
      const identity = org + "-identity";
      await db().client.unsafe(
        `INSERT INTO appbasis_training_group
           (id, organization_id, name, attendance_mode)
         VALUES ($1, $2, 'Training Group', $3)`,
        [group, org, selfRegistration ? "self_registration" : "trainer_roll_call"],
      );
      for (const [id, firstName] of [[target, "Target"], [proxy, "Proxy"]] as const) {
        await db().client.unsafe(
          `INSERT INTO appbasis_athlete(id, organization_id, first_name, last_name)
           VALUES ($1, $2, $3, 'Test')`,
          [id, org, firstName],
        );
        await db().client.unsafe(
          `INSERT INTO appbasis_athlete_group_membership
             (organization_id, athlete_id, group_id, started_on)
           VALUES ($1, $2, $3, '2026-01-01'::date)`,
          [org, id, group],
        );
      }
      await db().client.unsafe(
        `INSERT INTO appbasis_trainer(id, organization_id, first_name, last_name)
         VALUES ($1, $2, 'Trainer', 'Test')`,
        [trainer, org],
      );
      await db().client.unsafe(
        `INSERT INTO appbasis_trainer_group_membership
           (organization_id, trainer_id, group_id) VALUES ($1, $2, $3)`,
        [org, trainer, group],
      );
      await db().client.unsafe(
        `INSERT INTO ulc_linz_membership
           (identity_id, organization_id, subject_id, source_role)
         VALUES ($1, $2, $3, 'athlete')`,
        [identity, org, proxy],
      );
      await db().client.unsafe(
        `INSERT INTO ulc_linz_subject_scope
           (identity_id, organization_id, subject_id, relation_type)
         VALUES ($1, $2, $3, 'self')`,
        [identity, org, proxy],
      );
      return { org, target, proxy, trainer, group, identity };
    }

    async function attendanceCount(org: string) {
      const rows = await db().client.unsafe(
        `SELECT count(*)::int AS count FROM ulc_linz_training_attendance
         WHERE organization_id = $1`,
        [org],
      );
      return rows[0]?.count;
    }

    beforeAll(async () => {
      await admin.client.unsafe("CREATE DATABASE " + name);
      created = true;
      instance = createPostgresDatabase(uri.toString());
      const manifest = JSON.parse(await readFile(
        new URL("../appbasis.database.json", import.meta.url), "utf8",
      )) as Manifest;
      const migrations = manifest.owners.flatMap(owner => owner.migrations);
      if (migrations.length !== 46 || new Set(migrations).size !== 46) {
        throw new Error("P03-H requires the canonical 46 migration inventory");
      }
      for (const file of migrations) {
        const script = await readFile(
          new URL("../../../" + file, import.meta.url), "utf8",
        );
        for (const statement of script.split("--> statement-breakpoint")) {
          if (statement.trim()) await db().client.unsafe(statement);
        }
      }
    });

    afterAll(async () => {
      if (instance) {
        await instance.client.end();
        instance = null;
      }
      if (created) await admin.client.unsafe("DROP DATABASE " + name + " WITH (FORCE)");
      await admin.client.end();
    });

    it("preserves legitimate U12 athlete and trainer attendance in the stronger opt-in guard", async () => {
      const s = await seed("p03h-valid");
      const stored = await repo().saveSession(
        s.org, { moduleId: "u12", groupId: s.group, sessionDate: DATE },
        [{ athleteId: s.target, status: "present" }], null,
        undefined, undefined, [s.trainer], [s.trainer],
      );
      expect(stored.attendance).toHaveLength(1);
      expect(stored.trainingTrainerIds).toEqual([s.trainer]);
      expect(await attendanceCount(s.org)).toBe(1);
      const trainers = await db().client.unsafe(
        "SELECT trainer_id FROM ulc_linz_training_trainer_attendance WHERE organization_id = $1",
        [s.org],
      );
      expect(trainers).toMatchObject([{ trainer_id: s.trainer }]);
    });

    it("denies stale athlete-group roster after membership end, without creating training", async () => {
      const s = await seed("p03h-ended-membership");
      await db().client.unsafe(
        `UPDATE appbasis_athlete_group_membership SET ended_on = '2026-11-01'
         WHERE organization_id = $1 AND athlete_id = $2`, [s.org, s.target],
      );
      await expect(repo().saveSession(
        s.org, { moduleId: "u12", groupId: s.group, sessionDate: DATE, note: "Stale" },
        [{ athleteId: s.target, status: "present" }], null,
      )).rejects.toBeInstanceOf(UlcTrainingScopeWriteBlockedError);
      expect(await attendanceCount(s.org)).toBe(0);
    });

    it("denies stale trainer presence after group membership revocation", async () => {
      const s = await seed("p03h-trainer-revoked");
      await db().client.unsafe(
        `DELETE FROM appbasis_trainer_group_membership
         WHERE organization_id = $1 AND trainer_id = $2`, [s.org, s.trainer],
      );
      await expect(repo().saveSession(
        s.org, { moduleId: "u14", groupId: s.group, sessionDate: DATE },
        [{ athleteId: s.target, status: "present" }], null,
        undefined, undefined, [s.trainer], [s.trainer],
      )).rejects.toBeInstanceOf(UlcTrainingScopeWriteBlockedError);
      expect(await attendanceCount(s.org)).toBe(0);
    });

    it("denies inactive group regardless of previously valid athlete roster", async () => {
      const s = await seed("p03h-inactive-group");
      await db().client.unsafe(
        "UPDATE appbasis_training_group SET is_active = false WHERE id = $1", [s.group],
      );
      await expect(repo().saveSession(
        s.org, { moduleId: "u12", groupId: s.group, sessionDate: DATE },
        [{ athleteId: s.target, status: "present" }], null,
      )).rejects.toBeInstanceOf(UlcTrainingScopeWriteBlockedError);
    });

    it("allows current self-registration with exact identity/subject binding and history", async () => {
      const s = await seed("p03h-self-valid", true);
      const session = await repo().ensureScheduledSession(
        s.org, "kindertraining", s.group, DATE,
      );
      const registration = await repo().saveRegistration(
        s.org, session.session.id, s.proxy, "attending", null,
        s.identity, undefined, "Valid note",
      );
      expect(registration.intention).toBe("attending");
      expect(registration.note).toBe("Valid note");
      const history = await db().client.unsafe(
        "SELECT count(*)::int AS count FROM ulc_linz_training_registration_change WHERE organization_id = $1",
        [s.org],
      );
      expect(history[0]?.count).toBe(1);
    });

    it("denies revoked actor membership, even for active athlete with valid registration", async () => {
      const s = await seed("p03h-revoked-actor", true);
      const session = await repo().ensureScheduledSession(
        s.org, "kindertraining", s.group, DATE,
      );
      await db().client.unsafe(
        `UPDATE ulc_linz_membership
         SET active = false, ended_at = now()
         WHERE identity_id = $1`, [s.identity],
      );
      await expect(repo().saveRegistration(
        s.org, session.session.id, s.proxy, "attending", null,
        s.identity, undefined, "Should not exist",
      )).rejects.toBeInstanceOf(UlcTrainingScopeWriteBlockedError);
      const count = await db().client.unsafe(
        "SELECT count(*)::int AS count FROM ulc_linz_training_registration_change WHERE organization_id = $1",
        [s.org],
      );
      expect(count[0]?.count).toBe(0);
    });

    it("denies revoked subject-scope link without writing new history", async () => {
      const s = await seed("p03h-scope-revoked", true);
      const session = await repo().ensureScheduledSession(
        s.org, "kindertraining", s.group, DATE,
      );
      await db().client.unsafe(
        `DELETE FROM ulc_linz_subject_scope
         WHERE identity_id = $1 AND organization_id = $2`, [s.identity, s.org],
      );
      await expect(repo().saveRegistration(
        s.org, session.session.id, s.proxy, "attending", null,
        s.identity,
      )).rejects.toBeInstanceOf(UlcTrainingScopeWriteBlockedError);
    });

    it("denies proxy after group revocation of the acting athlete", async () => {
      const s = await seed("p03h-proxy-revoked", true);
      const session = await repo().ensureScheduledSession(
        s.org, "kindertraining", s.group, DATE,
      );
      await db().client.unsafe(
        `UPDATE appbasis_athlete_group_membership SET ended_on = '2026-11-01'
         WHERE organization_id = $1 AND athlete_id = $2`, [s.org, s.proxy],
      );
      await expect(repo().saveRegistration(
        s.org, session.session.id, s.target, "attending", null,
        s.identity, s.proxy,
      )).rejects.toBeInstanceOf(UlcTrainingScopeWriteBlockedError);
    });

    it("denies a different identity even when the target athlete and group are active", async () => {
      const s = await seed("p03h-wrong-identity", true);
      const other = await seed("p03h-other-identity", true);
      const session = await repo().ensureScheduledSession(
        s.org, "kindertraining", s.group, DATE,
      );
      await expect(repo().saveRegistration(
        s.org, session.session.id, s.proxy, "attending", null,
        other.identity, undefined, "Must not persist",
      )).rejects.toBeInstanceOf(UlcTrainingScopeWriteBlockedError);
    });

    it("revoked actor rolls back the newly created scheduled session as well as history", async () => {
      const s = await seed("p03h-revoked-no-orphan", true);
      await db().client.unsafe(
        `UPDATE ulc_linz_membership
         SET active = false, ended_at = now()
         WHERE identity_id = $1`, [s.identity],
      );
      await expect(repo().withRegistrationTransaction(async scoped => {
        const scheduled = await scoped.ensureScheduledSession(
          s.org, "kindertraining", s.group, DATE,
        );
        return scoped.saveRegistration(
          s.org, scheduled.session.id, s.proxy, "attending",
          null, s.identity,
        );
      })).rejects.toBeInstanceOf(UlcTrainingScopeWriteBlockedError);
      const rows = await db().client.unsafe(
        "SELECT id FROM ulc_linz_training_session WHERE organization_id = $1",
        [s.org],
      );
      expect(rows).toHaveLength(0);
    });

    it("two-connection race: writer locks member first; revoke waits, next write is denied", async () => {
      const s = await seed("p03h-write-first");
      const left = createPostgresDatabase(uri.toString());
      const right = createPostgresDatabase(uri.toString());
      const hasMembershipLock = latch();
      const release = latch();
      const client = {
        unsafe(sql: string, params?: (string | number | boolean | null)[]) {
          return left.client.unsafe(sql, params);
        },
        begin<T>(callback: (sql: UlcTrainingSessionSqlClient) => Promise<T>) {
          return left.client.begin(async tx => callback({
            async unsafe(sql, params) {
              const rows = await tx.unsafe(sql, params);
              if (sql.includes("FROM appbasis_athlete_group_membership") &&
                  sql.includes("FOR SHARE")) {
                hasMembershipLock.release();
                await release.promise;
              }
              return rows;
            },
          }));
        },
      };
      try {
        const writing = repo(client).saveSession(
          s.org, { moduleId: "u12", groupId: s.group, sessionDate: DATE },
          [{ athleteId: s.target, status: "present" }], null,
        );
        await hasMembershipLock.promise;
        const revoke = right.client.unsafe(
          `UPDATE appbasis_athlete_group_membership
           SET ended_on = '2026-11-01'
           WHERE organization_id = $1 AND athlete_id = $2`,
          [s.org, s.target],
        );
        release.release();
        const results = await Promise.allSettled([writing, revoke]);
        expect(results.map(entry => entry.status)).toEqual(["fulfilled", "fulfilled"]);
        expect(await attendanceCount(s.org)).toBe(1);
        await expect(repo().saveSession(
          s.org, { moduleId: "u12", groupId: s.group, sessionDate: DATE },
          [{ athleteId: s.target, status: "present" }], null,
        )).rejects.toBeInstanceOf(UlcTrainingScopeWriteBlockedError);
      } finally {
        release.release();
        await left.client.end();
        await right.client.end();
      }
    }, 20_000);

    it("two-connection race: membership revocation locks first; stale writer is denied", async () => {
      const s = await seed("p03h-revoke-first");
      const left = createPostgresDatabase(uri.toString());
      const right = createPostgresDatabase(uri.toString());
      const locked = latch();
      const release = latch();
      try {
        const revocation = left.client.begin(async tx => {
          await tx.unsafe(
            `SELECT athlete_id FROM appbasis_athlete_group_membership
             WHERE organization_id = $1 AND athlete_id = $2 FOR UPDATE`,
            [s.org, s.target],
          );
          locked.release();
          await release.promise;
          await tx.unsafe(
            `UPDATE appbasis_athlete_group_membership
             SET ended_on = '2026-11-01'
             WHERE organization_id = $1 AND athlete_id = $2`,
            [s.org, s.target],
          );
        });
        await locked.promise;
        const writing = repo(right.client).saveSession(
          s.org, { moduleId: "u12", groupId: s.group, sessionDate: DATE },
          [{ athleteId: s.target, status: "present" }], null,
        );
        release.release();
        const results = await Promise.allSettled([revocation, writing]);
        expect(results[0]?.status).toBe("fulfilled");
        expect(results[1]?.status).toBe("rejected");
        if (results[1]?.status === "rejected") {
          expect(results[1].reason).toBeInstanceOf(UlcTrainingScopeWriteBlockedError);
        }
        expect(await attendanceCount(s.org)).toBe(0);
      } finally {
        release.release();
        await left.client.end();
        await right.client.end();
      }
    }, 20_000);
  });
}
