import { describe, expect, it } from "vitest";

import { InMemoryTaskRepository, TASK_CAPABILITIES } from "@appbasis/tasks";
import {
  InMemoryPermissionStore,
  capabilityId,
  principalId,
} from "@appbasis/permissions";
import type { IdentityHttpService } from "@appbasis/identity/http";
import { createGeneratedApp } from "../worker/app";

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
    const response = await createGeneratedApp({ identity, permissions: permissionStore(true), tasks: new InMemoryTaskRepository() }).request("/api/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "ok" });
  });

  it("uses the shared identity HTTP contract", async () => {
    const response = await createGeneratedApp({
      identity,
      permissions: permissionStore(true),
      tasks: new InMemoryTaskRepository(),
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
      secureCookies: false,
    });

    const unauthenticated = await allowed.request("/api/tasks");
    expect(unauthenticated.status).toBe(401);

    const denied = await createGeneratedApp({
      identity,
      permissions: permissionStore(false),
      tasks,
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
});

function permissionStore(allow: boolean) {
  const capability = capabilityId(TASK_CAPABILITIES.manage);
  return new InMemoryPermissionStore({
    knownCapabilities: [capability],
    roles: [],
    principals: [
      {
        principalId: principalId(currentIdentity.identity.identityId),
        roleIds: [],
        grants: allow ? [capability] : [],
        revokes: [],
      },
    ],
  });
}
