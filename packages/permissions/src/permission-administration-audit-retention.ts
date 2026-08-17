import type { PermissionPostgresClient } from "./postgres-permission-store";

export const PERMISSION_ADMINISTRATION_AUDIT_RETENTION_MONTHS = 12 as const;

export class PostgresPermissionAdministrationAuditRetention {
  readonly #client: PermissionPostgresClient;

  constructor(client: PermissionPostgresClient) {
    this.#client = client;
  }

  async deleteExpiredAuditEvents(now: Date): Promise<number> {
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
      throw new TypeError("Permission administration audit retention requires a valid current time.");
    }

    const deleted = await this.#client.unsafe(
      `DELETE FROM appbasis_permission_administration_audit
       WHERE created_at < (
         $1::timestamptz - ($2::int * INTERVAL '1 month')
       )
       RETURNING event_id`,
      [now.toISOString(), PERMISSION_ADMINISTRATION_AUDIT_RETENTION_MONTHS],
    );
    return deleted.length;
  }
}
