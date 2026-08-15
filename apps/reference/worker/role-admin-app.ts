import { Hono, type Context } from 'hono';

import { assertIdentityActionAllowed } from '@appbasis/identity';
import {
  createIdentityHttpHandlers,
  type IdentityHttpHandlers,
  type IdentityHttpService,
} from '@appbasis/identity/http';
import {
  assert as assertPermission,
  capabilityId,
  DEMO_CAPABILITIES,
  PermissionDeniedError,
  principalId,
  roleId,
  RoleAdministrationError,
  type PermissionStore,
  type PostgresRoleAdministration,
  type PrincipalId,
  type RoleAdministrationErrorCode,
  type RoleId,
  type RoleState,
} from '@appbasis/permissions';
import { HEALTH_RESPONSE } from '../shared/health';

export interface ReferenceRolePrincipalIdentity {
  readonly identityId: string;
  readonly username: string;
  readonly displayName: string;
}

export interface ReferenceRolePrincipalDirectory {
  list(): Promise<readonly ReferenceRolePrincipalIdentity[]>;
  find(identityId: string): Promise<ReferenceRolePrincipalIdentity | null>;
}

export interface ReferenceRolePrincipalAssignment extends ReferenceRolePrincipalIdentity {
  readonly principalId: string;
  readonly roleIds: readonly RoleId[];
}

export interface ReferenceRoleAdminDependencies {
  identity: IdentityHttpService;
  principalDirectory: ReferenceRolePrincipalDirectory;
  permissions: PermissionStore;
  roleAdministration: Pick<
    PostgresRoleAdministration,
    | 'listRoles'
    | 'findRole'
    | 'listKnownCapabilities'
    | 'createRole'
    | 'updateRole'
    | 'setRoleState'
    | 'deleteRole'
    | 'replacePrincipalRoles'
  >;
  secureCookies?: boolean;
}

type ErrorCode =
  | 'INVALID_REQUEST'
  | 'PERMISSION_DENIED'
  | 'REFERENCE_ROLE_ADMIN_NOT_CONFIGURED'
  | 'PRINCIPAL_NOT_FOUND'
  | 'ROLE_NOT_FOUND'
  | RoleAdministrationErrorCode;

interface AuthorizedRoleAdministrator {
  actorPrincipalId: PrincipalId;
}

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
    const authorization = await authorizeRoleAdministration(
      context,
      dependencies.permissions,
      identityHttp,
    );
    if (authorization instanceof Response) return authorization;
    return context.json({ roles: await dependencies.roleAdministration.listRoles() });
  });

  app.post('/api/roles', async (context) => {
    const authorization = await authorizeRoleAdministration(
      context,
      dependencies.permissions,
      identityHttp,
    );
    if (authorization instanceof Response) return authorization;

    const body = await readObjectBody(context);
    if (body === null) return invalidRequest(context);
    const requestedRoleId = requiredString(body, 'roleId');
    const displayName = requiredString(body, 'displayName');
    const description = optionalNullableString(body, 'description');
    const capabilities = stringList(body, 'capabilities');
    if (
      requestedRoleId === null ||
      displayName === null ||
      description === undefined ||
      capabilities === null
    ) {
      return invalidRequest(context);
    }

    try {
      const role = await dependencies.roleAdministration.createRole(
        {
          roleId: roleId(requestedRoleId),
          displayName,
          description,
          capabilities: capabilities.map(capabilityId),
        },
        {
          actorPrincipalId: authorization.actorPrincipalId,
          reason: 'Reference Admin API: Rolle anlegen',
        },
      );
      return context.json({ role }, 201);
    } catch (error) {
      return roleAdministrationErrorResponse(context, error);
    }
  });

  app.get('/api/roles/capabilities', async (context) => {
    const authorization = await authorizeRoleAdministration(
      context,
      dependencies.permissions,
      identityHttp,
    );
    if (authorization instanceof Response) return authorization;
    return context.json({
      capabilities: await dependencies.roleAdministration.listKnownCapabilities(),
    });
  });

  app.get('/api/roles/principal-assignments', async (context) => {
    const authorization = await authorizeRoleAdministration(
      context,
      dependencies.permissions,
      identityHttp,
    );
    if (authorization instanceof Response) return authorization;

    const identities = await dependencies.principalDirectory.list();
    const principals: ReferenceRolePrincipalAssignment[] = [];
    for (const identity of identities) {
      const assignment = await principalAssignment(
        dependencies.permissions,
        identity,
      );
      if (assignment !== null) principals.push(assignment);
    }
    return context.json({ principals });
  });

  app.get('/api/roles/principal-assignments/:id', async (context) => {
    const authorization = await authorizeRoleAdministration(
      context,
      dependencies.permissions,
      identityHttp,
    );
    if (authorization instanceof Response) return authorization;

    const assignment = await loadPrincipalAssignment(
      dependencies,
      context.req.param('id'),
    );
    if (assignment === null) {
      return errorResponse(
        context,
        404,
        'PRINCIPAL_NOT_FOUND',
        'The role principal was not found.',
      );
    }
    return context.json({ principal: assignment });
  });

  app.put('/api/roles/principal-assignments/:id', async (context) => {
    const authorization = await authorizeRoleAdministration(
      context,
      dependencies.permissions,
      identityHttp,
    );
    if (authorization instanceof Response) return authorization;

    const body = await readObjectBody(context);
    if (body === null) return invalidRequest(context);
    const requestedRoleIds = stringList(body, 'roleIds');
    if (requestedRoleIds === null) return invalidRequest(context);

    const identity = await dependencies.principalDirectory.find(context.req.param('id'));
    if (identity === null) {
      return errorResponse(
        context,
        404,
        'PRINCIPAL_NOT_FOUND',
        'The role principal was not found.',
      );
    }

    const targetPrincipalId = principalId(identity.identityId);
    const existingPrincipal = await dependencies.permissions.findPrincipal(targetPrincipalId);
    if (existingPrincipal === null) {
      return errorResponse(
        context,
        404,
        'PRINCIPAL_NOT_FOUND',
        'The role principal was not found.',
      );
    }

    try {
      const roleIds = await dependencies.roleAdministration.replacePrincipalRoles(
        targetPrincipalId,
        requestedRoleIds.map(roleId),
        {
          actorPrincipalId: authorization.actorPrincipalId,
          reason: 'Reference Admin API: Benutzerrollen ersetzen',
        },
      );
      return context.json({
        principal: principalAssignmentPayload(identity, targetPrincipalId, roleIds),
      });
    } catch (error) {
      return roleAdministrationErrorResponse(context, error);
    }
  });

  app.get('/api/roles/:id/details', async (context) => {
    const authorization = await authorizeRoleAdministration(
      context,
      dependencies.permissions,
      identityHttp,
    );
    if (authorization instanceof Response) return authorization;
    return roleDetailsResponse(context, dependencies.roleAdministration);
  });

  app.put('/api/roles/:id/state', async (context) => {
    const authorization = await authorizeRoleAdministration(
      context,
      dependencies.permissions,
      identityHttp,
    );
    if (authorization instanceof Response) return authorization;

    const body = await readObjectBody(context);
    if (body === null) return invalidRequest(context);
    const state = roleStateField(body, 'state');
    if (state === null) return invalidRequest(context);

    try {
      const role = await dependencies.roleAdministration.setRoleState(
        roleId(context.req.param('id')),
        state,
        {
          actorPrincipalId: authorization.actorPrincipalId,
          reason: `Reference Admin API: Rolle ${state === 'active' ? 'aktivieren' : 'deaktivieren'}`,
        },
      );
      return context.json({ role });
    } catch (error) {
      return roleAdministrationErrorResponse(context, error);
    }
  });

  app.put('/api/roles/:id', async (context) => {
    const authorization = await authorizeRoleAdministration(
      context,
      dependencies.permissions,
      identityHttp,
    );
    if (authorization instanceof Response) return authorization;

    const body = await readObjectBody(context);
    if (body === null) return invalidRequest(context);
    const displayName = requiredString(body, 'displayName');
    const description = optionalNullableString(body, 'description');
    const capabilities = stringList(body, 'capabilities');
    if (displayName === null || description === undefined || capabilities === null) {
      return invalidRequest(context);
    }

    try {
      const role = await dependencies.roleAdministration.updateRole(
        roleId(context.req.param('id')),
        {
          displayName,
          description,
          capabilities: capabilities.map(capabilityId),
        },
        {
          actorPrincipalId: authorization.actorPrincipalId,
          reason: 'Reference Admin API: Rolle aktualisieren',
        },
      );
      return context.json({ role });
    } catch (error) {
      return roleAdministrationErrorResponse(context, error);
    }
  });

  app.delete('/api/roles/:id', async (context) => {
    const authorization = await authorizeRoleAdministration(
      context,
      dependencies.permissions,
      identityHttp,
    );
    if (authorization instanceof Response) return authorization;

    try {
      await dependencies.roleAdministration.deleteRole(
        roleId(context.req.param('id')),
        {
          actorPrincipalId: authorization.actorPrincipalId,
          reason: 'Reference Admin API: Rolle löschen',
        },
      );
      return context.body(null, 204);
    } catch (error) {
      return roleAdministrationErrorResponse(context, error);
    }
  });

  app.get('/api/roles/:id', async (context) => {
    const authorization = await authorizeRoleAdministration(
      context,
      dependencies.permissions,
      identityHttp,
    );
    if (authorization instanceof Response) return authorization;
    return roleDetailsResponse(context, dependencies.roleAdministration);
  });

  return app;
}

async function loadPrincipalAssignment(
  dependencies: ReferenceRoleAdminDependencies,
  identityId: string,
): Promise<ReferenceRolePrincipalAssignment | null> {
  const identity = await dependencies.principalDirectory.find(identityId);
  if (identity === null) return null;
  return principalAssignment(dependencies.permissions, identity);
}

async function principalAssignment(
  permissions: PermissionStore,
  identity: ReferenceRolePrincipalIdentity,
): Promise<ReferenceRolePrincipalAssignment | null> {
  const resolvedPrincipalId = principalId(identity.identityId);
  const stored = await permissions.findPrincipal(resolvedPrincipalId);
  return stored === null
    ? null
    : principalAssignmentPayload(identity, resolvedPrincipalId, stored.roleIds);
}

function principalAssignmentPayload(
  identity: ReferenceRolePrincipalIdentity,
  resolvedPrincipalId: PrincipalId,
  roleIds: readonly RoleId[],
): ReferenceRolePrincipalAssignment {
  return {
    identityId: identity.identityId,
    principalId: String(resolvedPrincipalId),
    username: identity.username,
    displayName: identity.displayName,
    roleIds,
  };
}

async function roleDetailsResponse(
  context: Context,
  roleAdministration: ReferenceRoleAdminDependencies['roleAdministration'],
): Promise<Response> {
  const requestedRoleId = context.req.param('id');
  if (requestedRoleId === undefined) return invalidRequest(context);
  const role = await roleAdministration.findRole(roleId(requestedRoleId));
  if (role === null) {
    return errorResponse(context, 404, 'ROLE_NOT_FOUND', 'The role was not found.');
  }
  return context.json({ role });
}

async function authorizeRoleAdministration(
  context: Context,
  permissions: PermissionStore,
  identityHttp: IdentityHttpHandlers,
): Promise<AuthorizedRoleAdministrator | Response> {
  const current = await identityHttp.resolveCurrentIdentity(context.req.raw);
  if (current instanceof Response) return current;

  try {
    assertIdentityActionAllowed(current, 'application');
    const actorPrincipalId = principalId(current.identity.identityId);
    const request = { principalId: actorPrincipalId };
    await assertPermission(permissions, {
      ...request,
      capability: DEMO_CAPABILITIES.appUse,
    });
    await assertPermission(permissions, {
      ...request,
      capability: DEMO_CAPABILITIES.usersManage,
    });
    return { actorPrincipalId };
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

async function readObjectBody(context: Context): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await context.req.json();
    if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

function requiredString(body: Record<string, unknown>, field: string): string | null {
  const value = body[field];
  return typeof value === 'string' ? value : null;
}

function optionalNullableString(
  body: Record<string, unknown>,
  field: string,
): string | null | undefined {
  const value = body[field];
  if (value === undefined || value === null) return null;
  return typeof value === 'string' ? value : undefined;
}

function stringList(body: Record<string, unknown>, field: string): string[] | null {
  const value = body[field];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    return null;
  }
  return value as string[];
}

function roleStateField(body: Record<string, unknown>, field: string): RoleState | null {
  const value = body[field];
  return value === 'active' || value === 'inactive' ? value : null;
}

function invalidRequest(context: Context): Response {
  return errorResponse(context, 400, 'INVALID_REQUEST', 'The request body is invalid.');
}

function roleAdministrationErrorResponse(context: Context, error: unknown): Response {
  if (!(error instanceof RoleAdministrationError)) throw error;

  switch (error.code) {
    case 'INVALID_AUDIT_CONTEXT':
    case 'INVALID_ROLE':
    case 'UNKNOWN_CAPABILITY':
      return errorResponse(context, 400, error.code, 'The role request is invalid.');
    case 'PRINCIPAL_NOT_FOUND':
    case 'ROLE_NOT_FOUND':
      return errorResponse(context, 404, error.code, 'The requested role target was not found.');
    case 'ROLE_ACTIVE':
    case 'ROLE_IN_USE':
    case 'ROLE_PROTECTED':
      return errorResponse(context, 409, error.code, 'The role cannot be changed in its current state.');
  }
}

function errorResponse(
  context: Context,
  status: 400 | 403 | 404 | 409 | 503,
  code: ErrorCode,
  message: string,
): Response {
  return context.json({ error: { code, message } }, status);
}
