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

function isConsistentReadiness(readiness) {
  if (readiness === null || typeof readiness !== "object" || Array.isArray(readiness)) {
    return false;
  }
  if (
    !Number.isInteger(readiness.verifiedCount) ||
    !Number.isInteger(readiness.requiredCount) ||
    readiness.requiredCount <= 0 ||
    readiness.verifiedCount < 0 ||
    readiness.verifiedCount > readiness.requiredCount ||
    !Array.isArray(readiness.criteria) ||
    readiness.criteria.length !== readiness.requiredCount
  ) {
    return false;
  }

  const verifiedCriteria = readiness.criteria.filter(
    (criterion) => criterion?.status === "verified",
  ).length;
  const allStatusesKnown = readiness.criteria.every(
    (criterion) => criterion?.status === "verified" || criterion?.status === "open",
  );
  if (!allStatusesKnown || verifiedCriteria !== readiness.verifiedCount) return false;

  const fullyVerified = readiness.verifiedCount === readiness.requiredCount;
  return (
    (readiness.productionReady === true && fullyVerified && readiness.status === "ready") ||
    (readiness.productionReady === false && !fullyVerified && readiness.status === "blocked")
  );
}

async function renderProductionReadinessForApp(appId) {
  const heading = document.querySelector("#detail-production-status");
  const detail = document.querySelector("#detail-production-summary");
  if (!heading || !detail) return;

  heading.textContent = "Security & Privacy wird geprüft …";
  detail.textContent = "Produktion bleibt während der Prüfung gesperrt.";

  try {
    const response = await fetch("/api/factory/snapshot", {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error("snapshot unavailable");
    const snapshot = await response.json();
    const app = Array.isArray(snapshot?.apps)
      ? snapshot.apps.find((candidate) => candidate?.appId === appId)
      : undefined;
    const copy = productionReadinessCopy(app?.productionReadiness);
    heading.textContent = copy.heading;
    detail.textContent = copy.detail;
  } catch {
    const copy = productionReadinessCopy(undefined);
    heading.textContent = copy.heading;
    detail.textContent = copy.detail;
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest("button[data-app-id]");
    const appId = button?.dataset?.appId;
    if (typeof appId !== "string" || appId.length === 0) return;
    void renderProductionReadinessForApp(appId);
  });
}
