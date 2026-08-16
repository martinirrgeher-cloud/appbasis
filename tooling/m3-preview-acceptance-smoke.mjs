import { pathToFileURL } from "node:url";

import { M3_PREVIEW_SMOKE_CONTRACT } from "./m3-preview-smoke-contract.mjs";

const MINIMUM_PASSWORD_LENGTH = 8;
const MAXIMUM_PASSWORD_LENGTH = 128;
const REQUEST_TIMEOUT_MS = 15_000;

export class M3PreviewAcceptanceConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "M3PreviewAcceptanceConfigurationError";
  }
}

export function readM3PreviewAcceptanceEnvironment(env = process.env) {
  const credentials = {
    allowedTemporaryPassword: requiredPassword(
      env.APPBASIS_SMOKE_ALLOWED_TEMPORARY_PASSWORD,
      "APPBASIS_SMOKE_ALLOWED_TEMPORARY_PASSWORD",
    ),
    allowedPassword: requiredPassword(
      env.APPBASIS_SMOKE_ALLOWED_PASSWORD,
      "APPBASIS_SMOKE_ALLOWED_PASSWORD",
    ),
    deniedTemporaryPassword: requiredPassword(
      env.APPBASIS_SMOKE_DENIED_TEMPORARY_PASSWORD,
      "APPBASIS_SMOKE_DENIED_TEMPORARY_PASSWORD",
    ),
    deniedPassword: requiredPassword(
      env.APPBASIS_SMOKE_DENIED_PASSWORD,
      "APPBASIS_SMOKE_DENIED_PASSWORD",
    ),
  };
  if (new Set(Object.values(credentials)).size !== 4) {
    throw new M3PreviewAcceptanceConfigurationError(
      "m3-preview acceptance credentials must be distinct.",
    );
  }

  return Object.freeze({
    baseURL: requiredHttpsOrigin(env.APPBASIS_GENERATED_PREVIEW_URL),
    ...credentials,
  });
}

export async function runM3PreviewAcceptanceSmoke(
  options,
  { fetchImpl = globalThis.fetch, randomUUID = () => crypto.randomUUID() } = {},
) {
  if (typeof fetchImpl !== "function" || typeof randomUUID !== "function") {
    throw new M3PreviewAcceptanceConfigurationError(
      "m3-preview acceptance transport is invalid.",
    );
  }
  const baseURL = requiredHttpsOrigin(options.baseURL);

  const denied = await authenticatePrincipal({
    baseURL,
    username: M3_PREVIEW_SMOKE_CONTRACT.denied.username,
    temporaryPassword: options.deniedTemporaryPassword,
    password: options.deniedPassword,
    fetchImpl,
    randomUUID,
  });
  await assertTasksDenied({ baseURL, cookie: denied.cookie, fetchImpl });

  const allowed = await authenticatePrincipal({
    baseURL,
    username: M3_PREVIEW_SMOKE_CONTRACT.allowed.username,
    temporaryPassword: options.allowedTemporaryPassword,
    password: options.allowedPassword,
    fetchImpl,
    randomUUID,
  });
  await assertTasksModule({
    baseURL,
    cookie: allowed.cookie,
    fetchImpl,
    marker: randomUUID(),
  });

  return Object.freeze({
    status: "ok",
    deniedIdentityId: denied.identityId,
    allowedIdentityId: allowed.identityId,
  });
}

async function authenticatePrincipal({
  baseURL,
  username,
  temporaryPassword,
  password,
  fetchImpl,
  randomUUID,
}) {
  const expectedUsername = username.toLowerCase();
  const finalAttempt = await request(baseURL, "/api/auth/sign-in", fetchImpl, {
    method: "POST",
    body: { username, password },
    allowError: true,
  });

  let cookie;
  let session;
  let identityId;
  if (finalAttempt.ok) {
    cookie = requireSessionCookie(finalAttempt.cookie);
    identityId = assertFullSession(finalAttempt.payload, expectedUsername).identityId;
    session = finalAttempt.payload;
  } else {
    if (
      finalAttempt.status !== 401 ||
      safeErrorCode(finalAttempt.payload) !== "AUTHENTICATION_FAILED"
    ) {
      throw new Error("m3-preview final smoke credential failed unexpectedly.");
    }
    const temporaryAttempt = await request(
      baseURL,
      "/api/auth/sign-in",
      fetchImpl,
      {
        method: "POST",
        body: { username, password: temporaryPassword },
      },
    );
    cookie = requireSessionCookie(temporaryAttempt.cookie);
    const temporaryIdentity = assertSignedInSession(
      temporaryAttempt.payload,
      expectedUsername,
    );
    if (temporaryAttempt.payload.access !== "password-change-required") {
      throw new Error(
        "m3-preview temporary smoke credential did not require password replacement.",
      );
    }
    identityId = temporaryIdentity.identityId;

    const changed = await request(
      baseURL,
      "/api/auth/change-required-password",
      fetchImpl,
      {
        method: "POST",
        cookie,
        body: {
          currentPassword: temporaryPassword,
          newPassword: password,
          idempotencyKey: randomUUID(),
        },
      },
    );
    cookie = requireSessionCookie(changed.cookie);
    session = changed.payload;
    assertFullSession(session, expectedUsername, identityId);
  }

  assertFullSession(session, expectedUsername, identityId);
  const current = await request(baseURL, "/api/auth/session", fetchImpl, {
    cookie,
  });
  assertFullSession(current.payload, expectedUsername, identityId);
  return Object.freeze({ cookie, identityId });
}

async function assertTasksDenied({ baseURL, cookie, fetchImpl }) {
  const response = await request(baseURL, "/api/tasks", fetchImpl, {
    cookie,
    allowError: true,
  });
  if (
    response.status !== 403 ||
    safeErrorCode(response.payload) !== "PERMISSION_DENIED" ||
    response.cookie !== null
  ) {
    throw new Error(
      "m3-preview denied smoke principal did not preserve the permission boundary.",
    );
  }
}

async function assertTasksModule({ baseURL, cookie, fetchImpl, marker }) {
  const before = await request(baseURL, "/api/tasks", fetchImpl, { cookie });
  const beforeTasks = assertTaskList(before.payload);
  const beforeIds = new Set(beforeTasks.map((task) => task.id));
  const requestedTitle = `M3 acceptance ${marker}`;
  const requestedDescription = `AppBasis generated preview acceptance ${marker}.`;

  const createdResponse = await request(baseURL, "/api/tasks", fetchImpl, {
    method: "POST",
    cookie,
    body: {
      title: requestedTitle,
      description: requestedDescription,
    },
  });
  const created = assertTask(createdResponse.payload?.task);
  if (
    beforeIds.has(created.id) ||
    created.title !== requestedTitle ||
    created.description !== requestedDescription ||
    created.status !== "open"
  ) {
    throw new Error("m3-preview task creation did not match the acceptance request.");
  }

  const persisted = await request(baseURL, "/api/tasks", fetchImpl, { cookie });
  if (!assertTaskList(persisted.payload).some((task) => sameTask(task, created, "open"))) {
    throw new Error("m3-preview acceptance task was not persisted.");
  }

  const toggledResponse = await request(
    baseURL,
    `/api/tasks/${encodeURIComponent(created.id)}/toggle`,
    fetchImpl,
    { method: "POST", cookie },
  );
  const toggled = assertTask(toggledResponse.payload?.task);
  if (!sameTask(toggled, created, "completed")) {
    throw new Error("m3-preview acceptance task did not toggle to completed.");
  }

  const finalList = await request(baseURL, "/api/tasks", fetchImpl, { cookie });
  if (
    !assertTaskList(finalList.payload).some((task) =>
      sameTask(task, created, "completed"),
    )
  ) {
    throw new Error("m3-preview toggled acceptance task was not persisted.");
  }
}

async function request(baseURL, path, fetchImpl, options = {}) {
  const headers = new Headers({ accept: "application/json" });
  if (options.cookie !== undefined) headers.set("cookie", options.cookie);
  let body;
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(options.body);
  }

  let response;
  try {
    response = await fetchImpl(new URL(path, baseURL), {
      method: options.method ?? "GET",
      headers,
      ...(body === undefined ? {} : { body }),
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new Error("m3-preview acceptance request failed before receiving a response.");
  }
  if (!(response instanceof Response)) {
    throw new Error("m3-preview acceptance transport returned an invalid response.");
  }
  const payload = await readJson(response);
  const result = Object.freeze({
    ok: response.ok,
    status: response.status,
    payload,
    cookie: cookiePair(response.headers.get("set-cookie")),
  });
  if (!response.ok && options.allowError !== true) {
    throw new Error(
      `m3-preview acceptance request ${path} returned HTTP ${response.status} (${safeErrorCode(payload)}).`,
    );
  }
  return result;
}

async function readJson(response) {
  if (response.headers.get("content-type")?.includes("application/json") !== true) {
    throw new Error("m3-preview acceptance response was not JSON.");
  }
  try {
    return await response.json();
  } catch {
    throw new Error("m3-preview acceptance response contained invalid JSON.");
  }
}

function assertSignedInSession(value, expectedUsername) {
  if (
    value === null ||
    typeof value !== "object" ||
    (value.access !== "full" && value.access !== "password-change-required") ||
    value.identity === null ||
    typeof value.identity !== "object" ||
    typeof value.identity.identityId !== "string" ||
    value.identity.identityId.length === 0 ||
    value.identity.username !== expectedUsername ||
    value.identity.accountStatus !== "active" ||
    (value.access === "full" && value.identity.mustChangePassword !== false) ||
    (value.access === "password-change-required" &&
      value.identity.mustChangePassword !== true)
  ) {
    throw new Error("m3-preview sign-in returned an unexpected identity state.");
  }
  return value.identity;
}

function assertFullSession(value, expectedUsername, expectedIdentityId) {
  const identity = assertSignedInSession(value, expectedUsername);
  if (
    value.access !== "full" ||
    (expectedIdentityId !== undefined && identity.identityId !== expectedIdentityId) ||
    identity.mustChangePassword !== false
  ) {
    throw new Error("m3-preview session is not the expected full active identity.");
  }
  return identity;
}

function assertTaskList(value) {
  if (value === null || typeof value !== "object" || !Array.isArray(value.tasks)) {
    throw new Error("m3-preview task list response has an invalid shape.");
  }
  return value.tasks.map(assertTask);
}

function assertTask(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    typeof value.id !== "string" ||
    value.id.length === 0 ||
    typeof value.title !== "string" ||
    typeof value.description !== "string" ||
    (value.status !== "open" && value.status !== "completed")
  ) {
    throw new Error("m3-preview task response has an invalid shape.");
  }
  return value;
}

function sameTask(candidate, expected, status) {
  return (
    candidate.id === expected.id &&
    candidate.title === expected.title &&
    candidate.description === expected.description &&
    candidate.status === status
  );
}

function safeErrorCode(payload) {
  if (
    payload !== null &&
    typeof payload === "object" &&
    payload.error !== null &&
    typeof payload.error === "object" &&
    typeof payload.error.code === "string" &&
    payload.error.code.length > 0
  ) {
    return payload.error.code;
  }
  return "UNKNOWN_ERROR";
}

function cookiePair(value) {
  if (value === null || value.trim().length === 0) return null;
  return value.split(";", 1)[0] ?? null;
}

function requireSessionCookie(value) {
  if (value === null) {
    throw new Error("m3-preview authentication did not return a session cookie.");
  }
  return value;
}

function requiredHttpsOrigin(value) {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
    throw new M3PreviewAcceptanceConfigurationError(
      "APPBASIS_GENERATED_PREVIEW_URL must be a canonical HTTPS origin.",
    );
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new M3PreviewAcceptanceConfigurationError(
      "APPBASIS_GENERATED_PREVIEW_URL must be a canonical HTTPS origin.",
    );
  }
  if (
    url.protocol !== "https:" ||
    url.hostname.length === 0 ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    (url.pathname !== "" && url.pathname !== "/") ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw new M3PreviewAcceptanceConfigurationError(
      "APPBASIS_GENERATED_PREVIEW_URL must be a canonical HTTPS origin.",
    );
  }
  return url.origin;
}

function requiredPassword(value, field) {
  if (
    typeof value !== "string" ||
    value.length < MINIMUM_PASSWORD_LENGTH ||
    value.length > MAXIMUM_PASSWORD_LENGTH ||
    value.trim().length === 0
  ) {
    throw new M3PreviewAcceptanceConfigurationError(
      `${field} must contain ${MINIMUM_PASSWORD_LENGTH}-${MAXIMUM_PASSWORD_LENGTH} characters.`,
    );
  }
  return value;
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  try {
    await runM3PreviewAcceptanceSmoke(readM3PreviewAcceptanceEnvironment());
    console.log(
      "m3-preview acceptance smoke passed: auth, permission deny-by-default and tasks persistence/toggle.",
    );
  } catch {
    console.error("m3-preview acceptance smoke failed.");
    process.exitCode = 1;
  }
}
