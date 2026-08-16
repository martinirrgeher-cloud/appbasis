export const REQUIRED_M6_PRODUCTION_LIFECYCLE_CRITERIA = Object.freeze([
  Object.freeze({ id: "m1Ready", label: "Designsystem & Rollen (M1)", stage: "prerequisites" }),
  Object.freeze({ id: "m2Ready", label: "Factory-Erzeugung (M2)", stage: "prerequisites" }),
  Object.freeze({ id: "m3Ready", label: "Preview geprüft (M3)", stage: "prerequisites" }),
  Object.freeze({ id: "m4Ready", label: "Backup & Recovery geprüft (M4)", stage: "prerequisites" }),
  Object.freeze({ id: "m5Ready", label: "Security & Privacy geprüft (M5)", stage: "prerequisites" }),
  Object.freeze({ id: "productionDatabaseReady", label: "Eigene Produktionsdatenbank", stage: "provisioning" }),
  Object.freeze({ id: "productionWorkerReady", label: "Eigener Produktions-Worker", stage: "provisioning" }),
  Object.freeze({ id: "productionDomainReady", label: "Eigene Domain", stage: "provisioning" }),
  Object.freeze({ id: "productionUsersAndPermissionsReady", label: "Produktive Benutzer & Rechte", stage: "provisioning" }),
  Object.freeze({ id: "productionMigrationsApplied", label: "Kontrollierte Produktionsmigrationen", stage: "migration" }),
  Object.freeze({ id: "productionDeploymentCompleted", label: "Produktions-Deploy abgeschlossen", stage: "deployment" }),
  Object.freeze({ id: "postDeploySmokePassed", label: "Post-Deploy-Smoke erfolgreich", stage: "verification" }),
]);

export function evaluateM6ProductionLifecycle(evidence = {}) {
  if (!isPlainObject(evidence)) {
    throw new Error("M6 production lifecycle evidence must be a plain object.");
  }

  const criteria = REQUIRED_M6_PRODUCTION_LIFECYCLE_CRITERIA.map(({ id, label, stage }) => {
    const verified = Object.hasOwn(evidence, id) && evidence[id] === true;
    return Object.freeze({
      id,
      label,
      stage,
      status: verified ? "verified" : "open",
    });
  });
  const verifiedCount = criteria.filter((criterion) => criterion.status === "verified").length;
  const requiredCount = criteria.length;
  const productionVerified = verifiedCount === requiredCount;
  const nextCriterion = criteria.find((criterion) => criterion.status === "open") ?? null;

  return Object.freeze({
    status: productionVerified ? "verified" : "blocked",
    productionVerified,
    verifiedCount,
    requiredCount,
    explicitApprovalRequired: true,
    releaseAuthorized: false,
    criteria: Object.freeze(criteria),
    nextCriterion,
  });
}

function isPlainObject(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}
