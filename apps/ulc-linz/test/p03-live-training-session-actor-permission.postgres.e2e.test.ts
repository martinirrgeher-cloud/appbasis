import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresDatabase } from "@appbasis/database/postgres-provisioning";
import {
  capabilityId,
  principalId,
  PostgresPrincipalPermissionAdministration,
} from "@appbasis/permissions";
import {
  PostgresUlcTrainingSessionRepository,
  type UlcTrainingSessionSqlClient,
} from "../worker/training-session-postgres";
import { UlcTrainingActorWriteBlockedError } from "../worker/training-session-write-actor";

const DATABASE_URL = process.env.DATABASE_URL;
const MODE = "require-live-training-actor-transaction" as const;
const DATE = "2026-11-14";
const MODULE = "u12" as const;
const CAPABILITY = "ulc-linz:module:u12:edit";
type Database = ReturnType<typeof createPostgresDatabase>;
type Manifest = { owners: readonly { migrations: readonly string[] }[] };

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

if (!DATABASE_URL) {
  describe.skip("ULC P03-I real trainer/admin actor permission fence PostgreSQL", () => {
    it("requires DATABASE_URL", () => {});
  });
} else {
  describe("ULC P03-I real trainer/admin actor permission fence PostgreSQL", () => {
    const admin = createPostgresDatabase(DATABASE_URL);
    const name = "ulc_p03i_" + randomUUID().replaceAll("-", "").slice(0, 16);
    const uri = new URL(DATABASE_URL);
    uri.pathname = "/" + name;
    let instance: Database | null = null;
    let created = false;

    function db(): Database {
      if (!instance) throw new Error("P03-I disposable database unavailable");
      return instance;
    }
    function repo(sql: UlcTrainingSessionSqlClient = db().client) {
      return new PostgresUlcTrainingSessionRepository(sql, () => randomUUID(), MODE);
    }
    async function count(org: string) {
      const rows = await db().client.unsafe(
        `SELECT count(*)::int AS count FROM ulc_linz_training_attendance
         WHERE organization_id = $1`,
        [org],
      );
      return rows[0]?.count;
    }

    async function seed(org: string, sourceRole: "admin" | "trainer" = "trainer") {
      const athlete = org + "-athlete";
      const trainer = org + "-trainer";
      const group = org + "-group";
      const identity = org + "-identity";
      const role = "ulc-linz:" + sourceRole;
      await db().client.unsafe(
        `INSERT INTO appbasis_training_group(id, organization_id, name)
         VALUES ($1, $2, 'Training Group')`, [group, org],
      );
      await db().client.unsafe(
        `INSERT INTO appbasis_athlete(id, organization_id, first_name, last_name)
         VALUES ($1, $2, 'Athlete', 'Test')`, [athlete, org],
      );
      await db().client.unsafe(
        `INSERT INTO appbasis_athlete_group_membership
         (organization_id, athlete_id, group_id, started_on)
         VALUES ($1, $2, $3, '2026-01-01'::date)`,
        [org, athlete, group],
      );
      if (sourceRole === "trainer") {
        await db().client.unsafe(
          `INSERT INTO appbasis_trainer(id, organization_id, first_name, last_name)
           VALUES ($1, $2, 'Trainer', 'Test')`, [trainer, org],
        );
        await db().client.unsafe(
          `INSERT INTO appbasis_trainer_group_membership
           (organization_id, trainer_id, group_id) VALUES ($1, $2, $3)`,
          [org, trainer, group],
        );
      }
      await db().client.unsafe(
        `INSERT INTO ulc_linz_membership
           (identity_id, organization_id, subject_id, source_role)
         VALUES ($1, $2, $3, $4)`,
        [identity, org, sourceRole === "trainer" ? trainer : identity, sourceRole],
      );
      await db().client.unsafe(
        `INSERT INTO appbasis_permission_principal(principal_id)
         VALUES ($1)`, [identity],
      );
      await db().client.unsafe(
        `INSERT INTO appbasis_permission_principal_role(principal_id, role_id)
         VALUES ($1, $2)`, [identity, role],
      );
      return { org, athlete, trainer, group, identity, role };
    }
    function save(s: Awaited<ReturnType<typeof seed>>, actor: string | undefined = s.identity) {
      return repo().saveSession(
        s.org,
        { moduleId: MODULE, groupId: s.group, sessionDate: DATE,
          ...(actor === undefined ? {} : { trustedActorIdentityId: actor }) },
        [{ athleteId: s.athlete, status: "present" }], null,
      );
    }
    function revoke(s: Awaited<ReturnType<typeof seed>>) {
      return new PostgresPrincipalPermissionAdministration(db().client)
        .replacePrincipalPermissions(
          principalId(s.identity),
          { grants: [], revokes: [capabilityId(CAPABILITY)] },
          { actorPrincipalId: principalId("p03i-supervisor"), reason: "P03-I test revoke" },
        );
    }

    beforeAll(async () => {
      await admin.client.unsafe("CREATE DATABASE " + name);
      created = true;
      instance = createPostgresDatabase(uri.toString());
      const manifest = JSON.parse(await readFile(
        new URL("../appbasis.database.json", import.meta.url), "utf8",
      )) as Manifest;
      const migrations = manifest.owners.flatMap(owner => owner.migrations);
      if (migrations.length !== 41 || new Set(migrations).size !== 41) {
        throw new Error("P03-I requires the frozen canonical 41 migrations");
      }
      for (const file of migrations) {
        const sql = await readFile(new URL("../../../" + file, import.meta.url), "utf8");
        for (const statement of sql.split("--> statement-breakpoint")) {
          if (statement.trim()) await db().client.unsafe(statement);
        }
      }
      for (const role of ["ulc-linz:trainer", "ulc-linz:admin"]) {
        await db().client.unsafe(
          `INSERT INTO appbasis_permission_role(role_id) VALUES ($1)`, [role],
        );
      }
      await db().client.unsafe(
        `INSERT INTO appbasis_permission_capability(capability_id)
         VALUES ($1)`, [CAPABILITY],
      );
      for (const role of ["ulc-linz:trainer", "ulc-linz:admin"]) {
        await db().client.unsafe(
          `INSERT INTO appbasis_permission_role_capability(role_id, capability_id)
           VALUES ($1, $2)`, [role, CAPABILITY],
        );
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

    it("saves valid trainer attendance under current canonical identity/role/capability", async () => {
      const s = await seed("p03i-trainer-valid");
      const saved = await save(s);
      expect(saved.attendance).toHaveLength(1);
      expect(await count(s.org)).toBe(1);
    });

    it("allows authorized admin without requiring a trainer-group membership", async () => {
      const s = await seed("p03i-admin-valid", "admin");
      await expect(save(s)).resolves.toMatchObject({ attendance: [{ athleteId: s.athlete }] });
    });

    it("fails closed when authenticated actor is missing, not a fallback identity", async () => {
      const s = await seed("p03i-no-actor");
      await expect(save(s, undefined)).rejects.toBeInstanceOf(UlcTrainingActorWriteBlockedError);
      expect(await count(s.org)).toBe(0);
    });

    it("denies a foreign identity even when that principal has the same role", async () => {
      const s = await seed("p03i-foreign-target");
      const foreign = await seed("p03i-foreign-owner");
      await expect(save(s, foreign.identity)).rejects.toBeInstanceOf(UlcTrainingActorWriteBlockedError);
      expect(await count(s.org)).toBe(0);
    });

    it("denies a role that no longer matches active source membership", async () => {
      const s = await seed("p03i-role-mismatch");
      await db().client.unsafe(
        `DELETE FROM appbasis_permission_principal_role
         WHERE principal_id = $1`, [s.identity],
      );
      await db().client.unsafe(
        `INSERT INTO appbasis_permission_principal_role(principal_id,role_id)
         VALUES ($1,'ulc-linz:admin')`, [s.identity],
      );
      await expect(save(s)).rejects.toBeInstanceOf(UlcTrainingActorWriteBlockedError);
    });

    it("denies trainer after group assignment revocation or inactivity", async () => {
      const s = await seed("p03i-trainer-detached");
      await db().client.unsafe(
        "DELETE FROM appbasis_trainer_group_membership WHERE trainer_id = $1",
        [s.trainer],
      );
      await expect(save(s)).rejects.toBeInstanceOf(UlcTrainingActorWriteBlockedError);
    });

    it("denies inactive membership of the otherwise authorized admin", async () => {
      const s = await seed("p03i-admin-revoked", "admin");
      await db().client.unsafe(
        `UPDATE ulc_linz_membership SET active = false, ended_at = now()
         WHERE identity_id = $1`, [s.identity],
      );
      await expect(save(s)).rejects.toBeInstanceOf(UlcTrainingActorWriteBlockedError);
    });

    it("denies canonical permission-administration revoke even when role still grants edit", async () => {
      const s = await seed("p03i-revoke-preexisting");
      await revoke(s);
      await expect(save(s)).rejects.toBeInstanceOf(UlcTrainingActorWriteBlockedError);
      expect(await count(s.org)).toBe(0);
    });

    it("allows direct grant with an active matching role that has no module capability", async () => {
      const s = await seed("p03i-explicit-grant");
      // Grants override absence of role capability according to PostgresPermissionStore.can.
      // Do not affect other seeded principals: add an isolated capability that the
      // role lacks is not possible without changing expected module permission.
      await db().client.unsafe(
        `INSERT INTO appbasis_permission_principal_grant(principal_id, capability_id)
         VALUES ($1, $2)`, [s.identity, CAPABILITY],
      );
      await expect(save(s)).resolves.toMatchObject({ attendance: [{ athleteId: s.athlete }] });
    });

    it("canonical permission replacement waits for a writer holding principal FOR SHARE; next write denied", async () => {
      const s = await seed("p03i-write-before-revoke");
      const left = createPostgresDatabase(uri.toString());
      const right = createPostgresDatabase(uri.toString());
      const locked = deferred();
      const release = deferred();
      const wrapped = {
        unsafe(sql: string, params?: (string | number | boolean | null)[]) {
          return left.client.unsafe(sql, params);
        },
        begin<T>(callback: (sql: UlcTrainingSessionSqlClient) => Promise<T>) {
          return left.client.begin(async tx => callback({
            async unsafe(sql, params) {
              const rows = await tx.unsafe(sql, params);
              if (sql.includes("FROM appbasis_permission_principal") &&
                  sql.includes("FOR SHARE")) {
                locked.release();
                await release.promise;
              }
              return rows;
            },
          }));
        },
      };
      try {
        const writing = repo(wrapped).saveSession(
          s.org,
          { moduleId: MODULE, groupId: s.group, sessionDate: DATE,
            trustedActorIdentityId: s.identity },
          [{ athleteId: s.athlete, status: "present" }], null,
        );
        await locked.promise;
        const revoking = new PostgresPrincipalPermissionAdministration(right.client)
          .replacePrincipalPermissions(
            principalId(s.identity),
            { grants: [], revokes: [capabilityId(CAPABILITY)] },
            { actorPrincipalId: principalId("p03i-supervisor"),
              reason: "P03-I concurrent revoke after authorized writer" },
          );
        release.release();
        const outcomes = await Promise.allSettled([writing, revoking]);
        expect(outcomes.map(x => x.status)).toEqual(["fulfilled", "fulfilled"]);
        expect(await count(s.org)).toBe(1);
        const updated = await db().client.unsafe(
          "SELECT id, xmin::text AS revision FROM ulc_linz_training_session WHERE organization_id = $1",
          [s.org],
        );
        await expect(repo().saveSession(
          s.org,
          { moduleId: MODULE, groupId: s.group, sessionDate: DATE,
            trustedActorIdentityId: s.identity },
          [{ athleteId: s.athlete, status: "absent" }],
          updated[0]?.revision as string,
        )).rejects.toBeInstanceOf(UlcTrainingActorWriteBlockedError);
      } finally {
        release.release();
        await left.client.end();
        await right.client.end();
      }
    }, 20_000);

    it("two connections: canonical principal FOR UPDATE revoke wins; stale writer fails closed", async () => {
      const s = await seed("p03i-revoke-before-write");
      const left = createPostgresDatabase(uri.toString());
      const right = createPostgresDatabase(uri.toString());
      const locked = deferred();
      const release = deferred();
      try {
        const revoking = left.client.begin(async tx => {
          await tx.unsafe(
            `SELECT principal_id FROM appbasis_permission_principal
             WHERE principal_id = $1 FOR UPDATE`, [s.identity],
          );
          locked.release();
          await release.promise;
          await tx.unsafe(
            `INSERT INTO appbasis_permission_principal_revoke
               (principal_id, capability_id) VALUES ($1, $2)`,
            [s.identity, CAPABILITY],
          );
        });
        await locked.promise;
        const writing = repo(right.client).saveSession(
          s.org,
          { moduleId: MODULE, groupId: s.group, sessionDate: DATE,
            trustedActorIdentityId: s.identity },
          [{ athleteId: s.athlete, status: "present" }], null,
        );
        release.release();
        const results = await Promise.allSettled([revoking, writing]);
        expect(results[0]?.status).toBe("fulfilled");
        expect(results[1]?.status).toBe("rejected");
        if (results[1]?.status === "rejected") {
          expect(results[1].reason).toBeInstanceOf(UlcTrainingActorWriteBlockedError);
        }
        expect(await count(s.org)).toBe(0);
      } finally {
        release.release();
        await left.client.end();
        await right.client.end();
      }
    }, 20_000);
  });
}
