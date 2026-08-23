import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { verifyAppDefinitions } from "./app-definition.mjs";
import { createAppSkeleton } from "./create-app.mjs";
import { evaluateProductionReadiness } from "./factory-ui/production-readiness.mjs";
import { deriveRepositoryProductionReadinessEvidence } from "./factory-ui/repository-production-readiness-evidence.mjs";
import { ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY } from "./ulc-linz-m5-role-data-scope.mjs";
import { ULC_LINZ_M5_TARGET_POLICY } from "./ulc-linz-m5-target-policy.mjs";

test("generates the first ULC Linz AppBasis target through createAppSkeleton", async (t) => {
  const root = await createRepositoryFixture(t);
  let workspaceFinalized = false;

  const result = await createAppSkeleton(
    {
      appId: "ulc-linz",
      displayName: "ULC Linz",
      modules: [],
      platformServices: ["identity", "permissions"],
    },
    {
      repositoryRoot: root,
      testingHooks: {
        lockfileFinalizer: async ({ destination }) => {
          workspaceFinalized = true;
          assert.equal(destination, join(root, "apps", "ulc-linz"));
          await assert.rejects(
            () => readFile(join(destination, "appbasis.app.json"), "utf8"),
            { code: "ENOENT" },
          );
        },
      },
    },
  );

  assert.equal(workspaceFinalized, true);
  assert.equal(result.relativeDestination, join("apps", "ulc-linz"));
  assert.deepEqual(result.definition, {
    schemaVersion: 2,
    appId: "ulc-linz",
    displayName: "ULC Linz",
    modules: [],
    platformServices: ["identity", "permissions"],
  });

  assert.deepEqual(ULC_LINZ_M5_TARGET_POLICY, {
    appId: "ulc-linz",
    operatorProfile: "Verein",
    highPrivacyProfileId: "appbasis-high-privacy-v0.1",
    roleDataScopePolicyId: "ulc-linz-role-data-scope-v0.1",
    productionDatabaseRegionTarget: "EU / Frankfurt",
  });
  assert.deepEqual(ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY.sourceRoles, [
    "admin",
    "trainer",
    "athlete",
    "parent",
  ]);
  assert.equal(
    ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY.runtimeRoleIds.trainer,
    "ulc-linz:trainer",
  );
  assert.deepEqual(ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY.adminAuthorization, {
    sourceRole: "admin",
    runtimeRoleId: "ulc-linz:admin",
    mode: "own-organization-admin",
    moduleAccess: "all-known-modules-view-edit",
    individualModulePermissionsRequired: false,
    memberAdministration: "own-organization",
    auditVisibility: "own-organization",
    crossOrganization: "deny",
    unknownModule: "deny",
  });
  assert.equal(
    ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY.permissionTemplates.kindertrainer.sourceRole,
    "trainer",
  );
  assert.equal(
    ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY.permissionTemplates.leistungstrainer.sourceRole,
    "trainer",
  );
  assert.equal(
    ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY.permissionTemplates.kindertrainer.semantics,
    "defaults-only",
  );
  assert.equal(
    ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY.principalPermissionMapping.targetMechanism,
    "principal-grants-revokes",
  );
  assert.equal(
    ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY.dataScopes.organizationBoundary,
    "same-organization-only",
  );
  assert.equal(
    ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY.dataScopes.athleteLink.relationType,
    "self",
  );
  assert.equal(
    ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY.dataScopes.parentLink.relationType,
    "managed",
  );

  const readiness = evaluateProductionReadiness(
    deriveRepositoryProductionReadinessEvidence(result.definition),
  );
  assert.equal(readiness.productionReady, false);
  assert.equal(readiness.status, "blocked");
  assert.equal(readiness.verifiedCount, 1);
  assert.equal(readiness.requiredCount, 12);

  const readinessById = Object.fromEntries(
    readiness.criteria.map((criterion) => [criterion.id, criterion.status]),
  );
  assert.equal(readinessById.dataRegion, "open");
  assert.equal(readinessById.rolesAndPermissions, "open");
  assert.equal(readinessById.highPrivacyProfile, "open");
  assert.equal(readinessById.secretsOutsideAppManifests, "verified");

  const manifest = JSON.parse(
    await readFile(join(root, "apps", "ulc-linz", "appbasis.app.json"), "utf8"),
  );
  assert.deepEqual(manifest, result.definition);

  const databaseManifest = JSON.parse(
    await readFile(
      join(root, "apps", "ulc-linz", "appbasis.database.json"),
      "utf8",
    ),
  );
  assert.deepEqual(databaseManifest, {
    manifestVersion: 1,
    application: "ulc-linz",
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
      {
        id: "permissions",
        root: "packages/permissions",
        schemaVersion: 4,
        migrations: [
          "packages/permissions/migrations/0000_appbasis_permissions_foundation.sql",
          "packages/permissions/migrations/0001_appbasis_permission_role_lifecycle.sql",
          "packages/permissions/migrations/0002_appbasis_permission_administration_audit.sql",
          "packages/permissions/migrations/0003_appbasis_principal_permission_administration_audit.sql",
        ],
      },
      {
        id: "ulc-linz-lifecycle",
        root: "apps/ulc-linz",
        schemaVersion: 3,
        migrations: [
          "apps/ulc-linz/migrations/0000_ulc_linz_lifecycle_scope.sql",
          "apps/ulc-linz/migrations/0001_ulc_linz_retention_deletion_claim.sql",
          "apps/ulc-linz/migrations/0002_ulc_linz_security_event_log.sql",
        ],
      },
    ],
  });

  const packageJson = JSON.parse(
    await readFile(join(root, "apps", "ulc-linz", "package.json"), "utf8"),
  );
  assert.equal(packageJson.name, "@appbasis/app-ulc-linz");
  assert.deepEqual(packageJson.dependencies, {
    "@appbasis/identity": "workspace:*",
    "@appbasis/permissions": "workspace:*",
    hono: "4.13.1",
  });
  assert.equal(packageJson.scripts.test, "vitest run");
  assert.equal(packageJson.scripts["test:postgres"], undefined);

  const worker = await readFile(
    join(root, "apps", "ulc-linz", "worker", "app.ts"),
    "utf8",
  );
  assert.match(worker, /appId: "ulc-linz"/);
  assert.match(worker, /from "@appbasis\/identity\/http"/);
  assert.match(worker, /\/api\/auth\/session/);
  assert.doesNotMatch(worker, /\/api\/tasks/);
  assert.doesNotMatch(worker, /@appbasis\/tasks/);
  assert.doesNotMatch(worker, /reference/i);

  const readme = await readFile(
    join(root, "apps", "ulc-linz", "README.md"),
    "utf8",
  );
  assert.match(readme, /# ULC Linz/);
  assert.match(readme, /Modules: none/);
  assert.match(readme, /Platform services: identity, permissions/);

  const definitions = await verifyAppDefinitions(root);
  assert.equal(definitions.length, 1);
  assert.equal(definitions[0]?.appId, "ulc-linz");
  assert.deepEqual(definitions[0]?.modules, []);
  assert.deepEqual(definitions[0]?.platformServices, ["identity", "permissions"]);
});

test("rejects creating ULC Linz without the required permissions service", async (t) => {
  const root = await createRepositoryFixture(t);

  await assert.rejects(
    () =>
      createAppSkeleton(
        {
          appId: "ulc-linz",
          displayName: "ULC Linz",
          modules: [],
          platformServices: ["identity"],
        },
        { repositoryRoot: root },
      ),
    /requires platform service permissions/,
  );

  await assert.rejects(
    () => readFile(join(root, "apps", "ulc-linz", "appbasis.app.json"), "utf8"),
    { code: "ENOENT" },
  );
});

test("rejects a persisted ULC Linz definition that drops required permissions", async (t) => {
  const root = await createRepositoryFixture(t);
  const appDirectory = join(root, "apps", "ulc-linz");
  await mkdir(appDirectory, { recursive: true });
  await writeFile(
    join(appDirectory, "appbasis.app.json"),
    `${JSON.stringify(
      {
        schemaVersion: 2,
        appId: "ulc-linz",
        displayName: "ULC Linz",
        modules: [],
        platformServices: ["identity"],
      },
      null,
      2,
    )}\n`,
  );

  await assert.rejects(
    () => verifyAppDefinitions(root),
    /requires platform service permissions/,
  );
});

async function createRepositoryFixture(t) {
  const root = await mkdtemp(join(tmpdir(), "appbasis-ulc-linz-generation-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "apps"), { recursive: true });
  await mkdir(join(root, "modules"), { recursive: true });
  await writeFile(
    join(root, "pnpm-lock.yaml"),
    "lockfileVersion: '9.0'\n\nimporters:\n  .: {}\n",
  );
  return root;
}
