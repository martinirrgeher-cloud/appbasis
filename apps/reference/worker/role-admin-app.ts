import { Hono, type Context } from 'hono';

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
  roleId,
  type CapabilityId,
  type PermissionStore,
  type RoleDetails,
  type RoleId,
} from '@appbasis/permissions';
import { HEALTH_RESPONSE } from '../shared/health';

export interface ReferenceRoleAdministration {
  listRoles(): Promise<readonly RoleDetails[]>;
  findRole(requestedRoleId: RoleId): Promise<RoleDetails | null>;
  listKnownCapabilities(): Promise<readonly CapabilityId[]>;
}

export interface ReferenceRoleAdminDependencies {
  identity: IdentityHttpService;
  permissions: PermissionStore;
  roleAdministration: ReferenceRoleAdministration;
  secureCookies?: boolean;
}

type ErrorCode =
  | 'PERMISSION_DENIED'
  | 'REFERENCE_ROLE_ADMIN_NOT_CONFIGURED'
  | 'ROLE_NOT_FOUND';

export function createReferenceRoleAdminApp(
  dependencies?: ReferenceRoleAdminDependencies,
) {
  const app = new Hono();
  app.get('/api/health', (context) => context.json(HEALTH_RESPONSE));

  if (dependencies === undefined) {
    const unavailable = (context: Context) =>
      errorResponse(
        context,
        503,
        'REFERENCE_ROLE_ADMIN_NOT_CONFIGURED',
        'The Reference role administration runtime is not configured.',
      );
    app.all('/api/roles', unavailable);
    app.all('/api/roles/*', unavailable);
    return app;
  }

  const identityHttp = createIdentityHttpHandlers({
    identity: dependencies.identity,
    secureCookies: dependencies.secureCookies ?? true,
  });

  app.get('/api/roles', async (context) => {
    const denied = await authorizeRoleAdministration(
      context,
      dependencies.permissions,
      identityHttp,
    );
    if (denied !== null) return denied;
    return context.json({ roles: await dependencies.roleAdministration.listRoles() });
  });

  app.get('/api/roles/capabilities', async (context) => {
    const denied = await authorizeRoleAdministration(
      context,
      dependencies.permissions,
      identityHttp,
    );
    if (denied !== null) return denied;
    return context.json({
      capabilities: await dependencies.roleAdministration.listKnownCapabilities(),
    });
  });

  app.get('/api/roles/:id', async (context) => {
    const denied = await authorizeRoleAdministration(
      context,
      dependencies.permissions,
      identityHttp,
    );
    if (denied !== null) return denied;
    const role = await dependencies.roleAdministration.findRole(
      roleId(context.req.param('id')),
    );
    if (role === null) {
      return errorResponse(context, 404, 'ROLE_NOT_FOUND', 'The role was not found.');
    }
    return context.json({ role });
  });

  return app;
}

async function authorizeRoleAdministration(
  context: Context,
  permissions: PermissionStore,
  identityHttp: IdentityHttpHandlers,
): Promise<Response | null> {
  const current = await identityHttp.resolveCurrentIdentity(context.req.raw);
  if (current instanceof Response) return current;

  try {
    assertIdentityActionAllowed(current, 'application');
    const request = { principalId: principalId(current.identity.identityId) };
    await assertPermission(permissions, {
      ...request,
      capability: DEMO_CAPABILITIES.appUse,
    });
    await assertPermission(permissions, {
      ...request,
      capability: DEMO_CAPABILITIES.usersManage,
    });
    return null;
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return errorResponse(
        context,
        403,
        'PERMISSION_DENIED',
        'The current identity is not allowed to administer roles.',
      );
    }
    return identityHttp.identityErrorResponse(error);
  }
}

function errorResponse(
  context: Context,
  status: 403 | 404 | 503,
  code: ErrorCode,
  message: string,
): Response {
  return context.json({ error: { code, message } }, status);
}
