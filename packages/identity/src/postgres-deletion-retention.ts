import type { createPostgresDatabase } from "@appbasis/database";

import { IdentityDeletionBlockedError } from "./postgres-deletion";

type SqlClient = ReturnType<typeof createPostgresDatabase>["client"];

export const IDENTITY_DELETION_TOMBSTONE_RETENTION_DAYS = 35;

/**
 * Owner-local retention for completed identity deletion tombstones.
 *
 * The 35-day window matches the confirmed maximum ULC backup rotation window:
 * a valid older restore must still be reconcilable while such a backup can
 * exist. The clock is composed server-side; callers cannot choose a cutoff.
 */
export class PostgresIdentityDeletionRetention {
  constructor(
    private readonly sql: SqlClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async purgeExpiredCompletedDeletions(): Promise<number> {
    const now = validNow(this.now()).toISOString();

    return this.sql.begin(async (transaction) => {
      const candidates = await transaction.unsafe(
        `SELECT operation_id, operation_key, identity_id, completed_at
         FROM appbasis_identity_operation
         WHERE kind = 'delete'
           AND completed_at IS NOT NULL
           AND completed_at < $1::timestamptz - interval '35 days'
         ORDER BY completed_at ASC, operation_id ASC
         FOR UPDATE`,
        [now],
      );

      for (const candidate of candidates) {
        const identityId = requiredIdentifier(candidate.identity_id);
        if (candidate.operation_key !== `delete:${identityId}`) blocked();
        await assertNoIdentityOwnerState(transaction, identityId);
      }

      if (candidates.length === 0) return 0;
      const operationIds = candidates.map((candidate) => requiredIdentifier(candidate.operation_id));
      const deleted = await transaction.unsafe(
        `DELETE FROM appbasis_identity_operation
         WHERE operation_id = ANY($1::text[])
         RETURNING operation_id`,
        [operationIds],
      );
      if (deleted.length !== operationIds.length) blocked();
      return deleted.length;
    });
  }
}

async function assertNoIdentityOwnerState(
  sql: Pick<SqlClient, "unsafe">,
  identityId: string,
): Promise<void> {
  const rows = await sql.unsafe(
    `SELECT
       (SELECT count(*)::int FROM "user" WHERE id = $1) AS user_count,
       (SELECT count(*)::int FROM appbasis_identity_security_state WHERE identity_id = $1) AS state_count,
       (SELECT count(*)::int FROM account WHERE user_id = $1) AS account_count,
       (SELECT count(*)::int FROM session WHERE user_id = $1) AS session_count`,
    [identityId],
  );
  const row = rows[0];
  if (
    row === undefined ||
    row.user_count !== 0 ||
    row.state_count !== 0 ||
    row.account_count !== 0 ||
    row.session_count !== 0
  ) {
    blocked();
  }
}

function requiredIdentifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 200 ||
    value !== value.trim()
  ) {
    blocked();
  }
  return value;
}

function validNow(value: Date): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new TypeError("Identity deletion retention requires a valid current time.");
  }
  return value;
}

function blocked(): never {
  throw new IdentityDeletionBlockedError("INCONSISTENT_IDENTITY_STATE");
}
