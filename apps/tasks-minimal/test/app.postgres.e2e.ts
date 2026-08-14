import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createPostgresDatabase } from "@appbasis/database/postgres-runtime";
import { createPostgresDatabase as createPostgresProvisioningDatabase } from "@appbasis/database/postgres-provisioning";
import type { IdentityHttpService } from "@appbasis/identity/http";
import { capabilityId, principalId, roleId } from "@appbasis/permissions";
import {
  provisionPostgresPermissions,
  type PermissionProvisioningPostgresClient,
} from "@appbasis/permissions/provisioning";
import { TASK_CAPABILITIES } from "@appbasis/tasks";

import { createGeneratedApp } from "../worker/app";
import {
  createGeneratedPostgresApplicationRuntime,
  createGeneratedPostgresRuntime,
} from "../worker/postgres";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error("DATABASE_URL is required for generated PostgreSQL E2E tests.");
}

const administrativeConnection = createPostgresDatabase(databaseUrl);
const isolatedDatabaseName =
  "appbasis_generated_" + randomUUID().replaceAll("-", "").slice(0, 24);
const isolatedDatabaseUrl = databaseUrlForName(databaseUrl, isolatedDatabaseName);
let isolatedConnection: ReturnType<typeof createPostgresDatabase> | null = null;
let isolatedDatabaseCreated = false;
const identityFoundationMigrationUrl = new URL(
  "../../../packages/identity/drizzle/0000_appbasis_identity_foundation.sql",
  import.meta.url,
);
const identityOperationMigrationUrl = new URL(
  "../../../packages/identity/drizzle/0001_appbasis_identity_foundation.sql",
  import.meta.url,
);
const permissionMigrationUrl = new URL(
  "../../../packages/permissions/migrations/0000_appbasis_permissions_foundation.sql",
  import.meta.url,
);
const taskMigrationUrl = new URL(
  "../../../modules/tasks/migrations/0000_appbasis_tasks_foundation.sql",
  import.meta.url,
);

const currentIdentity = {
  identity: {
    identityId: "identity-postgres-1",
    username: "postgres.user",
    displayName: "PostgreSQL User",
    contactEmail: null,
    personId: null,
    mustChangePassword: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    passwordChangedAt: new Date("2026-01-01T00:00:00.000Z"),
    disabledAt: null,
    accountStatus: "active" as const,
  },
  sessionToken: "appbasis.session=postgres-test-token",
  access: "full" as const,
};

const deniedIdentity = {
  identity: {
    ...currentIdentity.identity,
    identityId: "identity-postgres-denied",
    username: "postgres.denied",
    displayName: "PostgreSQL Denied User",
  },
  sessionToken: "appbasis.session=postgres-denied-token",
  access: "full" as const,
};

const identity: IdentityHttpService = {
  async signInWithUsername() {
    return currentIdentity;
  },
  async getCurrentIdentity(sessionToken) {
    if (sessionToken === currentIdentity.sessionToken) return currentIdentity;
    if (sessionToken === deniedIdentity.sessionToken) return deniedIdentity;
    return null;
  },
  async changeRequiredPassword() {
    return currentIdentity;
  },
};

beforeAll(async () => {
  await administrativeConnection.client.unsafe(
    "CREATE DATABASE " + isolatedDatabaseName,
  );
  isolatedDatabaseCreated = true;
  isolatedConnection = createPostgresDatabase(isolatedDatabaseUrl);
  await applyMigration(identityFoundationMigrationUrl);
  await applyMigration(identityOperationMigrationUrl);
  await applyMigration(permissionMigrationUrl);
  await applyMigration(taskMigrationUrl);
  await provisionGeneratedPermissions();
});

beforeEach(async () => {
  await requiredIsolatedConnection().client.unsafe(
    "TRUNCATE TABLE appbasis_task",
  );
});

afterAll(async () => {
  if (isolatedConnection !== null) {
    await isolatedConnection.client.end();
    isolatedConnection = null;
  }
  if (isolatedDatabaseCreated) {
    await administrativeConnection.client.unsafe(
      "DROP DATABASE " + isolatedDatabaseName + " WITH (FORCE)",
    );
  }
  await administrativeConnection.client.end();
});

describe("generated PostgreSQL tasks runtime", () => {
  it("composes the real identity runtime with persistent permissions and tasks", async () => {
    const runtime = await createGeneratedPostgresApplicationRuntime({
      connectionString: isolatedDatabaseUrl,
      baseURL: "https://generated.example.test",
      secret: "generated-runtime-test-secret-000000000000",
    });
    try {
      await expect(
        runtime.identity.getCurrentIdentity("appbasis.session=missing-session"),
      ).resolves.toBeNull();

      const app = createGeneratedApp({
        identity: runtime.identity,
        permissions: runtime.permissions,
        tasks: runtime.tasks,
        secureCookies: true,
      });
      const health = await app.request("/api/health");
      expect(health.status).toBe(200);

      const unauthenticated = await app.request("/api/tasks", {
        headers: { cookie: "appbasis.session=missing-session" },
      });
      expect(unauthenticated.status).toBe(401);
      await expect(unauthenticated.json()).resolves.toMatchObject({
        error: { code: "SESSION_INVALID" },
      });
    } finally {
      await runtime.close();
    }
  });

  it("persists authorized HTTP task mutations and permission decisions across runtime instances", async () => {
    let taskId: string;
    const firstRuntime = createGeneratedPostgresRuntime(isolatedDatabaseUrl);
    try {
      const firstApp = createGeneratedApp({
        identity,
        permissions: firstRuntime.permissions,
        tasks: firstRuntime.tasks,
        secureCookies: false,
      });
      const created = await firstApp.request("/api/tasks", {
        method: "POST",
        headers: {
          cookie: currentIdentity.sessionToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({ title: "Persistent generated task" }),
      });
      expect(created.status).toBe(201);
      const body = (await created.json()) as {
        task: { id: string; status: string };
      };
      taskId = body.task.id;
      expect(body.task.status).toBe("open");
    } finally {
      await firstRuntime.close();
    }

    const secondRuntime = createGeneratedPostgresRuntime(isolatedDatabaseUrl);
    try {
      const secondApp = createGeneratedApp({
        identity,
        permissions: secondRuntime.permissions,
        tasks: secondRuntime.tasks,
        secureCookies: false,
      });
      const listed = await secondApp.request("/api/tasks", {
        headers: { cookie: currentIdentity.sessionToken },
      });
      expect(listed.status).toBe(200);
      await expect(listed.json()).resolves.toMatchObject({
        tasks: [
          {
            id: taskId,
            title: "Persistent generated task",
            status: "open",
          },
        ],
      });

      const toggled = await secondApp.request(
        "/api/tasks/" + taskId + "/toggle",
        {
          method: "POST",
          headers: { cookie: currentIdentity.sessionToken },
        },
      );
      expect(toggled.status).toBe(200);
      await expect(toggled.json()).resolves.toMatchObject({
        task: { id: taskId, status: "completed" },
      });
    } finally {
      await secondRuntime.close();
    }

    const thirdRuntime = createGeneratedPostgresRuntime(isolatedDatabaseUrl);
    try {
      const thirdApp = createGeneratedApp({
        identity,
        permissions: thirdRuntime.permissions,
        tasks: thirdRuntime.tasks,
        secureCookies: false,
      });
      const listed = await thirdApp.request("/api/tasks", {
        headers: { cookie: currentIdentity.sessionToken },
      });
      expect(listed.status).toBe(200);
      await expect(listed.json()).resolves.toMatchObject({
        tasks: [{ id: taskId, status: "completed" }],
      });
    } finally {
      await thirdRuntime.close();
    }
  });

  it("denies an authenticated principal that was not provisioned", async () => {
    const runtime = createGeneratedPostgresRuntime(isolatedDatabaseUrl);
    try {
      const app = createGeneratedApp({
        identity,
        permissions: runtime.permissions,
        tasks: runtime.tasks,
        secureCookies: false,
      });
      const denied = await app.request("/api/tasks", {
        headers: { cookie: deniedIdentity.sessionToken },
      });
      expect(denied.status).toBe(403);
      await expect(denied.json()).resolves.toMatchObject({
        error: { code: "PERMISSION_DENIED" },
      });
    } finally {
      await runtime.close();
    }
  });
});

async function applyMigration(url: URL) {
  const migration = await readFile(url, "utf8");
  for (const statement of migration
    .split("--> statement-breakpoint")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)) {
    await requiredIsolatedConnection().client.unsafe(statement);
  }
}

async function provisionGeneratedPermissions() {
  const connection = createPostgresProvisioningDatabase(isolatedDatabaseUrl);
  const capability = capabilityId(TASK_CAPABILITIES.manage);
  const managerRole = roleId("tasks:manager");
  const bundle = {
    knownCapabilities: [capability],
    roles: [
      {
        roleId: managerRole,
        capabilities: [capability],
      },
    ],
    principalRoleAssignments: [
      {
        principalId: principalId(currentIdentity.identity.identityId),
        roleIds: [managerRole],
      },
    ],
  };

  try {
    await expect(
      provisionPostgresPermissions(provisioningClient(connection.client), bundle),
    ).resolves.toEqual({
      capabilitiesCreated: 1,
      rolesCreated: 1,
      roleCapabilitiesCreated: 1,
      principalsCreated: 1,
      principalRolesCreated: 1,
    });
    await expect(
      provisionPostgresPermissions(provisioningClient(connection.client), bundle),
    ).resolves.toEqual({
      capabilitiesCreated: 0,
      rolesCreated: 0,
      roleCapabilitiesCreated: 0,
      principalsCreated: 0,
      principalRolesCreated: 0,
    });
  } finally {
    await connection.client.end();
  }
}

function provisioningClient(
  client: ReturnType<typeof createPostgresProvisioningDatabase>["client"],
): PermissionProvisioningPostgresClient {
  return {
    async begin(callback) {
      return client.begin(async (transaction) =>
        callback({
          unsafe(query, parameters) {
            return transaction.unsafe(query, parameters);
          },
        }),
      );
    },
  };
}

function databaseUrlForName(connectionString: string, databaseName: string) {
  const url = new URL(connectionString);
  url.pathname = "/" + databaseName;
  return url.toString();
}

function requiredIsolatedConnection() {
  if (isolatedConnection === null) {
    throw new Error("The isolated PostgreSQL test database is not ready.");
  }
  return isolatedConnection;
}
