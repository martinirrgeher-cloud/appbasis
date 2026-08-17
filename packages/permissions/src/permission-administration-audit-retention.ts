import type { PermissionPostgresClient } from "./postgres-permission-store";

export const PERMISSION_ADMINISTRATION_AUDIT_RETENTION_MONTHS = 12 as const;

export class PostgresPermissionAdministrationAuditRetention {
  readonly #client: PermissionPostgresClient;
  readonly #now: () => Date;

  constructor(client: PermissionPostgresClient, now: () => Date = () => new Date()) {
    this.#client = client;
    this.#now = now;
  }

  async deleteExpiredAuditEvents(): Promise<number> {
    const now = this.#now();
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
      throw new TypeError("Permission administration audit retention requires a valid current time.");
    }

    const rows = await this.#client.unsafe(
      `WITH deleted AS (
         DELETE FROM appbasis_permission_administration_audit
         WHERE created_at < (
           $1::timestamptz - ($2::int * INTERVAL '1 month')
         )
         RETURNING 1
       )
       SELECT count(*)::int AS deleted_count
       FROM deleted`,
      [now.toISOString(), PERMISSION_ADMINISTRATION_AUDIT_RETENTION_MONTHS],
    );
    const deletedCount = rows[0]?.deleted_count;
    if (
      typeof deletedCount !== "number" ||
      !Number.isSafeInteger(deletedCount) ||
      deletedCount < 0
    ) {
      throw new Error("Permission administration audit cleanup returned an invalid delete count.");
    }
    return deletedCount;
  }
}
