import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createPostgresDatabase } from "@appbasis/database/postgres-runtime";
import type { IdentityHttpService } from "@appbasis/identity/http";
import {
  InMemoryPermissionStore,
  capabilityId,
  principalId,
} from "@appbasis/permissions";
import { TASK_CAPABILITIES } from "@appbasis/tasks";

import { createGeneratedApp } from "../worker/app";
import { createGeneratedPostgresRuntime } from "../worker/postgres";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error("DATABASE_URL is required for generated PostgreSQL E2E tests.");
}

const administrativeConnection = createPostgresDatabase(databaseUrl);
const migrationUrl = new URL(
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

const identity: IdentityHttpService = {
  async signInWithUsername() {
    return currentIdentity;
  },
  async getCurrentIdentity(sessionToken) {
    return sessionToken === currentIdentity.sessionToken ? currentIdentity : null;
  },
  async changeRequiredPassword() {
    return currentIdentity;
  },
};

beforeAll(async () => {
  await administrativeConnection.client.unsafe(
    "DROP TABLE IF EXISTS appbasis_task CASCADE",
  );
  const migration = await readFile(migrationUrl, "utf8");
  await administrativeConnection.client.unsafe(migration);
});

beforeEach(async () => {
  await administrativeConnection.client.unsafe("TRUNCATE TABLE appbasis_task");
});

afterAll(async () => {
  await administrativeConnection.client.end();
});

describe("generated PostgreSQL tasks runtime", () => {
  it("persists authorized HTTP task mutations across runtime instances", async () => {
    let taskId: string;
    const firstRuntime = createGeneratedPostgresRuntime(databaseUrl);
    try {
      const firstApp = createGeneratedApp({
        identity,
        permissions: permissionStore(),
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

    const secondRuntime = createGeneratedPostgresRuntime(databaseUrl);
    try {
      const secondApp = createGeneratedApp({
        identity,
        permissions: permissionStore(),
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

    const thirdRuntime = createGeneratedPostgresRuntime(databaseUrl);
    try {
      const thirdApp = createGeneratedApp({
        identity,
        permissions: permissionStore(),
        tasks: thirdRuntime.tasks,
        secureCookies: false,
      });
      const listed = await thirdApp.request("/api/tasks", {
        headers: { cookie: currentIdentity.sessionToken },
      });
      await expect(listed.json()).resolves.toMatchObject({
        tasks: [{ id: taskId, status: "completed" }],
      });
    } finally {
      await thirdRuntime.close();
    }
  });
});

function permissionStore() {
  const capability = capabilityId(TASK_CAPABILITIES.manage);
  return new InMemoryPermissionStore({
    knownCapabilities: [capability],
    roles: [],
    principals: [
      {
        principalId: principalId(currentIdentity.identity.identityId),
        roleIds: [],
        grants: [capability],
        revokes: [],
      },
    ],
  });
}
