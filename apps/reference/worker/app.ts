import { Hono, type Context } from 'hono';

import type { TaskRepository } from '../../../modules/tasks/src/task-repository';
import type { CurrentIdentity } from '../../../packages/identity/src/contracts';
import { IdentityError } from '../../../packages/identity/src/errors';
import {
  assertIdentityActionAllowed,
  type IdentityService,
} from '../../../packages/identity/src/service';
import {
  principalId,
  type PermissionStore,
} from '../../../packages/permissions/src/contracts';
import { DEMO_CAPABILITIES } from '../../../packages/permissions/src/demo-bundles';
import { PermissionDeniedError } from '../../../packages/permissions/src/errors';
import { assert as assertPermission } from '../../../packages/permissions/src/permissions';
import { HEALTH_RESPONSE } from '../shared/health';

type ReferenceIdentityService = Pick<
  IdentityService,
  'signInWithUsername' | 'getCurrentIdentity' | 'changeRequiredPassword'
>;

export interface ReferenceAppDependencies {
  identity: ReferenceIdentityService;
  permissions: PermissionStore;
  tasks: TaskRepository;
  secureCookies?: boolean;
}

type ErrorCode =
  | 'AUTHENTICATION_FAILED'
  | 'IDENTITY_DISABLED'
  | 'INVALID_REQUEST'
  | 'INVALID_TASK'
  | 'PASSWORD_CHANGE_FAILED'
  | 'PASSWORD_CHANGE_NOT_REQUIRED'
  | 'PASSWORD_CHANGE_REQUIRED'
  | 'PERMISSION_DENIED'
  | 'REFERENCE_RUNTIME_NOT_CONFIGURED'
  | 'SESSION_INVALID'
  | 'TASK_NOT_FOUND';

export function createReferenceApp(dependencies?: ReferenceAppDependencies) {
  const referenceApp = new Hono();
  referenceApp.get('/api/health', (context) => context.json(HEALTH_RESPONSE));

  if (dependencies === undefined) {
    const unavailable = (context: Context) =>
      errorResponse(
        context,
        503,
        'REFERENCE_RUNTIME_NOT_CONFIGURED',
        'The Reference API runtime is not configured.',
      );
    referenceApp.all('/api/auth/*', unavailable);
    referenceApp.all('/api/tasks', unavailable);
    referenceApp.all('/api/tasks/*', unavailable);
    return referenceApp;
  }

  const secureCookies = dependencies.secureCookies ?? true;

  referenceApp.post('/api/auth/sign-in', async (context) => {
    const body = await readObjectBody(context);
    if (body === null) return invalidRequest(context);
    const username = stringField(body, 'username');
    const password = stringField(body, 'password');
    if (username === null || password === null) return invalidRequest(context);

    try {
      const current = await dependencies.identity.signInWithUsername({ username, password });
      setSessionCookie(context, current.sessionToken, secureCookies);
      return context.json(currentIdentityPayload(current));
    } catch (error) {
      return identityErrorResponse(context, error);
    }
  });

  referenceApp.get('/api/auth/session', async (context) => {
    const current = await resolveCurrentIdentity(context, dependencies.identity);
    if (current instanceof Response) return current;
    return context.json(currentIdentityPayload(current));
  });

  referenceApp.post('/api/auth/change-required-password', async (context) => {
    const sessionToken = requestCookie(context);
    if (sessionToken === null) return sessionInvalid(context);
    const body = await readObjectBody(context);
    if (body === null) return invalidRequest(context);
    const currentPassword = stringField(body, 'currentPassword');
    const newPassword = stringField(body, 'newPassword');
    const idempotencyKey = stringField(body, 'idempotencyKey');
    if (currentPassword === null || newPassword === null || idempotencyKey === null) {
      return invalidRequest(context);
    }

    try {
      const current = await dependencies.identity.changeRequiredPassword({
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

  referenceApp.get('/api/tasks', async (context) => {
    const denied = await authorizeTasks(context, dependencies);
    if (denied !== null) return denied;
    return context.json({ tasks: dependencies.tasks.list() });
  });

  referenceApp.post('/api/tasks', async (context) => {
    const denied = await authorizeTasks(context, dependencies);
    if (denied !== null) return denied;
    const body = await readObjectBody(context);
    if (body === null) return invalidRequest(context);
    const title = stringField(body, 'title');
    const description = optionalStringField(body, 'description');
    if (title === null || description === undefined) return invalidRequest(context);

    try {
      const task = dependencies.tasks.create({
        title,
        ...(description === null ? {} : { description }),
      });
      return context.json({ task }, 201);
    } catch {
      return errorResponse(context, 400, 'INVALID_TASK', 'The task input is invalid.');
    }
  });

  referenceApp.post('/api/tasks/:id/toggle', async (context) => {
    const denied = await authorizeTasks(context, dependencies);
    if (denied !== null) return denied;
    const task = dependencies.tasks.toggleStatus(context.req.param('id'));
    if (task === undefined) {
      return errorResponse(context, 404, 'TASK_NOT_FOUND', 'The task was not found.');
    }
    return context.json({ task });
  });

  return referenceApp;
}

export const app = createReferenceApp();

async function authorizeTasks(
  context: Context,
  dependencies: ReferenceAppDependencies,
): Promise<Response | null> {
  const current = await resolveCurrentIdentity(context, dependencies.identity);
  if (current instanceof Response) return current;

  try {
    assertIdentityActionAllowed(current, 'application');
    const request = { principalId: principalId(current.identity.identityId) };
    await assertPermission(dependencies.permissions, {
      ...request,
      capability: DEMO_CAPABILITIES.appUse,
    });
    await assertPermission(dependencies.permissions, {
      ...request,
      capability: DEMO_CAPABILITIES.tasksManage,
    });
    return null;
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return errorResponse(
        context,
        403,
        'PERMISSION_DENIED',
        'The current identity is not allowed to manage tasks.',
      );
    }
    return identityErrorResponse(context, error);
  }
}

async function resolveCurrentIdentity(
  context: Context,
  identity: ReferenceIdentityService,
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

function optionalStringField(
  body: Record<string, unknown>,
  field: string,
): string | null | undefined {
  const value = body[field];
  if (value === undefined) return null;
  return typeof value === 'string' ? value : undefined;
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
  status: 400 | 401 | 403 | 404 | 409 | 500 | 503,
  code: ErrorCode,
  message: string,
): Response {
  return context.json({ error: { code, message } }, status);
}
