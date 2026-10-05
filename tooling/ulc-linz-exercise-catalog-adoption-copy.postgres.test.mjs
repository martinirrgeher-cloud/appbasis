import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import {
  applyUlcExerciseCatalogAdoptionCopy,
  UlcExerciseCatalogAdoptionConfigurationError,
  UlcExerciseCatalogAdoptionExecutionError,
} from "./ulc-linz-exercise-catalog-adoption-copy.mjs";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error("DATABASE_URL is required for E6G-C2 PostgreSQL tests.");
}

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const expectedPrincipal = decodeURIComponent(new URL(databaseUrl).username);

test("E6G-C2 copies and verifies the complete catalog mapping without changing source rows", async () => {
  await withIsolatedDatabase("success", async ({
    client,
    connectionString,
    databaseName,
  }) => {
    await seedCanonicalSource(client);
    const sourceBefore = await snapshotSource(client);

    const result = await applyUlcExerciseCatalogAdoptionCopy(
      {
        connectionString,
        expectedDatabase: databaseName,
        expectedPrincipal,
        executionScope: "isolated-proof",
      },
      { repositoryRoot },
    );

    assert.equal(result.state, "copied-and-verified-isolated");
    assert.equal(result.transactionIsolation, "repeatable-read");
    assert.equal(result.sourceWriteQuiescenceApplied, false);
    assert.equal(result.finalEqualityUnderSourceWriteQuiescence, false);
    assert.equal(result.cutoverGuardSatisfied, false);
    assert.equal(result.runtimeCutoverEligible, false);
    assert.deepEqual(
      result.tables.map((entry) => [
        entry.sourceTable,
        entry.targetTable,
        entry.rowCount,
      ]),
      [
        [
          "ulc_linz_exercise_catalog_item",
          "appbasis_exercise_catalog_item",
          2,
        ],
        [
          "ulc_linz_exercise_parameter",
          "appbasis_exercise_catalog_parameter",
          2,
        ],
        [
          "ulc_linz_exercise_group",
          "appbasis_exercise_catalog_audience",
          2,
        ],
        [
          "ulc_linz_exercise_favorite",
          "appbasis_exercise_catalog_favorite",
          2,
        ],
      ],
    );

    assert.deepEqual(await snapshotSource(client), sourceBefore);

    const audiences = await client`
      SELECT organization_id, exercise_id, audience_id
      FROM appbasis_exercise_catalog_audience
      ORDER BY organization_id, exercise_id, audience_id
    `;
    assert.deepEqual(
      audiences.map((row) => ({ ...row })),
      [
        {
          organization_id: "org-a",
          exercise_id: "exercise-a",
          audience_id: "group-sprint",
        },
        {
          organization_id: "org-b",
          exercise_id: "exercise-b",
          audience_id: "group-general",
        },
      ],
    );

    const favorites = await client`
      SELECT organization_id, principal_id, exercise_id
      FROM appbasis_exercise_catalog_favorite
      ORDER BY organization_id, principal_id, exercise_id
    `;
    assert.deepEqual(
      favorites.map((row) => ({ ...row })),
      [
        {
          organization_id: "org-a",
          principal_id: "identity-a",
          exercise_id: "exercise-a",
        },
        {
          organization_id: "org-b",
          principal_id: "identity-b",
          exercise_id: "exercise-b",
        },
      ],
    );

    const timestampCheck = await client`
      SELECT
        source.created_at = target.created_at AS created_equal,
        source.updated_at = target.updated_at AS updated_equal
      FROM ulc_linz_exercise_catalog_item AS source
      INNER JOIN appbasis_exercise_catalog_item AS target
        ON target.organization_id = source.organization_id
       AND target.id = source.id
      ORDER BY source.organization_id
    `;
    assert.ok(
      timestampCheck.every(
        (row) => row.created_equal === true && row.updated_equal === true,
      ),
    );
  });
});

test("E6G-C2 rejects a non-empty target before copying source rows", async () => {
  await withIsolatedDatabase("target_nonempty", async ({
    client,
    connectionString,
    databaseName,
  }) => {
    await seedCanonicalSource(client);
    await client`
      INSERT INTO appbasis_exercise_catalog_item (
        id,
        organization_id,
        name,
        category_key
      )
      VALUES (
        'existing-target',
        'org-existing',
        'Existing target',
        'other'
      )
    `;

    await assert.rejects(
      applyUlcExerciseCatalogAdoptionCopy(
        {
          connectionString,
          expectedDatabase: databaseName,
          expectedPrincipal,
          executionScope: "isolated-proof",
        },
        { repositoryRoot },
      ),
      (error) =>
        error instanceof UlcExerciseCatalogAdoptionExecutionError &&
        /target table is not empty/.test(error.message),
    );

    const counts = await targetCounts(client);
    assert.deepEqual(counts, {
      items: 1,
      parameters: 0,
      audiences: 0,
      favorites: 0,
    });
  });
});

test("E6G-C2 rejects source exercise orphans before any target write", async () => {
  await withIsolatedDatabase("source_orphan", async ({
    client,
    connectionString,
    databaseName,
  }) => {
    await client`
      INSERT INTO ulc_linz_exercise_parameter (
        organization_id,
        exercise_id,
        parameter_key,
        label,
        input_type
      )
      VALUES (
        'org-a',
        'missing-exercise',
        'sets',
        'Sätze',
        'number'
      )
    `;

    await assert.rejects(
      applyUlcExerciseCatalogAdoptionCopy(
        {
          connectionString,
          expectedDatabase: databaseName,
          expectedPrincipal,
          executionScope: "isolated-proof",
        },
        { repositoryRoot },
      ),
      (error) =>
        error instanceof UlcExerciseCatalogAdoptionExecutionError &&
        /source contains orphaned exercise references/.test(error.message),
    );

    assert.deepEqual(await targetCounts(client), {
      items: 0,
      parameters: 0,
      audiences: 0,
      favorites: 0,
    });
  });
});

test("E6G-C2 rolls the whole copy back when mapped-content verification fails", async () => {
  await withIsolatedDatabase("verification_rollback", async ({
    client,
    connectionString,
    databaseName,
  }) => {
    await seedCanonicalSource(client);
    const sourceBefore = await snapshotSource(client);

    await client.unsafe(`
      CREATE FUNCTION e6g_c2_mutate_target_item()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        NEW.name := NEW.name || ' drift';
        RETURN NEW;
      END;
      $$
    `);
    await client.unsafe(`
      CREATE TRIGGER e6g_c2_mutate_target_item
      BEFORE INSERT ON appbasis_exercise_catalog_item
      FOR EACH ROW
      EXECUTE FUNCTION e6g_c2_mutate_target_item()
    `);

    await assert.rejects(
      applyUlcExerciseCatalogAdoptionCopy(
        {
          connectionString,
          expectedDatabase: databaseName,
          expectedPrincipal,
          executionScope: "isolated-proof",
        },
        { repositoryRoot },
      ),
      (error) =>
        error instanceof UlcExerciseCatalogAdoptionExecutionError &&
        /mapped content mismatch/.test(error.message),
    );

    assert.deepEqual(await targetCounts(client), {
      items: 0,
      parameters: 0,
      audiences: 0,
      favorites: 0,
    });
    assert.deepEqual(await snapshotSource(client), sourceBefore);
  });
});

test("E6G-C2 keeps one repeatable-read source snapshot but never claims cutover freshness", async () => {
  await withIsolatedDatabase("snapshot_race", async ({
    client,
    connectionString,
    databaseName,
  }) => {
    await seedCanonicalSource(client);
    const writer = createPostgresDatabase(connectionString);
    try {
      const result = await applyUlcExerciseCatalogAdoptionCopy(
        {
          connectionString,
          expectedDatabase: databaseName,
          expectedPrincipal,
          executionScope: "isolated-proof",
        },
        {
          repositoryRoot,
          testingHooks: {
            afterSourceSnapshot: async () => {
              await writer.client`
                INSERT INTO ulc_linz_exercise_catalog_item (
                  id,
                  organization_id,
                  name,
                  category_key,
                  created_at,
                  updated_at
                )
                VALUES (
                  'exercise-late',
                  'org-a',
                  'Late source write',
                  'other',
                  TIMESTAMPTZ '2026-10-05 10:00:00+00',
                  TIMESTAMPTZ '2026-10-05 10:00:00+00'
                )
              `;
            },
          },
        },
      );

      const sourceCount = await client`
        SELECT count(*)::int AS count
        FROM ulc_linz_exercise_catalog_item
      `;
      const targetCount = await client`
        SELECT count(*)::int AS count
        FROM appbasis_exercise_catalog_item
      `;
      assert.equal(sourceCount[0]?.count, 3);
      assert.equal(targetCount[0]?.count, 2);
      assert.equal(result.tables[0]?.rowCount, 2);
      assert.equal(result.cutoverGuardSatisfied, false);
      assert.equal(result.runtimeCutoverEligible, false);
    } finally {
      await writer.client.end();
    }
  });
});

test("E6G-C2 sees a target row committed after transaction start but before the target lock", async () => {
  await withIsolatedDatabase("target_lock_race", async ({
    client,
    connectionString,
    databaseName,
  }) => {
    await seedCanonicalSource(client);
    const writer = createPostgresDatabase(connectionString);
    try {
      await assert.rejects(
        applyUlcExerciseCatalogAdoptionCopy(
          {
            connectionString,
            expectedDatabase: databaseName,
            expectedPrincipal,
            executionScope: "isolated-proof",
          },
          {
            repositoryRoot,
            testingHooks: {
              beforeTargetLock: async () => {
                await writer.client`
                  INSERT INTO appbasis_exercise_catalog_item (
                    id,
                    organization_id,
                    name,
                    category_key
                  )
                  VALUES (
                    'late-target',
                    'org-late',
                    'Late target row',
                    'other'
                  )
                `;
              },
            },
          },
        ),
        (error) =>
          error instanceof UlcExerciseCatalogAdoptionExecutionError &&
          /target table is not empty/.test(error.message),
      );
    } finally {
      await writer.client.end();
    }

    assert.deepEqual(await targetCounts(client), {
      items: 1,
      parameters: 0,
      audiences: 0,
      favorites: 0,
    });
  });
});

test("E6G-C2 refuses a production-like database name even with isolated-proof scope", async () => {
  await assert.rejects(
    applyUlcExerciseCatalogAdoptionCopy({
      connectionString:
        "postgres://postgres:postgres@localhost:5432/appbasis_ulc_linz_preview",
      expectedDatabase: "appbasis_ulc_linz_preview",
      expectedPrincipal: "postgres",
      executionScope: "isolated-proof",
    }),
    (error) =>
      error instanceof UlcExerciseCatalogAdoptionConfigurationError &&
      /dedicated appbasis_e6g_c2_\* isolated database/.test(error.message),
  );
});

test("E6G-C2 refuses any execution scope other than isolated-proof before connecting", async () => {
  await assert.rejects(
    applyUlcExerciseCatalogAdoptionCopy({
      executionScope: "preview",
    }),
    (error) =>
      error instanceof UlcExerciseCatalogAdoptionConfigurationError &&
      /only permits the isolated-proof execution scope/.test(error.message),
  );
});

async function withIsolatedDatabase(suffix, callback) {
  const admin = createPostgresDatabase(databaseUrl);
  const databaseName = "appbasis_e6g_c2_" + suffix;
  const targetUrl = new URL(databaseUrl);
  targetUrl.pathname = "/" + databaseName;

  try {
    await admin.client.unsafe(
      "DROP DATABASE IF EXISTS " +
        quotedDatabase(databaseName) +
        " WITH (FORCE)",
    );
    await admin.client.unsafe(
      "CREATE DATABASE " + quotedDatabase(databaseName),
    );

    const target = createPostgresDatabase(targetUrl.toString());
    try {
      await installSchemas(target.client);
      await callback({
        client: target.client,
        connectionString: targetUrl.toString(),
        databaseName,
      });
    } finally {
      await target.client.end();
    }
  } finally {
    await admin.client.unsafe(
      "DROP DATABASE IF EXISTS " +
        quotedDatabase(databaseName) +
        " WITH (FORCE)",
    );
    await admin.client.end();
  }
}

async function installSchemas(client) {
  for (const relativePath of [
    "apps/ulc-linz/migrations/0007_ulc_linz_exercise_catalog.sql",
    "modules/exercise-catalog/migrations/0000_appbasis_exercise_catalog_foundation.sql",
    "modules/exercise-catalog/migrations/0001_appbasis_exercise_catalog_tenant_identity.sql",
  ]) {
    const sql = await readFile(join(repositoryRoot, relativePath), "utf8");
    for (const statement of migrationStatements(sql)) {
      await client.unsafe(statement);
    }
  }
}

function migrationStatements(sql) {
  return sql
    .split(/\n--> statement-breakpoint\s*\n/g)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

async function seedCanonicalSource(client) {
  await client`
    INSERT INTO ulc_linz_exercise_catalog_item (
      id,
      organization_id,
      name,
      category_key,
      subcategory,
      goal,
      description,
      coaching_cues,
      common_mistakes,
      equipment,
      video_url,
      is_active,
      created_at,
      updated_at
    )
    VALUES (
      'exercise-a',
      'org-a',
      'Acceleration drill',
      'acceleration',
      'Starts',
      'Explosive acceleration',
      'Drive out strongly',
      'Low heel recovery',
      'Standing up too early',
      ${["cones", "sled"]},
      'https://example.test/a',
      true,
      TIMESTAMPTZ '2026-10-01 08:00:00+00',
      TIMESTAMPTZ '2026-10-02 09:00:00+00'
    )
  `;
  await client`
    INSERT INTO ulc_linz_exercise_catalog_item (
      id,
      organization_id,
      name,
      category_key,
      equipment,
      is_active,
      created_at,
      updated_at
    )
    VALUES (
      'exercise-b',
      'org-b',
      'Mobility flow',
      'regeneration',
      ${["mat"]},
      false,
      TIMESTAMPTZ '2026-10-03 10:00:00+00',
      TIMESTAMPTZ '2026-10-04 11:00:00+00'
    )
  `;

  await client`
    INSERT INTO ulc_linz_exercise_parameter (
      organization_id,
      exercise_id,
      parameter_key,
      label,
      unit,
      input_type,
      default_value,
      min_value,
      max_value,
      step_value,
      is_required,
      sort_order,
      created_at,
      updated_at
    )
    VALUES (
      'org-a',
      'exercise-a',
      'sets',
      'Sätze',
      '',
      'number',
      '3',
      1,
      10,
      1,
      true,
      10,
      TIMESTAMPTZ '2026-10-01 08:05:00+00',
      TIMESTAMPTZ '2026-10-02 09:05:00+00'
    )
  `;
  await client`
    INSERT INTO ulc_linz_exercise_parameter (
      organization_id,
      exercise_id,
      parameter_key,
      label,
      unit,
      input_type,
      default_value,
      is_required,
      sort_order,
      created_at,
      updated_at
    )
    VALUES (
      'org-b',
      'exercise-b',
      'note_text',
      'Hinweis',
      '',
      'text',
      'Locker',
      false,
      20,
      TIMESTAMPTZ '2026-10-03 10:05:00+00',
      TIMESTAMPTZ '2026-10-04 11:05:00+00'
    )
  `;

  await client`
    INSERT INTO ulc_linz_exercise_group (
      organization_id,
      exercise_id,
      group_id,
      created_at
    )
    VALUES (
      'org-a',
      'exercise-a',
      'group-sprint',
      TIMESTAMPTZ '2026-10-01 08:10:00+00'
    )
  `;
  await client`
    INSERT INTO ulc_linz_exercise_group (
      organization_id,
      exercise_id,
      group_id,
      created_at
    )
    VALUES (
      'org-b',
      'exercise-b',
      'group-general',
      TIMESTAMPTZ '2026-10-03 10:10:00+00'
    )
  `;

  await client`
    INSERT INTO ulc_linz_exercise_favorite (
      organization_id,
      identity_id,
      exercise_id,
      created_at
    )
    VALUES (
      'org-a',
      'identity-a',
      'exercise-a',
      TIMESTAMPTZ '2026-10-01 08:15:00+00'
    )
  `;
  await client`
    INSERT INTO ulc_linz_exercise_favorite (
      organization_id,
      identity_id,
      exercise_id,
      created_at
    )
    VALUES (
      'org-b',
      'identity-b',
      'exercise-b',
      TIMESTAMPTZ '2026-10-03 10:15:00+00'
    )
  `;
}

async function snapshotSource(client) {
  const tables = [
    ["ulc_linz_exercise_catalog_item", "organization_id, id"],
    [
      "ulc_linz_exercise_parameter",
      "organization_id, exercise_id, parameter_key",
    ],
    ["ulc_linz_exercise_group", "organization_id, exercise_id, group_id"],
    [
      "ulc_linz_exercise_favorite",
      "organization_id, identity_id, exercise_id",
    ],
  ];
  const snapshot = {};
  for (const [table, orderBy] of tables) {
    const rows = await client.unsafe(
      "SELECT to_jsonb(source_row) AS row " +
        "FROM (SELECT * FROM " +
        table +
        " ORDER BY " +
        orderBy +
        ") AS source_row",
    );
    snapshot[table] = rows.map((entry) => entry.row);
  }
  return snapshot;
}

async function targetCounts(client) {
  const [items, parameters, audiences, favorites] = await Promise.all([
    client`
      SELECT count(*)::int AS count
      FROM appbasis_exercise_catalog_item
    `,
    client`
      SELECT count(*)::int AS count
      FROM appbasis_exercise_catalog_parameter
    `,
    client`
      SELECT count(*)::int AS count
      FROM appbasis_exercise_catalog_audience
    `,
    client`
      SELECT count(*)::int AS count
      FROM appbasis_exercise_catalog_favorite
    `,
  ]);
  return {
    items: items[0]?.count,
    parameters: parameters[0]?.count,
    audiences: audiences[0]?.count,
    favorites: favorites[0]?.count,
  };
}

function quotedDatabase(value) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(value)) {
    throw new Error("Invalid E6G-C2 isolated database name.");
  }
  return '"' + value + '"';
}
