const FIELDS = Object.freeze([
  "workersDevEnabled",
  "previewUrlsEnabled",
  "customDomainCount",
  "routeCount",
]);

const VERIFIED_NO_PUBLIC_INGRESS = Object.freeze({
  workersDevEnabled: false,
  previewUrlsEnabled: false,
  customDomainCount: 0,
  routeCount: 0,
});

export function createNoPublicWorkerIngressEvidence() {
  return VERIFIED_NO_PUBLIC_INGRESS;
}

export function assertNoPublicWorkerIngressEvidence(value) {
  if (!isExactPlainRecord(value)) {
    throw new Error("Privileged Worker public-ingress evidence is invalid.");
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    descriptors.workersDevEnabled.value !== false ||
    descriptors.previewUrlsEnabled.value !== false ||
    descriptors.customDomainCount.value !== 0 ||
    descriptors.routeCount.value !== 0
  ) {
    throw new Error("Privileged Worker has public ingress.");
  }

  return VERIFIED_NO_PUBLIC_INGRESS;
}

function isExactPlainRecord(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) {
    return false;
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors);
  if (
    keys.length !== FIELDS.length ||
    FIELDS.some((field) => !Object.hasOwn(descriptors, field)) ||
    keys.some((key) => !FIELDS.includes(key))
  ) {
    return false;
  }

  return Object.values(descriptors).every(
    (descriptor) =>
      Object.hasOwn(descriptor, "value") &&
      descriptor.enumerable === true &&
      descriptor.get === undefined &&
      descriptor.set === undefined,
  );
}
