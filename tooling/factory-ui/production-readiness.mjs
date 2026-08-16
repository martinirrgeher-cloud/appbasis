export const REQUIRED_PRODUCTION_READINESS_CRITERIA = Object.freeze([
  Object.freeze({ id: "dataRegion", label: "Datenregion" }),
  Object.freeze({ id: "dpa", label: "AVV/DPA" }),
  Object.freeze({ id: "encryption", label: "Verschlüsselung" }),
  Object.freeze({ id: "rolesAndPermissions", label: "Rollen & Rechte" }),
  Object.freeze({ id: "deletionConcept", label: "Löschkonzept" }),
  Object.freeze({ id: "retention", label: "Aufbewahrung" }),
  Object.freeze({ id: "dataExport", label: "Datenexport" }),
  Object.freeze({ id: "auditSecurityLogging", label: "Audit-/Security-Logging" }),
  Object.freeze({ id: "subprocessors", label: "Subprozessoren" }),
  Object.freeze({ id: "highPrivacyProfile", label: "High-Privacy-Profil für App belegt" }),
  Object.freeze({ id: "secretsOutsideAppManifests", label: "Secrets außerhalb App-Manifeste" }),
  Object.freeze({ id: "privilegedControlPlaneIsolation", label: "Privilegierte Control Plane getrennt" }),
]);

export function evaluateProductionReadiness(evidence = {}) {
  if (!isPlainObject(evidence)) {
    throw new Error("Production readiness evidence must be a plain object.");
  }

  const criteria = REQUIRED_PRODUCTION_READINESS_CRITERIA.map(({ id, label }) => {
    const verified = Object.hasOwn(evidence, id) && evidence[id] === true;
    return Object.freeze({
      id,
      label,
      status: verified ? "verified" : "open",
    });
  });
  const verifiedCount = criteria.filter((criterion) => criterion.status === "verified").length;
  const requiredCount = criteria.length;
  const productionReady = verifiedCount === requiredCount;

  return Object.freeze({
    status: productionReady ? "ready" : "blocked",
    productionReady,
    verifiedCount,
    requiredCount,
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
