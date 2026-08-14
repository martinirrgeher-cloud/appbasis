import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadFactorySnapshot } from "./model.mjs";

const FACTORY_UI_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPOSITORY_ROOT = resolve(FACTORY_UI_DIRECTORY, "../..");
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4174;

const STATIC_ROUTES = new Map([
  ["/", { path: join(FACTORY_UI_DIRECTORY, "index.html"), contentType: "text/html; charset=utf-8" }],
  ["/app.js", { path: join(FACTORY_UI_DIRECTORY, "app.js"), contentType: "text/javascript; charset=utf-8" }],
  ["/styles.css", { path: join(FACTORY_UI_DIRECTORY, "styles.css"), contentType: "text/css; charset=utf-8" }],
  ["/foundation.css", { path: join(DEFAULT_REPOSITORY_ROOT, "packages/ui/foundation.css"), contentType: "text/css; charset=utf-8" }],
  ["/tokens.css", { path: join(DEFAULT_REPOSITORY_ROOT, "packages/ui/tokens.css"), contentType: "text/css; charset=utf-8" }],
]);

export function createFactoryServer(options = {}) {
  const repositoryRoot = resolve(options.repositoryRoot ?? DEFAULT_REPOSITORY_ROOT);

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? DEFAULT_HOST}`);
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
