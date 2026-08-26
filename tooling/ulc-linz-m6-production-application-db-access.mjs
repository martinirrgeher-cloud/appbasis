import { ULC_LINZ_M5_TARGET_POLICY } from "./ulc-linz-m5-target-policy.mjs";

const APPLICATION = ULC_LINZ_M5_TARGET_POLICY.appId;
const ENVIRONMENT = "production";
const CONNECTION_PATH = "cloudflare-hyperdrive";
const IDENTITY_SOURCE = "postgres-system-catalog";
const INVENTORY_SCOPE = "current-database-all-user-objects";

const ROOT_FIELDS = Object.freeze([
  "schemaVersion",
  "application",
  "environment",
  "observedAt",
  "validUntilOrReviewAt",
  "runtime",
  "databasePrincipal",
]);
const RUNTIME_FIELDS = Object.freeze([
  "connectionPath",
  "bindingIdentity",
  "productionBindingVerified",
  "localFallbackPersistenceAbsent",
]);
const DATABASE_PRINCIPAL_FIELDS = Object.freeze([
  "identitySource",
  "observedBindingIdentity",
  "inventoryScope",
  "ownershipInventoryComplete",
  "directGrantInventoryComplete",
  "roleIdentity",
  "migrationRoleIdentity",
  "login",
  "superuser",
  "bypassRls",
  "createDb",
  "createRole",
  "replication",
  "unexpectedRoleMembershipAbsent",
  "unexpectedDatabaseOwnershipAbsent",
  "unexpectedSchemaOwnershipAbsent",
  "unexpectedRelationOwnershipAbsent",
  "unexpectedDirectObjectPrivilegesAbsent",
  "requiredApplicationAccessVerified",
]);

const UNSAFE_FIELD_PATTERN =
  /(?:authorization|cookie|password|secret|token|credential|connectionstring|databaseurl|api[_-]?key|requestbody|responsebody)/i;
const UNSAFE_VALUE_PATTERNS = Object.freeze([
  /^postgres(?:ql)?:\/\//i,
  /^bearer\s+/i,
  /^basic\s+/i,
]);

export const ULC_LINZ_M6_PRODUCTION_APPLICATION_DB_ACCESS_CONTRACT =
  Object.freeze({
    schemaVersion: 1,
    application: APPLICATION,
    environment: ENVIRONMENT,
    connectionPath: CONNECTION_PATH,
    identitySource: IDENTITY_SOURCE,
    inventoryScope: INVENTORY_SCOPE,
  });

export class UlcLinzM6ProductionApplicationDbAccessError extends Error {
  constructor(code) {
    super("ULC Linz production application database access evidence is not valid.");
    this.name = "UlcLinzM6ProductionApplicationDbAccessError";
    this.code = code;
  }
}

export function evaluateUlcLinzM6ProductionApplicationDbAccess(
  evidence,
  { now = new Date() } = {},
) {
  assertCanonicalContract();
  assertSafeEvidenceTree(evidence);
  const root = exactRecord(evidence, ROOT_FIELDS, "INVALID_EVIDENCE");
  if (
    root.schemaVersion !== 1 ||
    root.application !== APPLICATION ||
    root.environment !== ENVIRONMENT
  ) {
    fail("INVALID_EVIDENCE");
  }

  const observedAt = canonicalTimestamp(root.observedAt);
  const validUntilOrReviewAt = canonicalTimestamp(root.validUntilOrReviewAt);
  const nowDate = requiredDate(now);
  if (
    observedAt.getTime() > nowDate.getTime() ||
    validUntilOrReviewAt.getTime() <= observedAt.getTime() ||
    validUntilOrReviewAt.getTime() <= nowDate.getTime()
  ) {
    fail("STALE_EVIDENCE");
  }

  const runtime = exactRecord(
    root.runtime,
    RUNTIME_FIELDS,
    "RUNTIME_DATABASE_PATH_MISMATCH",
  );
  requireOpaqueIdentifier(runtime.bindingIdentity, "RUNTIME_DATABASE_PATH_MISMATCH");
  if (
    runtime.connectionPath !== CONNECTION_PATH ||
    runtime.productionBindingVerified !== true ||
    runtime.localFallbackPersistenceAbsent !== true
  ) {
    fail("RUNTIME_DATABASE_PATH_MISMATCH");
  }

  const principal = exactRecord(
    root.databasePrincipal,
    DATABASE_PRINCIPAL_FIELDS,
    "APPLICATION_PRINCIPAL_MISMATCH",
  );
  if (principal.identitySource !== IDENTITY_SOURCE) {
    fail("APPLICATION_PRINCIPAL_MISMATCH");
  }
  requireOpaqueIdentifier(
    principal.observedBindingIdentity,
    "APPLICATION_PRINCIPAL_MISMATCH",
  );
  requireOpaqueIdentifier(
    principal.roleIdentity,
    "APPLICATION_PRINCIPAL_MISMATCH",
  );
  requireOpaqueIdentifier(
    principal.migrationRoleIdentity,
    "APPLICATION_PRINCIPAL_MISMATCH",
  );
  if (
    principal.observedBindingIdentity !== runtime.bindingIdentity ||
    principal.inventoryScope !== INVENTORY_SCOPE ||
    principal.ownershipInventoryComplete !== true ||
    principal.directGrantInventoryComplete !== true ||
    principal.roleIdentity === principal.migrationRoleIdentity ||
    principal.login !== true ||
    principal.superuser !== false ||
    principal.bypassRls !== false ||
    principal.createDb !== false ||
    principal.createRole !== false ||
    principal.replication !== false ||
    principal.unexpectedRoleMembershipAbsent !== true ||
    principal.unexpectedDatabaseOwnershipAbsent !== true ||
    principal.unexpectedSchemaOwnershipAbsent !== true ||
    principal.unexpectedRelationOwnershipAbsent !== true ||
    principal.unexpectedDirectObjectPrivilegesAbsent !== true ||
    principal.requiredApplicationAccessVerified !== true
  ) {
    fail("APPLICATION_PRINCIPAL_MISMATCH");
  }

  return deepFreeze({
    schemaVersion: 1,
    application: APPLICATION,
    environment: ENVIRONMENT,
    observedAt: observedAt.toISOString(),
    validUntilOrReviewAt: validUntilOrReviewAt.toISOString(),
    productionDatabasePathVerified: true,
    productionBindingPrincipalObserved: true,
    localFallbackPersistenceAbsent: true,
    dedicatedApplicationPrincipalVerified: true,
    migrationPrincipalSeparated: true,
    privilegedDatabaseCapabilitiesAbsent: true,
    unexpectedDatabaseOwnershipAbsent: true,
    unexpectedSchemaOwnershipAbsent: true,
    unexpectedRelationOwnershipAbsent: true,
    unexpectedDirectObjectPrivilegesAbsent: true,
    requiredApplicationAccessVerified: true,
    scopeComplete: true,
  });
}

function assertCanonicalContract() {
  if (
    APPLICATION !== "ulc-linz" ||
    ULC_LINZ_M5_TARGET_POLICY.productionDatabaseRegionTarget !== "EU / Frankfurt"
  ) {
    fail("CONTRACT_DRIFT");
  }
}

function exactRecord(value, fields, code) {
  if (!isPlainRecord(value)) fail(code);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors);
  const expected = new Set(fields);
  if (
    keys.length !== fields.length ||
    fields.some((field) => !Object.hasOwn(descriptors, field)) ||
    keys.some((field) => !expected.has(field))
  ) {
    fail(code);
  }
  for (const descriptor of Object.values(descriptors)) {
    if (!("value" in descriptor) || descriptor.get !== undefined || descriptor.set !== undefined) {
      fail("UNSAFE_EVIDENCE");
    }
  }
  return value;
}

function assertSafeEvidenceTree(value, seen = new Set()) {
  if (value === null) return;
  if (typeof value === "string") {
    if (
      value.includes("\0") ||
      UNSAFE_VALUE_PATTERNS.some((pattern) => pattern.test(value))
    ) {
      fail("UNSAFE_EVIDENCE");
    }
    return;
  }
  if (typeof value === "boolean" || typeof value === "number") return;
  if (!isPlainRecord(value) || seen.has(value)) fail("UNSAFE_EVIDENCE");
  seen.add(value);
  if (Object.getOwnPropertySymbols(value).length > 0) fail("UNSAFE_EVIDENCE");

  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (UNSAFE_FIELD_PATTERN.test(key)) fail("UNSAFE_EVIDENCE");
    if (!("value" in descriptor) || descriptor.get !== undefined || descriptor.set !== undefined) {
      fail("UNSAFE_EVIDENCE");
    }
    assertSafeEvidenceTree(descriptor.value, seen);
  }
  seen.delete(value);
}

function isPlainRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireOpaqueIdentifier(value, code) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 200 ||
    value !== value.trim() ||
    !/^[A-Za-z0-9._:-]+$/.test(value)
  ) {
    fail(code);
  }
}

function canonicalTimestamp(value) {
  if (typeof value !== "string") fail("INVALID_EVIDENCE");
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    fail("INVALID_EVIDENCE");
  }
  return parsed;
}

function requiredDate(value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    fail("INVALID_EVIDENCE");
  }
  return value;
}

function deepFreeze(value) {
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === "object") deepFreeze(child);
  }
  return Object.freeze(value);
}

function fail(code) {
  throw new UlcLinzM6ProductionApplicationDbAccessError(code);
}
