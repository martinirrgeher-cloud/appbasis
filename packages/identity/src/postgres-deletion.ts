import { randomUUID } from "node:crypto";

import { createPostgresDatabase } from "@appbasis/database";

type SqlClient = ReturnType<typeof createPostgresDatabase>["client"];

export type IdentityDeletionBlockedCode =
  | "IDENTITY_NOT_FOUND"
  | "IDENTITY_NOT_DISABLED"
  | "INCONSISTENT_IDENTITY_STATE"
  | "UNSUPPORTED_VERIFICATION_STATE";

export class IdentityDeletionBlockedError extends Error {
  readonly code: IdentityDeletionBlockedCode;

  constructor(code: IdentityDeletionBlockedCode) {
    super("Identity deletion is blocked.");
    this.name = "IdentityDeletionBlockedError";
    this.code = code;
  }
}

export interface IdentityDeletionResult {
  readonly identityId: string;
  readonly alreadyDeleted: boolean;
}

/**
 * PostgreSQL-specific destructive owner boundary for the current AppBasis
 * identity model. This deliberately lives inside @appbasis/identity so product
 * apps never delete Better Auth or AppBasis identity tables directly.
 *
 * The caller must first remove application access and disable the identity.
 * All currently owned identity rows are then removed in one PostgreSQL
 * transaction. A minimal completed delete-operation tombstone is retained only
 * to make an ambiguous client retry observable and idempotent.
 */
export class PostgresIdentityDeletion {
  constructor(
    private readonly sql: SqlClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async isDeletionCompleted(identityId: string): Promise<boolean> {
    const normalizedIdentityId = requiredIdentifier(identityId);
    const rows = await this.sql.unsafe(
      `SELECT operation_id, kind, identity_id, completed_at
       FROM appbasis_identity_operation
       WHERE operation_key = $1`,
      [deleteOperationKey(normalizedIdentityId)],
    );
    const row = rows[0];
    if (row === undefined) return false;
    assertDeleteOperation(row, normalizedIdentityId);
    if (row.completed_at === null) return false;
    await assertDeletedOwnerState(this.sql, normalizedIdentityId);
    return true;
  }

  async deleteDisabledIdentity(identityId: string): Promise<IdentityDeletionResult> {
    const normalizedIdentityId = requiredIdentifier(identityId);
    const completedAt = validNow(this.now()).toISOString();

    return this.sql.begin(async (transaction) => {
      const operationId = randomUUID();
      const operationRows = await transaction.unsafe(
        `INSERT INTO appbasis_identity_operation (
           operation_id,
           operation_key,
           kind,
           identity_id
         )
         VALUES ($1, $2, 'delete', $3)
         ON CONFLICT (operation_key) DO UPDATE
           SET operation_key = EXCLUDED.operation_key
         RETURNING operation_id, kind, identity_id, completed_at`,
        [operationId, deleteOperationKey(normalizedIdentityId), normalizedIdentityId],
      );
      const operation = requiredRow(operationRows);
      assertDeleteOperation(operation, normalizedIdentityId);
      const persistedOperationId = requiredString(operation, "operation_id");

      if (operation.completed_at !== null) {
        await assertDeletedOwnerState(transaction, normalizedIdentityId);
        return Object.freeze({
          identityId: normalizedIdentityId,
          alreadyDeleted: true,
        });
      }

      const userRows = await transaction.unsafe(
        `SELECT id, role, banned
         FROM "user"
         WHERE id = $1
         FOR UPDATE`,
        [normalizedIdentityId],
      );
      const user = userRows[0];
      if (user === undefined) {
        throw new IdentityDeletionBlockedError("INCONSISTENT_IDENTITY_STATE");
      }
      if (hasTechnicalAdminRole(nullableString(user, "role"))) {
        throw new IdentityDeletionBlockedError("INCONSISTENT_IDENTITY_STATE");
      }
      if (user.banned !== true) {
        throw new IdentityDeletionBlockedError("IDENTITY_NOT_DISABLED");
      }

      const stateRows = await transaction.unsafe(
        `SELECT identity_id, person_id, disabled_at
         FROM appbasis_identity_security_state
         WHERE identity_id = $1
         FOR UPDATE`,
        [normalizedIdentityId],
      );
      const state = stateRows[0];
      if (state === undefined) {
        throw new IdentityDeletionBlockedError("INCONSISTENT_IDENTITY_STATE");
      }
      if (state.disabled_at === null) {
        throw new IdentityDeletionBlockedError("IDENTITY_NOT_DISABLED");
      }
      const personId = nullableString(state, "person_id");

      // The current AppBasis composition does not use Better Auth verification
      // records. They have no user FK in the pinned schema, so guessing an
      // ownership relation would risk either retention or over-deletion.
      const verificationRows = await transaction.unsafe(
        `SELECT id
         FROM verification
         LIMIT 1
         FOR UPDATE`,
      );
      if (verificationRows.length !== 0) {
        throw new IdentityDeletionBlockedError("UNSUPPORTED_VERIFICATION_STATE");
      }

      // Historical identity operations can retain lifecycle metadata for this
      // identity. The current delete tombstone is excluded so retries remain
      // deterministic after an ambiguous client/connection result.
      await transaction.unsafe(
        `DELETE FROM appbasis_identity_operation
         WHERE identity_id = $1
           AND operation_id <> $2`,
        [normalizedIdentityId, persistedOperationId],
      );

      const deletedState = await transaction.unsafe(
        `DELETE FROM appbasis_identity_security_state
         WHERE identity_id = $1
         RETURNING identity_id`,
        [normalizedIdentityId],
      );
      if (deletedState.length !== 1) {
        throw new IdentityDeletionBlockedError("INCONSISTENT_IDENTITY_STATE");
      }

      if (personId !== null) {
        const deletedPerson = await transaction.unsafe(
          `DELETE FROM appbasis_person
           WHERE id = $1
           RETURNING id`,
          [personId],
        );
        if (deletedPerson.length !== 1) {
          throw new IdentityDeletionBlockedError("INCONSISTENT_IDENTITY_STATE");
        }
      }

      const deletedUser = await transaction.unsafe(
        `DELETE FROM "user"
         WHERE id = $1
         RETURNING id`,
        [normalizedIdentityId],
      );
      if (deletedUser.length !== 1) {
        throw new IdentityDeletionBlockedError("INCONSISTENT_IDENTITY_STATE");
      }

      await assertDeletedOwnerState(transaction, normalizedIdentityId);

      const completedRows = await transaction.unsafe(
        `UPDATE appbasis_identity_operation
         SET completed_at = $2
         WHERE operation_id = $1
           AND kind = 'delete'
           AND identity_id = $3
         RETURNING operation_id`,
        [persistedOperationId, completedAt, normalizedIdentityId],
      );
      if (completedRows.length !== 1) {
        throw new IdentityDeletionBlockedError("INCONSISTENT_IDENTITY_STATE");
      }

      return Object.freeze({
        identityId: normalizedIdentityId,
        alreadyDeleted: false,
      });
    });
  }
}

async function assertDeletedOwnerState(
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
  const row = requiredRow(rows);
  for (const key of ["user_count", "state_count", "account_count", "session_count"] as const) {
    if (row[key] !== 0) {
      throw new IdentityDeletionBlockedError("INCONSISTENT_IDENTITY_STATE");
    }
  }
}

function assertDeleteOperation(
  row: Record<string, unknown>,
  identityId: string,
): void {
  if (row.kind !== "delete" || row.identity_id !== identityId) {
    throw new IdentityDeletionBlockedError("INCONSISTENT_IDENTITY_STATE");
  }
}

function deleteOperationKey(identityId: string): string {
  return `delete:${identityId}`;
}

function requiredIdentifier(value: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 200 ||
    value !== value.trim()
  ) {
    throw new TypeError("Identity deletion requires a valid identity ID.");
  }
  return value;
}

function validNow(value: Date): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new TypeError("Identity deletion requires a valid current time.");
  }
  return value;
}

function hasTechnicalAdminRole(role: string | null): boolean {
  return role
    ?.split(",")
    .map((value) => value.trim())
    .includes("admin") === true;
}

function requiredRow(
  rows: readonly Record<string, unknown>[],
): Record<string, unknown> {
  const row = rows[0];
  if (row === undefined) {
    throw new IdentityDeletionBlockedError("INCONSISTENT_IDENTITY_STATE");
  }
  return row;
}

function requiredString(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new IdentityDeletionBlockedError("INCONSISTENT_IDENTITY_STATE");
  }
  return value;
}

function nullableString(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new IdentityDeletionBlockedError("INCONSISTENT_IDENTITY_STATE");
  }
  return value;
}
