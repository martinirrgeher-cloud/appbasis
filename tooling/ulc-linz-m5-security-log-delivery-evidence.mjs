import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import { parseUlcLinzProductionDatabaseUrl } from "./ulc-linz-m6-production-hyperdrive.mjs";

const MAX_AGE_NS = 24n * 60n * 60n * 1_000_000_000n;
const CANONICAL_UTC_PATTERN = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/;
const DATABASE_UTC_PATTERN = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(?:Z|\+00(?::?00)?)$/;
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
  const invocationObserved = dateTimestamp(requiredDate(now));
  if (deployed.epochNanoseconds > invocationObserved.epochNanoseconds) {
    throw new Error("ULC M5-F deployed runtime timestamp is in the future.");
  }

  const database = databaseFactory(productionDatabaseUrl);
  try {
    const rows = await database.client.unsafe(`
      SELECT
        count(*)::bigint AS event_count,
        to_char(
          max(recorded_at) AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
        ) AS latest_recorded_at,
        to_char(
          statement_timestamp() AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
        ) AS observed_at
      FROM public.ulc_linz_security_event_log
      WHERE app_id = 'ulc-linz'
        AND schema_version = 1
        AND category = 'security'
        AND event_type IN ('identity.request.denied', 'authorization.denied')
        AND occurred_at >= $1::timestamptz
        AND recorded_at >= $1::timestamptz
        AND recorded_at <= statement_timestamp()
    `, [deployed.date.toISOString()]);
    if (!Array.isArray(rows) || rows.length !== 1) {
      throw new Error("ULC M5-F production sink activity observation is invalid.");
    }
    const count = requiredCount(rows[0]?.event_count);
    const latestRecordedAt =
      rows[0]?.latest_recorded_at === null
        ? null
        : databaseTimestamp(rows[0]?.latest_recorded_at, "latestRecordedAt").canonical;
    const observedAt = databaseTimestamp(rows[0]?.observed_at, "observedAt").canonical;
    return evaluateUlcLinzM5SecurityLogDeliverySnapshot({
      eventCount: count,
      latestRecordedAt,
      deployedAt: deployed.canonical,
      observedAt,
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
  if (deployedAt.epochNanoseconds > observedAt.epochNanoseconds) {
    throw new Error("ULC M5-F sink activity evidence window is invalid.");
  }
  if (eventCount === 0n || root.latestRecordedAt === null) {
    throw new Error("ULC M5-F has no post-deployment production sink activity evidence.");
  }
  const latestRecordedAt = canonicalTimestamp(
    root.latestRecordedAt,
    "latestRecordedAt",
  );
  if (
    latestRecordedAt.epochNanoseconds < deployedAt.epochNanoseconds ||
    latestRecordedAt.epochNanoseconds > observedAt.epochNanoseconds ||
    observedAt.epochNanoseconds - latestRecordedAt.epochNanoseconds >= MAX_AGE_NS
  ) {
    throw new Error("ULC M5-F production sink activity evidence is stale or pre-deployment.");
  }
  return Object.freeze({ postDeploymentSinkActivityObserved: true });
}

function exactRecord(value, fields) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) {
    throw new Error("ULC M5-F sink activity evidence is invalid.");
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
    throw new Error("ULC M5-F sink activity evidence is invalid.");
  }
  return value;
}

function canonicalTimestamp(value, label) {
  if (value instanceof Date) return dateTimestamp(value, label);
  if (typeof value !== "string") {
    throw new Error(`ULC M5-F ${label} is invalid.`);
  }
  return parsedTimestamp(value, CANONICAL_UTC_PATTERN, label);
}

function databaseTimestamp(value, label) {
  if (typeof value !== "string") {
    throw new Error(`ULC M5-F ${label} is invalid.`);
  }
  return parsedTimestamp(value, DATABASE_UTC_PATTERN, label);
}

function dateTimestamp(value, label = "timestamp") {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error(`ULC M5-F ${label} is invalid.`);
  }
  const date = new Date(value.getTime());
  return Object.freeze({
    date,
    epochNanoseconds: BigInt(date.getTime()) * 1_000_000n,
    canonical: date.toISOString(),
  });
}

function parsedTimestamp(value, pattern, label) {
  const match = pattern.exec(value);
  if (match === null) {
    throw new Error(`ULC M5-F ${label} is invalid.`);
  }
  const fraction = match[3] ?? "";
  const milliseconds = fraction.padEnd(3, "0").slice(0, 3);
  const canonicalMilliseconds = `${match[1]}T${match[2]}.${milliseconds}Z`;
  const date = new Date(canonicalMilliseconds);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== canonicalMilliseconds) {
    throw new Error(`ULC M5-F ${label} is invalid.`);
  }
  const nanosecondsWithinMillisecond = BigInt((fraction.padEnd(9, "0").slice(3) || "0"));
  const canonical = fraction.length === 0
    ? `${match[1]}T${match[2]}Z`
    : `${match[1]}T${match[2]}.${fraction}Z`;
  return Object.freeze({
    date,
    epochNanoseconds: BigInt(date.getTime()) * 1_000_000n + nanosecondsWithinMillisecond,
    canonical,
  });
}

function requiredDate(value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error("ULC M5-F sink activity evidence clock is invalid.");
  }
  return new Date(value.getTime());
}

function requiredCount(value) {
  const text = typeof value === "bigint" ? value.toString() : String(value);
  if (!/^(0|[1-9][0-9]*)$/.test(text)) {
    throw new Error("ULC M5-F sink activity event count is invalid.");
  }
  return BigInt(text);
}
