import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import { validatePostgresConnectionString } from "./database-migration-executor.mjs";
import { parseGeneratedPreviewDatabaseUrl } from "./generated-preview-hyperdrive.mjs";
import {
  ULC_LINZ_D4_PREVIEW_APPLICATION_HYPERDRIVE,
} from "./ulc-linz-d4-preview-hyperdrive.mjs";

export const ULC_LINZ_PREVIEW_CANONICAL_ATTENDANCE_GROUP =
  "Preview Selbstanmeldung";
const EXPECTED_DATABASE =
  ULC_LINZ_D4_PREVIEW_APPLICATION_HYPERDRIVE.database;
const EXPECTED_ORGANIZATION = "ulc-linz-preview";

export class UlcLinzPreviewGroupCleanupError extends Error {
  constructor(message) {
    super(message);
    this.name = "UlcLinzPreviewGroupCleanupError";
  }
}

export async function cleanupUlcLinzPreviewGroups(
  { connectionString } = {},
  { databaseFactory = createPostgresDatabase } = {},
) {
  if (typeof databaseFactory !== "function") {
    throw new UlcLinzPreviewGroupCleanupError(
      "Preview group cleanup database factory is unavailable.",
    );
  }

  let origin;
  try {
    origin = parseGeneratedPreviewDatabaseUrl(
      connectionString,
      ULC_LINZ_D4_PREVIEW_APPLICATION_HYPERDRIVE,
    );
  } catch {
    throw new UlcLinzPreviewGroupCleanupError(
      "Preview group cleanup requires the dedicated ULC preview application credential.",
    );
  }

  const normalizedConnectionString = validatePostgresConnectionString(
    connectionString,
    {
      expectedDatabase: EXPECTED_DATABASE,
      ConfigurationError: UlcLinzPreviewGroupCleanupError,
    },
  );

  let database;
  try {
    database = databaseFactory(normalizedConnectionString);
  } catch {
    throw new UlcLinzPreviewGroupCleanupError(
      "Preview group cleanup database connection could not be created.",
    );
  }

  let primaryError;
  try {
    let deactivated = [];
    let athletesArchived = [];
    let exercisesArchived = [];
    let blocksArchived = [];
    await database.client.begin(async (transaction) => {
      const identity = await transaction.unsafe(
        "SELECT current_database() AS database_name, current_user AS principal_name",
      );
      if (
        !Array.isArray(identity) ||
        identity.length !== 1 ||
        identity[0]?.database_name !== EXPECTED_DATABASE ||
        identity[0]?.principal_name !== origin.user
      ) {
        throw new UlcLinzPreviewGroupCleanupError(
          "Preview group cleanup database identity does not match the validated credential.",
        );
      }

      await transaction.unsafe(
        "SELECT pg_advisory_xact_lock(hashtextextended('ulc-linz:preview-group-cleanup', 0))",
      );

      const rows = await transaction.unsafe(
        `UPDATE appbasis_training_group
         SET is_active = false,
             updated_at = now()
         WHERE organization_id = $1
           AND is_active = true
           AND (
             lower(btrim(name)) LIKE 'preview%'
             OR lower(btrim(name)) LIKE 'e7b9 preview group %'
           )
           AND name <> $2
         RETURNING id, name`,
        [EXPECTED_ORGANIZATION, ULC_LINZ_PREVIEW_CANONICAL_ATTENDANCE_GROUP],
      );
      deactivated = Array.isArray(rows)
        ? rows
            .filter(
              (row) =>
                typeof row?.id === "string" &&
                typeof row?.name === "string",
            )
            .map((row) => ({ id: row.id, name: row.name }))
        : [];
      // Historical acceptance created unique records on every run. Archive only
      // records in the isolated preview tenant; preserve Preview Athlet,
      // the stable principal behind preview.athlete.
      const athleteRows = await transaction.unsafe(
        `UPDATE appbasis_athlete
         SET is_active = false, updated_at = now()
         WHERE organization_id = $1 AND is_active = true
           AND (
             lower(btrim(first_name)) LIKE 'preview%'
             OR lower(btrim(last_name)) LIKE 'preview%'
             OR (lower(first_name) = 'e7b9' AND lower(last_name) LIKE 'preview-%')
           )
           AND NOT ((lower(first_name) = 'preview' AND lower(last_name) = 'athlet')
                    OR (lower(first_name) = 'athlet' AND lower(last_name) = 'preview'))
         RETURNING id, first_name, last_name`,
        [EXPECTED_ORGANIZATION],
      );
      athletesArchived = athleteRows.map((row) => ({
        id: row.id, name: row.first_name + " " + row.last_name,
      }));
      await transaction.unsafe(
        `UPDATE appbasis_athlete_group_membership
         SET ended_on = COALESCE(ended_on, GREATEST(CURRENT_DATE, started_on)),
             updated_at = now()
         WHERE organization_id = $1 AND ended_on IS NULL
           AND athlete_id = ANY($2::text[])`,
        [EXPECTED_ORGANIZATION, athletesArchived.map((row) => row.id)],
      );
      const exerciseRows = await transaction.unsafe(
        `UPDATE appbasis_exercise_catalog_item
         SET is_active = false, updated_at = now()
         WHERE organization_id = $1 AND is_active = true
           AND (
             lower(btrim(name)) LIKE 'preview%'
             OR lower(btrim(name)) LIKE 'e7b9 preview exercise %'
           )
         RETURNING id, name`,
        [EXPECTED_ORGANIZATION],
      );
      exercisesArchived = exerciseRows.map((row) => ({ id: row.id, name: row.name }));
      const blockRows = await transaction.unsafe(
        `UPDATE appbasis_training_block AS block
         SET is_active = false, updated_at = now()
         WHERE block.organization_id = $1 AND block.is_active = true
           AND EXISTS (
             SELECT 1 FROM appbasis_training_block_revision AS revision
             WHERE revision.organization_id = block.organization_id
               AND revision.block_id = block.id
               AND revision.revision = block.current_revision
               AND (
                 lower(btrim(revision.name)) LIKE 'preview%'
                 OR lower(btrim(revision.name)) LIKE 'e7b9 preview block %'
               )
           )
         RETURNING block.id`,
        [EXPECTED_ORGANIZATION],
      );
      blocksArchived = blockRows.map((row) => row.id);
    });

    return Object.freeze({
      state: "clean",
      deactivatedCount: deactivated.length,
      archivedAthleteCount: athletesArchived.length,
      archivedExerciseCount: exercisesArchived.length,
      archivedBlockCount: blocksArchived.length,
      preservedAthlete: "preview.athlete",
      deactivated: Object.freeze(deactivated.map((item) => Object.freeze(item))),
      preservedGroup: ULC_LINZ_PREVIEW_CANONICAL_ATTENDANCE_GROUP,
    });
  } catch (error) {
    primaryError = error;
    if (error instanceof UlcLinzPreviewGroupCleanupError) throw error;
    throw new UlcLinzPreviewGroupCleanupError(
      "Preview group cleanup failed and was rolled back.",
    );
  } finally {
    try {
      await database.client.end();
    } catch {
      if (primaryError === undefined) {
        throw new UlcLinzPreviewGroupCleanupError(
          "Preview group cleanup database connection could not be closed cleanly.",
        );
      }
    }
  }
}

export function assertUlcLinzPreviewGroupCleanupEnvironment(
  environment = process.env,
) {
  if (environment.APPBASIS_GENERATED_APP_ID !== "ulc-linz") {
    throw new UlcLinzPreviewGroupCleanupError(
      "Preview group cleanup requires appId ulc-linz.",
    );
  }
  if (environment.ULC_LINZ_PREVIEW_GROUP_CLEANUP_APPLY !== "1") {
    throw new UlcLinzPreviewGroupCleanupError(
      "Preview group cleanup requires explicit approval.",
    );
  }
}

function isMainModule() {
  if (typeof process.argv[1] !== "string") return false;
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMainModule()) {
  try {
    assertUlcLinzPreviewGroupCleanupEnvironment();
    const result = await cleanupUlcLinzPreviewGroups({
      connectionString: process.env.APPBASIS_DATABASE_URL,
    });
    console.log(
      `ULC preview fixture cleanup PASS: ${result.deactivatedCount} groups, ${result.archivedAthleteCount} athletes, ${result.archivedExerciseCount} exercises, ${result.archivedBlockCount} blocks archived; ${result.preservedGroup} and ${result.preservedAthlete} preserved.`,
    );
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "ULC preview group cleanup failed.",
    );
    process.exitCode = 1;
  }
}
