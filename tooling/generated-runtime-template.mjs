const IDENTIFIER_PATTERN = /^[a-z][a-z0-9-]*$/;
const SUPPORTED_GENERATED_MODULES = new Set(["tasks"]);
const SUPPORTED_GENERATED_PLATFORM_SERVICES = new Set([
  "identity",
  "permissions",
]);

export function createIdentityRuntimeTemplate(input) {
  const appId = requiredIdentifier(input?.appId, "appId");
  const displayName = requiredDisplayName(input?.displayName);
  const modules = requiredGeneratedModules(input?.modules ?? []);
  const platformServices = requiredGeneratedPlatformServices(
    input?.platformServices ?? ["identity"],
  );
  if (!platformServices.includes("identity")) {
    throw new Error("Generated identity runtime requires the identity platform service.");
  }

  const packageName = `@appbasis/app-${appId}`;
  const guardedTasks =
    modules.includes("tasks") && platformServices.includes("permissions");
  const files = [
    file(
      "package.json",
      generatedPackageJson(packageName, displayName, modules, platformServices),
    ),
    file("test/app.test.ts", generatedAppTest(modules, platformServices)),
    ...(guardedTasks
      ? [file("test/app.postgres.e2e.ts", generatedPostgresE2ETest())]
      : []),
    file("tsconfig.json", generatedTsconfig()),
    file("vitest.config.ts", generatedVitestConfig()),
    ...(guardedTasks
      ? [file("vitest.postgres.config.ts", generatedPostgresVitestConfig())]
      : []),
    file("worker/app.ts", generatedWorkerApp(appId, modules, platformServices)),
    ...(guardedTasks
      ? [file("worker/postgres.ts", generatedPostgresRuntime())]
      : []),
  ];

  return Object.freeze({
    appId,
    files: Object.freeze(files),
  });
}

function generatedPackageJson(packageName, displayName, modules, platformServices) {
  const guardedTasks =
    modules.includes("tasks") && platformServices.includes("permissions");
  const dependencies = {
    ...(guardedTasks ? { "@appbasis/database": "workspace:*" } : {}),
    "@appbasis/identity": "workspace:*",
    ...(platformServices.includes("permissions")
      ? { "@appbasis/permissions": "workspace:*" }
      : {}),
    ...(modules.includes("tasks") ? { "@appbasis/tasks": "workspace:*" } : {}),
    hono: "4.13.1",
  };

  return `${JSON.stringify(
    {
      name: packageName,
      version: "0.0.0",
      description: `${displayName} generated AppBasis mini application.`,
      private: true,
      type: "module",
      scripts: {
        typecheck: "tsc --noEmit -p tsconfig.json",
        test: guardedTasks ? "vitest run ./test/app.test.ts" : "vitest run",
        ...(guardedTasks
          ? { "test:postgres": "vitest run --config vitest.postgres.config.ts" }
          : {}),
      },
      dependencies,
      devDependencies: {
        "@types/node": "24.13.3",
        typescript: "5.9.3",
        vitest: "4.1.10",
      },
    },
    null,
    2,
  )}\n`;
}

function generatedTsconfig() {
  return `${JSON.stringify(
    {
      extends: "../../tsconfig.base.json",
      compilerOptions: {
        types: ["node"],
      },
      include: ["worker/**/*.ts", "test/**/*.ts", "vitest*.config.ts"],
    },
    null,
    2,
  )}\n`;
}

function generatedVitestConfig() {
  return `import { defineConfig } from "vitest/config";\n\nexport default defineConfig({\n  test: {\n    environment: "node",\n  },\n});\n`;
}

function generatedPostgresVitestConfig() {
  return `import { defineConfig } from "vitest/config";\n\nexport default defineConfig({\n  test: {\n    environment: "node",\n    include: ["test/**/*.postgres.e2e.ts"],\n  },\n});\n`;
}

function generatedWorkerApp(appId, modules, platformServices) {
  const guardedTasks =
    modules.includes("tasks") && platformServices.includes("permissions");
  if (!guardedTasks) return generatedIdentityWorkerApp(appId);
  return generatedTasksWorkerApp(appId);
}

function generatedIdentityWorkerApp(appId) {
  return `import { Hono } from "hono";\n\nimport {\n  createIdentityHttpHandlers,\n  type IdentityHttpService,\n} from "@appbasis/identity/http";\n\nexport interface GeneratedAppDependencies {\n  identity: IdentityHttpService;\n  secureCookies?: boolean;\n}\n\nexport function createGeneratedApp(dependencies: GeneratedAppDependencies) {\n  const app = new Hono();\n  const identityHttp = createIdentityHttpHandlers({\n    identity: dependencies.identity,\n    secureCookies: dependencies.secureCookies ?? true,\n  });\n\n  app.get("/api/health", (context) =>\n    context.json({ status: "ok", appId: "${appId}" }),\n  );\n  app.post("/api/auth/sign-in", (context) =>\n    identityHttp.signIn(context.req.raw),\n  );\n  app.get("/api/auth/session", (context) =>\n    identityHttp.session(context.req.raw),\n  );\n  app.post("/api/auth/change-required-password", (context) =>\n    identityHttp.changeRequiredPassword(context.req.raw),\n  );\n\n  return app;\n}\n`;
}

function generatedTasksWorkerApp(appId) {
  return `import { Hono, type Context } from "hono";\n\nimport { assertIdentityActionAllowed } from "@appbasis/identity/access";\nimport {\n  createIdentityHttpHandlers,\n  type IdentityHttpHandlers,\n  type IdentityHttpService,\n} from "@appbasis/identity/http";\nimport {\n  assert as assertPermission,\n  capabilityId,\n  PermissionDeniedError,\n  principalId,\n  type PermissionStore,\n} from "@appbasis/permissions";\nimport {\n  TASK_CAPABILITIES,\n  TaskValidationError,\n  type TaskRepository,\n} from "@appbasis/tasks";\n\nexport interface GeneratedAppDependencies {\n  identity: IdentityHttpService;\n  permissions: PermissionStore;\n  tasks: TaskRepository;\n  secureCookies?: boolean;\n}\n\ntype ErrorCode =\n  | "INVALID_REQUEST"\n  | "INVALID_TASK"\n  | "PERMISSION_DENIED"\n  | "TASK_NOT_FOUND";\n\nexport function createGeneratedApp(dependencies: GeneratedAppDependencies) {\n  const app = new Hono();\n  const identityHttp = createIdentityHttpHandlers({\n    identity: dependencies.identity,\n    secureCookies: dependencies.secureCookies ?? true,\n  });\n\n  app.get("/api/health", (context) =>\n    context.json({ status: "ok", appId: "${appId}" }),\n  );\n  app.post("/api/auth/sign-in", (context) =>\n    identityHttp.signIn(context.req.raw),\n  );\n  app.get("/api/auth/session", (context) =>\n    identityHttp.session(context.req.raw),\n  );\n  app.post("/api/auth/change-required-password", (context) =>\n    identityHttp.changeRequiredPassword(context.req.raw),\n  );\n\n  app.get("/api/tasks", async (context) => {\n    const denied = await authorizeTasks(context, dependencies, identityHttp);\n    if (denied !== null) return denied;\n    return context.json({ tasks: await dependencies.tasks.list() });\n  });\n\n  app.post("/api/tasks", async (context) => {\n    const denied = await authorizeTasks(context, dependencies, identityHttp);\n    if (denied !== null) return denied;\n    const body = await readObjectBody(context);\n    if (body === null) return invalidRequest(context);\n    const title = stringField(body, "title");\n    const description = optionalStringField(body, "description");\n    if (title === null || description === undefined) return invalidRequest(context);\n\n    try {\n      const task = await dependencies.tasks.create({\n        title,\n        ...(description === null ? {} : { description }),\n      });\n      return context.json({ task }, 201);\n    } catch (error) {\n      if (error instanceof TaskValidationError) {\n        return errorResponse(context, 400, "INVALID_TASK", "The task input is invalid.");\n      }\n      throw error;\n    }\n  });\n\n  app.post("/api/tasks/:id/toggle", async (context) => {\n    const denied = await authorizeTasks(context, dependencies, identityHttp);\n    if (denied !== null) return denied;\n    const task = await dependencies.tasks.toggleStatus(context.req.param("id"));\n    if (task === undefined) {\n      return errorResponse(context, 404, "TASK_NOT_FOUND", "The task was not found.");\n    }\n    return context.json({ task });\n  });\n\n  return app;\n}\n\nasync function authorizeTasks(\n  context: Context,\n  dependencies: GeneratedAppDependencies,\n  identityHttp: IdentityHttpHandlers,\n): Promise<Response | null> {\n  const current = await identityHttp.resolveCurrentIdentity(context.req.raw);\n  if (current instanceof Response) return current;\n\n  try {\n    assertIdentityActionAllowed(current, "application");\n    await assertPermission(dependencies.permissions, {\n      principalId: principalId(current.identity.identityId),\n      capability: capabilityId(TASK_CAPABILITIES.manage),\n    });\n    return null;\n  } catch (error) {\n    if (error instanceof PermissionDeniedError) {\n      return errorResponse(\n        context,\n        403,\n        "PERMISSION_DENIED",\n        "The current identity is not allowed to manage tasks.",\n      );\n    }\n    return identityHttp.identityErrorResponse(error);\n  }\n}\n\nasync function readObjectBody(\n  context: Context,\n): Promise<Record<string, unknown> | null> {\n  try {\n    const body: unknown = await context.req.json();\n    if (body === null || typeof body !== "object" || Array.isArray(body)) return null;\n    return body as Record<string, unknown>;\n  } catch {\n    return null;\n  }\n}\n\nfunction stringField(body: Record<string, unknown>, field: string): string | null {\n  const value = body[field];\n  return typeof value === "string" ? value : null;\n}\n\nfunction optionalStringField(\n  body: Record<string, unknown>,\n  field: string,\n): string | null | undefined {\n  const value = body[field];\n  if (value === undefined) return null;\n  return typeof value === "string" ? value : undefined;\n}\n\nfunction invalidRequest(context: Context) {\n  return errorResponse(context, 400, "INVALID_REQUEST", "The request body is invalid.");\n}\n\nfunction errorResponse(\n  context: Context,\n  status: 400 | 403 | 404,\n  code: ErrorCode,\n  message: string,\n): Response {\n  return context.json({ error: { code, message } }, status);\n}\n`;
}

function generatedPostgresRuntime() {
  return `import { createPostgresDatabase } from "@appbasis/database/postgres-runtime";
import {
  createPostgresIdentityApplicationRuntime,
  type IdentityPostgresRuntimeSqlClient,
} from "@appbasis/identity/postgres-runtime";
import type { IdentityHttpService } from "@appbasis/identity/http";
import {
  PostgresPermissionStore,
  type PermissionStore,
} from "@appbasis/permissions";
import { PostgresTaskRepository, type TaskRepository } from "@appbasis/tasks";

export interface GeneratedPostgresRuntime {
  permissions: PermissionStore;
  tasks: TaskRepository;
  close(): Promise<void>;
}

export interface GeneratedPostgresApplicationRuntime
  extends GeneratedPostgresRuntime {
  identity: IdentityHttpService;
}

export interface GeneratedPostgresApplicationRuntimeOptions {
  connectionString: string;
  baseURL: string;
  secret: string;
}

export function createGeneratedPostgresRuntime(
  connectionString: string,
): GeneratedPostgresRuntime {
  const connection = createPostgresDatabase(
    requiredPostgresConnectionString(connectionString),
  );
  const repositories = createPersistentRepositories(connection.client);

  return Object.freeze({
    ...repositories,
    async close() {
      await connection.client.end();
    },
  });
}

export function createGeneratedPostgresApplicationRuntime(
  options: GeneratedPostgresApplicationRuntimeOptions,
): GeneratedPostgresApplicationRuntime {
  const identityRuntime = createPostgresIdentityApplicationRuntime(options);
  const repositories = createPersistentRepositories(identityRuntime.sql);

  return Object.freeze({
    identity: identityRuntime.identity,
    ...repositories,
    async close() {
      await identityRuntime.close();
    },
  });
}

function createPersistentRepositories(client: IdentityPostgresRuntimeSqlClient) {
  const sql = {
    unsafe(query: string, parameters?: (string | number | boolean | null)[]) {
      return client.unsafe(query, parameters);
    },
  };
  return Object.freeze({
    permissions: new PostgresPermissionStore(sql),
    tasks: new PostgresTaskRepository(sql),
  });
}

function requiredPostgresConnectionString(value: string): string {
  const normalized = value.trim();
  try {
    const url = new URL(normalized);
    if (
      (url.protocol !== "postgres:" && url.protocol !== "postgresql:") ||
      url.hostname.length === 0
    ) {
      throw new Error("invalid");
    }
    return normalized;
  } catch {
    throw new Error("A valid PostgreSQL connection string is required.");
  }
}
`;
}

function generatedPostgresE2ETest() {
  return `import { randomUUID } from "node:crypto";
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
    const runtime = createGeneratedPostgresApplicationRuntime({
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
`;
}

function generatedAppTest(modules, platformServices) {
  const hasTasks = modules.includes("tasks");
  const guardedTasks = hasTasks && platformServices.includes("permissions");
  const moduleImports = hasTasks
    ? guardedTasks
      ? `import { InMemoryTaskRepository, TASK_CAPABILITIES } from "@appbasis/tasks";\nimport {\n  InMemoryPermissionStore,\n  capabilityId,\n  principalId,\n} from "@appbasis/permissions";\n`
      : `import { InMemoryTaskRepository } from "@appbasis/tasks";\n`
    : "";
  const moduleTests = hasTasks
    ? `\n  it("consumes the declared tasks module contract", async () => {\n    const tasks = new InMemoryTaskRepository();\n    const created = await tasks.create({ title: "Generated task" });\n\n    expect(created).toMatchObject({\n      title: "Generated task",\n      status: "open",\n    });\n    await expect(tasks.toggleStatus(created.id)).resolves.toMatchObject({\n      id: created.id,\n      status: "completed",\n    });\n  });\n`
    : "";
  const guardedRouteTests = guardedTasks
    ? `\n  it("guards generated tasks HTTP routes with identity and permissions", async () => {\n    const tasks = new InMemoryTaskRepository();\n    const allowed = createGeneratedApp({\n      identity,\n      permissions: permissionStore(true),\n      tasks,\n      secureCookies: false,\n    });\n\n    const unauthenticated = await allowed.request("/api/tasks");\n    expect(unauthenticated.status).toBe(401);\n\n    const denied = await createGeneratedApp({\n      identity,\n      permissions: permissionStore(false),\n      tasks,\n      secureCookies: false,\n    }).request("/api/tasks", {\n      headers: { cookie: currentIdentity.sessionToken },\n    });\n    expect(denied.status).toBe(403);\n    await expect(denied.json()).resolves.toMatchObject({\n      error: { code: "PERMISSION_DENIED" },\n    });\n\n    const created = await allowed.request("/api/tasks", {\n      method: "POST",\n      headers: {\n        cookie: currentIdentity.sessionToken,\n        "content-type": "application/json",\n      },\n      body: JSON.stringify({ title: "Generated HTTP task" }),\n    });\n    expect(created.status).toBe(201);\n    const createdBody = await created.json();\n    expect(createdBody).toMatchObject({\n      task: { title: "Generated HTTP task", status: "open" },\n    });\n\n    const listed = await allowed.request("/api/tasks", {\n      headers: { cookie: currentIdentity.sessionToken },\n    });\n    expect(listed.status).toBe(200);\n    await expect(listed.json()).resolves.toMatchObject({\n      tasks: [{ title: "Generated HTTP task", status: "open" }],\n    });\n  });\n`
    : "";
  const permissionHelper = guardedTasks
    ? `\nfunction permissionStore(allow: boolean) {\n  const capability = capabilityId(TASK_CAPABILITIES.manage);\n  return new InMemoryPermissionStore({\n    knownCapabilities: [capability],\n    roles: [],\n    principals: [\n      {\n        principalId: principalId(currentIdentity.identity.identityId),\n        roleIds: [],\n        grants: allow ? [capability] : [],\n        revokes: [],\n      },\n    ],\n  });\n}\n`
    : "";

  return `import { describe, expect, it } from "vitest";\n\n${moduleImports}import type { IdentityHttpService } from "@appbasis/identity/http";\nimport { createGeneratedApp } from "../worker/app";\n\nconst currentIdentity = {\n  identity: {\n    identityId: "identity-1",\n    username: "mini.user",\n    displayName: "Mini User",\n    contactEmail: null,\n    personId: null,\n    mustChangePassword: false,\n    createdAt: new Date("2026-01-01T00:00:00.000Z"),\n    updatedAt: new Date("2026-01-01T00:00:00.000Z"),\n    passwordChangedAt: new Date("2026-01-01T00:00:00.000Z"),\n    disabledAt: null,\n    accountStatus: "active" as const,\n  },\n  sessionToken: "appbasis.session=test-token",\n  access: "full" as const,\n};\n\nconst identity: IdentityHttpService = {\n  async signInWithUsername() {\n    return currentIdentity;\n  },\n  async getCurrentIdentity(sessionToken) {\n    return sessionToken === currentIdentity.sessionToken ? currentIdentity : null;\n  },\n  async changeRequiredPassword() {\n    return currentIdentity;\n  },\n};\n\ndescribe("generated AppBasis identity runtime", () => {\n  it("is runnable and exposes health", async () => {\n    const response = await createGeneratedApp(${guardedTasks ? `{ identity, permissions: permissionStore(true), tasks: new InMemoryTaskRepository() }` : `{ identity }`}).request("/api/health");\n    expect(response.status).toBe(200);\n    expect(await response.json()).toMatchObject({ status: "ok" });\n  });\n\n  it("uses the shared identity HTTP contract", async () => {\n    const response = await createGeneratedApp(${guardedTasks ? `{\n      identity,\n      permissions: permissionStore(true),\n      tasks: new InMemoryTaskRepository(),\n      secureCookies: false,\n    }` : `{\n      identity,\n      secureCookies: false,\n    }`}).request("/api/auth/sign-in", {\n      method: "POST",\n      headers: { "content-type": "application/json" },\n      body: JSON.stringify({ username: "mini.user", password: "secret" }),\n    });\n\n    expect(response.status).toBe(200);\n    expect(response.headers.get("set-cookie")).toContain("appbasis.session=test-token");\n    expect(await response.json()).toMatchObject({\n      identity: { username: "mini.user" },\n      access: "full",\n    });\n  });\n${moduleTests}${guardedRouteTests}});\n${permissionHelper}`;
}

function requiredGeneratedModules(value) {
  return requiredGeneratedIdentifiers(
    value,
    "module",
    SUPPORTED_GENERATED_MODULES,
  );
}

function requiredGeneratedPlatformServices(value) {
  return requiredGeneratedIdentifiers(
    value,
    "platform service",
    SUPPORTED_GENERATED_PLATFORM_SERVICES,
  );
}

function requiredGeneratedIdentifiers(value, label, supported) {
  if (!Array.isArray(value)) {
    throw new Error(`Generated runtime ${label}s must be an array.`);
  }

  const identifiers = [];
  const seen = new Set();
  for (const valueEntry of value) {
    const identifier = requiredIdentifier(valueEntry, label);
    if (seen.has(identifier)) {
      throw new Error(`Generated runtime ${label} is duplicated: ${identifier}.`);
    }
    if (!supported.has(identifier)) {
      throw new Error(`Generated runtime does not support ${label} ${identifier}.`);
    }
    seen.add(identifier);
    identifiers.push(identifier);
  }
  return Object.freeze(identifiers);
}

function file(path, content) {
  return Object.freeze({ path, content });
}

function requiredIdentifier(value, field) {
  if (typeof value !== "string" || !IDENTIFIER_PATTERN.test(value)) {
    throw new Error(`Generated runtime ${field} must match ${IDENTIFIER_PATTERN.source}.`);
  }
  return value;
}

function requiredDisplayName(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 80 ||
    value.trim() !== value
  ) {
    throw new Error(
      "Generated runtime displayName must be a non-empty trimmed string with at most 80 characters.",
    );
  }
  return value;
}
