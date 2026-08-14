import { Hono, type Context } from 'hono';

import { TaskValidationError, type TaskRepository } from '@appbasis/tasks';
import { assertIdentityActionAllowed } from '@appbasis/identity';
import {
  createIdentityHttpHandlers,
  type IdentityHttpHandlers,
  type IdentityHttpService,
} from '@appbasis/identity/http';
import {
  assert as assertPermission,
  DEMO_CAPABILITIES,
  PermissionDeniedError,
  principalId,
  type PermissionStore,
} from '@appbasis/permissions';
import { HEALTH_RESPONSE } from '../shared/health';

export interface ReferenceAppDependencies {
  identity: IdentityHttpService;
  permissions: PermissionStore;
  tasks: TaskRepository;
  secureCookies?: boolean;
}

type ErrorCode =
  | 'INVALID_REQUEST'
  | 'INVALID_TASK'
  | 'PERMISSION_DENIED'
  | 'REFERENCE_RUNTIME_NOT_CONFIGURED'
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

  const identityHttp = createIdentityHttpHandlers({
    identity: dependencies.identity,
    secureCookies: dependencies.secureCookies ?? true,
  });
  referenceApp.post('/api/auth/sign-in', (context) =>
    identityHttp.signIn(context.req.raw),
  );
  referenceApp.get('/api/auth/session', (context) =>
    identityHttp.session(context.req.raw),
  );
  referenceApp.post('/api/auth/change-required-password', (context) =>
    identityHttp.changeRequiredPassword(context.req.raw),
  );

  referenceApp.get('/api/tasks', async (context) => {
    const denied = await authorizeTasks(context, dependencies, identityHttp);
    if (denied !== null) return denied;
    return context.json({ tasks: await dependencies.tasks.list() });
  });

  referenceApp.post('/api/tasks', async (context) => {
    const denied = await authorizeTasks(context, dependencies, identityHttp);
    if (denied !== null) return denied;
    const body = await readObjectBody(context);
    if (body === null) return invalidRequest(context);
    const title = stringField(body, 'title');
    const description = optionalStringField(body, 'description');
    if (title === null || description === undefined) return invalidRequest(context);

    try {
      const task = await dependencies.tasks.create({
        title,
        ...(description === null ? {} : { description }),
      });
      return context.json({ task }, 201);
    } catch (error) {
      if (error instanceof TaskValidationError) {
        return errorResponse(context, 400, 'INVALID_TASK', 'The task input is invalid.');
      }
      throw error;
    }
  });

  referenceApp.post('/api/tasks/:id/toggle', async (context) => {
    const denied = await authorizeTasks(context, dependencies, identityHttp);
    if (denied !== null) return denied;
    const task = await dependencies.tasks.toggleStatus(context.req.param('id'));
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
  identityHttp: IdentityHttpHandlers,
): Promise<Response | null> {
  const current = await identityHttp.resolveCurrentIdentity(context.req.raw);
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
    return identityHttp.identityErrorResponse(error);
  }
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

function errorResponse(
  context: Context,
  status: 400 | 403 | 404 | 503,
  code: ErrorCode,
  message: string,
): Response {
  return context.json({ error: { code, message } }, status);
}
