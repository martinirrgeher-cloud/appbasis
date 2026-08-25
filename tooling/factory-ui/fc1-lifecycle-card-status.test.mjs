import assert from "node:assert/strict";
import test from "node:test";

import { factoryLifecycleCardCopy } from "./fc1-lifecycle-card-status.mjs";
import {
  evaluateProductionReadiness,
  REQUIRED_PRODUCTION_READINESS_CRITERIA,
} from "./production-readiness.mjs";
import {
  evaluateM6ProductionReleaseReadiness,
  REQUIRED_M6_PRODUCTION_RELEASE_CRITERIA,
} from "./production-release-readiness.mjs";

function repositoryReadyPreview() {
  return {
    status: "repository-ready",
    workerEntrypointPresent: true,
    packageManifestPresent: true,
    databaseManifestRequired: true,
    databaseManifestPresent: true,
  };
}

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

function completedProductionPreparationEvidence() {
  return {
    previewAccepted: true,
    productionDatabaseReady: true,
    productionWorkerReady: true,
    productionMigrationsApplied: true,
    productionDeploymentCompleted: true,
    productionUsersAndPermissionsReady: true,
  };
}

test("FC1 card status reuses the canonical Factory lifecycle before preview acceptance", () => {
  const copy = factoryLifecycleCardCopy(
    repositoryReadyPreview(),
    evaluateProductionReadiness(),
    evaluateM6ProductionReleaseReadiness(),
  );

  assert.deepEqual(copy, {
    stageId: "preview",
    label: "Preview",
    heading: "Lokal vorbereitet",
    nextStep: "Preview erstellen und prüfen",
    detail: "Als Nächstes den getrennten Preview-Pfad verwenden und die Preview abnehmen. Diese Ansicht startet noch kein Deployment.",
  });
});

test("FC1 card status surfaces controlled production preparation without authorizing public release", () => {
  const copy = factoryLifecycleCardCopy(
    repositoryReadyPreview(),
    evaluateProductionReadiness(),
    evaluateM6ProductionReleaseReadiness({
      previewAccepted: true,
      productionDatabaseReady: true,
    }),
  );

  assert.equal(copy.stageId, "production-preparation");
  assert.equal(copy.label, "Produktionsvorbereitung");
  assert.equal(copy.heading, "In Arbeit · nicht öffentlich");
  assert.equal(copy.nextStep, "Produktionsvorbereitung vervollständigen");
  assert.match(copy.detail, /freigabepflichtig/);
  assert.match(copy.detail, /Public Ingress bleiben geschlossen/);
});

test("FC1 card status preserves the canonical post-preparation M5 transition", () => {
  const copy = factoryLifecycleCardCopy(
    repositoryReadyPreview(),
    evaluateProductionReadiness(),
    evaluateM6ProductionReleaseReadiness(completedProductionPreparationEvidence()),
  );
  const expectedOpenM5Labels = REQUIRED_PRODUCTION_READINESS_CRITERIA
    .map((criterion) => criterion.label)
    .join(" · ");

  assert.deepEqual(copy, {
    stageId: "production-ready",
    label: "Production Ready",
    heading: "Gesperrt",
    nextStep: "M4/M5-Evidence abschließen",
    detail: `M5 noch offen: ${expectedOpenM5Labels}. Backup/Recovery liegt vor dem finalen M5-Gate; Domain und Public Ingress bleiben bis M4 + M5 geschlossen.`,
  });
});

test("FC1 card status reaches only the explicit release gate after complete technical evidence", () => {
  const copy = factoryLifecycleCardCopy(
    repositoryReadyPreview(),
    evaluateProductionReadiness(allM5Evidence()),
    evaluateM6ProductionReleaseReadiness(allM6Evidence()),
  );

  assert.deepEqual(copy, {
    stageId: "production-release",
    label: "Produktion freigeben",
    heading: "Freigabe erforderlich",
    nextStep: "Ausdrückliche Produktionsfreigabe erforderlich",
    detail: "Production Ready ist technisch erreicht. Diese Oberfläche hat bewusst keinen Produktionsbutton; die Freigabe bleibt ein separater ausdrücklicher Schritt.",
  });
});

test("FC1 card status fails back to a safe earlier stage when readiness evidence is inconsistent", () => {
  const copy = factoryLifecycleCardCopy(
    repositoryReadyPreview(),
    evaluateProductionReadiness(),
    {
      ...evaluateM6ProductionReleaseReadiness({ previewAccepted: true }),
      releaseAuthorized: true,
    },
  );

  assert.equal(copy.stageId, "preview");
  assert.equal(copy.nextStep, "M6-Status klären");
  assert.match(copy.detail, /fail-closed/);
});
