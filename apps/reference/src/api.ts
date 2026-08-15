import type { CapabilityId, RoleDetails, RoleState } from '@appbasis/permissions';

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
      `/api/admin/roles/${encodeURIComponent(id)}`,
    );
    return payload.role;
  },

  async listRoleCapabilities(): Promise<readonly CapabilityId[]> {
    const payload = await requestJson<{ capabilities: readonly CapabilityId[] }>(
      '/api/admin/roles/capabilities',
    );
    return payload.capabilities;
  },

  async createRole(input: ReferenceRoleCreateInput): Promise<RoleDetails> {
    const payload = await requestJson<{ role: RoleDetails }>('/api/admin/roles', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return payload.role;
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
};

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
