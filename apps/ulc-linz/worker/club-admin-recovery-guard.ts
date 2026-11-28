import { IdentityError } from "@appbasis/identity";
import type { CurrentIdentity } from "@appbasis/identity";
import type { IdentityHttpService } from "@appbasis/identity/http";

type SqlRows = readonly Record<string, unknown>[];
type ReadSql = {
  unsafe(sql: string, params?: Array<string | number | boolean | null>): PromiseLike<SqlRows>;
};
const ADMIN_USERNAME = "ulc.admin";
const ORGANIZATION = "ulc-linz";

/** ULC-only guard for sign-in, session reads and the mandatory password change. */
export function createUlcClubAdminRecoveryGuard(
  identity: IdentityHttpService,
  sql: ReadSql,
  now: () => Date = () => new Date(),
): IdentityHttpService {
  async function enforce(current: CurrentIdentity | null): Promise<void> {
    if (current === null || current.identity.username !== ADMIN_USERNAME ||
        current.identity.mustChangePassword !== true) return;
    const rows = await sql.unsafe(
      "SELECT expires_at FROM public.ulc_linz_club_admin_recovery_audit " +
      "WHERE organization_id=$1 AND target_identity_id=$2 " +
      "ORDER BY created_at DESC, operation_id DESC LIMIT 1",
      [ORGANIZATION, current.identity.identityId],
    );
    if (rows.length > 1) throw new Error("Ambiguous recovery deadline.");
    const deadline = rows[0]?.expires_at;
    if (deadline === undefined) return; // Original first-login credential, not yet recovered.
    const time = deadline instanceof Date ? deadline.getTime()
      : typeof deadline === "string" ? new Date(deadline).getTime() : NaN;
    if (!Number.isFinite(time) || now().getTime() >= time) {
      throw new Error("Club administrator recovery expired.");
    }
  }

  async function checked<T extends CurrentIdentity | null>(
    current: T,
    errorCode: "AUTHENTICATION_FAILED" | "SESSION_INVALID",
  ): Promise<T> {
    try {
      await enforce(current);
      return current;
    } catch {
      if (current !== null && identity.endSession) {
        try { await identity.endSession(current.sessionToken); } catch {
          // Denial must not depend on session cleanup.
        }
      }
      throw new IdentityError(errorCode, "The administrator credential or session is invalid.");
    }
  }
  return Object.freeze({
    async signInWithUsername(input) {
      return checked(await identity.signInWithUsername(input), "AUTHENTICATION_FAILED");
    },
    async getCurrentIdentity(sessionToken) {
      return checked(await identity.getCurrentIdentity(sessionToken), "SESSION_INVALID");
    },
    async changeRequiredPassword(input) {
      const current = await checked(
        await identity.getCurrentIdentity(input.sessionToken), "SESSION_INVALID",
      );
      if (current === null) throw new IdentityError("SESSION_INVALID", "Session invalid.");
      // Migration's PostgreSQL BEFORE UPDATE guard enforces expiry again
      // at the actual credential change, including any cross-deadline race.
      return identity.changeRequiredPassword(input);
    },
    ...(identity.endSession
      ? { endSession: (token: string) => identity.endSession!(token) }
      : {}),
  });
}
