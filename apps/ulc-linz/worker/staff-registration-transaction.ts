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

/**
 * N16 inactive scope-bound adapter. The only permitted module is the
 * checked permission capability and locked canonical group mapping.
 * Explicit IRG mapping requires performance_registration:edit; the session
 * storage module remains kindertraining for pre-existing IRG registrations.
 * No HTTP activation or provider migration without separate approval.
 *
 * Unlike the legacy internal callback, the consumer cannot choose tenant,
 * target athlete, session group/date or audit actor. No proxy-athlete field
 * is accepted (staff identity is the actor).
 */
export function bindUlcStaffRegistrationWriter(
  sessions: Pick<PostgresUlcTrainingSessionRepository,
    "ensureScheduledSession" | "saveRegistration">,
  scope: UlcStaffRegistrationGuardScope,
): Readonly<{
  save: (
    intention: import("./training-session-domain").UlcTrainingRegistrationIntention,
    expectedRevision: number | null,
    note?: string | null,
  ) => Promise<import("./training-session-domain").UlcTrainingRegistration>;
}> {
  const organizationId = scope.organizationId;
  const groupId = scope.groupId;
  const targetAthleteId = scope.targetAthleteId;
  const actorIdentityId = scope.actorIdentityId;
  const moduleId = scope.moduleId;
  const sessionDate = scope.sessionDate;
  return Object.freeze({
    async save(intention, expectedRevision, note) {
      const snapshot = await sessions.ensureScheduledSession(
        organizationId, moduleId, groupId, sessionDate,
      );
      if (
        snapshot.session.organizationId !== organizationId ||
        snapshot.session.moduleId !== moduleId ||
        snapshot.session.groupId !== groupId ||
        snapshot.session.sessionDate !== sessionDate ||
        snapshot.session.state !== "scheduled"
      ) {
        throw new UlcLinzAuthorizationDeniedError();
      }
      return sessions.saveRegistration(
        organizationId, snapshot.session.id, targetAthleteId,
        intention, expectedRevision, actorIdentityId, undefined, note,
      );
    },
  });
}
