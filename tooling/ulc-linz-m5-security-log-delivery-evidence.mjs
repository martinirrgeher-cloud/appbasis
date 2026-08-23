import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import { parseUlcLinzProductionDatabaseUrl } from "./ulc-linz-m6-production-hyperdrive.mjs";

const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const ROOT_FIELDS = Object.freeze([
  "eventCount",
  "latestRecordedAt",
  "deployedAt",
  "observedAt",
]);

export async function collectUlcLinzM5SecurityLogDeliveryEvidence(
  { productionDatabaseUrl, deployedAt },
  { databaseFactory = createPostgresDatabase, now = new Date() } = {},
) {
  if (typeof databaseFactory !== "function") {
    throw new Error("ULC M5-F delivery database factory is invalid.");
  }
  parseUlcLinzProductionDatabaseUrl(productionDatabaseUrl);
  const deployed = canonicalTimestamp(deployedAt, "deployedAt");
  const observed = requiredDate(now);
  if (deployed.getTime() > observed.getTime()) {
    throw new Error("ULC M5-F deployed runtime timestamp is in the future.");
  }

  const database = databaseFactory(productionDatabaseUrl);
  try {
    const rows = await database.client.unsafe(`
      SELECT
        count(*)::bigint AS event_count,
        max(recorded_at) AS latest_recorded_at
      FROM public.ulc_linz_security_event_log
      WHERE app_id = 'ulc-linz'
        AND schema_version = 1
    `);
    if (!Array.isArray(rows) || rows.length !== 1) {
      throw new Error("ULC M5-F production delivery observation is invalid.");
    }
    const count = requiredCount(rows[0]?.event_count);
    const latestRecordedAt =
      rows[0]?.latest_recorded_at === null
        ? null
        : canonicalTimestamp(rows[0]?.latest_recorded_at, "latestRecordedAt").toISOString();
    return evaluateUlcLinzM5SecurityLogDeliverySnapshot({
      eventCount: count,
      latestRecordedAt,
      deployedAt: deployed.toISOString(),
      observedAt: observed.toISOString(),
    });
  } finally {
    await database.client.end().catch(() => {});
  }
}

export function evaluateUlcLinzM5SecurityLogDeliverySnapshot(value) {
  const root = exactRecord(value, ROOT_FIELDS);
  const eventCount = requiredCount(root.eventCount);
  const deployedAt = canonicalTimestamp(root.deployedAt, "deployedAt");
  const observedAt = canonicalTimestamp(root.observedAt, "observedAt");
  if (deployedAt.getTime() > observedAt.getTime()) {
    throw new Error("ULC M5-F delivery evidence window is invalid.");
  }
  if (eventCount === 0n || root.latestRecordedAt === null) {
    throw new Error("ULC M5-F has no real production sink delivery evidence.");
  }
  const latestRecordedAt = canonicalTimestamp(
    root.latestRecordedAt,
    "latestRecordedAt",
  );
  if (
    latestRecordedAt.getTime() < deployedAt.getTime() ||
    latestRecordedAt.getTime() > observedAt.getTime() ||
    observedAt.getTime() - latestRecordedAt.getTime() >= MAX_AGE_MS
  ) {
    throw new Error("ULC M5-F production sink delivery evidence is stale or pre-deployment.");
  }
  return Object.freeze({ runtimeDeliveryVerified: true });
}

function exactRecord(value, fields) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) {
    throw new Error("ULC M5-F delivery evidence is invalid.");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors);
  if (
    keys.length !== fields.length ||
    fields.some((field) => !Object.hasOwn(descriptors, field)) ||
    keys.some((key) => !fields.includes(key)) ||
    Object.values(descriptors).some(
      (descriptor) =>
        !Object.hasOwn(descriptor, "value") ||
        descriptor.enumerable !== true ||
        descriptor.get !== undefined ||
        descriptor.set !== undefined,
    )
  ) {
    throw new Error("ULC M5-F delivery evidence is invalid.");
  }
  return value;
}

function canonicalTimestamp(value, label) {
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (
    (typeof value !== "string" && !(value instanceof Date)) ||
    !Number.isFinite(parsed.getTime()) ||
    (typeof value === "string" && parsed.toISOString() !== value)
  ) {
    throw new Error(`ULC M5-F ${label} is invalid.`);
  }
  return parsed;
}

function requiredDate(value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error("ULC M5-F delivery evidence clock is invalid.");
  }
  return new Date(value.getTime());
}

function requiredCount(value) {
  const text = typeof value === "bigint" ? value.toString() : String(value);
  if (!/^(0|[1-9][0-9]*)$/.test(text)) {
    throw new Error("ULC M5-F delivery event count is invalid.");
  }
  return BigInt(text);
}
