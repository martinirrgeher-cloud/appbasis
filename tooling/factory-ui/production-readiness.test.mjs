import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  HIGH_PRIVACY_PROFILE,
  isCanonicalHighPrivacyProfile,
} from "./high-privacy-profile.mjs";
import { loadFactorySnapshot } from "./model.mjs";
import {
  evaluateProductionReadiness,
  REQUIRED_PRODUCTION_READINESS_CRITERIA,
} from "./production-readiness.mjs";
import { deriveRepositoryProductionReadinessEvidence } from "./repository-production-readiness-evidence.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const expectedIds = [
  "dataRegion",
  "dpa",
  "encryption",
  "rolesAndPermissions",
  "deletionConcept",
  "retention",
  "dataExport",
  "auditSecurityLogging",
  "subprocessors",
  "highPrivacyProfile",
  "secretsOutsideAppManifests",
  "privilegedControlPlaneIsolation",
];

test("M5 gate contains every required production security and privacy criterion", () => {
  assert.deepEqual(
    REQUIRED_PRODUCTION_READINESS_CRITERIA.map((criterion) => criterion.id),
    expectedIds,
  );
});

test("M5 high privacy profile is canonical and fails closed on contract drift", () => {
  assert.deepEqual(HIGH_PRIVACY_PROFILE, {
    schemaVersion: 1,
    id: "appbasis-high-privacy-v0.1",
    appliesTo: ["children", "school", "sensitive-data"],
    requirements: {
      securityPrivacyGate: "all-required",
      backupRestoreBeforeProduction: "required",
      accessControl: "deny-by-default",
      privilegeModel: "least-privilege",
      secretsInNormalAppManifest: "forbidden",
      privilegedControlPlanePublicIngress: "forbidden",
      operatorUseCaseAssessment: "required",
    },
  });
  assert.equal(isCanonicalHighPrivacyProfile(), true);
  assert.equal(Object.isFrozen(HIGH_PRIVACY_PROFILE), true);
  assert.equal(Object.isFrozen(HIGH_PRIVACY_PROFILE.appliesTo), true);
  assert.equal(Object.isFrozen(HIGH_PRIVACY_PROFILE.requirements), true);

  assert.equal(
    isCanonicalHighPrivacyProfile({
      ...HIGH_PRIVACY_PROFILE,
      appliesTo: ["children", "school"],
    }),
    false,
  );
  assert.equal(
    isCanonicalHighPrivacyProfile({
      ...HIGH_PRIVACY_PROFILE,
      requirements: {
        ...HIGH_PRIVACY_PROFILE.requirements,
        privilegedControlPlanePublicIngress: "allowed",
      },
    }),
    false,
  );
  assert.equal(
    isCanonicalHighPrivacyProfile({
      ...HIGH_PRIVACY_PROFILE,
      futureRequirement: true,
    }),
    false,
  );
});

test("M5 high privacy profile rejects boxed, accessor and serialization-shaped values", () => {
  const base = structuredClone(HIGH_PRIVACY_PROFILE);

  assert.equal(
    isCanonicalHighPrivacyProfile({
      ...base,
      schemaVersion: new Number(1),
    }),
    false,
  );
  assert.equal(
    isCanonicalHighPrivacyProfile({
      ...base,
      id: new String("appbasis-high-privacy-v0.1"),
    }),
    false,
  );
  assert.equal(
    isCanonicalHighPrivacyProfile({
      ...base,
      appliesTo: [new String("children"), "school", "sensitive-data"],
    }),
    false,
  );
  assert.equal(
    isCanonicalHighPrivacyProfile({
      ...base,
      requirements: {
        ...base.requirements,
        accessControl: new String("deny-by-default"),
      },
    }),
    false,
  );

  const withToJson = structuredClone(base);
  withToJson.toJSON = () => structuredClone(HIGH_PRIVACY_PROFILE);
  assert.equal(isCanonicalHighPrivacyProfile(withToJson), false);

  const withSymbol = structuredClone(base);
  withSymbol[Symbol("extra")] = true;
  assert.equal(isCanonicalHighPrivacyProfile(withSymbol), false);

  const withAccessor = structuredClone(base);
  Object.defineProperty(withAccessor, "id", {
    enumerable: true,
    configurable: true,
    get() {
      return "appbasis-high-privacy-v0.1";
    },
  });
  assert.equal(isCanonicalHighPrivacyProfile(withAccessor), false);

  const withNonEnumerableProfileField = structuredClone(base);
  Object.defineProperty(withNonEnumerableProfileField, "id", {
    enumerable: false,
    configurable: true,
    writable: true,
    value: "appbasis-high-privacy-v0.1",
  });
  assert.equal(isCanonicalHighPrivacyProfile(withNonEnumerableProfileField), false);

  const withNonEnumerableRequirement = structuredClone(base);
  Object.defineProperty(withNonEnumerableRequirement.requirements, "accessControl", {
    enumerable: false,
    configurable: true,
    writable: true,
    value: "deny-by-default",
  });
  assert.equal(isCanonicalHighPrivacyProfile(withNonEnumerableRequirement), false);

  const appliesToWithExtraProperty = [...base.appliesTo];
  appliesToWithExtraProperty.extra = true;
  assert.equal(
    isCanonicalHighPrivacyProfile({
      ...base,
      appliesTo: appliesToWithExtraProperty,
    }),
    false,
  );

  const appliesToWithNonEnumerableEntry = [...base.appliesTo];
  Object.defineProperty(appliesToWithNonEnumerableEntry, "0", {
    enumerable: false,
    configurable: true,
    writable: true,
    value: "children",
  });
  assert.equal(
    isCanonicalHighPrivacyProfile({
      ...base,
      appliesTo: appliesToWithNonEnumerableEntry,
    }),
    false,
  );
});

test("M5 gate is blocked when no production evidence is supplied", () => {
  const readiness = evaluateProductionReadiness();

  assert.equal(readiness.status, "blocked");
  assert.equal(readiness.productionReady, false);
  assert.equal(readiness.verifiedCount, 0);
  assert.equal(readiness.requiredCount, expectedIds.length);
  assert.ok(readiness.criteria.every((criterion) => criterion.status === "open"));
});

test("M5 gate remains blocked when even one required criterion is not verified", () => {
  const evidence = Object.fromEntries(expectedIds.map((id) => [id, true]));
  evidence.subprocessors = false;

  const readiness = evaluateProductionReadiness(evidence);

  assert.equal(readiness.status, "blocked");
  assert.equal(readiness.productionReady, false);
  assert.equal(readiness.verifiedCount, expectedIds.length - 1);
  assert.equal(
    readiness.criteria.find((criterion) => criterion.id === "subprocessors")?.status,
    "open",
  );
});

test("M5 gate becomes ready only when every required criterion is explicitly true", () => {
  const evidence = Object.fromEntries(expectedIds.map((id) => [id, true]));
  const readiness = evaluateProductionReadiness(evidence);

  assert.equal(readiness.status, "ready");
  assert.equal(readiness.productionReady, true);
  assert.equal(readiness.verifiedCount, expectedIds.length);
  assert.ok(readiness.criteria.every((criterion) => criterion.status === "verified"));
});

test("truthy strings, unknown keys and malformed evidence cannot unlock M5", () => {
  const almost = Object.fromEntries(expectedIds.map((id) => [id, true]));
  almost.highPrivacyProfile = "yes";
  almost.productionReady = true;

  const readiness = evaluateProductionReadiness(almost);
  assert.equal(readiness.productionReady, false);
  assert.equal(
    readiness.criteria.find((criterion) => criterion.id === "highPrivacyProfile")?.status,
    "open",
  );

  assert.throws(
    () => evaluateProductionReadiness([]),
    /Production readiness evidence must be a plain object/,
  );
  assert.throws(
    () => evaluateProductionReadiness(null),
    /Production readiness evidence must be a plain object/,
  );
});

test("inherited readiness values cannot count as production evidence", () => {
  const ownEvidence = Object.fromEntries(expectedIds.map((id) => [id, true]));
  delete ownEvidence.highPrivacyProfile;
  Object.defineProperty(Object.prototype, "highPrivacyProfile", {
    configurable: true,
    enumerable: false,
    value: true,
  });

  try {
    const readiness = evaluateProductionReadiness(ownEvidence);
    assert.equal(readiness.productionReady, false);
    assert.equal(readiness.verifiedCount, expectedIds.length - 1);
    assert.equal(
      readiness.criteria.find((criterion) => criterion.id === "highPrivacyProfile")?.status,
      "open",
    );
  } finally {
    delete Object.prototype.highPrivacyProfile;
  }
});

test("repository evidence does not infer app-specific high privacy binding", () => {
  const definition = Object.freeze({
    schemaVersion: 2,
    appId: "privacy-evidence-test",
    displayName: "Privacy Evidence Test",
    modules: Object.freeze([]),
    platformServices: Object.freeze([]),
  });

  assert.deepEqual(deriveRepositoryProductionReadinessEvidence(definition), {
    secretsOutsideAppManifests: true,
  });

  assert.throws(
    () =>
      deriveRepositoryProductionReadinessEvidence({
        ...definition,
        databaseUrl: "postgres://must-not-be-accepted",
      }),
    /Unknown app definition field: databaseUrl/,
  );
});

test("Factory snapshot keeps operational lifecycle and high privacy evidence open without production activation", async () => {
  const snapshot = await loadFactorySnapshot(repositoryRoot);

  assert.ok(snapshot.apps.length > 0);
  for (const app of snapshot.apps) {
    const isUlcLinz = app.appId === "ulc-linz";
    assert.equal(app.productionReadiness.status, "blocked");
    assert.equal(app.productionReadiness.productionReady, false);
    assert.equal(app.productionReadiness.verifiedCount, isUlcLinz ? 2 : 1);
    assert.equal(app.productionReadiness.requiredCount, expectedIds.length);
    assert.deepEqual(
      app.productionReadiness.criteria.map((criterion) => criterion.id),
      expectedIds,
    );
    assert.equal(
      app.productionReadiness.criteria.find(
        (criterion) => criterion.id === "secretsOutsideAppManifests",
      )?.status,
      "verified",
    );
    assert.equal(
      app.productionReadiness.criteria.find(
        (criterion) => criterion.id === "rolesAndPermissions",
      )?.status,
      isUlcLinz ? "verified" : "open",
    );
    assert.equal(
      app.productionReadiness.criteria.find(
        (criterion) => criterion.id === "deletionConcept",
      )?.status,
      "open",
    );
    assert.equal(
      app.productionReadiness.criteria.find(
        (criterion) => criterion.id === "retention",
      )?.status,
      "open",
    );
    assert.equal(
      app.productionReadiness.criteria.find(
        (criterion) => criterion.id === "highPrivacyProfile",
      )?.status,
      "open",
    );
    assert.ok(
      app.productionReadiness.criteria
        .filter(
          (criterion) =>
            criterion.id !== "secretsOutsideAppManifests" &&
            (!isUlcLinz || criterion.id !== "rolesAndPermissions"),
        )
        .every((criterion) => criterion.status === "open"),
    );
  }
  assert.equal(snapshot.capabilities.releaseProduction, false);
});