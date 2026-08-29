import { expect, test } from "vitest";

import { createPostgresDatabase } from "@appbasis/database/postgres-runtime";

const RUN_FLAG = "RUN-ULC-M5-PRIVATE-SECURITY-SMOKE";
const shouldRun = process.env.ULC_LINZ_PRIVATE_SECURITY_SMOKE === RUN_FLAG;

(shouldRun ? test : test.skip)(
  "observes the denied identity event emitted through the active remote Hyperdrive binding",
  async () => {
    const securityLogReadDatabaseUrl = requiredSecret(
      process.env.ULC_LINZ_SECURITY_LOG_READ_DATABASE_URL,
      "ULC security-log read database URL",
    );
    const startedAt = requiredTimestamp(
      process.env.ULC_LINZ_SECURITY_SMOKE_STARTED_AT,
    );

    const database = createPostgresDatabase(securityLogReadDatabaseUrl);
    try {
      const rows = await database.client.unsafe(
        `SELECT count(*)::bigint AS event_count
           FROM public.ulc_linz_security_event_log
          WHERE app_id = 'ulc-linz'
            AND schema_version = 1
            AND category = 'security'
            AND event_type = 'identity.request.denied'
            AND operation = 'session'
            AND occurred_at >= $1::timestamptz
            AND recorded_at >= $1::timestamptz`,
        [startedAt],
      );
      expect(Array.isArray(rows)).toBe(true);
      expect(rows).toHaveLength(1);
      expect(requiredPositiveBigInt(rows[0]?.event_count)).toBeGreaterThan(0n);
    } finally {
      await database.client.end().catch(() => {});
    }
  },
);

function requiredSecret(value: string | undefined, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 4096 ||
    value !== value.trim()
  ) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function requiredTimestamp(value: string | undefined): string {
  if (typeof value !== "string" || value.length > 40 || value !== value.trim()) {
    throw new Error("ULC security smoke timestamp is invalid.");
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error("ULC security smoke timestamp is invalid.");
  }
  return value;
}

function requiredPositiveBigInt(value: unknown): bigint {
  if (
    (typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "bigint") ||
    (typeof value === "string" && !/^[0-9]+$/.test(value)) ||
    (typeof value === "number" && (!Number.isSafeInteger(value) || value < 0))
  ) {
    throw new Error("ULC security-log event count is invalid.");
  }
  const count = BigInt(value);
  if (count < 0n) {
    throw new Error("ULC security-log event count is invalid.");
  }
  return count;
}
