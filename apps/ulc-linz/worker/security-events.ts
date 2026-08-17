export type UlcLinzIdentitySecurityOperation =
  | "sign-in"
  | "session"
  | "change-required-password";

export type UlcLinzAuthorizationDenyReason =
  | "identity-access-denied"
  | "invalid-request"
  | "membership-denied"
  | "role-mismatch"
  | "capability-denied"
  | "scope-denied"
  | "subject-relation-denied";

export type UlcLinzSecurityEvent =
  | Readonly<{
      schemaVersion: 1;
      appId: "ulc-linz";
      category: "security";
      eventType: "identity.request.denied";
      occurredAt: string;
      operation: UlcLinzIdentitySecurityOperation;
      httpStatus: number;
      errorCode: string;
    }>
  | Readonly<{
      schemaVersion: 1;
      appId: "ulc-linz";
      category: "security";
      eventType: "authorization.denied";
      occurredAt: string;
      actorPrincipalId: string | null;
      reasonCode: UlcLinzAuthorizationDenyReason;
    }>;

export type UlcLinzSecurityEventInput =
  | Omit<
      Extract<UlcLinzSecurityEvent, { eventType: "identity.request.denied" }>,
      "schemaVersion" | "appId" | "category" | "occurredAt"
    >
  | Omit<
      Extract<UlcLinzSecurityEvent, { eventType: "authorization.denied" }>,
      "schemaVersion" | "appId" | "category" | "occurredAt"
    >;

export interface UlcLinzSecurityEventLogger {
  record(event: UlcLinzSecurityEvent): void;
}

const consoleSecurityEventLogger: UlcLinzSecurityEventLogger = Object.freeze({
  record(event: UlcLinzSecurityEvent) {
    console.warn(`[ulc-linz-security] ${JSON.stringify(event)}`);
  },
});

export function recordUlcLinzSecurityEvent(
  logger: UlcLinzSecurityEventLogger | undefined,
  input: UlcLinzSecurityEventInput,
): void {
  const event = Object.freeze({
    schemaVersion: 1 as const,
    appId: "ulc-linz" as const,
    category: "security" as const,
    occurredAt: new Date().toISOString(),
    ...input,
  }) as UlcLinzSecurityEvent;

  (logger ?? consoleSecurityEventLogger).record(event);
}
