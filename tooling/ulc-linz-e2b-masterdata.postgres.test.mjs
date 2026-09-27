import assert from "node:assert/strict";
import {
  cp,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";

import { applyModuleUpdate } from "./apply-module-update.mjs";
import {
  applyRepositoryMigrationPlan,
  loadRepositoryMigrationPlan,
} from "./database-migration-executor.mjs";
import {
  applyModuleUpdateMigrations,
  ModuleUpdateMigrationExecutionError,
} from "./module-update-migration-executor.mjs";
import {
  planModuleUpdate,
  readPnpmImporterDependency,
} from "./module-update-plan.mjs";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error("DATABASE_URL is required for ULC-E2B PostgreSQL E2E tests.");
}

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const databaseName = "appbasis_ulc_e2b_masterdata";
const targetUrl = new URL(databaseUrl);
targetUrl.pathname = `/${databaseName}`;
const expectedPrincipal = decodeURIComponent(new URL(databaseUrl).username);

test("ULC-E2B publishes and migrates Stammdaten from the real ULC baseline", async (t) => {
  const root = await createUlcBaselineFixture(t);
  const admin = createPostgresDatabase(databaseUrl);

  try {
    await resetUlcBaseline(admin, root);

    const beforePlan = await snapshotPublicationState(root);
    const plan = await planModuleUpdate(
      {
        appId: "ulc-linz",
        moduleId: "athletes",
      },
      { repositoryRoot: root },
    );

    assert.equal(plan.state, "install");
    assert.deepEqual(plan.writes, [
      "apps/ulc-linz/appbasis.app.json",
      "apps/ulc-linz/package.json",
      "apps/ulc-linz/appbasis.database.json",
      "pnpm-lock.yaml",
    ]);
    assert.deepEqual(plan.changes.appDefinition?.beforeModules, ["countdown"]);
    assert.deepEqual(plan.changes.appDefinition?.afterModules, [
      "countdown",
      "athletes",
    ]);
    assert.deepEqual(
      plan.changes.databaseMigrationDelta?.beforeOwnerIds,
      ["identity", "permissions", "ulc-linz-lifecycle"],
    );
    assert.deepEqual(
      plan.changes.databaseMigrationDelta?.afterOwnerIds,
      ["identity", "permissions", "athletes", "ulc-linz-lifecycle"],
    );
    assert.deepEqual(plan.changes.databaseMigrationDelta?.addedOwner, {
      id: "athletes",
      root: "modules/athletes",
      schemaVersion: 2,
      migrations: [
        "modules/athletes/migrations/0000_appbasis_athletes_foundation.sql",
        "modules/athletes/migrations/0001_appbasis_athletes_deletion_markers.sql",
      ],
    });
    assert.deepEqual(await snapshotPublicationState(root), beforePlan);

    const targetLockfile = await readFile(
      join(repositoryRoot, "pnpm-lock.yaml"),
      "utf8",
    );
    const update = await applyModuleUpdate(
      {
        appId: "ulc-linz",
        moduleId: "athletes",
      },
      {
        repositoryRoot: root,
        testingHooks: {
          workspaceFinalizer: async ({ lockfilePath }) => {
            await writeFile(lockfilePath, targetLockfile);
          },
        },
      },
    );
    assert.equal(update.state, "installed");

    await assertPublishedStateMatchesRepository(root);

    const migration = await applyModuleUpdateMigrations(
      {
        appId: "ulc-linz",
        moduleId: "athletes",
        connectionString: targetUrl.toString(),
        expectedDatabase: databaseName,
        expectedPrincipal,
      },
      { repositoryRoot: root },
    );

    assert.equal(migration.state, "applied");
    assert.equal(migration.application, "ulc-linz");
    assert.equal(migration.moduleId, "athletes");
    assert.equal(migration.repositoryState, "published-target");
    assert.equal(migration.migrationCount, 2);
    assert.ok(migration.statementCount > 0);
    assert.ok(migration.baselineMarkerCount > 0);
    assert.ok(migration.targetMarkerCount > 0);

    const verification = createPostgresDatabase(targetUrl.toString());
    try {
      const tables = await verification.client`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN (
            'appbasis_training_group',
            'appbasis_athlete',
            'appbasis_trainer',
            'appbasis_athlete_group_membership',
            'appbasis_trainer_group_membership',
            'appbasis_athletes_deletion'
          )
        ORDER BY table_name
      `;
      assert.deepEqual(
        tables.map((row) => row.table_name),
        [
          "appbasis_athlete",
          "appbasis_athlete_group_membership",
          "appbasis_athletes_deletion",
          "appbasis_trainer",
          "appbasis_trainer_group_membership",
          "appbasis_training_group",
        ],
      );

      const person = await verification.client`
        SELECT display_name
        FROM appbasis_person
        WHERE id = 'ulc-e2b-existing-person'
      `;
      assert.deepEqual(
        person.map((row) => row.display_name),
        ["Existing ULC Person"],
      );

      const membership = await verification.client`
        SELECT organization_id, source_role, active
        FROM ulc_linz_membership
        WHERE identity_id = 'ulc-e2b-existing-person'
      `;
      assert.deepEqual(
        membership.map((row) => ({
          organization_id: row.organization_id,
          source_role: row.source_role,
          active: row.active,
        })),
        [
          {
            organization_id: "ulc-linz",
            source_role: "trainer",
            active: true,
          },
        ],
      );

      await verification.client`
        INSERT INTO appbasis_training_group (
          id, organization_id, name, short_name
        ) VALUES (
          'group-u14', 'ulc-linz', 'U14', 'U14'
        )
      `;
      await verification.client`
        INSERT INTO appbasis_athlete (
          id, organization_id, first_name, last_name, birth_year
        ) VALUES (
          'athlete-1', 'ulc-linz', 'Emilia', 'Muster', 2017
        )
      `;
      await verification.client`
        INSERT INTO appbasis_athlete_group_membership (
          organization_id, athlete_id, group_id, started_on
        ) VALUES (
          'ulc-linz', 'athlete-1', 'group-u14', DATE '2026-09-01'
        )
      `;
      await verification.client`
        INSERT INTO appbasis_trainer (
          id, organization_id, first_name, last_name
        ) VALUES (
          'trainer-1', 'ulc-linz', 'Max', 'Trainer'
        )
      `;
      await verification.client`
        INSERT INTO appbasis_trainer_group_membership (
          organization_id, trainer_id, group_id
        ) VALUES (
          'ulc-linz', 'trainer-1', 'group-u14'
        )
      `;

      const masterdata = await verification.client`
        SELECT
          (SELECT count(*)::int FROM appbasis_training_group) AS groups,
          (SELECT count(*)::int FROM appbasis_athlete) AS athletes,
          (SELECT count(*)::int FROM appbasis_trainer) AS trainers,
          (SELECT count(*)::int FROM appbasis_athlete_group_membership) AS athlete_memberships,
          (SELECT count(*)::int FROM appbasis_trainer_group_membership) AS trainer_memberships
      `;
      assert.deepEqual(
        masterdata.map((row) => ({
          groups: row.groups,
          athletes: row.athletes,
          trainers: row.trainers,
          athlete_memberships: row.athlete_memberships,
          trainer_memberships: row.trainer_memberships,
        })),
        [
          {
            groups: 1,
            athletes: 1,
            trainers: 1,
            athlete_memberships: 1,
            trainer_memberships: 1,
          },
        ],
      );
    } finally {
      await verification.client.end();
    }

    const beforeNoop = await snapshotPublicationState(root);
    const noop = await applyModuleUpdate(
      {
        appId: "ulc-linz",
        moduleId: "athletes",
      },
      {
        repositoryRoot: root,
        testingHooks: {
          workspaceFinalizer: async () => {
            throw new Error("workspace finalizer must not run for ULC-E2B no-op");
          },
        },
      },
    );
    assert.equal(noop.state, "already-installed");
    assert.deepEqual(await snapshotPublicationState(root), beforeNoop);

    await assert.rejects(
      applyModuleUpdateMigrations(
        {
          appId: "ulc-linz",
          moduleId: "athletes",
          connectionString: targetUrl.toString(),
          expectedDatabase: databaseName,
          expectedPrincipal,
        },
        { repositoryRoot: root },
      ),
      (error) =>
        error instanceof ModuleUpdateMigrationExecutionError &&
        /already or partially applied/.test(error.message),
    );
  } finally {
    await admin.client.unsafe(
      `DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`,
    );
    await admin.client.end();
  }
});

async function assertPublishedStateMatchesRepository(root) {
  for (const relativePath of [
    "apps/ulc-linz/appbasis.app.json",
    "apps/ulc-linz/package.json",
    "apps/ulc-linz/appbasis.database.json",
  ]) {
    assert.equal(
      await readFile(join(root, relativePath), "utf8"),
      await readFile(join(repositoryRoot, relativePath), "utf8"),
      `${relativePath} must equal the canonical updater target.`,
    );
  }

  const generatedLockfile = await readFile(join(root, "pnpm-lock.yaml"), "utf8");
  const repositoryLockfile = await readFile(
    join(repositoryRoot, "pnpm-lock.yaml"),
    "utf8",
  );
  assert.deepEqual(
    readPnpmImporterDependency(
      generatedLockfile,
      "apps/ulc-linz",
      "@appbasis/athletes",
    ),
    readPnpmImporterDependency(
      repositoryLockfile,
      "apps/ulc-linz",
      "@appbasis/athletes",
    ),
  );
}

async function snapshotPublicationState(root) {
  return Object.fromEntries(
    await Promise.all(
      [
        "apps/ulc-linz/appbasis.app.json",
        "apps/ulc-linz/package.json",
        "apps/ulc-linz/appbasis.database.json",
        "pnpm-lock.yaml",
      ].map(async (relativePath) => [
        relativePath,
        await readFile(join(root, relativePath), "utf8"),
      ]),
    ),
  );
}

async function resetUlcBaseline(admin, root) {
  await admin.client.unsafe(
    `DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`,
  );
  await admin.client.unsafe(`CREATE DATABASE ${databaseName}`);

  const baselinePlan = await loadRepositoryMigrationPlan({
    repositoryRoot: root,
    manifestPath: join(root, "apps", "ulc-linz", "appbasis.database.json"),
    expectedApplication: "ulc-linz",
    expectedOwners: {
      identity: "packages/identity",
      permissions: "packages/permissions",
      "ulc-linz-lifecycle": "apps/ulc-linz",
    },
  });
  await applyRepositoryMigrationPlan({
    connectionString: targetUrl.toString(),
    expectedDatabase: databaseName,
    plan: baselinePlan,
    createDatabase: createPostgresDatabase,
  });

  const seed = createPostgresDatabase(targetUrl.toString());
  try {
    await seed.client`
      INSERT INTO appbasis_person (id, display_name)
      VALUES ('ulc-e2b-existing-person', 'Existing ULC Person')
    `;
    await seed.client`
      INSERT INTO ulc_linz_membership (
        identity_id,
        organization_id,
        subject_id,
        source_role,
        active
      ) VALUES (
        'ulc-e2b-existing-person',
        'ulc-linz',
        'ulc-e2b-subject',
        'trainer',
        true
      )
    `;
  } finally {
    await seed.client.end();
  }
}

async function createUlcBaselineFixture(t) {
  const root = await mkdtemp(join(tmpdir(), "appbasis-ulc-e2b-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  await mkdir(join(root, "apps", "ulc-linz"), { recursive: true });
  await mkdir(join(root, "packages", "identity"), { recursive: true });
  await mkdir(join(root, "packages", "permissions"), { recursive: true });
  await mkdir(join(root, "modules"), { recursive: true });

  await cp(
    join(repositoryRoot, "apps", "ulc-linz", "migrations"),
    join(root, "apps", "ulc-linz", "migrations"),
    { recursive: true },
  );
  await cp(
    join(
      repositoryRoot,
      "apps",
      "ulc-linz",
      "appbasis.database-baseline-catalog-exceptions.json",
    ),
    join(
      root,
      "apps",
      "ulc-linz",
      "appbasis.database-baseline-catalog-exceptions.json",
    ),
  );
  await cp(
    join(repositoryRoot, "packages", "identity", "drizzle"),
    join(root, "packages", "identity", "drizzle"),
    { recursive: true },
  );
  await cp(
    join(repositoryRoot, "packages", "permissions", "migrations"),
    join(root, "packages", "permissions", "migrations"),
    { recursive: true },
  );
  await cp(
    join(repositoryRoot, "modules", "athletes"),
    join(root, "modules", "athletes"),
    { recursive: true },
  );
  await cp(
    join(repositoryRoot, "modules", "countdown"),
    join(root, "modules", "countdown"),
    { recursive: true },
  );

  const publishedDefinition = JSON.parse(
    await readFile(
      join(repositoryRoot, "apps", "ulc-linz", "appbasis.app.json"),
      "utf8",
    ),
  );
  assert.deepEqual(publishedDefinition.modules, ["countdown", "athletes"]);
  await writeFile(
    join(root, "apps", "ulc-linz", "appbasis.app.json"),
    `${JSON.stringify(
      {
        ...publishedDefinition,
        modules: publishedDefinition.modules.filter(
          (moduleId) => moduleId !== "athletes",
        ),
      },
      null,
      2,
    )}\n`,
  );

  const publishedPackage = JSON.parse(
    await readFile(
      join(repositoryRoot, "apps", "ulc-linz", "package.json"),
      "utf8",
    ),
  );
  assert.equal(
    publishedPackage.dependencies?.["@appbasis/athletes"],
    "workspace:*",
  );
  const baselineDependencies = { ...publishedPackage.dependencies };
  delete baselineDependencies["@appbasis/athletes"];
  await writeFile(
    join(root, "apps", "ulc-linz", "package.json"),
    `${JSON.stringify(
      {
        ...publishedPackage,
        dependencies: baselineDependencies,
      },
      null,
      2,
    )}\n`,
  );

  const publishedDatabaseManifest = JSON.parse(
    await readFile(
      join(repositoryRoot, "apps", "ulc-linz", "appbasis.database.json"),
      "utf8",
    ),
  );
  assert.deepEqual(
    publishedDatabaseManifest.owners.map((owner) => owner.id),
    ["identity", "permissions", "athletes", "ulc-linz-lifecycle"],
  );
  await writeFile(
    join(root, "apps", "ulc-linz", "appbasis.database.json"),
    `${JSON.stringify(
      {
        ...publishedDatabaseManifest,
        owners: publishedDatabaseManifest.owners.filter(
          (owner) => owner.id !== "athletes",
        ),
      },
      null,
      2,
    )}\n`,
  );

  const publishedLockfile = await readFile(
    join(repositoryRoot, "pnpm-lock.yaml"),
    "utf8",
  );
  await writeFile(
    join(root, "pnpm-lock.yaml"),
    withoutUlcAthletesImporterDependency(publishedLockfile),
  );

  return root;
}

function withoutUlcAthletesImporterDependency(lockfile) {
  const block = `      '@appbasis/athletes':
        specifier: workspace:*
        version: link:../../modules/athletes
`;
  const first = lockfile.indexOf(block);
  if (first < 0) {
    throw new Error("Published ULC lockfile is missing @appbasis/athletes.");
  }
  const second = lockfile.indexOf(block, first + block.length);
  if (second >= 0) {
    throw new Error(
      "Published lockfile contains an ambiguous @appbasis/athletes block.",
    );
  }
  return lockfile.slice(0, first) + lockfile.slice(first + block.length);
}
