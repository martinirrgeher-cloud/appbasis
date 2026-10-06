import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import { parseGeneratedPreviewDatabaseUrl } from "./generated-preview-hyperdrive.mjs";
import { ULC_LINZ_D4_PREVIEW_APPLICATION_HYPERDRIVE } from "./ulc-linz-d4-preview-hyperdrive.mjs";

const EXPECTED_DATABASE = "appbasis_ulc_linz_preview";
const EXPECTED_PRINCIPAL = "appbasis_ulc_linz_preview_migration";
const EXPECTED_ENVIRONMENT = "generated-preview-ulc-linz";
const DEFAULT_REPOSITORY_ROOT = resolve(
  fileURLToPath(new URL("../", import.meta.url)),
);

export class UlcExerciseCatalogCutoverReadinessError extends Error {
  constructor(message) {
    super(message);
    this.name = "UlcExerciseCatalogCutoverReadinessError";
  }
}

export async function inspectUlcExerciseCatalogCutoverReadiness(
  { connectionString } = {},
  {
    repositoryRoot = DEFAULT_REPOSITORY_ROOT,
    databaseFactory = createPostgresDatabase,
  } = {},
) {
  void repositoryRoot;
  assertExactCredential(connectionString);
  if (typeof databaseFactory !== "function") {
    throw new UlcExerciseCatalogCutoverReadinessError(
      "E6G-C3C database factory is unavailable.",
    );
  }

  let database;
  try {
    database = databaseFactory(connectionString);
  } catch {
    throw new UlcExerciseCatalogCutoverReadinessError(
      "E6G-C3C preview PostgreSQL connection could not be created.",
    );
  }

  let primaryError;
  try {
    return await database.client.begin(async (transaction) => {
      await transaction.unsafe(
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY",
      );

      const identity = await transaction.unsafe(
        "SELECT current_database()::text AS database_name, " +
          "current_user::text AS principal_name",
      );
      if (
        !Array.isArray(identity) ||
        identity.length !== 1 ||
        identity[0]?.database_name !== EXPECTED_DATABASE ||
        identity[0]?.principal_name !== EXPECTED_PRINCIPAL
      ) {
        throw new UlcExerciseCatalogCutoverReadinessError(
          "E6G-C3C connected PostgreSQL identity does not match the approved preview target.",
        );
      }

      const relations = await transaction.unsafe(
        "SELECT to_regclass('public.ulc_linz_exercise_catalog_item')::text AS source_item, " +
          "to_regclass('public.ulc_linz_exercise_parameter')::text AS source_parameter, " +
          "to_regclass('public.ulc_linz_exercise_group')::text AS source_audience, " +
          "to_regclass('public.ulc_linz_exercise_favorite')::text AS source_favorite, " +
          "to_regclass('public.appbasis_exercise_catalog_item')::text AS target_item, " +
          "to_regclass('public.appbasis_exercise_catalog_parameter')::text AS target_parameter, " +
          "to_regclass('public.appbasis_exercise_catalog_audience')::text AS target_audience, " +
          "to_regclass('public.appbasis_exercise_catalog_favorite')::text AS target_favorite",
      );
      const relation = relations[0];
      if (
        relation === undefined ||
        Object.values(relation).some((value) => value === null)
      ) {
        throw new UlcExerciseCatalogCutoverReadinessError(
          "E6G-C3C requires all four source and all four target relations.",
        );
      }

      const tableChecks = await Promise.all([
        compareMappedTable(transaction, {
          source: "ulc_linz_exercise_catalog_item",
          target: "appbasis_exercise_catalog_item",
          sourceProjection:
            "id, organization_id, name, category_key, subcategory, goal, " +
            "description, coaching_cues, common_mistakes, equipment, video_url, " +
            "is_active, created_at, updated_at",
          targetProjection:
            "id, organization_id, name, category_key, subcategory, goal, " +
            "description, coaching_cues, common_mistakes, equipment, video_url, " +
            "is_active, created_at, updated_at",
        }),
        compareMappedTable(transaction, {
          source: "ulc_linz_exercise_parameter",
          target: "appbasis_exercise_catalog_parameter",
          sourceProjection:
            "organization_id, exercise_id, parameter_key, label, unit, " +
            "input_type, default_value, min_value, max_value, step_value, " +
            "is_required, sort_order, created_at, updated_at",
          targetProjection:
            "organization_id, exercise_id, parameter_key, label, unit, " +
            "input_type, default_value, min_value, max_value, step_value, " +
            "is_required, sort_order, created_at, updated_at",
        }),
        compareMappedTable(transaction, {
          source: "ulc_linz_exercise_group",
          target: "appbasis_exercise_catalog_audience",
          sourceProjection:
            "organization_id, exercise_id, group_id AS audience_id, created_at",
          targetProjection:
            "organization_id, exercise_id, audience_id, created_at",
        }),
        compareMappedTable(transaction, {
          source: "ulc_linz_exercise_favorite",
          target: "appbasis_exercise_catalog_favorite",
          sourceProjection:
            "organization_id, identity_id AS principal_id, exercise_id, created_at",
          targetProjection:
            "organization_id, principal_id, exercise_id, created_at",
        }),
      ]);

      if (tableChecks.some((entry) => entry.mismatchCount !== 0)) {
        throw new UlcExerciseCatalogCutoverReadinessError(
          "E6G-C3C Source and target are not exactly equal.",
        );
      }

      return deepFreeze({
        schemaVersion: 1,
        operation: "ulc-exercise-catalog-runtime-cutover-readiness",
        state: "ready-for-runtime-cutover",
        application: "ulc-linz",
        moduleId: "exercise-catalog",
        preview: {
          environment: EXPECTED_ENVIRONMENT,
          database: EXPECTED_DATABASE,
          migrationPrincipal: EXPECTED_PRINCIPAL,
        },
        transaction: {
          isolation: "repeatable-read",
          readOnly: true,
        },
        tables: tableChecks,
        equality: {
          exact: true,
          totalMismatchCount: 0,
        },
        sourceWriteQuiescence: {
          requiredExternally: true,
          verifiedByRuntimeMode: false,
        },
        runtimeCutover: {
          eligibleAfterVerifiedQuiescence: true,
          performed: false,
        },
        writes: [],
      });
    });
  } catch (error) {
    primaryError = error;
    if (error instanceof UlcExerciseCatalogCutoverReadinessError) throw error;
    throw new UlcExerciseCatalogCutoverReadinessError(
      "E6G-C3C read-only equality inspection failed.",
    );
  } finally {
    try {
      await database.client.end();
    } catch {
      if (primaryError === undefined) {
        throw new UlcExerciseCatalogCutoverReadinessError(
          "E6G-C3C preview PostgreSQL connection could not be closed cleanly.",
        );
      }
    }
  }
}

export function renderUlcExerciseCatalogCutoverReadiness(result) {
  return JSON.stringify(result, null, 2) + "\n";
}

function assertExactCredential(connectionString) {
  let origin;
  try {
    origin = parseGeneratedPreviewDatabaseUrl(
      connectionString,
      ULC_LINZ_D4_PREVIEW_APPLICATION_HYPERDRIVE,
    );
  } catch {
    throw new UlcExerciseCatalogCutoverReadinessError(
      "E6G-C3C requires the dedicated ULC preview migration credential.",
    );
  }
  if (
    origin.database !== EXPECTED_DATABASE ||
    origin.user !== EXPECTED_PRINCIPAL
  ) {
    throw new UlcExerciseCatalogCutoverReadinessError(
      "E6G-C3C requires the exact ULC preview migration database and principal.",
    );
  }
}

async function compareMappedTable(
  sql,
  { source, target, sourceProjection, targetProjection },
) {
  const rows = await sql.unsafe(
    "SELECT " +
      "(SELECT count(*)::int FROM public." + source + ") AS source_count, " +
      "(SELECT count(*)::int FROM public." + target + ") AS target_count, " +
      "(SELECT count(*)::int FROM (" +
      "(SELECT " + sourceProjection + " FROM public." + source +
      " EXCEPT ALL SELECT " + targetProjection + " FROM public." + target + ") " +
      "UNION ALL " +
      "(SELECT " + targetProjection + " FROM public." + target +
      " EXCEPT ALL SELECT " + sourceProjection + " FROM public." + source + ")" +
      ") AS mismatch) AS mismatch_count",
  );
  const row = rows[0];
  if (
    row === undefined ||
    typeof row.source_count !== "number" ||
    typeof row.target_count !== "number" ||
    typeof row.mismatch_count !== "number"
  ) {
    throw new UlcExerciseCatalogCutoverReadinessError(
      "E6G-C3C equality query returned an invalid result.",
    );
  }
  return deepFreeze({
    sourceTable: source,
    targetTable: target,
    sourceCount: row.source_count,
    targetCount: row.target_count,
    mismatchCount: row.mismatch_count,
  });
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}

function isMainModule() {
  if (typeof process.argv[1] !== "string") return false;
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMainModule()) {
  try {
    const result = await inspectUlcExerciseCatalogCutoverReadiness({
      connectionString: process.env.APPBASIS_MIGRATION_DATABASE_URL,
    });
    process.stdout.write(
      renderUlcExerciseCatalogCutoverReadiness(result),
    );
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "ULC E6G-C3C cutover readiness failed.",
    );
    process.exitCode = 1;
  }
}
