import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresDatabase } from "@appbasis/database/postgres-provisioning";
import { PostgresTrainingBlockRepository } from "@appbasis/training-blocks";
import {
  assertUlcDedicatedBlockErasureRoleReady,
  UlcBlockErasureRoleNotReadyError,
} from "../worker/training-block-erasure-role-readiness";
import {
  assertUlcProtectedCatalogProductionReadiness,
  UlcProtectedCatalogUnavailableError,
  type UlcProtectedCatalogPreviewReadinessClient,
} from "../worker/exercise-catalog-protected-runtime-readiness";
import {
  assertUlcVerifiedBlockUsageProductionReadiness,
  UlcVerifiedBlockUsageUnavailableError,
} from "../worker/training-block-verified-runtime-readiness";
import {
  assertUlcLegacyBlockUsageRoleCutoverReady,
  UlcLegacyBlockUsageCutoverNotReadyError,
} from "../worker/training-block-legacy-rights-cutover";
import {
  assertUlcTrainingDocumentationProductionReadiness,
  UlcTrainingDocumentationProductionUnavailableError,
} from "../worker/training-documentation-production-readiness";

/**
 * P4 private-pilot rehearsal: genuine PostgreSQL 18 SQL privileges and
 * canonical v18 schema against one ephemeral, local-only database.
 * The exact production-role and database-name guards cannot meaningfully
 * be tested against a randomly named DB, so we create 'neondb' only after
 * proving that the local CI database/role names do not already exist.
 *
 * Never connects to Neon, production or Preview. No live app writes.
 * Success is not a legal/lifecycle/production activation approval.
 */
const baseUrl = process.env.DATABASE_URL;
const databaseName = "neondb";
const applicationRole = "ulc_linz_application";
const describeLocal = baseUrl ? describe : describe.skip;

if (baseUrl) {
  const base = new URL(baseUrl);
  if (
    !["localhost", "127.0.0.1", "::1"].includes(base.hostname) ||
    base.port !== "5432" ||
    base.username !== "postgres" ||
    base.pathname !== "/appbasis_identity_e2e"
  ) {
    throw new Error("P4 role rehearsal requires the disposable localhost CI PostgreSQL service only.");
  }
}

describeLocal("P4 protected production role admission on real disposable 69-table PostgreSQL", () => {
  const admin = baseUrl ? createPostgresDatabase(baseUrl) : null;
  const secret = randomBytes(18).toString("hex");
  const erasureSecret = randomBytes(18).toString("hex");
  const erasureRole = "ulc_linz_erasure";
  const isolatedUrl = baseUrl ? new URL(baseUrl) : null;
  const appUrl = baseUrl ? new URL(baseUrl) : null;
  const erasureUrl = baseUrl ? new URL(baseUrl) : null;
  if (isolatedUrl) isolatedUrl.pathname = "/" + databaseName;
  if (appUrl) {
    appUrl.pathname = "/" + databaseName;
    appUrl.username = applicationRole;
    appUrl.password = secret;
  }
  if (erasureUrl) {
    erasureUrl.pathname = "/" + databaseName;
    erasureUrl.username = erasureRole;
    erasureUrl.password = erasureSecret;
  }

  type Database = ReturnType<typeof createPostgresDatabase>;
  let owner: Database | null = null;
  let app: Database | null = null;
  let erasure: Database | null = null;
  let createdDatabase = false;
  let createdRole = false;
  let createdErasureRole = false;
  function database(): Database {
    if (!owner) throw new Error("P4 disposable schema was not initialized.");
    return owner;
  }
  function ordinaryApp(): Database {
    if (!app) throw new Error("P4 disposable app principal was not initialized.");
    return app;
  }
  function erasureOwner(): Database {
    if (!erasure) throw new Error("P4 isolated erasure role was not initialized.");
    return erasure;
  }
  function adapter(connection: Database): UlcProtectedCatalogPreviewReadinessClient {
    return {
      begin<T>(callback: (transaction: {
        unsafe(query: string, parameters?: Array<string | number | boolean | null>):
          PromiseLike<readonly Record<string, unknown>[]>;
      }) => Promise<T>): Promise<T> {
        return connection.client.begin(async transaction => callback({
          unsafe(query, parameters) { return transaction.unsafe(query, parameters); },
        }));
      },
    };
  }

  beforeAll(async () => {
    if (!admin || !isolatedUrl || !appUrl || !erasureUrl) {
      throw new Error("Missing P4 localhost connection.");
    }
    const existing = await admin.client.unsafe(
      "SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1) AS db, " +
      "EXISTS(SELECT 1 FROM pg_roles WHERE rolname = $2) AS principal, " +
      "EXISTS(SELECT 1 FROM pg_roles WHERE rolname = $3) AS erasure",
      [databaseName, applicationRole, erasureRole],
    );
    if (existing[0]?.db !== false || existing[0]?.principal !== false ||
        existing[0]?.erasure !== false) {
      throw new Error("P4 refuses an existing database or login role: no destructive reuse.");
    }
    await admin.client.unsafe(
      "CREATE ROLE " + applicationRole + " LOGIN PASSWORD '" + secret + "'",
    );
    createdRole = true;
    await admin.client.unsafe(
      "CREATE ROLE " + erasureRole +
      " LOGIN NOINHERIT PASSWORD '" + erasureSecret + "'",
    );
    createdErasureRole = true;
    await admin.client.unsafe("CREATE DATABASE " + databaseName);
    createdDatabase = true;
    owner = createPostgresDatabase(isolatedUrl.toString());

    const manifest = JSON.parse(await readFile(
      new URL("../appbasis.database.json", import.meta.url), "utf8",
    )) as { owners: readonly { migrations: readonly string[] }[] };
    const migrations = manifest.owners.flatMap(x => x.migrations);
    if (migrations.length !== 45 || new Set(migrations).size !== 45 ||
      !migrations.some(x => x.endsWith("0017_ulc_linz_training_subject_write_fence.sql"))) {
      throw new Error("P4 requires exactly the published 45-migration v18 manifest.");
    }
    for (const path of migrations) {
      const sql = await readFile(new URL("../../../" + path, import.meta.url), "utf8");
      for (const statement of sql.split("--> statement-breakpoint")) {
        if (statement.trim()) await database().client.unsafe(statement);
      }
    }
    const tables = await database().client.unsafe(
      "SELECT count(*)::int AS count FROM pg_catalog.pg_tables WHERE schemaname='public'",
    );
    if (tables[0]?.count !== 69) throw new Error("P4 requires exactly 69 real tables.");

    // Grant only operations explicitly verified by the three production checks.
    // In particular NEVER GRANT any app access to the training-subject marker.
    const grants = [
      ["SELECT, INSERT, UPDATE", "appbasis_exercise_catalog_item"],
      ["SELECT, INSERT, DELETE", "appbasis_exercise_catalog_favorite"],
      ["SELECT, INSERT, DELETE", "appbasis_exercise_catalog_parameter"],
      ["SELECT, INSERT, DELETE", "appbasis_exercise_catalog_audience"],
      ["SELECT, INSERT, DELETE", "appbasis_exercise_catalog_video"],
      ["SELECT, INSERT, DELETE", "appbasis_exercise_catalog_similarity"],
      ["SELECT", "appbasis_exercise_catalog_favorite_deletion"],
      ["INSERT, SELECT", "appbasis_training_block_usage_subject"],
      ["SELECT", "appbasis_training_block_usage_subject_deletion"],
      ["SELECT, INSERT", "appbasis_training_block_usage"],
      // The verified writer resolves its block through INSERT ... SELECT;
      // real production grants this exact read privilege to the app role.
      ["SELECT", "appbasis_training_block"],
      ["SELECT", "appbasis_training_plan"],
      ["SELECT", "appbasis_training_plan_revision"],
      ["SELECT", "appbasis_training_plan_revision_item"],
      ["SELECT, INSERT, UPDATE", "appbasis_training_documentation"],
      ["SELECT, INSERT", "appbasis_training_documentation_revision"],
      ["SELECT", "appbasis_training_documentation_subject_deletion"],
    ] as const;
    await database().client.unsafe("GRANT USAGE ON SCHEMA public TO " + applicationRole);
    for (const [operations, table] of grants) {
      await database().client.unsafe(
        "GRANT " + operations + " ON public." + table + " TO " + applicationRole,
      );
    }

    // Dedicated owner-specific privileges. Erasure never runs with the broad
    // migration database owner or the HTTP application's SQL identity.
    await database().client.unsafe(
      "GRANT USAGE ON SCHEMA public TO " + erasureRole,
    );
    for (const [operations, table] of [
      ["SELECT, DELETE", "appbasis_training_block_usage"],
      ["SELECT", "appbasis_training_block_usage_subject"],
      ["SELECT, INSERT, UPDATE", "appbasis_training_block_usage_subject_deletion"],
    ] as const) {
      await database().client.unsafe(
        "GRANT " + operations + " ON public." + table + " TO " + erasureRole,
      );
    }
    app = createPostgresDatabase(appUrl.toString());
    erasure = createPostgresDatabase(erasureUrl.toString());
    const current = await ordinaryApp().client.unsafe(
      "SELECT current_database() AS database_name, current_user AS principal_name",
    );
    expect(current[0]).toMatchObject({
      database_name: databaseName, principal_name: applicationRole,
    });
  }, 120_000);

  afterAll(async () => {
    // Disconnect before a database drop. Never drop a pre-existing database.
    if (app) { await app.client.end(); app = null; }
    if (erasure) { await erasure.client.end(); erasure = null; }
    if (owner) { await owner.client.end(); owner = null; }
    if (admin) {
      try {
        if (createdDatabase) {
          await admin.client.unsafe("DROP DATABASE " + databaseName + " WITH (FORCE)");
          createdDatabase = false;
        }
        if (createdRole) {
          await admin.client.unsafe("DROP ROLE " + applicationRole);
          createdRole = false;
        }
        if (createdErasureRole) {
          await admin.client.unsafe("DROP ROLE " + erasureRole);
          createdErasureRole = false;
        }
      } finally {
        await admin.client.end();
      }
    }
  }, 120_000);

  it("admits only the dedicated erasure SQL user; rejects app and generic owner", async () => {
    await expect(assertUlcDedicatedBlockErasureRoleReady(
      adapter(erasureOwner()), "production",
    )).resolves.toBeUndefined();
    await expect(assertUlcDedicatedBlockErasureRoleReady(
      adapter(ordinaryApp()), "production",
    )).rejects.toBeInstanceOf(UlcBlockErasureRoleNotReadyError);
    await expect(assertUlcDedicatedBlockErasureRoleReady(
      adapter(database()), "production",
    )).rejects.toBeInstanceOf(UlcBlockErasureRoleNotReadyError);
  });

  it("rejects partial INSERT grants on usage and attribution despite missing table grants", async () => {
    const roleSql = adapter(erasureOwner());
    const cases = [
      ["appbasis_training_block_usage", "note"],
      ["appbasis_training_block_usage_subject", "subject_id"],
    ] as const;
    for (const [table, column] of cases) {
      const target = "public." + table;
      await database().client.unsafe(
        "GRANT INSERT (" + column + ") ON " + target + " TO " + erasureRole,
      );
      try {
        const grants = await erasureOwner().client.unsafe(
          "SELECT has_table_privilege(current_user,$1,'INSERT') AS full_table, " +
          "has_any_column_privilege(current_user,$1,'INSERT') AS any_column",
          [target],
        );
        expect(grants).toEqual([{ full_table: false, any_column: true }]);
        await expect(assertUlcDedicatedBlockErasureRoleReady(
          roleSql, "production",
        )).rejects.toBeInstanceOf(UlcBlockErasureRoleNotReadyError);
      } finally {
        await database().client.unsafe(
          "REVOKE INSERT (" + column + ") ON " + target + " FROM " + erasureRole,
        );
      }
      await expect(assertUlcDedicatedBlockErasureRoleReady(
        roleSql, "production",
      )).resolves.toBeUndefined();
    }
  });

  it("denies excess column UPDATE and foreign-table writes for erasure user", async () => {
    const sql = adapter(erasureOwner());
    await database().client.unsafe(
      "GRANT UPDATE (note) ON public.appbasis_training_block_usage TO " + erasureRole,
    );
    try {
      await expect(assertUlcDedicatedBlockErasureRoleReady(sql, "production"))
        .rejects.toBeInstanceOf(UlcBlockErasureRoleNotReadyError);
    } finally {
      await database().client.unsafe(
        "REVOKE UPDATE (note) ON public.appbasis_training_block_usage FROM " + erasureRole,
      );
    }
    await expect(assertUlcDedicatedBlockErasureRoleReady(sql, "production"))
      .resolves.toBeUndefined();
    await database().client.unsafe(
      "GRANT INSERT ON public.ulc_linz_training_attendance TO " + erasureRole,
    );
    try {
      await expect(assertUlcDedicatedBlockErasureRoleReady(sql, "production"))
        .rejects.toBeInstanceOf(UlcBlockErasureRoleNotReadyError);
    } finally {
      await database().client.unsafe(
        "REVOKE INSERT ON public.ulc_linz_training_attendance FROM " + erasureRole,
      );
    }
    await expect(assertUlcDedicatedBlockErasureRoleReady(sql, "production"))
      .resolves.toBeUndefined();
  });

  it("allows all three production preflights together with real role, schema, ACLs and SQL triggers", async () => {
    const sql = adapter(ordinaryApp());
    await expect(assertUlcProtectedCatalogProductionReadiness(sql)).resolves.toBeUndefined();
    await expect(assertUlcVerifiedBlockUsageProductionReadiness(sql)).resolves.toBeUndefined();
    await expect(assertUlcTrainingDocumentationProductionReadiness(sql)).resolves.toBeUndefined();

    const guardFunctions = await database().client.unsafe(
      "SELECT proname, has_function_privilege($1, oid, 'EXECUTE') AS app_execute " +
      "FROM pg_proc WHERE proname IN " +
      "('appbasis_training_documentation_guard_root_insert'," +
      "'appbasis_training_documentation_guard_revision_write') ORDER BY proname",
      [applicationRole],
    );
    expect(guardFunctions).toHaveLength(2);
    expect(guardFunctions.every(x => x.app_execute === false)).toBe(true);
  });

  it("cannot access either private owner marker by direct SELECT or INSERT", async () => {
    await expect(ordinaryApp().client.unsafe(
      "SELECT count(*) FROM public.ulc_linz_training_subject_deletion",
    )).rejects.toThrow(/permission denied/i);
    await expect(ordinaryApp().client.unsafe(
      "INSERT INTO public.ulc_linz_training_subject_deletion " +
      "(organization_id, athlete_id, completed_at, purge_after) " +
      "VALUES ('synthetic-p4','subject-p4',now(),now()+interval '35 days')",
    )).rejects.toThrow(/permission denied/i);
  });

  it("fails closed if a required catalog write grant is revoked, then recovers after exact restoration", async () => {
    const sql = adapter(ordinaryApp());
    await database().client.unsafe(
      "REVOKE INSERT ON public.appbasis_exercise_catalog_favorite FROM " + applicationRole,
    );
    try {
      await expect(assertUlcProtectedCatalogProductionReadiness(sql))
        .rejects.toBeInstanceOf(UlcProtectedCatalogUnavailableError);
      await expect(assertUlcVerifiedBlockUsageProductionReadiness(sql)).resolves.toBeUndefined();
    } finally {
      await database().client.unsafe(
        "GRANT INSERT ON public.appbasis_exercise_catalog_favorite TO " + applicationRole,
      );
    }
    await expect(assertUlcProtectedCatalogProductionReadiness(sql)).resolves.toBeUndefined();
  });

  it("blocks unauthorized direct mutation grants on subject usage and its deletion marker", async () => {
    const sql = adapter(ordinaryApp());
    for (const [table, privilege] of [
      ["appbasis_training_block_usage_subject", "DELETE"],
      ["appbasis_training_block_usage_subject_deletion", "INSERT"],
    ] as const) {
      await database().client.unsafe(
        "GRANT " + privilege + " ON public." + table + " TO " + applicationRole,
      );
      try {
        await expect(assertUlcVerifiedBlockUsageProductionReadiness(sql))
          .rejects.toBeInstanceOf(UlcVerifiedBlockUsageUnavailableError);
      } finally {
        await database().client.unsafe(
          "REVOKE " + privilege + " ON public." + table + " FROM " + applicationRole,
        );
      }
      await expect(assertUlcVerifiedBlockUsageProductionReadiness(sql))
        .resolves.toBeUndefined();
    }
  });

  it("rejects column-scoped mutation grants in both ACTIVE preview and production admission paths", async () => {
    const sql = adapter(ordinaryApp());
    const variants = [
      ["appbasis_training_block_usage_subject", "UPDATE", "subject_id"],
      ["appbasis_training_block_usage_subject_deletion", "INSERT", "subject_id"],
      ["appbasis_training_block_usage_subject_deletion", "UPDATE", "purge_after"],
    ] as const;
    await expect(assertUlcVerifiedBlockUsageProductionReadiness(sql))
      .resolves.toBeUndefined();
    for (const [table, operation, column] of variants) {
      const target = "public." + table;
      await database().client.unsafe(
        "GRANT " + operation + " (" + column + ") ON " + target +
        " TO " + applicationRole,
      );
      try {
        const effective = await ordinaryApp().client.unsafe(
          "SELECT has_table_privilege(current_user,$1,$2) AS table_level, " +
          "has_any_column_privilege(current_user,$1,$2) AS column_effective",
          [target, operation],
        );
        expect(effective).toEqual([{table_level:false,column_effective:true}]);
        await expect(assertUlcVerifiedBlockUsageProductionReadiness(sql))
          .rejects.toBeInstanceOf(UlcVerifiedBlockUsageUnavailableError);
      } finally {
        await database().client.unsafe(
          "REVOKE " + operation + " (" + column + ") ON " + target +
          " FROM " + applicationRole,
        );
      }
      await expect(assertUlcVerifiedBlockUsageProductionReadiness(sql))
        .resolves.toBeUndefined();
    }
  });

  it("keeps protected verified-subject usage idempotent after real app ACL cutover", async () => {
    const applicationSql = ordinaryApp().client;
    // These are the actual production user/database names in an isolated
    // localhost-only PostgreSQL DB. No elevated migration-owner connection
    // is used by the writer, and UPDATE/DELETE are forbidden by real ACLs.
    await expect(assertUlcLegacyBlockUsageRoleCutoverReady(
      adapter(ordinaryApp()), "production",
    )).resolves.toBeUndefined();
    await expect(assertUlcVerifiedBlockUsageProductionReadiness(
      adapter(ordinaryApp()),
    )).resolves.toBeUndefined();

    const organizationId = "p4-verified-post-cutover";
    const blockId = "p4-post-cutover-block";
    const subjectId = "p4-post-cutover-subject";
    const usageId = "p4-post-cutover-usage";
    await database().client.begin(async transaction => {
      await transaction.unsafe(
        "INSERT INTO public.appbasis_training_block(id,organization_id) VALUES ($1,$2)",
        [blockId, organizationId],
      );
      await transaction.unsafe(
        `INSERT INTO public.appbasis_training_block_revision
          (organization_id,block_id,revision,name)
          VALUES ($1,$2,1,'P4 synthetic post-cutover block')`,
        [organizationId, blockId],
      );
    });

    const usageWriter = new PostgresTrainingBlockRepository(applicationSql);
    const event = {
      organizationId, id: usageId, blockId,
      occurredAt: "2026-11-22T12:00:00.000Z",
      sourceKind: "training_plan" as const,
      sourceRef: "p4-plan:p4-item", note: null,
    };
    const input = {
      event, subjectId, sourcePlanId: "p4-plan", sourceItemId: "p4-item",
    };
    // First insert AND replay use the ordinary application SQL login:
    // SELECT/INSERT allowed, UPDATE/DELETE (including SELECT FOR UPDATE) denied.
    await expect(usageWriter.recordVerifiedSubjectUsageOnce(input))
      .resolves.toEqual(event);
    await expect(usageWriter.recordVerifiedSubjectUsageOnce(input))
      .resolves.toEqual(event);
    const beforeDeletion = await applicationSql.unsafe(
      `SELECT count(*)::int AS count FROM public.appbasis_training_block_usage
         WHERE organization_id=$1 AND id=$2`, [organizationId, usageId],
    );
    expect(beforeDeletion).toEqual([{count: 1}]);
    const assigned = await applicationSql.unsafe(
      `SELECT count(*)::int AS count FROM public.appbasis_training_block_usage_subject
         WHERE organization_id=$1 AND usage_id=$2 AND subject_id=$3`,
      [organizationId, usageId, subjectId],
    );
    expect(assigned).toEqual([{count: 1}]);

    // The separate minimal erasure role (only a synthetic LOGIN in this
    // disposable test, NOLOGIN in real production) atomically creates the
    // tombstone and deletes attributed usage. The ordinary app cannot delete.
    await expect(new PostgresTrainingBlockRepository(
      erasureOwner().client,
    ).markSubjectDeletedAndRemoveAttributedUsage(
      organizationId, subjectId, new Date("2026-11-22T13:00:00.000Z"),
    )).resolves.toEqual({markerInserted:true,deletedUsageEvents:1});
    await expect(usageWriter.recordVerifiedSubjectUsageOnce(input))
      .rejects.toThrow(/deletion marker/);

    // A direct SQL replay by the otherwise INSERT-privileged app role must
    // fail in the DB trigger, rolling back the legacy usage INSERT as well.
    await expect(applicationSql.begin(async transaction => {
      await transaction.unsafe(
        `INSERT INTO public.appbasis_training_block_usage
          (organization_id,id,block_id,occurred_at,source_kind,source_ref,note)
          VALUES ($1,$2,$3,$4::timestamptz,'training_plan',$5,NULL)`,
        [organizationId, "p4-post-cutover-replay", blockId, event.occurredAt, event.sourceRef],
      );
      await transaction.unsafe(
        `INSERT INTO public.appbasis_training_block_usage_subject
          (organization_id,usage_id,subject_id,source_plan_id,source_item_id)
          VALUES ($1,$2,$3,'p4-plan','p4-item')`,
        [organizationId, "p4-post-cutover-replay", subjectId],
      );
    })).rejects.toThrow(/deletion marker/);

    const residue = await applicationSql.unsafe(
      `SELECT (SELECT count(*)::int FROM public.appbasis_training_block_usage
               WHERE organization_id=$1) AS usage_rows,
              (SELECT count(*)::int FROM public.appbasis_training_block_usage_subject
               WHERE organization_id=$1) AS attribution_rows,
              (SELECT count(*)::int FROM public.appbasis_training_block_usage_subject_deletion
               WHERE organization_id=$1 AND subject_id=$2) AS markers`,
      [organizationId, subjectId],
    );
    expect(residue).toEqual([{usage_rows:0,attribution_rows:0,markers:1}]);
    await expect(assertUlcLegacyBlockUsageRoleCutoverReady(
      adapter(ordinaryApp()), "production",
    )).resolves.toBeUndefined();
  });

  it("separates ordinary app INSERT from privileged legacy UPDATE and DELETE on real PostgreSQL", async () => {
    const roleSql = adapter(ordinaryApp());
    await expect(assertUlcLegacyBlockUsageRoleCutoverReady(
      roleSql, "production",
    )).resolves.toBeUndefined();

    for (const privilege of ["UPDATE", "DELETE"]) {
      // Deliberate privilege drift only in this disposable localhost database.
      await database().client.unsafe(
        "GRANT " + privilege + " ON public.appbasis_training_block_usage TO " +
        applicationRole,
      );
      try {
        await expect(assertUlcLegacyBlockUsageRoleCutoverReady(
          roleSql, "production",
        )).rejects.toBeInstanceOf(UlcLegacyBlockUsageCutoverNotReadyError);
      } finally {
        await database().client.unsafe(
          "REVOKE " + privilege + " ON public.appbasis_training_block_usage FROM " +
          applicationRole,
        );
      }
      await expect(assertUlcLegacyBlockUsageRoleCutoverReady(
        roleSql, "production",
      )).resolves.toBeUndefined();
    }

    const org = "p4-role-cutover-club";
    const block = "p4-role-cutover-block";
    const usage = "p4-role-cutover-usage";
    // Seed only a synthetic block in a disposable database, satisfying the
    // deferred current-revision FK in the same transaction.
    await database().client.begin(async tx => {
      await tx.unsafe(
        "INSERT INTO appbasis_training_block(id,organization_id) VALUES ($1,$2)",
        [block,org],
      );
      await tx.unsafe(
        `INSERT INTO appbasis_training_block_revision
          (organization_id,block_id,revision,name)
         VALUES ($1,$2,1,'Synthetic P4 block')`,
        [org,block],
      );
    });
    await ordinaryApp().client.unsafe(
      `INSERT INTO appbasis_training_block_usage
       (organization_id,id,block_id,occurred_at,source_kind,source_ref,note)
       VALUES ($1,$2,$3,now(),'training_plan','synthetic-plan:item-1',NULL)`,
      [org,usage,block],
    );
    await ordinaryApp().client.unsafe(
      `INSERT INTO appbasis_training_block_usage_subject
       (organization_id,usage_id,subject_id,source_plan_id,source_item_id)
       VALUES ($1,$2,'synthetic-athlete','synthetic-plan','item-1')`,
      [org,usage],
    );
    await expect(ordinaryApp().client.unsafe(
      "UPDATE appbasis_training_block_usage SET note='forbidden' " +
      "WHERE organization_id=$1 AND id=$2",
      [org,usage],
    )).rejects.toThrow(/permission denied/i);
    await expect(ordinaryApp().client.unsafe(
      "DELETE FROM appbasis_training_block_usage WHERE organization_id=$1 AND id=$2",
      [org,usage],
    )).rejects.toThrow(/permission denied/i);

    // Only the separately scoped erasure role can perform actual erasure.
    // This also creates the canonical 35-day marker in the SAME transaction.
    const erased = await new PostgresTrainingBlockRepository(
      erasureOwner().client,
    ).markSubjectDeletedAndRemoveAttributedUsage(
      org, "synthetic-athlete", new Date("2026-11-22T06:00:00.000Z"),
    );
    expect(erased).toEqual({
      markerInserted: true,
      deletedUsageEvents: 1,
    });
    await expect(ordinaryApp().client.unsafe(
      "DELETE FROM appbasis_training_block_usage_subject_deletion " +
      "WHERE organization_id=$1 AND subject_id='synthetic-athlete'",
      [org],
    )).rejects.toThrow(/permission denied/i);
    const markers = await database().client.unsafe(
      "SELECT COUNT(*)::int AS count FROM appbasis_training_block_usage_subject_deletion " +
      "WHERE organization_id=$1 AND subject_id='synthetic-athlete'",
      [org],
    );
    expect(markers).toEqual([{ count: 1 }]);
    const attributed = await database().client.unsafe(
      "SELECT COUNT(*)::int AS count FROM appbasis_training_block_usage_subject " +
      "WHERE organization_id=$1",
      [org],
    );
    expect(attributed).toEqual([{ count: 0 }]);
  });

  it("detects column-level grants which table-only UPDATE/INSERT checks would miss", async () => {
    const roleSql = adapter(ordinaryApp());
    const examples = [
      ["appbasis_training_block_usage", "UPDATE", "note"],
      ["appbasis_training_block_usage_subject", "UPDATE", "subject_id"],
      ["appbasis_training_block_usage_subject_deletion", "INSERT", "subject_id"],
      ["appbasis_training_block_usage_subject_deletion", "UPDATE", "purge_after"],
    ] as const;
    for (const [table, operation, column] of examples) {
      const target = "public." + table;
      // The ordinary application has no table-level grant on these
      // operations; the deliberately added single-column grant is sufficient
      // to make the data mutation possible and must be detected.
      await database().client.unsafe(
        "GRANT " + operation + " (" + column + ") ON " +
        target + " TO " + applicationRole,
      );
      try {
        const effective = await ordinaryApp().client.unsafe(
          "SELECT has_table_privilege(current_user,$1,$2) AS table_level, " +
          "has_any_column_privilege(current_user,$1,$2) AS column_effective",
          [target, operation],
        );
        expect(effective).toEqual([{
          table_level: false,
          column_effective: true,
        }]);
        await expect(assertUlcLegacyBlockUsageRoleCutoverReady(
          roleSql, "production",
        )).rejects.toBeInstanceOf(UlcLegacyBlockUsageCutoverNotReadyError);
      } finally {
        await database().client.unsafe(
          "REVOKE " + operation + " (" + column + ") ON " +
          target + " FROM " + applicationRole,
        );
      }
      await expect(assertUlcLegacyBlockUsageRoleCutoverReady(
        roleSql, "production",
      )).resolves.toBeUndefined();
    }
  });

  it("fails closed on training-block subject grant drift without disabling documentation", async () => {
    const sql = adapter(ordinaryApp());
    await database().client.unsafe(
      "REVOKE SELECT ON public.appbasis_training_plan_revision_item FROM " + applicationRole,
    );
    try {
      await expect(assertUlcVerifiedBlockUsageProductionReadiness(sql))
        .rejects.toBeInstanceOf(UlcVerifiedBlockUsageUnavailableError);
      await expect(assertUlcTrainingDocumentationProductionReadiness(sql)).resolves.toBeUndefined();
    } finally {
      await database().client.unsafe(
        "GRANT SELECT ON public.appbasis_training_plan_revision_item TO " + applicationRole,
      );
    }
    await expect(assertUlcVerifiedBlockUsageProductionReadiness(sql)).resolves.toBeUndefined();
  });

  it("fails closed if documentation guard trigger is disabled, then recovers when restored", async () => {
    const sql = adapter(ordinaryApp());
    await database().client.unsafe(
      "ALTER TABLE public.appbasis_training_documentation " +
      "DISABLE TRIGGER appbasis_training_documentation_guard_root",
    );
    try {
      await expect(assertUlcTrainingDocumentationProductionReadiness(sql))
        .rejects.toBeInstanceOf(UlcTrainingDocumentationProductionUnavailableError);
      await expect(assertUlcProtectedCatalogProductionReadiness(sql)).resolves.toBeUndefined();
    } finally {
      await database().client.unsafe(
        "ALTER TABLE public.appbasis_training_documentation " +
        "ENABLE TRIGGER appbasis_training_documentation_guard_root",
      );
    }
    await expect(assertUlcTrainingDocumentationProductionReadiness(sql)).resolves.toBeUndefined();
  });

  it("fails closed if app ever gains private training-subject marker privileges", async () => {
    const sql = adapter(ordinaryApp());
    await database().client.unsafe(
      "GRANT SELECT ON public.ulc_linz_training_subject_deletion TO " + applicationRole,
    );
    try {
      await expect(assertUlcProtectedCatalogProductionReadiness(sql))
        .rejects.toBeInstanceOf(UlcProtectedCatalogUnavailableError);
      await expect(assertUlcVerifiedBlockUsageProductionReadiness(sql))
        .rejects.toBeInstanceOf(UlcVerifiedBlockUsageUnavailableError);
      await expect(assertUlcTrainingDocumentationProductionReadiness(sql))
        .rejects.toBeInstanceOf(UlcTrainingDocumentationProductionUnavailableError);
    } finally {
      await database().client.unsafe(
        "REVOKE SELECT ON public.ulc_linz_training_subject_deletion FROM " + applicationRole,
      );
    }
    await expect(assertUlcProtectedCatalogProductionReadiness(sql)).resolves.toBeUndefined();
    await expect(assertUlcVerifiedBlockUsageProductionReadiness(sql)).resolves.toBeUndefined();
    await expect(assertUlcTrainingDocumentationProductionReadiness(sql)).resolves.toBeUndefined();
  });

  it("does not insert persistent real-looking training or personal records", async () => {
    const tables = [
      "appbasis_exercise_catalog_favorite",
      "appbasis_training_block_usage",
      "appbasis_training_documentation",
      "appbasis_training_documentation_revision",
      "ulc_linz_training_attendance",
    ];
    for (const name of tables) {
      const rows = await database().client.unsafe(
        "SELECT count(*)::int AS count FROM public." + name,
      );
      expect(rows[0]?.count).toBe(0);
    }
  });
});
