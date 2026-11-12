import type { PostgresUlcTrainingSessionRepository } from "./training-session-postgres";
import {
  assertUlcStaffRegistrationGuard,
  type UlcStaffRegistrationGuardInput,
  type UlcStaffRegistrationGuardScope,
} from "./staff-registration-guard";
import {
  assertActiveUlcStaffSession,
  assertUlcStaffSessionStillValid,
} from "./staff-session-guard";
import { UlcLinzAuthorizationDeniedError } from "./authorization";

/**
 * N16 – unexposed transaction orchestration for future staff registrations.
 *
 * The caller MUST take trustedSessionId and actorIdentityId from the
 * canonical, server-side authenticated Better Auth session, never the JSON
 * body. No active HTTP route uses this helper until that identity bridge,
 * real Better Auth logout/revoke races and audit/CAS are accepted.
 *
 * No session, role, target, or other guard read may occur outside the
 * transaction which performs the write. If the session expires while the
 * write callback runs, the final check throws and PostgreSQL rolls back
 * both a newly created training session and the registration write.
 */
export async function withGuardedUlcStaffRegistration<T>(
  sessions: Pick<PostgresUlcTrainingSessionRepository, "withAuthorizedRegistrationTransaction">,
  input: UlcStaffRegistrationGuardInput & { readonly trustedSessionId: string },
  write: (
    guardedSessions: Pick<PostgresUlcTrainingSessionRepository,
      "ensureScheduledSession" | "saveRegistration">,
    scope: UlcStaffRegistrationGuardScope,
  ) => Promise<T>,
): Promise<T> {
  let scope: UlcStaffRegistrationGuardScope | null = null;
  return sessions.withAuthorizedRegistrationTransaction(
    async (transaction) => {
      await assertActiveUlcStaffSession(
        transaction, input.trustedSessionId, input.actorIdentityId,
      );
      scope = await assertUlcStaffRegistrationGuard(transaction, input);
    },
    async (guardedSessions, transaction) => {
      if (scope === null) throw new UlcLinzAuthorizationDeniedError();
      const result = await write(guardedSessions, scope);
      await assertUlcStaffSessionStillValid(
        transaction, input.trustedSessionId, input.actorIdentityId,
      );
      return result;
    },
  );
}
