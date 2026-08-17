import { readFile } from "node:fs/promises";

import { createPostgresDatabase } from "@appbasis/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createBetterAuthRuntime } from "../src/better-auth";
import {
  IdentityDeletionBlockedError,
  PostgresIdentityDeletion,
} from "../src/postgres-deletion";
import { createIdentityRuntime } from "../src/server";

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

  it("deletes all currently owned identity rows atomically after disable and keeps only an idempotency tombstone", async () => {
    const runtime = createIdentityRuntime({
      auth,
      sql: client,
      baseURL,
      administrativeSessionToken,
    });
    const created = await runtime.service.createInitialUser({
      username: "delete.boundary.current",
      temporaryPassword: "Delete-boundary-current-password-42",
      displayName: "Delete Boundary Current",
      contactEmail: "delete.boundary.current@example.invalid",
    });
    expect(created.personId).not.toBeNull();
    const personId = created.personId;
    if (personId === null) throw new Error("Expected a linked AppBasis person.");

    const signedIn = await runtime.service.signInWithUsername({
      username: "delete.boundary.current",
      password: "Delete-boundary-current-password-42",
    });
    await expect(
      runtime.service.getCurrentIdentity(signedIn.sessionToken),
    ).resolves.not.toBeNull();
    await runtime.service.disableIdentity(created.identityId);

    const deletion = new PostgresIdentityDeletion(client, () =>
      new Date("2026-08-17T21:30:00.000Z"),
    );
    await expect(deletion.isDeletionCompleted(created.identityId)).resolves.toBe(false);
    await expect(deletion.deleteDisabledIdentity(created.identityId)).resolves.toEqual({
      identityId: created.identityId,
      alreadyDeleted: false,
    });
    await expect(deletion.isDeletionCompleted(created.identityId)).resolves.toBe(true);

    const remaining = await client<{
      user_count: number;
      state_count: number;
      person_count: number;
      account_count: number;
      session_count: number;
    }[]>`
      SELECT
        (SELECT count(*)::int FROM "user" WHERE id = ${created.identityId}) AS user_count,
        (SELECT count(*)::int FROM appbasis_identity_security_state WHERE identity_id = ${created.identityId}) AS state_count,
        (SELECT count(*)::int FROM appbasis_person WHERE id = ${personId}) AS person_count,
        (SELECT count(*)::int FROM account WHERE user_id = ${created.identityId}) AS account_count,
        (SELECT count(*)::int FROM session WHERE user_id = ${created.identityId}) AS session_count
    `;
    expect(remaining[0]).toEqual({
      user_count: 0,
      state_count: 0,
      person_count: 0,
      account_count: 0,
      session_count: 0,
    });

    const operations = await client<{
      operation_key: string;
      kind: string;
      identity_id: string | null;
      completed_at: Date | null;
    }[]>`
      SELECT operation_key, kind, identity_id, completed_at
      FROM appbasis_identity_operation
      WHERE identity_id = ${created.identityId}
      ORDER BY operation_key
    `;
    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({
      operation_key: `delete:${created.identityId}`,
      kind: "delete",
      identity_id: created.identityId,
    });
    expect(operations[0]?.completed_at).not.toBeNull();

    await expect(deletion.deleteDisabledIdentity(created.identityId)).resolves.toEqual({
      identityId: created.identityId,
      alreadyDeleted: true,
    });
  });

  it("blocks physical deletion until both Better Auth and AppBasis state are disabled", async () => {
    const runtime = createIdentityRuntime({
      auth,
      sql: client,
      baseURL,
      administrativeSessionToken,
    });
    const created = await runtime.service.createInitialUser({
      username: "delete.boundary.active",
      temporaryPassword: "Delete-boundary-active-password-42",
      displayName: "Delete Boundary Active",
    });
    const deletion = new PostgresIdentityDeletion(client);

    await expect(deletion.deleteDisabledIdentity(created.identityId)).rejects.toMatchObject({
      code: "IDENTITY_NOT_DISABLED",
    } satisfies Partial<IdentityDeletionBlockedError>);

    const remaining = await client<{ user_count: number; state_count: number }[]>`
      SELECT
        (SELECT count(*)::int FROM "user" WHERE id = ${created.identityId}) AS user_count,
        (SELECT count(*)::int FROM appbasis_identity_security_state WHERE identity_id = ${created.identityId}) AS state_count
    `;
    expect(remaining[0]).toEqual({ user_count: 1, state_count: 1 });
  });

  it("fails closed instead of guessing ownership when unexpected verification persistence exists", async () => {
    const runtime = createIdentityRuntime({
      auth,
      sql: client,
      baseURL,
      administrativeSessionToken,
    });
    const created = await runtime.service.createInitialUser({
      username: "delete.boundary.verify",
      temporaryPassword: "Delete-boundary-verify-password-42",
      displayName: "Delete Boundary Verification",
    });
    await runtime.service.disableIdentity(created.identityId);
    await client`
      INSERT INTO verification (id, identifier, value, expires_at, updated_at)
      VALUES (
        'delete-boundary-verification',
        'unexpected-verification-owner',
        'opaque-test-value',
        now() + interval '1 hour',
        now()
      )
    `;

    try {
      const deletion = new PostgresIdentityDeletion(client);
      await expect(deletion.deleteDisabledIdentity(created.identityId)).rejects.toMatchObject({
        code: "UNSUPPORTED_VERIFICATION_STATE",
      } satisfies Partial<IdentityDeletionBlockedError>);

      const remaining = await client<{ user_count: number; state_count: number }[]>`
        SELECT
          (SELECT count(*)::int FROM "user" WHERE id = ${created.identityId}) AS user_count,
          (SELECT count(*)::int FROM appbasis_identity_security_state WHERE identity_id = ${created.identityId}) AS state_count
      `;
      expect(remaining[0]).toEqual({ user_count: 1, state_count: 1 });
    } finally {
      await client`
        DELETE FROM verification WHERE id = 'delete-boundary-verification'
      `;
    }
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
