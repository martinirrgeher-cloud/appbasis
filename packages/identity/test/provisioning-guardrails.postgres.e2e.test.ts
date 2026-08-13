import { readFile } from "node:fs/promises";

import { createPostgresDatabase } from "@appbasis/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createBetterAuthRuntime } from "../src/better-auth";
import {
  createIdentityRuntime,
  PostgresIdentityStateStore,
} from "../src/server";

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl === undefined ? describe.skip : describe;
const baseURL = "http://localhost:3000";
const secret = "identity-provisioning-guardrails-secret-at-least-32-characters";
const adminUsername = "guardrails.admin";
const adminPassword = "Guardrails-admin-password-42!";
const temporaryPassword = "Guardrails-temporary-password-42!";

describeWithPostgres("Identity provisioning guardrails with PostgreSQL", () => {
  const databaseName = "appbasis_identity_provisioning_guardrails_e2e";
  const adminConnection = createPostgresDatabase(databaseUrl ?? "");
  const isolatedUrl = new URL(databaseUrl ?? "postgres://localhost/unused");
  isolatedUrl.pathname = `/${databaseName}`;
  let connection!: ReturnType<typeof createPostgresDatabase>;
  let auth!: ReturnType<typeof createBetterAuthRuntime>;
  let administrativeSessionToken = "";

  beforeAll(async () => {
    await adminConnection.client.unsafe(
      `DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`,
    );
    await adminConnection.client.unsafe(`CREATE DATABASE ${databaseName}`);
    connection = createPostgresDatabase(isolatedUrl.toString());

    for (const migration of ["0000", "0001"]) {
      const sql = await readFile(
        new URL(`../drizzle/${migration}_appbasis_identity_foundation.sql`, import.meta.url),
        "utf8",
      );
      for (const statement of sql.split("--> statement-breakpoint")) {
        if (statement.trim() !== "") await connection.client.unsafe(statement);
      }
    }

    auth = createBetterAuthRuntime({
      database: connection.database,
      baseURL,
      secret,
    });
    administrativeSessionToken = await createUserSession({
      auth,
      username: adminUsername,
      password: adminPassword,
      email: "guardrails-admin@identity.invalid",
      name: "Guardrails Technical Admin",
      role: "admin",
    });
  });

  afterAll(async () => {
    if (connection !== undefined) await connection.client.end();
    await adminConnection.client.unsafe(
      `DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`,
    );
    await adminConnection.client.end();
  });

  it("requires an authenticated active technical admin before existing-user reconciliation", async () => {
    const forgedUsername = "guardrails.forged";
    const memberUsername = "guardrails.member";
    await createUserSession({
      auth,
      username: forgedUsername,
      password: temporaryPassword,
      email: "guardrails-forged@identity.invalid",
      name: "Forged Target",
      role: "user",
    });
    const memberSession = await createUserSession({
      auth,
      username: memberUsername,
      password: temporaryPassword,
      email: "guardrails-member@identity.invalid",
      name: "Member Target",
      role: "user",
    });

    for (const [username, administrativeToken] of [
      [forgedUsername, "better-auth.session_token=forged-session"],
      [memberUsername, memberSession],
    ] as const) {
      const runtime = createIdentityRuntime({
        auth,
        sql: connection.client,
        baseURL,
        administrativeSessionToken: administrativeToken,
      });
      await expect(
        runtime.service.createInitialUser({
          username,
          temporaryPassword,
          displayName: "Existing Better Auth User",
        }),
      ).rejects.toThrow("valid administrative Better Auth session");
    }

    const rows = await connection.client<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM appbasis_identity_security_state state
      JOIN "user" auth_user ON auth_user.id = state.identity_id
      WHERE auth_user.username IN (${forgedUsername}, ${memberUsername})
    `;
    expect(rows[0]?.count).toBe(0);
  });

  it("rejects technical admin targets at the PostgreSQL persistence boundary", async () => {
    const targetAdminUsername = "guardrails.otheradmin";
    await createUserSession({
      auth,
      username: targetAdminUsername,
      password: temporaryPassword,
      email: "guardrails-other-admin@identity.invalid",
      name: "Other Technical Admin",
      role: "admin",
    });

    const runtime = createIdentityRuntime({
      auth,
      sql: connection.client,
      baseURL,
      administrativeSessionToken,
    });
    await expect(
      runtime.service.createInitialUser({
        username: targetAdminUsername,
        temporaryPassword,
        displayName: "Other Technical Admin",
      }),
    ).rejects.toThrow("Technical Better Auth administrators cannot be AppBasis identities");

    const rows = await connection.client<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM appbasis_identity_security_state state
      JOIN "user" auth_user ON auth_user.id = state.identity_id
      WHERE auth_user.username = ${targetAdminUsername}
    `;
    expect(rows[0]?.count).toBe(0);
  });

  it("observes a concurrently committed admin promotion before persisting AppBasis state", async () => {
    const username = "guardrails.race";
    await createUserSession({
      auth,
      username,
      password: temporaryPassword,
      email: "guardrails-race@identity.invalid",
      name: "Race Target",
      role: "user",
    });
    const targetRows = await connection.client<{ id: string }[]>`
      SELECT id FROM "user" WHERE username = ${username}
    `;
    const targetId = targetRows[0]?.id;
    if (targetId === undefined) throw new Error("Expected race target user");

    const store = new PostgresIdentityStateStore(connection.client);
    const operation = await store.prepareOperation({
      operationKey: `provision:${username}`,
      kind: "provision",
      identityId: null,
    });
    const promoter = createPostgresDatabase(isolatedUrl.toString());
    let releasePromotion!: () => void;
    let markPromotionReady!: () => void;
    const promotionReady = new Promise<void>((resolve) => {
      markPromotionReady = resolve;
    });
    const promotionRelease = new Promise<void>((resolve) => {
      releasePromotion = resolve;
    });

    try {
      const promotion = promoter.client.begin(async (transaction) => {
        await transaction`
          UPDATE "user" SET role = 'admin' WHERE id = ${targetId}
        `;
        markPromotionReady();
        await promotionRelease;
      });
      await promotionReady;

      const provisioningOutcome = store
        .completeProvisioning({
          operationId: operation.operationId,
          identityId: targetId,
          username,
          displayName: "Race Target",
          contactEmail: null,
          completedAt: new Date(),
        })
        .then(
          () => ({ ok: true as const, error: null }),
          (error: unknown) => ({ ok: false as const, error }),
        );

      await new Promise((resolve) => setTimeout(resolve, 25));
      releasePromotion();
      await promotion;
      const outcome = await provisioningOutcome;
      expect(outcome.ok).toBe(false);
      expect(String(outcome.error)).toContain(
        "Technical Better Auth administrators cannot be AppBasis identities",
      );

      const stateRows = await connection.client<{ count: number }[]>`
        SELECT count(*)::int AS count
        FROM appbasis_identity_security_state
        WHERE identity_id = ${targetId}
      `;
      expect(stateRows[0]?.count).toBe(0);
    } finally {
      releasePromotion?.();
      await promoter.client.end();
    }
  });

  it("returns disabled for a banned existing user and for a completed retry after a later ban", async () => {
    const bannedExistingUsername = "guardrails.bannedexisting";
    await createUserSession({
      auth,
      username: bannedExistingUsername,
      password: temporaryPassword,
      email: "guardrails-banned-existing@identity.invalid",
      name: "Banned Existing",
      role: "user",
    });
    await connection.client`
      UPDATE "user" SET banned = true WHERE username = ${bannedExistingUsername}
    `;

    const runtime = createIdentityRuntime({
      auth,
      sql: connection.client,
      baseURL,
      administrativeSessionToken,
    });
    await expect(
      runtime.service.createInitialUser({
        username: bannedExistingUsername,
        temporaryPassword,
        displayName: "Banned Existing",
      }),
    ).resolves.toMatchObject({ accountStatus: "disabled" });

    const retryUsername = "guardrails.retry";
    const input = {
      username: retryUsername,
      temporaryPassword,
      displayName: "Retry Status",
    };
    const first = await runtime.service.createInitialUser(input);
    expect(first.accountStatus).toBe("active");
    await connection.client`
      UPDATE "user" SET banned = true WHERE id = ${first.identityId}
    `;
    await expect(runtime.service.createInitialUser(input)).resolves.toMatchObject({
      identityId: first.identityId,
      accountStatus: "disabled",
    });
  });
});

async function createUserSession(input: {
  auth: ReturnType<typeof createBetterAuthRuntime>;
  username: string;
  password: string;
  email: string;
  name: string;
  role: "admin" | "user";
}): Promise<string> {
  await input.auth.api.createUser({
    body: {
      email: input.email,
      password: input.password,
      name: input.name,
      role: input.role,
      data: {
        username: input.username,
        displayUsername: input.username,
      },
    },
  });
  const response = await input.auth.handler(
    new Request(`${baseURL}/api/auth/sign-in/username`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: input.username, password: input.password }),
    }),
  );
  if (!response.ok) throw new Error("Better Auth test sign-in failed");
  const cookie = response.headers.get("set-cookie");
  if (cookie === null) throw new Error("Better Auth did not return a session cookie");
  return cookie.split(";", 1)[0] ?? cookie;
}
