import { expect, test } from "vitest";

import { createPostgresDatabase } from "@appbasis/database/postgres-runtime";

import { createGeneratedWorker } from "../worker/index";

const RUN_FLAG = "RUN-ULC-M5-PRIVATE-SECURITY-SMOKE";
const shouldRun = process.env.ULC_LINZ_PRIVATE_SECURITY_SMOKE === RUN_FLAG;

(shouldRun ? test : test.skip)(
  "records one real denied identity request through the exact private production runtime path",
  async () => {
    const applicationDatabaseUrl = requiredSecret(
      process.env.ULC_LINZ_PRODUCTION_DATABASE_URL,
      "ULC production database URL",
    );
    const securityLogDatabaseUrl = requiredSecret(
      process.env.ULC_LINZ_SECURITY_LOG_INGEST_DATABASE_URL,
      "ULC security-log ingest database URL",
    );
    const securityLogReadDatabaseUrl = requiredSecret(
      process.env.ULC_LINZ_SECURITY_LOG_READ_DATABASE_URL,
      "ULC security-log read database URL",
    );
    const authSecret = requiredSecret(
      process.env.ULC_LINZ_PRODUCTION_BETTER_AUTH_SECRET,
      "ULC production Better Auth secret",
    );
    if (authSecret.length < 32) {
      throw new Error("ULC production Better Auth secret is invalid.");
    }

    const startedAt = new Date();
    const worker = createGeneratedWorker();
    const response = await worker.fetch(
      new Request("https://app.ulc-linz.at/api/auth/session", {
        method: "GET",
        headers: { accept: "application/json" },
      }),
      {
        HYPERDRIVE: { connectionString: applicationDatabaseUrl },
        SECURITY_LOG_HYPERDRIVE: { connectionString: securityLogDatabaseUrl },
        APPBASIS_BASE_URL: "https://app.ulc-linz.at",
        BETTER_AUTH_SECRET: authSecret,
      },
    );

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(response.headers.get("set-cookie")).toBeNull();

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
        [startedAt.toISOString()],
      );
      expect(Array.isArray(rows)).toBe(true);
      expect(rows).toHaveLength(1);
      expect(BigInt(rows[0]?.event_count ?? 0)).toBeGreaterThan(0n);
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
