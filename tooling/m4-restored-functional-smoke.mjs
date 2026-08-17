import { randomBytes, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

import { createPostgresDatabase } from "@appbasis/database/node-runtime";
import { createBetterAuthRuntime } from "@appbasis/identity/better-auth";
import { PostgresIdentityStateStore } from "@appbasis/identity/server";
import {
  DEMO_KNOWN_CAPABILITIES,
  DEMO_ROLE_BUNDLES,
  DEMO_ROLES,
  principalId,
} from "@appbasis/permissions";
import { provisionPostgresPermissions } from "@appbasis/permissions/provisioning";

import { createGeneratedApp } from "../apps/m3-preview/worker/app.ts";
import { createGeneratedPostgresApplicationRuntime } from "../apps/m3-preview/worker/postgres.ts";

const BASE_URL = "https://m4-restore-smoke.invalid";

export class M4RestoredFunctionalSmokeConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "M4RestoredFunctionalSmokeConfigurationError";
  }
}

export function readM4RestoredFunctionalSmokeEnvironment(env = process.env) {
  const connectionString = env.APPBASIS_M4_RESTORE_DATABASE_URL?.trim() ?? "";
  if (connectionString.length === 0) {
    throw new M4RestoredFunctionalSmokeConfigurationError(
      "APPBASIS_M4_RESTORE_DATABASE_URL is required.",
    );
  }
  try {
    const url = new URL(connectionString);
    if (
      (url.protocol !== "postgres:" && url.protocol !== "postgresql:") ||
      url.hostname.length === 0
    ) {
      throw new Error("invalid");
    }
  } catch {
    throw new M4RestoredFunctionalSmokeConfigurationError(
      "APPBASIS_M4_RESTORE_DATABASE_URL must be a valid PostgreSQL connection string.",
    );
  }
  return Object.freeze({ connectionString });
}

export async function runM4RestoredFunctionalSmoke(options) {
  const marker = randomBytes(6).toString("hex");
  const secret = randomBytes(32).toString("base64url");
  const allowed = smokePrincipal("a", marker);
  const denied = smokePrincipal("d", marker);

  await provisionSmokePrincipals(options.connectionString, secret, allowed, denied);

  let runtime = await createRuntime(options.connectionString, secret);
  let allowedCookie;
  let deniedCookie;
  let taskId;
  try {
    const app = appFor(runtime);
    const health = await app.request("/api/health");
    assertStatus(health, 200, "restored m3-preview health");
    const healthBody = await readJson(health, "restored m3-preview health");
    if (healthBody?.status !== "ok" || healthBody?.appId !== "m3-preview") {
      throw new Error("restored m3-preview health returned an unexpected payload.");
    }

    deniedCookie = await authenticate(app, denied);
    const deniedTasks = await app.request("/api/tasks", {
      headers: { cookie: deniedCookie },
    });
    assertStatus(deniedTasks, 403, "restored denied permission smoke");
    const deniedBody = await readJson(deniedTasks, "restored denied permission smoke");
    if (deniedBody?.error?.code !== "PERMISSION_DENIED") {
      throw new Error("restored denied principal did not fail closed.");
    }

    allowedCookie = await authenticate(app, allowed);
    const createdResponse = await app.request("/api/tasks", {
      method: "POST",
      headers: {
        cookie: allowedCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: `M4 restored smoke ${marker}`,
        description: `Disposable M4 restore verification ${marker}.`,
      }),
    });
    assertStatus(createdResponse, 201, "restored tasks create smoke");
    const createdBody = await readJson(createdResponse, "restored tasks create smoke");
    taskId = createdBody?.task?.id;
    if (typeof taskId !== "string" || createdBody?.task?.status !== "open") {
      throw new Error("restored tasks create smoke returned an unexpected task.");
    }
  } finally {
    await runtime.close();
  }

  runtime = await createRuntime(options.connectionString, secret);
  try {
    const app = appFor(runtime);
    await assertTaskState(app, allowedCookie, taskId, "open");
    const toggled = await app.request(`/api/tasks/${encodeURIComponent(taskId)}/toggle`, {
      method: "POST",
      headers: { cookie: allowedCookie },
    });
    assertStatus(toggled, 200, "restored tasks toggle smoke");
    const toggledBody = await readJson(toggled, "restored tasks toggle smoke");
    if (toggledBody?.task?.id !== taskId || toggledBody?.task?.status !== "completed") {
      throw new Error("restored task did not toggle to completed.");
    }
  } finally {
    await runtime.close();
  }

  runtime = await createRuntime(options.connectionString, secret);
  try {
    await assertTaskState(appFor(runtime), allowedCookie, taskId, "completed");
  } finally {
    await runtime.close();
  }

  return Object.freeze({
    status: "ok",
    allowedIdentityId: allowed.identityId,
    deniedIdentityId: denied.identityId,
    taskId,
  });
}

function smokePrincipal(kind, marker) {
  const username = `m4r.${kind}.${marker}`;
  return {
    username,
    displayName: `M4 restore ${kind === "a" ? "allowed" : "denied"} ${marker}`,
    email: `${username}@example.invalid`,
    temporaryPassword: password(),
    password: password(),
    identityId: null,
  };
}

function password() {
  return `M4!aA7${randomBytes(18).toString("base64url")}`;
}

async function provisionSmokePrincipals(connectionString, secret, allowed, denied) {
  const connection = createPostgresDatabase(connectionString);
  try {
    const auth = createBetterAuthRuntime({
      database: connection.database,
      baseURL: BASE_URL,
      secret,
    });
    const stateStore = new PostgresIdentityStateStore(connection.client);

    for (const principal of [allowed, denied]) {
      const created = await auth.api.createUser({
        body: {
          email: principal.email,
          password: principal.temporaryPassword,
          name: principal.displayName,
          role: "user",
          data: {
            username: principal.username,
            displayUsername: principal.username,
          },
        },
      });
      const identityId = created?.user?.id ?? created?.id;
      if (typeof identityId !== "string" || identityId.length === 0) {
        throw new Error("Better Auth did not return an identity id for the restore smoke.");
      }
      principal.identityId = identityId;
      await stateStore.create({
        identityId,
        username: principal.username,
        displayName: principal.displayName,
        contactEmail: null,
      });
    }

    await provisionPostgresPermissions(connection.client, {
      knownCapabilities: DEMO_KNOWN_CAPABILITIES,
      roles: DEMO_ROLE_BUNDLES,
      principalRoleAssignments: [
        {
          principalId: principalId(requiredIdentityId(allowed)),
          roleIds: [DEMO_ROLES.member],
        },
        {
          principalId: principalId(requiredIdentityId(denied)),
          roleIds: [],
        },
      ],
    });
  } finally {
    await connection.client.end();
  }
}

function requiredIdentityId(principal) {
  if (typeof principal.identityId !== "string" || principal.identityId.length === 0) {
    throw new Error("restore smoke principal was not provisioned.");
  }
  return principal.identityId;
}

async function createRuntime(connectionString, secret) {
  return createGeneratedPostgresApplicationRuntime({
    connectionString,
    baseURL: BASE_URL,
    secret,
  });
}

function appFor(runtime) {
  return createGeneratedApp({
    identity: runtime.identity,
    permissions: runtime.permissions,
    tasks: runtime.tasks,
    secureCookies: false,
  });
}

async function authenticate(app, principal) {
  const signedIn = await app.request("/api/auth/sign-in", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: principal.username,
      password: principal.temporaryPassword,
    }),
  });
  assertStatus(signedIn, 200, "restored auth sign-in smoke");
  const signedInBody = await readJson(signedIn, "restored auth sign-in smoke");
  if (
    signedInBody?.access !== "password-change-required" ||
    signedInBody?.identity?.identityId !== requiredIdentityId(principal)
  ) {
    throw new Error("restored auth sign-in did not return password-change-required access.");
  }

  const temporaryCookie = requireCookie(signedIn);
  const changed = await app.request("/api/auth/change-required-password", {
    method: "POST",
    headers: {
      cookie: temporaryCookie,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      currentPassword: principal.temporaryPassword,
      newPassword: principal.password,
      idempotencyKey: randomUUID(),
    }),
  });
  assertStatus(changed, 200, "restored auth password-change smoke");
  const changedBody = await readJson(changed, "restored auth password-change smoke");
  if (
    changedBody?.access !== "full" ||
    changedBody?.identity?.identityId !== requiredIdentityId(principal)
  ) {
    throw new Error("restored auth password change did not yield full access.");
  }

  const cookie = requireCookie(changed);
  const session = await app.request("/api/auth/session", {
    headers: { cookie },
  });
  assertStatus(session, 200, "restored auth session smoke");
  const sessionBody = await readJson(session, "restored auth session smoke");
  if (
    sessionBody?.access !== "full" ||
    sessionBody?.identity?.identityId !== requiredIdentityId(principal) ||
    sessionBody?.identity?.username !== principal.username
  ) {
    throw new Error("restored auth session did not preserve the expected identity.");
  }
  return cookie;
}

async function assertTaskState(app, cookie, taskId, status) {
  const listed = await app.request("/api/tasks", {
    headers: { cookie },
  });
  assertStatus(listed, 200, "restored tasks persistence smoke");
  const body = await readJson(listed, "restored tasks persistence smoke");
  if (
    !Array.isArray(body?.tasks) ||
    !body.tasks.some((task) => task?.id === taskId && task?.status === status)
  ) {
    throw new Error(`restored task did not persist with status ${status}.`);
  }
}

function requireCookie(response) {
  const header = response.headers.get("set-cookie");
  const cookie = header?.split(";", 1)[0]?.trim();
  if (cookie === undefined || cookie.length === 0) {
    throw new Error("restore smoke authentication returned no session cookie.");
  }
  return cookie;
}

function assertStatus(response, expected, label) {
  if (response.status !== expected) {
    throw new Error(`${label} returned HTTP ${response.status}, expected ${expected}.`);
  }
}

async function readJson(response, label) {
  try {
    return await response.json();
  } catch {
    throw new Error(`${label} returned invalid JSON.`);
  }
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  try {
    const result = await runM4RestoredFunctionalSmoke(
      readM4RestoredFunctionalSmokeEnvironment(),
    );
    console.log(
      `M4 restored functional smoke passed: auth, permission deny-by-default and tasks persistence (${result.taskId}).`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : "M4 restored functional smoke failed.");
    process.exitCode = 1;
  }
}
