import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  identityOperation,
  identitySecurityState,
  person,
  schema,
  user,
} from "../src/schema/index";

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

describe("versioned PostgreSQL migrations", () => {
  const client = new PGlite();
  const database = drizzle(client, { schema });

  beforeAll(async () => {
    await migrate(database, { migrationsFolder });
  });

  afterAll(async () => {
    await client.close();
  });

  it("migrates an empty PostgreSQL-compatible database to the current schema", async () => {
    const result = await client.query<{ table_name: string }>(
      `select table_name
       from information_schema.tables
       where table_schema = 'public'
       order by table_name`,
    );

    expect(result.rows.map(({ table_name }) => table_name)).toEqual([
      "account",
      "appbasis_identity_operation",
      "appbasis_identity_security_state",
      "appbasis_person",
      "session",
      "user",
      "verification",
    ]);
  });

  it("can apply the migration runner repeatedly without schema drift", async () => {
    await migrate(database, { migrationsFolder });

    const result = await client.query<{ migration_count: number }>(
      `select count(*)::integer as migration_count
       from drizzle.__drizzle_migrations`,
    );

    expect(result.rows).toEqual([{ migration_count: 2 }]);
  });

  it("keeps a person independent from an authentication identity", async () => {
    await database.insert(person).values({
      id: "person-without-login",
      displayName: "Person ohne Login",
      contactEmail: null,
    });

    const people = await database.select().from(person);
    const identityStates = await database.select().from(identitySecurityState);

    expect(people).toHaveLength(1);
    expect(identityStates).toHaveLength(0);
  });

  it("stores security state separately and requires no real contact email", async () => {
    await database.insert(user).values({
      id: "auth-user",
      name: "Technischer Benutzer",
      email: "hash@identity.invalid",
      username: "technical.user",
      displayUsername: "technical.user",
    });
    await database.insert(identitySecurityState).values({
      identityId: "auth-user",
      personId: null,
      mustChangePassword: true,
    });

    const states = await database.select().from(identitySecurityState);
    expect(states).toMatchObject([
      {
        identityId: "auth-user",
        personId: null,
        mustChangePassword: true,
      },
    ]);
  });

  it("records a disablement without duplicating provider status or deleting auth data", async () => {
    await database.insert(user).values({
      id: "identity-to-disable",
      name: "Identity To Disable",
      email: "disable-hash@identity.invalid",
      username: "identity.to.disable",
      displayUsername: "identity.to.disable",
    });
    await database.insert(identitySecurityState).values({
      identityId: "identity-to-disable",
    });

    await database
      .update(identitySecurityState)
      .set({ disabledAt: fixedDatabaseTime })
      .where(eq(identitySecurityState.identityId, "identity-to-disable"));

    const authUsers = await database
      .select()
      .from(user)
      .where(eq(user.id, "identity-to-disable"));
    const states = await database
      .select()
      .from(identitySecurityState)
      .where(eq(identitySecurityState.identityId, "identity-to-disable"));

    expect(authUsers).toHaveLength(1);
    expect(states).toMatchObject([{ disabledAt: fixedDatabaseTime }]);

    const columns = await client.query<{ column_name: string }>(
      `select column_name
       from information_schema.columns
       where table_name = 'appbasis_identity_security_state'
       order by column_name`,
    );
    expect(columns.rows.map(({ column_name }) => column_name)).not.toContain(
      "account_status",
    );
  });

  it("keeps password storage out of every AppBasis-owned table", async () => {
    const result = await client.query<{
      table_name: string;
      column_name: string;
    }>(
      `select table_name, column_name
       from information_schema.columns
       where table_schema = 'public'
         and column_name ilike '%password%'
       order by table_name, column_name`,
    );

    expect(result.rows).toEqual([
      { table_name: "account", column_name: "password" },
      {
        table_name: "appbasis_identity_security_state",
        column_name: "must_change_password",
      },
      {
        table_name: "appbasis_identity_security_state",
        column_name: "password_changed_at",
      },
    ]);
  });

  it("stores only provider-neutral reconciliation metadata for identity operations", async () => {
    await database.insert(identityOperation).values({
      operationId: "operation-1",
      operationKey: "provision:technical.user",
      kind: "provision",
      identityId: null,
    });

    const operations = await database.select().from(identityOperation);
    expect(operations).toMatchObject([
      {
        operationId: "operation-1",
        operationKey: "provision:technical.user",
        kind: "provision",
        identityId: null,
        completedAt: null,
      },
    ]);

    const columns = await client.query<{ column_name: string }>(
      `select column_name
       from information_schema.columns
       where table_name = 'appbasis_identity_operation'
       order by column_name`,
    );
    expect(columns.rows.map(({ column_name }) => column_name)).toEqual([
      "completed_at",
      "created_at",
      "identity_id",
      "kind",
      "operation_id",
      "operation_key",
    ]);
  });
});

const fixedDatabaseTime = new Date("2026-08-11T12:00:00.000Z");
