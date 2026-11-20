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

test("P1: ULC-E2B historical v16 baseline is preserved while current v18 blocks obsolete module installation",async(t)=>{
  const root=await createUlcBaselineFixture(t);
  const admin=createPostgresDatabase(databaseUrl);
  try {
    await resetUlcBaseline(admin,root);
    const filesBefore=await snapshotPublicationState(root);
    const isolated=createPostgresDatabase(targetUrl.toString());
    try {
      const rows=await isolated.client.unsafe(
        "SELECT (SELECT count(*)::int FROM appbasis_person) AS persons, "+
        "(SELECT count(*)::int FROM ulc_linz_membership) AS memberships, "+
        "to_regclass('public.appbasis_athlete') AS athletes_table, "+
        "to_regclass('public.ulc_linz_training_subject_deletion') AS training_marker",
      );
      assert.equal(rows.length,1);
      assert.equal(rows[0].persons,1);
      assert.equal(rows[0].memberships,1);
      assert.equal(rows[0].athletes_table,null);
      assert.equal(rows[0].training_marker,null);
    } finally {
      await isolated.client.end();
    }
    // The old add-athletes E2B route belongs to the v16 world. A current
    // generator at v18 must reject a historical v16 fixture before publication
    // or database migration, rather than bypass FK/fence prerequisites.
    await assert.rejects(
      planModuleUpdate({appId:"ulc-linz",moduleId:"athletes"},{repositoryRoot:root}),
      /database manifest has drifted from its verified app\/module ownership contract/,
    );
    assert.deepEqual(await snapshotPublicationState(root),filesBefore);
    // For the published app, the module is already installed and planning
    // it again must be a true no-op; real module upgrade E2E runs elsewhere.
    const current=await planModuleUpdate(
      {appId:"ulc-linz",moduleId:"athletes"},{repositoryRoot},
    );
    assert.equal(current.state,"already-installed");
    assert.deepEqual(current.writes,[]);
  } finally {
    await admin.client.unsafe(
      `DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`,
    );
    await admin.client.end();
  }
});

async function assertPublishedStateMatchesRepository(root) {
  const definition = JSON.parse(
    await readFile(join(root, "apps", "ulc-linz", "appbasis.app.json"), "utf8"),
  );
  assert.deepEqual(definition.modules, ["countdown", "athletes"]);

  const appPackage = JSON.parse(
    await readFile(join(root, "apps", "ulc-linz", "package.json"), "utf8"),
  );
  assert.equal(appPackage.dependencies?.["@appbasis/athletes"], "workspace:*");
  assert.equal(
    appPackage.dependencies?.["@appbasis/exercise-catalog"],
    undefined,
  );
  assert.equal(
    appPackage.dependencies?.["@appbasis/training-blocks"],
    undefined,
  );
  assert.equal(
    appPackage.dependencies?.["@appbasis/training-plans"],
    undefined,
  );

  const databaseManifest = JSON.parse(
    await readFile(
      join(root, "apps", "ulc-linz", "appbasis.database.json"),
      "utf8",
    ),
  );
  assert.deepEqual(
    databaseManifest.owners.map((owner) => owner.id),
    ["identity", "permissions", "athletes", "ulc-linz-lifecycle"],
  );

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
  assert.equal(
    readPnpmImporterDependency(
      generatedLockfile,
      "apps/ulc-linz",
      "@appbasis/exercise-catalog",
    ),
    null,
  );
  assert.equal(
    readPnpmImporterDependency(
      generatedLockfile,
      "apps/ulc-linz",
      "@appbasis/training-blocks",
    ),
    null,
  );
  assert.equal(
    readPnpmImporterDependency(
      generatedLockfile,
      "apps/ulc-linz",
      "@appbasis/training-plans",
    ),
    null,
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
  assert.deepEqual(publishedDefinition.modules, [
    "countdown",
    "athletes",
    "exercise-catalog",
    "training-blocks",
    "training-plans",
    "training-documentation",
  ]);
  await writeFile(
    join(root, "apps", "ulc-linz", "appbasis.app.json"),
    `${JSON.stringify(
      {
        ...publishedDefinition,
        modules: publishedDefinition.modules.filter(
          (moduleId) =>
            moduleId !== "athletes" &&
            moduleId !== "exercise-catalog" &&
            moduleId !== "training-blocks" &&
            moduleId !== "training-plans" &&
            moduleId !== "training-documentation",
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
  assert.equal(
    publishedPackage.dependencies?.["@appbasis/exercise-catalog"],
    "workspace:*",
  );
  assert.equal(
    publishedPackage.dependencies?.["@appbasis/training-blocks"],
    "workspace:*",
  );
  assert.equal(
    publishedPackage.dependencies?.["@appbasis/training-documentation"],
    "workspace:*",
  );
  assert.equal(
    publishedPackage.dependencies?.["@appbasis/training-plans"],
    "workspace:*",
  );
  const baselineDependencies = { ...publishedPackage.dependencies };
  delete baselineDependencies["@appbasis/athletes"];
  delete baselineDependencies["@appbasis/exercise-catalog"];
  delete baselineDependencies["@appbasis/training-blocks"];
  delete baselineDependencies["@appbasis/training-documentation"];
  delete baselineDependencies["@appbasis/training-plans"];
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
    [
      "identity",
      "permissions",
      "athletes",
      "exercise-catalog",
      "training-blocks",
      "training-documentation",
      "training-plans",
      "ulc-linz-lifecycle",
    ],
  );
  const currentLifecycle = publishedDatabaseManifest.owners.find(
    (owner) => owner.id === "ulc-linz-lifecycle",
  );
  assert.equal(currentLifecycle.schemaVersion, 18);
  assert.equal(currentLifecycle.migrations.length, 18);
  assert.deepEqual(currentLifecycle.migrations.slice(16), [
    "apps/ulc-linz/migrations/0016_ulc_linz_registration_calendar.sql",
    "apps/ulc-linz/migrations/0017_ulc_linz_training_subject_write_fence.sql",
  ]);
  await writeFile(
    join(root, "apps", "ulc-linz", "appbasis.database.json"),
    `${JSON.stringify(
      {
        ...publishedDatabaseManifest,
        // E2B is intentionally a pre-athletes (historical v16) fixture.
        // Published v18 includes the calendar and training-write-fence,
        // which require athletes tables absent from this isolated baseline.
        // Only the disposable fixture is trimmed; published v18 is unchanged.
        owners: publishedDatabaseManifest.owners.filter(
          (owner) =>
            owner.id !== "athletes" &&
            owner.id !== "exercise-catalog" &&
            owner.id !== "training-blocks" &&
            owner.id !== "training-documentation" &&
            owner.id !== "training-plans",
        ).map((owner) => owner.id === "ulc-linz-lifecycle"
          ? { ...owner, schemaVersion: 16, migrations: owner.migrations.slice(0, 16) }
          : owner),
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
    withoutUlcTrainingPlansImporterDependency(
      withoutUlcTrainingBlocksImporterDependency(
        withoutUlcExerciseCatalogImporterDependency(
          withoutUlcAthletesImporterDependency(publishedLockfile),
        ),
      ),
    ),
  );

  return root;
}

function withoutUlcExerciseCatalogImporterDependency(lockfile) {
  return withoutUlcImporterDependency(
    lockfile,
    "@appbasis/exercise-catalog",
    "link:../../modules/exercise-catalog",
  );
}

function withoutUlcTrainingBlocksImporterDependency(lockfile) {
  return withoutUlcImporterDependency(
    lockfile,
    "@appbasis/training-blocks",
    "link:../../modules/training-blocks",
  );
}

function withoutUlcTrainingPlansImporterDependency(lockfile) {
  return withoutUlcImporterDependency(
    lockfile,
    "@appbasis/training-plans",
    "link:../../modules/training-plans",
  );
}

function withoutUlcAthletesImporterDependency(lockfile) {
  return withoutUlcImporterDependency(
    lockfile,
    "@appbasis/athletes",
    "link:../../modules/athletes",
  );
}

function withoutUlcImporterDependency(lockfile, packageName, version) {
  const importerHeader = "\n  apps/ulc-linz:\n";
  const importerStart = lockfile.indexOf(importerHeader);
  if (importerStart < 0) {
    throw new Error("Published lockfile is missing the apps/ulc-linz importer.");
  }

  const contentStart = importerStart + importerHeader.length;
  const tail = lockfile.slice(contentStart);
  const nextImporterMatch = /\n  [^\s].*:\n/.exec(tail);
  const importerEnd =
    nextImporterMatch === null
      ? lockfile.length
      : contentStart + nextImporterMatch.index;
  const importer = lockfile.slice(contentStart, importerEnd);
  const block = `      '${packageName}':
        specifier: workspace:*
        version: ${version}
`;

  const first = importer.indexOf(block);
  if (first < 0) {
    throw new Error(
      `Published ULC lockfile is missing ${packageName} in apps/ulc-linz.`,
    );
  }
  if (importer.indexOf(block, first + block.length) >= 0) {
    throw new Error(
      `Published ULC lockfile contains an ambiguous ${packageName} block in apps/ulc-linz.`,
    );
  }

  const absoluteStart = contentStart + first;
  return (
    lockfile.slice(0, absoluteStart) +
    lockfile.slice(absoluteStart + block.length)
  );
}
