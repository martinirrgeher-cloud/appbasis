import { readFileSync } from "node:fs";

import { ULC_LINZ_M5_TARGET_POLICY } from "./ulc-linz-m5-target-policy.mjs";

const INVENTORY = JSON.parse(
  readFileSync(
    new URL(
      "../apps/ulc-linz/privacy/m5-provider-compliance-inventory.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

const EVIDENCE_SCHEMA_VERSION = 1;
const PRODUCTION_ENVIRONMENT = "production";
const PROVIDER_MODEL = "standard-workers-global-transient";
const EXPECTED_NEON_REGION_ID = "aws-eu-central-1";
const EXPECTED_PROVIDER_IDS = Object.freeze(
  INVENTORY.providerScope.map((provider) => provider.id),
);
const EXPECTED_CORE_DATA_FLOWS = Object.freeze(
  INVENTORY.dataFlows.map(({ from, to, purpose }) =>
    Object.freeze({ from, to, purpose }),
  ),
);
const LEGAL_PROVIDER_TO_INVENTORY_PROVIDER = Object.freeze({
  cloudflare: "cloudflare",
  "neon-databricks": "neon-postgresql",
});
const KNOWN_CLOUDFLARE_BINDING_TYPES = Object.freeze([
  "hyperdrive",
  "kv_namespace",
  "d1",
  "r2_bucket",
  "durable_object_namespace",
  "queue",
  "workflow",
  "service",
]);
const LEGAL_PROVIDERS = Object.freeze(Object.keys(LEGAL_PROVIDER_TO_INVENTORY_PROVIDER));
const LEGAL_DOCUMENT_TYPES = Object.freeze([
  "dpa",
  "dpa-account-binding",
  "subprocessors",
  "security",
  "processing-model",
  "region",
  "terms",
]);
const ROOT_KEYS = Object.freeze([
  "schemaVersion",
  "application",
  "environment",
  "providerModel",
  "euOnly",
  "observedAt",
  "validUntilOrReviewAt",
  "dataFlowInventoryComplete",
  "providers",
  "legalEvidence",
  "dataFlows",
]);
const CLOUDFLARE_KEYS = Object.freeze([
  "resourceClass",
  "runtimeBound",
  "routeBound",
  "runtimeClass",
  "bindingsInventoryComplete",
  "bindings",
  "telemetryInventoryComplete",
  "transportEncryptionObserved",
  "regionalServicesEnabled",
  "customerMetadataBoundaryEnabled",
]);
const NEON_KEYS = Object.freeze([
  "resourceClass",
  "projectBound",
  "databaseBound",
  "regionId",
  "regionSource",
  "transportEncryptionObserved",
  "atRestEncryptionObserved",
]);
const BINDING_KEYS = Object.freeze(["type", "personalDataDisposition"]);
const LEGAL_EVIDENCE_KEYS = Object.freeze([
  "provider",
  "documentType",
  "canonicalSource",
  "documentVersionOrUpdatedAt",
  "serviceScope",
  "observedAt",
  "validUntilOrReviewAt",
  "accountSpecific",
  "publicBaseline",
  "transferModelConsistentWithAdr022",
]);
const DATA_FLOW_KEYS = Object.freeze(["from", "to", "purpose", "status"]);
const SENSITIVE_KEY_PATTERN =
  /authorization|cookie|password|secret|token|connection.?string|private.?key|request.?body|response.?body|username|member|athlete|contact/i;
const SENSITIVE_STRING_PATTERNS = Object.freeze([
  /\bbearer\s+\S+/i,
  /postgres(?:ql)?:\/\/[^/\s:@]+:[^@\s]+@/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
]);

assertCanonicalInventory();

export const ULC_LINZ_M5_G_CRITERIA = Object.freeze([
  "dataRegion",
  "dpa",
  "encryption",
  "subprocessors",
]);

export const ULC_LINZ_M5_G_LEGAL_SERVICE_SCOPES = Object.freeze(
  Object.fromEntries(
    Object.entries(LEGAL_PROVIDER_TO_INVENTORY_PROVIDER).map(
      ([legalProvider, inventoryProviderId]) => {
        const provider = INVENTORY.providerScope.find(
          (candidate) => candidate.id === inventoryProviderId,
        );
        return [legalProvider, canonicalServiceScope(provider.responsibilities)];
      },
    ),
  ),
);

export function evaluateUlcLinzProviderCompliance(sourceEvidence, options = {}) {
  assertNoSensitiveData(sourceEvidence);
  assertPlainObject(sourceEvidence, "ULC Linz M5-G source evidence");
  assertExactKeys(sourceEvidence, ROOT_KEYS, "ULC Linz M5-G source evidence");

  if (sourceEvidence.schemaVersion !== EVIDENCE_SCHEMA_VERSION) {
    throw new Error("ULC Linz M5-G source evidence schema version is invalid.");
  }
  if (sourceEvidence.application !== ULC_LINZ_M5_TARGET_POLICY.appId) {
    throw new Error(
      `ULC Linz M5-G source evidence requires application ${ULC_LINZ_M5_TARGET_POLICY.appId}.`,
    );
  }
  if (sourceEvidence.environment !== PRODUCTION_ENVIRONMENT) {
    throw new Error("ULC Linz M5-G source evidence requires production environment.");
  }
  if (
    sourceEvidence.providerModel !== PROVIDER_MODEL ||
    sourceEvidence.euOnly !== false
  ) {
    throw new Error(
      "ULC Linz M5-G source evidence must use Standard Workers global-transient processing and euOnly=false.",
    );
  }
  requireBoolean(sourceEvidence.dataFlowInventoryComplete, "dataFlowInventoryComplete");

  const now = parseNow(options.now);
  const rootWindow = parseEvidenceWindow(
    sourceEvidence.observedAt,
    sourceEvidence.validUntilOrReviewAt,
    "ULC Linz M5-G source evidence",
  );
  const rootFresh = isFresh(rootWindow, now);

  assertPlainObject(sourceEvidence.providers, "providers");
  assertExactKeys(sourceEvidence.providers, EXPECTED_PROVIDER_IDS, "providers");

  const cloudflare = normalizeCloudflareEvidence(sourceEvidence.providers.cloudflare);
  const neon = normalizeNeonEvidence(sourceEvidence.providers["neon-postgresql"]);
  const legalEvidence = normalizeLegalEvidence(sourceEvidence.legalEvidence, now);
  const dataFlows = normalizeDataFlows(sourceEvidence.dataFlows);

  const resourceBinding = Object.freeze({
    cloudflareProductionRuntimeBound:
      cloudflare.resourceClass === "production" && cloudflare.runtimeBound,
    cloudflareProductionRouteBound:
      cloudflare.resourceClass === "production" && cloudflare.routeBound,
    neonProductionProjectBound:
      neon.resourceClass === "production" && neon.projectBound,
    neonProductionDatabaseBound:
      neon.resourceClass === "production" && neon.databaseBound,
  });
  const productionPreparationResourcesBound =
    resourceBinding.cloudflareProductionRuntimeBound === true &&
    resourceBinding.neonProductionProjectBound === true &&
    resourceBinding.neonProductionDatabaseBound === true;

  const dataFlowScopeComplete =
    sourceEvidence.dataFlowInventoryComplete === true &&
    dataFlows.length === EXPECTED_CORE_DATA_FLOWS.length &&
    EXPECTED_CORE_DATA_FLOWS.every((expected) =>
      dataFlows.some(
        (flow) =>
          flow.from === expected.from &&
          flow.to === expected.to &&
          flow.purpose === expected.purpose &&
          flow.status === "verified",
      ),
    ) &&
    dataFlows.every((flow) => flow.status === "verified");
  const providerScopeComplete =
    cloudflare.bindingsInventoryComplete === true &&
    cloudflare.telemetryInventoryComplete === true &&
    cloudflare.unexpectedPersonalDataPersistence === false;
  const evidenceScopeComplete = dataFlowScopeComplete && providerScopeComplete;
  const commonCriterionPrerequisites =
    rootFresh && productionPreparationResourcesBound && evidenceScopeComplete;

  const dataRegionVerified =
    commonCriterionPrerequisites &&
    cloudflare.runtimeClass === "standard-workers" &&
    neon.regionId === EXPECTED_NEON_REGION_ID &&
    neon.regionSource === "provider-api";

  const neonProductSpecificScheduleFresh = hasFreshLegalPair(
    legalEvidence,
    "neon-databricks",
    "terms",
    { publicBaseline: true, accountSpecific: false },
  );

  const dpaVerified =
    commonCriterionPrerequisites &&
    hasFreshLegalPair(legalEvidence, "cloudflare", "dpa", {
      publicBaseline: true,
      accountSpecific: false,
    }) &&
    hasFreshLegalPair(legalEvidence, "cloudflare", "dpa-account-binding", {
      publicBaseline: false,
      accountSpecific: true,
    }) &&
    neonProductSpecificScheduleFresh &&
    hasFreshLegalPair(legalEvidence, "neon-databricks", "dpa", {
      publicBaseline: true,
      accountSpecific: false,
    }) &&
    hasFreshLegalPair(
      legalEvidence,
      "neon-databricks",
      "dpa-account-binding",
      { publicBaseline: false, accountSpecific: true },
    );

  const encryptionVerified =
    commonCriterionPrerequisites &&
    cloudflare.encryptionConfigurationObserved === true &&
    neon.encryptionConfigurationObserved === true &&
    hasFreshLegalPair(legalEvidence, "cloudflare", "security") &&
    hasFreshLegalPair(legalEvidence, "neon-databricks", "security");

  const subprocessorsVerified =
    commonCriterionPrerequisites &&
    hasFreshLegalPair(legalEvidence, "cloudflare", "subprocessors", {
      transferModelConsistentWithAdr022: true,
    }) &&
    neonProductSpecificScheduleFresh &&
    hasFreshLegalPair(legalEvidence, "neon-databricks", "subprocessors", {
      transferModelConsistentWithAdr022: true,
    });

  const criteria = Object.freeze({
    dataRegion: dataRegionVerified ? "verified" : "open",
    dpa: dpaVerified ? "verified" : "open",
    encryption: encryptionVerified ? "verified" : "open",
    subprocessors: subprocessorsVerified ? "verified" : "open",
  });

  return Object.freeze({
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    application: ULC_LINZ_M5_TARGET_POLICY.appId,
    environment: PRODUCTION_ENVIRONMENT,
    providerModel: PROVIDER_MODEL,
    euOnly: false,
    observedAt: rootWindow.observedAt,
    validUntilOrReviewAt: rootWindow.validUntilOrReviewAt,
    resourceBinding,
    providers: Object.freeze({
      cloudflare: Object.freeze({
        runtimeClass: cloudflare.runtimeClass,
        bindingsInventoryComplete: cloudflare.bindingsInventoryComplete,
        unexpectedPersonalDataPersistence:
          cloudflare.unexpectedPersonalDataPersistence,
        telemetryInventoryComplete: cloudflare.telemetryInventoryComplete,
        regionalServicesEnabled: cloudflare.regionalServicesEnabled,
        customerMetadataBoundaryEnabled:
          cloudflare.customerMetadataBoundaryEnabled,
        encryptionConfigurationObserved:
          cloudflare.encryptionConfigurationObserved,
      }),
      "neon-postgresql": Object.freeze({
        regionId: neon.regionId,
        regionSource: neon.regionSource,
        encryptionConfigurationObserved: neon.encryptionConfigurationObserved,
      }),
    }),
    legalEvidence,
    dataFlows,
    criteria,
  });
}

export function deriveUlcLinzM5ProviderProductionEvidence(
  sourceEvidence,
  options = {},
) {
  const compliance = evaluateUlcLinzProviderCompliance(sourceEvidence, options);
  return Object.freeze(
    Object.fromEntries(
      ULC_LINZ_M5_G_CRITERIA.filter(
        (criterion) => compliance.criteria[criterion] === "verified",
      ).map((criterion) => [criterion, true]),
    ),
  );
}

function normalizeCloudflareEvidence(value) {
  assertPlainObject(value, "Cloudflare evidence");
  assertExactKeys(value, CLOUDFLARE_KEYS, "Cloudflare evidence");
  requireEnum(value.resourceClass, ["production", "preview"], "resourceClass");
  requireBoolean(value.runtimeBound, "runtimeBound");
  requireBoolean(value.routeBound, "routeBound");
  requireEnum(
    value.runtimeClass,
    ["standard-workers", "regional-services", "unknown"],
    "runtimeClass",
  );
  requireBoolean(value.bindingsInventoryComplete, "bindingsInventoryComplete");
  requireBoolean(value.telemetryInventoryComplete, "telemetryInventoryComplete");
  requireBoolean(value.transportEncryptionObserved, "transportEncryptionObserved");
  requireNullableBoolean(value.regionalServicesEnabled, "regionalServicesEnabled");
  requireNullableBoolean(
    value.customerMetadataBoundaryEnabled,
    "customerMetadataBoundaryEnabled",
  );
  if (!Array.isArray(value.bindings)) {
    throw new Error("Cloudflare evidence bindings must be an array.");
  }

  const bindings = value.bindings.map((binding) => {
    assertPlainObject(binding, "Cloudflare binding evidence");
    assertExactKeys(binding, BINDING_KEYS, "Cloudflare binding evidence");
    const type = requireNonEmptyString(binding.type, "binding type");
    requireEnum(
      binding.personalDataDisposition,
      ["none", "transient", "persistent", "unknown"],
      "personalDataDisposition",
    );
    return Object.freeze({ type, personalDataDisposition: binding.personalDataDisposition });
  });

  let unexpectedPersonalDataPersistence = null;
  if (value.bindingsInventoryComplete) {
    const hasUnknownBinding = bindings.some(
      (binding) => !KNOWN_CLOUDFLARE_BINDING_TYPES.includes(binding.type),
    );
    const hasUnknownDisposition = bindings.some(
      (binding) => binding.personalDataDisposition === "unknown",
    );
    const hasUnexpectedPersistence = bindings.some(
      (binding) => binding.personalDataDisposition === "persistent",
    );
    unexpectedPersonalDataPersistence =
      hasUnknownBinding || hasUnknownDisposition ? null : hasUnexpectedPersistence;
  }

  return Object.freeze({
    resourceClass: value.resourceClass,
    runtimeBound: value.runtimeBound,
    routeBound: value.routeBound,
    runtimeClass: value.runtimeClass,
    bindingsInventoryComplete: value.bindingsInventoryComplete,
    unexpectedPersonalDataPersistence,
    telemetryInventoryComplete: value.telemetryInventoryComplete,
    regionalServicesEnabled: value.regionalServicesEnabled,
    customerMetadataBoundaryEnabled: value.customerMetadataBoundaryEnabled,
    encryptionConfigurationObserved: value.transportEncryptionObserved === true,
  });
}

function normalizeNeonEvidence(value) {
  assertPlainObject(value, "Neon evidence");
  assertExactKeys(value, NEON_KEYS, "Neon evidence");
  requireEnum(value.resourceClass, ["production", "preview"], "resourceClass");
  requireBoolean(value.projectBound, "projectBound");
  requireBoolean(value.databaseBound, "databaseBound");
  const regionId =
    value.regionId === null
      ? null
      : requireNonEmptyString(value.regionId, "regionId");
  requireEnum(value.regionSource, ["provider-api", null], "regionSource");
  requireBoolean(value.transportEncryptionObserved, "transportEncryptionObserved");
  requireBoolean(value.atRestEncryptionObserved, "atRestEncryptionObserved");

  return Object.freeze({
    resourceClass: value.resourceClass,
    projectBound: value.projectBound,
    databaseBound: value.databaseBound,
    regionId,
    regionSource: value.regionSource,
    encryptionConfigurationObserved:
      value.transportEncryptionObserved === true &&
      value.atRestEncryptionObserved === true,
  });
}

function normalizeLegalEvidence(value, now) {
  if (!Array.isArray(value)) {
    throw new Error("ULC Linz M5-G legal evidence must be an array.");
  }

  return Object.freeze(
    value.map((entry) => {
      assertPlainObject(entry, "legal evidence entry");
      assertExactKeys(entry, LEGAL_EVIDENCE_KEYS, "legal evidence entry");
      requireEnum(entry.provider, LEGAL_PROVIDERS, "legal evidence provider");
      requireEnum(
        entry.documentType,
        LEGAL_DOCUMENT_TYPES,
        "legal evidence documentType",
      );
      const canonicalSource = requireNonEmptyString(
        entry.canonicalSource,
        "canonicalSource",
      );
      if (
        entry.documentVersionOrUpdatedAt !== null &&
        typeof entry.documentVersionOrUpdatedAt !== "string"
      ) {
        throw new Error(
          "legal evidence documentVersionOrUpdatedAt must be a string or null.",
        );
      }
      const serviceScope = requireNonEmptyString(entry.serviceScope, "serviceScope");
      requireBoolean(entry.accountSpecific, "accountSpecific");
      requireBoolean(entry.publicBaseline, "publicBaseline");
      requireNullableBoolean(
        entry.transferModelConsistentWithAdr022,
        "transferModelConsistentWithAdr022",
      );
      const window = parseEvidenceWindow(
        entry.observedAt,
        entry.validUntilOrReviewAt,
        "legal evidence entry",
      );

      return Object.freeze({
        provider: entry.provider,
        documentType: entry.documentType,
        canonicalSource,
        documentVersionOrUpdatedAt: entry.documentVersionOrUpdatedAt,
        serviceScope,
        observedAt: window.observedAt,
        validUntilOrReviewAt: window.validUntilOrReviewAt,
        accountSpecific: entry.accountSpecific,
        publicBaseline: entry.publicBaseline,
        transferModelConsistentWithAdr022:
          entry.transferModelConsistentWithAdr022,
        fresh: isFresh(window, now),
      });
    }),
  );
}

function normalizeDataFlows(value) {
  if (!Array.isArray(value)) {
    throw new Error("ULC Linz M5-G dataFlows must be an array.");
  }

  return Object.freeze(
    value.map((flow) => {
      assertPlainObject(flow, "data flow evidence");
      assertExactKeys(flow, DATA_FLOW_KEYS, "data flow evidence");
      const from = requireNonEmptyString(flow.from, "data flow from");
      const to = requireNonEmptyString(flow.to, "data flow to");
      const purpose = requireNonEmptyString(flow.purpose, "data flow purpose");
      requireEnum(flow.status, ["verified", "open"], "data flow status");
      return Object.freeze({ from, to, purpose, status: flow.status });
    }),
  );
}

function hasFreshLegalPair(entries, provider, documentType, qualifiers = {}) {
  const expectedServiceScope = ULC_LINZ_M5_G_LEGAL_SERVICE_SCOPES[provider];
  return entries.some((entry) => {
    if (
      entry.provider !== provider ||
      entry.documentType !== documentType ||
      entry.serviceScope !== expectedServiceScope ||
      entry.fresh !== true
    ) {
      return false;
    }
    return Object.entries(qualifiers).every(
      ([key, expected]) => entry[key] === expected,
    );
  });
}

function canonicalServiceScope(responsibilities) {
  if (!Array.isArray(responsibilities) || responsibilities.length === 0) {
    throw new Error("ULC Linz M5-G provider responsibilities are invalid.");
  }
  const normalized = responsibilities.map((responsibility) =>
    requireNonEmptyString(responsibility, "provider responsibility"),
  );
  if (new Set(normalized).size !== normalized.length) {
    throw new Error("ULC Linz M5-G provider responsibilities are invalid.");
  }
  return [...normalized].sort((left, right) => left.localeCompare(right)).join("+");
}

function parseNow(now) {
  if (now === undefined) return Date.now();
  if (now instanceof Date) {
    if (Number.isNaN(now.valueOf())) {
      throw new Error("ULC Linz M5-G evaluation clock is invalid.");
    }
    return now.valueOf();
  }
  if (typeof now === "string") {
    const parsed = Date.parse(now);
    if (Number.isNaN(parsed)) {
      throw new Error("ULC Linz M5-G evaluation clock is invalid.");
    }
    return parsed;
  }
  throw new Error("ULC Linz M5-G evaluation clock is invalid.");
}

function parseEvidenceWindow(observedAt, validUntilOrReviewAt, label) {
  const observed = parseIsoInstant(observedAt, `${label} observedAt`);
  const validUntil = parseIsoInstant(
    validUntilOrReviewAt,
    `${label} validUntilOrReviewAt`,
  );
  if (observed > validUntil) {
    throw new Error(`${label} freshness window is invalid.`);
  }
  return Object.freeze({
    observedAt,
    validUntilOrReviewAt,
    observed,
    validUntil,
  });
}

function isFresh(window, now) {
  return window.observed <= now && now < window.validUntil;
}

function parseIsoInstant(value, label) {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
    throw new Error(`${label} must be an ISO-8601 timestamp.`);
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed) || !/[zZ]|[+-]\d{2}:\d{2}$/.test(value)) {
    throw new Error(`${label} must be an ISO-8601 timestamp with timezone.`);
  }
  return parsed;
}

function requireNonEmptyString(value, label) {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length === 0
  ) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function requireBoolean(value, label) {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be boolean.`);
  }
}

function requireNullableBoolean(value, label) {
  if (value !== null && typeof value !== "boolean") {
    throw new Error(`${label} must be boolean or null.`);
  }
}

function requireEnum(value, allowed, label) {
  if (!allowed.includes(value)) {
    throw new Error(`${label} is invalid.`);
  }
}

function assertPlainObject(value, label) {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain object.`);
  }
}

function assertExactKeys(value, expectedKeys, label) {
  const actualKeys = Reflect.ownKeys(value);
  if (
    actualKeys.some((key) => typeof key !== "string") ||
    actualKeys.length !== expectedKeys.length ||
    !expectedKeys.every((key) => Object.hasOwn(value, key))
  ) {
    throw new Error(`${label} fields are invalid.`);
  }

  for (const key of actualKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !Object.hasOwn(descriptor, "value") ||
      descriptor.enumerable !== true
    ) {
      throw new Error(`${label} fields are invalid.`);
    }
  }
}

function assertNoSensitiveData(value, path = "evidence") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertNoSensitiveData(entry, `${path}[${index}]`),
    );
    return;
  }
  if (typeof value === "string") {
    if (SENSITIVE_STRING_PATTERNS.some((pattern) => pattern.test(value))) {
      throw new Error(
        `ULC Linz M5-G source evidence contains sensitive data at ${path}.`,
      );
    }
    return;
  }
  if (value === null || typeof value !== "object") return;

  assertPlainObject(value, path);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || SENSITIVE_KEY_PATTERN.test(key)) {
      throw new Error(
        `ULC Linz M5-G source evidence contains sensitive data at ${path}.`,
      );
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !Object.hasOwn(descriptor, "value") ||
      descriptor.enumerable !== true
    ) {
      throw new Error(
        `ULC Linz M5-G source evidence contains unsafe fields at ${path}.`,
      );
    }
    assertNoSensitiveData(descriptor.value, `${path}.${key}`);
  }
}

function assertCanonicalInventory() {
  if (
    INVENTORY.schemaVersion !== 1 ||
    INVENTORY.application !== ULC_LINZ_M5_TARGET_POLICY.appId ||
    INVENTORY.m5?.providerScope !== "cloudflare-and-neon-postgresql-only" ||
    INVENTORY.m5?.baselineIsProductionEvidence !== false
  ) {
    throw new Error("ULC Linz M5-G provider inventory is not canonical.");
  }

  const providerIds = INVENTORY.providerScope.map((provider) => provider.id);
  if (
    providerIds.length !== 2 ||
    !providerIds.includes("cloudflare") ||
    !providerIds.includes("neon-postgresql")
  ) {
    throw new Error("ULC Linz M5-G provider inventory scope is invalid.");
  }

  for (const provider of INVENTORY.providerScope) {
    canonicalServiceScope(provider.responsibilities);
  }

  const neon = INVENTORY.providerScope.find(
    (provider) => provider.id === "neon-postgresql",
  );
  if (
    neon?.productionDatabaseRegionTarget !==
    ULC_LINZ_M5_TARGET_POLICY.productionDatabaseRegionTarget
  ) {
    throw new Error("ULC Linz M5-G provider inventory region target drifted.");
  }
}
