import {
  IdentityError,
  type CurrentIdentity,
  type IdentityService,
} from '@appbasis/identity';
import { type Context, type Hono } from 'hono';

export type IdentityHttpService = Pick<
  IdentityService,
  'signInWithUsername' | 'getCurrentIdentity' | 'changeRequiredPassword'
>;

export interface IdentityHttpRuntime {
  resolveCurrentIdentity(context: Context): Promise<CurrentIdentity | Response>;
  identityErrorResponse(context: Context, error: unknown): Response;
}

export interface IdentityHttpOptions {
  identity: IdentityHttpService;
  secureCookies?: boolean;
}

type IdentityErrorCode =
  | 'AUTHENTICATION_FAILED'
  | 'IDENTITY_DISABLED'
  | 'INVALID_REQUEST'
  | 'PASSWORD_CHANGE_FAILED'
  | 'PASSWORD_CHANGE_NOT_REQUIRED'
  | 'PASSWORD_CHANGE_REQUIRED'
  | 'SESSION_INVALID';

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function mountIdentityHttpRoutes(
  app: Hono,
  options: IdentityHttpOptions,
): IdentityHttpRuntime {
  const secureCookies = options.secureCookies ?? true;

  app.post('/api/auth/sign-in', async (context) => {
    const body = await readObjectBody(context);
    if (body === null) return invalidRequest(context);
    const username = stringField(body, 'username');
    const password = stringField(body, 'password');
    if (username === null || password === null) return invalidRequest(context);

    try {
      const current = await options.identity.signInWithUsername({ username, password });
      setSessionCookie(context, current.sessionToken, secureCookies);
      return context.json(currentIdentityPayload(current));
    } catch (error) {
      return identityErrorResponse(context, error);
    }
  });

  app.get('/api/auth/session', async (context) => {
    const current = await resolveCurrentIdentity(context, options.identity);
    if (current instanceof Response) return current;
    return context.json(currentIdentityPayload(current));
  });

  app.post('/api/auth/change-required-password', async (context) => {
    const sessionToken = requestCookie(context);
    if (sessionToken === null) return sessionInvalid(context);
    const body = await readObjectBody(context);
    if (body === null) return invalidRequest(context);
    const currentPassword = stringField(body, 'currentPassword');
    const newPassword = stringField(body, 'newPassword');
    const idempotencyKey = stringField(body, 'idempotencyKey');
    if (
      currentPassword === null ||
      newPassword === null ||
      idempotencyKey === null ||
      !UUID_V4_PATTERN.test(idempotencyKey.trim())
    ) {
      return invalidRequest(context);
    }

    try {
      const current = await options.identity.changeRequiredPassword({
        sessionToken,
        currentPassword,
        newPassword,
        idempotencyKey,
      });
      setSessionCookie(context, current.sessionToken, secureCookies);
      return context.json(currentIdentityPayload(current));
    } catch (error) {
      return identityErrorResponse(context, error);
    }
  });

  return Object.freeze({
    resolveCurrentIdentity: (context: Context) =>
      resolveCurrentIdentity(context, options.identity),
    identityErrorResponse,
  });
}

async function resolveCurrentIdentity(
  context: Context,
  identity: IdentityHttpService,
): Promise<CurrentIdentity | Response> {
  const sessionToken = requestCookie(context);
  if (sessionToken === null) return sessionInvalid(context);

  try {
    const current = await identity.getCurrentIdentity(sessionToken);
    return current === null ? sessionInvalid(context) : current;
  } catch (error) {
    return identityErrorResponse(context, error);
  }
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

function requestCookie(context: Context): string | null {
  const cookie = context.req.header('cookie');
  return cookie === undefined || cookie.trim().length === 0 ? null : cookie;
}

function setSessionCookie(context: Context, cookiePair: string, secure: boolean): void {
  const attributes = [`${cookiePair}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (secure) attributes.push('Secure');
  context.header('Set-Cookie', attributes.join('; '));
}

async function readObjectBody(context: Context): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await context.req.json();
    if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

function stringField(body: Record<string, unknown>, field: string): string | null {
  const value = body[field];
  return typeof value === 'string' ? value : null;
}

function invalidRequest(context: Context) {
  return errorResponse(context, 400, 'INVALID_REQUEST', 'The request body is invalid.');
}

function sessionInvalid(context: Context) {
  return errorResponse(context, 401, 'SESSION_INVALID', 'A valid session is required.');
}

function identityErrorResponse(context: Context, error: unknown): Response {
  if (!(error instanceof IdentityError)) {
    return errorResponse(context, 500, 'AUTHENTICATION_FAILED', 'The identity request failed.');
  }

  switch (error.code) {
    case 'AUTHENTICATION_FAILED':
      return errorResponse(context, 401, error.code, 'The username or password is invalid.');
    case 'SESSION_INVALID':
    case 'IDENTITY_STATE_MISSING':
      return errorResponse(context, 401, 'SESSION_INVALID', 'A valid session is required.');
    case 'IDENTITY_DISABLED':
      return errorResponse(context, 403, error.code, 'The identity is disabled.');
    case 'PASSWORD_CHANGE_REQUIRED':
      return errorResponse(
        context,
        403,
        error.code,
        'The password must be changed before using the application.',
      );
    case 'PASSWORD_CHANGE_NOT_REQUIRED':
      return errorResponse(context, 409, error.code, 'A required password change is not pending.');
    case 'PASSWORD_CHANGE_FAILED':
      return errorResponse(context, 400, error.code, 'The password could not be changed.');
  }
}

function errorResponse(
  context: Context,
  status: 400 | 401 | 403 | 409 | 500,
  code: IdentityErrorCode,
  message: string,
): Response {
  return context.json({ error: { code, message } }, status);
}
