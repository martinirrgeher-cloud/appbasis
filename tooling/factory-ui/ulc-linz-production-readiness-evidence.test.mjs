import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { deriveUlcLinzM5GResourceBindingFingerprint } from "../ulc-linz-m5-provider-bound-evidence.mjs";
import { ULC_LINZ_M5_G_LEGAL_SERVICE_SCOPES } from "../ulc-linz-m5-provider-evidence.mjs";
import { ULC_LINZ_M6_PRODUCTION_RUNTIME_CONTRACT_DIGEST } from "../ulc-linz-m6-production-resource-binding.mjs";
import { loadFactorySnapshot } from "./model.mjs";
import {
  evaluateProductionReadiness,
  REQUIRED_PRODUCTION_READINESS_CRITERIA,
} from "./production-readiness.mjs";
import {
  composeUlcLinzM5JProductionEvidence,
  deriveUlcLinzM5JProductionEvidence,
  isUlcLinzM5JOwnerMatrixComplete,
  ULC_LINZ_M5_J_OWNER_MATRIX,
} from "./ulc-linz-production-readiness-evidence.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const NOW = new Date("2026-08-18T12:50:00.000Z");
const OBSERVED_AT = "2026-08-18T12:45:00.000Z";
const VALID_UNTIL = "2026-08-18T13:45:00.000Z";
const VALID_ULC_DEFINITION = Object.freeze({
  schemaVersion: 2,
  appId: "ulc-linz",
  displayName: "ULC Linz",
  modules: Object.freeze([]),
  platformServices: Object.freeze(["identity", "permissions"]),
});

function ownerEvidenceAllTrue() {
  const owners = {};
  for (const entry of ULC_LINZ_M5_J_OWNER_MATRIX) {
    owners[entry.owner] = Object.fromEntries(
      entry.criteria.map((criterionId) => [criterionId, true]),
    );
  }
  return owners;
}

function legalEntry({ provider, documentType, canonicalSource, accountSpecific = false, publicBaseline = true, transferModelConsistentWithAdr022 = null }) {
  return {
    provider,
    documentType,
    canonicalSource,
    documentVersionOrUpdatedAt: "2026-08-18",
    serviceScope: ULC_LINZ_M5_G_LEGAL_SERVICE_SCOPES[provider],
    observedAt: OBSERVED_AT,
    validUntilOrReviewAt: VALID_UNTIL,
    accountSpecific,
    publicBaseline,
    transferModelConsistentWithAdr022,
  };
}

function fullLegalEvidence() {
  return [
    legalEntry({ provider: "cloudflare", documentType: "dpa", canonicalSource: "https://www.cloudflare.com/cloudflare-customer-dpa/" }),
    legalEntry({ provider: "cloudflare", documentType: "dpa-account-binding", canonicalSource: "https://dash.cloudflare.com/", accountSpecific: true, publicBaseline: false }),
    legalEntry({ provider: "neon-databricks", documentType: "terms", canonicalSource: "https://neon.com/platform-terms" }),
    legalEntry({ provider: "neon-databricks", documentType: "dpa", canonicalSource: "https://www.databricks.com/legal/data-processing-addendum" }),
    legalEntry({ provider: "neon-databricks", documentType: "dpa-account-binding", canonicalSource: "https://console.neon.tech/", accountSpecific: true, publicBaseline: false }),
    legalEntry({ provider: "cloudflare", documentType: "subprocessors", canonicalSource: "https://www.cloudflare.com/cloudflare-subprocessors/", transferModelConsistentWithAdr022: true }),
    legalEntry({ provider: "neon-databricks", documentType: "subprocessors", canonicalSource: "https://www.databricks.com/legal/subprocessors", transferModelConsistentWithAdr022: true }),
    legalEntry({ provider: "cloudflare", documentType: "security", canonicalSource: "https://developers.cloudflare.com/ssl/" }),
    legalEntry({ provider: "neon-databricks", documentType: "security", canonicalSource: "https://neon.com/docs/security/security-overview" }),
  ];
}

function complianceEvidence() {
  return {
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
        routeBound: true,
        runtimeClass: "standard-workers",
        bindingsInventoryComplete: true,
        bindings: [
          { type: "hyperdrive", personalDataDisposition: "none" },
          { type: "service", personalDataDisposition: "transient" },
        ],
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
    legalEvidence: fullLegalEvidence(),
    dataFlows: [
      { from: "ulc-linz-user", to: "cloudflare", purpose: "application-request-processing", status: "verified" },
      { from: "cloudflare", to: "neon-postgresql", purpose: "application-persistence", status: "verified" },
      { from: "appbasis-control-plane", to: "cloudflare", purpose: "provider-evidence-read", status: "verified" },
      { from: "appbasis-control-plane", to: "neon-postgresql", purpose: "provider-evidence-read", status: "verified" },
      { from: "neon-postgresql", to: "neon-postgresql", purpose: "managed-backup-recovery", status: "verified" },
    ],
  };
}

function resourceBindingEvidence({
  observedAt = OBSERVED_AT,
  validUntilOrReviewAt = VALID_UNTIL,
  runtimeBindingId = "opaque-worker",
  databaseBindingId = "opaque-neon-database",
} = {}) {
  return {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    observedAt,
    validUntilOrReviewAt,
    runtime: {
      entrypoint: "./worker/index.ts",
      contractDigest: ULC_LINZ_M6_PRODUCTION_RUNTIME_CONTRACT_DIGEST,
      providerModel: "standard-workers-global-transient",
      euOnly: false,
    },
    neon: {
      projectBindingId: "opaque-neon-project",
      branchBindingId: "opaque-neon-branch",
      databaseBindingId,
      region: "aws-eu-central-1",
      regionSource: "provider-api",
      identitySource: "provider-api",
      dedicatedProductionResource: true,
    },
    cloudflare: {
      accountBindingId: "opaque-account",
      runtimeBindingId,
      hostnameBinding: "ulc.example.test",
      databaseBindingId: "opaque-hyperdrive",
      identitySource: "provider-api",
      bindingInventoryComplete: true,
      telemetryInventoryComplete: true,
      unexpectedPersonalDataPersistence: false,
      dedicatedProductionResource: true,
    },
  };
}

function providerBoundEvidenceInput(resource) {
  const value = resource ?? resourceBindingEvidence();
  return {
    resourceBindingEvidence: value,
    complianceEvidence: complianceEvidence(),
    complianceResourceBindingFingerprint:
      deriveUlcLinzM5GResourceBindingFingerprint(value, { now: NOW }),
  };
}

function controlPlaneEvidenceInput(resource) {
  const value = resource ?? resourceBindingEvidence();
  return {
    resourceBindingEvidence: value,
    controlPlaneEvidence: {
      schemaVersion: 1,
      application: "ulc-linz",
      environment: "production",
      observedAt: value.observedAt,
      validUntilOrReviewAt: value.validUntilOrReviewAt,
      provider: "cloudflare",
      providerAccountBindingId: value.cloudflare.accountBindingId,
      publicRuntimeBindingId: value.cloudflare.runtimeBindingId,
      inventorySource: "provider-api",
      privilegedComponentInventoryComplete: true,
      publicRuntimeBindingInventoryComplete: true,
      privilegedComponents: [],
    },
  };
}

function auditSecurityLoggingEvidenceInput(resource) {
  const value = resource ?? resourceBindingEvidence();
  return {
    resourceBindingEvidence: value,
    loggingEvidence: {
      schemaVersion: 1,
      application: "ulc-linz",
      environment: "production",
      observedAt: value.observedAt,
      validUntilOrReviewAt: value.validUntilOrReviewAt,
      inventorySource: "provider-api",
      runtimeBindingId: value.cloudflare.runtimeBindingId,
      sinkBindingId: "opaque-security-log-sink",
      sinkIdentitySource: "provider-api",
      structuredEventCaptureEnabled: true,
      protectedOperationalAccess: true,
      retentionMonths: 12,
      retentionSource: "provider-api",
      sinkInventoryComplete: true,
      publicReadEndpointPresent: false,
    },
  };
}

function backupRestoreEvidenceInput(resource) {
  const value = resource ?? resourceBindingEvidence();
  return {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    sourceDatabaseBindingId: value.neon.databaseBindingId,
    restoreTargetBindingId: "opaque-restore-target",
    evidenceSource: "controlled-restore-run",
    restoreTestedAt: "2026-08-18T12:47:00.000Z",
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
  };
}

function completeOwnerInputs() {
  const resource = resourceBindingEvidence();
  return {
    auditSecurityLoggingEvidenceInput: auditSecurityLoggingEvidenceInput(resource),
    providerBoundEvidenceInput: providerBoundEvidenceInput(resource),
    controlPlaneEvidenceInput: controlPlaneEvidenceInput(resource),
    backupRestoreEvidenceInput: backupRestoreEvidenceInput(resource),
  };
}

function criterionStatus(readiness, id) {
  return readiness.criteria.find((criterion) => criterion.id === id)?.status;
}

test("M5-J ownership matrix covers every canonical criterion exactly once", () => {
  assert.equal(isUlcLinzM5JOwnerMatrixComplete(), true);
  const assigned = ULC_LINZ_M5_J_OWNER_MATRIX.flatMap((entry) => entry.criteria);
  assert.equal(assigned.length, REQUIRED_PRODUCTION_READINESS_CRITERIA.length);
  assert.equal(new Set(assigned).size, assigned.length);
  assert.deepEqual(new Set(assigned), new Set(REQUIRED_PRODUCTION_READINESS_CRITERIA.map(({ id }) => id)));
  assert.equal(isUlcLinzM5JOwnerMatrixComplete([...REQUIRED_PRODUCTION_READINESS_CRITERIA, { id: "futureCriterion", label: "Future" }]), false);
});

test("M5-J deterministic composition is all-required", () => {
  const readiness = evaluateProductionReadiness(
    composeUlcLinzM5JProductionEvidence(ownerEvidenceAllTrue()),
  );
  assert.equal(readiness.productionReady, true);
  assert.equal(readiness.verifiedCount, 12);

  for (const criterion of REQUIRED_PRODUCTION_READINESS_CRITERIA) {
    const owners = ownerEvidenceAllTrue();
    const entry = ULC_LINZ_M5_J_OWNER_MATRIX.find(({ criteria }) => criteria.includes(criterion.id));
    assert.ok(entry);
    delete owners[entry.owner][criterion.id];
    const incomplete = evaluateProductionReadiness(
      composeUlcLinzM5JProductionEvidence(owners),
    );
    assert.equal(incomplete.productionReady, false, criterion.id);
    assert.equal(incomplete.verifiedCount, 11, criterion.id);
    assert.equal(criterionStatus(incomplete, criterion.id), "open", criterion.id);
  }
});

test("M5-J rejects unexpected, accessor, symbol and inherited owner evidence", () => {
  const unknown = ownerEvidenceAllTrue();
  unknown.unexpectedOwner = { dataRegion: true };
  assert.deepEqual(composeUlcLinzM5JProductionEvidence(unknown), {});

  const accessor = ownerEvidenceAllTrue();
  let getterCalls = 0;
  Object.defineProperty(accessor.providerCompliance, "dataRegion", {
    enumerable: true,
    get() { getterCalls += 1; return true; },
  });
  const readiness = evaluateProductionReadiness(
    composeUlcLinzM5JProductionEvidence(accessor),
  );
  assert.equal(getterCalls, 0);
  assert.equal(criterionStatus(readiness, "dataRegion"), "open");

  const symbol = ownerEvidenceAllTrue();
  symbol.lifecycle[Symbol("hidden")] = true;
  assert.equal(
    criterionStatus(
      evaluateProductionReadiness(composeUlcLinzM5JProductionEvidence(symbol)),
      "deletionConcept",
    ),
    "open",
  );

  const inherited = ownerEvidenceAllTrue();
  inherited.dataExport = Object.create({ dataExport: true });
  assert.equal(
    criterionStatus(
      evaluateProductionReadiness(composeUlcLinzM5JProductionEvidence(inherited)),
      "dataExport",
    ),
    "open",
  );
});

test("M5-J owner integration can produce all twelve only from current repository owners plus structured operational evidence", async () => {
  const readiness = evaluateProductionReadiness(
    await deriveUlcLinzM5JProductionEvidence(
      repositoryRoot,
      VALID_ULC_DEFINITION,
      completeOwnerInputs(),
      { now: NOW },
    ),
  );
  assert.equal(readiness.productionReady, true);
  assert.equal(readiness.verifiedCount, 12);
});

test("M5-J keeps F, E and High Privacy open when logging retention evidence is insufficient", async () => {
  const inputs = completeOwnerInputs();
  inputs.auditSecurityLoggingEvidenceInput.loggingEvidence.retentionMonths = 1;
  const readiness = evaluateProductionReadiness(
    await deriveUlcLinzM5JProductionEvidence(repositoryRoot, VALID_ULC_DEFINITION, inputs, { now: NOW }),
  );
  for (const id of ["auditSecurityLogging", "dataExport", "highPrivacyProfile"]) {
    assert.equal(criterionStatus(readiness, id), "open", id);
  }
});

test("M5-J rejects mixed production resource snapshots across F, G and H", async () => {
  const inputs = completeOwnerInputs();
  const other = resourceBindingEvidence({ runtimeBindingId: "other-worker", databaseBindingId: "other-db" });
  inputs.controlPlaneEvidenceInput = controlPlaneEvidenceInput(other);

  const readiness = evaluateProductionReadiness(
    await deriveUlcLinzM5JProductionEvidence(repositoryRoot, VALID_ULC_DEFINITION, inputs, { now: NOW }),
  );
  assert.equal(readiness.productionReady, false);
  for (const id of ["auditSecurityLogging", "dataRegion", "dpa", "encryption", "subprocessors", "privilegedControlPlaneIsolation", "highPrivacyProfile"]) {
    assert.equal(criterionStatus(readiness, id), "open", id);
  }
});

test("M5-J requires a real restore-shaped High Privacy owner input", async () => {
  const inputs = completeOwnerInputs();
  inputs.backupRestoreEvidenceInput.restoreSucceeded = false;
  const readiness = evaluateProductionReadiness(
    await deriveUlcLinzM5JProductionEvidence(repositoryRoot, VALID_ULC_DEFINITION, inputs, { now: NOW }),
  );
  assert.equal(readiness.productionReady, false);
  assert.equal(criterionStatus(readiness, "highPrivacyProfile"), "open");
  assert.equal(criterionStatus(readiness, "dataRegion"), "verified");
});

test("M5-J rejects restore evidence outside the current production resource window", async () => {
  const inputs = completeOwnerInputs();
  inputs.backupRestoreEvidenceInput.restoreTestedAt = "2026-08-18T12:44:59.999Z";
  const readiness = evaluateProductionReadiness(
    await deriveUlcLinzM5JProductionEvidence(
      repositoryRoot,
      VALID_ULC_DEFINITION,
      inputs,
      { now: NOW },
    ),
  );
  assert.equal(readiness.productionReady, false);
  assert.equal(criterionStatus(readiness, "highPrivacyProfile"), "open");
  assert.equal(criterionStatus(readiness, "dataRegion"), "verified");
});

test("M5-J rejects cross-app and runtime-drift provider evidence", async () => {
  const crossApp = completeOwnerInputs();
  crossApp.providerBoundEvidenceInput.complianceEvidence.application = "reference";
  let readiness = evaluateProductionReadiness(
    await deriveUlcLinzM5JProductionEvidence(repositoryRoot, VALID_ULC_DEFINITION, crossApp, { now: NOW }),
  );
  assert.equal(readiness.productionReady, false);
  assert.equal(criterionStatus(readiness, "dataRegion"), "open");

  const drift = completeOwnerInputs();
  drift.providerBoundEvidenceInput.resourceBindingEvidence.runtime.contractDigest = `sha256:${"0".repeat(64)}`;
  readiness = evaluateProductionReadiness(
    await deriveUlcLinzM5JProductionEvidence(repositoryRoot, VALID_ULC_DEFINITION, drift, { now: NOW }),
  );
  assert.equal(readiness.productionReady, false);
  assert.equal(criterionStatus(readiness, "dataRegion"), "open");
});

test("M5-J never reuses ULC evidence for another app", async () => {
  const evidence = await deriveUlcLinzM5JProductionEvidence(
    repositoryRoot,
    { ...VALID_ULC_DEFINITION, appId: "reference", displayName: "Reference" },
    completeOwnerInputs(),
    { now: NOW },
  );
  assert.deepEqual(evidence, {});
});

test("Factory snapshot consumes M5-J while release production remains separately locked", async () => {
  const snapshot = await loadFactorySnapshot(repositoryRoot, {
    ulcLinzM5JOwnerInputs: completeOwnerInputs(),
    m5EvidenceNow: NOW,
    m3PreviewAcceptanceFetchImpl: async () =>
      new Response("{}", { status: 503, headers: { "content-type": "application/json" } }),
  });
  const ulc = snapshot.apps.find((app) => app.appId === "ulc-linz");
  assert.ok(ulc);
  assert.equal(ulc.productionReadiness.productionReady, true);
  assert.equal(ulc.productionReadiness.verifiedCount, 12);
  assert.equal(ulc.productionReleaseReadiness.releaseAuthorized, false);
  assert.equal(snapshot.capabilities.releaseProduction, false);
});
