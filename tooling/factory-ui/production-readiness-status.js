import { REQUIRED_PRODUCTION_READINESS_CRITERIA } from "./production-readiness.mjs";

const REQUIRED_CRITERION_IDS = Object.freeze(
  REQUIRED_PRODUCTION_READINESS_CRITERIA.map((criterion) => criterion.id),
);
const REQUIRED_M6_CRITERION_IDS = Object.freeze([
  "previewAccepted",
  "productionDatabaseReady",
  "productionWorkerReady",
  "productionDomainReady",
  "productionUsersAndPermissionsReady",
  "backupRecoveryReady",
  "securityPrivacyReady",
  "productionMigrationsApplied",
  "productionDeploymentCompleted",
  "postDeploySmokePassed",
]);

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
