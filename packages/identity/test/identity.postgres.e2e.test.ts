import { readFile } from "node:fs/promises";

import { createPostgresDatabase } from "@appbasis/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createBetterAuthRuntime } from "../src/better-auth";
import { IdentityProvisioningConflictError, IdentityService } from "../src/service";
import {
  BetterAuthIdentityBackend,
  createIdentityRuntime,
  PostgresIdentityStateStore,
  type BetterAuthIdentityBackendOptions,
} from "../src/server";

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl === undefined ? describe.skip : describe;
const baseURL = "http://localhost:3000";
const temporaryPassword = "Temporary-password-42";
const replacementPassword = "Replacement-password-84";
const contactEmail = "phase.two@example.test";
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
  let administrativeSessionToken = "";
  let runtime!: ReturnType<typeof createIdentityRuntime>;

  beforeAll(async () => {
    await client.unsafe(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`);
    for (const migration of [
      "0000_appbasis_identity_foundation.sql",
      "0001_appbasis_identity_foundation.sql",
      "0002_appbasis_identity_provisioning_audit.sql",
    ]) {
      const sql = await readFile(
        new URL(`../drizzle/${migration}`, import.meta.url),
        "utf8",
      );
      for (const statement of sql.split("--> statement-breakpoint")) {
        if (statement.trim() !== "") await client.unsafe(statement);
      }
    }

    administrativeSessionToken = await createAdministrativeSession(
      auth,
      adminUsername,
      adminPassword,
      "phase2-admin@identity.invalid",
      "Phase 2B Admin",
    );
    runtime = createIdentityRuntime({
      auth,
      sql: client,
      baseURL,
      administrativeSessionToken,
    });
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

  it("rejects partial provisioning audit tuples at the database boundary", async () => {
    await expect(
      client`
        INSERT INTO appbasis_identity_operation (
          operation_id,
          operation_key,
          kind,
          identity_id,
          provisioning_owner
        )
        VALUES (
          'partial-audit-operation',
          'partial-audit-operation-key',
          'provision',
          NULL,
          'ulc-linz:trainer-user'
        )
      `,
    ).rejects.toThrow();
  });

  it("allows the dedicated trusted provisioning owner without a technical-admin session and persists its audit", async () => {
    const trustedRuntime = createIdentityRuntime({
      auth,
      sql: client,
      baseURL,
      trustedProvisioning: true,
    });
    const identity = await trustedRuntime.service.createInitialUserWithAudit(
      {
        username: "trusted.trainer",
        temporaryPassword,
        displayName: "Trusted Trainer",
      },
      {
        provisioningOwner: "ulc-linz:trainer-user",
        actorPrincipalId: "ulc-admin-1",
        reason: "ULC Linz trainer user provisioning",
      },
    );

    expect(identity).toMatchObject({
      username: "trusted.trainer",
      mustChangePassword: true,
      accountStatus: "active",
    });
    await expect(
      trustedRuntime.stateStore.findOperation("provision:trusted.trainer"),
    ).resolves.toMatchObject({
      identityId: identity.identityId,
      provisioningOwner: "ulc-linz:trainer-user",
      actorPrincipalId: "ulc-admin-1",
      reason: "ULC Linz trainer user provisioning",
    });
    await expect(
      trustedRuntime.service.signInWithUsername({
        username: "trusted.trainer",
        password: temporaryPassword,
      }),
    ).resolves.toMatchObject({
      access: "password-change-required",
      identity: { identityId: identity.identityId },
    });
  });

  it("reconciles concurrent trusted create-user collisions as one idempotent provisioning operation", async () => {
    const username = "trusted.concurrent";
    const input = {
      username,
      temporaryPassword,
      displayName: "Trusted Concurrent Trainer",
    };
    const audit = {
      provisioningOwner: "ulc-linz:trainer-user",
      actorPrincipalId: "ulc-admin-concurrent",
      reason: "ULC Linz trainer user provisioning",
    };
    const runtimes = Array.from({ length: 6 }, () =>
      createIdentityRuntime({
        auth,
        sql: client,
        baseURL,
        trustedProvisioning: true,
      }),
    );

    const identities = await Promise.all(
      runtimes.map((trustedRuntime) =>
        trustedRuntime.service.createInitialUserWithAudit(input, audit),
      ),
    );

    expect(new Set(identities.map((identity) => identity.identityId)).size).toBe(1);
    expect(identities.every((identity) => identity.accountStatus === "active")).toBe(true);
    const userRows = await client<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM "user"
      WHERE username = ${username}
    `;
    expect(userRows[0]?.count).toBe(1);
  });

  it("rejects a concurrent trusted retry that uses different temporary credentials", async () => {
    const username = "trusted.concurrent.credentials";
    const audit = {
      provisioningOwner: "ulc-linz:trainer-user",
      actorPrincipalId: "ulc-admin-concurrent-credentials",
      reason: "ULC Linz trainer user provisioning",
    };
    const passwords = [temporaryPassword, replacementPassword] as const;
    const runtimes = passwords.map(() =>
      createIdentityRuntime({
        auth,
        sql: client,
        baseURL,
        trustedProvisioning: true,
      }),
    );

    const results = await Promise.allSettled(
      runtimes.map((trustedRuntime, index) =>
        trustedRuntime.service.createInitialUserWithAudit(
          {
            username,
            temporaryPassword: passwords[index]!,
            displayName: "Trusted Concurrent Credential Trainer",
          },
          audit,
        ),
      ),
    );

    const fulfilledIndexes = results.flatMap((result, index) =>
      result.status === "fulfilled" ? [index] : [],
    );
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(fulfilledIndexes).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(IdentityProvisioningConflictError);

    const winnerIndex = fulfilledIndexes[0]!;
    const loserIndex = winnerIndex === 0 ? 1 : 0;
    await expect(
      runtimes[winnerIndex]!.service.signInWithUsername({
        username,
        password: passwords[winnerIndex]!,
      }),
    ).resolves.toMatchObject({
      access: "password-change-required",
    });
    await expect(
      runtimes[loserIndex]!.service.signInWithUsername({
        username,
        password: passwords[loserIndex]!,
      }),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
  });

  it("validates admin provisioning, contact profile persistence, username login and the required first password change through the production runtime", async () => {
    const service = runtime.service;
    const identity = await service.createInitialUser({
      username: "phase.two_user",
      temporaryPassword,
      displayName: "Phase Two User",
      contactEmail,
    });
    expect(identity).toMatchObject({
      username: "phase.two_user",
      contactEmail,
      personId: expect.any(String),
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
    expect(first.identity).toMatchObject({
      identityId: identity.identityId,
      contactEmail,
      personId: identity.personId,
    });

    const changed = await service.changeRequiredPassword({
      sessionToken: first.sessionToken,
      currentPassword: temporaryPassword,
      newPassword: replacementPassword,
      idempotencyKey: idempotencyKeys.firstPasswordChange,
    });
    expect(changed.identity.mustChangePassword).toBe(false);
    expect(changed.identity).toMatchObject({
      contactEmail,
      personId: identity.personId,
    });
    expect(changed.access).toBe("full");
    expect(changed.sessionToken).not.toBe(first.sessionToken);
    await expect(service.getCurrentIdentity(first.sessionToken)).resolves.toBeNull();
    await expect(service.getCurrentIdentity(other.sessionToken)).resolves.toBeNull();
    await expect(service.getCurrentIdentity(changed.sessionToken)).resolves.toMatchObject({
      access: "full",
      identity: {
        identityId: identity.identityId,
        contactEmail,
        personId: identity.personId,
        mustChangePassword: false,
      },
    });
    await expect(
      service.signInWithUsername({ username: "phase.two_user", password: temporaryPassword }),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
    await expect(
      service.signInWithUsername({ username: "phase.two_user", password: replacementPassword }),
    ).resolves.toMatchObject({
      access: "full",
      identity: { contactEmail, personId: identity.personId },
    });
  });

  it.each(["ab", "contains-dash", "contains space", "x".repeat(31)])(
    "rejects username %j outside [a-z0-9._]{3,30}",
    async (username) => {
      await expect(
        runtime.service.createInitialUser({ username, temporaryPassword, displayName: "Invalid" }),
      ).rejects.toBeInstanceOf(TypeError);
    },
  );

  it("durably reconciles ambiguous provisioning and request-scoped password retries through production adapters", async () => {
    const backend = new CountingBetterAuthIdentityBackend({
      auth,
      sql: client,
      baseURL,
      administrativeSessionToken,
    });
    const state = new AmbiguousCommitStateStore(client);
    const service = new IdentityService(backend, state);
    const durableContactEmail = "durable.retry@example.test";

    state.failAfterNextCommit = true;
    const input = {
      username: "durable.retry",
      temporaryPassword,
      displayName: "Durable Retry",
      contactEmail: durableContactEmail,
    };
    await expect(service.createInitialUser(input)).rejects.toThrow("ambiguous");
    const identity = await service.createInitialUser(input);
    expect(identity).toMatchObject({
      username: "durable.retry",
      contactEmail: durableContactEmail,
      personId: expect.any(String),
      mustChangePassword: true,
    });
    expect(await backend.countUsers("durable.retry")).toBe(1);
    const personRows = await client<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM appbasis_person
      WHERE contact_email = ${durableContactEmail}
    `;
    expect(personRows[0]?.count).toBe(1);

    const session = await service.signInWithUsername({
      username: "durable.retry",
      password: temporaryPassword,
    });
    const passwordChangesBeforeRetry = backend.passwordChanges;
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
      identity: {
        identityId: identity.identityId,
        contactEmail: durableContactEmail,
        personId: identity.personId,
        mustChangePassword: false,
      },
      access: "full",
    });
    await expect(service.getCurrentIdentity(recovered.sessionToken)).resolves.toMatchObject({
      access: "full",
      identity: {
        identityId: identity.identityId,
        contactEmail: durableContactEmail,
        personId: identity.personId,
      },
    });
    expect(backend.passwordChanges).toBe(passwordChangesBeforeRetry + 1);
  });

  it("serializes concurrent contact-profile completion without creating an orphan person", async () => {
    const concurrentContactEmail = "concurrent.profile@example.test";
    const operationId = "concurrent-profile-operation";
    const created = await runtime.backend.createUsernameAccount({
      operationId: "concurrent-profile-provider",
      username: "concurrent.profile",
      displayName: "Concurrent Profile",
      technicalEmail: "concurrent-profile@identity.invalid",
      temporaryPassword,
      operationCreatedAt: new Date(0),
    });
    await client`
      INSERT INTO appbasis_identity_operation
        (operation_id, operation_key, kind, identity_id)
      VALUES (
        ${operationId},
        'provision:concurrent.profile',
        'provision',
        NULL
      )
    `;
    const input = {
      operationId,
      identityId: created.identityId,
      username: "concurrent.profile",
      displayName: "Concurrent Profile",
      contactEmail: concurrentContactEmail,
      completedAt: new Date(),
    };

    const [first, second] = await Promise.all([
      new PostgresIdentityStateStore(client).completeProvisioning(input),
      new PostgresIdentityStateStore(client).completeProvisioning(input),
    ]);

    expect(first).toMatchObject({
      identityId: created.identityId,
      contactEmail: concurrentContactEmail,
      personId: expect.any(String),
    });
    expect(second).toMatchObject({
      identityId: created.identityId,
      contactEmail: concurrentContactEmail,
      personId: first.personId,
    });
    const personRows = await client<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM appbasis_person
      WHERE contact_email = ${concurrentContactEmail}
    `;
    expect(personRows[0]?.count).toBe(1);
  });

  it("disables accounts through the production Better Auth backend and terminates existing and future sessions", async () => {
    const backend = new CountingBetterAuthIdentityBackend({
      auth,
      sql: client,
      baseURL,
      administrativeSessionToken,
    });
    const state = new AmbiguousCommitStateStore(client);
    const service = new IdentityService(backend, state);

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

    const disablesBeforeRetry = backend.disables;
    state.failAfterNextCommit = true;
    await expect(service.disableIdentity(identity.identityId)).rejects.toThrow("ambiguous");
    await expect(service.disableIdentity(identity.identityId)).resolves.toMatchObject({
      accountStatus: "disabled",
    });
    expect(backend.disables).toBe(disablesBeforeRetry + 1);
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

class CountingBetterAuthIdentityBackend extends BetterAuthIdentityBackend {
  passwordChanges = 0;
  disables = 0;
  private readonly countedPasswordOperations = new Set<string>();
  private readonly countedDisableOperations = new Set<string>();

  constructor(options: BetterAuthIdentityBackendOptions) {
    super(options);
  }

  override async changePassword(
    input: Parameters<BetterAuthIdentityBackend["changePassword"]>[0],
  ) {
    const result = await super.changePassword(input);
    if (!this.countedPasswordOperations.has(input.operationId)) {
      this.countedPasswordOperations.add(input.operationId);
      this.passwordChanges += 1;
    }
    return result;
  }

  override async disableIdentity(
    input: Parameters<BetterAuthIdentityBackend["disableIdentity"]>[0],
  ): Promise<void> {
    await super.disableIdentity(input);
    if (!this.countedDisableOperations.has(input.operationId)) {
      this.countedDisableOperations.add(input.operationId);
      this.disables += 1;
    }
  }

  async countUsers(username: string): Promise<number> {
    const sql = (this as unknown as { options: BetterAuthIdentityBackendOptions }).options.sql;
    const rows = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM "user" WHERE username = ${username}
    `;
    return rows[0]?.count ?? 0;
  }
}

class AmbiguousCommitStateStore extends PostgresIdentityStateStore {
  failAfterNextCommit = false;

  override async completeProvisioning(
    input: Parameters<PostgresIdentityStateStore["completeProvisioning"]>[0],
  ) {
    const result = await super.completeProvisioning(input);
    this.maybeFailAfterCommit();
    return result;
  }

  override async markPasswordChanged(
    identityId: string,
    changedAt: Date,
    operationId: string,
  ) {
    const result = await super.markPasswordChanged(identityId, changedAt, operationId);
    this.maybeFailAfterCommit();
    return result;
  }

  override async recordDisabled(
    identityId: string,
    disabledAt: Date,
    operationId: string,
  ) {
    const result = await super.recordDisabled(identityId, disabledAt, operationId);
    this.maybeFailAfterCommit();
    return result;
  }

  private maybeFailAfterCommit(): void {
    if (!this.failAfterNextCommit) return;
    this.failAfterNextCommit = false;
    throw new Error("ambiguous committed response");
  }
}

async function createAdministrativeSession(
  auth: AuthRuntime,
  username: string,
  password: string,
  email: string,
  name: string,
): Promise<string> {
  await auth.api.createUser({
    body: {
      email,
      password,
      name,
      role: "admin",
      data: { username, displayUsername: username },
    },
  });
  const response = await auth.handler(
    new Request(`${baseURL}/api/auth/sign-in/username`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    }),
  );
  if (!response.ok) throw new Error("Better Auth admin sign-in failed");
  return sessionCookie(response);
}

function sessionCookie(response: Response): string {
  const cookie = response.headers.get("set-cookie");
  if (cookie === null) throw new Error("Better Auth did not return a session cookie");
  return cookie.split(";", 1)[0] ?? cookie;
}
