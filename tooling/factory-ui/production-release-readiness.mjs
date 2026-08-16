export const REQUIRED_M6_PRODUCTION_RELEASE_CRITERIA = Object.freeze([
  Object.freeze({ id: "previewAccepted", label: "Preview geprüft" }),
  Object.freeze({ id: "productionDatabaseReady", label: "Eigene Produktionsdatenbank" }),
  Object.freeze({ id: "productionWorkerReady", label: "Eigener Produktions-Worker" }),
  Object.freeze({ id: "productionDomainReady", label: "Eigene Domain" }),
  Object.freeze({ id: "productionUsersAndPermissionsReady", label: "Produktive Benutzer & Rechte" }),
  Object.freeze({ id: "backupRecoveryReady", label: "Backup & Recovery geprüft" }),
  Object.freeze({ id: "securityPrivacyReady", label: "Security & Privacy geprüft" }),
  Object.freeze({ id: "productionMigrationsApplied", label: "Kontrollierte Produktionsmigrationen" }),
  Object.freeze({ id: "productionDeploymentCompleted", label: "Produktions-Deploy abgeschlossen" }),
  Object.freeze({ id: "postDeploySmokePassed", label: "Post-Deploy-Smoke erfolgreich" }),
]);

export function evaluateM6ProductionReleaseReadiness(evidence = {}) {
  if (!isPlainObject(evidence)) {
    throw new Error("M6 production release evidence must be a plain object.");
  }

  const criteria = REQUIRED_M6_PRODUCTION_RELEASE_CRITERIA.map(({ id, label }) => {
    const verified = Object.hasOwn(evidence, id) && evidence[id] === true;
    return Object.freeze({
      id,
      label,
      status: verified ? "verified" : "open",
    });
  });
  const verifiedCount = criteria.filter((criterion) => criterion.status === "verified").length;
  const requiredCount = criteria.length;
  const productionVerified = verifiedCount === requiredCount;

  return Object.freeze({
    status: productionVerified ? "verified" : "blocked",
    productionVerified,
    verifiedCount,
    requiredCount,
    explicitApprovalRequired: true,
    releaseAuthorized: false,
    criteria: Object.freeze(criteria),
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
