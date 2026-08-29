import { expect, test } from "vitest";

import { createPostgresDatabase } from "@appbasis/database/postgres-runtime";

const RUN_FLAG = "RUN-ULC-M5-PRIVATE-SECURITY-SMOKE";
const shouldRun = process.env.ULC_LINZ_PRIVATE_SECURITY_SMOKE === RUN_FLAG;

(shouldRun ? test : test.skip)(
  "observes exactly one denied identity event emitted by this remote smoke",
  async () => {
    const securityLogReadDatabaseUrl = requiredSecret(
      process.env.ULC_LINZ_SECURITY_LOG_READ_DATABASE_URL,
      "ULC security-log read database URL",
    );
    const startedAt = requiredTimestamp(
      process.env.ULC_LINZ_SECURITY_SMOKE_STARTED_AT,
    );
    const baselineCount = requiredNonNegativeBigInt(
      process.env.ULC_LINZ_SECURITY_SMOKE_BASELINE_COUNT,
      "ULC security smoke baseline count",
    );

    const database = createPostgresDatabase(securityLogReadDatabaseUrl);
    try {
      const rows = await database.client.unsafe(
        `SELECT
           count(*)::bigint AS total_count,
           count(*) FILTER (
             WHERE occurred_at >= $1::timestamptz
               AND recorded_at >= $1::timestamptz
           )::bigint AS smoke_window_count
         FROM public.ulc_linz_security_event_log
         WHERE app_id = 'ulc-linz'
           AND schema_version = 1
           AND category = 'security'
           AND event_type = 'identity.request.denied'
           AND operation = 'session'
           AND action = 'session'
           AND target_type = 'identity-endpoint'
           AND target_id = 'session'
           AND http_status = 401
           AND error_code = 'SESSION_INVALID'`,
        [startedAt],
      );
      expect(Array.isArray(rows)).toBe(true);
      expect(rows).toHaveLength(1);
      const totalCount = requiredNonNegativeBigInt(
        rows[0]?.total_count,
        "ULC security-log total count",
      );
      const smokeWindowCount = requiredNonNegativeBigInt(
        rows[0]?.smoke_window_count,
        "ULC security-log smoke-window count",
      );
      expect(totalCount).toBe(baselineCount + 1n);
      expect(smokeWindowCount).toBe(1n);
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

function requiredNonNegativeBigInt(value: unknown, label: string): bigint {
  if (
    (typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "bigint") ||
    (typeof value === "string" && !/^[0-9]+$/.test(value)) ||
    (typeof value === "number" && (!Number.isSafeInteger(value) || value < 0))
  ) {
    throw new Error(`${label} is invalid.`);
  }
  const count = BigInt(value);
  if (count < 0n) {
    throw new Error(`${label} is invalid.`);
  }
  return count;
}
