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
      actorPrincipalId: null;
      organizationId: null;
      action: UlcLinzIdentitySecurityOperation;
      targetType: "identity-endpoint";
      targetId: UlcLinzIdentitySecurityOperation;
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
      organizationId: string | null;
      action: "view" | "edit" | "unknown";
      targetType: "module";
      targetId: string | null;
      reasonCode: UlcLinzAuthorizationDenyReason;
    }>;

export type UlcLinzSecurityEventInput =
  | Readonly<{
      eventType: "identity.request.denied";
      operation: UlcLinzIdentitySecurityOperation;
      httpStatus: number;
      errorCode: string;
    }>
  | Readonly<{
      eventType: "authorization.denied";
      actorPrincipalId: unknown;
      organizationId: unknown;
      action: unknown;
      targetId: unknown;
      reasonCode: UlcLinzAuthorizationDenyReason;
    }>;

export interface UlcLinzSecurityEventLogger {
  record(event: UlcLinzSecurityEvent): void;
}

const LOG_IDENTIFIER_MAX_LENGTH = 200;
const LOG_ERROR_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_.:-]{0,119}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

const consoleSecurityEventLogger: UlcLinzSecurityEventLogger = Object.freeze({
  record(event: UlcLinzSecurityEvent) {
    console.warn(`[ulc-linz-security] ${JSON.stringify(event)}`);
  },
});

/**
 * Records only a deliberately small, normalized security-event envelope.
 *
 * Sink failure never opens an authorization path and never replaces the
 * original denied HTTP response. The fixed fallback message intentionally
 * excludes the event itself so a failing/custom logger cannot cause secrets or
 * untrusted request data to be copied into a second diagnostic channel.
 */
export function recordUlcLinzSecurityEvent(
  logger: UlcLinzSecurityEventLogger | undefined,
  input: UlcLinzSecurityEventInput,
): boolean {
  const event = createSecurityEvent(input);
  try {
    (logger ?? consoleSecurityEventLogger).record(event);
    return true;
  } catch {
    console.error("[ulc-linz-security] security event sink failed");
    return false;
  }
}

function createSecurityEvent(input: UlcLinzSecurityEventInput): UlcLinzSecurityEvent {
  const occurredAt = new Date().toISOString();
  if (input.eventType === "identity.request.denied") {
    return Object.freeze({
      schemaVersion: 1 as const,
      appId: "ulc-linz" as const,
      category: "security" as const,
      eventType: "identity.request.denied" as const,
      occurredAt,
      actorPrincipalId: null,
      organizationId: null,
      action: input.operation,
      targetType: "identity-endpoint" as const,
      targetId: input.operation,
      operation: input.operation,
      httpStatus: normalizedHttpStatus(input.httpStatus),
      errorCode: normalizedErrorCode(input.errorCode),
    });
  }

  return Object.freeze({
    schemaVersion: 1 as const,
    appId: "ulc-linz" as const,
    category: "security" as const,
    eventType: "authorization.denied" as const,
    occurredAt,
    actorPrincipalId: safeLogIdentifier(input.actorPrincipalId),
    organizationId: safeLogIdentifier(input.organizationId),
    action: normalizedAuthorizationAction(input.action),
    targetType: "module" as const,
    targetId: safeLogIdentifier(input.targetId),
    reasonCode: input.reasonCode,
  });
}

function normalizedHttpStatus(value: number): number {
  return Number.isInteger(value) && value >= 400 && value <= 599 ? value : 500;
}

function normalizedErrorCode(value: string): string {
  return typeof value === "string" && LOG_ERROR_CODE_PATTERN.test(value)
    ? value
    : "UNKNOWN_IDENTITY_ERROR";
}

function normalizedAuthorizationAction(value: unknown): "view" | "edit" | "unknown" {
  return value === "view" || value === "edit" ? value : "unknown";
}

function safeLogIdentifier(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > LOG_IDENTIFIER_MAX_LENGTH ||
    value !== value.trim() ||
    CONTROL_CHARACTER_PATTERN.test(value)
  ) {
    return null;
  }
  return value;
}
