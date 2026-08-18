import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveUlcLinzM5HControlPlaneEvidence,
} from "./ulc-linz-m5-control-plane-evidence.mjs";
import {
  ULC_LINZ_M6_PRODUCTION_RUNTIME_CONTRACT_DIGEST,
} from "./ulc-linz-m6-production-resource-binding.mjs";

const NOW = new Date("2026-08-18T05:30:00.000Z");

function validResourceBindingEvidence() {
  return {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    observedAt: "2026-08-18T05:25:00.000Z",
    validUntilOrReviewAt: "2026-08-18T06:25:00.000Z",
    runtime: {
      entrypoint: "./worker/index.ts",
      contractDigest: ULC_LINZ_M6_PRODUCTION_RUNTIME_CONTRACT_DIGEST,
      providerModel: "standard-workers-global-transient",
      euOnly: false,
    },
    neon: {
      projectBindingId: "project-ulc-production-1",
      branchBindingId: "branch-ulc-production-1",
      databaseBindingId: "database-ulc-production-1",
      region: "aws-eu-central-1",
      regionSource: "provider-api",
      identitySource: "provider-api",
      dedicatedProductionResource: true,
    },
    cloudflare: {
      accountBindingId: "account-1",
      runtimeBindingId: "worker-ulc-production-1",
      hostnameBinding: "ulc.example.test",
      databaseBindingId: "hyperdrive-ulc-production-1",
      identitySource: "provider-api",
      bindingInventoryComplete: true,
      telemetryInventoryComplete: true,
      unexpectedPersonalDataPersistence: false,
      dedicatedProductionResource: true,
    },
  };
}

function internalComponent(runtimeBindingId = "worker-ulc-admin-1") {
  return {
    runtimeBindingId,
    identitySource: "provider-api",
    dedicatedControlPlaneResource: true,
    publicIngress: {
      workersDevEnabled: false,
      previewUrlsEnabled: false,
      customDomainCount: 0,
      routeCount: 0,
    },
    internalServiceBinding: {
      sourceRuntimeBindingId: "worker-ulc-production-1",
      targetRuntimeBindingId: runtimeBindingId,
      identitySource: "provider-api",
      uniqueMatch: true,
    },
    publicFallbackPresent: false,
  };
}

function validControlPlaneEvidence(privilegedComponents = []) {
  return {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    observedAt: "2026-08-18T05:25:00.000Z",
    validUntilOrReviewAt: "2026-08-18T06:25:00.000Z",
    provider: "cloudflare",
    providerAccountBindingId: "account-1",
    publicRuntimeBindingId: "worker-ulc-production-1",
    inventorySource: "provider-api",
    privilegedComponentInventoryComplete: true,
    publicRuntimeBindingInventoryComplete: true,
    privilegedComponents,
  };
}

function derive({
  resourceBindingEvidence = validResourceBindingEvidence(),
  controlPlaneEvidence = validControlPlaneEvidence(),
  now = NOW,
} = {}) {
  return deriveUlcLinzM5HControlPlaneEvidence(
    { resourceBindingEvidence, controlPlaneEvidence },
    { now },
  );
}

test("verifies an exact complete empty privileged-component inventory without inventing a control-plane Worker", () => {
  const result = derive();

  assert.deepEqual(result, { privilegedControlPlaneIsolation: true });
  assert.ok(Object.isFrozen(result));
  assert.equal(JSON.stringify(result).includes("account-1"), false);
  assert.equal(JSON.stringify(result).includes("worker-ulc-production-1"), false);
});

test("verifies a privileged component only with no public ingress and one exact internal binding", () => {
  const result = derive({
    controlPlaneEvidence: validControlPlaneEvidence([internalComponent()]),
  });

  assert.deepEqual(result, { privilegedControlPlaneIsolation: true });
});

test("fails closed for every public ingress surface on a privileged component", () => {
  for (const mutate of [
    (component) => (component.publicIngress.workersDevEnabled = true),
    (component) => (component.publicIngress.previewUrlsEnabled = true),
    (component) => (component.publicIngress.customDomainCount = 1),
    (component) => (component.publicIngress.routeCount = 1),
  ]) {
    const component = internalComponent();
    mutate(component);
    assert.deepEqual(
      derive({
        controlPlaneEvidence: validControlPlaneEvidence([component]),
      }),
      {},
    );
  }
});

test("binds H to the exact ULC production account, public runtime and evidence window", () => {
  for (const mutate of [
    (evidence) => (evidence.application = "reference"),
    (evidence) => (evidence.environment = "preview"),
    (evidence) => (evidence.provider = "other"),
    (evidence) => (evidence.providerAccountBindingId = "account-2"),
    (evidence) => (evidence.publicRuntimeBindingId = "worker-other"),
    (evidence) => (evidence.observedAt = "2026-08-18T05:24:00.000Z"),
    (evidence) => (evidence.validUntilOrReviewAt = "2026-08-18T06:24:00.000Z"),
    (evidence) => (evidence.inventorySource = "repository-name"),
    (evidence) => (evidence.privilegedComponentInventoryComplete = false),
    (evidence) => (evidence.publicRuntimeBindingInventoryComplete = false),
  ]) {
    const evidence = validControlPlaneEvidence();
    mutate(evidence);
    assert.deepEqual(derive({ controlPlaneEvidence: evidence }), {});
  }
});

test("enforces the M5-H 24-hour freshness ceiling independently of a longer resource evidence validity", () => {
  const resourceBindingEvidence = validResourceBindingEvidence();
  resourceBindingEvidence.observedAt = "2026-08-17T05:30:00.000Z";
  resourceBindingEvidence.validUntilOrReviewAt = "2026-08-19T05:30:00.000Z";
  const controlPlaneEvidence = validControlPlaneEvidence();
  controlPlaneEvidence.observedAt = resourceBindingEvidence.observedAt;
  controlPlaneEvidence.validUntilOrReviewAt =
    resourceBindingEvidence.validUntilOrReviewAt;

  assert.deepEqual(
    derive({ resourceBindingEvidence, controlPlaneEvidence }),
    {},
  );
});

test("requires each privileged component to be distinct, dedicated and internally bound to the public runtime", () => {
  for (const mutate of [
    (component) => {
      component.runtimeBindingId = "worker-ulc-production-1";
      component.internalServiceBinding.targetRuntimeBindingId =
        component.runtimeBindingId;
    },
    (component) => (component.identitySource = "repository-name"),
    (component) => (component.dedicatedControlPlaneResource = false),
    (component) => (component.publicFallbackPresent = true),
    (component) =>
      (component.internalServiceBinding.sourceRuntimeBindingId = "worker-other"),
    (component) =>
      (component.internalServiceBinding.targetRuntimeBindingId = "worker-other"),
    (component) =>
      (component.internalServiceBinding.identitySource = "repository-name"),
    (component) => (component.internalServiceBinding.uniqueMatch = false),
  ]) {
    const component = internalComponent();
    mutate(component);
    assert.deepEqual(
      derive({
        controlPlaneEvidence: validControlPlaneEvidence([component]),
      }),
      {},
    );
  }

  const duplicate = internalComponent();
  assert.deepEqual(
    derive({
      controlPlaneEvidence: validControlPlaneEvidence([
        duplicate,
        internalComponent(duplicate.runtimeBindingId),
      ]),
    }),
    {},
  );
});

test("fails closed when the underlying production resource binding is not current or canonical", () => {
  const resourceBindingEvidence = validResourceBindingEvidence();
  resourceBindingEvidence.cloudflare.bindingInventoryComplete = false;
  assert.deepEqual(derive({ resourceBindingEvidence }), {});

  const wrongRuntime = validResourceBindingEvidence();
  wrongRuntime.runtime.contractDigest = `sha256:${"0".repeat(64)}`;
  assert.deepEqual(derive({ resourceBindingEvidence: wrongRuntime }), {});
});

test("rejects malformed, accessor-based, symbolic, inherited and decorated control-plane evidence", () => {
  const extra = validControlPlaneEvidence();
  extra.token = "must-not-be-accepted";
  assert.deepEqual(derive({ controlPlaneEvidence: extra }), {});

  const inherited = Object.create(validControlPlaneEvidence());
  assert.deepEqual(derive({ controlPlaneEvidence: inherited }), {});

  const symbolic = validControlPlaneEvidence();
  symbolic[Symbol("hidden")] = "value";
  assert.deepEqual(derive({ controlPlaneEvidence: symbolic }), {});

  let getterCalls = 0;
  const accessor = validControlPlaneEvidence();
  Object.defineProperty(accessor, "providerAccountBindingId", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "account-1";
    },
  });
  assert.deepEqual(derive({ controlPlaneEvidence: accessor }), {});
  assert.equal(getterCalls, 0);

  const decoratedArray = validControlPlaneEvidence([]);
  decoratedArray.privilegedComponents.extra = "not-allowed";
  assert.deepEqual(derive({ controlPlaneEvidence: decoratedArray }), {});

  const ingressExtra = internalComponent();
  ingressExtra.publicIngress.hostname = "admin.example.test";
  assert.deepEqual(
    derive({
      controlPlaneEvidence: validControlPlaneEvidence([ingressExtra]),
    }),
    {},
  );
});
