import { UlcLinzAuthorizationDeniedError } from "./authorization";
import type { UlcTrainingSessionSqlClient } from "./training-session-postgres";

/**
 * N16: database-side, transaction-scoped guard for a concrete Better Auth
 * session. The session ID MUST be obtained from the server-validated Better
 * Auth get-session response; it is NOT a cookie token and NEVER comes from a
 * request body. This helper deliberately does not parse Better Auth cookies.
 *
 * Use the same SQL transaction for this check, staff role/target checks and
 * the eventual write. FOR SHARE prevents a concurrent DELETE/UPDATE (logout,
 * revocation or session expiry extension) from committing during that write.
 * Recheck expiry after the write so a slow transaction rolls back if its
 * session expires meanwhile.
 *
 * Not wired to HTTP until the trusted session-ID mapping and genuine Better
 * Auth logout/revoke behavior have passed integration testing.
 */
export async function assertActiveUlcStaffSession(
  transaction: UlcTrainingSessionSqlClient,
  trustedSessionId: string,
  actorIdentityId: string,
): Promise<void> {
  const sessionId = requiredIdentifier(trustedSessionId);
  const identityId = requiredIdentifier(actorIdentityId);

  const rows = await transaction.unsafe(
    `SELECT id
       FROM "session"
      WHERE id = $1 AND user_id = $2
        AND expires_at > clock_timestamp()
        AND impersonated_by IS NULL
      FOR SHARE`,
    [sessionId, identityId],
  );
  if (rows.length !== 1 || rows[0]?.id !== sessionId) {
    throw new UlcLinzAuthorizationDeniedError();
  }
}

/**
 * The second expiry check intentionally runs AFTER the guarded write and
 * BEFORE the surrounding SQL transaction commits. All session/role/group
 * row locks remain held throughout the callback's lifetime.
 */
export async function assertUlcStaffSessionStillValid(
  transaction: UlcTrainingSessionSqlClient,
  trustedSessionId: string,
  actorIdentityId: string,
): Promise<void> {
  const sessionId = requiredIdentifier(trustedSessionId);
  const identityId = requiredIdentifier(actorIdentityId);
  const rows = await transaction.unsafe(
    `SELECT id
       FROM "session"
      WHERE id = $1 AND user_id = $2
        AND expires_at > clock_timestamp()
        AND impersonated_by IS NULL`,
    [sessionId, identityId],
  );
  if (rows.length !== 1 || rows[0]?.id !== sessionId) {
    throw new UlcLinzAuthorizationDeniedError();
  }
}

function requiredIdentifier(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 200 ||
      value.trim() !== value) {
    throw new UlcLinzAuthorizationDeniedError();
  }
  return value;
}
