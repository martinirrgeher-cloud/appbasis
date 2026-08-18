import { REQUIRED_PRODUCTION_READINESS_CRITERIA } from "./production-readiness.mjs";
import { REQUIRED_M6_PRODUCTION_RELEASE_CRITERIA } from "./production-release-readiness.mjs";

const REQUIRED_CRITERION_IDS = Object.freeze(
  REQUIRED_PRODUCTION_READINESS_CRITERIA.map((criterion) => criterion.id),
);
const REQUIRED_M6_CRITERION_IDS = Object.freeze(
  REQUIRED_M6_PRODUCTION_RELEASE_CRITERIA.map((criterion) => criterion.id),
);

export function productionReadinessCopy(readiness) {
  if (!isConsistentReadiness(readiness)) {
    return Object.freeze({
      heading: "Security & Privacy nicht verifiziert",
      detail: "Der M5-Status ist nicht eindeutig verfügbar. Produktion bleibt gesperrt.",
    });
  }

  if (readiness.productionReady === true) {
    return Object.freeze({
      heading: `Security & Privacy ${readiness.verifiedCount}/${readiness.requiredCount} geprüft`,
      detail: "M5 ist erfüllt. Die Produktionsfreigabe bleibt ein separates, gesperrtes Gate.",
    });
  }

  const openLabels = REQUIRED_PRODUCTION_READINESS_CRITERIA
    .filter((_, index) => readiness.criteria[index].status === "open")
    .map((criterion) => criterion.label);

  return Object.freeze({
    heading: `Security & Privacy ${readiness.verifiedCount}/${readiness.requiredCount} geprüft`,
    detail: `Noch offen: ${openLabels.join(" · ")}. Produktion bleibt gesperrt.`,
  });
}

export function productionReleaseReadinessCopy(readiness) {
  if (!isConsistentM6Readiness(readiness)) {
    return Object.freeze({
      heading: "M6 nicht verifiziert",
      detail: "Der M6-Status ist nicht eindeutig verfügbar. Produktion bleibt gesperrt.",
    });
  }

  if (readiness.technicalEvidenceVerified === true) {
    return Object.freeze({
      heading: `M6 ${readiness.verifiedCount}/${readiness.requiredCount} technisch geprüft`,
      detail: "Die technische M6-Evidenz ist vollständig. Dieser Status autorisiert keine Produktionsfreigabe.",
    });
  }

  const openCount = readiness.requiredCount - readiness.verifiedCount;
  return Object.freeze({
    heading: `M6 ${readiness.verifiedCount}/${readiness.requiredCount} technisch geprüft`,
    detail: `${openCount} ${openCount === 1 ? "Nachweis ist" : "Nachweise sind"} noch offen. Produktion bleibt gesperrt.`,
  });
}

export function productionReleaseCriteriaCopy(readiness) {
  const consistent = isConsistentM6Readiness(readiness);
  return Object.freeze(
    REQUIRED_M6_PRODUCTION_RELEASE_CRITERIA.map((criterion, index) =>
      Object.freeze({
        id: criterion.id,
        label: criterion.label,
        status:
          consistent && readiness.criteria[index].status === "verified"
            ? "verified"
            : "open",
      }),
    ),
  );
}

export function factoryLifecycleCopy(
  previewReadiness,
  productionReadiness,
  releaseReadiness,
) {
  const previewConsistent = isConsistentPreviewReadiness(previewReadiness);
  const repositoryPreviewReady =
    previewConsistent && previewReadiness.status === "repository-ready";
  const m5Consistent = isConsistentReadiness(productionReadiness);
  const m6Consistent = isConsistentM6Readiness(releaseReadiness);
  const productionReady =
    m5Consistent && productionReadiness.productionReady === true;
  const previewAccepted =
    previewConsistent &&
    m6Consistent &&
    criterionIsVerified(releaseReadiness, "previewAccepted");
  const releaseCrossConsistent =
    m5Consistent &&
    m6Consistent &&
    criterionIsVerified(releaseReadiness, "securityPrivacyReady") === productionReady;
  const technicalEvidenceVerified =
    releaseCrossConsistent && releaseReadiness.technicalEvidenceVerified === true;

  const m5OpenLabels = m5Consistent
    ? REQUIRED_PRODUCTION_READINESS_CRITERIA
        .filter((_, index) => productionReadiness.criteria[index].status === "open")
        .map((criterion) => criterion.label)
    : [];
  const m6OpenLabels = releaseCrossConsistent
    ? REQUIRED_M6_PRODUCTION_RELEASE_CRITERIA
        .filter((_, index) => releaseReadiness.criteria[index].status === "open")
        .map((criterion) => criterion.label)
    : [];

  const stages = Object.freeze([
    lifecycleStage("repository", "Repository", "complete", "Erzeugt"),
    lifecycleStage(
      "preview",
      "Preview",
      previewAccepted ? "complete" : "current",
      previewAccepted
        ? "Geprüft"
        : repositoryPreviewReady
          ? "Lokal vorbereitet"
          : previewConsistent
            ? "Vorbereitung offen"
            : "Status offen",
    ),
    lifecycleStage(
      "production-ready",
      "Production Ready",
      productionReady ? "complete" : previewAccepted ? "current" : "locked",
      productionReady
        ? "Bereit"
        : m5Consistent
          ? `${productionReadiness.verifiedCount}/${productionReadiness.requiredCount} geprüft`
          : "Nicht verifiziert",
    ),
    lifecycleStage(
      "production-release",
      "Produktion freigeben",
      previewAccepted && productionReady ? "current" : "locked",
      technicalEvidenceVerified
        ? "Technisch vollständig"
        : releaseCrossConsistent
          ? `${releaseReadiness.verifiedCount}/${releaseReadiness.requiredCount} geprüft`
          : "Gesperrt",
    ),
  ]);

  let nextStep;
  if (!previewConsistent) {
    nextStep = lifecycleNextStep(
      "Preview-Status klären",
      "Die lokalen Preview-Daten sind nicht eindeutig. Keine Bereitstellung starten, bevor der Snapshot wieder konsistent ist.",
    );
  } else if (!repositoryPreviewReady) {
    nextStep = lifecycleNextStep(
      "Preview vorbereiten",
      "Die fehlenden lokalen Preview-Voraussetzungen schließen. Dieser Schritt startet noch kein Deployment.",
    );
  } else if (!m6Consistent) {
    nextStep = lifecycleNextStep(
      "M6-Status klären",
      "Die technische Release-Evidenz ist nicht eindeutig. Das Gate bleibt fail-closed; keine Produktionsaktion starten.",
    );
  } else if (!previewAccepted) {
    nextStep = lifecycleNextStep(
      "Preview erstellen und prüfen",
      "Als Nächstes den getrennten Preview-Pfad verwenden und die Preview abnehmen. Diese Ansicht startet noch kein Deployment.",
    );
  } else if (!m5Consistent) {
    nextStep = lifecycleNextStep(
      "Production-Ready-Status klären",
      "Der Security-/Privacy-Status ist nicht eindeutig. Produktion bleibt gesperrt, bis M5 wieder konsistent ist.",
    );
  } else if (!productionReady) {
    nextStep = lifecycleNextStep(
      "Production Ready vervollständigen",
      `Noch offen: ${m5OpenLabels.join(" · ")}. Erst danach die technischen Produktionsnachweise weiterführen.`,
    );
  } else if (!releaseCrossConsistent) {
    nextStep = lifecycleNextStep(
      "Freigabe-Status klären",
      "M5 und M6 widersprechen sich im Security-/Privacy-Gate. Produktion bleibt fail-closed gesperrt.",
    );
  } else if (!technicalEvidenceVerified) {
    nextStep = lifecycleNextStep(
      "Produktionsnachweise vorbereiten",
      `Noch offen: ${m6OpenLabels.join(" · ")}. Produktive Provider- oder Datenbankänderungen bleiben bis zur ausdrücklichen Freigabe getrennt.`,
    );
  } else {
    nextStep = lifecycleNextStep(
      "Ausdrückliche Produktionsfreigabe erforderlich",
      "Alle technischen M6-Nachweise sind vollständig. Diese Oberfläche hat bewusst keinen Produktionsbutton; die Freigabe bleibt ein separater Schritt.",
    );
  }

  return Object.freeze({ stages, nextStep });
}

function lifecycleStage(id, label, state, heading) {
  return Object.freeze({ id, label, state, heading });
}

function lifecycleNextStep(heading, detail) {
  return Object.freeze({ heading, detail });
}

function criterionIsVerified(readiness, id) {
  const index = REQUIRED_M6_CRITERION_IDS.indexOf(id);
  return index >= 0 && readiness.criteria[index].status === "verified";
}

function isConsistentPreviewReadiness(readiness) {
  if (readiness === null || typeof readiness !== "object" || Array.isArray(readiness)) {
    return false;
  }
  if (
    (readiness.status !== "repository-ready" &&
      readiness.status !== "repository-incomplete") ||
    typeof readiness.workerEntrypointPresent !== "boolean" ||
    typeof readiness.packageManifestPresent !== "boolean" ||
    typeof readiness.databaseManifestRequired !== "boolean" ||
    typeof readiness.databaseManifestPresent !== "boolean" ||
    (!readiness.databaseManifestRequired && readiness.databaseManifestPresent)
  ) {
    return false;
  }

  const repositoryReady =
    readiness.workerEntrypointPresent &&
    readiness.packageManifestPresent &&
    (!readiness.databaseManifestRequired || readiness.databaseManifestPresent);
  return (
    (readiness.status === "repository-ready" && repositoryReady) ||
    (readiness.status === "repository-incomplete" && !repositoryReady)
  );
}

function isConsistentReadiness(readiness) {
  if (readiness === null || typeof readiness !== "object" || Array.isArray(readiness)) {
    return false;
  }
  if (
    !Number.isInteger(readiness.verifiedCount) ||
    readiness.requiredCount !== REQUIRED_CRITERION_IDS.length ||
    readiness.verifiedCount < 0 ||
    readiness.verifiedCount > readiness.requiredCount ||
    !Array.isArray(readiness.criteria) ||
    readiness.criteria.length !== REQUIRED_CRITERION_IDS.length
  ) {
    return false;
  }

  let verifiedCriteria = 0;
  for (const [index, expectedId] of REQUIRED_CRITERION_IDS.entries()) {
    const criterion = readiness.criteria[index];
    if (
      criterion === null ||
      typeof criterion !== "object" ||
      Array.isArray(criterion) ||
      criterion.id !== expectedId ||
      (criterion.status !== "verified" && criterion.status !== "open")
    ) {
      return false;
    }
    if (criterion.status === "verified") verifiedCriteria += 1;
  }
  if (verifiedCriteria !== readiness.verifiedCount) return false;

  const fullyVerified = readiness.verifiedCount === readiness.requiredCount;
  return (
    (readiness.productionReady === true && fullyVerified && readiness.status === "ready") ||
    (readiness.productionReady === false && !fullyVerified && readiness.status === "blocked")
  );
}

function isConsistentM6Readiness(readiness) {
  if (readiness === null || typeof readiness !== "object" || Array.isArray(readiness)) {
    return false;
  }
  if (
    !Number.isInteger(readiness.verifiedCount) ||
    readiness.requiredCount !== REQUIRED_M6_CRITERION_IDS.length ||
    readiness.verifiedCount < 0 ||
    readiness.verifiedCount > readiness.requiredCount ||
    readiness.explicitApprovalRequired !== true ||
    readiness.releaseAuthorized !== false ||
    typeof readiness.technicalEvidenceVerified !== "boolean" ||
    !Array.isArray(readiness.criteria) ||
    readiness.criteria.length !== REQUIRED_M6_CRITERION_IDS.length
  ) {
    return false;
  }

  let verifiedCriteria = 0;
  for (const [index, expectedId] of REQUIRED_M6_CRITERION_IDS.entries()) {
    const criterion = readiness.criteria[index];
    if (
      criterion === null ||
      typeof criterion !== "object" ||
      Array.isArray(criterion) ||
      criterion.id !== expectedId ||
      (criterion.status !== "verified" && criterion.status !== "open")
    ) {
      return false;
    }
    if (criterion.status === "verified") verifiedCriteria += 1;
  }
  if (verifiedCriteria !== readiness.verifiedCount) return false;

  const fullyVerified = readiness.verifiedCount === readiness.requiredCount;
  return (
    (readiness.technicalEvidenceVerified === true &&
      fullyVerified &&
      readiness.status === "evidence-verified") ||
    (readiness.technicalEvidenceVerified === false &&
      !fullyVerified &&
      readiness.status === "blocked")
  );
}
