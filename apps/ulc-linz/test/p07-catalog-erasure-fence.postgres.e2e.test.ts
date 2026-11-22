import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPostgresDatabase } from "@appbasis/database/postgres-provisioning";
import {
  PostgresExerciseCatalogRepository,
  type ExerciseCatalogPostgresClient,
} from "@appbasis/exercise-catalog";

/**
 * T07: candidate SQL fence versus direct/legacy database writers.
 * This fixture is intentionally NOT a published migration; the existing
 * production manifest, data, deployed Worker and operator gates stay intact.
 * Run only against a disposable local PostgreSQL CI instance.
 */
const inputUrl = process.env.DATABASE_URL;
if (inputUrl) {
  const url = new URL(inputUrl);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "::1"].includes(url.hostname) ||
    url.port !== "5432" ||
    url.username !== "postgres" ||
    url.pathname !== "/appbasis_identity_e2e"
  ) throw new Error("T07 catalog fence accepts only the disposable localhost PostgreSQL CI server.");
}

const suite = inputUrl ? describe : describe.skip;
const ORG = "t07-catalog-org";
const OTHER = "t07-catalog-other";
const PERSON = "t07-erased-person";
const NEIGHBOR = "t07-kept-person";
const EXERCISE = "t07-shared-exercise";
const COMPLETED = "2026-11-22T10:00:00.000Z";

suite("T07 catalog SQL erasure fence: disposable PostgreSQL only", () => {
  const admin = inputUrl ? createPostgresDatabase(inputUrl) : null;
  const databaseName = "ulc_t07_cat_" + randomUUID().replaceAll("-", "").slice(0, 13);
  const target = inputUrl ? new URL(inputUrl) : null;
  if (target) target.pathname = "/" + databaseName;
  let connection: ReturnType<typeof createPostgresDatabase> | null = null;
  let created = false;

  const sql = () => {
    if (!connection) throw new Error("Missing disposable T07 catalog database.");
    return connection.client;
  };
  async function favorites(organizationId = ORG, principalId = PERSON) {
    const rows = await sql().unsafe(
      `SELECT count(*)::int AS count
       FROM appbasis_exercise_catalog_favorite
       WHERE organization_id=$1 AND principal_id=$2`,
      [organizationId, principalId],
    );
    return Number(rows[0]?.count);
  }
  async function insertFavorite(organizationId = ORG, principalId = PERSON) {
    return sql().unsafe(
      `INSERT INTO appbasis_exercise_catalog_favorite
         (organization_id,principal_id,exercise_id)
       VALUES ($1,$2,$3)`,
      [organizationId, principalId, EXERCISE],
    );
  }
  async function markDeleted(organizationId = ORG, principalId = PERSON) {
    await sql().unsafe(
      `INSERT INTO appbasis_exercise_catalog_favorite_deletion
         (organization_id,principal_id,completed_at,purge_after)
       VALUES ($1,$2,$3::timestamptz,$3::timestamptz + interval '840 hours')`,
      [organizationId, principalId, COMPLETED],
    );
    await sql().unsafe(
      `DELETE FROM appbasis_exercise_catalog_favorite
       WHERE organization_id=$1 AND principal_id=$2`,
      [organizationId, principalId],
    );
  }
  async function insertUsageAndLink(
    organizationId: string, usageId: string, principalId: string,
  ) {
    return sql().begin(async tx => {
      await tx.unsafe(
        `INSERT INTO appbasis_exercise_catalog_usage
           (organization_id,id,exercise_id,occurred_at,source_kind,source_ref,note)
         VALUES ($1,$2,$3,now(),'training','synthetic-plan',NULL)`,
        [organizationId, usageId, EXERCISE],
      );
      await tx.unsafe(
        `INSERT INTO appbasis_exercise_catalog_usage_subject
           (organization_id,usage_id,principal_id,verified_by)
         VALUES ($1,$2,$3,'identity')`,
        [organizationId, usageId, principalId],
      );
    });
  }

  beforeAll(async () => {
    if (!admin || !target) throw new Error("Missing isolated local PostgreSQL.");
    const existing = await admin.client.unsafe(
      "SELECT 1 FROM pg_database WHERE datname=$1", [databaseName],
    );
    if (existing.length !== 0) throw new Error("T07 refuses reuse of a persistent database.");
    await admin.client.unsafe("CREATE DATABASE " + databaseName);
    created = true;
    connection = createPostgresDatabase(target.toString());

    for (const name of [
      "0000_appbasis_exercise_catalog_foundation.sql",
      "0001_appbasis_exercise_catalog_tenant_identity.sql",
      "0002_appbasis_exercise_catalog_parity.sql",
      "0003_appbasis_exercise_catalog_private_media_delete_state.sql",
      "0004_appbasis_exercise_catalog_subject_lifecycle.sql",
    ]) {
      const ddl = await readFile(
        new URL("../../../modules/exercise-catalog/migrations/" + name, import.meta.url),
        "utf8",
      );
      for (const statement of ddl.split("--> statement-breakpoint")) {
        if (statement.trim()) await sql().unsafe(statement);
      }
    }
    const candidate = await readFile(
      new URL("./fixtures/p07-catalog-erasure-fence.candidate.sql", import.meta.url),
      "utf8",
    );
    for (const statement of candidate.split("--> statement-breakpoint")) {
      if (statement.trim()) await sql().unsafe(statement);
    }
  }, 120_000);

  beforeEach(async () => {
    await sql().unsafe(
      `TRUNCATE TABLE
         appbasis_exercise_catalog_usage_subject,
         appbasis_exercise_catalog_usage,
         appbasis_exercise_catalog_favorite_deletion,
         appbasis_exercise_catalog_favorite,
         appbasis_exercise_catalog_item CASCADE`,
    );
    for (const organizationId of [ORG, OTHER]) {
      await sql().unsafe(
        `INSERT INTO appbasis_exercise_catalog_item
           (organization_id,id,name,category_key)
         VALUES ($1,$2,'Synthetic Training Exercise','speed')`,
        [organizationId, EXERCISE],
      );
    }
  });

  afterAll(async () => {
    if (connection) {
      await connection.client.end();
      connection = null;
    }
    if (created) await admin!.client.unsafe("DROP DATABASE " + databaseName + " WITH (FORCE)");
    await admin?.client.end();
  }, 120_000);

  it("blocks a legacy direct INSERT after erasure while preserving the other tenant", async () => {
    await insertFavorite();
    await insertFavorite(OTHER, PERSON);
    expect(await favorites()).toBe(1);
    await markDeleted();
    expect(await favorites()).toBe(0);
    await expect(insertFavorite()).rejects.toMatchObject({ code: "23514" });
    expect(await favorites()).toBe(0);
    expect(await favorites(OTHER, PERSON)).toBe(1);
    await insertFavorite(ORG, NEIGHBOR);
    expect(await favorites(ORG, NEIGHBOR)).toBe(1);
  });

  it("rejects a legacy UPDATE that retargets an existing favorite to an erased person", async () => {
    await insertFavorite(ORG, NEIGHBOR);
    await markDeleted();
    await expect(sql().unsafe(
      `UPDATE appbasis_exercise_catalog_favorite
         SET principal_id=$1 WHERE organization_id=$2 AND principal_id=$3`,
      [PERSON, ORG, NEIGHBOR],
    )).rejects.toMatchObject({ code: "23514" });
    expect(await favorites(ORG, NEIGHBOR)).toBe(1);
    expect(await favorites()).toBe(0);
  });

  it("keeps erasure deadlock-free when an old UPDATE already holds the favorite tuple", async () => {
    await insertFavorite();

    let rowLocked!: () => void;
    let issueUpdate!: () => void;
    let deleting!: () => void;
    const locked = new Promise<void>(resolve => { rowLocked = resolve; });
    const releaseUpdate = new Promise<void>(resolve => { issueUpdate = resolve; });
    const reachedDelete = new Promise<void>(resolve => { deleting = resolve; });

    // A legacy UPDATE has acquired PostgreSQL's tuple lock, then pauses.
    const legacy = sql().begin(async tx => {
      await tx.unsafe(
        `SELECT 1 FROM appbasis_exercise_catalog_favorite
         WHERE organization_id=$1 AND principal_id=$2 FOR UPDATE`,
        [ORG, PERSON],
      );
      rowLocked();
      await releaseUpdate;
      await tx.unsafe(
        `UPDATE appbasis_exercise_catalog_favorite
         SET principal_id=$1 WHERE organization_id=$2 AND principal_id=$3`,
        [NEIGHBOR, ORG, PERSON],
      );
    });
    await locked;

    // The REAL guarded repository obtains the advisory lock first. Signal
    // just before it executes DELETE; that DELETE then awaits the tuple lock.
    const adapter: ExerciseCatalogPostgresClient = {
      unsafe(query, parameters) {
        return sql().unsafe(query, parameters);
      },
      begin(callback) {
        return sql().begin(async tx => callback({
          async unsafe(query, parameters) {
            if (query.includes("DELETE FROM appbasis_exercise_catalog_favorite")) {
              deleting();
            }
            return tx.unsafe(query, parameters);
          },
        }));
      },
    };
    const protectedRepository = new PostgresExerciseCatalogRepository(adapter, {
      favoriteFenceMode: "require-catalog-erasure-marker",
    });
    const erasure = protectedRepository.markPrincipalDeletedAndDeleteFavorites(
      ORG, PERSON, new Date(COMPLETED),
    );
    await reachedDelete;

    // Previously a BEFORE UPDATE trigger tried the advisory lock while the
    // erasure held it and was waiting for the tuple: a genuine 40P01 cycle.
    // The candidate now rejects UPDATE before attempting that lock.
    issueUpdate();
    await expect(legacy).rejects.toMatchObject({ code: "23514" });
    await expect(erasure).resolves.toMatchObject({
      markerInserted: true,
      deletedFavorites: 1,
    });
    expect(await favorites()).toBe(0);
    await expect(insertFavorite()).rejects.toMatchObject({ code: "23514" });
  }, 120_000);

  it("rejects stale verified-usage association atomically, not just the favorite", async () => {
    await insertUsageAndLink(ORG, "usage-before", PERSON);
    await markDeleted();
    await expect(insertUsageAndLink(ORG, "usage-after", PERSON))
      .rejects.toMatchObject({ code: "23514" });
    const rows = await sql().unsafe(
      `SELECT count(*)::int AS count FROM appbasis_exercise_catalog_usage
       WHERE organization_id=$1 AND id='usage-after'`,
      [ORG],
    );
    expect(Number(rows[0]?.count)).toBe(0);
    await insertUsageAndLink(OTHER, "usage-other-org", PERSON);
    await insertUsageAndLink(ORG, "usage-neighbor", NEIGHBOR);
  });

  it("denies READ REPEATABLE transactions before any stale-snapshot marker lookup", async () => {
    await expect(sql().begin(async tx => {
      await tx.unsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      await tx.unsafe(
        `INSERT INTO appbasis_exercise_catalog_favorite
         (organization_id,principal_id,exercise_id) VALUES ($1,$2,$3)`,
        [ORG, NEIGHBOR, EXERCISE],
      );
    })).rejects.toMatchObject({ code: "25001" });
    expect(await favorites(ORG, NEIGHBOR)).toBe(0);
  });

  it("installs exactly two active guards while leaving the published manifest unchanged", async () => {
    const rows = await sql().unsafe(
      `SELECT count(*)::int AS count
       FROM pg_catalog.pg_trigger
       WHERE NOT tgisinternal AND tgenabled IN ('O','A')
         AND tgfoid=to_regprocedure(
           'public.appbasis_exercise_catalog_subject_deletion_write_fence()'
         )`,
    );
    expect(Number(rows[0]?.count)).toBe(2);
    const manifest = JSON.parse(await readFile(
      new URL("../appbasis.database.json", import.meta.url), "utf8",
    )) as { owners: { id: string; migrations: string[] }[] };
    const catalog = manifest.owners.find(owner => owner.id === "exercise-catalog");
    expect(catalog?.migrations).toHaveLength(5);
    expect(catalog?.migrations.some(path => path.includes("p07-catalog-erasure-fence")))
      .toBe(false);
    expect(manifest.owners.flatMap(owner => owner.migrations)).toHaveLength(46);
    // This SQL is only a tested fixture: no production release claim.
  });
});
