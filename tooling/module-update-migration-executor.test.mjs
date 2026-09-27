import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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

import {
  createCatalogContract,
  loadBaselineCatalogExceptionPaths,
  loadModuleUpdateMigrationExecutionPlan,
  ModuleUpdateMigrationConfigurationError,
} from "./module-update-migration-executor.mjs";
import { migrationStatements } from "./database-migration-executor.mjs";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("ULC-E2A Stammdaten migration stays inside the FC6 target DDL contract", async () => {
  const relativePath =
    "modules/athletes/migrations/0000_appbasis_athletes_foundation.sql";
  const sql = await readFile(join(repositoryRoot, relativePath), "utf8");

  assert.doesNotMatch(sql, /\bREFERENCES\b/i);

  const contract = createCatalogContract(
    [
      {
        ownerId: "athletes",
        relativePath,
        statements: [sql],
      },
    ],
    "athletes target",
  );

  assert.deepEqual(
    contract
      .filter((marker) => marker.kind === "table")
      .map((marker) => marker.name),
    [
      "appbasis_athlete",
      "appbasis_athlete_group_membership",
      "appbasis_trainer",
      "appbasis_trainer_group_membership",
      "appbasis_training_group",
    ],
  );
  assert.equal(
    contract.some(
      (marker) =>
        marker.kind === "constraint-count" &&
        marker.table === "appbasis_athlete_group_membership" &&
        marker.name === "p" &&
        marker.count === 1,
    ),
    true,
  );
});

test("ULC-E2B accepts unsupported historical baseline SQL only from an exact reviewed digest", async (t) => {
  const relativePath =
    "apps/ulc-linz/migrations/0003_ulc_linz_security_event_access.sql";
  const sql = await readFile(join(repositoryRoot, relativePath), "utf8");
  const plan = [
    {
      ownerId: "ulc-linz-lifecycle",
      relativePath,
      statements: migrationStatements(sql),
    },
  ];

  assert.doesNotThrow(() =>
    createCatalogContract(plan, "baseline", {
      allowedUnsupportedMigrationPaths: new Set([relativePath]),
    }),
  );
  assert.throws(
    () => createCatalogContract(plan, "target"),
    /statement without a verifiable catalog marker/,
  );
  assert.throws(
    () =>
      createCatalogContract(
        [
          {
            ownerId: "baseline",
            relativePath: "unsafe.sql",
            statements: [
              "DO $appbasis$ BEGIN SELECT rewrite_existing_data() INTO result; END $appbasis$;",
            ],
          },
        ],
        "baseline",
        { allowedUnsupportedMigrationPaths: new Set([relativePath]) },
      ),
    /statement without a verifiable catalog marker/,
  );

  const root = await mkdtemp(join(tmpdir(), "appbasis-fc6-baseline-exception-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "apps", "ulc-linz", "migrations"), {
    recursive: true,
  });
  await writeFile(join(root, relativePath), sql);
  const sha256 = createHash("sha256").update(sql, "utf8").digest("hex");
  await writeFile(
    join(
      root,
      "apps",
      "ulc-linz",
      "appbasis.database-baseline-catalog-exceptions.json",
    ),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        application: "ulc-linz",
        exceptions: [
          {
            migration: relativePath,
            sha256,
            classification: "historical-access-control-only",
          },
        ],
      },
      null,
      2,
    )}\n`,
  );

  const allowed = await loadBaselineCatalogExceptionPaths({
    repositoryRoot: root,
    appId: "ulc-linz",
    baselinePlan: plan,
    targetPlan: [],
  });
  assert.deepEqual([...allowed], [relativePath]);

  await writeFile(
    join(root, relativePath),
    `${sql}\n-- drift that requires a new explicit review\n`,
  );
  await assert.rejects(
    loadBaselineCatalogExceptionPaths({
      repositoryRoot: root,
      appId: "ulc-linz",
      baselinePlan: plan,
      targetPlan: [],
    }),
    /drifted from its reviewed digest/,
  );
});

test("FC6-B derives verifiable catalog markers from quoted PostgreSQL DDL", () => {
  const contract = createCatalogContract(
    [
      {
        ownerId: "identity",
        relativePath: "identity.sql",
        statements: [
          `CREATE TABLE "appbasis_person" (
            "id" text PRIMARY KEY NOT NULL,
            "display_name" text NOT NULL,
            CONSTRAINT "appbasis_person_display_name_unique" UNIQUE("display_name")
          );`,
          `ALTER TABLE "appbasis_person"
            ADD CONSTRAINT "appbasis_person_display_name_check"
            CHECK (length("display_name") > 0);`,
          `CREATE INDEX "appbasis_person_display_name_idx"
            ON "appbasis_person" USING btree ("display_name");`,
        ],
      },
    ],
    "baseline",
  );

  assert.deepEqual(contract, [
    {
      kind: "column",
      table: "appbasis_person",
      name: "display_name",
      present: true,
    },
    {
      kind: "column",
      table: "appbasis_person",
      name: "id",
      present: true,
    },
    {
      kind: "constraint-count",
      table: "appbasis_person",
      name: "c",
      count: 1,
      present: true,
    },
    {
      kind: "constraint-count",
      table: "appbasis_person",
      name: "f",
      count: 0,
      present: true,
    },
    {
      kind: "constraint-count",
      table: "appbasis_person",
      name: "p",
      count: 1,
      present: true,
    },
    {
      kind: "constraint-count",
      table: "appbasis_person",
      name: "u",
      count: 1,
      present: true,
    },
    {
      kind: "constraint-count",
      table: "appbasis_person",
      name: "x",
      count: 0,
      present: true,
    },
    {
      kind: "constraint",
      table: "appbasis_person",
      name: "appbasis_person_display_name_check",
      present: true,
    },
    {
      kind: "constraint",
      table: "appbasis_person",
      name: "appbasis_person_display_name_unique",
      present: true,
    },
    {
      kind: "index",
      table: "appbasis_person",
      name: "appbasis_person_display_name_idx",
      present: true,
    },
    {
      kind: "table",
      name: "appbasis_person",
      present: true,
    },
  ]);
});

test("FC6-B keeps the final catalog state when a constraint is replaced", () => {
  const contract = createCatalogContract([
    {
      ownerId: "permissions",
      relativePath: "replace.sql",
      statements: [
        "ALTER TABLE appbasis_permission_role DROP CONSTRAINT appbasis_role_check;",
        "ALTER TABLE appbasis_permission_role ADD CONSTRAINT appbasis_role_check CHECK (true);",
      ],
    },
  ]);

  assert.deepEqual(contract, [
    {
      kind: "constraint",
      table: "appbasis_permission_role",
      name: "appbasis_role_check",
      present: true,
    },
  ]);
});

test("FC6-B derives the final catalog state from canonical permissions files with consecutive SQL commands", async () => {
  const migrations = [];
  for (const migration of [
    "0000_appbasis_permissions_foundation.sql",
    "0001_appbasis_permission_role_lifecycle.sql",
    "0002_appbasis_permission_administration_audit.sql",
    "0003_appbasis_principal_permission_administration_audit.sql",
  ]) {
    const sql = await readFile(
      join(repositoryRoot, "packages", "permissions", "migrations", migration),
      "utf8",
    );
    migrations.push({
      ownerId: "permissions",
      relativePath: `packages/permissions/migrations/${migration}`,
      statements: migrationStatements(sql),
    });
  }

  const contract = createCatalogContract(migrations, "permissions baseline");

  assert.equal(
    contract.some(
      (marker) =>
        marker.kind === "table" &&
        marker.name === "appbasis_permission_administration_audit" &&
        marker.present === true,
    ),
    true,
  );
  assert.equal(
    contract.some(
      (marker) =>
        marker.kind === "constraint-count" &&
        marker.table === "appbasis_permission_role_capability" &&
        marker.name === "p" &&
        marker.count === 1 &&
        marker.present === true,
    ),
    true,
  );
  assert.equal(
    contract.some(
      (marker) =>
        marker.kind === "constraint-count" &&
        marker.table === "appbasis_permission_role_capability" &&
        marker.name === "f" &&
        marker.count === 2 &&
        marker.present === true,
    ),
    true,
  );
  assert.equal(
    contract.some(
      (marker) =>
        marker.kind === "constraint" &&
        marker.table === "appbasis_permission_administration_audit" &&
        marker.name ===
          "appbasis_permission_administration_audit_event_type_check" &&
        marker.present === true,
    ),
    true,
  );
  assert.equal(
    contract.some(
      (marker) =>
        marker.kind === "index" &&
        marker.name === "appbasis_permission_administration_audit_target_idx" &&
        marker.present === true,
    ),
    true,
  );
});

test("FC6-B rejects a partially understood ALTER TABLE command", () => {
  assert.throws(
    () =>
      createCatalogContract([
        {
          ownerId: "tasks",
          relativePath: "mixed-alter.sql",
          statements: [
            "ALTER TABLE appbasis_task ADD COLUMN note text, ALTER COLUMN title DROP NOT NULL;",
          ],
        },
      ]),
    ModuleUpdateMigrationConfigurationError,
  );
});

test("FC6-B accepts supported DDL with leading SQL comments without weakening proof", () => {
  const contract = createCatalogContract([
    {
      ownerId: "tasks",
      relativePath: "commented.sql",
      statements: [
        `-- module table
CREATE TABLE appbasis_task_note (
  id text PRIMARY KEY,
  note text NOT NULL
);
/* index follows */
CREATE INDEX appbasis_task_note_note_idx
  ON appbasis_task_note (note);`,
      ],
    },
  ]);

  assert.equal(
    contract.some(
      (marker) =>
        marker.kind === "table" &&
        marker.name === "appbasis_task_note" &&
        marker.present === true,
    ),
    true,
  );
  assert.equal(
    contract.some(
      (marker) =>
        marker.kind === "index" &&
        marker.table === "appbasis_task_note" &&
        marker.name === "appbasis_task_note_note_idx" &&
        marker.present === true,
    ),
    true,
  );
});

test("FC6-B keeps dollar-quoted defaults with commas inside one table element", () => {
  const contract = createCatalogContract([
    {
      ownerId: "tasks",
      relativePath: "dollar-default.sql",
      statements: [
        "CREATE TABLE appbasis_task_note (id text PRIMARY KEY, value text DEFAULT $$a,b$$);",
      ],
    },
  ]);

  assert.equal(
    contract.some(
      (marker) =>
        marker.kind === "column" &&
        marker.table === "appbasis_task_note" &&
        marker.name === "value" &&
        marker.present === true,
    ),
    true,
  );
  assert.equal(
    contract.some(
      (marker) =>
        marker.kind === "column" &&
        marker.table === "appbasis_task_note" &&
        marker.name === "b$$",
    ),
    false,
  );
});

test("FC6-B keeps commas inside PostgreSQL E-strings with escaped quotes", () => {
  const contract = createCatalogContract([
    {
      ownerId: "tasks",
      relativePath: "escape-default.sql",
      statements: [
        "CREATE TABLE appbasis_task_note (id text PRIMARY KEY, value text DEFAULT E'a\\',b', details text);",
      ],
    },
  ]);

  for (const name of ["id", "value", "details"]) {
    assert.equal(
      contract.some(
        (marker) =>
          marker.kind === "column" &&
          marker.table === "appbasis_task_note" &&
          marker.name === name &&
          marker.present === true,
      ),
      true,
    );
  }
});

test("FC6-B ignores commas inside CREATE TABLE comments and still proves the following column", () => {
  const contract = createCatalogContract([
    {
      ownerId: "tasks",
      relativePath: "commented-elements.sql",
      statements: [
        `CREATE TABLE appbasis_task_note (
          id text PRIMARY KEY,
          -- explanation, with comma
          note text NOT NULL,
          /* another, comma */
          details text
        );`,
      ],
    },
  ]);

  for (const name of ["id", "note", "details"]) {
    assert.equal(
      contract.some(
        (marker) =>
          marker.kind === "column" &&
          marker.table === "appbasis_task_note" &&
          marker.name === name &&
          marker.present === true,
      ),
      true,
    );
  }
});

test("FC6-B rejects target module DDL that mutates a baseline-owned table", async (t) => {
  const root = await createExistingAppFixture(t);
  await writeFile(
    join(
      root,
      "modules",
      "tasks",
      "migrations",
      "0000_appbasis_tasks_foundation.sql",
    ),
    `ALTER TABLE appbasis_person ADD COLUMN module_owned_field text;
CREATE INDEX appbasis_person_module_owned_idx
  ON appbasis_person (module_owned_field);
`,
  );

  await assert.rejects(
    () =>
      loadModuleUpdateMigrationExecutionPlan(
        {
          appId: "existing",
          moduleId: "tasks",
        },
        { repositoryRoot: root },
      ),
    (error) =>
      error instanceof ModuleUpdateMigrationConfigurationError &&
      /outside its own migration delta|baseline-owned table/.test(error.message),
  );
});

test("FC6-B rejects target REFERENCES until a public module dependency contract exists", async (t) => {
  const root = await createExistingAppFixture(t);
  await writeFile(
    join(
      root,
      "modules",
      "tasks",
      "migrations",
      "0000_appbasis_tasks_foundation.sql",
    ),
    `CREATE TABLE appbasis_task (
  id text PRIMARY KEY,
  person_id text REFERENCES appbasis_person(id)
);
`,
  );

  await assert.rejects(
    () =>
      loadModuleUpdateMigrationExecutionPlan(
        {
          appId: "existing",
          moduleId: "tasks",
        },
        { repositoryRoot: root },
      ),
    (error) =>
      error instanceof ModuleUpdateMigrationConfigurationError &&
      /REFERENCES.*public module dependency contract/.test(error.message),
  );
});

test("FC6-B ignores REFERENCES text inside comments, literals and quoted identifiers", async (t) => {
  const root = await createExistingAppFixture(t);
  await writeFile(
    join(
      root,
      "modules",
      "tasks",
      "migrations",
      "0000_appbasis_tasks_foundation.sql",
    ),
    `CREATE TABLE appbasis_task (
  id text PRIMARY KEY,
  -- REFERENCES appbasis_person(id) is documentation only
  note text NOT NULL DEFAULT 'REFERENCES appbasis_person(id)',
  escaped text NOT NULL DEFAULT E'REFERENCES appbasis_person(id)',
  tagged text NOT NULL DEFAULT $tag$REFERENCES appbasis_person(id)$tag$,
  "REFERENCES" text NOT NULL DEFAULT 'literal'
);
`,
  );

  const plan = await loadModuleUpdateMigrationExecutionPlan(
    {
      appId: "existing",
      moduleId: "tasks",
    },
    { repositoryRoot: root },
  );

  for (const name of ["note", "escaped", "tagged", "REFERENCES"]) {
    assert.equal(
      plan.targetCatalogContract.some(
        (marker) =>
          marker.kind === "column" &&
          marker.table === "appbasis_task" &&
          marker.name === name &&
          marker.present === true,
      ),
      true,
    );
  }
});

test("FC6-B rejects CREATE TABLE inheritance from baseline-owned schemas", () => {
  assert.throws(
    () =>
      createCatalogContract([
        {
          ownerId: "tasks",
          relativePath: "inherits.sql",
          statements: [
            "CREATE TABLE module_child (id text) INHERITS (appbasis_person);",
          ],
        },
      ]),
    ModuleUpdateMigrationConfigurationError,
  );
});

test("FC6-B folds unquoted PostgreSQL identifiers but preserves quoted spelling", () => {
  const unquoted = createCatalogContract([
    {
      ownerId: "tasks",
      relativePath: "unquoted.sql",
      statements: [
        "CREATE TABLE AppTask (ID text PRIMARY KEY); CREATE INDEX AppTaskIDIdx ON AppTask (ID);",
      ],
    },
  ]);
  assert.equal(
    unquoted.some(
      (marker) =>
        marker.kind === "table" &&
        marker.name === "apptask" &&
        marker.present === true,
    ),
    true,
  );
  assert.equal(
    unquoted.some(
      (marker) =>
        marker.kind === "column" &&
        marker.table === "apptask" &&
        marker.name === "id" &&
        marker.present === true,
    ),
    true,
  );
  assert.equal(
    unquoted.some(
      (marker) =>
        marker.kind === "index" &&
        marker.table === "apptask" &&
        marker.name === "apptaskididx" &&
        marker.present === true,
    ),
    true,
  );

  const quoted = createCatalogContract([
    {
      ownerId: "tasks",
      relativePath: "quoted-case.sql",
      statements: ['CREATE TABLE "AppTaskQuoted" ("ID" text PRIMARY KEY);'],
    },
  ]);
  assert.equal(
    quoted.some(
      (marker) =>
        marker.kind === "table" &&
        marker.name === "AppTaskQuoted" &&
        marker.present === true,
    ),
    true,
  );
  assert.equal(
    quoted.some(
      (marker) =>
        marker.kind === "column" &&
        marker.table === "AppTaskQuoted" &&
        marker.name === "ID" &&
        marker.present === true,
    ),
    true,
  );
});

test("FC6-B fails closed when a migration statement has no catalog proof", () => {
  assert.throws(
    () =>
      createCatalogContract([
        {
          ownerId: "unsafe",
          relativePath: "unsupported.sql",
          statements: ["SELECT 1;"],
        },
      ]),
    ModuleUpdateMigrationConfigurationError,
  );
});

test("FC6-B loads the real tasks module as a pending incremental migration", async (t) => {
  const root = await createExistingAppFixture(t);
  const plan = await loadModuleUpdateMigrationExecutionPlan(
    {
      appId: "existing",
      moduleId: "tasks",
    },
    { repositoryRoot: root },
  );

  assert.equal(plan.schemaVersion, 1);
  assert.equal(plan.operation, "module-install-migrations");
  assert.equal(plan.application, "existing");
  assert.equal(plan.moduleId, "tasks");
  assert.equal(plan.repositoryState, "pending-repository-update");
  assert.deepEqual(plan.beforeOwnerIds, ["identity"]);
  assert.deepEqual(plan.targetOwner, {
    id: "tasks",
    root: "modules/tasks",
    schemaVersion: 1,
    migrations: [
      "modules/tasks/migrations/0000_appbasis_tasks_foundation.sql",
    ],
  });
  assert.equal(
    plan.baselineCatalogContract.some(
      (marker) =>
        marker.kind === "table" &&
        marker.name === "appbasis_identity_security_state",
    ),
    true,
  );
  assert.equal(
    plan.baselineCatalogContract.some(
      (marker) =>
        marker.kind === "table" &&
        marker.name === "appbasis_identity_operation",
    ),
    true,
  );
  assert.equal(
    plan.targetCatalogContract.some(
      (marker) => marker.kind === "table" && marker.name === "appbasis_task",
    ),
    true,
  );
  assert.equal(plan.migrations.length, 1);
  assert.match(plan.migrations[0].statements[0], /CREATE TABLE appbasis_task/);
});

test("FC6-B reconstructs the same tasks delta from the canonically published target manifest", async (t) => {
  const root = await createExistingAppFixture(t);
  await publishTasksModuleFixture(root);

  const plan = await loadModuleUpdateMigrationExecutionPlan(
    {
      appId: "existing",
      moduleId: "tasks",
    },
    { repositoryRoot: root },
  );

  assert.equal(plan.repositoryState, "published-target");
  assert.deepEqual(plan.beforeOwnerIds, ["identity"]);
  assert.deepEqual(plan.targetOwner, {
    id: "tasks",
    root: "modules/tasks",
    schemaVersion: 1,
    migrations: [
      "modules/tasks/migrations/0000_appbasis_tasks_foundation.sql",
    ],
  });
  assert.equal(
    plan.targetCatalogContract.some(
      (marker) =>
        marker.kind === "table" &&
        marker.name === "appbasis_task" &&
        marker.present === true,
    ),
    true,
  );
});

async function publishTasksModuleFixture(root) {
  const appPath = join(root, "apps", "existing", "appbasis.app.json");
  const app = JSON.parse(await readFile(appPath, "utf8"));
  app.modules = ["tasks"];
  await writeFile(appPath, `${JSON.stringify(app, null, 2)}\n`);

  const packagePath = join(root, "apps", "existing", "package.json");
  const appPackage = JSON.parse(await readFile(packagePath, "utf8"));
  appPackage.dependencies["@appbasis/tasks"] = "workspace:*";
  await writeFile(packagePath, `${JSON.stringify(appPackage, null, 2)}\n`);

  const databasePath = join(
    root,
    "apps",
    "existing",
    "appbasis.database.json",
  );
  const database = JSON.parse(await readFile(databasePath, "utf8"));
  database.owners.push({
    id: "tasks",
    root: "modules/tasks",
    schemaVersion: 1,
    migrations: [
      "modules/tasks/migrations/0000_appbasis_tasks_foundation.sql",
    ],
  });
  await writeFile(databasePath, `${JSON.stringify(database, null, 2)}\n`);

  await writeFile(
    join(root, "pnpm-lock.yaml"),
    `lockfileVersion: '9.0'

settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false

importers:

  .: {}

  apps/existing:
    dependencies:
      '@appbasis/identity':
        specifier: workspace:*
        version: link:../../packages/identity
      '@appbasis/tasks':
        specifier: workspace:*
        version: link:../../modules/tasks
      hono:
        specifier: 4.13.1
        version: 4.13.1
`,
  );
}

async function createExistingAppFixture(t) {
  const root = await mkdtemp(join(tmpdir(), "appbasis-fc6-b-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  await mkdir(join(root, "apps", "existing"), { recursive: true });
  await mkdir(join(root, "packages", "identity", "drizzle"), {
    recursive: true,
  });
  await mkdir(join(root, "modules"), { recursive: true });

  for (const migration of [
    "0000_appbasis_identity_foundation.sql",
    "0001_appbasis_identity_foundation.sql",
  ]) {
    await cp(
      join(repositoryRoot, "packages", "identity", "drizzle", migration),
      join(root, "packages", "identity", "drizzle", migration),
    );
  }
  await cp(join(repositoryRoot, "modules", "tasks"), join(root, "modules", "tasks"), {
    recursive: true,
  });

  await writeFile(
    join(root, "apps", "existing", "appbasis.app.json"),
    `${JSON.stringify(
      {
        schemaVersion: 2,
        appId: "existing",
        displayName: "Existing",
        modules: [],
        platformServices: ["identity"],
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(root, "apps", "existing", "package.json"),
    `${JSON.stringify(
      {
        name: "@appbasis/app-existing",
        version: "0.0.0",
        private: true,
        type: "module",
        dependencies: {
          "@appbasis/identity": "workspace:*",
          hono: "4.13.1",
        },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(root, "apps", "existing", "appbasis.database.json"),
    `${JSON.stringify(
      {
        manifestVersion: 1,
        application: "existing",
        dialect: "postgresql",
        owners: [
          {
            id: "identity",
            root: "packages/identity",
            schemaVersion: 2,
            migrations: [
              "packages/identity/drizzle/0000_appbasis_identity_foundation.sql",
              "packages/identity/drizzle/0001_appbasis_identity_foundation.sql",
            ],
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(root, "pnpm-lock.yaml"),
    `lockfileVersion: '9.0'

settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false

importers:

  .: {}

  apps/existing:
    dependencies:
      '@appbasis/identity':
        specifier: workspace:*
        version: link:../../packages/identity
      hono:
        specifier: 4.13.1
        version: 4.13.1
`,
  );

  return root;
}
