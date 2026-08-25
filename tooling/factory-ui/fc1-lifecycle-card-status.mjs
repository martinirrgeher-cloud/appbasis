import { factoryLifecycleCopy } from "./production-readiness-status.js";

const CANONICAL_STAGE_IDS = Object.freeze([
  "repository",
  "preview",
  "production-preparation",
  "production-ready",
  "production-release",
]);

export function factoryLifecycleCardCopy(
  previewReadiness,
  productionReadiness,
  releaseReadiness,
) {
  const lifecycle = factoryLifecycleCopy(
    previewReadiness,
    productionReadiness,
    releaseReadiness,
  );

  if (!isCanonicalLifecycle(lifecycle)) {
    return failClosedCard();
  }

  const currentStages = lifecycle.stages.filter((stage) => stage.state === "current");
  if (currentStages.length > 1) {
    return failClosedCard();
  }

  const current =
    currentStages[0] ?? canonicalPostPreparationTarget(lifecycle.stages);
  if (current === null) {
    return failClosedCard();
  }

  return Object.freeze({
    stageId: current.id,
    label: current.label,
    heading: current.heading,
    nextStep: lifecycle.nextStep.heading,
    detail: lifecycle.nextStep.detail,
  });
}

function canonicalPostPreparationTarget(stages) {
  const preparation = stages[2];
  const productionReady = stages[3];
  const productionRelease = stages[4];

  if (
    preparation.state === "complete" &&
    productionReady.state === "locked" &&
    productionRelease.state === "locked"
  ) {
    return productionReady;
  }

  return null;
}

function isCanonicalLifecycle(lifecycle) {
  if (
    lifecycle === null ||
    typeof lifecycle !== "object" ||
    Array.isArray(lifecycle) ||
    !Array.isArray(lifecycle.stages) ||
    lifecycle.stages.length !== CANONICAL_STAGE_IDS.length ||
    lifecycle.nextStep === null ||
    typeof lifecycle.nextStep !== "object" ||
    Array.isArray(lifecycle.nextStep) ||
    typeof lifecycle.nextStep.heading !== "string" ||
    typeof lifecycle.nextStep.detail !== "string"
  ) {
    return false;
  }

  return lifecycle.stages.every((stage, index) =>
    stage !== null &&
    typeof stage === "object" &&
    !Array.isArray(stage) &&
    stage.id === CANONICAL_STAGE_IDS[index] &&
    typeof stage.label === "string" &&
    typeof stage.heading === "string" &&
    (stage.state === "complete" || stage.state === "current" || stage.state === "locked"),
  );
}

function failClosedCard() {
  return Object.freeze({
    stageId: "unknown",
    label: "Status offen",
    heading: "Lifecycle nicht eindeutig",
    nextStep: "Readiness-Status klären",
    detail: "Der aktuelle Factory-Lifecycle ist nicht eindeutig. Keine Deployment- oder Produktionsaktion starten.",
  });
}
