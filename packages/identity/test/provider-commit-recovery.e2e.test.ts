import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { createPostgresDatabase } from "@appbasis/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type {
  AuthSession,
  IdentityOperation,
  IdentityOperationKind,
  IdentityPersistenceState,
  IdentityStateStore,
} from "../src/contracts";
import { createBetterAuthRuntime } from "../src/better-auth";
import { IdentityService } from "../src/service";

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl === undefined ? describe.skip : describe;
const baseURL = "http://localhost:3000";
const temporaryPassword = "Provider-temp-password-42";
const replacementPassword = "Provider-new-password-84";
const adminUsername = "provider.admin";
const adminPassword = "Provider-admin-password-42";

describeWithPostgres("provider-committed password recovery with real PostgreSQL", () => {
  const connection = createPostgresDatabase(databaseUrl ?? "");
  const { client, database } = connection;
  const auth = createBetterAuthRuntime({
    database,
    baseURL,
    secret: "provider-commit-recovery-secret-at-least-32-chars",
  });
  const backend = new ProviderCommitBetterAuthBackend(auth, client);
  const state = new ProviderCommitPostgresStateStore(client);
  const service = new IdentityService(backend, state);

  beforeAll(async () => {
    await client.unsafe("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    for (const migration of ["0000", "0001"]) {
      const sql = await readFile(
        new URL(`../drizzle/${migration}_appbasis_identity_foundation.sql`, import.meta.url),
        "utf8",
      );
      for (const statement of sql.split("--> statement-breakpoint")) {
        if (statement.trim() !== "") await client.unsafe(statement);
      }
    }
    await backend.initializeAdmin();
  });

  afterAll(async () => {
    await client.end();
  });

  it("reconciles after Better Auth commits but before AppBasis commits", async () => {
    const identity = await service.createInitialUser({
      username: "provider.commit",
      temporaryPassword,
      displayName: "Provider Commit",
    });
    const session = await service.signInWithUsername({
      username: "provider.commit",
      password: temporaryPassword,
    });
    const passwordChangesBefore = backend.passwordChanges;
    backend.failAfterNextPasswordProviderCommit = true;
    const passwordInput = {
      sessionToken: session.sessionToken,
      currentPassword: temporaryPassword,
      newPassword: replacementPassword,
      idempotencyKey: randomUUID(),
    };

    await expect(service.changeRequiredPassword(passwordInput)).rejects.toMatchObject({
      code: "PASSWORD_CHANGE_FAILED",
    });

    await expect(service.getCurrentIdentity(session.sessionToken)).resolves.toBeNull();
    await expect(state.find(identity.identityId)).resolves.toMatchObject({
      mustChangePassword: true,
    });

    await expect(
      service.changeRequiredPassword({ ...passwordInput, newPassword: "wrong-password" }),
    ).rejects.toMatchObject({ code: "SESSION_INVALID" });
    await expect(state.find(identity.identityId)).resolves.toMatchObject({
      mustChangePassword: true,
    });

    const recovered = await service.changeRequiredPassword(passwordInput);
    expect(recovered).toMatchObject({
      identity: { identityId: identity.identityId, mustChangePassword: false },
      access: "full",
    });
    await expect(service.getCurrentIdentity(recovered.sessionToken)).resolves.toMatchObject({
      identity: { identityId: identity.identityId, mustChangePassword: false },
      access: "full",
    });
    expect(backend.passwordChanges).toBe(passwordChangesBefore + 1);
  });

  it("rejects recovery when a failed provider change leaves the temporary password active", async () => {
    const identity = await service.createInitialUser({
      username: "provider.bypass",
      temporaryPassword,
      displayName: "Provider Bypass",
    });
    const session = await service.signInWithUsername({
      username: "provider.bypass",
      password: temporaryPassword,
    });
    const idempotencyKey = randomUUID();
    const passwordChangesBefore = backend.passwordChanges;

    await expect(
      service.changeRequiredPassword({
        sessionToken: session.sessionToken,
        currentPassword: "wrong-current-password",
        newPassword: replacementPassword,
        idempotencyKey,
      }),
    ).rejects.toMatchObject({ code: "PASSWORD_CHANGE_FAILED" });

    await expect(
      service.changeRequiredPassword({
        sessionToken: "invalid-session",
        currentPassword: "wrong-current-password",
        newPassword: temporaryPassword,
        idempotencyKey,
      }),
    ).rejects.toMatchObject({ code: "SESSION_INVALID" });

    await expect(state.find(identity.identityId)).resolves.toMatchObject({
      mustChangePassword: true,
    });
    await expect(
      service.signInWithUsername({ username: "provider.bypass", password: temporaryPassword }),
    ).resolves.toMatchObject({ access: "password-change-required" });
    expect(backend.passwordChanges).toBe(passwordChangesBefore);
  });
});

type SqlClient = ReturnType<typeof createPostgresDatabase>["client"];
type AuthRuntime = ReturnType<typeof createBetterAuthRuntime>;

class ProviderCommitBetterAuthBackend {
  failAfterNextPasswordProviderCommit = false;
  passwordChanges = 0;

  private readonly completedOperations = new Set<string>();
  private readonly passwordSessions = new Map<string, AuthSession>();
  private adminCookie: string | null = null;

  constructor(
    private readonly auth: AuthRuntime,
    private readonly sql: SqlClient,
  ) {}

  async initializeAdmin(): Promise<void> {
    await this.auth.api.createUser({
      body: {
        email: "provider-admin@identity.invalid",
        password: adminPassword,
        name: "Provider Recovery Admin",
        role: "admin",
        data: {
          username: adminUsername,
          displayUsername: adminUsername,
        },
      },
    });
    const response = await this.request("/api/auth/sign-in/username", {
      username: adminUsername,
      password: adminPassword,
    });
    if (!response.ok) throw new Error("Better Auth admin sign-in failed");
    this.adminCookie = sessionCookie(response);
  }

  async createUsernameAccount(input: {
    operationId: string;
    username: string;
    displayName: string;
    technicalEmail: string;
    temporaryPassword: string;
  }): Promise<{ identityId: string }> {
    const existing = await this.sql<{ id: string }[]>`
      SELECT id FROM "user" WHERE username = ${input.username}
    `;
    if (existing[0] !== undefined) return { identityId: existing[0].id };

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
      this.requireAdminCookie(),
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
    this.passwordChanges += 1;

    if (this.failAfterNextPasswordProviderCommit) {
      this.failAfterNextPasswordProviderCommit = false;
      throw new Error("ambiguous provider-committed response");
    }

    this.passwordSessions.set(input.operationId, replacement);
    return replacement;
  }

  async getPasswordCredentialUpdatedAt(identityId: string): Promise<Date | null> {
    const rows = await this.sql<{ updated_at: Date }[]>`
      SELECT updated_at
      FROM account
      WHERE user_id = ${identityId} AND provider_id = 'credential'
      LIMIT 1
    `;
    return rows[0]?.updated_at ?? null;
  }

  async getAccountStatus(identityId: string): Promise<"active" | "disabled"> {
    const rows = await this.sql<{ banned: boolean | null }[]>`
      SELECT banned FROM "user" WHERE id = ${identityId}
    `;
    return rows[0]?.banned === true ? "disabled" : "active";
  }

  async disableIdentity(): Promise<void> {}

  async endSession(sessionToken: string): Promise<void> {
    await this.request("/api/auth/sign-out", {}, sessionToken);
  }

  private requireAdminCookie(): string {
    if (this.adminCookie === null) {
      throw new Error("Better Auth test admin is not initialized");
    }
    return this.adminCookie;
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
    return this.auth.handler(
      new Request(`${baseURL}${path}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
  }
}

class ProviderCommitPostgresStateStore implements IdentityStateStore {
  constructor(private readonly sql: SqlClient) {}

  async findOperation(operationKey: string): Promise<IdentityOperation | null> {
    const rows = await this.sql<OperationRow[]>`
      SELECT operation_id, operation_key, kind, identity_id, completed_at, created_at
      FROM appbasis_identity_operation
      WHERE operation_key = ${operationKey}
    `;
    return rows[0] === undefined ? null : operationFromRow(rows[0]);
  }

  async prepareOperation(input: {
    operationKey: string;
    kind: IdentityOperationKind;
    identityId: string | null;
  }): Promise<IdentityOperation> {
    const operationId = randomUUID();
    const rows = await this.sql<OperationRow[]>`
      INSERT INTO appbasis_identity_operation
        (operation_id, operation_key, kind, identity_id)
      VALUES (${operationId}, ${input.operationKey}, ${input.kind}, ${input.identityId})
      ON CONFLICT (operation_key) DO UPDATE
        SET operation_key = EXCLUDED.operation_key
      RETURNING operation_id, operation_key, kind, identity_id, completed_at, created_at
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
      await transaction`
        INSERT INTO appbasis_identity_security_state (identity_id)
        VALUES (${input.identityId}) ON CONFLICT (identity_id) DO NOTHING
      `;
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
    await this.sql`
      INSERT INTO appbasis_identity_security_state (identity_id)
      VALUES (${input.identityId})
    `;
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

type OperationRow = {
  operation_id: string;
  operation_key: string;
  kind: string;
  identity_id: string | null;
  completed_at: Date | null;
  created_at: Date;
};

type StateRow = {
  id: string;
  username: string;
  name: string;
  person_id: string | null;
  must_change_password: boolean;
  created_at: Date;
  updated_at: Date;
  password_changed_at: Date | null;
  disabled_at: Date | null;
  contact_email: string | null;
};

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

function operationFromRow(row: OperationRow): IdentityOperation {
  return {
    operationId: row.operation_id,
    operationKey: row.operation_key,
    kind: row.kind as IdentityOperationKind,
    identityId: row.identity_id,
    completedAt: row.completed_at,
    createdAt: row.created_at,
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    passwordChangedAt: row.password_changed_at,
    disabledAt: row.disabled_at,
  };
}
