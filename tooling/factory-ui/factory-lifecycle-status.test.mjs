import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateProductionReadiness,
  REQUIRED_PRODUCTION_READINESS_CRITERIA,
} from "./production-readiness.mjs";
import {
  evaluateM6ProductionReleaseReadiness,
  REQUIRED_M6_PRODUCTION_RELEASE_CRITERIA,
} from "./production-release-readiness.mjs";
import {
  factoryLifecycleCopy,
  productionReleaseCriteriaCopy,
  productionReleaseReadinessCopy,
} from "./production-readiness-status.js";
import { startFactoryServer } from "./server.mjs";

function allM5Evidence() {
  return Object.fromEntries(
    REQUIRED_PRODUCTION_READINESS_CRITERIA.map((criterion) => [criterion.id, true]),
  );
}

function allM6Evidence() {
  return Object.fromEntries(
    REQUIRED_M6_PRODUCTION_RELEASE_CRITERIA.map((criterion) => [criterion.id, true]),
  );
}

function preparationEvidence(extra = {}) {
  return {
    previewAccepted: true,
    productionDatabaseReady: true,
    productionWorkerReady: true,
    productionUsersAndPermissionsReady: true,
    productionMigrationsApplied: true,
    productionDeploymentCompleted: true,
    ...extra,
  };
}

function repositoryReadyPreview() {
  return {
    status: "repository-ready",
    workerEntrypointPresent: true,
    packageManifestPresent: true,
    databaseManifestRequired: true,
    databaseManifestPresent: true,
  };
}

test("Factory M6 detail and summary share one fail-closed display state", () => {
  const preview = repositoryReadyPreview();
  const m5Open = evaluateProductionReadiness();
  const open = evaluateM6ProductionReleaseReadiness();
  assert.equal(productionReleaseCriteriaCopy(preview, m5Open, open).length, 10);
  assert.ok(
    productionReleaseCriteriaCopy(preview, m5Open, open).every(
      (criterion) => criterion.status === "open",
    ),
  );

  const previewAccepted = evaluateM6ProductionReleaseReadiness({ previewAccepted: true });
  assert.equal(
    productionReleaseCriteriaCopy(preview, m5Open, previewAccepted)[0].status,
    "verified",
  );
  assert.ok(
    productionReleaseCriteriaCopy(preview, m5Open, previewAccepted)
      .slice(1)
      .every((criterion) => criterion.status === "open"),
  );

  const structurallyInconsistent = { ...previewAccepted, releaseAuthorized: true };
  assert.ok(
    productionReleaseCriteriaCopy(preview, m5Open, structurallyInconsistent).every(
      (criterion) => criterion.status === "open",
    ),
  );
  assert.equal(
    productionReleaseReadinessCopy(preview, m5Open, structurallyInconsistent).heading,
    "M6 nicht verifiziert",
  );

  const orderingInconsistent = evaluateM6ProductionReleaseReadiness({
    previewAccepted: true,
    productionWorkerReady: true,
  });
  assert.ok(
    productionReleaseCriteriaCopy(preview, m5Open, orderingInconsistent).every(
      (criterion) => criterion.status === "open",
    ),
  );
  assert.equal(
    productionReleaseReadinessCopy(preview, m5Open, orderingInconsistent).heading,
    "M6 nicht verifiziert",
  );

  const crossGateDrift = evaluateM6ProductionReleaseReadiness(
    preparationEvidence({ backupRecoveryReady: true, securityPrivacyReady: true }),
  );
  assert.ok(
    productionReleaseCriteriaCopy(preview, m5Open, crossGateDrift).every(
      (criterion) => criterion.status === "open",
    ),
  );
  assert.equal(
    productionReleaseReadinessCopy(preview, m5Open, crossGateDrift).heading,
    "M6 nicht verifiziert",
  );

  const repositoryIncompletePreview = {
    ...preview,
    status: "repository-incomplete",
    workerEntrypointPresent: false,
  };
  const m5Ready = evaluateProductionReadiness(allM5Evidence());
  const completeM6 = evaluateM6ProductionReleaseReadiness(allM6Evidence());
  assert.ok(
    productionReleaseCriteriaCopy(repositoryIncompletePreview, m5Ready, completeM6).every(
      (criterion) => criterion.status === "open",
    ),
  );
  assert.equal(
    productionReleaseReadinessCopy(repositoryIncompletePreview, m5Ready, completeM6).heading,
    "M6 nicht verifiziert",
  );
});

test("Factory lifecycle follows ADR-024 preparation, readiness and release phases", () => {
  const preview = repositoryReadyPreview();
  const m5Open = evaluateProductionReadiness();

  const beforePreviewAcceptance = factoryLifecycleCopy(
    preview,
    m5Open,
    evaluateM6ProductionReleaseReadiness(),
  );
  assert.deepEqual(
    beforePreviewAcceptance.stages.map(({ label, state, heading }) => ({ label, state, heading })),
    [
      { label: "Repository", state: "complete", heading: "Erzeugt" },
      { label: "Preview", state: "current", heading: "Lokal vorbereitet" },
      { label: "Produktionsvorbereitung", state: "locked", heading: "Gesperrt" },
      { label: "Production Ready", state: "locked", heading: "Gesperrt" },
      { label: "Produktion freigeben", state: "locked", heading: "Gesperrt" },
    ],
  );
  assert.equal(beforePreviewAcceptance.nextStep.heading, "Preview erstellen und prüfen");

  const preparationStart = factoryLifecycleCopy(
    preview,
    m5Open,
    evaluateM6ProductionReleaseReadiness({ previewAccepted: true }),
  );
  assert.equal(preparationStart.stages[1].state, "complete");
  assert.equal(preparationStart.stages[2].state, "current");
  assert.equal(preparationStart.stages[2].heading, "Nach Einzelfreigabe");
  assert.equal(
    preparationStart.nextStep.heading,
    "Kontrollierte Produktionsvorbereitung vorbereiten",
  );
  assert.match(preparationStart.nextStep.detail, /Domain und Public Ingress bleiben geschlossen/);

  const preparationInProgress = factoryLifecycleCopy(
    preview,
    m5Open,
    evaluateM6ProductionReleaseReadiness({
      previewAccepted: true,
      productionDatabaseReady: true,
      productionWorkerReady: true,
    }),
  );
  assert.equal(preparationInProgress.stages[2].heading, "In Arbeit · nicht öffentlich");
  assert.equal(preparationInProgress.nextStep.heading, "Produktionsvorbereitung vervollständigen");
  assert.match(preparationInProgress.nextStep.detail, /Produktive Benutzer & Rechte/);
  assert.match(preparationInProgress.nextStep.detail, /Kontrollierte Produktionsmigrationen/);
  assert.match(preparationInProgress.nextStep.detail, /Produktions-Deploy abgeschlossen/);

  const missingProductionAccess = factoryLifecycleCopy(
    preview,
    m5Open,
    evaluateM6ProductionReleaseReadiness({
      previewAccepted: true,
      productionDatabaseReady: true,
      productionWorkerReady: true,
      productionMigrationsApplied: true,
      productionDeploymentCompleted: true,
    }),
  );
  assert.equal(missingProductionAccess.stages[2].state, "current");
  assert.equal(missingProductionAccess.nextStep.heading, "Produktionsvorbereitung vervollständigen");
  assert.match(missingProductionAccess.nextStep.detail, /Produktive Benutzer & Rechte/);

  const preparationComplete = factoryLifecycleCopy(
    preview,
    m5Open,
    evaluateM6ProductionReleaseReadiness(preparationEvidence()),
  );
  assert.equal(preparationComplete.stages[2].state, "complete");
  assert.equal(preparationComplete.stages[2].heading, "Vorbereitung abgeschlossen");
  assert.equal(preparationComplete.stages[3].state, "locked");
  assert.equal(preparationComplete.nextStep.heading, "M4/M5-Evidence abschließen");
  assert.match(preparationComplete.nextStep.detail, /Backup\/Recovery liegt vor dem finalen M5-Gate/);

  const m5Ready = evaluateProductionReadiness(allM5Evidence());
  const productionReadyInProgress = factoryLifecycleCopy(
    preview,
    m5Ready,
    evaluateM6ProductionReleaseReadiness(
      preparationEvidence({ backupRecoveryReady: true, securityPrivacyReady: true }),
    ),
  );
  assert.equal(productionReadyInProgress.stages[2].state, "complete");
  assert.equal(productionReadyInProgress.stages[3].state, "current");
  assert.equal(productionReadyInProgress.stages[3].heading, "8/10 geprüft");
  assert.equal(productionReadyInProgress.nextStep.heading, "Production Ready vervollständigen");

  const productionReady = factoryLifecycleCopy(
    preview,
    m5Ready,
    evaluateM6ProductionReleaseReadiness(allM6Evidence()),
  );
  assert.equal(productionReady.stages[3].state, "complete");
  assert.equal(productionReady.stages[3].heading, "Bereit");
  assert.equal(productionReady.stages[4].state, "current");
  assert.equal(productionReady.stages[4].heading, "Freigabe erforderlich");
  assert.equal(
    productionReady.nextStep.heading,
    "Ausdrückliche Produktionsfreigabe erforderlich",
  );
});

test("Factory lifecycle does not let M5 alone complete production preparation", () => {
  const lifecycle = factoryLifecycleCopy(
    repositoryReadyPreview(),
    evaluateProductionReadiness(allM5Evidence()),
    evaluateM6ProductionReleaseReadiness({
      previewAccepted: true,
      backupRecoveryReady: true,
      securityPrivacyReady: true,
    }),
  );

  assert.equal(lifecycle.nextStep.heading, "Readiness-Status klären");
  assert.equal(lifecycle.stages[2].state, "locked");
  assert.equal(lifecycle.stages[3].state, "locked");
});

test("Factory lifecycle rejects every out-of-order phase transition", () => {
  const preview = repositoryReadyPreview();
  const m5Open = evaluateProductionReadiness();
  const m5Ready = evaluateProductionReadiness(allM5Evidence());
  const cases = [
    {
      name: "worker before database",
      m5: m5Open,
      evidence: { previewAccepted: true, productionWorkerReady: true },
    },
    {
      name: "migrations before worker",
      m5: m5Open,
      evidence: {
        previewAccepted: true,
        productionDatabaseReady: true,
        productionMigrationsApplied: true,
      },
    },
    {
      name: "deployment before migrations",
      m5: m5Open,
      evidence: {
        previewAccepted: true,
        productionDatabaseReady: true,
        productionWorkerReady: true,
        productionDeploymentCompleted: true,
      },
    },
    {
      name: "users before deployment",
      m5: m5Open,
      evidence: {
        previewAccepted: true,
        productionDatabaseReady: true,
        productionWorkerReady: true,
        productionMigrationsApplied: true,
        productionUsersAndPermissionsReady: true,
      },
    },
    {
      name: "recovery before preparation completion",
      m5: m5Open,
      evidence: {
        previewAccepted: true,
        productionDatabaseReady: true,
        productionWorkerReady: true,
        productionMigrationsApplied: true,
        productionDeploymentCompleted: true,
        backupRecoveryReady: true,
      },
    },
    {
      name: "M5 before recovery",
      m5: m5Ready,
      evidence: preparationEvidence({ securityPrivacyReady: true }),
    },
    {
      name: "domain before M5",
      m5: m5Open,
      evidence: preparationEvidence({
        backupRecoveryReady: true,
        productionDomainReady: true,
      }),
    },
    {
      name: "domain before preparation completion",
      m5: m5Ready,
      evidence: {
        previewAccepted: true,
        productionDatabaseReady: true,
        productionWorkerReady: true,
        productionMigrationsApplied: true,
        productionDeploymentCompleted: true,
        backupRecoveryReady: true,
        securityPrivacyReady: true,
        productionDomainReady: true,
      },
    },
    {
      name: "smoke before domain",
      m5: m5Ready,
      evidence: preparationEvidence({
        backupRecoveryReady: true,
        securityPrivacyReady: true,
        postDeploySmokePassed: true,
      }),
    },
  ];

  for (const scenario of cases) {
    const releaseReadiness = evaluateM6ProductionReleaseReadiness(scenario.evidence);
    const lifecycle = factoryLifecycleCopy(preview, scenario.m5, releaseReadiness);
    assert.equal(
      lifecycle.nextStep.heading,
      "Readiness-Status klären",
      scenario.name,
    );
    assert.equal(lifecycle.stages[1].state, "current", scenario.name);
    assert.notEqual(lifecycle.stages[1].heading, "Geprüft", scenario.name);
    assert.equal(lifecycle.stages[2].state, "locked", scenario.name);
    assert.equal(lifecycle.stages[3].state, "locked", scenario.name);
    assert.equal(lifecycle.stages[4].state, "locked", scenario.name);
    assert.ok(
      productionReleaseCriteriaCopy(preview, scenario.m5, releaseReadiness).every(
        (criterion) => criterion.status === "open",
      ),
      scenario.name,
    );
    assert.equal(
      productionReleaseReadinessCopy(preview, scenario.m5, releaseReadiness).heading,
      "M6 nicht verifiziert",
      scenario.name,
    );
  }
});

test("Factory lifecycle blocks ambiguous preview and M5/M6 cross-gate drift", () => {
  const invalidPreview = {
    ...repositoryReadyPreview(),
    workerEntrypointPresent: false,
  };
  const previewStatus = factoryLifecycleCopy(
    invalidPreview,
    evaluateProductionReadiness(),
    evaluateM6ProductionReleaseReadiness(),
  );
  assert.equal(previewStatus.nextStep.heading, "Preview-Status klären");

  const repositoryIncompletePreview = {
    ...repositoryReadyPreview(),
    status: "repository-incomplete",
    workerEntrypointPresent: false,
  };
  const m5Ready = evaluateProductionReadiness(allM5Evidence());
  const completeM6 = evaluateM6ProductionReleaseReadiness(allM6Evidence());
  const staleCompleteEvidence = factoryLifecycleCopy(
    repositoryIncompletePreview,
    m5Ready,
    completeM6,
  );
  assert.equal(staleCompleteEvidence.stages[1].state, "current");
  assert.equal(staleCompleteEvidence.stages[1].heading, "Vorbereitung offen");
  assert.equal(staleCompleteEvidence.stages[2].state, "locked");
  assert.equal(staleCompleteEvidence.stages[3].state, "locked");
  assert.equal(staleCompleteEvidence.stages[4].state, "locked");
  assert.equal(staleCompleteEvidence.nextStep.heading, "Preview vorbereiten");
  assert.ok(
    productionReleaseCriteriaCopy(repositoryIncompletePreview, m5Ready, completeM6).every(
      (criterion) => criterion.status === "open",
    ),
  );

  const m5Open = evaluateProductionReadiness();
  const releaseClaimsM5 = evaluateM6ProductionReleaseReadiness(
    preparationEvidence({ backupRecoveryReady: true, securityPrivacyReady: true }),
  );
  const mismatch = factoryLifecycleCopy(
    repositoryReadyPreview(),
    m5Open,
    releaseClaimsM5,
  );
  assert.equal(mismatch.nextStep.heading, "Readiness-Status klären");
  assert.equal(mismatch.stages[1].state, "current");
  assert.notEqual(mismatch.stages[1].heading, "Geprüft");
  assert.equal(mismatch.stages[2].state, "locked");
  assert.equal(mismatch.stages[3].state, "locked");
  assert.equal(mismatch.stages[4].state, "locked");
  assert.ok(
    productionReleaseCriteriaCopy(repositoryReadyPreview(), m5Open, releaseClaimsM5).every(
      (criterion) => criterion.status === "open",
    ),
  );
});

test("Factory UI renders M5, Production Ready and release as separate read-only boundaries", async (t) => {
  const server = await startFactoryServer({ port: 0 });
  t.after(
    () =>
      new Promise((resolveClose, rejectClose) => {
        server.close((error) => (error ? rejectClose(error) : resolveClose()));
      }),
  );

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const helperResponse = await fetch(`${baseUrl}/production-readiness-status.js`);
  assert.equal(helperResponse.status, 200);
  const helperBody = await helperResponse.text();
  assert.doesNotMatch(helperBody, /fetch\(/);
  assert.doesNotMatch(helperBody, /addEventListener/);
  assert.match(helperBody, /Produktionsvorbereitung/);
  assert.match(helperBody, /factoryLifecycleCopy/);
  assert.match(helperBody, /releaseAuthorized !== false/);
  assert.match(helperBody, /!productionWorkerReady \|\| productionDatabaseReady/);
  assert.match(helperBody, /!productionMigrationsApplied \|\| productionWorkerReady/);
  assert.match(helperBody, /!productionDeploymentCompleted \|\| productionMigrationsApplied/);
  assert.match(helperBody, /!productionUsersAndPermissionsReady \|\| productionDeploymentCompleted/);
  assert.match(helperBody, /isConsistentM6CriterionOrdering/);
  assert.match(helperBody, /isConsistentM6DisplaySnapshot/);
  assert.match(helperBody, /productionDomainReady/);
  assert.match(helperBody, /preparationEvidenceComplete/);

  const appResponse = await fetch(`${baseUrl}/app.js`);
  assert.equal(appResponse.status, 200);
  const appBody = await appResponse.text();
  assert.match(appBody, /Security & Privacy Ready/);
  assert.match(appBody, /Production Ready ·/);
  assert.match(appBody, /Nächster sicherer Schritt:/);
  assert.match(
    appBody,
    /renderPreviewReadiness\(\s*app\.previewReadiness,\s*app\.productionReadiness,\s*app\.productionReleaseReadiness,\s*\)/,
  );
  assert.match(
    appBody,
    /productionReleaseReadinessCopy\(\s*previewReadiness,\s*readiness,\s*releaseReadiness,\s*\)/,
  );
  assert.match(appBody, /Preview wurde im aktuellen M6-Snapshot abgenommen/);
  assert.doesNotMatch(appBody, /releaseProduction\s*\(/);

  const snapshotResponse = await fetch(`${baseUrl}/api/factory/snapshot`);
  assert.equal(snapshotResponse.status, 200);
  const snapshot = await snapshotResponse.json();
  assert.equal(snapshot.capabilities.releaseProduction, false);
  assert.ok(snapshot.apps.every((app) => app.productionReleaseReadiness?.releaseAuthorized === false));
});