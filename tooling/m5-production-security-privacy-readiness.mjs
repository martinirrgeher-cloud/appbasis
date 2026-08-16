export const M5_PRODUCTION_SECURITY_PRIVACY_CRITERIA = Object.freeze([
  Object.freeze({ id: "data-region", label: "Datenregion geklärt" }),
  Object.freeze({ id: "dpa", label: "AVV/DPA geklärt" }),
  Object.freeze({ id: "encryption", label: "Verschlüsselung bewertet" }),
  Object.freeze({ id: "roles-rights", label: "Rollen/Rechte geprüft" }),
  Object.freeze({ id: "deletion", label: "Löschkonzept vorhanden" }),
  Object.freeze({ id: "retention", label: "Aufbewahrungskonzept vorhanden" }),
  Object.freeze({ id: "data-export", label: "Datenexport vorhanden/definiert" }),
  Object.freeze({ id: "audit-security-logging", label: "Audit-/Security-Logging vorhanden" }),
  Object.freeze({ id: "subprocessors", label: "Subprozessoren dokumentiert" }),
  Object.freeze({ id: "high-privacy-profile", label: "High-Privacy-Profil definiert" }),
  Object.freeze({ id: "manifest-secret-separation", label: "Secrets/Credentials vom normalen App-Manifest getrennt" }),
  Object.freeze({ id: "privileged-control-plane-isolation", label: "Privilegierte Control-Plane-Funktionen nicht unnötig öffentlich erreichbar" }),
]);

const CRITERION_IDS = new Set(M5_PRODUCTION_SECURITY_PRIVACY_CRITERIA.map(({ id }) => id));
const MAX_EVIDENCE_REF_LENGTH = 512;
const MAX_EVIDENCE_REFS_PER_CRITERION = 32;

export function evaluateM5ProductionSecurityPrivacyReadiness(input = {}) {
  const checks = isRecord(input?.checks) ? input.checks : {};

  const criteria = M5_PRODUCTION_SECURITY_PRIVACY_CRITERIA.map((criterion) => {
    const check = normalizeCheck(checks[criterion.id]);
    return Object.freeze({
      ...criterion,
      satisfied: check.satisfied,
      evidenceRefs: check.evidenceRefs,
    });
  });

  const missingCriteria = Object.freeze(
    criteria.filter(({ satisfied }) => !satisfied).map(({ id }) => id),
  );

  return Object.freeze({
    productionReady: missingCriteria.length === 0,
    criteria: Object.freeze(criteria),
    missingCriteria,
  });
}

export function isKnownM5ProductionSecurityPrivacyCriterion(value) {
  return typeof value === "string" && CRITERION_IDS.has(value);
}

function normalizeCheck(value) {
  if (!isRecord(value) || value.status !== "satisfied") {
    return unsatisfiedCheck();
  }

  if (!Array.isArray(value.evidenceRefs)) {
    return unsatisfiedCheck();
  }

  if (
    value.evidenceRefs.length === 0 ||
    value.evidenceRefs.length > MAX_EVIDENCE_REFS_PER_CRITERION
  ) {
    return unsatisfiedCheck();
  }

  const evidenceRefs = [];
  for (const candidate of value.evidenceRefs) {
    if (!validEvidenceRef(candidate)) return unsatisfiedCheck();
    evidenceRefs.push(candidate);
  }

  return Object.freeze({
    satisfied: true,
    evidenceRefs: Object.freeze(evidenceRefs),
  });
}

function unsatisfiedCheck() {
  return Object.freeze({
    satisfied: false,
    evidenceRefs: Object.freeze([]),
  });
}

function validEvidenceRef(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_EVIDENCE_REF_LENGTH &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f]/u.test(value)
  );
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
