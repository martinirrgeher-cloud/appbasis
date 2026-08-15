import type { CapabilityId, RoleDetails, RoleId, RoleState } from '@appbasis/permissions';

export type ReferenceAccess = 'password-change-required' | 'full';

export interface ReferenceIdentity {
  readonly identityId: string;
  readonly username: string;
  readonly displayName: string;
  readonly contactEmail: string | null;
  readonly personId: string | null;
  readonly mustChangePassword: boolean;
  readonly accountStatus: 'active' | 'disabled';
}

export interface ReferenceSession {
  readonly identity: ReferenceIdentity;
  readonly access: ReferenceAccess;
}

export type ApiTaskStatus = 'open' | 'completed';

export interface ApiTask {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly status: ApiTaskStatus;
}

export interface ReferenceRoleUpdateInput {
  readonly displayName: string;
  readonly description: string | null;
  readonly capabilities: readonly CapabilityId[];
}

export interface ReferenceRoleCreateInput extends ReferenceRoleUpdateInput {
  readonly roleId: string;
}

export interface ReferenceRolePrincipal {
  readonly identityId: string;
  readonly principalId: string;
  readonly username: string;
  readonly displayName: string;
  readonly roleIds: readonly RoleId[];
}

interface ErrorPayload {
  error?: {
    code?: string;
    message?: string;
  };
}

export class ReferenceApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ReferenceApiError';
  }
}

export const referenceApi = {
  getSession(): Promise<ReferenceSession> {
    return requestJson('/api/auth/session');
  },

  signIn(username: string, password: string): Promise<ReferenceSession> {
    return requestJson('/api/auth/sign-in', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },

  changeRequiredPassword(input: {
    currentPassword: string;
    newPassword: string;
    idempotencyKey: string;
  }): Promise<ReferenceSession> {
    return requestJson('/api/auth/change-required-password', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async listTasks(): Promise<readonly ApiTask[]> {
    const payload = await requestJson<{ tasks: readonly ApiTask[] }>('/api/tasks');
    return payload.tasks;
  },

  async createTask(input: {
    title: string;
    description?: string;
  }): Promise<ApiTask> {
    const payload = await requestJson<{ task: ApiTask }>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return payload.task;
  },

  async toggleTask(id: string): Promise<ApiTask> {
    const payload = await requestJson<{ task: ApiTask }>(
      `/api/tasks/${encodeURIComponent(id)}/toggle`,
      { method: 'POST' },
    );
    return payload.task;
  },

  async listRoles(): Promise<readonly RoleDetails[]> {
    const payload = await requestJson<{ roles: readonly RoleDetails[] }>('/api/admin/roles');
    return payload.roles;
  },

  async getRole(id: string): Promise<RoleDetails> {
    const payload = await requestJson<{ role: RoleDetails }>(
      `/api/admin/roles/${encodeURIComponent(id)}/details`,
    );
    return payload.role;
  },

  async listRoleCapabilities(): Promise<readonly CapabilityId[]> {
    const payload = await requestJson<{ capabilities: readonly CapabilityId[] }>(
      '/api/admin/roles/capabilities',
    );
    return payload.capabilities;
  },

  async listRolePrincipals(): Promise<readonly ReferenceRolePrincipal[]> {
    const payload = await requestJson<{ principals: readonly ReferenceRolePrincipal[] }>(
      '/api/admin/roles/principal-assignments',
    );
    return payload.principals;
  },

  async getRolePrincipal(id: string): Promise<ReferenceRolePrincipal> {
    const payload = await requestJson<{ principal: ReferenceRolePrincipal }>(
      `/api/admin/roles/principal-assignments/${encodeURIComponent(id)}`,
    );
    return payload.principal;
  },

  async replacePrincipalRoles(
    id: string,
    roleIds: readonly RoleId[],
  ): Promise<ReferenceRolePrincipal> {
    let payload: { principal?: ReferenceRolePrincipal } | null;
    try {
      payload = await requestJson<{ principal?: ReferenceRolePrincipal } | null>(
        `/api/admin/roles/principal-assignments/${encodeURIComponent(id)}`,
        {
          method: 'PUT',
          body: JSON.stringify({ roleIds }),
        },
      );
    } catch (error) {
      if (!(error instanceof ReferenceApiError) || error.status !== 0) throw error;
      return reconcilePrincipalRoles(id, roleIds, error);
    }

    if (payload?.principal) return payload.principal;
    return reconcilePrincipalRoles(
      id,
      roleIds,
      new ReferenceApiError(
        0,
        'INVALID_RESPONSE',
        'Das Backend hat keine lesbare Antwort auf die Rollenzuweisung geliefert.',
      ),
    );
  },

  async createRole(input: ReferenceRoleCreateInput): Promise<RoleDetails> {
    let payload: { role?: RoleDetails } | null;
    try {
      payload = await requestJson<{ role?: RoleDetails } | null>('/api/admin/roles', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    } catch (error) {
      if (!(error instanceof ReferenceApiError) || error.status !== 0) throw error;
      return reconcileRoleCreate(input, error);
    }

    if (payload?.role) return payload.role;
    return reconcileRoleCreate(
      input,
      new ReferenceApiError(
        0,
        'INVALID_RESPONSE',
        'Das Backend hat keine lesbare Antwort auf das Anlegen der Rolle geliefert.',
      ),
    );
  },

  async updateRole(id: string, input: ReferenceRoleUpdateInput): Promise<RoleDetails> {
    const payload = await requestJson<{ role: RoleDetails }>(
      `/api/admin/roles/${encodeURIComponent(id)}`,
      {
        method: 'PUT',
        body: JSON.stringify(input),
      },
    );
    return payload.role;
  },

  async setRoleState(id: string, state: RoleState): Promise<RoleDetails> {
    const payload = await requestJson<{ role: RoleDetails }>(
      `/api/admin/roles/${encodeURIComponent(id)}/state`,
      {
        method: 'PUT',
        body: JSON.stringify({ state }),
      },
    );
    return payload.role;
  },

  async deleteRole(id: string): Promise<void> {
    try {
      await requestJson<unknown>(`/api/admin/roles/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
    } catch (error) {
      if (!(error instanceof ReferenceApiError) || error.status !== 0) throw error;

      try {
        await referenceApi.getRole(id);
      } catch (reconciliationError) {
        if (
          reconciliationError instanceof ReferenceApiError &&
          reconciliationError.code === 'ROLE_NOT_FOUND'
        ) {
          return;
        }
      }

      throw error;
    }
  },
};

async function reconcilePrincipalRoles(
  principalId: string,
  requestedRoleIds: readonly RoleId[],
  ambiguousError: ReferenceApiError,
): Promise<ReferenceRolePrincipal> {
  try {
    const reconciled = await referenceApi.getRolePrincipal(principalId);
    if (
      reconciled.principalId === principalId &&
      sameRoleSet(reconciled.roleIds, requestedRoleIds)
    ) {
      return reconciled;
    }
  } catch {
    // Preserve the ambiguous write failure unless the authoritative role set exactly matches the request.
  }

  throw ambiguousError;
}

async function reconcileRoleCreate(
  input: ReferenceRoleCreateInput,
  ambiguousError: ReferenceApiError,
): Promise<RoleDetails> {
  try {
    const reconciled = await referenceApi.getRole(input.roleId);
    if (roleMatchesCreateInput(reconciled, input)) return reconciled;
  } catch {
    // Preserve the ambiguous write failure unless the authoritative role exactly matches the request.
  }

  throw ambiguousError;
}

function roleMatchesCreateInput(role: RoleDetails, input: ReferenceRoleCreateInput): boolean {
  return (
    String(role.roleId) === input.roleId &&
    role.kind === 'managed' &&
    role.state === 'active' &&
    role.displayName === input.displayName &&
    role.description === input.description &&
    sameCapabilitySet(role.capabilities, input.capabilities)
  );
}

function sameRoleSet(left: readonly RoleId[], right: readonly RoleId[]): boolean {
  if (left.length !== right.length) return false;
  const leftValues = left.map(String).sort();
  const rightValues = right.map(String).sort();
  return leftValues.every((value, index) => value === rightValues[index]);
}

function sameCapabilitySet(left: readonly CapabilityId[], right: readonly CapabilityId[]): boolean {
  if (left.length !== right.length) return false;
  const leftValues = left.map(String).sort();
  const rightValues = right.map(String).sort();
  return leftValues.every((value, index) => value === rightValues[index]);
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set('content-type', 'application/json');
  headers.set('accept', 'application/json');

  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers,
      credentials: 'same-origin',
    });
  } catch {
    throw new ReferenceApiError(0, 'NETWORK_ERROR', 'Das Backend ist derzeit nicht erreichbar.');
  }

  const payload = await readJson(response);
  if (!response.ok) {
    const errorPayload = payload as ErrorPayload | null;
    throw new ReferenceApiError(
      response.status,
      errorPayload?.error?.code ?? 'HTTP_ERROR',
      errorPayload?.error?.message ?? `HTTP ${response.status}`,
    );
  }

  return payload as T;
}

async function readJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type');
  if (contentType?.includes('application/json') !== true) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}
