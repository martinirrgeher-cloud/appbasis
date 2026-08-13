import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { createPostgresDatabase } from "@appbasis/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createBetterAuthRuntime } from "../src/better-auth";
import { IdentityService } from "../src/service";
import {
  BetterAuthIdentityBackend,
  PostgresIdentityStateStore,
  type BetterAuthIdentityBackendOptions,
} from "../src/server";

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
  let backend!: ProviderCommitBetterAuthBackend;
  let state!: PostgresIdentityStateStore;
  let service!: IdentityService;

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

    const administrativeSessionToken = await createAdministrativeSession();
    backend = new ProviderCommitBetterAuthBackend({
      auth,
      sql: client,
      baseURL,
      administrativeSessionToken,
    });
    state = new PostgresIdentityStateStore(client);
    service = new IdentityService(backend, state);
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

  async function createAdministrativeSession(): Promise<string> {
    await auth.api.createUser({
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
    const response = await auth.handler(
      new Request(`${baseURL}/api/auth/sign-in/username`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: adminUsername, password: adminPassword }),
      }),
    );
    if (!response.ok) throw new Error("Better Auth admin sign-in failed");
    return sessionCookie(response);
  }
});

class ProviderCommitBetterAuthBackend extends BetterAuthIdentityBackend {
  failAfterNextPasswordProviderCommit = false;
  passwordChanges = 0;
  private readonly countedOperations = new Set<string>();

  constructor(options: BetterAuthIdentityBackendOptions) {
    super(options);
  }

  override async changePassword(
    input: Parameters<BetterAuthIdentityBackend["changePassword"]>[0],
  ) {
    const result = await super.changePassword(input);
    if (!this.countedOperations.has(input.operationId)) {
      this.countedOperations.add(input.operationId);
      this.passwordChanges += 1;
    }

    if (this.failAfterNextPasswordProviderCommit) {
      this.failAfterNextPasswordProviderCommit = false;
      throw new Error("ambiguous provider-committed response");
    }

    return result;
  }
}

function sessionCookie(response: Response): string {
  const cookie = response.headers.get("set-cookie");
  if (cookie === null) throw new Error("Better Auth did not return a session cookie");
  return cookie.split(";", 1)[0] ?? cookie;
}
