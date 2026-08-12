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
const temporaryPassword = "Temporary-password-42";
const replacementPassword = "Replacement-password-84";
const adminUsername = "phase2.admin";
const adminPassword = "Phase2-admin-password-42";
const idempotencyKeys = {
  firstPasswordChange: "66666666-6666-4666-8666-666666666666",
  durablePasswordChange: "77777777-7777-4777-8777-777777777777",
} as const;

describeWithPostgres("Identity with real PostgreSQL and Better Auth", () => {
  const connection = createPostgresDatabase(databaseUrl ?? "");
  const { client, database } = connection;
  const auth = createBetterAuthRuntime({
    database,
    baseURL,
    secret: "phase-2b-local-test-secret-at-least-32-characters",
  });
  const backend = new PostgresBetterAuthBackend(auth, client);
  const state = new PostgresIdentityStateStore(client);
  const service = new IdentityService(backend, state);

  beforeAll(async () => {
    await client.unsafe(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`);
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

  it("applies the owned migrations to an empty PostgreSQL database", async () => {
    const rows = await client<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' ORDER BY table_name
    `;
    expect(rows.map((row) => row.table_name)).toEqual(
      expect.arrayContaining([
        "account",
        "appbasis_identity_operation",
        "appbasis_identity_security_state",
        "session",
        "user",
      ]),
    );
  });

  it("validates admin provisioning, username login and the required first password change", async () => {
    const identity = await service.createInitialUser({
      username: "phase.two_user",
      temporaryPassword,
      displayName: "Phase Two User",
    });
    expect(identity).toMatchObject({
      username: "phase.two_user",
      mustChangePassword: true,
      accountStatus: "active",
    });

    const first = await service.signInWithUsername({
      username: "phase.two_user",
      password: temporaryPassword,
    });
    const other = await service.signInWithUsername({
      username: "phase.two_user",
      password: temporaryPassword,
    });
    expect(first.access).toBe("password-change-required");

    const changed = await service.changeRequiredPassword({
      sessionToken: first.sessionToken,
      currentPassword: temporaryPassword,
      newPassword: replacementPassword,
      idempotencyKey: idempotencyKeys.firstPasswordChange,
    });
    expect(changed.identity.mustChangePassword).toBe(false);
    expect(changed.access).toBe("full");
    expect(changed.sessionToken).not.toBe(first.sessionToken);
    await expect(service.getCurrentIdentity(first.sessionToken)).resolves.toBeNull();
    await expect(service.getCurrentIdentity(other.sessionToken)).resolves.toBeNull();
    await expect(service.getCurrentIdentity(changed.sessionToken)).resolves.toMatchObject({
      access: "full",
      identity: { identityId: identity.identityId, mustChangePassword: false },
    });
    await expect(
      service.signInWithUsername({ username: "phase.two_user", password: temporaryPassword }),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
    await expect(
      service.signInWithUsername({ username: "phase.two_user", password: replacementPassword }),
    ).resolves.toMatchObject({ access: "full" });
  });

  it.each(["ab", "contains-dash", "contains space", "x".repeat(31)])(
    "rejects username %j outside [a-z0-9._]{3,30}",
    async (username) => {
      await expect(
        service.createInitialUser({ username, temporaryPassword, displayName: "Invalid" }),
      ).rejects.toBeInstanceOf(TypeError);
    },
  );

  it("durably reconciles ambiguous provisioning and request-scoped password retries", async () => {
    state.failAfterNextCommit = true;
    const input = {
      username: "durable.retry",
      temporaryPassword,
      displayName: "Durable Retry",
    };
    await expect(service.createInitialUser(input)).rejects.toThrow("ambiguous");
    const identity = await service.createInitialUser(input);
    expect(identity).toMatchObject({ username: "durable.retry", mustChangePassword: true });
    expect(await backend.countUsers("durable.retry")).toBe(1);

    const session = await service.signInWithUsername({
      username: "durable.retry",
      password: temporaryPassword,
    });
    const passwordChangesBeforeRetry = await backend.countPasswordChanges();
    state.failAfterNextCommit = true;
    const passwordInput = {
      sessionToken: session.sessionToken,
      currentPassword: temporaryPassword,
      newPassword: replacementPassword,
      idempotencyKey: idempotencyKeys.durablePasswordChange,
    };
    await expect(service.changeRequiredPassword(passwordInput)).rejects.toThrow("ambiguous");
    const recovered = await service.changeRequiredPassword(passwordInput);
    expect(recovered).toMatchObject({
      identity: { identityId: identity.identityId, mustChangePassword: false },
      access: "full",
    });
    await expect(service.getCurrentIdentity(recovered.sessionToken)).resolves.toMatchObject({
      access: "full",
      identity: { identityId: identity.identityId },
    });
    expect(await backend.countPasswordChanges()).toBe(passwordChangesBeforeRetry + 1);
  });

  it("disables accounts through Better Auth admin and terminates existing and future sessions", async () => {
    const identity = await service.createInitialUser({
      username: "disabled.user",
      temporaryPassword,
      displayName: "Disabled User",
    });
    const first = await service.signInWithUsername({
      username: "disabled.user",
      password: temporaryPassword,
    });
    const other = await service.signInWithUsername({
      username: "disabled.user",
      password: temporaryPassword,
    });

    const disablesBeforeRetry = await backend.countDisables();
    state.failAfterNextCommit = true;
    await expect(service.disableIdentity(identity.identityId)).rejects.toThrow("ambiguous");
    await expect(service.disableIdentity(identity.identityId)).resolves.toMatchObject({
      accountStatus: "disabled",
    });
    expect(await backend.countDisables()).toBe(disablesBeforeRetry + 1);
    await expect(service.getCurrentIdentity(first.sessionToken)).resolves.toBeNull();
    await expect(service.getCurrentIdentity(other.sessionToken)).resolves.toBeNull();
    await expect(
      service.signInWithUsername({ username: "disabled.user", password: temporaryPassword }),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
  });

  it("keeps credentials and provider payloads out of AppBasis operation tables", async () => {
    const columns = await client<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'appbasis_identity_operation'
    `;
    expect(columns.map(({ column_name }) => column_name).join(" ")).not.toMatch(
      /password|credential|provider|payload|secret|token|hash/i,
    );

    const operations = await client<Record<string, unknown>[]>`
      SELECT * FROM appbasis_identity_operation ORDER BY created_at
    `;
    const securityState = await client<Record<string, unknown>[]>`
      SELECT * FROM appbasis_identity_security_state ORDER BY created_at
    `;
    const passwordOperationKeys = operations
      .map((row) => row.operation_key)
      .filter(
        (key): key is string =>
          typeof key === "string" && key.startsWith("required-password-change:"),
      );
    expect(passwordOperationKeys.length).toBeGreaterThan(0);
    for (const key of passwordOperationKeys) {
      expect(key).toMatch(
        /^required-password-change:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    }

    const appBasisPayload = JSON.stringify({ operations, securityState });
    expect(appBasisPayload).not.toContain(temporaryPassword);
    expect(appBasisPayload).not.toContain(replacementPassword);
    expect(appBasisPayload).not.toContain(adminPassword);
    expect(appBasisPayload).not.toContain("better-auth.session_token");
  });
});

type SqlClient = ReturnType<typeof createPostgresDatabase>["client"];
type AuthRuntime = ReturnType<typeof createBetterAuthRuntime>;

class PostgresBetterAuthBackend {
  private completed = new Set<string>();
  private passwordSessions = new Map<string, AuthSession>();
  private passwordChanges = 0;
  private disables = 0;
  private adminCookie: string | null = null;

  constructor(private readonly auth: AuthRuntime, private readonly sql: SqlClient) {}

  async initializeAdmin(): Promise<void> {
    await this.auth.api.createUser({
      body: {
        email: "phase2-admin@identity.invalid",
        password: adminPassword,
        name: "Phase 2B Admin",
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
    if (!response.ok) throw new Error(`Better Auth admin create-user failed: ${response.status}`);
    const body = (await response.json()) as { user?: { id?: string } };
    const identityId = body.user?.id;
    if (!identityId) throw new Error("Better Auth admin create-user returned no user id");
    this.completed.add(input.operationId);
    return { identityId };
  }

  async signInWithUsername(input: { username: string; password: string }): Promise<AuthSession> {
    const response = await this.request("/api/auth/sign-in/username", {
      username: input.username,
      password: input.password,
    });
    if (!response.ok) throw new Error("Better Auth sign-in failed");
    const body = (await response.json()) as { user: { id: string } };
    return { identityId: body.user.id, sessionToken: sessionCookie(response) };
  }

  async getSession(sessionToken: string): Promise<AuthSession | null> {
    const response = await this.request("/api/auth/get-session", undefined, sessionToken, "GET");
    if (!response.ok) return null;
    const body = (await response.json()) as { user?: { id: string } } | null;
    return body?.user === undefined ? null : { identityId: body.user.id, sessionToken };
  }

  async changePassword(input: {
    operationId: string;
    sessionToken: string;
    currentPassword: string;
    newPassword: string;
    revokeOtherSessions: true;
  }): Promise<AuthSession> {
    const completed = this.passwordSessions.get(input.operationId);
    if (completed !== undefined) return completed;

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
    this.completed.add(input.operationId);
    this.passwordSessions.set(input.operationId, replacement);
    this.passwordChanges += 1;
    return replacement;
  }

  async getAccountStatus(identityId: string): Promise<"active" | "disabled"> {
    const rows = await this.sql<{ banned: boolean | null }[]>`
      SELECT banned FROM "user" WHERE id = ${identityId}
    `;
    return rows[0]?.banned === true ? "disabled" : "active";
  }

  async disableIdentity(input: { identityId: string; operationId: string }): Promise<void> {
    if (this.completed.has(input.operationId)) return;
    const response = await this.request(
      "/api/auth/admin/ban-user",
      { userId: input.identityId, banReason: "AppBasis identity disabled" },
      this.requireAdminCookie(),
    );
    if (!response.ok) throw new Error(`Better Auth admin ban-user failed: ${response.status}`);
    this.completed.add(input.operationId);
    this.disables += 1;
  }

  async endSession(sessionToken: string): Promise<void> {
    await this.request("/api/auth/sign-out", {}, sessionToken);
  }

  async countUsers(username: string): Promise<number> {
    const rows = await this.sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM "user" WHERE username = ${username}
    `;
    return rows[0]?.count ?? 0;
  }

  async countPasswordChanges(): Promise<number> {
    return this.passwordChanges;
  }

  async countDisables(): Promise<number> {
    return this.disables;
  }

  private requireAdminCookie(): string {
    if (this.adminCookie === null) throw new Error("Better Auth test admin is not initialized");
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
    return this.auth.handler(new Request(`${baseURL}${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }));
  }
}

class PostgresIdentityStateStore implements IdentityStateStore {
  failAfterNextCommit = false;

  constructor(private readonly sql: SqlClient) {}

  async findOperation(operationKey: string): Promise<IdentityOperation | null> {
    const rows = await this.sql<OperationRow[]>`
      SELECT operation_id, operation_key, kind, identity_id, completed_at
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
      RETURNING operation_id, operation_key, kind, identity_id, completed_at
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
    this.maybeFailAfterCommit();
    return this.require(input.identityId);
  }

  async create(input: {
    identityId: string;
    username: string;
    displayName: string;
    contactEmail: string | null;
  }): Promise<IdentityPersistenceState> {
    await this.sql`
      INSERT INTO appbasis_identity_security_state (identity_id) VALUES (${input.identityId})
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
    this.maybeFailAfterCommit();
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
    this.maybeFailAfterCommit();
    return this.require(identityId);
  }

  private async require(identityId: string): Promise<IdentityPersistenceState> {
    const state = await this.find(identityId);
    if (state === null) throw new Error("Expected PostgreSQL identity state");
    return state;
  }

  private maybeFailAfterCommit(): void {
    if (!this.failAfterNextCommit) return;
    this.failAfterNextCommit = false;
    throw new Error("ambiguous committed response");
  }
}

type OperationRow = {
  operation_id: string;
  operation_key: string;
  kind: string;
  identity_id: string | null;
  completed_at: Date | null;
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
