import { readFile } from "node:fs/promises";

import { createPostgresDatabase } from "@appbasis/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createBetterAuthRuntime } from "../src/better-auth";

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl === undefined ? describe.skip : describe;
const baseURL = "http://localhost:3000";
const adminUsername = "delete.boundary.admin";
const adminPassword = "Delete-boundary-admin-password-42";

describeWithPostgres("Identity hard-delete ownership boundary", () => {
  const connection = createPostgresDatabase(databaseUrl ?? "");
  const { client, database } = connection;
  const auth = createBetterAuthRuntime({
    database,
    baseURL,
    secret: "delete-boundary-local-test-secret-at-least-32-characters",
  });
  let administrativeSessionToken = "";

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

    administrativeSessionToken = await createAdministrativeSession();
  });

  afterAll(async () => {
    await client.end();
  });

  it("proves the configured Better Auth admin owner can hard-delete an unbound user", async () => {
    const user = await createUser("delete.boundary.free", "delete-boundary-free@identity.invalid");

    const response = await removeUser(user.id);

    expect(response.ok).toBe(true);
    const rows = await client<{ count: number }[]>`
      SELECT count(*)::int AS count FROM "user" WHERE id = ${user.id}
    `;
    expect(rows[0]?.count).toBe(0);
  });

  it("fails closed while AppBasis identity security state still owns the user", async () => {
    const user = await createUser("delete.boundary.owned", "delete-boundary-owned@identity.invalid");
    await client`
      INSERT INTO appbasis_identity_security_state (identity_id)
      VALUES (${user.id})
    `;

    const response = await removeUser(user.id);

    expect(response.ok).toBe(false);
    const rows = await client<{ user_count: number; state_count: number }[]>`
      SELECT
        (SELECT count(*)::int FROM "user" WHERE id = ${user.id}) AS user_count,
        (SELECT count(*)::int FROM appbasis_identity_security_state WHERE identity_id = ${user.id}) AS state_count
    `;
    expect(rows[0]).toEqual({ user_count: 1, state_count: 1 });
  });

  async function createUser(username: string, email: string): Promise<{ id: string }> {
    const created = await auth.api.createUser({
      body: {
        email,
        password: "Delete-boundary-user-password-42",
        name: username,
        role: "user",
        data: { username, displayUsername: username },
      },
    });
    return { id: created.user.id };
  }

  async function removeUser(userId: string): Promise<Response> {
    return auth.handler(
      new Request(`${baseURL}/api/auth/admin/remove-user`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: administrativeSessionToken,
          origin: new URL(baseURL).origin,
        },
        body: JSON.stringify({ userId }),
      }),
    );
  }

  async function createAdministrativeSession(): Promise<string> {
    await auth.api.createUser({
      body: {
        email: "delete-boundary-admin@identity.invalid",
        password: adminPassword,
        name: "Delete Boundary Admin",
        role: "admin",
        data: { username: adminUsername, displayUsername: adminUsername },
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
    const cookie = response.headers.get("set-cookie");
    if (cookie === null) throw new Error("Better Auth did not return a session cookie");
    return cookie.split(";", 1)[0] ?? cookie;
  }
});
