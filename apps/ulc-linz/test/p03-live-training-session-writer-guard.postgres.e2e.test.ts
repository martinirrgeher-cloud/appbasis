import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresDatabase } from "@appbasis/database/postgres-provisioning";

import {
  PostgresUlcTrainingSessionRepository,
  UlcTrainingSessionPersistenceError,
  UlcTrainingSubjectWriteBlockedError,
  type UlcTrainingSessionSqlClient,
} from "../worker/training-session-postgres";

/**
 * P03-G: exercises the ACTUAL opt-in ULC session and registration writers.
 * No test-only marker or migration; checks the existing canonical ATHLETES
 * table and deletion decision on a disposable 41-migration ULC database.
 * A frozen owner cleanup in the test is NOT the deployed lifecycle.
 */
const DATABASE_URL = process.env.DATABASE_URL;
type Manifest = { owners: readonly { migrations: readonly string[] }[] };
type Database = ReturnType<typeof createPostgresDatabase>;
const TX_MODE = "require-live-athlete-transaction" as const;
const DATE = "2026-11-14";

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

if (!DATABASE_URL) {
  describe.skip("ULC P03-G real session write guard PostgreSQL", () => {
    it("requires DATABASE_URL", () => {});
  });
} else {
  describe("ULC P03-G real session write guard PostgreSQL", () => {
    const admin = createPostgresDatabase(DATABASE_URL);
    const name = "ulc_p03g_" + randomUUID().replaceAll("-", "").slice(0, 16);
    const uri = new URL(DATABASE_URL);
    uri.pathname = "/" + name;
    let instance: Database | null = null;
    let created = false;

    function db(): Database {
      if (!instance) throw new Error("P03-G disposable DB missing.");
      return instance;
    }

    function repo(connection: Database | UlcTrainingSessionSqlClient = db()) {
      const sql = "client" in connection ? connection.client : connection;
      return new PostgresUlcTrainingSessionRepository(
        sql, () => randomUUID(), TX_MODE,
      );
    }

    function labels(org: string) {
      return {
        target: org + "-target",
        other: org + "-neighbor",
        group: org + "-u12",
      };
    }

    async function seed(org: string) {
      const ids = labels(org);
      for (const [id, name] of [
        [ids.target, "Target"],
        [ids.other, "Neighbor"],
      ] as const) {
        await db().client.unsafe(
          `INSERT INTO appbasis_athlete
             (id, organization_id, first_name, last_name)
           VALUES ($1, $2, $3, 'Test')`,
          [id, org, name],
        );
      }
      return ids;
    }

    async function counts(org: string, subject: string) {
      const rows = await db().client.unsafe(
        `SELECT
          (SELECT count(*)::int FROM ulc_linz_training_attendance
           WHERE organization_id = $1 AND athlete_id = $2) AS attendance,
          (SELECT count(*)::int FROM ulc_linz_training_registration
           WHERE organization_id = $1 AND athlete_id = $2) AS registration,
          (SELECT count(*)::int FROM ulc_linz_training_registration_change
           WHERE organization_id = $1 AND athlete_id = $2) AS changes`,
        [org, subject],
      );
      return rows[0];
    }

    async function deleted(org: string, subject: string, eraseHistory = false) {
      await db().client.begin(async (tx) => {
        // Mirrors the currently installed ATHLETES owner's FOR UPDATE lock.
        const selected = await tx.unsafe(
          `SELECT id FROM appbasis_athlete
           WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
          [org, subject],
        );
        expect(selected).toHaveLength(1);
        await tx.unsafe(
          `INSERT INTO appbasis_athletes_deletion
             (entity_type, entity_id, organization_id, completed_at, purge_after)
           VALUES ('athlete', $2, $1, now(), now() + interval '35 days')`,
          [org, subject],
        );
        if (eraseHistory) {
          for (const table of [
            "ulc_linz_training_registration_change",
            "ulc_linz_training_registration",
            "ulc_linz_training_attendance",
          ]) {
            await tx.unsafe(
              `DELETE FROM ${table}
               WHERE organization_id = $1 AND athlete_id = $2`,
              [org, subject],
            );
          }
        }
        await tx.unsafe(
          "DELETE FROM appbasis_athlete WHERE organization_id = $1 AND id = $2",
          [org, subject],
        );
      });
    }

    beforeAll(async () => {
      await admin.client.unsafe("CREATE DATABASE " + name);
      created = true;
      instance = createPostgresDatabase(uri.toString());
      const manifest = JSON.parse(await readFile(
        new URL("../appbasis.database.json", import.meta.url), "utf8",
      )) as Manifest;
      const migrations = manifest.owners.flatMap((owner) => owner.migrations);
      if (
        migrations.length !== 41 ||
        new Set(migrations).size !== migrations.length ||
        !migrations.some((path) => path.endsWith("0001_appbasis_athletes_deletion_markers.sql")) ||
        !migrations.some((path) => path.endsWith("0008_ulc_linz_session_registration.sql"))
      ) throw new Error("P03-G requires exact v4/ULC canonical migration inventory.");
      for (const file of migrations) {
        const sql = await readFile(
          new URL("../../../" + file, import.meta.url), "utf8",
        );
        for (const statement of sql.split("--> statement-breakpoint")) {
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

    it("writes a valid active roster and registration under the same guarded repository", async () => {
      const org = "p03g-valid";
      const ids = await seed(org);
      const saved = await repo().saveSession(
        org,
        { moduleId: "u12", groupId: ids.group, sessionDate: DATE },
        [{ athleteId: ids.target, status: "present" },
          { athleteId: ids.other, status: "absent" }],
        null,
      );
      expect(saved.attendance).toHaveLength(2);
      await repo().saveRegistration(
        org, saved.session.id, ids.target, "attending", null, "p03g-actor",
      );
      expect(await counts(org, ids.target)).toEqual({
        attendance: 1, registration: 1, changes: 1,
      });
      expect(await counts(org, ids.other)).toEqual({
        attendance: 1, registration: 0, changes: 0,
      });
    });

    it("rejects stale U12 trainer-list save atomically after canonical athlete deletion", async () => {
      const org = "p03g-stale-roster";
      const ids = await seed(org);
      const initial = await repo().saveSession(
        org, { moduleId: "u12", groupId: ids.group, sessionDate: DATE, note: "Before" },
        [{ athleteId: ids.other, status: "present" }], null,
      );
      await deleted(org, ids.target, true);
      await expect(repo().saveSession(
        org, { moduleId: "u12", groupId: ids.group, sessionDate: DATE, note: "Stale update" },
        [{ athleteId: ids.target, status: "present" },
          { athleteId: ids.other, status: "absent" }], initial.revision,
      )).rejects.toBeInstanceOf(UlcTrainingSubjectWriteBlockedError);
      expect(await counts(org, ids.target)).toEqual({
        attendance: 0, registration: 0, changes: 0,
      });
      const rows = await db().client.unsafe(
        "SELECT note FROM ulc_linz_training_session WHERE id = $1",
        [initial.session.id],
      );
      expect(rows[0]?.note).toBe("Before");
      expect(await counts(org, ids.other)).toMatchObject({ attendance: 1 });
    });

    it("rejects stale self-registration including note and registration-change history", async () => {
      const org = "p03g-stale-self";
      const ids = await seed(org);
      const session = await repo().ensureScheduledSession(
        org, "kindertraining", ids.group, DATE,
      );
      await deleted(org, ids.target, true);
      await expect(repo().saveRegistration(
        org, session.session.id, ids.target,
        "attending", null, "p03g-actor", undefined, "Old personal note",
      )).rejects.toBeInstanceOf(UlcTrainingSubjectWriteBlockedError);
      expect(await counts(org, ids.target)).toEqual({
        attendance: 0, registration: 0, changes: 0,
      });
    });

    it("atomic self-registration rolls back a new scheduled session when target is deleted", async () => {
      const org = "p03g-no-orphan";
      const ids = await seed(org);
      await deleted(org, ids.target, true);
      await expect(repo().withRegistrationTransaction(async scoped => {
        const scheduled = await scoped.ensureScheduledSession(
          org, "kindertraining", ids.group, DATE,
        );
        return scoped.saveRegistration(
          org, scheduled.session.id, ids.target, "attending", null, "p03g-actor",
        );
      })).rejects.toBeInstanceOf(UlcTrainingSubjectWriteBlockedError);
      const roots = await db().client.unsafe(
        "SELECT id FROM ulc_linz_training_session WHERE organization_id = $1",
        [org],
      );
      expect(roots).toHaveLength(0);
    });

    it("rejects proxy actor after canonical deletion, without writing target history", async () => {
      const org = "p03g-proxy-actor";
      const ids = await seed(org);
      const session = await repo().ensureScheduledSession(
        org, "kindertraining", ids.group, DATE,
      );
      await deleted(org, ids.other, true);
      await expect(repo().saveRegistration(
        org, session.session.id, ids.target, "attending", null,
        "p03g-proxy-identity", ids.other,
      )).rejects.toBeInstanceOf(UlcTrainingSubjectWriteBlockedError);
      expect(await counts(org, ids.target)).toEqual({
        attendance: 0, registration: 0, changes: 0,
      });
    });

    it("rejects cross-organization subject and intentionally inactive subject", async () => {
      const firstOrg = "p03g-cross-org";
      const secondOrg = "p03g-neighbor-org";
      const ids = await seed(firstOrg);
      const foreign = await seed(secondOrg);
      await expect(repo().saveSession(
        secondOrg, { moduleId: "u14", groupId: foreign.group, sessionDate: DATE },
        [{ athleteId: ids.target, status: "present" }], null,
      )).rejects.toBeInstanceOf(UlcTrainingSubjectWriteBlockedError);
      await db().client.unsafe(
        "UPDATE appbasis_athlete SET is_active = false WHERE organization_id = $1 AND id = $2",
        [firstOrg, ids.target],
      );
      await expect(repo().saveSession(
        firstOrg, { moduleId: "u12", groupId: ids.group, sessionDate: DATE },
        [{ athleteId: ids.target, status: "present" }], null,
      )).rejects.toBeInstanceOf(UlcTrainingSubjectWriteBlockedError);
      await expect(repo().saveSession(
        firstOrg, { moduleId: "u12", groupId: ids.group, sessionDate: DATE },
        [{ athleteId: ids.other, status: "present" }], null,
      )).resolves.toMatchObject({ attendance: [{ athleteId: ids.other }] });
    });

    it("fails closed if PostgreSQL BEGIN is unavailable; no session or registration SQL is issued", async () => {
      let executed = 0;
      const sql: UlcTrainingSessionSqlClient = {
        async unsafe() { executed++; return []; },
      };
      const guarded = repo(sql);
      await expect(guarded.saveSession(
        "org", { moduleId: "u12", groupId: "group", sessionDate: DATE },
        [{ athleteId: "target", status: "present" }], null,
      )).rejects.toBeInstanceOf(UlcTrainingSessionPersistenceError);
      await expect(guarded.saveRegistration(
        "org", "session", "target", "attending", null, "actor",
      )).rejects.toBeInstanceOf(UlcTrainingSessionPersistenceError);
      expect(executed).toBe(0);
    });

    it("denies a write that starts while canonical athlete FOR UPDATE deletion holds the row", async () => {
      const org = "p03g-delete-wins";
      const ids = await seed(org);
      const left = createPostgresDatabase(uri.toString());
      const right = createPostgresDatabase(uri.toString());
      const locked = deferred();
      const release = deferred();
      try {
        const canonicalDeletion = left.client.begin(async tx => {
          await tx.unsafe(
            "SELECT id FROM appbasis_athlete WHERE organization_id = $1 AND id = $2 FOR UPDATE",
            [org, ids.target],
          );
          locked.release();
          await release.promise;
          await tx.unsafe(
            `INSERT INTO appbasis_athletes_deletion
               (entity_type, entity_id, organization_id, completed_at, purge_after)
             VALUES ('athlete', $2, $1, now(), now() + interval '35 days')`,
            [org, ids.target],
          );
          await tx.unsafe(
            "DELETE FROM appbasis_athlete WHERE organization_id = $1 AND id = $2",
            [org, ids.target],
          );
        });
        await locked.promise;
        const attempted = repo(right).saveSession(
          org, { moduleId: "u12", groupId: ids.group, sessionDate: DATE },
          [{ athleteId: ids.target, status: "present" }], null,
        );
        release.release();
        const [erase, attempt] = await Promise.allSettled([
          canonicalDeletion, attempted,
        ]);
        expect(erase.status).toBe("fulfilled");
        expect(attempt.status).toBe("rejected");
        if (attempt.status === "rejected") {
          expect(attempt.reason).toBeInstanceOf(UlcTrainingSubjectWriteBlockedError);
        }
        expect(await counts(org, ids.target)).toMatchObject({ attendance: 0 });
      } finally {
        release.release();
        await left.client.end();
        await right.client.end();
      }
    }, 20_000);

    it("write acquires FOR SHARE first; deletion waits and subsequent frozen owner cleanup removes only target", async () => {
      const org = "p03g-write-wins";
      const ids = await seed(org);
      const left = createPostgresDatabase(uri.toString());
      const right = createPostgresDatabase(uri.toString());
      const writeLocked = deferred();
      const release = deferred();
      const leftSql = {
        unsafe(sql: string, params?: (string | number | boolean | null)[]) {
          return left.client.unsafe(sql, params);
        },
        begin<T>(callback: (sql: UlcTrainingSessionSqlClient) => Promise<T>) {
          return left.client.begin(async tx => callback({
            async unsafe(sql, params) {
              const rows = await tx.unsafe(sql, params);
              if (sql.includes("FROM appbasis_athlete") && sql.includes("FOR SHARE")) {
                writeLocked.release();
                await release.promise;
              }
              return rows;
            },
          }));
        },
      };
      try {
        const writing = repo(leftSql).saveSession(
          org, { moduleId: "u12", groupId: ids.group, sessionDate: DATE },
          [{ athleteId: ids.target, status: "present" }], null,
        );
        await writeLocked.promise;
        const erasing = right.client.begin(async tx => {
          await tx.unsafe(
            "SELECT id FROM appbasis_athlete WHERE organization_id = $1 AND id = $2 FOR UPDATE",
            [org, ids.target],
          );
          for (const table of [
            "ulc_linz_training_registration_change",
            "ulc_linz_training_registration",
            "ulc_linz_training_attendance",
          ]) {
            await tx.unsafe(
              `DELETE FROM ${table}
               WHERE organization_id = $1 AND athlete_id = $2`,
              [org, ids.target],
            );
          }
          await tx.unsafe(
            `INSERT INTO appbasis_athletes_deletion
               (entity_type, entity_id, organization_id, completed_at, purge_after)
             VALUES ('athlete', $2, $1, now(), now() + interval '35 days')`,
            [org, ids.target],
          );
          await tx.unsafe(
            "DELETE FROM appbasis_athlete WHERE organization_id = $1 AND id = $2",
            [org, ids.target],
          );
        });
        release.release();
        const [write, erase] = await Promise.allSettled([writing, erasing]);
        expect(write.status).toBe("fulfilled");
        expect(erase.status).toBe("fulfilled");
        expect(await counts(org, ids.target)).toMatchObject({ attendance: 0 });
        await expect(repo().saveSession(
          org, { moduleId: "u14", groupId: ids.group, sessionDate: DATE },
          [{ athleteId: ids.target, status: "present" }], null,
        )).rejects.toBeInstanceOf(UlcTrainingSubjectWriteBlockedError);
      } finally {
        release.release();
        await left.client.end();
        await right.client.end();
      }
    }, 20_000);
  });
}
