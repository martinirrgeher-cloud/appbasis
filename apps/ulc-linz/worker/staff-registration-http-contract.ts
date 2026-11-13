import { assertIdentityActionAllowed } from "@appbasis/identity/access";

import { UlcLinzAuthorizationDeniedError, type UlcLinzCurrentIdentity } from "./authorization";

/**
 * Inactive N16 HTTP boundary. No router imports this module.
 * The trusted actor and session are derived exclusively from the validated
 * server identity; caller JSON may select only the target and operation.
 * This is a parsing prerequisite, NOT a staff-write authorization grant.
 */
export interface UnwiredUlcStaffRegistrationRequest {
  readonly actorIdentityId: string;
  readonly trustedSessionId: string;
  readonly groupId: string;
  readonly targetAthleteId: string;
  readonly sessionDate: string;
  readonly intention: "attending" | "not_attending" | "maybe";
  readonly expectedRevision: number;
}

const BODY_KEYS = new Set([
  "groupId", "targetAthleteId", "sessionDate", "intention", "expectedRevision",
]);

export function parseUnwiredUlcStaffRegistrationRequest(
  current: UlcLinzCurrentIdentity,
  body: unknown,
): Readonly<UnwiredUlcStaffRegistrationRequest> {
  try {
    assertIdentityActionAllowed(current, "application");
  } catch {
    deny();
  }
  const identityId = identifier(current.identity.identityId);
  // sessionId is internal to the server-validated Better Auth identity.
  // No fallback to cookie token or client-provided session identifier.
  const sessionId = identifier(
    (current as UlcLinzCurrentIdentity & { sessionId?: unknown }).sessionId,
  );
  if (body === null || typeof body !== "object" || Array.isArray(body) ||
      Object.getPrototypeOf(body) !== Object.prototype) deny();
  const input = body as Record<string, unknown>;
  if (Object.keys(input).length !== BODY_KEYS.size ||
      Object.keys(input).some((key) => !BODY_KEYS.has(key)) ||
      [...BODY_KEYS].some((key) => !Object.hasOwn(input, key))) deny();
  // Only JSON data properties are accepted. An object supplied by an internal
  // caller must not execute getters while authorization inputs are read.
  // Reject symbols as well: JSON request bodies cannot contain symbol keys.
  if (Object.getOwnPropertySymbols(input).length !== 0 ||
      [...BODY_KEYS].some((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(input, key);
        return !descriptor || !Object.hasOwn(descriptor, "value");
      })) deny();

  const groupId = identifier(input.groupId);
  const targetAthleteId = identifier(input.targetAthleteId);
  const sessionDate = input.sessionDate;
  if (typeof sessionDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) deny();
  const parsed = new Date(sessionDate + "T00:00:00.000Z");
  if (!Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== sessionDate) deny();

  const intention = input.intention;
  if (intention !== "attending" && intention !== "not_attending" &&
      intention !== "maybe") deny();
  const expectedRevision = input.expectedRevision;
  if (typeof expectedRevision !== "number" ||
      !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) deny();

  return Object.freeze({
    actorIdentityId: identityId,
    trustedSessionId: sessionId,
    groupId,
    targetAthleteId,
    sessionDate,
    intention,
    expectedRevision,
  });
}

function identifier(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 ||
      value.length > 200 || value.trim() !== value) deny();
  return value;
}

function deny(): never {
  throw new UlcLinzAuthorizationDeniedError();
}
