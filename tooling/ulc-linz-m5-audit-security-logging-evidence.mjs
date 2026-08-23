import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { evaluateUlcLinzProductionResourceBinding } from "./ulc-linz-m6-production-resource-binding.mjs";

const EMPTY = Object.freeze({});
const VERIFIED = Object.freeze({ auditSecurityLogging: true });
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const ROOT_FIELDS = Object.freeze(["resourceBindingEvidence", "loggingEvidence"]);
const LOGGING_FIELDS = Object.freeze([
  "schemaVersion", "application", "environment", "observedAt", "validUntilOrReviewAt",
  "inventorySource", "runtimeBindingId", "sinkBindingId", "sinkIdentitySource",
  "structuredEventCaptureEnabled", "protectedOperationalAccess", "retentionMode",
  "retentionEvidence", "sinkInventoryComplete", "publicReadEndpointPresent",
]);
const PROVIDER_NATIVE_RETENTION_FIELDS = Object.freeze([
  "source", "retentionValue", "retentionUnit", "calendarSemanticsVerified",
  "noEarlyDeleteVerified", "noUncontrolledOverRetentionVerified",
]);
const CONTROLLED_RETENTION_FIELDS = Object.freeze([
  "source", "providerMinimumRetentionVerified", "cutoffSemantics",
  "cleanupExecutionBound", "cleanupLastSucceededAt", "cleanupResultVerified",
  "boundaryEventPreserved", "clientCutoffOverridePresent", "enforcementContractDigest",
]);
const CONTRACT_FILES = Object.freeze([
  ["apps/ulc-linz/worker/app.ts", new URL("../apps/ulc-linz/worker/app.ts", import.meta.url), "3acdcd47bf696c23334c15a11fe80c70368d608c"],
  ["apps/ulc-linz/worker/authorization.ts", new URL("../apps/ulc-linz/worker/authorization.ts", import.meta.url), "a39b41853b120e56d55a14bb75d4aa231c22843b"],
  ["apps/ulc-linz/worker/security-events.ts", new URL("../apps/ulc-linz/worker/security-events.ts", import.meta.url), "cc3a972b65ffd09350d752236827c8df922d9b77"],
  ["apps/ulc-linz/worker/security-events-postgres.ts", new URL("../apps/ulc-linz/worker/security-events-postgres.ts", import.meta.url), "f8a30cca9a7379cc59543d2d7abdd5d26281f605"],
  ["apps/ulc-linz/migrations/0002_ulc_linz_security_event_log.sql", new URL("../apps/ulc-linz/migrations/0002_ulc_linz_security_event_log.sql", import.meta.url), "0dea6b9c751e559b06e14d2d2e603bb9a99372d4"],
  ["apps/ulc-linz/migrations/0003_ulc_linz_security_event_access.sql", new URL("../apps/ulc-linz/migrations/0003_ulc_linz_security_event_access.sql", import.meta.url), "11abd026d8d5adaffee23564423f3d41fc082ddd"],
]);
const CONTROLLED_RETENTION_CONTRACT_FILES = Object.freeze([
  ["apps/ulc-linz/migrations/0002_ulc_linz_security_event_log.sql", new URL("../apps/ulc-linz/migrations/0002_ulc_linz_security_event_log.sql", import.meta.url)],
  ["apps/ulc-linz/migrations/0003_ulc_linz_security_event_access.sql", new URL("../apps/ulc-linz/migrations/0003_ulc_linz_security_event_access.sql", import.meta.url)],
  ["apps/ulc-linz/worker/security-events-postgres.ts", new URL("../apps/ulc-linz/worker/security-events-postgres.ts", import.meta.url)],
]);

export const ULC_LINZ_M5_F_CONTROLLED_RETENTION_CONTRACT_DIGEST =
  digestContract(CONTROLLED_RETENTION_CONTRACT_FILES);

export function deriveUlcLinzM5FAuditSecurityLoggingEvidence(input, { now = new Date() } = {}) {
  try {
    const root = exactRecord(input, ROOT_FIELDS);
    const nowDate = requiredDate(now);
    evaluateUlcLinzProductionResourceBinding(root.resourceBindingEvidence, { now: nowDate });
    assertCurrentContract();
    const logging = exactRecord(root.loggingEvidence, LOGGING_FIELDS);
    if (
      logging.schemaVersion !== 1 || logging.application !== "ulc-linz" ||
      logging.environment !== "production" || logging.inventorySource !== "provider-api" ||
      logging.sinkIdentitySource !== "provider-api" ||
      logging.structuredEventCaptureEnabled !== true || logging.protectedOperationalAccess !== true ||
      logging.sinkInventoryComplete !== true || logging.publicReadEndpointPresent !== false
    ) return EMPTY;
    if (
      logging.observedAt !== root.resourceBindingEvidence.observedAt ||
      logging.validUntilOrReviewAt !== root.resourceBindingEvidence.validUntilOrReviewAt ||
      logging.runtimeBindingId !== root.resourceBindingEvidence.cloudflare.runtimeBindingId
    ) return EMPTY;
    opaque(logging.runtimeBindingId);
    opaque(logging.sinkBindingId);
    if (!retentionVerified(logging.retentionMode, logging.retentionEvidence, nowDate)) return EMPTY;
    const observedAt = timestamp(logging.observedAt);
    if (!observedAt || nowDate < observedAt || nowDate.getTime() - observedAt.getTime() >= MAX_AGE_MS) return EMPTY;
    return VERIFIED;
  } catch {
    return EMPTY;
  }
}

function retentionVerified(mode, evidence, nowDate) {
  if (mode === "provider-native-calendar") {
    const value = exactRecord(evidence, PROVIDER_NATIVE_RETENTION_FIELDS);
    return (
      value.source === "provider-api-and-authoritative-contract" &&
      value.retentionValue === 12 &&
      value.retentionUnit === "calendar-months" &&
      value.calendarSemanticsVerified === true &&
      value.noEarlyDeleteVerified === true &&
      value.noUncontrolledOverRetentionVerified === true
    );
  }
  if (mode === "controlled-calendar-enforcement") {
    const value = exactRecord(evidence, CONTROLLED_RETENTION_FIELDS);
    const cleanupLastSucceededAt = timestamp(value.cleanupLastSucceededAt);
    opaqueDigest(value.enforcementContractDigest);
    return (
      value.source === "controlled-calendar-enforcement" &&
      value.providerMinimumRetentionVerified === true &&
      value.cutoffSemantics === "occurred-at-strictly-older-than-12-calendar-months" &&
      value.cleanupExecutionBound === true &&
      cleanupLastSucceededAt !== null &&
      cleanupLastSucceededAt <= nowDate &&
      nowDate.getTime() - cleanupLastSucceededAt.getTime() < MAX_AGE_MS &&
      value.cleanupResultVerified === true &&
      value.boundaryEventPreserved === true &&
      value.clientCutoffOverridePresent === false &&
      value.enforcementContractDigest === ULC_LINZ_M5_F_CONTROLLED_RETENTION_CONTRACT_DIGEST
    );
  }
  return false;
}

function assertCurrentContract() {
  for (const [, url, expected] of CONTRACT_FILES) {
    const raw = readFileSync(url, "utf8");
    const content = raw.replaceAll("\r\n", "\n");
    const actual = createHash("sha1")
      .update(`blob ${Buffer.byteLength(content, "utf8")}\0`, "utf8")
      .update(content, "utf8")
      .digest("hex");
    if (actual !== expected) throw new Error("M5-F contract drifted");
  }
}

function digestContract(files) {
  const hash = createHash("sha256");
  for (const [path, url] of files) {
    const content = readFileSync(url, "utf8").replaceAll("\r\n", "\n");
    hash.update(path, "utf8");
    hash.update("\0", "utf8");
    hash.update(content, "utf8");
    hash.update("\0", "utf8");
  }
  return `sha256:${hash.digest("hex")}`;
}

function exactRecord(value, fields) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).length !== 0) throw new Error("invalid M5-F evidence");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors);
  if (keys.length !== fields.length || fields.some((field) => !Object.hasOwn(descriptors, field)) || keys.some((field) => !fields.includes(field))) throw new Error("invalid M5-F evidence");
  if (Object.values(descriptors).some((descriptor) => !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true || descriptor.get !== undefined || descriptor.set !== undefined)) throw new Error("invalid M5-F evidence");
  return value;
}

function opaque(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 200 || value !== value.trim() || !/^[A-Za-z0-9._:-]+$/.test(value)) throw new Error("invalid M5-F identifier");
}
function opaqueDigest(value) {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value)) throw new Error("invalid M5-F enforcement digest");
}
function timestamp(value) {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value ? parsed : null;
}
function requiredDate(value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new Error("invalid M5-F clock");
  return new Date(value.getTime());
}
