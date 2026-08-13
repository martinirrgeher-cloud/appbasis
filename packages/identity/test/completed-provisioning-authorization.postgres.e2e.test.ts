import { readFile } from "node:fs/promises";

import { createPostgresDatabase } from "@appbasis/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createBetterAuthRuntime } from "../src/better-auth";
import { createIdentityRuntime } from "../src/server";

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl === undefined ? describe.skip : describe;
const baseURL = "http://localhost:3000";
const secret = "completed-provisioning-auth-secret-at-least-32-characters";
const adminUsername = "completed.admin";
const adminPassword = "Completed-admin-password-42!";
const memberUsername = "completed.member";
const memberPassword = "Completed-member-password-42!";
const targetUsername = "completed.target";
const originalTemporaryPassword = "Completed-temporary-password-42!";
const replacementTemporaryPassword = "Must-not-replace-password-84!";

describeWithPostgres("Completed provisioning authorization with PostgreSQL", () => {
  const databaseName = "appbasis_identity_completed_provisioning_auth_e2e";
  const adminConnection = createPostgresDatabase(databaseUrl ?? "");
  const isolatedUrl = new URL(databaseUrl ?? "postgres://localhost/unused");
  isolatedUrl.pathname = `/${databaseName}`;
  let connection!: ReturnType<typeof createPostgresDatabase>;
  let auth!: ReturnType<typeof createBetterAuthRuntime>;
  let administrativeSessionToken = "";
  let memberSessionToken = "";

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
      email: "completed-admin@identity.invalid",
      name: "Completed Retry Admin",
      role: "admin",
    });
    memberSessionToken = await createUserSession({
      auth,
      username: memberUsername,
      password: memberPassword,
      email: "completed-member@identity.invalid",
      name: "Completed Retry Member",
      role: "user",
    });
  });

  afterAll(async () => {
    if (connection !== undefined) await connection.client.end();
    await adminConnection.client.unsafe(
      `DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`,
    );
    await adminConnection.client.end();
  });

  it("re-authorizes completed retries before returning existing identity metadata", async () => {
    const input = {
      username: targetUsername,
      temporaryPassword: originalTemporaryPassword,
      displayName: "Completed Retry Target",
    };
    const authorizedRuntime = createIdentityRuntime({
      auth,
      sql: connection.client,
      baseURL,
      administrativeSessionToken,
    });
    const first = await authorizedRuntime.service.createInitialUser(input);
    expect(first).toMatchObject({
      username: targetUsername,
      accountStatus: "active",
      mustChangePassword: true,
    });

    const operationRows = await connection.client<
      { identity_id: string | null; completed_at: Date | string | null }[]
    >`
      SELECT identity_id, completed_at
      FROM appbasis_identity_operation
      WHERE operation_key = ${`provision:${targetUsername}`}
    `;
    expect(operationRows[0]).toMatchObject({ identity_id: first.identityId });
    expect(operationRows[0]?.completed_at).not.toBeNull();

    for (const administrativeToken of [
      "better-auth.session_token=forged-session",
      memberSessionToken,
    ]) {
      const unauthorizedRuntime = createIdentityRuntime({
        auth,
        sql: connection.client,
        baseURL,
        administrativeSessionToken: administrativeToken,
      });
      await expect(
        unauthorizedRuntime.service.createInitialUser({
          ...input,
          temporaryPassword: replacementTemporaryPassword,
        }),
      ).rejects.toThrow("valid administrative Better Auth session");
    }

    await expect(
      authorizedRuntime.service.createInitialUser({
        ...input,
        temporaryPassword: replacementTemporaryPassword,
      }),
    ).resolves.toMatchObject({
      identityId: first.identityId,
      username: targetUsername,
    });

    const signedIn = await authorizedRuntime.service.signInWithUsername({
      username: targetUsername,
      password: originalTemporaryPassword,
    });
    expect(signedIn.identity.identityId).toBe(first.identityId);
    expect(signedIn.access).toBe("password-change-required");
    await expect(
      authorizedRuntime.service.signInWithUsername({
        username: targetUsername,
        password: replacementTemporaryPassword,
      }),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });

    const identityRows = await connection.client<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM appbasis_identity_security_state state
      JOIN "user" auth_user ON auth_user.id = state.identity_id
      WHERE auth_user.username = ${targetUsername}
    `;
    expect(identityRows[0]?.count).toBe(1);
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
