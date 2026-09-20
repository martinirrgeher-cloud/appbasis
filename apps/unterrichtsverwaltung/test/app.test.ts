import { describe, expect, it } from "vitest";

import { InMemoryTaskRepository, TASK_CAPABILITIES } from "@appbasis/tasks";
import {
  InMemoryPermissionStore,
  capabilityId,
  principalId,
} from "@appbasis/permissions";
import type { IdentityHttpService } from "@appbasis/identity/http";
import { createGeneratedApp } from "../worker/app";
import { InMemoryMasterDataRepository } from "../worker/master-data";

const currentIdentity = {
  identity: {
    identityId: "identity-1",
    username: "mini.user",
    displayName: "Mini User",
    contactEmail: null,
    personId: null,
    mustChangePassword: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    passwordChangedAt: new Date("2026-01-01T00:00:00.000Z"),
    disabledAt: null,
    accountStatus: "active" as const,
  },
  sessionToken: "appbasis.session=test-token",
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

describe("generated AppBasis identity runtime", () => {
  it("is runnable and exposes health", async () => {
    const response = await createGeneratedApp({ identity, permissions: permissionStore(true), tasks: new InMemoryTaskRepository(), masterData: new InMemoryMasterDataRepository() }).request("/api/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "ok" });
  });

  it("uses the shared identity HTTP contract", async () => {
    const response = await createGeneratedApp({
      identity,
      permissions: permissionStore(true),
      tasks: new InMemoryTaskRepository(), masterData: new InMemoryMasterDataRepository(),
      secureCookies: false,
    }).request("/api/auth/sign-in", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "mini.user", password: "secret" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("appbasis.session=test-token");
    expect(await response.json()).toMatchObject({
      identity: { username: "mini.user" },
      access: "full",
    });
  });

  it("consumes the declared tasks module contract", async () => {
    const tasks = new InMemoryTaskRepository();
    const created = await tasks.create({ title: "Generated task" });

    expect(created).toMatchObject({
      title: "Generated task",
      status: "open",
    });
    await expect(tasks.toggleStatus(created.id)).resolves.toMatchObject({
      id: created.id,
      status: "completed",
    });
  });

  it("guards generated tasks HTTP routes with identity and permissions", async () => {
    const tasks = new InMemoryTaskRepository();
    const allowed = createGeneratedApp({
      identity,
      permissions: permissionStore(true),
      tasks,
      masterData: new InMemoryMasterDataRepository(),
      secureCookies: false,
    });

    const unauthenticated = await allowed.request("/api/tasks");
    expect(unauthenticated.status).toBe(401);

    const denied = await createGeneratedApp({
      identity,
      permissions: permissionStore(false),
      tasks,
      masterData: new InMemoryMasterDataRepository(),
      secureCookies: false,
    }).request("/api/tasks", {
      headers: { cookie: currentIdentity.sessionToken },
    });
    expect(denied.status).toBe(403);
    await expect(denied.json()).resolves.toMatchObject({
      error: { code: "PERMISSION_DENIED" },
    });

    const created = await allowed.request("/api/tasks", {
      method: "POST",
      headers: {
        cookie: currentIdentity.sessionToken,
        "content-type": "application/json",
      },
      body: JSON.stringify({ title: "Generated HTTP task" }),
    });
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    expect(createdBody).toMatchObject({
      task: { title: "Generated HTTP task", status: "open" },
    });

    const listed = await allowed.request("/api/tasks", {
      headers: { cookie: currentIdentity.sessionToken },
    });
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toMatchObject({
      tasks: [{ title: "Generated HTTP task", status: "open" }],
    });
  });

  it("persists the first school master-data slice behind authenticated application access", async () => {
    const masterData = new InMemoryMasterDataRepository(
      (() => {
        let id = 0;
        return () => "master-" + String(++id);
      })(),
    );
    const app = createGeneratedApp({
      identity,
      permissions: permissionStore(true),
      tasks: new InMemoryTaskRepository(),
      masterData,
      secureCookies: false,
    });
    const headers = {
      cookie: currentIdentity.sessionToken,
      "content-type": "application/json",
    };

    const createdClass = await app.request("/api/master-data/classes", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "3A", schoolYear: "2026/27" }),
    });
    expect(createdClass.status).toBe(201);
    const classBody = (await createdClass.json()) as {
      class: { id: string; name: string; archived: boolean };
    };
    expect(classBody.class).toMatchObject({ name: "3A", archived: false });

    const createdStudent = await app.request("/api/master-data/students", {
      method: "POST",
      headers,
      body: JSON.stringify({
        classId: classBody.class.id,
        firstName: "Anna",
        lastName: "Beispiel",
      }),
    });
    expect(createdStudent.status).toBe(201);

    const students = await app.request(
      "/api/master-data/students?classId=" + encodeURIComponent(classBody.class.id),
      { headers: { cookie: currentIdentity.sessionToken } },
    );
    expect(students.status).toBe(200);
    await expect(students.json()).resolves.toMatchObject({
      students: [
        {
          classId: classBody.class.id,
          firstName: "Anna",
          lastName: "Beispiel",
        },
      ],
    });

    const archived = await app.request(
      "/api/master-data/classes/" + classBody.class.id + "/archive",
      { method: "POST", headers: { cookie: currentIdentity.sessionToken } },
    );
    expect(archived.status).toBe(200);
    await expect(archived.json()).resolves.toMatchObject({
      class: { id: classBody.class.id, archived: true },
    });

    const rejectedStudent = await app.request("/api/master-data/students", {
      method: "POST",
      headers,
      body: JSON.stringify({
        classId: classBody.class.id,
        firstName: "Max",
        lastName: "Später",
      }),
    });
    expect(rejectedStudent.status).toBe(409);
  });

  it("denies master-data access without app:use", async () => {
    const denied = await createGeneratedApp({
      identity,
      permissions: permissionStore(false),
      tasks: new InMemoryTaskRepository(),
      masterData: new InMemoryMasterDataRepository(),
      secureCookies: false,
    }).request("/api/master-data/classes", {
      headers: { cookie: currentIdentity.sessionToken },
    });
    expect(denied.status).toBe(403);
    await expect(denied.json()).resolves.toMatchObject({
      error: { code: "PERMISSION_DENIED" },
    });
  });

});

function permissionStore(allow: boolean) {
  const taskCapability = capabilityId(TASK_CAPABILITIES.manage);
  const appCapability = capabilityId("app:use");
  return new InMemoryPermissionStore({
    knownCapabilities: [appCapability, taskCapability],
    roles: [],
    principals: [
      {
        principalId: principalId(currentIdentity.identity.identityId),
        roleIds: [],
        grants: allow ? [appCapability, taskCapability] : [],
        revokes: [],
      },
    ],
  });
}
