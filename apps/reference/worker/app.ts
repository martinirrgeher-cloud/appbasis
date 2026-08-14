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
        'Reference runtime is not configured.',
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
    const access = await requireCapability(
      context,
      identityHttp,
      dependencies.permissions,
      DEMO_CAPABILITIES.tasksRead,
    );
    if (access instanceof Response) return access;

    const tasks = await dependencies.tasks.list();
    return context.json({ tasks });
  });

  referenceApp.post('/api/tasks', async (context) => {
    const access = await requireCapability(
      context,
      identityHttp,
      dependencies.permissions,
      DEMO_CAPABILITIES.tasksCreate,
    );
    if (access instanceof Response) return access;

    const body = await parseJsonObject(context);
    if (body instanceof Response) return body;

    const title = body.title;
    if (typeof title !== 'string') {
      return errorResponse(
        context,
        400,
        'INVALID_TASK',
        'Task title must be a string.',
      );
    }

    try {
      const task = await dependencies.tasks.create({ title });
      return context.json({ task }, 201);
    } catch (error) {
      if (error instanceof TaskValidationError) {
        return errorResponse(context, 400, 'INVALID_TASK', error.message);
      }
      throw error;
    }
  });

  referenceApp.post('/api/tasks/:taskId/toggle-status', async (context) => {
    const access = await requireCapability(
      context,
      identityHttp,
      dependencies.permissions,
      DEMO_CAPABILITIES.tasksUpdate,
    );
    if (access instanceof Response) return access;

    const taskId = context.req.param('taskId');
    const task = await dependencies.tasks.toggleStatus(taskId);
    if (task === undefined) {
      return errorResponse(context, 404, 'TASK_NOT_FOUND', 'Task not found.');
    }

    return context.json({ task });
  });

  return referenceApp;
}

interface CapabilityAccess {
  readonly identityId: string;
}

async function requireCapability(
  context: Context,
  identityHttp: IdentityHttpHandlers,
  permissions: PermissionStore,
  capability: string,
): Promise<CapabilityAccess | Response> {
  try {
    const currentIdentity = await identityHttp.currentIdentity(context.req.raw);
    const principal = principalId(currentIdentity.identity.identityId);
    const principalPermissions = await permissions.getPrincipalPermissions(principal);
    assertIdentityActionAllowed(currentIdentity, `perform ${capability}`);
    assertPermission(principalPermissions, capability);
    return { identityId: currentIdentity.identity.identityId };
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return errorResponse(
        context,
        403,
        'PERMISSION_DENIED',
        'Permission denied.',
      );
    }
    return identityHttp.identityErrorResponse(error);
  }
}

async function parseJsonObject(
  context: Context,
): Promise<Record<string, unknown> | Response> {
  let body: unknown;
  try {
    body = await context.req.json();
  } catch {
    return errorResponse(context, 400, 'INVALID_REQUEST', 'Invalid JSON body.');
  }

  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return errorResponse(
      context,
      400,
      'INVALID_REQUEST',
      'JSON body must be an object.',
    );
  }

  return body as Record<string, unknown>;
}

function errorResponse(
  context: Context,
  status: 400 | 401 | 403 | 404 | 409 | 423 | 428 | 503,
  code: ErrorCode,
  message: string,
): Response {
  return context.json({ error: { code, message } }, status);
}
