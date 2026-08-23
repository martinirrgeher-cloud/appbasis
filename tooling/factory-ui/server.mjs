import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createAppSkeleton } from "../create-app.mjs";
import { loadFactorySnapshot } from "./model.mjs";

const FACTORY_UI_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPOSITORY_ROOT = resolve(FACTORY_UI_DIRECTORY, "../..");
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4174;
const MAX_CREATE_REQUEST_BYTES = 64 * 1024;
const MAX_FACTORY_APP_ID_LENGTH = 63;
const LOOPBACK_ORIGIN_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const CREATE_APP_KEYS = new Set([
  "appId",
  "displayName",
  "modules",
  "platformServices",
]);
const FACTORY_DOCUMENT_SECURITY_HEADERS = Object.freeze({
  "content-security-policy": "frame-ancestors 'none'",
  "x-frame-options": "DENY",
});

const STATIC_ROUTES = new Map([
  ["/", { path: join(FACTORY_UI_DIRECTORY, "index.html"), contentType: "text/html; charset=utf-8" }],
  ["/app.js", { path: join(FACTORY_UI_DIRECTORY, "app.js"), contentType: "text/javascript; charset=utf-8" }],
  ["/create-app.js", { path: join(FACTORY_UI_DIRECTORY, "create-app.js"), contentType: "text/javascript; charset=utf-8" }],
  ["/fc1-lifecycle-card-status.mjs", { path: join(FACTORY_UI_DIRECTORY, "fc1-lifecycle-card-status.mjs"), contentType: "text/javascript; charset=utf-8" }],
  ["/production-readiness-status.js", { path: join(FACTORY_UI_DIRECTORY, "production-readiness-status.js"), contentType: "text/javascript; charset=utf-8" }],
  ["/production-readiness.mjs", { path: join(FACTORY_UI_DIRECTORY, "production-readiness.mjs"), contentType: "text/javascript; charset=utf-8" }],
  ["/production-release-readiness.mjs", { path: join(FACTORY_UI_DIRECTORY, "production-release-readiness.mjs"), contentType: "text/javascript; charset=utf-8" }],
  ["/preview-theme.mjs", { path: join(FACTORY_UI_DIRECTORY, "preview-theme.mjs"), contentType: "text/javascript; charset=utf-8" }],
  ["/styles.css", { path: join(FACTORY_UI_DIRECTORY, "styles.css"), contentType: "text/css; charset=utf-8" }],
  ["/target-flow.css", { path: join(FACTORY_UI_DIRECTORY, "target-flow.css"), contentType: "text/css; charset=utf-8" }],
  ["/foundation.css", { path: join(DEFAULT_REPOSITORY_ROOT, "packages/ui/foundation.css"), contentType: "text/css; charset=utf-8" }],
  ["/tokens.css", { path: join(DEFAULT_REPOSITORY_ROOT, "packages/ui/tokens.css"), contentType: "text/css; charset=utf-8" }],
]);

export function createFactoryServer(options = {}) {
  const repositoryRoot = resolve(options.repositoryRoot ?? DEFAULT_REPOSITORY_ROOT);
  const snapshotOptions = {
    m3PreviewAcceptanceFetchImpl: options.m3PreviewAcceptanceFetchImpl,
  };

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? DEFAULT_HOST}`);

      if (url.pathname === "/api/factory/apps" && request.method === "POST") {
        await handleCreateAppRequest(
          request,
          response,
          repositoryRoot,
          snapshotOptions,
        );
        return;
      }

      if (request.method !== "GET" && request.method !== "HEAD") {
        respondJson(response, 405, { error: { code: "METHOD_NOT_ALLOWED" } }, request.method === "HEAD");
        return;
      }

      if (url.pathname === "/api/factory/snapshot") {
        const snapshot = await loadFactorySnapshot(repositoryRoot, snapshotOptions);
        respondJson(response, 200, snapshot, request.method === "HEAD");
        return;
      }

      const staticRoute = STATIC_ROUTES.get(url.pathname);
      if (staticRoute === undefined) {
        respondJson(response, 404, { error: { code: "NOT_FOUND" } }, request.method === "HEAD");
        return;
      }

      const body = await readFile(staticRoute.path);
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": staticRoute.contentType,
        "x-content-type-options": "nosniff",
        ...FACTORY_DOCUMENT_SECURITY_HEADERS,
      });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch {
      respondJson(
        response,
        500,
        { error: { code: "FACTORY_SNAPSHOT_UNAVAILABLE" } },
        request.method === "HEAD",
      );
    }
  });
}

export async function startFactoryServer(options = {}) {
  const host = options.host ?? DEFAULT_HOST;
  const port = options.port ?? DEFAULT_PORT;
  const server = createFactoryServer(options);

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, host, () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });

  return server;
}

async function handleCreateAppRequest(
  request,
  response,
  repositoryRoot,
  snapshotOptions,
) {
  if (!hasValidFactoryOrigin(request)) {
    respondJson(response, 403, {
      error: {
        code: "INVALID_REQUEST_ORIGIN",
        message: "App creation is only accepted from this local Factory page.",
      },
    });
    return;
  }

  if (!hasJsonContentType(request)) {
    respondJson(response, 415, {
      error: {
        code: "UNSUPPORTED_MEDIA_TYPE",
        message: "App creation requires application/json.",
      },
    });
    return;
  }

  let input;
  try {
    input = await readCreateAppInput(request);
  } catch (error) {
    if (error instanceof FactoryRequestError) {
      respondJson(response, error.status, {
        error: { code: error.code, message: error.message },
      });
      return;
    }
    respondJson(response, 500, {
      error: {
        code: "APP_CREATION_FAILED",
        message: "The app creation request could not be processed. No deployment was started.",
      },
    });
    return;
  }

  try {
    await loadFactorySnapshot(repositoryRoot, snapshotOptions);
  } catch {
    respondJson(response, 503, {
      error: {
        code: "FACTORY_STATE_UNAVAILABLE",
        message: "The current repository state could not be read safely. No app was created.",
      },
    });
    return;
  }

  try {
    const result = await createAppSkeleton(input, { repositoryRoot });
    respondJson(response, 201, {
      app: result.definition,
      relativeDestination: result.relativeDestination,
    });
  } catch (error) {
    const mapped = mapCreateAppError(error);
    respondJson(response, mapped.status, {
      error: { code: mapped.code, message: mapped.message },
    });
  }
}

function hasValidFactoryOrigin(request) {
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (typeof origin !== "string" || typeof host !== "string") return false;

  let parsedOrigin;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    return false;
  }

  if (parsedOrigin.protocol !== "http:") return false;
  if (!LOOPBACK_ORIGIN_HOSTS.has(parsedOrigin.hostname)) return false;

  let parsedRequestOrigin;
  try {
    parsedRequestOrigin = new URL(`http://${host}`);
  } catch {
    return false;
  }

  return (
    LOOPBACK_ORIGIN_HOSTS.has(parsedRequestOrigin.hostname) &&
    parsedOrigin.host === parsedRequestOrigin.host
  );
}

function hasJsonContentType(request) {
  const contentType = request.headers["content-type"];
  if (typeof contentType !== "string") return false;
  return contentType.split(";", 1)[0].trim().toLowerCase() === "application/json";
}

async function readCreateAppInput(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_CREATE_REQUEST_BYTES) {
      throw new FactoryRequestError(
        413,
        "REQUEST_TOO_LARGE",
        "App creation request is too large.",
      );
    }
    chunks.push(chunk);
  }

  let parsed;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new FactoryRequestError(400, "INVALID_JSON", "App creation request is not valid JSON.");
  }

  return validateCreateAppInput(parsed);
}

function validateCreateAppInput(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw invalidAppRequest();
  }
  if (Object.keys(input).some((key) => !CREATE_APP_KEYS.has(key))) {
    throw invalidAppRequest();
  }

  const { appId, displayName, modules, platformServices } = input;
  if (
    typeof appId !== "string" ||
    appId.length > MAX_FACTORY_APP_ID_LENGTH ||
    !/^[a-z][a-z0-9-]{1,62}$/.test(appId) ||
    typeof displayName !== "string" ||
    displayName.trim().length === 0 ||
    !Array.isArray(modules) ||
    !modules.every((value) => typeof value === "string") ||
    !Array.isArray(platformServices) ||
    !platformServices.every((value) => typeof value === "string")
  ) {
    throw invalidAppRequest();
  }

  return { appId, displayName, modules, platformServices };
}

function invalidAppRequest() {
  return new FactoryRequestError(
    400,
    "INVALID_APP_REQUEST",
    "App creation request does not match the supported Factory contract.",
  );
}

function mapCreateAppError(error) {
  if (error?.code === "EEXIST") {
    return {
      status: 409,
      code: "APP_ALREADY_EXISTS",
      message: "An app with this ID already exists. No deployment was started.",
    };
  }
  return {
    status: 400,
    code: "APP_CREATION_FAILED",
    message: error instanceof Error ? error.message : "App creation failed. No deployment was started.",
  };
}

function respondJson(response, status, payload, headOnly = false) {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
    ...FACTORY_DOCUMENT_SECURITY_HEADERS,
  });
  response.end(headOnly ? undefined : `${JSON.stringify(payload)}\n`);
}

class FactoryRequestError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
