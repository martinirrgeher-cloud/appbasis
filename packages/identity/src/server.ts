import { randomUUID } from "node:crypto";

import { createPostgresDatabase } from "@appbasis/database";

import type {
  AuthSession,
  IdentityOperation,
  IdentityOperationKind,
  IdentityPersistenceState,
  IdentityStateStore,
} from "./contracts";
import { createBetterAuthRuntime } from "./better-auth";
import { IdentityProvisioningConflictError, IdentityService } from "./service";

type SqlClient = ReturnType<typeof createPostgresDatabase>["client"];
type AuthRuntime = ReturnType<typeof createBetterAuthRuntime>;

export interface BetterAuthIdentityBackendOptions {
  auth: AuthRuntime;
  sql: SqlClient;
  baseURL: string;
  administrativeSessionToken?: string;
  trustedProvisioning?: boolean;
}

export class BetterAuthIdentityBackend {
  private readonly completedOperations = new Set<string>();
  private readonly passwordSessions = new Map<string, AuthSession>();

  constructor(private readonly options: BetterAuthIdentityBackendOptions) {}

  async createUsernameAccount(input: {
    operationId: string;
    username: string;
    displayName: string;
    technicalEmail: string;
    temporaryPassword: string;
    operationCreatedAt: Date;
  }): Promise<{ identityId: string }> {
    await this.assertProvisioningAuthorized();

    const existing = await this.options.sql<
      {
        id: string;
        name: string;
        created_at: Date | string;
        role: string | null;
        banned: boolean | null;
        has_identity_state: boolean;
        owned_by_operation: boolean;
      }[]
    >`
      SELECT u.id,
             u.name,
             u.created_at,
             u.role,
             u.banned,
             EXISTS (
               SELECT 1
               FROM appbasis_identity_security_state state
               WHERE state.identity_id = u.id
             ) AS has_identity_state,
             EXISTS (
               SELECT 1
               FROM appbasis_identity_operation operation
               WHERE operation.operation_id = ${input.operationId}
                 AND operation.identity_id = u.id
             ) AS owned_by_operation
      FROM "user" u
      WHERE u.username = ${input.username}
      LIMIT 1
    `;
    const existingAccount = existing[0];
    if (existingAccount !== undefined) {
      const createdAt = toDate(existingAccount.created_at);
      if (
        existingAccount.banned === true ||
        hasTechnicalAdminRole(existingAccount.role) ||
        (existingAccount.has_identity_state === true &&
          existingAccount.owned_by_operation !== true) ||
        createdAt.getTime() < input.operationCreatedAt.getTime() ||
        existingAccount.name !== input.displayName ||
        !(await this.matchesUsernamePassword({
          username: input.username,
          password: input.temporaryPassword,
          expectedIdentityId: existingAccount.id,
        }))
      ) {
        throw new IdentityProvisioningConflictError();
      }
      return { identityId: existingAccount.id };
    }

    if (this.options.trustedProvisioning === true) {
      try {
        await this.options.auth.api.createUser({
          body: {
            email: input.technicalEmail,
            password: input.temporaryPassword,
            name: input.displayName,
            role: "user",
            data: {
              username: input.username,
              displayUsername: input.username,
            },
          },
        });
      } catch (error) {
        // A concurrent retry can race after both requests observed no provider
        // account. Reconcile the committed winner in a fresh statement rather
        // than turning an idempotent duplicate into a 500.
        const concurrentRows = await this.options.sql<
          { id: string; name: string; created_at: Date | string; role: string | null; banned: boolean | null }[]
        >`
          SELECT id, name, created_at, role, banned
          FROM "user"
          WHERE username = ${input.username}
          LIMIT 1
        `;
        const concurrent = concurrentRows[0];
        if (concurrent === undefined) throw error;
        if (
          concurrent.banned === true ||
          hasTechnicalAdminRole(concurrent.role) ||
          toDate(concurrent.created_at).getTime() < input.operationCreatedAt.getTime() ||
          concurrent.name !== input.displayName ||
          !(await this.matchesUsernamePassword({
            username: input.username,
            password: input.temporaryPassword,
            expectedIdentityId: concurrent.id,
          }))
        ) {
          throw new IdentityProvisioningConflictError();
        }
        this.completedOperations.add(input.operationId);
        return { identityId: concurrent.id };
      }

      const createdRows = await this.options.sql<
        { id: string; created_at: Date | string; role: string | null; banned: boolean | null }[]
      >`
        SELECT id, created_at, role, banned
        FROM "user"
        WHERE username = ${input.username}
        LIMIT 1
      `;
      const created = requiredRow(createdRows);
      if (
        created.banned === true ||
        hasTechnicalAdminRole(created.role) ||
        toDate(created.created_at).getTime() < input.operationCreatedAt.getTime()
      ) {
        throw new IdentityProvisioningConflictError();
      }
      this.completedOperations.add(input.operationId);
      return { identityId: created.id };
    }

    const administrativeSessionToken = this.requireAdministrativeSessionToken();
    const response = await this.request(
      "/api/auth/admin/create-user",
      {
        email: input.technicalEmail,
        password: input.temporaryPassword,
        name: input.displayName,
        data: {
          username: input.username,
          displayUsername: input.username,
        },
      },
      administrativeSessionToken,
    );
    if (!response.ok) {
      throw new Error(`Better Auth admin create-user failed: ${response.status}`);
    }
    const body = (await response.json()) as { user?: { id?: string } };
    const identityId = body.user?.id;
    if (!identityId) throw new Error("Better Auth admin create-user returned no user id");
    this.completedOperations.add(input.operationId);
    return { identityId };
  }

  async matchesUsernamePassword(input: {
    username: string;
    password: string;
    expectedIdentityId: string;
  }): Promise<boolean> {
    const response = await this.request("/api/auth/sign-in/username", {
      username: input.username,
      password: input.password,
    });
    if (!response.ok) return false;

    const body = (await response.json()) as { user?: { id?: string } };
    const identityId = body.user?.id;
    let sessionToken: string;
    try {
      sessionToken = sessionCookie(response);
    } catch {
      return false;
    }

    try {
      return identityId === input.expectedIdentityId;
    } finally {
      await this.endSession(sessionToken);
    }
  }

  async signInWithUsername(input: {
    username: string;
    password: string;
  }): Promise<AuthSession> {
    const response = await this.request("/api/auth/sign-in/username", input);
    if (!response.ok) throw new Error("Better Auth sign-in failed");
    const body = (await response.json()) as { user: { id: string } };
    return {
      identityId: body.user.id,
      sessionToken: sessionCookie(response),
    };
  }

  async getSession(sessionToken: string): Promise<AuthSession | null> {
    const response = await this.request(
      "/api/auth/get-session",
      undefined,
      sessionToken,
      "GET",
    );
    if (!response.ok) return null;
    const body = (await response.json()) as { user?: { id: string } } | null;
    return body?.user === undefined
      ? null
      : { identityId: body.user.id, sessionToken };
  }

  async changePassword(input: {
    operationId: string;
    sessionToken: string;
    currentPassword: string;
    newPassword: string;
    revokeOtherSessions: true;
  }): Promise<AuthSession> {
    const cached = this.passwordSessions.get(input.operationId);
    if (cached !== undefined) return cached;

    const response = await this.request(
      "/api/auth/change-password",
      {
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
        revokeOtherSessions: input.revokeOtherSessions,
      },
      input.sessionToken,
    );
    if (!response.ok) throw new Error("Better Auth password change failed");
    const body = (await response.json()) as {
      token?: string | null;
      user?: { id?: string };
    };
    if (!body.token || !body.user?.id) {
      throw new Error("Better Auth password change returned no replacement session");
    }

    const replacement = {
      identityId: body.user.id,
      sessionToken: sessionCookie(response),
    };
    this.completedOperations.add(input.operationId);
    this.passwordSessions.set(input.operationId, replacement);
    return replacement;
  }

  async getPasswordCredentialUpdatedAt(identityId: string): Promise<Date | null> {
    const rows = await this.options.sql<{ updated_at: Date | string }[]>`
      SELECT updated_at
      FROM account
      WHERE user_id = ${identityId} AND provider_id = 'credential'
      LIMIT 1
    `;
    const updatedAt = rows[0]?.updated_at;
    return updatedAt === undefined ? null : toDate(updatedAt);
  }

  async getAccountStatus(identityId: string): Promise<"active" | "disabled"> {
    const rows = await this.options.sql<{ banned: boolean | null }[]>`
      SELECT banned FROM "user" WHERE id = ${identityId}
    `;
    return rows[0]?.banned === true ? "disabled" : "active";
  }

  async disableIdentity(input: {
    identityId: string;
    operationId: string;
  }): Promise<void> {
    if (this.completedOperations.has(input.operationId)) return;
    const response = await this.request(
      "/api/auth/admin/ban-user",
      {
        userId: input.identityId,
        banReason: "AppBasis identity disabled",
      },
      this.requireAdministrativeSessionToken(),
    );
    if (!response.ok) {
      throw new Error(`Better Auth admin ban-user failed: ${response.status}`);
    }
    this.completedOperations.add(input.operationId);
  }

  async endSession(sessionToken: string): Promise<void> {
    const response = await this.request("/api/auth/sign-out", {}, sessionToken);
    if (!response.ok) {
      throw new Error(`Better Auth sign-out failed: ${response.status}`);
    }
  }

  async assertProvisioningAuthorized(): Promise<void> {
    if (this.options.trustedProvisioning === true) return;
    await this.requireAuthorizedAdministrativeSessionToken();
  }

  private requireAdministrativeSessionToken(): string {
    const token = this.options.administrativeSessionToken;
    if (token === undefined || token.trim().length === 0) {
      throw new Error("An administrative Better Auth session is required.");
    }
    return token;
  }

  private async requireAuthorizedAdministrativeSessionToken(): Promise<string> {
    const token = this.requireAdministrativeSessionToken();
    const response = await this.request(
      "/api/auth/get-session",
      undefined,
      token,
      "GET",
    );
    if (!response.ok) {
      throw new Error("A valid administrative Better Auth session is required.");
    }

    const body = (await response.json()) as { user?: { id?: string } } | null;
    const identityId = body?.user?.id;
    if (identityId === undefined || identityId.length === 0) {
      throw new Error("A valid administrative Better Auth session is required.");
    }

    const rows = await this.options.sql<
      { role: string | null; banned: boolean | null }[]
    >`
      SELECT role, banned
      FROM "user"
      WHERE id = ${identityId}
      LIMIT 1
    `;
    const administrator = rows[0];
    if (
      administrator === undefined ||
      administrator.banned === true ||
      !hasTechnicalAdminRole(administrator.role)
    ) {
      throw new Error("A valid administrative Better Auth session is required.");
    }
    return token;
  }

  private request(
    path: string,
    body?: object,
    cookie?: string,
    method = "POST",
  ): Promise<Response> {
    const headers = new Headers();
    if (body !== undefined) headers.set("content-type", "application/json");
    if (cookie !== undefined) headers.set("cookie", cookie);
    if (method !== "GET") {
      headers.set("origin", new URL(this.options.baseURL).origin);
    }
    return this.options.auth.handler(
      new Request(`${this.options.baseURL}${path}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
  }
}

export class PostgresIdentityStateStore implements IdentityStateStore {
  constructor(private readonly sql: SqlClient) {}

  async findOperation(operationKey: string): Promise<IdentityOperation | null> {
    const rows = await this.sql<OperationRow[]>`
      SELECT operation_id, operation_key, kind, identity_id,
             provisioning_owner, actor_principal_id, reason,
             completed_at, created_at
      FROM appbasis_identity_operation
      WHERE operation_key = ${operationKey}
    `;
    return rows[0] === undefined ? null : operationFromRow(rows[0]);
  }

  async prepareOperation(input: {
    operationKey: string;
    kind: IdentityOperationKind;
    identityId: string | null;
    provisioningAudit?: import("./contracts").IdentityProvisioningAuditContext;
  }): Promise<IdentityOperation> {
    const operationId = randomUUID();
    const provisioningOwner = input.provisioningAudit?.provisioningOwner ?? null;
    const actorPrincipalId = input.provisioningAudit?.actorPrincipalId ?? null;
    const reason = input.provisioningAudit?.reason ?? null;
    const rows = await this.sql<OperationRow[]>`
      INSERT INTO appbasis_identity_operation (
        operation_id,
        operation_key,
        kind,
        identity_id,
        provisioning_owner,
        actor_principal_id,
        reason
      )
      VALUES (
        ${operationId},
        ${input.operationKey},
        ${input.kind},
        ${input.identityId},
        ${provisioningOwner},
        ${actorPrincipalId},
        ${reason}
      )
      ON CONFLICT (operation_key) DO UPDATE
        SET operation_key = EXCLUDED.operation_key
      RETURNING operation_id, operation_key, kind, identity_id,
                provisioning_owner, actor_principal_id, reason,
                completed_at, created_at
    `;
    return operationFromRow(requiredRow(rows));
  }

  async completeProvisioning(input: {
    operationId: string;
    identityId: string;
    username: string;
    displayName: string;
    contactEmail: string | null;
    completedAt: Date;
  }): Promise<IdentityPersistenceState> {
    const completedAt = input.completedAt.toISOString();
    await this.sql.begin(async (transaction) => {
      const targetRows = await transaction<{ role: string | null }[]>`
        SELECT role
        FROM "user"
        WHERE id = ${input.identityId}
        FOR UPDATE
      `;
      const target = requiredRow(targetRows);
      if (hasTechnicalAdminRole(target.role)) {
        throw new Error("Technical Better Auth administrators cannot be AppBasis identities.");
      }

      await transaction`
        INSERT INTO appbasis_identity_security_state (identity_id)
        VALUES (${input.identityId})
        ON CONFLICT (identity_id) DO NOTHING
      `;
      const stateRows = await transaction<{ person_id: string | null }[]>`
        SELECT person_id
        FROM appbasis_identity_security_state
        WHERE identity_id = ${input.identityId}
        FOR UPDATE
      `;
      const existingPersonId = requiredRow(stateRows).person_id;
      if (input.contactEmail !== null && existingPersonId === null) {
        const personId = randomUUID();
        await transaction`
          INSERT INTO appbasis_person (id, display_name, contact_email)
          VALUES (${personId}, ${input.displayName}, ${input.contactEmail})
        `;
        await transaction`
          UPDATE appbasis_identity_security_state
          SET person_id = ${personId}
          WHERE identity_id = ${input.identityId}
        `;
      }
      await transaction`
        UPDATE appbasis_identity_operation
        SET identity_id = ${input.identityId}, completed_at = ${completedAt}
        WHERE operation_id = ${input.operationId}
      `;
    });
    return this.require(input.identityId);
  }

  async create(input: {
    identityId: string;
    username: string;
    displayName: string;
    contactEmail: string | null;
  }): Promise<IdentityPersistenceState> {
    await this.sql.begin(async (transaction) => {
      const targetRows = await transaction<{ role: string | null }[]>`
        SELECT role
        FROM "user"
        WHERE id = ${input.identityId}
        FOR UPDATE
      `;
      const target = requiredRow(targetRows);
      if (hasTechnicalAdminRole(target.role)) {
        throw new Error("Technical Better Auth administrators cannot be AppBasis identities.");
      }

      await transaction`
        INSERT INTO appbasis_identity_security_state (identity_id)
        VALUES (${input.identityId})
        ON CONFLICT (identity_id) DO NOTHING
      `;
      const stateRows = await transaction<{ person_id: string | null }[]>`
        SELECT person_id
        FROM appbasis_identity_security_state
        WHERE identity_id = ${input.identityId}
        FOR UPDATE
      `;
      const existingPersonId = requiredRow(stateRows).person_id;
      if (input.contactEmail !== null && existingPersonId === null) {
        const personId = randomUUID();
        await transaction`
          INSERT INTO appbasis_person (id, display_name, contact_email)
          VALUES (${personId}, ${input.displayName}, ${input.contactEmail})
        `;
        await transaction`
          UPDATE appbasis_identity_security_state
          SET person_id = ${personId}
          WHERE identity_id = ${input.identityId}
        `;
      }
    });
    return this.require(input.identityId);
  }

  async find(identityId: string): Promise<IdentityPersistenceState | null> {
    const rows = await this.sql<StateRow[]>`
      SELECT u.id, u.username, u.name, s.person_id, s.must_change_password,
             s.created_at, s.updated_at, s.password_changed_at, s.disabled_at,
             p.contact_email
      FROM appbasis_identity_security_state s
      JOIN "user" u ON u.id = s.identity_id
      LEFT JOIN appbasis_person p ON p.id = s.person_id
      WHERE u.id = ${identityId}
    `;
    return rows[0] === undefined ? null : stateFromRow(rows[0]);
  }

  async markPasswordChanged(
    identityId: string,
    changedAt: Date,
    operationId: string,
  ): Promise<IdentityPersistenceState> {
    const timestamp = changedAt.toISOString();
    await this.sql.begin(async (transaction) => {
      await transaction`
        UPDATE appbasis_identity_security_state
        SET must_change_password = false,
            password_changed_at = ${timestamp},
            updated_at = ${timestamp}
        WHERE identity_id = ${identityId}
      `;
      await transaction`
        UPDATE appbasis_identity_operation
        SET identity_id = ${identityId}, completed_at = ${timestamp}
        WHERE operation_id = ${operationId}
      `;
    });
    return this.require(identityId);
  }

  async recordDisabled(
    identityId: string,
    disabledAt: Date,
    operationId: string,
  ): Promise<IdentityPersistenceState> {
    const timestamp = disabledAt.toISOString();
    await this.sql.begin(async (transaction) => {
      await transaction`
        UPDATE appbasis_identity_security_state
        SET disabled_at = ${timestamp}, updated_at = ${timestamp}
        WHERE identity_id = ${identityId}
      `;
      await transaction`
        UPDATE appbasis_identity_operation
        SET identity_id = ${identityId}, completed_at = ${timestamp}
        WHERE operation_id = ${operationId}
      `;
    });
    return this.require(identityId);
  }

  private async require(identityId: string): Promise<IdentityPersistenceState> {
    const state = await this.find(identityId);
    if (state === null) throw new Error("Expected PostgreSQL identity state");
    return state;
  }
}

export interface IdentityRuntimeOptions extends BetterAuthIdentityBackendOptions {
  now?: () => Date;
}

export function createIdentityRuntime(options: IdentityRuntimeOptions) {
  const backend = new BetterAuthIdentityBackend(options);
  const stateStore = new PostgresIdentityStateStore(options.sql);
  const service = new IdentityService(
    backend,
    stateStore,
    options.now ?? (() => new Date()),
    () => backend.assertProvisioningAuthorized(),
  );

  return { backend, stateStore, service };
}

type OperationRow = {
  operation_id: string;
  operation_key: string;
  kind: string;
  identity_id: string | null;
  provisioning_owner: string | null;
  actor_principal_id: string | null;
  reason: string | null;
  completed_at: Date | string | null;
  created_at: Date | string;
};

type StateRow = {
  id: string;
  username: string;
  name: string;
  person_id: string | null;
  must_change_password: boolean;
  created_at: Date | string;
  updated_at: Date | string;
  password_changed_at: Date | string | null;
  disabled_at: Date | string | null;
  contact_email: string | null;
};

function hasTechnicalAdminRole(role: string | null): boolean {
  return role
    ?.split(",")
    .map((value) => value.trim())
    .includes("admin") === true;
}

function sessionCookie(response: Response): string {
  const cookie = response.headers.get("set-cookie");
  if (cookie === null) throw new Error("Better Auth did not return a session cookie");
  return cookie.split(";", 1)[0] ?? cookie;
}

function requiredRow<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error("Expected PostgreSQL row");
  return row;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function nullableDate(value: Date | string | null): Date | null {
  return value === null ? null : toDate(value);
}

function operationFromRow(row: OperationRow): IdentityOperation {
  return {
    operationId: row.operation_id,
    operationKey: row.operation_key,
    kind: row.kind as IdentityOperationKind,
    identityId: row.identity_id,
    completedAt: nullableDate(row.completed_at),
    createdAt: toDate(row.created_at),
    provisioningOwner: row.provisioning_owner,
    actorPrincipalId: row.actor_principal_id,
    reason: row.reason,
  };
}

function stateFromRow(row: StateRow): IdentityPersistenceState {
  return {
    identityId: row.id,
    username: row.username,
    displayName: row.name,
    contactEmail: row.contact_email,
    personId: row.person_id,
    mustChangePassword: row.must_change_password,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
    passwordChangedAt: nullableDate(row.password_changed_at),
    disabledAt: nullableDate(row.disabled_at),
  };
}