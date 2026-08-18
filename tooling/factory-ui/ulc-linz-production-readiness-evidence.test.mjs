import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  deriveUlcLinzM5GResourceBindingFingerprint,
} from "../ulc-linz-m5-provider-bound-evidence.mjs";
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
    const evidence = {};
    for (const criterionId of entry.criteria) evidence[criterionId] = true;
    owners[entry.owner] = evidence;
  }
  return owners;
}

function legalEntry({
  provider,
  documentType,
  canonicalSource,
  accountSpecific = false,
  publicBaseline = true,
  transferModelConsistentWithAdr022 = null,
}) {
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
    legalEntry({
      provider: "cloudflare",
      documentType: "dpa",
      canonicalSource: "https://www.cloudflare.com/cloudflare-customer-dpa/",
    }),
    legalEntry({
      provider: "cloudflare",
      documentType: "dpa-account-binding",
      canonicalSource: "https://dash.cloudflare.com/",
      accountSpecific: true,
      publicBaseline: false,
    }),
    legalEntry({
      provider: "neon-databricks",
      documentType: "terms",
      canonicalSource: "https://neon.com/platform-terms",
    }),
    legalEntry({
      provider: "neon-databricks",
      documentType: "dpa",
      canonicalSource: "https://www.databricks.com/legal/data-processing-addendum",
    }),
    legalEntry({
      provider: "neon-databricks",
      documentType: "dpa-account-binding",
      canonicalSource: "https://console.neon.tech/",
      accountSpecific: true,
      publicBaseline: false,
    }),
    legalEntry({
      provider: "cloudflare",
      documentType: "subprocessors",
      canonicalSource: "https://www.cloudflare.com/cloudflare-subprocessors/",
      transferModelConsistentWithAdr022: true,
    }),
    legalEntry({
      provider: "neon-databricks",
      documentType: "subprocessors",
      canonicalSource: "https://www.databricks.com/legal/subprocessors",
      transferModelConsistentWithAdr022: true,
    }),
    legalEntry({
      provider: "cloudflare",
      documentType: "security",
      canonicalSource: "https://developers.cloudflare.com/ssl/",
    }),
    legalEntry({
      provider: "neon-databricks",
      documentType: "security",
      canonicalSource: "https://neon.com/docs/security/security-overview",
    }),
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
      {
        from: "ulc-linz-user",
        to: "cloudflare",
        purpose: "application-request-processing",
        status: "verified",
      },
      {
        from: "cloudflare",
        to: "neon-postgresql",
        purpose: "application-persistence",
        status: "verified",
      },
      {
        from: "appbasis-control-plane",
        to: "cloudflare",
        purpose: "provider-evidence-read",
        status: "verified",
      },
      {
        from: "appbasis-control-plane",
        to: "neon-postgresql",
        purpose: "provider-evidence-read",
        status: "verified",
      },
      {
        from: "neon-postgresql",
        to: "neon-postgresql",
        purpose: "managed-backup-recovery",
        status: "verified",
      },
    ],
  };
}

function resourceBindingEvidence({
  observedAt = OBSERVED_AT,
  validUntilOrReviewAt = VALID_UNTIL,
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
      databaseBindingId: "opaque-neon-database",
      region: "aws-eu-central-1",
      regionSource: "provider-api",
      identitySource: "provider-api",
      dedicatedProductionResource: true,
    },
    cloudflare: {
      accountBindingId: "opaque-account",
      runtimeBindingId: "opaque-worker",
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

function providerBoundEvidenceInput(resource = resourceBindingEvidence()) {
  return {
    resourceBindingEvidence: resource,
    complianceEvidence: complianceEvidence(),
    complianceResourceBindingFingerprint:
      deriveUlcLinzM5GResourceBindingFingerprint(resource, { now: NOW }),
  };
}

function controlPlaneEvidenceInput(resource = resourceBindingEvidence()) {
  return {
    resourceBindingEvidence: resource,
    controlPlaneEvidence: {
      schemaVersion: 1,
      application: "ulc-linz",
      environment: "production",
      observedAt: resource.observedAt,
      validUntilOrReviewAt: resource.validUntilOrReviewAt,
      provider: "cloudflare",
      providerAccountBindingId: resource.cloudflare.accountBindingId,
      publicRuntimeBindingId: resource.cloudflare.runtimeBindingId,
      inventorySource: "provider-api",
      privilegedComponentInventoryComplete: true,
      publicRuntimeBindingInventoryComplete: true,
      privilegedComponents: [],
    },
  };
}

function completeOwnerInputs() {
  return {
    auditSecurityLoggingEvidence: { auditSecurityLogging: true },
    providerBoundEvidenceInput: providerBoundEvidenceInput(),
    controlPlaneEvidenceInput: controlPlaneEvidenceInput(),
    backupRestoreEvidence: { backupRestoreBeforeProduction: true },
    leastPrivilegeEvidence: { leastPrivilege: true },
    operatorUseCaseAssessmentEvidence: { operatorUseCaseAssessment: true },
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
  assert.deepEqual(
    new Set(assigned),
    new Set(REQUIRED_PRODUCTION_READINESS_CRITERIA.map(({ id }) => id)),
  );

  assert.equal(
    isUlcLinzM5JOwnerMatrixComplete([
      ...REQUIRED_PRODUCTION_READINESS_CRITERIA,
      { id: "futureCriterion", label: "Future" },
    ]),
    false,
  );
});

test("M5-J deterministic composition reaches Production Ready only with all twelve owner criteria", () => {
  const evidence = composeUlcLinzM5JProductionEvidence(ownerEvidenceAllTrue());
  const readiness = evaluateProductionReadiness(evidence);

  assert.equal(readiness.productionReady, true);
  assert.equal(readiness.verifiedCount, 12);
  assert.deepEqual(
    Object.keys(evidence),
    REQUIRED_PRODUCTION_READINESS_CRITERIA.map(({ id }) => id),
  );
});

test("M5-J blocks Production Ready when each required criterion is removed one at a time", () => {
  for (const criterion of REQUIRED_PRODUCTION_READINESS_CRITERIA) {
    const owners = ownerEvidenceAllTrue();
    const entry = ULC_LINZ_M5_J_OWNER_MATRIX.find(({ criteria }) =>
      criteria.includes(criterion.id),
    );
    assert.ok(entry);
    delete owners[entry.owner][criterion.id];

    const readiness = evaluateProductionReadiness(
      composeUlcLinzM5JProductionEvidence(owners),
    );
    assert.equal(readiness.productionReady, false, criterion.id);
    assert.equal(readiness.verifiedCount, 11, criterion.id);
    assert.equal(criterionStatus(readiness, criterion.id), "open", criterion.id);
  }
});

test("M5-J never lets unexpected keys or a second owner overwrite criterion ownership", () => {
  const owners = ownerEvidenceAllTrue();
  owners.repository.rolesAndPermissions = true;
  const readiness = evaluateProductionReadiness(
    composeUlcLinzM5JProductionEvidence(owners),
  );

  assert.equal(readiness.productionReady, false);
  assert.equal(criterionStatus(readiness, "secretsOutsideAppManifests"), "open");
  assert.equal(criterionStatus(readiness, "rolesAndPermissions"), "verified");

  const withUnknownOwner = ownerEvidenceAllTrue();
  withUnknownOwner.unexpectedOwner = { dataRegion: true };
  assert.deepEqual(composeUlcLinzM5JProductionEvidence(withUnknownOwner), {});
});

test("M5-J treats false, truthy non-booleans, accessors, symbols and inherited owner evidence as open", () => {
  const falseOwners = ownerEvidenceAllTrue();
  falseOwners.providerCompliance.dataRegion = false;
  let readiness = evaluateProductionReadiness(
    composeUlcLinzM5JProductionEvidence(falseOwners),
  );
  assert.equal(readiness.productionReady, false);
  assert.equal(criterionStatus(readiness, "dataRegion"), "open");
  assert.equal(criterionStatus(readiness, "dpa"), "verified");

  const stringOwners = ownerEvidenceAllTrue();
  stringOwners.providerCompliance.dataRegion = "true";
  readiness = evaluateProductionReadiness(
    composeUlcLinzM5JProductionEvidence(stringOwners),
  );
  assert.equal(criterionStatus(readiness, "dataRegion"), "open");
  assert.equal(criterionStatus(readiness, "dpa"), "verified");

  const accessorOwners = ownerEvidenceAllTrue();
  let getterCalls = 0;
  Object.defineProperty(accessorOwners.providerCompliance, "dataRegion", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return true;
    },
  });
  readiness = evaluateProductionReadiness(
    composeUlcLinzM5JProductionEvidence(accessorOwners),
  );
  assert.equal(getterCalls, 0);
  assert.equal(criterionStatus(readiness, "dataRegion"), "open");
  assert.equal(criterionStatus(readiness, "dpa"), "open");

  const symbolOwners = ownerEvidenceAllTrue();
  symbolOwners.lifecycle[Symbol("hidden")] = true;
  readiness = evaluateProductionReadiness(
    composeUlcLinzM5JProductionEvidence(symbolOwners),
  );
  assert.equal(criterionStatus(readiness, "deletionConcept"), "open");
  assert.equal(criterionStatus(readiness, "retention"), "open");

  const inheritedOwners = ownerEvidenceAllTrue();
  inheritedOwners.dataExport = Object.create({ dataExport: true });
  readiness = evaluateProductionReadiness(
    composeUlcLinzM5JProductionEvidence(inheritedOwners),
  );
  assert.equal(criterionStatus(readiness, "dataExport"), "open");
});

test("M5-J owner integration can produce all twelve only from the current B-I contracts plus explicit external owner outputs", async () => {
  const evidence = await deriveUlcLinzM5JProductionEvidence(
    repositoryRoot,
    VALID_ULC_DEFINITION,
    completeOwnerInputs(),
    { now: NOW },
  );
  const readiness = evaluateProductionReadiness(evidence);

  assert.equal(readiness.productionReady, true);
  assert.equal(readiness.verifiedCount, 12);
  assert.equal(Object.isFrozen(evidence), true);
});

test("M5-J rejects cross-app provider evidence and keeps High Privacy open", async () => {
  const inputs = completeOwnerInputs();
  inputs.providerBoundEvidenceInput.complianceEvidence.application = "reference";

  const readiness = evaluateProductionReadiness(
    await deriveUlcLinzM5JProductionEvidence(
      repositoryRoot,
      VALID_ULC_DEFINITION,
      inputs,
      { now: NOW },
    ),
  );

  assert.equal(readiness.productionReady, false);
  for (const id of ["dataRegion", "dpa", "encryption", "subprocessors", "highPrivacyProfile"]) {
    assert.equal(criterionStatus(readiness, id), "open", id);
  }
});

test("M5-J rejects stale H evidence independently and keeps Production Ready false", async () => {
  const inputs = completeOwnerInputs();
  const staleResource = resourceBindingEvidence({
    observedAt: "2026-08-17T12:50:00.000Z",
    validUntilOrReviewAt: "2026-08-19T12:50:00.000Z",
  });
  inputs.controlPlaneEvidenceInput = controlPlaneEvidenceInput(staleResource);

  const readiness = evaluateProductionReadiness(
    await deriveUlcLinzM5JProductionEvidence(
      repositoryRoot,
      VALID_ULC_DEFINITION,
      inputs,
      { now: NOW },
    ),
  );

  assert.equal(readiness.productionReady, false);
  assert.equal(criterionStatus(readiness, "privilegedControlPlaneIsolation"), "open");
  assert.equal(criterionStatus(readiness, "highPrivacyProfile"), "open");
});

test("M5-J rejects runtime-contract drift in provider evidence", async () => {
  const inputs = completeOwnerInputs();
  inputs.providerBoundEvidenceInput.resourceBindingEvidence.runtime.contractDigest =
    `sha256:${"0".repeat(64)}`;

  const readiness = evaluateProductionReadiness(
    await deriveUlcLinzM5JProductionEvidence(
      repositoryRoot,
      VALID_ULC_DEFINITION,
      inputs,
      { now: NOW },
    ),
  );

  assert.equal(readiness.productionReady, false);
  assert.equal(criterionStatus(readiness, "dataRegion"), "open");
  assert.equal(criterionStatus(readiness, "highPrivacyProfile"), "open");
});

test("M5-J never reuses ULC evidence for another app", async () => {
  const evidence = await deriveUlcLinzM5JProductionEvidence(
    repositoryRoot,
    {
      ...VALID_ULC_DEFINITION,
      appId: "reference",
      displayName: "Reference",
    },
    completeOwnerInputs(),
    { now: NOW },
  );
  assert.deepEqual(evidence, {});
  assert.equal(evaluateProductionReadiness(evidence).productionReady, false);
});

test("Factory snapshot consumes M5-J while release production remains a separate locked gate", async () => {
  const snapshot = await loadFactorySnapshot(repositoryRoot, {
    ulcLinzM5JOwnerInputs: completeOwnerInputs(),
    m5EvidenceNow: NOW,
    m3PreviewAcceptanceFetchImpl: async () =>
      new Response("{}", {
        status: 503,
        headers: { "content-type": "application/json" },
      }),
  });
  const ulc = snapshot.apps.find((app) => app.appId === "ulc-linz");
  assert.ok(ulc);
  assert.equal(ulc.productionReadiness.productionReady, true);
  assert.equal(ulc.productionReadiness.verifiedCount, 12);
  assert.equal(ulc.productionReleaseReadiness.releaseAuthorized, false);
  assert.equal(snapshot.capabilities.releaseProduction, false);
});
