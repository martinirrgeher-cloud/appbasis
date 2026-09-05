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

  const hostnameBindings = payload.result.filter(
    (entry) => isPlainObject(entry) && entry.hostname === TARGET_HOSTNAME,
  );
  if (hostnameBindings.length !== 1) {
    return Object.freeze({ productionDomainReady: false });
  }

  const [binding] = hostnameBindings;
  const productionDomainReady =
    binding.service === TARGET_WORKER &&
    typeof binding.id === "string" &&
    binding.id.length > 0 &&
    typeof binding.zone_id === "string" &&
    binding.zone_id.length > 0;

  return Object.freeze({ productionDomainReady });
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}
