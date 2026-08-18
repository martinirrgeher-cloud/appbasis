import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterAll, describe, expect, it, vi } from "vitest";

import { createBetterAuthRuntime } from "@appbasis/identity/better-auth";
import { createIdentityRuntime, PostgresIdentityStateStore } from "@appbasis/identity/server";
import { PostgresPermissionStore } from "@appbasis/permissions";
import { createPostgresDatabase } from "../../../packages/database/src/client.ts";

import type { UlcLinzCurrentIdentity } from "../worker/authorization";
import { PostgresUlcLinzExportDatasetReader } from "../worker/data-export-postgres";
import { exportUlcLinzDataWithCanonicalAuthorization } from "../worker/data-export-service";
import { PostgresUlcLinzScopePersistence } from "../worker/scope-persistence";

const databaseUrl = process.env.DATABASE_URL;
const baseURL = "http://localhost:3000";
const organizationId = "ulc-linz";
const generatedAt = new Date("2026-08-18T12:30:00.000Z");
const bootstrapUsername = "m5e.boot";
const bootstrapPassword = "M5E-bootstrap-password-42-secure";

type DatabaseManifest = {
  owners: readonly { id: string; migrations: readonly string[] }[];
};

type AppIdentity = Awaited<
  ReturnType<ReturnType<typeof createIdentityRuntime>["service"]["createInitialUser"]>
>;

if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  describe.skip("ULC Linz M5-E PostgreSQL E2E", () => {
    it("requires DATABASE_URL", () => {});
  });
} else {
  describe("ULC Linz M5-E PostgreSQL E2E", () => {
    const administrativeConnection = createPostgresDatabase(databaseUrl);
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const databaseName = `appbasis_ulc_m5e_${suffix}`;
    const isolatedUrl = databaseUrlForName(databaseUrl, databaseName);
    let databaseCreated = false;

    afterAll(async () => {
      if (databaseCreated) {
        await administrativeConnection.client.unsafe(
          `DROP DATABASE ${databaseName} WITH (FORCE)`,
        );
      }
      await administrativeConnection.client.end();
    });

    it("exports only authorized current member/contact data through real owner contracts", async () => {
      await administrativeConnection.client.unsafe(`CREATE DATABASE ${databaseName}`);
      databaseCreated = true;
      const connection = createPostgresDatabase(isolatedUrl);
      try {
        await applyManifestMigrations(connection.client);
        const runtime = await createBootstrapRuntime(connection);
        const admin = await createAppIdentity(runtime, "m5e.admin", "M5E-admin-password-42-secure", "M5E Admin");
        const parent = await createAppIdentity(runtime, "m5e.parent", "M5E-parent-password-42-secure", "M5E Parent");
        const child = await createAppIdentity(runtime, "m5e.child", "M5E-child-password-42-secure", "M5E Child");
        const athlete = await createAppIdentity(runtime, "m5e.athlete", "M5E-athlete-password-42-secure", "M5E Athlete");

        await seedRoleAndPrincipal(connection.client, admin.identityId, "admin");
        await seedRoleAndPrincipal(connection.client, parent.identityId, "parent");
        await seedRoleAndPrincipal(connection.client, child.identityId, "athlete");
        await seedRoleAndPrincipal(connection.client, athlete.identityId, "athlete");

        await insertMembership(connection.client, admin, "admin");
        await insertMembership(connection.client, parent, "parent");
        await insertMembership(connection.client, child, "athlete");
        await insertMembership(connection.client, athlete, "athlete");
        await connection.client.unsafe(
          `INSERT INTO ulc_linz_subject_scope
             (identity_id, organization_id, subject_id, relation_type)
           VALUES
             ($1, $5, $2, 'self'),
             ($3, $5, $4, 'managed')`,
          [athlete.identityId, requiredPersonId(athlete), parent.identityId, requiredPersonId(child), organizationId],
        );

        const scopes = new PostgresUlcLinzScopePersistence(connection.client, () => generatedAt);
        const permissions = new PostgresPermissionStore(connection.client);
        const identities = new PostgresIdentityStateStore(connection.client);
        const reader = new PostgresUlcLinzExportDatasetReader(connection.client, identities);
        const audit = vi.fn(async () => {});
        const dependencies = {
          permissions,
          memberships: scopes,
          subjectScopes: scopes,
          readDatasets: reader.readDatasets.bind(reader),
          recordExportAudit: audit,
          now: () => generatedAt,
        };

        const selfResult = await exportUlcLinzDataWithCanonicalAuthorization(
          asCurrent(athlete),
          dependencies,
          {
            organizationId,
            scope: "self",
            subjectId: requiredPersonId(athlete),
          },
        );
        expect(selfResult.json.datasets["member-contact"]).toEqual([
          expect.objectContaining({
            username: "m5e.athlete",
            displayName: "M5E Athlete",
            contactEmail: "m5e.athlete@example.invalid",
          }),
        ]);
        expect(JSON.stringify(selfResult)).not.toContain("password");

        const managedResult = await exportUlcLinzDataWithCanonicalAuthorization(
          asCurrent(parent),
          dependencies,
          {
            organizationId,
            scope: "managed",
            subjectId: requiredPersonId(child),
          },
        );
        expect(managedResult.json.datasets["member-contact"]?.[0]).toMatchObject({
          username: "m5e.child",
          displayName: "M5E Child",
        });

        const organizationResult = await exportUlcLinzDataWithCanonicalAuthorization(
          asCurrent(admin),
          dependencies,
          { organizationId, scope: "organization" },
        );
        expect(organizationResult.json.datasets["member-contact"]).toHaveLength(4);
        expect(
          organizationResult.json.datasets["member-contact"]?.map((row) => row.username).sort(),
        ).toEqual(["m5e.admin", "m5e.athlete", "m5e.child", "m5e.parent"]);

        const readDatasets = vi.fn(reader.readDatasets.bind(reader));
        await expect(
          exportUlcLinzDataWithCanonicalAuthorization(
            asCurrent(athlete),
            { ...dependencies, readDatasets },
            {
              organizationId: "other-organization",
              scope: "self",
              subjectId: requiredPersonId(athlete),
            },
          ),
        ).rejects.toMatchObject({ code: "AUTHORIZATION_MISMATCH" });
        expect(readDatasets).not.toHaveBeenCalled();

        await connection.client.unsafe(
          `INSERT INTO ulc_linz_membership
             (identity_id, organization_id, subject_id, source_role, active, ended_at)
           VALUES ('missing-identity', $1, 'missing-subject', 'athlete', true, NULL)`,
          [organizationId],
        );
        const auditBeforePartial = audit.mock.calls.length;
        await expect(
          exportUlcLinzDataWithCanonicalAuthorization(
            asCurrent(admin),
            dependencies,
            { organizationId, scope: "organization" },
          ),
        ).rejects.toMatchObject({ code: "DATASET_INCOMPLETE" });
        expect(audit).toHaveBeenCalledTimes(auditBeforePartial);
      } finally {
        await connection.client.end();
      }
    });
  });
}

function asCurrent(identity: AppIdentity): UlcLinzCurrentIdentity {
  return {
    identity,
    sessionToken: "e2e-session-token-not-exported",
    access: "full",
  };
}

async function createBootstrapRuntime(
  connection: ReturnType<typeof createPostgresDatabase>,
) {
  const auth = createBetterAuthRuntime({
    database: connection.database,
    baseURL,
    secret: "m5-e-postgres-e2e-local-secret-at-least-32-characters",
  });
  await auth.api.createUser({
    body: {
      email: "m5e-bootstrap@identity.invalid",
      password: bootstrapPassword,
      name: "M5E Bootstrap",
      role: "admin",
      data: { username: bootstrapUsername, displayUsername: bootstrapUsername },
    },
  });
  const administrativeSessionToken = await signInCookie(auth, bootstrapUsername, bootstrapPassword);
  return createIdentityRuntime({
    auth,
    sql: connection.client,
    baseURL,
    administrativeSessionToken,
  });
}

async function createAppIdentity(
  runtime: ReturnType<typeof createIdentityRuntime>,
  username: string,
  password: string,
  displayName: string,
): Promise<AppIdentity> {
  return runtime.service.createInitialUser({
    username,
    temporaryPassword: password,
    displayName,
    contactEmail: `${username}@example.invalid`,
  });
}

async function seedRoleAndPrincipal(
  client: ReturnType<typeof createPostgresDatabase>["client"],
  identityId: string,
  sourceRole: "admin" | "parent" | "athlete",
) {
  const role = `ulc-linz:${sourceRole}`;
  await client.unsafe(
    `INSERT INTO appbasis_permission_role (role_id)
     VALUES ($1)
     ON CONFLICT (role_id) DO NOTHING`,
    [role],
  );
  await client.unsafe(
    `INSERT INTO appbasis_permission_principal (principal_id)
     VALUES ($1)`,
    [identityId],
  );
  await client.unsafe(
    `INSERT INTO appbasis_permission_principal_role (principal_id, role_id)
     VALUES ($1, $2)`,
    [identityId, role],
  );
}

async function insertMembership(
  client: ReturnType<typeof createPostgresDatabase>["client"],
  identity: AppIdentity,
  sourceRole: "admin" | "parent" | "athlete",
) {
  await client.unsafe(
    `INSERT INTO ulc_linz_membership
       (identity_id, organization_id, subject_id, source_role, active, ended_at)
     VALUES ($1, $2, $3, $4, true, NULL)`,
    [identity.identityId, organizationId, requiredPersonId(identity), sourceRole],
  );
}

function requiredPersonId(identity: AppIdentity): string {
  if (identity.personId === null) throw new Error("M5-E fixture requires a person id.");
  return identity.personId;
}

async function applyManifestMigrations(
  client: ReturnType<typeof createPostgresDatabase>["client"],
) {
  const manifest = JSON.parse(
    await readFile(new URL("../appbasis.database.json", import.meta.url), "utf8"),
  ) as DatabaseManifest;
  expect(manifest.owners.map((owner) => owner.id)).toEqual([
    "identity",
    "permissions",
    "ulc-linz-lifecycle",
  ]);
  const migrations = manifest.owners.flatMap((owner) => owner.migrations);
  if (migrations.length !== 7 || new Set(migrations).size !== migrations.length) {
    throw new Error("ULC M5-E PostgreSQL E2E requires the exact 7-migration owner set.");
  }
  for (const migration of migrations) {
    const sql = await readFile(new URL(`../../../${migration}`, import.meta.url), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim() !== "") await client.unsafe(statement);
    }
  }
}

async function signInCookie(
  auth: ReturnType<typeof createBetterAuthRuntime>,
  username: string,
  password: string,
) {
  const response = await auth.handler(
    new Request(`${baseURL}/api/auth/sign-in/username`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    }),
  );
  if (!response.ok) throw new Error("Better Auth administrative sign-in failed.");
  const cookie = response.headers.get("set-cookie");
  if (cookie === null) throw new Error("Better Auth returned no administrative session cookie.");
  return cookie.split(";", 1)[0] ?? cookie;
}

function databaseUrlForName(connectionString: string, databaseName: string) {
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}
