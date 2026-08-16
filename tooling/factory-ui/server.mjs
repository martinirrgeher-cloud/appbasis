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
  ["/production-readiness-status.js", { path: join(FACTORY_UI_DIRECTORY, "production-readiness-status.js"), contentType: "text/javascript; charset=utf-8" }],
  ["/production-readiness.mjs", { path: join(FACTORY_UI_DIRECTORY, "production-readiness.mjs"), contentType: "text/javascript; charset=utf-8" }],
  ["/preview-theme.mjs", { path: join(FACTORY_UI_DIRECTORY, "preview-theme.mjs"), contentType: "text/javascript; charset=utf-8" }],
  ["/styles.css", { path: join(FACTORY_UI_DIRECTORY, "styles.css"), contentType: "text/css; charset=utf-8" }],
  ["/target-flow.css", { path: join(FACTORY_UI_DIRECTORY, "target-flow.css"), contentType: "text/css; charset=utf-8" }],
  ["/foundation.css", { path: join(DEFAULT_REPOSITORY_ROOT, "packages/ui/foundation.css"), contentType: "text/css; charset=utf-8" }],
  ["/tokens.css", { path: join(DEFAULT_REPOSITORY_ROOT, "packages/ui/tokens.css"), contentType: "text/css; charset=utf-8" }],
]);

export function createFactoryServer(options = {}) {
  const repositoryRoot = resolve(options.repositoryRoot ?? DEFAULT_REPOSITORY_ROOT);

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? DEFAULT_HOST}`);

      if (url.pathname === "/api/factory/apps" && request.method === "POST") {
        await handleCreateAppRequest(request, response, repositoryRoot);
        return;
      }

      if (request.method !== "GET" && request.method !== "HEAD") {
        respondJson(response, 405, { error: { code: "METHOD_NOT_ALLOWED" } }, request.method === "HEAD");
        return;
      }

      if (url.pathname === "/api/factory/snapshot") {
        const snapshot = await loadFactorySnapshot(repositoryRoot);
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

async function handleCreateAppRequest(request, response, repositoryRoot) {
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
    await loadFactorySnapshot(repositoryRoot);
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
  return isValidFactoryOrigin({
    localAddress: request.socket.localAddress,
    localPort: request.socket.localPort,
    originHeader: request.headers.origin,
  });
}

export function isValidFactoryOrigin({ localAddress, localPort, originHeader }) {
  if (!isLoopbackAddress(localAddress)) return false;
  if (!Number.isInteger(localPort)) return false;
  if (typeof originHeader !== "string") return false;

  let origin;
  try {
    origin = new URL(originHeader);
  } catch {
    return false;
  }

  const originPort = origin.port === "" && origin.protocol === "http:"
    ? 80
    : Number(origin.port);

  return (
    origin.protocol === "http:" &&
    LOOPBACK_ORIGIN_HOSTS.has(origin.hostname) &&
    originPort === localPort &&
    origin.origin === originHeader
  );
}

function isLoopbackAddress(address) {
  return (
    address === "127.0.0.1" ||
    address === "::1" ||
    address === "::ffff:127.0.0.1"
  );
}

function hasJsonContentType(request) {
  const contentType = request.headers["content-type"];
  if (typeof contentType !== "string") return false;
  return contentType.split(";", 1)[0].trim().toLowerCase() === "application/json";
}

async function readCreateAppInput(request) {
  const chunks = [];
  let bytes = 0;
  let tooLarge = false;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_CREATE_REQUEST_BYTES) {
      tooLarge = true;
      continue;
    }
    chunks.push(buffer);
  }

  if (tooLarge) {
    throw new FactoryRequestError(
      413,
      "REQUEST_TOO_LARGE",
      "App creation request is too large.",
    );
  }

  let value;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new FactoryRequestError(
      400,
      "INVALID_JSON",
      "App creation request must contain valid JSON.",
    );
  }

  if (!isPlainObject(value)) {
    throw new FactoryRequestError(
      400,
      "INVALID_APP_REQUEST",
      "App creation request must be a JSON object.",
    );
  }

  for (const key of Object.keys(value)) {
    if (!CREATE_APP_KEYS.has(key)) {
      throw new FactoryRequestError(
        400,
        "INVALID_APP_REQUEST",
        `Unknown app creation field: ${key}.`,
      );
    }
  }

  if (
    typeof value.appId === "string" &&
    value.appId.length > MAX_FACTORY_APP_ID_LENGTH
  ) {
    throw new FactoryRequestError(
      400,
      "INVALID_APP_REQUEST",
      `App-ID must contain at most ${MAX_FACTORY_APP_ID_LENGTH} characters.`,
    );
  }

  return value;
}

function mapCreateAppError(error) {
  const message = error instanceof Error ? error.message : "";

  if (message.startsWith("App destination already exists:")) {
    return {
      status: 409,
      code: "APP_ALREADY_EXISTS",
      message: "An app with this App-ID already exists.",
    };
  }

  if (
    message.startsWith("App definition ") ||
    message.startsWith("Unknown AppBasis module:") ||
    message.includes(" references unsupported platform service ") ||
    message === "Generated permissions runtime requires the identity platform service."
  ) {
    return {
      status: 400,
      code: "INVALID_APP_REQUEST",
      message,
    };
  }

  return {
    status: 500,
    code: "APP_CREATION_FAILED",
    message: "The app skeleton could not be created. No deployment was started.",
  };
}

function isPlainObject(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

class FactoryRequestError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function respondJson(response, status, value, headOnly = false) {
  const body = `${JSON.stringify(value)}\n`;
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
  });
  response.end(headOnly ? undefined : body);
}

async function runCli() {
  const server = await startFactoryServer();
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : DEFAULT_PORT;
  console.log(`AppBasis Factory: http://${DEFAULT_HOST}:${port}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : "Factory console failed to start.");
    process.exitCode = 1;
  });
}
