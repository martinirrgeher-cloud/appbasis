import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { ULC_LINZ_M5_TARGET_POLICY } from "./ulc-linz-m5-target-policy.mjs";
import { ULC_LINZ_M6_PRODUCTION_RESOURCE_BINDING_CONTRACT } from "./ulc-linz-m6-production-resource-binding.mjs";

const APPLICATION = "ulc-linz";
const ENVIRONMENT = "production";
const NEON_REGION = "aws-eu-central-1";
const HUMAN_REGION = "EU / Frankfurt";
const PROVIDER_MODEL = "standard-workers-global-transient";

const APP_DEFINITION_FIELDS = Object.freeze([
  "schemaVersion",
  "appId",
  "displayName",
  "modules",
  "platformServices",
]);
const DATABASE_MANIFEST_FIELDS = Object.freeze([
  "manifestVersion",
  "application",
  "dialect",
  "owners",
]);
const DATABASE_OWNER_FIELDS = Object.freeze([
  "id",
  "root",
  "schemaVersion",
  "migrations",
]);
const RESOURCE_BINDING_CONTRACT_FIELDS = Object.freeze([
  "schemaVersion",
  "application",
  "environment",
  "runtimeEntrypoint",
  "runtimeContractDigest",
  "providerModel",
  "euOnly",
  "neonRegion",
]);

const EXPECTED_DATABASE_OWNERS = deepFreeze([
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
    schemaVersion: 1,
    migrations: [
      "apps/ulc-linz/migrations/0000_ulc_linz_lifecycle_scope.sql",
    ],
  },
]);

export const ULC_LINZ_M6_PRODUCTION_EXECUTION_PLAN = deepFreeze({
  schemaVersion: 1,
  application: APPLICATION,
  environment: ENVIRONMENT,
  mode: "preflight-only",
  providerWritesEnabled: false,
  firstProviderWriteStepId: "neon-production-database",
  steps: [
    {
      sequence: 1,
      id: "neon-production-database",
      kind: "provider-write",
      approvalRequired: true,
      requires: [],
      target: {
        provider: "neon",
        dedicatedProductionResource: true,
        region: NEON_REGION,
      },
    },
    {
      sequence: 2,
      id: "production-worker",
      kind: "provider-write",
      approvalRequired: true,
      requires: ["neon-production-database"],
      target: {
        provider: "cloudflare",
        dedicatedProductionResource: true,
        workersDev: false,
        publicIngress: false,
      },
    },
    {
      sequence: 3,
      id: "database-binding",
      kind: "provider-write",
      approvalRequired: true,
      requires: ["neon-production-database", "production-worker"],
      target: {
        provider: "cloudflare",
        bindingType: "hyperdrive-or-equivalent-database-binding",
      },
    },
    {
      sequence: 4,
      id: "production-domain-preparation",
      kind: "provider-write",
      approvalRequired: true,
      requires: ["production-worker"],
      target: {
        provider: "cloudflare",
        hostnameSource: "operator-supplied",
        publicIngress: false,
      },
    },
    {
      sequence: 5,
      id: "runtime-secrets",
      kind: "provider-write",
      approvalRequired: true,
      requires: ["database-binding", "production-worker"],
      target: {
        provider: "cloudflare",
        secretValuesInRepository: false,
        requiredRuntimeConfiguration: [
          "BETTER_AUTH_SECRET",
          "APPBASIS_BASE_URL",
          "HYPERDRIVE",
        ],
      },
    },
    {
      sequence: 6,
      id: "production-migrations",
      kind: "production-data-write",
      approvalRequired: true,
      requires: ["neon-production-database"],
      target: {
        dialect: "postgresql",
        manifest: "apps/ulc-linz/appbasis.database.json",
        backupBeforeCriticalMigrationRequired: true,
      },
    },
    {
      sequence: 7,
      id: "production-worker-deploy",
      kind: "provider-write",
      approvalRequired: true,
      requires: [
        "database-binding",
        "runtime-secrets",
        "production-migrations",
      ],
      target: {
        provider: "cloudflare",
        runtimeEntrypoint: "./worker/index.ts",
        publicIngress: false,
      },
    },
    {
      sequence: 8,
      id: "production-domain-activation",
      kind: "public-exposure-write",
      approvalRequired: true,
      requires: [
        "production-domain-preparation",
        "production-worker-deploy",
      ],
      target: {
        provider: "cloudflare",
        hostnameSource: "operator-supplied",
        publicIngress: true,
      },
    },
    {
      sequence: 9,
      id: "m5-production-evidence",
      kind: "read-only-evidence",
      approvalRequired: false,
      requires: ["production-domain-activation"],
      target: {
        gate: "Production Security & Privacy Ready v0.1",
        resourceBindingConsumer:
          "tooling/ulc-linz-m6-production-resource-binding.mjs",
      },
    },
    {
      sequence: 10,
      id: "backup-recovery-validation",
      kind: "recovery-validation-write",
      approvalRequired: true,
      requires: ["m5-production-evidence", "production-migrations"],
      target: {
        gate: "Backup & Disaster Recovery v0.1",
        realRestoreRequired: true,
      },
    },
    {
      sequence: 11,
      id: "post-deploy-smokes",
      kind: "production-smoke-write",
      approvalRequired: true,
      requires: [
        "m5-production-evidence",
        "backup-recovery-validation",
        "production-domain-activation",
      ],
      target: {
        checks: ["health", "auth", "permissions", "application"],
      },
    },
    {
      sequence: 12,
      id: "release-gate",
      kind: "authorization-gate",
      approvalRequired: true,
      requires: [
        "m5-production-evidence",
        "backup-recovery-validation",
        "post-deploy-smokes",
      ],
      target: {
        explicitUserReleaseApprovalRequired: true,
        automaticRelease: false,
      },
    },
  ],
});

export class UlcLinzM6ProductionPreflightError extends Error {
  constructor(code) {
    super("ULC Linz M6 production preflight failed.");
    this.name = "UlcLinzM6ProductionPreflightError";
    this.code = code;
  }
}

export async function evaluateUlcLinzM6ProductionPreflight(
  repositoryRoot = process.cwd(),
) {
  assertCanonicalTargetContract();
  assertExecutionPlanContract();

  const root = resolve(repositoryRoot);
  const [appDefinition, databaseManifest] = await Promise.all([
    readJson(join(root, "apps", APPLICATION, "appbasis.app.json"), "APP_DEFINITION_INVALID"),
    readJson(
      join(root, "apps", APPLICATION, "appbasis.database.json"),
      "DATABASE_MANIFEST_INVALID",
    ),
  ]);

  assertAppDefinition(appDefinition);
  assertDatabaseManifest(databaseManifest);
  assertResourceBindingContract();

  return deepFreeze({
    schemaVersion: 1,
    application: APPLICATION,
    environment: ENVIRONMENT,
    status: "prepared-blocked-before-provider-write",
    repositoryPreflightVerified: true,
    providerWriteAllowed: false,
    releaseAuthorized: false,
    explicitApprovalRequired: true,
    prerequisiteGates: ["M3_DONE", "M4_DONE", "M5_DONE"],
    firstProviderWriteStepId:
      ULC_LINZ_M6_PRODUCTION_EXECUTION_PLAN.firstProviderWriteStepId,
    productionTarget: {
      databaseRegion: HUMAN_REGION,
      providerRegion: NEON_REGION,
      providerModel: PROVIDER_MODEL,
      euOnly: false,
      dedicatedProductionDatabase: true,
      dedicatedProductionWorker: true,
    },
    contracts: {
      appDefinitionVerified: true,
      databaseManifestVerified: true,
      runtimeContractVerified: true,
      resourceBindingContractVerified: true,
      secretValuesInRepository: false,
      automaticProviderWrites: false,
      automaticProductionRelease: false,
    },
    executionPlan: ULC_LINZ_M6_PRODUCTION_EXECUTION_PLAN,
  });
}

function assertCanonicalTargetContract() {
  if (
    ULC_LINZ_M5_TARGET_POLICY.appId !== APPLICATION ||
    ULC_LINZ_M5_TARGET_POLICY.productionDatabaseRegionTarget !== HUMAN_REGION
  ) {
    fail("TARGET_POLICY_DRIFT");
  }
}

function assertExecutionPlanContract() {
  const plan = ULC_LINZ_M6_PRODUCTION_EXECUTION_PLAN;
  if (
    plan.application !== APPLICATION ||
    plan.environment !== ENVIRONMENT ||
    plan.mode !== "preflight-only" ||
    plan.providerWritesEnabled !== false ||
    plan.firstProviderWriteStepId !== "neon-production-database" ||
    !Array.isArray(plan.steps) ||
    plan.steps.length !== 12
  ) {
    fail("EXECUTION_PLAN_DRIFT");
  }

  const expectedIds = [
    "neon-production-database",
    "production-worker",
    "database-binding",
    "production-domain-preparation",
    "runtime-secrets",
    "production-migrations",
    "production-worker-deploy",
    "production-domain-activation",
    "m5-production-evidence",
    "backup-recovery-validation",
    "post-deploy-smokes",
    "release-gate",
  ];

  for (const [index, step] of plan.steps.entries()) {
    if (
      step.sequence !== index + 1 ||
      step.id !== expectedIds[index] ||
      !Array.isArray(step.requires) ||
      typeof step.kind !== "string" ||
      typeof step.approvalRequired !== "boolean"
    ) {
      fail("EXECUTION_PLAN_DRIFT");
    }

    if (step.kind !== "read-only-evidence" && step.approvalRequired !== true) {
      fail("WRITE_BOUNDARY_DRIFT");
    }
  }

  const domainActivation = plan.steps.find(
    (step) => step.id === "production-domain-activation",
  );
  if (
    domainActivation?.kind !== "public-exposure-write" ||
    domainActivation.target?.publicIngress !== true
  ) {
    fail("PUBLIC_EXPOSURE_BOUNDARY_DRIFT");
  }

  const releaseGate = plan.steps.at(-1);
  if (
    releaseGate?.id !== "release-gate" ||
    releaseGate.target?.automaticRelease !== false ||
    releaseGate.target?.explicitUserReleaseApprovalRequired !== true
  ) {
    fail("RELEASE_GATE_DRIFT");
  }
}

function assertAppDefinition(value) {
  const app = exactRecord(value, APP_DEFINITION_FIELDS, "APP_DEFINITION_INVALID");
  if (
    app.schemaVersion !== 2 ||
    app.appId !== APPLICATION ||
    typeof app.displayName !== "string" ||
    app.displayName.length < 1 ||
    !exactStringArray(app.modules, []) ||
    !exactStringArray(app.platformServices, ["identity", "permissions"])
  ) {
    fail("APP_DEFINITION_INVALID");
  }
}

function assertDatabaseManifest(value) {
  const manifest = exactRecord(
    value,
    DATABASE_MANIFEST_FIELDS,
    "DATABASE_MANIFEST_INVALID",
  );
  if (
    manifest.manifestVersion !== 1 ||
    manifest.application !== APPLICATION ||
    manifest.dialect !== "postgresql" ||
    !Array.isArray(manifest.owners) ||
    manifest.owners.length !== EXPECTED_DATABASE_OWNERS.length
  ) {
    fail("DATABASE_MANIFEST_INVALID");
  }

  for (const [index, expectedOwner] of EXPECTED_DATABASE_OWNERS.entries()) {
    const owner = exactRecord(
      manifest.owners[index],
      DATABASE_OWNER_FIELDS,
      "DATABASE_MANIFEST_INVALID",
    );
    if (
      owner.id !== expectedOwner.id ||
      owner.root !== expectedOwner.root ||
      owner.schemaVersion !== expectedOwner.schemaVersion ||
      !exactStringArray(owner.migrations, expectedOwner.migrations)
    ) {
      fail("DATABASE_MANIFEST_INVALID");
    }
  }
}

function assertResourceBindingContract() {
  const contract = exactRecord(
    ULC_LINZ_M6_PRODUCTION_RESOURCE_BINDING_CONTRACT,
    RESOURCE_BINDING_CONTRACT_FIELDS,
    "RESOURCE_BINDING_CONTRACT_DRIFT",
  );
  if (
    contract.schemaVersion !== 1 ||
    contract.application !== APPLICATION ||
    contract.environment !== ENVIRONMENT ||
    contract.runtimeEntrypoint !== "./worker/index.ts" ||
    contract.providerModel !== PROVIDER_MODEL ||
    contract.euOnly !== false ||
    contract.neonRegion !== NEON_REGION ||
    typeof contract.runtimeContractDigest !== "string" ||
    !/^sha256:[0-9a-f]{64}$/.test(contract.runtimeContractDigest)
  ) {
    fail("RESOURCE_BINDING_CONTRACT_DRIFT");
  }
}

async function readJson(path, code) {
  let content;
  try {
    content = await readFile(path, "utf8");
  } catch {
    fail(code);
  }

  try {
    return JSON.parse(content);
  } catch {
    fail(code);
  }
}

function exactRecord(value, fields, code) {
  if (!isPlainRecord(value)) fail(code);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors);
  const expected = new Set(fields);
  if (
    keys.length !== fields.length ||
    fields.some((field) => !Object.hasOwn(descriptors, field)) ||
    keys.some((field) => !expected.has(field))
  ) {
    fail(code);
  }
  for (const descriptor of Object.values(descriptors)) {
    if (!("value" in descriptor) || descriptor.get !== undefined || descriptor.set !== undefined) {
      fail(code);
    }
  }
  return value;
}

function exactStringArray(value, expected) {
  if (!Array.isArray(value) || value.length !== expected.length) return false;
  if (Object.getOwnPropertySymbols(value).length > 0) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const expectedKeys = new Set([
    ...expected.map((_, index) => String(index)),
    "length",
  ]);
  if (
    Object.keys(descriptors).length !== expectedKeys.size ||
    Object.keys(descriptors).some((key) => !expectedKeys.has(key))
  ) {
    return false;
  }
  for (const [index, item] of value.entries()) {
    if (item !== expected[index]) return false;
  }
  return true;
}

function isPlainRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}

function fail(code) {
  throw new UlcLinzM6ProductionPreflightError(code);
}
