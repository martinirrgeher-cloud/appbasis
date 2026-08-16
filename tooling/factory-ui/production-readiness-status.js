import { REQUIRED_PRODUCTION_READINESS_CRITERIA } from "./production-readiness.mjs";

const REQUIRED_CRITERION_IDS = Object.freeze(
  REQUIRED_PRODUCTION_READINESS_CRITERIA.map((criterion) => criterion.id),
);

export function productionReadinessCopy(readiness) {
  if (!isConsistentReadiness(readiness)) {
    return Object.freeze({
      heading: "Security & Privacy nicht verifiziert",
      detail: "Der M5-Status ist nicht eindeutig verfügbar. Produktion bleibt gesperrt.",
    });
  }

  const openCount = readiness.requiredCount - readiness.verifiedCount;
  if (readiness.productionReady === true) {
    return Object.freeze({
      heading: `Security & Privacy ${readiness.verifiedCount}/${readiness.requiredCount} geprüft`,
      detail: "M5 ist erfüllt. Die Produktionsfreigabe bleibt ein separates, gesperrtes Gate.",
    });
  }

  return Object.freeze({
    heading: `Security & Privacy ${readiness.verifiedCount}/${readiness.requiredCount} geprüft`,
    detail: `${openCount} ${openCount === 1 ? "Kriterium ist" : "Kriterien sind"} noch offen. Produktion bleibt gesperrt.`,
  });
}

export function productionReadinessCriteria(readiness) {
  const valid = isConsistentReadiness(readiness);
  return Object.freeze(
    REQUIRED_PRODUCTION_READINESS_CRITERIA.map((criterion, index) =>
      Object.freeze({
        id: criterion.id,
        label: criterion.label,
        status: valid ? readiness.criteria[index].status : "unknown",
      }),
    ),
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
