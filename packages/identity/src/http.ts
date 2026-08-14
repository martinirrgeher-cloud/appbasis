import type { CurrentIdentity } from "./contracts";
import { IdentityError } from "./errors";
import type { IdentityService } from "./service";

export type IdentityHttpService = Pick<
  IdentityService,
  "signInWithUsername" | "getCurrentIdentity" | "changeRequiredPassword"
>;

export interface IdentityHttpHandlers {
  signIn(request: Request): Promise<Response>;
  session(request: Request): Promise<Response>;
  changeRequiredPassword(request: Request): Promise<Response>;
  resolveCurrentIdentity(request: Request): Promise<CurrentIdentity | Response>;
  identityErrorResponse(error: unknown): Response;
}

export interface IdentityHttpOptions {
  identity: IdentityHttpService;
  secureCookies?: boolean;
}

type IdentityHttpErrorCode =
  | "AUTHENTICATION_FAILED"
  | "IDENTITY_DISABLED"
  | "INVALID_REQUEST"
  | "PASSWORD_CHANGE_FAILED"
  | "PASSWORD_CHANGE_NOT_REQUIRED"
  | "PASSWORD_CHANGE_REQUIRED"
  | "SESSION_INVALID";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createIdentityHttpHandlers(
  options: IdentityHttpOptions,
): IdentityHttpHandlers {
  const secureCookies = options.secureCookies ?? true;

  async function signIn(request: Request): Promise<Response> {
    const body = await readObjectBody(request);
    if (body === null) return invalidRequest();
    const username = stringField(body, "username");
    const password = stringField(body, "password");
    if (username === null || password === null) return invalidRequest();

    try {
      const current = await options.identity.signInWithUsername({ username, password });
      return currentIdentityResponse(current, secureCookies);
    } catch (error) {
      return identityErrorResponse(error);
    }
  }

  async function session(request: Request): Promise<Response> {
    const current = await resolveCurrentIdentity(request);
    if (current instanceof Response) return current;
    return jsonResponse(currentIdentityPayload(current));
  }

  async function changeRequiredPassword(request: Request): Promise<Response> {
    const sessionToken = requestCookie(request);
    if (sessionToken === null) return sessionInvalid();
    const body = await readObjectBody(request);
    if (body === null) return invalidRequest();
    const currentPassword = stringField(body, "currentPassword");
    const newPassword = stringField(body, "newPassword");
    const idempotencyKey = stringField(body, "idempotencyKey");
    if (
      currentPassword === null ||
      newPassword === null ||
      idempotencyKey === null ||
      !UUID_V4_PATTERN.test(idempotencyKey.trim())
    ) {
      return invalidRequest();
    }

    try {
      const current = await options.identity.changeRequiredPassword({
        sessionToken,
        currentPassword,
        newPassword,
        idempotencyKey,
      });
      return currentIdentityResponse(current, secureCookies);
    } catch (error) {
      return identityErrorResponse(error);
    }
  }

  async function resolveCurrentIdentity(
    request: Request,
  ): Promise<CurrentIdentity | Response> {
    const sessionToken = requestCookie(request);
    if (sessionToken === null) return sessionInvalid();

    try {
      const current = await options.identity.getCurrentIdentity(sessionToken);
      return current === null ? sessionInvalid() : current;
    } catch (error) {
      return identityErrorResponse(error);
    }
  }

  return Object.freeze({
    signIn,
    session,
    changeRequiredPassword,
    resolveCurrentIdentity,
    identityErrorResponse,
  });
}

function currentIdentityResponse(
  current: CurrentIdentity,
  secureCookies: boolean,
): Response {
  const headers = new Headers();
  headers.set("Set-Cookie", sessionCookie(current.sessionToken, secureCookies));
  return jsonResponse(currentIdentityPayload(current), 200, headers);
}

function currentIdentityPayload(current: CurrentIdentity) {
  return {
    identity: {
      identityId: current.identity.identityId,
      username: current.identity.username,
      displayName: current.identity.displayName,
      contactEmail: current.identity.contactEmail,
      personId: current.identity.personId,
      mustChangePassword: current.identity.mustChangePassword,
      accountStatus: current.identity.accountStatus,
    },
    access: current.access,
  };
}

function requestCookie(request: Request): string | null {
  const cookie = request.headers.get("cookie");
  return cookie === null || cookie.trim().length === 0 ? null : cookie;
}

function sessionCookie(cookiePair: string, secure: boolean): string {
  const attributes = [cookiePair, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}

async function readObjectBody(
  request: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    if (body === null || typeof body !== "object" || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

function stringField(body: Record<string, unknown>, field: string): string | null {
  const value = body[field];
  return typeof value === "string" ? value : null;
}

function invalidRequest(): Response {
  return errorResponse(400, "INVALID_REQUEST", "The request body is invalid.");
}

function sessionInvalid(): Response {
  return errorResponse(401, "SESSION_INVALID", "A valid session is required.");
}

function identityErrorResponse(error: unknown): Response {
  if (!(error instanceof IdentityError)) {
    return errorResponse(500, "AUTHENTICATION_FAILED", "The identity request failed.");
  }

  switch (error.code) {
    case "AUTHENTICATION_FAILED":
      return errorResponse(401, error.code, "The username or password is invalid.");
    case "SESSION_INVALID":
    case "IDENTITY_STATE_MISSING":
      return errorResponse(401, "SESSION_INVALID", "A valid session is required.");
    case "IDENTITY_DISABLED":
      return errorResponse(403, error.code, "The identity is disabled.");
    case "PASSWORD_CHANGE_REQUIRED":
      return errorResponse(
        403,
        error.code,
        "The password must be changed before using the application.",
      );
    case "PASSWORD_CHANGE_NOT_REQUIRED":
      return errorResponse(409, error.code, "A required password change is not pending.");
    case "PASSWORD_CHANGE_FAILED":
      return errorResponse(400, error.code, "The password could not be changed.");
  }
}

function errorResponse(
  status: 400 | 401 | 403 | 409 | 500,
  code: IdentityHttpErrorCode,
  message: string,
): Response {
  return jsonResponse({ error: { code, message } }, status);
}

function jsonResponse(
  payload: unknown,
  status = 200,
  headers: HeadersInit = {},
): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(payload), {
    status,
    headers: responseHeaders,
  });
}
