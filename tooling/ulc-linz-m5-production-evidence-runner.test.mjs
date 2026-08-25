import assert from "node:assert/strict";
import test from "node:test";

import { deriveUlcLinzM5GResourceBindingFingerprint } from "./ulc-linz-m5-provider-bound-evidence.mjs";
import { ULC_LINZ_M5_G_LEGAL_SERVICE_SCOPES } from "./ulc-linz-m5-provider-evidence.mjs";
import { evaluateUlcLinzM5ProductionEvidenceBundle } from "./ulc-linz-m5-production-evidence-runner.mjs";
import { ULC_LINZ_M6_PRODUCTION_RUNTIME_CONTRACT_DIGEST } from "./ulc-linz-m6-production-resource-binding.mjs";
import { deriveUlcLinzLifecycleContractDigest } from "./factory-ui/ulc-linz-lifecycle-evidence.mjs";

const NOW = new Date("2026-08-23T14:10:00.000Z");
const OBSERVED_AT = "2026-08-23T14:05:00.000Z";
const VALID_UNTIL = "2026-08-23T14:20:00.000Z";
const definition = Object.freeze({
  schemaVersion: 2,
  appId: "ulc-linz",
  displayName: "ULC Linz",
  modules: Object.freeze([]),
  platformServices: Object.freeze(["identity", "permissions"]),
});
const lifecycleDigest = await deriveUlcLinzLifecycleContractDigest(process.cwd());

function resourceBinding() {
  return {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    observedAt: OBSERVED_AT,
    validUntilOrReviewAt: VALID_UNTIL,
    runtime: {
      entrypoint: "./worker/index.ts",
      contractDigest: ULC_LINZ_M6_PRODUCTION_RUNTIME_CONTRACT_DIGEST,
      providerModel: "standard-workers-global-transient",
      euOnly: false,
    },
    neon: {
      projectBindingId: "project-1",
      branchBindingId: "branch-1",
      databaseBindingId: "database-1",
      region: "aws-eu-central-1",
      regionSource: "provider-api",
      identitySource: "provider-api",
      dedicatedProductionResource: true,
    },
    cloudflare: {
      accountBindingId: "account-1",
      runtimeBindingId: "worker-1",
      hostnameBinding: null,
      databaseBindingId: "hyperdrive-1",
      identitySource: "provider-api",
      bindingInventoryComplete: true,
      telemetryInventoryComplete: true,
      unexpectedPersonalDataPersistence: false,
      dedicatedProductionResource: true,
    },
  };
}

function legal(provider, documentType, canonicalSource, options = {}) {
  return {
    provider,
    documentType,
    canonicalSource,
    documentVersionOrUpdatedAt: "2026-08-23",
    serviceScope: ULC_LINZ_M5_G_LEGAL_SERVICE_SCOPES[provider],
    observedAt: OBSERVED_AT,
    validUntilOrReviewAt: VALID_UNTIL,
    accountSpecific: options.accountSpecific ?? false,
    publicBaseline: options.publicBaseline ?? true,
    transferModelConsistentWithAdr022: options.transferModelConsistentWithAdr022 ?? null,
  };
}

function ownerInputs() {
  const resource = resourceBinding();
  const complianceEvidence = {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    providerModel: "standard-workers-global-transient",
    euOnly: false,
    observedAt: OBSERVED_AT,
    validUntilOrReviewAt: VALID_UNTIL,
    dataFlowInventoryComplete: true,
    providers: {
      cloudflare: {
        resourceClass: "production",
        runtimeBound: true,
        routeBound: false,
        runtimeClass: "standard-workers",
        bindingsInventoryComplete: true,
        bindings: [{ type: "hyperdrive", personalDataDisposition: "none" }],
        telemetryInventoryComplete: true,
        transportEncryptionObserved: true,
        regionalServicesEnabled: false,
        customerMetadataBoundaryEnabled: false,
      },
      "neon-postgresql": {
        resourceClass: "production",
        projectBound: true,
        databaseBound: true,
        regionId: "aws-eu-central-1",
        regionSource: "provider-api",
        transportEncryptionObserved: true,
        atRestEncryptionObserved: true,
      },
    },
    legalEvidence: [
      legal("cloudflare", "dpa", "https://www.cloudflare.com/cloudflare-customer-dpa/"),
      legal("cloudflare", "dpa-account-binding", "https://dash.cloudflare.com/", { accountSpecific: true, publicBaseline: false }),
      legal("neon-databricks", "terms", "https://neon.com/platform-terms"),
      legal("neon-databricks", "dpa", "https://www.databricks.com/legal/data-processing-addendum"),
      legal("neon-databricks", "dpa-account-binding", "https://console.neon.tech/", { accountSpecific: true, publicBaseline: false }),
      legal("cloudflare", "subprocessors", "https://www.cloudflare.com/cloudflare-subprocessors/", { transferModelConsistentWithAdr022: true }),
      legal("neon-databricks", "subprocessors", "https://www.databricks.com/legal/subprocessors", { transferModelConsistentWithAdr022: true }),
      legal("cloudflare", "security", "https://developers.cloudflare.com/ssl/"),
      legal("neon-databricks", "security", "https://neon.com/docs/security/security-overview"),
    ],
    dataFlows: [
      { from: "ulc-linz-user", to: "cloudflare", purpose: "application-request-processing", status: "verified" },
      { from: "cloudflare", to: "neon-postgresql", purpose: "application-persistence", status: "verified" },
      { from: "cloudflare", to: "neon-postgresql", purpose: "security-log-persistence", status: "verified" },
      { from: "appbasis-control-plane", to: "cloudflare", purpose: "provider-evidence-read", status: "verified" },
      { from: "appbasis-control-plane", to: "neon-postgresql", purpose: "provider-evidence-read", status: "verified" },
      { from: "neon-postgresql", to: "neon-postgresql", purpose: "managed-backup-recovery", status: "verified" },
    ],
  };
  return {
    auditSecurityLoggingEvidenceInput: {
      resourceBindingEvidence: resource,
      loggingEvidence: {
        schemaVersion: 1,
        application: "ulc-linz",
        environment: "production",
        observedAt: OBSERVED_AT,
        validUntilOrReviewAt: VALID_UNTIL,
        inventorySource: "provider-api",
        runtimeBindingId: resource.cloudflare.runtimeBindingId,
        sinkBindingId: "database-1.security-log",
        sinkIdentitySource: "provider-api",
        structuredEventCaptureEnabled: true,
        protectedOperationalAccess: true,
        retentionMode: "provider-native-calendar",
        retentionEvidence: {
          source: "provider-api-and-authoritative-contract",
          retentionValue: 12,
          retentionUnit: "calendar-months",
          calendarSemanticsVerified: true,
          noEarlyDeleteVerified: true,
          noUncontrolledOverRetentionVerified: true,
        },
        sinkInventoryComplete: true,
        publicReadEndpointPresent: false,
      },
    },
    providerBoundEvidenceInput: {
      resourceBindingEvidence: resource,
      complianceEvidence,
      complianceResourceBindingFingerprint: deriveUlcLinzM5GResourceBindingFingerprint(resource, { now: NOW }),
    },
    controlPlaneEvidenceInput: {
      resourceBindingEvidence: resource,
      controlPlaneEvidence: {
        schemaVersion: 1,
        application: "ulc-linz",
        environment: "production",
        observedAt: OBSERVED_AT,
        validUntilOrReviewAt: VALID_UNTIL,
        provider: "cloudflare",
        providerAccountBindingId: resource.cloudflare.accountBindingId,
        publicRuntimeBindingId: resource.cloudflare.runtimeBindingId,
        inventorySource: "provider-api",
        privilegedComponentInventoryComplete: true,
        publicRuntimeBindingInventoryComplete: true,
        privilegedComponents: [],
      },
    },
    lifecycleActivationEvidenceInput: {
      resourceBindingEvidence: resource,
      activationEvidence: {
        schemaVersion: 1,
        application: "ulc-linz",
        environment: "production",
        observedAt: OBSERVED_AT,
        validUntilOrReviewAt: VALID_UNTIL,
        evidenceSource: "controlled-production-activation-run",
        executionBoundary: "protected-operations",
        lifecycleContractDigest: lifecycleDigest,
        activationInventoryComplete: true,
        deletionExecutorBound: false,
        retentionExecutorBound: false,
        restoreReconciliationExecutorBound: true,
        publicIngressPresent: false,
      },
    },
    backupRestoreEvidenceInput: {
      schemaVersion: 1,
      application: "ulc-linz",
      environment: "production",
      sourceDatabaseBindingId: resource.neon.databaseBindingId,
      restoreTargetBindingId: "restore-target-1",
      evidenceSource: "controlled-restore-run",
      restoreTestedAt: "2026-08-23T14:07:00.000Z",
      lifecycleContractDigest: lifecycleDigest,
      automaticBackupsEnabled: true,
      retentionDefined: true,
      preMigrationBackupDefined: true,
      restoreProcedureDocumented: true,
      restoreSucceeded: true,
      dataIntegrityVerified: true,
      authVerified: true,
      permissionsVerified: true,
      applicationSmokeVerified: true,
      restoreReconciliationVerified: true,
    },
  };
}

function bundle() {
  return {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    observedAt: OBSERVED_AT,
    definition,
    ownerInputs: ownerInputs(),
  };
}

test("sanitized production bundle can close all twelve M5 criteria without authorizing release", async () => {
  const result = await evaluateUlcLinzM5ProductionEvidenceBundle(process.cwd(), bundle(), { now: NOW });
  assert.equal(result.securityPrivacyReady, true);
  assert.equal(result.verifiedCount, 12);
  assert.equal(result.requiredCount, 12);
  assert.equal(result.productionReleaseAuthorized, false);
  assert.match(result.resourceBindingFingerprint, /^sha256:[0-9a-f]{64}$/);
  assert.equal(result.criteria.every(({ status }) => status === "verified"), true);
  const serialized = JSON.stringify(result);
  for (const internal of ["account-1", "worker-1", "project-1", "branch-1", "database-1", "hyperdrive-1", "restore-target-1"]) {
    assert.equal(serialized.includes(internal), false);
  }
});

test("one missing operational owner remains fail closed", async () => {
  const value = bundle();
  delete value.ownerInputs.auditSecurityLoggingEvidenceInput;
  const result = await evaluateUlcLinzM5ProductionEvidenceBundle(process.cwd(), value, { now: NOW });
  assert.equal(result.securityPrivacyReady, false);
  assert.equal(result.criteria.find(({ id }) => id === "auditSecurityLogging")?.status, "open");
});

test("runner rejects credential-shaped or accessor evidence before owner evaluation", async () => {
  const credential = bundle();
  credential.ownerInputs.providerBoundEvidenceInput.resourceBindingEvidence.neon.projectBindingId = "postgresql://user:password@example.invalid/db";
  await assert.rejects(
    () => evaluateUlcLinzM5ProductionEvidenceBundle(process.cwd(), credential, { now: NOW }),
    /contains sensitive data/,
  );

  const accessor = bundle();
  Object.defineProperty(accessor, "observedAt", { enumerable: true, get() { return OBSERVED_AT; } });
  await assert.rejects(
    () => evaluateUlcLinzM5ProductionEvidenceBundle(process.cwd(), accessor, { now: NOW }),
    /bundle is invalid/,
  );
});
