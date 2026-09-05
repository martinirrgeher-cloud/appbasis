const APPLICATION = "ulc-linz";
const ENVIRONMENT = "production";
const TARGET_HOSTNAME = "app.ulc-linz.at";
const TARGET_WORKER = "appbasis-ulc-linz-production";

export const ULC_LINZ_M6_PRODUCTION_DOMAIN_CONTRACT = Object.freeze({
  schemaVersion: 1,
  application: APPLICATION,
  environment: ENVIRONMENT,
  hostname: TARGET_HOSTNAME,
  service: TARGET_WORKER,
});

export function evaluateUlcLinzM6ProductionDomainEvidence(payload) {
  if (!isPlainObject(payload) || payload.success !== true || !Array.isArray(payload.result)) {
    return Object.freeze({ productionDomainReady: false });
  }

  const matches = payload.result.filter(
    (entry) =>
      isPlainObject(entry) &&
      entry.hostname === TARGET_HOSTNAME &&
      entry.service === TARGET_WORKER &&
      typeof entry.id === "string" &&
      entry.id.length > 0 &&
      typeof entry.zone_id === "string" &&
      entry.zone_id.length > 0,
  );

  return Object.freeze({ productionDomainReady: matches.length === 1 });
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}
