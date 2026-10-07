import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_REPOSITORY_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CONTRACT_PATH = "apps/ulc-linz/exercise-catalog-adoption.json";
const APP_DEFINITION_PATH = "apps/ulc-linz/appbasis.app.json";
const APP_PACKAGE_PATH = "apps/ulc-linz/package.json";
const DATABASE_MANIFEST_PATH = "apps/ulc-linz/appbasis.database.json";
const MODULE_MANIFEST_PATH = "modules/exercise-catalog/appbasis.module.json";

const REQUIRED_TABLES = Object.freeze([
  Object.freeze({
    sourceTable: "ulc_linz_exercise_catalog_item",
    targetTable: "appbasis_exercise_catalog_item",
    targetKey: Object.freeze(["organization_id", "id"]),
    columns: Object.freeze([
      ["id", "id"],
      ["organization_id", "organization_id"],
      ["name", "name"],
      ["category_key", "category_key"],
      ["subcategory", "subcategory"],
      ["goal", "goal"],
      ["description", "description"],
      ["coaching_cues", "coaching_cues"],
      ["common_mistakes", "common_mistakes"],
      ["equipment", "equipment"],
      ["video_url", "video_url"],
      ["is_active", "is_active"],
      ["created_at", "created_at"],
      ["updated_at", "updated_at"],
    ]),
  }),
  Object.freeze({
    sourceTable: "ulc_linz_exercise_parameter",
    targetTable: "appbasis_exercise_catalog_parameter",
    targetKey: Object.freeze([
      "organization_id",
      "exercise_id",
      "parameter_key",
    ]),
    columns: Object.freeze([
      ["organization_id", "organization_id"],
      ["exercise_id", "exercise_id"],
      ["parameter_key", "parameter_key"],
      ["label", "label"],
      ["unit", "unit"],
      ["input_type", "input_type"],
      ["default_value", "default_value"],
      ["min_value", "min_value"],
      ["max_value", "max_value"],
      ["step_value", "step_value"],
      ["is_required", "is_required"],
      ["sort_order", "sort_order"],
      ["created_at", "created_at"],
      ["updated_at", "updated_at"],
    ]),
  }),
  Object.freeze({
    sourceTable: "ulc_linz_exercise_group",
    targetTable: "appbasis_exercise_catalog_audience",
    targetKey: Object.freeze([
      "organization_id",
      "exercise_id",
      "audience_id",
    ]),
    columns: Object.freeze([
      ["organization_id", "organization_id"],
      ["exercise_id", "exercise_id"],
      ["group_id", "audience_id"],
      ["created_at", "created_at"],
    ]),
  }),
  Object.freeze({
    sourceTable: "ulc_linz_exercise_favorite",
    targetTable: "appbasis_exercise_catalog_favorite",
    targetKey: Object.freeze([
      "organization_id",
      "principal_id",
      "exercise_id",
    ]),
    columns: Object.freeze([
      ["organization_id", "organization_id"],
      ["identity_id", "principal_id"],
      ["exercise_id", "exercise_id"],
      ["created_at", "created_at"],
    ]),
  }),
]);

const REQUIRED_INVARIANTS = Object.freeze({
  targetOwnerMustBeAbsentBeforeRepositoryAdoption: true,
  targetTablesMustBeEmptyBeforeCopy: true,
  preserveOrganizationIds: true,
  preserveExerciseIds: true,
  preserveTimestamps: true,
  sourceTablesRemainUntouchedDuringCopy: true,
  rejectSourceOrphans: true,
  requireExactRowCounts: true,
  requirePerOrganizationRowCounts: true,
  requireMappedContentEquality: true,
});

const REQUIRED_CUTOVER_GUARD = Object.freeze({
  strategy: "quiesce-and-verify",
  quiesceSourceWritesBeforeFinalVerification: true,
  requireFinalMappedContentEquality: true,
  abortOnMismatch: true,
  runtimeSwitchOnlyAfterSuccessfulFinalVerification: true,
  releaseSourceWriteQuiescenceOnlyAfterCutoverOrRollback: true,
});

export async function planUlcExerciseCatalogAdoption(
  { repositoryRoot = DEFAULT_REPOSITORY_ROOT } = {},
) {
  const root = await canonicalRepositoryRoot(repositoryRoot);
  const contract = await readJson(root, CONTRACT_PATH);
  assertContractShape(contract);

  const [appDefinition, appPackage, databaseManifest, moduleManifest] =
    await Promise.all([
      readJson(root, APP_DEFINITION_PATH),
      readJson(root, APP_PACKAGE_PATH),
      readJson(root, DATABASE_MANIFEST_PATH),
      readJson(root, MODULE_MANIFEST_PATH),
    ]);

  const repositoryState = assertRepositoryState({
    contract,
    appDefinition,
    appPackage,
    databaseManifest,
    moduleManifest,
  });

  await assertPinnedMigration(
    root,
    contract.source.migration,
    "ULC exercise-catalog source migration",
  );
  for (const migration of contract.target.migrations) {
    await assertPinnedMigration(
      root,
      migration,
      "exercise-catalog target migration",
    );
  }

  return deepFreeze({
    schemaVersion: 1,
    operation: contract.operation,
    state: "ready-for-isolated-adoption-proof",
    repositoryState,
    application: contract.application,
    source: {
      ownerId: contract.source.ownerId,
      ownerRoot: contract.source.ownerRoot,
      ownerSchemaVersion: contract.source.ownerSchemaVersion,
      migration: { ...contract.source.migration },
    },
    target: {
      moduleId: contract.target.moduleId,
      packageName: contract.target.packageName,
      ownerRoot: contract.target.ownerRoot,
      schemaVersion: contract.target.schemaVersion,
      migrations: contract.target.migrations.map((migration) => ({
        ...migration,
      })),
    },
    copy: {
      mode: "insert-only-preserve-identifiers",
      tables: contract.tables.map((table) => ({
        sourceTable: table.sourceTable,
        targetTable: table.targetTable,
        targetKey: [...table.targetKey],
        columns: table.columns.map((column) => ({ ...column })),
      })),
    },
    verification: {
      targetTablesMustBeEmptyBeforeCopy: true,
      rejectSourceOrphans: true,
      exactRowCounts: true,
      perOrganizationRowCounts: true,
      mappedContentEquality: true,
      finalEqualityUnderSourceWriteQuiescence: true,
    },
    cutoverGuard: { ...contract.cutoverGuard },
    phases: [
      {
        id: "repository-install",
        mutation: "repository",
        state:
          repositoryState === "published-target" ? "published" : "pending",
        gate: "separate-explicit-approval",
        executor: "FC6 existing-app updater",
      },
      {
        id: "target-schema-migration",
        mutation: "database",
        gate: "separate-explicit-approval",
        executor: "FC6 incremental module migration executor",
      },
      {
        id: "copy-and-verify",
        mutation: "database",
        gate: "isolated-proof-before-preview",
        executor: "E6G-C2 adoption executor",
      },
      {
        id: "runtime-cutover",
        mutation: "application-runtime",
        gate: "guarded-source-quiescence-and-final-equality",
        executor: "ULC app adapter",
        prerequisites: [
          "source-writes-quiesced",
          "final-source-target-equality-pass",
        ],
      },
      {
        id: "source-retirement",
        mutation: "database",
        gate: "later-contract-only",
        executor: null,
      },
    ],
    databaseAccess: false,
    writes: [],
  });
}

export function renderUlcExerciseCatalogAdoptionPlan(plan) {
  return JSON.stringify(plan, null, 2) + "\n";
}

function assertContractShape(contract) {
  if (
    !plainObject(contract) ||
    contract.schemaVersion !== 1 ||
    contract.operation !== "ulc-exercise-catalog-adoption" ||
    contract.application !== "ulc-linz" ||
    !plainObject(contract.source) ||
    contract.source.ownerId !== "ulc-linz-lifecycle" ||
    contract.source.ownerRoot !== "apps/ulc-linz" ||
    contract.source.ownerSchemaVersion !== 8 ||
    !plainObject(contract.source.migration) ||
    !plainObject(contract.target) ||
    contract.target.moduleId !== "exercise-catalog" ||
    contract.target.packageName !== "@appbasis/exercise-catalog" ||
    contract.target.ownerRoot !== "modules/exercise-catalog" ||
    contract.target.schemaVersion !== 2 ||
    !Array.isArray(contract.target.migrations) ||
    contract.target.migrations.length !== 2
  ) {
    throw new Error("ULC exercise-catalog adoption contract shape is invalid.");
  }

  const expectedTables = REQUIRED_TABLES.map((table) => ({
    sourceTable: table.sourceTable,
    targetTable: table.targetTable,
    targetKey: [...table.targetKey],
    columns: table.columns.map(([source, target]) => ({ source, target })),
  }));
  if (canonicalJson(contract.tables) !== canonicalJson(expectedTables)) {
    throw new Error(
      "ULC exercise-catalog adoption table mapping drifted from the reviewed contract.",
    );
  }
  if (
    canonicalJson(contract.invariants) !== canonicalJson(REQUIRED_INVARIANTS)
  ) {
    throw new Error(
      "ULC exercise-catalog adoption invariants drifted from the reviewed contract.",
    );
  }
  if (
    canonicalJson(contract.cutoverGuard) !==
    canonicalJson(REQUIRED_CUTOVER_GUARD)
  ) {
    throw new Error(
      "ULC exercise-catalog guarded cutover contract drifted from the reviewed contract.",
    );
  }

  assertPinnedMigrationContract(
    contract.source.migration,
    "apps/ulc-linz/migrations/0007_ulc_linz_exercise_catalog.sql",
  );
  const expectedTargetPaths = [
    "modules/exercise-catalog/migrations/0000_appbasis_exercise_catalog_foundation.sql",
    "modules/exercise-catalog/migrations/0001_appbasis_exercise_catalog_tenant_identity.sql",
  ];
  contract.target.migrations.forEach((migration, index) =>
    assertPinnedMigrationContract(migration, expectedTargetPaths[index]),
  );
}

function assertRepositoryState({
  contract,
  appDefinition,
  appPackage,
  databaseManifest,
  moduleManifest,
}) {
  if (
    !plainObject(appDefinition) ||
    appDefinition.schemaVersion !== 2 ||
    appDefinition.appId !== contract.application ||
    !Array.isArray(appDefinition.modules)
  ) {
    throw new Error("ULC app definition does not match the adoption contract.");
  }
  if (
    !plainObject(appPackage) ||
    !plainObject(appPackage.dependencies)
  ) {
    throw new Error("ULC exercise-catalog app package is invalid.");
  }
  if (
    !plainObject(databaseManifest) ||
    databaseManifest.manifestVersion !== 1 ||
    databaseManifest.application !== contract.application ||
    databaseManifest.dialect !== "postgresql" ||
    !Array.isArray(databaseManifest.owners)
  ) {
    throw new Error("ULC database ownership manifest is invalid.");
  }
  if (
    !plainObject(moduleManifest) ||
    moduleManifest.schemaVersion !== 1 ||
    moduleManifest.moduleId !== contract.target.moduleId ||
    moduleManifest.packageName !== contract.target.packageName ||
    !plainObject(moduleManifest.database) ||
    !Number.isSafeInteger(moduleManifest.database.schemaVersion) ||
    moduleManifest.database.schemaVersion < contract.target.schemaVersion ||
    !Array.isArray(moduleManifest.database.migrations) ||
    moduleManifest.database.migrations.length < contract.target.migrations.length ||
    canonicalJson(
      moduleManifest.database.migrations.slice(
        0,
        contract.target.migrations.length,
      ),
    ) !==
      canonicalJson(contract.target.migrations.map((entry) => entry.path))
  ) {
    throw new Error(
      "Exercise-catalog module database contract does not preserve the adoption baseline.",
    );
  }

  const sourceOwners = databaseManifest.owners.filter(
    (owner) => owner?.id === contract.source.ownerId,
  );
  if (sourceOwners.length !== 1) {
    throw new Error(
      "ULC exercise-catalog source owner is missing or duplicated.",
    );
  }
  const sourceOwner = sourceOwners[0];
  if (
    sourceOwner.root !== contract.source.ownerRoot ||
    sourceOwner.schemaVersion !== contract.source.ownerSchemaVersion ||
    !Array.isArray(sourceOwner.migrations) ||
    !sourceOwner.migrations.includes(contract.source.migration.path)
  ) {
    throw new Error(
      "ULC exercise-catalog source owner contract does not match the current manifest.",
    );
  }

  const moduleDeclarations = appDefinition.modules.filter(
    (moduleId) => moduleId === contract.target.moduleId,
  );
  if (moduleDeclarations.length > 1) {
    throw new Error(
      "ULC exercise-catalog target module declaration is duplicated.",
    );
  }
  const targetOwners = databaseManifest.owners.filter(
    (owner) => owner?.id === contract.target.moduleId,
  );
  if (targetOwners.length > 1) {
    throw new Error(
      "ULC exercise-catalog target owner is duplicated.",
    );
  }

  const moduleDeclared = moduleDeclarations.length === 1;
  const packageDeclared = Object.hasOwn(
    appPackage.dependencies,
    contract.target.packageName,
  );
  const targetOwnerPresent = targetOwners.length === 1;

  if (!moduleDeclared && !packageDeclared && !targetOwnerPresent) {
    return "pre-adoption";
  }

  if (!(moduleDeclared && packageDeclared && targetOwnerPresent)) {
    throw new Error(
      "ULC exercise-catalog repository adoption state is partial or inconsistent.",
    );
  }

  if (appPackage.dependencies[contract.target.packageName] !== "workspace:*") {
    throw new Error(
      "ULC exercise-catalog published target package dependency is invalid.",
    );
  }
  const targetOwner = targetOwners[0];
  const expectedTargetOwner = {
    id: contract.target.moduleId,
    root: contract.target.ownerRoot,
    schemaVersion: moduleManifest.database.schemaVersion,
    migrations: [...moduleManifest.database.migrations],
  };
  if (canonicalJson(targetOwner) !== canonicalJson(expectedTargetOwner)) {
    throw new Error(
      "ULC exercise-catalog published target owner drifted from the current module contract.",
    );
  }

  return "published-target";
}

async function assertPinnedMigration(root, migration, label) {
  const content = await readRepositoryText(root, migration.path);
  const actual = gitBlobSha1(content);
  if (actual !== migration.gitBlobSha1) {
    throw new Error(label + " content drifted from its pinned Git blob.");
  }
}

function assertPinnedMigrationContract(migration, expectedPath) {
  if (
    !plainObject(migration) ||
    migration.path !== expectedPath ||
    typeof migration.gitBlobSha1 !== "string" ||
    !/^[0-9a-f]{40}$/.test(migration.gitBlobSha1)
  ) {
    throw new Error(
      "ULC exercise-catalog adoption migration pin is invalid.",
    );
  }
}

function gitBlobSha1(content) {
  const body = Buffer.from(content, "utf8");
  return createHash("sha1")
    .update(Buffer.from("blob " + body.byteLength + "\0", "utf8"))
    .update(body)
    .digest("hex");
}

async function readJson(root, relativePath) {
  let parsed;
  try {
    parsed = JSON.parse(await readRepositoryText(root, relativePath));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(relativePath + " contains invalid JSON.");
    }
    throw error;
  }
  return parsed;
}

async function readRepositoryText(root, relativePath) {
  validateRelativePath(relativePath);
  const candidate = resolve(root, ...relativePath.split("/"));
  let canonical;
  try {
    canonical = await realpath(candidate);
  } catch {
    throw new Error(relativePath + " could not be resolved.");
  }
  if (!isWithin(root, canonical)) {
    throw new Error(relativePath + " escapes the repository root.");
  }
  const metadata = await stat(canonical);
  if (!metadata.isFile()) {
    throw new Error(relativePath + " is not a regular file.");
  }
  return readFile(canonical, "utf8");
}

async function canonicalRepositoryRoot(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Repository root is invalid.");
  }
  const root = await realpath(resolve(value));
  const metadata = await stat(root);
  if (!metadata.isDirectory()) {
    throw new Error("Repository root is not a directory.");
  }
  return root;
}

function validateRelativePath(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    isAbsolute(value) ||
    value.includes("\\") ||
    value.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error("Repository-relative adoption path is invalid.");
  }
}

function isWithin(root, candidate) {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function plainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function canonicalJson(value) {
  return JSON.stringify(value);
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}

async function runCli() {
  if (process.argv.length !== 2) {
    throw new Error(
      "ULC exercise-catalog adoption planner does not accept CLI arguments.",
    );
  }
  const plan = await planUlcExerciseCatalogAdoption();
  process.stdout.write(renderUlcExerciseCatalogAdoptionPlan(plan));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    process.stderr.write(
      (error instanceof Error ? error.message : "Adoption planning failed.") +
        "\n",
    );
    process.exitCode = 1;
  });
}
