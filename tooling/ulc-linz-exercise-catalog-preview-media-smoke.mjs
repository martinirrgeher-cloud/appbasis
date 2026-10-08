import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const EXPECTED_DATABASE = "appbasis_ulc_linz_preview";
const EXPECTED_APPLICATION_ROLE = "appbasis_ulc_linz_preview_application";
const EXPECTED_WORKER = "appbasis-ulc-linz";
const ROOT_USERNAME = "appbasis.preview.root";
const PREVIEW_USERNAME = "preview.admin";
const PREVIEW_ORGANIZATION_ID = "ulc-linz-preview";
const MAX_PRIVATE_VIDEO_BYTES = 100 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 15_000;
const SMOKE_VIDEO_BYTES = Uint8Array.from([
  0x00, 0x00, 0x00, 0x18,
  0x66, 0x74, 0x79, 0x70,
  0x69, 0x73, 0x6f, 0x6d,
  0x00, 0x00, 0x02, 0x00,
  0x69, 0x73, 0x6f, 0x6d,
  0x69, 0x73, 0x6f, 0x32,
]);

export class UlcExerciseCatalogPreviewMediaSmokeError extends Error {
  constructor(message) {
    super(message);
    this.name = "UlcExerciseCatalogPreviewMediaSmokeError";
  }
}

export async function verifyUlcExerciseCatalogPreviewMediaSmoke(
  {
    baseURL,
    databaseUrl,
    betterAuthSecret,
    rootAdminPassword,
    correlationId = randomBytes(8).toString("hex"),
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = globalThis.fetch,
  } = {},
  dependencies = {},
) {
  const origin = requiredPreviewOrigin(baseURL);
  const connectionString = requiredPreviewDatabaseUrl(databaseUrl);
  const secret = requiredSecret(betterAuthSecret);
  const rootPassword = requiredPassword(rootAdminPassword);
  const correlation = requiredCorrelationId(correlationId);
  const timeout = requiredTimeout(timeoutMs);
  if (typeof fetchImpl !== "function") {
    throw new UlcExerciseCatalogPreviewMediaSmokeError(
      "ULC E6H private-media smoke fetch transport is invalid.",
    );
  }

  const createSession =
    dependencies.createSession ?? createPreviewAdminImpersonationSession;
  if (typeof createSession !== "function") {
    throw new UlcExerciseCatalogPreviewMediaSmokeError(
      "ULC E6H private-media smoke session provider is invalid.",
    );
  }

  const fileName = `appbasis-e6h-media-smoke-${correlation}.mp4`;
  const session = await createSession(
    {
      baseURL: origin,
      databaseUrl: connectionString,
      betterAuthSecret: secret,
      rootAdminPassword: rootPassword,
    },
    dependencies.sessionDependencies,
  );
  if (
    session === null ||
    typeof session !== "object" ||
    typeof session.cookie !== "string" ||
    session.cookie.trim().length === 0 ||
    /[\r\n]/u.test(session.cookie) ||
    typeof session.close !== "function"
  ) {
    throw new UlcExerciseCatalogPreviewMediaSmokeError(
      "ULC E6H private-media smoke session provider returned an invalid session.",
    );
  }

  let exerciseId = null;
  let mediaId = null;
  let deleted = false;
  let result = null;
  let primaryError = null;
  const cleanupErrors = [];

  try {
    const identity = await requestJson({
      fetchImpl,
      url: origin + "/api/auth/session",
      method: "GET",
      cookie: session.cookie,
      timeoutMs: timeout,
      expectedStatus: 200,
      label: "preview identity session",
    });
    requireFullPreviewAdminIdentity(identity);

    const catalogPayload = await requestJson({
      fetchImpl,
      url: origin + "/api/modules/exercise-catalog",
      method: "GET",
      cookie: session.cookie,
      timeoutMs: timeout,
      expectedStatus: 200,
      label: "exercise catalog",
    });
    exerciseId = selectExerciseId(catalogPayload);

    const privateMediaPath =
      "/api/modules/exercise-catalog/" +
      encodeURIComponent(exerciseId) +
      "/private-media";
    const beforePayload = await requestJson({
      fetchImpl,
      url: origin + privateMediaPath,
      method: "GET",
      cookie: session.cookie,
      timeoutMs: timeout,
      expectedStatus: 200,
      label: "private-media list before upload",
    });
    requirePrivateMediaCapability(beforePayload);

    const uploadedPayload = await requestJson({
      fetchImpl,
      url: origin + privateMediaPath,
      method: "POST",
      cookie: session.cookie,
      timeoutMs: timeout,
      expectedStatus: 201,
      label: "private-media upload",
      headers: {
        "content-type": "video/mp4",
        "x-appbasis-file-name": fileName,
      },
      body: SMOKE_VIDEO_BYTES,
    });
    mediaId = requireUploadedMedia(uploadedPayload, fileName);

    const afterUploadPayload = await requestJson({
      fetchImpl,
      url: origin + privateMediaPath,
      method: "GET",
      cookie: session.cookie,
      timeoutMs: timeout,
      expectedStatus: 200,
      label: "private-media list after upload",
    });
    requireUploadedMediaListed(afterUploadPayload, mediaId, fileName);

    const contentPath =
      privateMediaPath +
      "/" +
      encodeURIComponent(mediaId) +
      "/content";
    const fullResponse = await timedFetch(fetchImpl, origin + contentPath, {
      method: "GET",
      headers: {
        accept: "video/mp4",
        cookie: session.cookie,
      },
      timeoutMs: timeout,
    });
    requirePrivateMediaContentHeaders(
      fullResponse,
      200,
      SMOKE_VIDEO_BYTES.byteLength,
      fileName,
    );
    const fullBytes = new Uint8Array(await fullResponse.arrayBuffer());
    requireExactBytes(fullBytes, SMOKE_VIDEO_BYTES, "full private-media download");

    const rangeResponse = await timedFetch(fetchImpl, origin + contentPath, {
      method: "GET",
      headers: {
        accept: "video/mp4",
        cookie: session.cookie,
        range: "bytes=0-7",
      },
      timeoutMs: timeout,
    });
    requirePrivateMediaContentHeaders(rangeResponse, 206, 8, fileName);
    const expectedContentRange =
      "bytes 0-7/" + String(SMOKE_VIDEO_BYTES.byteLength);
    if (rangeResponse.headers.get("content-range") !== expectedContentRange) {
      throw new UlcExerciseCatalogPreviewMediaSmokeError(
        "ULC E6H private-media range response is invalid.",
      );
    }
    const rangeBytes = new Uint8Array(await rangeResponse.arrayBuffer());
    requireExactBytes(
      rangeBytes,
      SMOKE_VIDEO_BYTES.slice(0, 8),
      "ranged private-media download",
    );

    const deletePayload = await requestJson({
      fetchImpl,
      url:
        origin +
        privateMediaPath +
        "/" +
        encodeURIComponent(mediaId),
      method: "DELETE",
      cookie: session.cookie,
      timeoutMs: timeout,
      expectedStatus: 200,
      label: "private-media delete",
    });
    if (!isRecord(deletePayload) || deletePayload.deleted !== true) {
      throw new UlcExerciseCatalogPreviewMediaSmokeError(
        "ULC E6H private-media delete returned an unexpected payload.",
      );
    }
    deleted = true;

    const afterDeletePayload = await requestJson({
      fetchImpl,
      url: origin + privateMediaPath,
      method: "GET",
      cookie: session.cookie,
      timeoutMs: timeout,
      expectedStatus: 200,
      label: "private-media list after delete",
    });
    requireMediaAbsent(afterDeletePayload, mediaId, fileName);

    const deletedContentResponse = await timedFetch(
      fetchImpl,
      origin + contentPath,
      {
        method: "GET",
        headers: {
          accept: "video/mp4",
          cookie: session.cookie,
        },
        timeoutMs: timeout,
      },
    );
    if (deletedContentResponse.status !== 404) {
      throw new UlcExerciseCatalogPreviewMediaSmokeError(
        "ULC E6H deleted private-media content remained reachable.",
      );
    }

    result = Object.freeze({
      status: "preview-private-media-verified",
      exerciseId,
      uploadedBytes: SMOKE_VIDEO_BYTES.byteLength,
      rangeBytes: 8,
      deleted: true,
      productionChanged: false,
    });
  } catch (error) {
    primaryError =
      error instanceof Error
        ? error
        : new UlcExerciseCatalogPreviewMediaSmokeError(
            "ULC E6H private-media smoke failed.",
          );
  }

  if (exerciseId !== null && !deleted) {
    try {
      await cleanupSmokeMedia({
        fetchImpl,
        origin,
        cookie: session.cookie,
        exerciseId,
        fileName,
        timeoutMs: timeout,
      });
    } catch (error) {
      cleanupErrors.push(
        error instanceof Error
          ? error
          : new Error("ULC E6H private-media smoke cleanup failed."),
      );
    }
  }

  try {
    await session.close();
  } catch (error) {
    cleanupErrors.push(
      error instanceof Error
        ? error
        : new Error("ULC E6H private-media smoke session cleanup failed."),
    );
  }

  if (primaryError !== null) {
    if (cleanupErrors.length === 0) throw primaryError;
    throw new AggregateError(
      [primaryError, ...cleanupErrors],
      "ULC E6H private-media smoke failed and cleanup was incomplete.",
    );
  }
  if (cleanupErrors.length !== 0) {
    throw new AggregateError(
      cleanupErrors,
      "ULC E6H private-media smoke cleanup was incomplete.",
    );
  }
  return result;
}

export async function createPreviewAdminImpersonationSession(
  {
    baseURL,
    databaseUrl,
    betterAuthSecret,
    rootAdminPassword,
  },
  dependencies = {},
) {
  const createDatabase =
    dependencies.createDatabase ??
    (await import("../packages/database/src/node-runtime.mjs"))
      .createPostgresDatabase;
  const createAuthRuntime =
    dependencies.createAuthRuntime ??
    (await import("../packages/identity/src/better-auth.ts"))
      .createBetterAuthRuntime;
  const Backend =
    dependencies.BetterAuthIdentityBackend ??
    (await import("../packages/identity/src/server.ts"))
      .BetterAuthIdentityBackend;

  if (
    typeof createDatabase !== "function" ||
    typeof createAuthRuntime !== "function" ||
    typeof Backend !== "function"
  ) {
    throw new UlcExerciseCatalogPreviewMediaSmokeError(
      "ULC E6H private-media smoke identity dependencies are invalid.",
    );
  }

  const connection = createDatabase(databaseUrl);
  let backend = null;
  let rootSession = null;
  let impersonatedCookie = null;

  try {
    const auth = createAuthRuntime({
      database: connection.database,
      baseURL,
      secret: betterAuthSecret,
    });
    backend = new Backend({
      auth,
      sql: connection.client,
      baseURL,
    });
    rootSession = await backend.signInWithUsername({
      username: ROOT_USERNAME,
      password: rootAdminPassword,
    });

    const rows = await connection.client.unsafe(
      `SELECT u.id,
              u.role,
              u.banned,
              s.must_change_password,
              m.organization_id,
              m.source_role,
              m.active
       FROM "user" u
       JOIN appbasis_identity_security_state s
         ON s.identity_id = u.id
       JOIN ulc_linz_membership m
         ON m.identity_id = u.id
       WHERE u.username = $1`,
      [PREVIEW_USERNAME],
    );
    if (!Array.isArray(rows) || rows.length !== 1) {
      throw new UlcExerciseCatalogPreviewMediaSmokeError(
        "ULC E6H preview administrator identity is unavailable.",
      );
    }
    const preview = rows[0];
    if (
      typeof preview?.id !== "string" ||
      preview.id.length === 0 ||
      preview.role !== "user" ||
      preview.banned === true ||
      preview.must_change_password !== false ||
      preview.organization_id !== PREVIEW_ORGANIZATION_ID ||
      preview.source_role !== "admin" ||
      preview.active !== true
    ) {
      throw new UlcExerciseCatalogPreviewMediaSmokeError(
        "ULC E6H preview administrator is not in the required full-access state.",
      );
    }

    const response = await auth.handler(
      new Request(baseURL + "/api/auth/admin/impersonate-user", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: rootSession.sessionToken,
          origin: baseURL,
        },
        body: JSON.stringify({ userId: preview.id }),
      }),
    );
    if (!response.ok) {
      throw new UlcExerciseCatalogPreviewMediaSmokeError(
        "ULC E6H preview administrator impersonation failed.",
      );
    }
    impersonatedCookie = sessionCookie(response);

    return Object.freeze({
      cookie: impersonatedCookie,
      async close() {
        const errors = [];
        if (backend !== null && impersonatedCookie !== null) {
          try {
            await backend.endSession(impersonatedCookie);
          } catch (error) {
            errors.push(error);
          }
          impersonatedCookie = null;
        }
        if (backend !== null && rootSession !== null) {
          try {
            await backend.endSession(rootSession.sessionToken);
          } catch (error) {
            errors.push(error);
          }
          rootSession = null;
        }
        try {
          await connection.client.end();
        } catch (error) {
          errors.push(error);
        }
        if (errors.length !== 0) {
          throw new AggregateError(
            errors,
            "ULC E6H preview administrator impersonation cleanup failed.",
          );
        }
      },
    });
  } catch (error) {
    if (backend !== null && impersonatedCookie !== null) {
      await backend.endSession(impersonatedCookie).catch(() => {});
    }
    if (backend !== null && rootSession !== null) {
      await backend.endSession(rootSession.sessionToken).catch(() => {});
    }
    await connection.client.end().catch(() => {});
    throw error;
  }
}

async function cleanupSmokeMedia({
  fetchImpl,
  origin,
  cookie,
  exerciseId,
  fileName,
  timeoutMs,
}) {
  const basePath =
    "/api/modules/exercise-catalog/" +
    encodeURIComponent(exerciseId) +
    "/private-media";
  const payload = await requestJson({
    fetchImpl,
    url: origin + basePath,
    method: "GET",
    cookie,
    timeoutMs,
    expectedStatus: 200,
    label: "private-media cleanup list",
  });
  if (!isRecord(payload) || !Array.isArray(payload.media)) {
    throw new UlcExerciseCatalogPreviewMediaSmokeError(
      "ULC E6H private-media cleanup list is invalid.",
    );
  }
  const targets = payload.media.filter(
    (entry) =>
      isRecord(entry) &&
      entry.fileName === fileName &&
      typeof entry.id === "string" &&
      entry.id.length > 0,
  );
  for (const target of targets) {
    const response = await timedFetch(
      fetchImpl,
      origin + basePath + "/" + encodeURIComponent(target.id),
      {
        method: "DELETE",
        headers: { cookie },
        timeoutMs,
      },
    );
    if (response.status !== 200 && response.status !== 404) {
      throw new UlcExerciseCatalogPreviewMediaSmokeError(
        "ULC E6H private-media cleanup delete failed.",
      );
    }
  }
}

function requireFullPreviewAdminIdentity(payload) {
  if (
    !isRecord(payload) ||
    !isRecord(payload.identity) ||
    payload.identity.username !== PREVIEW_USERNAME ||
    payload.identity.mustChangePassword !== false ||
    payload.identity.accountStatus !== "active" ||
    payload.access !== "full"
  ) {
    throw new UlcExerciseCatalogPreviewMediaSmokeError(
      "ULC E6H preview administrator session is not full-access.",
    );
  }
}

function selectExerciseId(payload) {
  if (
    !isRecord(payload) ||
    !isRecord(payload.module) ||
    payload.module.moduleId !== "exercise_catalog" ||
    !isRecord(payload.module.features) ||
    payload.module.features.privateVideoUpload !== true ||
    !isRecord(payload.access) ||
    payload.access.edit !== true ||
    !isRecord(payload.catalog) ||
    !Array.isArray(payload.catalog.items)
  ) {
    throw new UlcExerciseCatalogPreviewMediaSmokeError(
      "ULC E6H exercise catalog is not private-media ready.",
    );
  }
  const candidates = payload.catalog.items.filter(
    (item) =>
      isRecord(item) &&
      typeof item.id === "string" &&
      item.id.length > 0 &&
      item.isActive !== false,
  );
  if (candidates.length === 0) {
    throw new UlcExerciseCatalogPreviewMediaSmokeError(
      "ULC E6H private-media smoke requires an existing active exercise.",
    );
  }
  candidates.sort((left, right) => left.id.localeCompare(right.id));
  return candidates[0].id;
}

function requirePrivateMediaCapability(payload) {
  if (
    !isRecord(payload) ||
    payload.available !== true ||
    payload.maximumBytes !== MAX_PRIVATE_VIDEO_BYTES ||
    !Array.isArray(payload.media)
  ) {
    throw new UlcExerciseCatalogPreviewMediaSmokeError(
      "ULC E6H private-media capability is unavailable.",
    );
  }
}

function requireUploadedMedia(payload, fileName) {
  if (!isRecord(payload) || !isRecord(payload.media)) {
    throw new UlcExerciseCatalogPreviewMediaSmokeError(
      "ULC E6H private-media upload returned an invalid payload.",
    );
  }
  const media = payload.media;
  if (
    typeof media.id !== "string" ||
    media.id.length === 0 ||
    media.fileName !== fileName ||
    media.contentType !== "video/mp4" ||
    media.sizeBytes !== SMOKE_VIDEO_BYTES.byteLength
  ) {
    throw new UlcExerciseCatalogPreviewMediaSmokeError(
      "ULC E6H private-media upload metadata is invalid.",
    );
  }
  return media.id;
}

function requireUploadedMediaListed(payload, mediaId, fileName) {
  requirePrivateMediaCapability(payload);
  const match = payload.media.find(
    (entry) =>
      isRecord(entry) &&
      entry.id === mediaId &&
      entry.fileName === fileName &&
      entry.contentType === "video/mp4" &&
      entry.sizeBytes === SMOKE_VIDEO_BYTES.byteLength,
  );
  if (match === undefined) {
    throw new UlcExerciseCatalogPreviewMediaSmokeError(
      "ULC E6H uploaded private media was not listed.",
    );
  }
}

function requireMediaAbsent(payload, mediaId, fileName) {
  requirePrivateMediaCapability(payload);
  if (
    payload.media.some(
      (entry) =>
        isRecord(entry) &&
        (entry.id === mediaId || entry.fileName === fileName),
    )
  ) {
    throw new UlcExerciseCatalogPreviewMediaSmokeError(
      "ULC E6H deleted private media remained listed.",
    );
  }
}

function requirePrivateMediaContentHeaders(
  response,
  expectedStatus,
  expectedLength,
  fileName,
) {
  if (
    !(response instanceof Response) ||
    response.status !== expectedStatus ||
    response.headers.get("content-type") !== "video/mp4" ||
    response.headers.get("cache-control") !== "private, no-store" ||
    response.headers.get("accept-ranges") !== "bytes" ||
    response.headers.get("x-content-type-options") !== "nosniff" ||
    response.headers.get("content-length") !== String(expectedLength)
  ) {
    throw new UlcExerciseCatalogPreviewMediaSmokeError(
      "ULC E6H private-media content response headers are invalid.",
    );
  }
  const disposition = response.headers.get("content-disposition") ?? "";
  if (!disposition.includes(encodeURIComponent(fileName))) {
    throw new UlcExerciseCatalogPreviewMediaSmokeError(
      "ULC E6H private-media content disposition is invalid.",
    );
  }
}

function requireExactBytes(actual, expected, label) {
  if (
    actual.byteLength !== expected.byteLength ||
    actual.some((value, index) => value !== expected[index])
  ) {
    throw new UlcExerciseCatalogPreviewMediaSmokeError(
      "ULC E6H " + label + " bytes are invalid.",
    );
  }
}

async function requestJson({
  fetchImpl,
  url,
  method,
  cookie,
  timeoutMs,
  expectedStatus,
  label,
  headers = {},
  body,
}) {
  const response = await timedFetch(fetchImpl, url, {
    method,
    headers: {
      accept: "application/json",
      cookie,
      ...headers,
    },
    ...(body === undefined ? {} : { body }),
    timeoutMs,
  });
  if (response.status !== expectedStatus) {
    throw new UlcExerciseCatalogPreviewMediaSmokeError(
      "ULC E6H " + label + " returned status " + String(response.status) + ".",
    );
  }
  try {
    return await response.json();
  } catch {
    throw new UlcExerciseCatalogPreviewMediaSmokeError(
      "ULC E6H " + label + " returned invalid JSON.",
    );
  }
}

async function timedFetch(
  fetchImpl,
  url,
  { method, headers, body, timeoutMs },
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method,
      headers,
      ...(body === undefined ? {} : { body }),
      redirect: "error",
      signal: controller.signal,
    });
    if (!(response instanceof Response)) {
      throw new UlcExerciseCatalogPreviewMediaSmokeError(
        "ULC E6H private-media smoke received an invalid response.",
      );
    }
    return response;
  } finally {
    clearTimeout(timer);
  }
}

function sessionCookie(response) {
  const cookie = response.headers.get("set-cookie");
  if (cookie === null || cookie.trim().length === 0) {
    throw new UlcExerciseCatalogPreviewMediaSmokeError(
      "ULC E6H preview impersonation returned no session cookie.",
    );
  }
  const pair = cookie.split(";", 1)[0] ?? "";
  if (pair.length === 0 || /[\r\n]/u.test(pair)) {
    throw new UlcExerciseCatalogPreviewMediaSmokeError(
      "ULC E6H preview impersonation returned an invalid session cookie.",
    );
  }
  return pair;
}

function requiredPreviewDatabaseUrl(value) {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
    throw new UlcExerciseCatalogPreviewMediaSmokeError(
      "APPBASIS_DATABASE_URL must be canonical.",
    );
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new UlcExerciseCatalogPreviewMediaSmokeError(
      "APPBASIS_DATABASE_URL must be a PostgreSQL URL.",
    );
  }
  if (
    (url.protocol !== "postgres:" && url.protocol !== "postgresql:") ||
    url.hostname.length === 0 ||
    url.hostname.includes("-pooler") ||
    decodeURIComponent(url.username) !== EXPECTED_APPLICATION_ROLE ||
    decodeURIComponent(url.pathname.slice(1)) !== EXPECTED_DATABASE ||
    url.searchParams.get("sslmode") !== "require"
  ) {
    throw new UlcExerciseCatalogPreviewMediaSmokeError(
      "APPBASIS_DATABASE_URL must select the exact direct ULC preview application role.",
    );
  }
  return value;
}

function requiredPreviewOrigin(value) {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
    throw new UlcExerciseCatalogPreviewMediaSmokeError(
      "APPBASIS_GENERATED_PREVIEW_URL must be canonical.",
    );
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new UlcExerciseCatalogPreviewMediaSmokeError(
      "APPBASIS_GENERATED_PREVIEW_URL must be a canonical HTTPS origin.",
    );
  }
  if (
    url.protocol !== "https:" ||
    !url.hostname.startsWith(EXPECTED_WORKER + ".") ||
    !url.hostname.endsWith(".workers.dev") ||
    url.username.length !== 0 ||
    url.password.length !== 0 ||
    (url.pathname !== "" && url.pathname !== "/") ||
    url.search.length !== 0 ||
    url.hash.length !== 0
  ) {
    throw new UlcExerciseCatalogPreviewMediaSmokeError(
      "APPBASIS_GENERATED_PREVIEW_URL must select the exact ULC preview Worker.",
    );
  }
  return url.origin;
}

function requiredSecret(value) {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length < 32
  ) {
    throw new UlcExerciseCatalogPreviewMediaSmokeError(
      "APPBASIS_BETTER_AUTH_SECRET is invalid.",
    );
  }
  return value;
}

function requiredPassword(value) {
  if (
    typeof value !== "string" ||
    value.length < 8 ||
    value.length > 128 ||
    value.trim().length === 0 ||
    /[\r\n]/u.test(value)
  ) {
    throw new UlcExerciseCatalogPreviewMediaSmokeError(
      "APPBASIS_ROOT_ADMIN_PASSWORD is invalid.",
    );
  }
  return value;
}

function requiredCorrelationId(value) {
  if (typeof value !== "string" || !/^[a-f0-9]{16}$/.test(value)) {
    throw new UlcExerciseCatalogPreviewMediaSmokeError(
      "ULC E6H private-media smoke correlation id is invalid.",
    );
  }
  return value;
}

function requiredTimeout(value) {
  if (!Number.isInteger(value) || value <= 0 || value > 30_000) {
    throw new UlcExerciseCatalogPreviewMediaSmokeError(
      "ULC E6H private-media smoke timeout is invalid.",
    );
  }
  return value;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isMainModule() {
  if (typeof process.argv[1] !== "string") return false;
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMainModule()) {
  try {
    const result = await verifyUlcExerciseCatalogPreviewMediaSmoke({
      baseURL: process.env.APPBASIS_GENERATED_PREVIEW_URL,
      databaseUrl: process.env.APPBASIS_DATABASE_URL,
      betterAuthSecret: process.env.APPBASIS_BETTER_AUTH_SECRET,
      rootAdminPassword: process.env.APPBASIS_ROOT_ADMIN_PASSWORD,
    });
    process.stdout.write(JSON.stringify(result) + "\n");
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "ULC E6H private-media smoke failed.",
    );
    process.exitCode = 1;
  }
}
