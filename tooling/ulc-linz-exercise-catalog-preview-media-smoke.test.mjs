import assert from "node:assert/strict";
import test from "node:test";

import {
  createPreviewAdminImpersonationSession,
  verifyUlcExerciseCatalogPreviewMediaSmoke,
} from "./ulc-linz-exercise-catalog-preview-media-smoke.mjs";

const BASE_URL = "https://appbasis-ulc-linz.example-account.workers.dev";
const DATABASE_URL =
  "postgresql://appbasis_ulc_linz_preview_application:secret@db.example.test/appbasis_ulc_linz_preview?sslmode=require";
const BETTER_AUTH_SECRET = "test-better-auth-secret-0123456789abcdef";
const ROOT_PASSWORD = "root-password-0123456789";
const CORRELATION_ID = "0123456789abcdef";
const FILE_NAME = "appbasis-e6h-media-smoke-" + CORRELATION_ID + ".mp4";
const COOKIE = "better-auth.session_token=preview-smoke";
const VIDEO_BYTES = Uint8Array.from([
  0x00, 0x00, 0x00, 0x18,
  0x66, 0x74, 0x79, 0x70,
  0x69, 0x73, 0x6f, 0x6d,
  0x00, 0x00, 0x02, 0x00,
  0x69, 0x73, 0x6f, 0x6d,
  0x69, 0x73, 0x6f, 0x32,
]);

function privateMediaHeaders(length, fileName, extra = {}) {
  return {
    "content-type": "video/mp4",
    "content-disposition":
      "inline; filename*=UTF-8''" + encodeURIComponent(fileName),
    "cache-control": "private, no-store",
    "accept-ranges": "bytes",
    "x-content-type-options": "nosniff",
    "content-length": String(length),
    ...extra,
  };
}

function createSuccessfulFetch({
  failFullDownload = false,
  cleanupLog = [],
} = {}) {
  let media = [];

  return async (url, init = {}) => {
    const parsed = new URL(url);
    const method = init.method ?? "GET";
    const headers = new Headers(init.headers);
    assert.equal(headers.get("cookie"), COOKIE);

    if (parsed.pathname === "/api/auth/session" && method === "GET") {
      return Response.json({
        identity: {
          username: "preview.admin",
          mustChangePassword: false,
          accountStatus: "active",
        },
        access: "full",
      });
    }

    if (
      parsed.pathname === "/api/modules/exercise-catalog" &&
      method === "GET"
    ) {
      return Response.json({
        module: {
          moduleId: "exercise_catalog",
          features: { privateVideoUpload: true },
        },
        access: { edit: true },
        catalog: {
          items: [
            { id: "exercise-b", isActive: true },
            { id: "exercise-a", isActive: true },
          ],
        },
      });
    }

    const base =
      "/api/modules/exercise-catalog/exercise-a/private-media";
    if (parsed.pathname === base && method === "GET") {
      return Response.json({
        available: true,
        maximumBytes: 100 * 1024 * 1024,
        media,
      });
    }

    if (parsed.pathname === base && method === "POST") {
      assert.equal(headers.get("content-type"), "video/mp4");
      assert.equal(headers.get("x-appbasis-file-name"), FILE_NAME);
      const bytes =
        init.body instanceof Uint8Array
          ? init.body
          : new Uint8Array(await new Response(init.body).arrayBuffer());
      assert.deepEqual([...bytes], [...VIDEO_BYTES]);
      media = [
        {
          id: "media-smoke",
          fileName: FILE_NAME,
          contentType: "video/mp4",
          sizeBytes: VIDEO_BYTES.byteLength,
        },
      ];
      return Response.json({ media: media[0] }, { status: 201 });
    }

    const content = base + "/media-smoke/content";
    if (parsed.pathname === content && method === "GET") {
      if (media.length === 0) {
        return Response.json(
          { error: { code: "EXERCISE_CATALOG_NOT_FOUND" } },
          { status: 404 },
        );
      }
      const range = headers.get("range");
      if (range === "bytes=0-7") {
        return new Response(VIDEO_BYTES.slice(0, 8), {
          status: 206,
          headers: privateMediaHeaders(8, FILE_NAME, {
            "content-range": "bytes 0-7/" + String(VIDEO_BYTES.byteLength),
          }),
        });
      }
      if (failFullDownload) {
        return Response.json(
          { error: { code: "PRIVATE_MEDIA_BROKEN" } },
          { status: 500 },
        );
      }
      return new Response(VIDEO_BYTES, {
        status: 200,
        headers: privateMediaHeaders(
          VIDEO_BYTES.byteLength,
          FILE_NAME,
        ),
      });
    }

    if (
      parsed.pathname === base + "/media-smoke" &&
      method === "DELETE"
    ) {
      cleanupLog.push("delete");
      media = [];
      return Response.json({ deleted: true });
    }

    throw new Error("Unexpected request: " + method + " " + parsed.pathname);
  };
}

test("verifies upload, list, full download, range download and delete against the preview HTTP contract", async () => {
  let sessionClosed = false;
  const cleanupLog = [];

  const result = await verifyUlcExerciseCatalogPreviewMediaSmoke(
    {
      baseURL: BASE_URL,
      databaseUrl: DATABASE_URL,
      betterAuthSecret: BETTER_AUTH_SECRET,
      rootAdminPassword: ROOT_PASSWORD,
      correlationId: CORRELATION_ID,
      fetchImpl: createSuccessfulFetch({ cleanupLog }),
    },
    {
      createSession: async () => ({
        cookie: COOKIE,
        async close() {
          sessionClosed = true;
        },
      }),
    },
  );

  assert.deepEqual(result, {
    status: "preview-private-media-verified",
    exerciseId: "exercise-a",
    uploadedBytes: VIDEO_BYTES.byteLength,
    rangeBytes: 8,
    deleted: true,
    productionChanged: false,
  });
  assert.equal(sessionClosed, true);
  assert.deepEqual(cleanupLog, ["delete"]);
});

test("cleans up an uploaded smoke object when a later live assertion fails", async () => {
  let sessionClosed = false;
  const cleanupLog = [];

  await assert.rejects(
    verifyUlcExerciseCatalogPreviewMediaSmoke(
      {
        baseURL: BASE_URL,
        databaseUrl: DATABASE_URL,
        betterAuthSecret: BETTER_AUTH_SECRET,
        rootAdminPassword: ROOT_PASSWORD,
        correlationId: CORRELATION_ID,
        fetchImpl: createSuccessfulFetch({
          failFullDownload: true,
          cleanupLog,
        }),
      },
      {
        createSession: async () => ({
          cookie: COOKIE,
          async close() {
            sessionClosed = true;
          },
        }),
      },
    ),
    /content response headers are invalid/,
  );

  assert.equal(sessionClosed, true);
  assert.deepEqual(cleanupLog, ["delete"]);
});

test("creates a temporary preview-admin impersonation session without changing user credentials", async () => {
  const endedSessions = [];
  let databaseEnded = false;
  const connection = {
    database: { kind: "test-database" },
    client: {
      async unsafe(sql, parameters) {
        assert.match(sql, /appbasis_identity_security_state/);
        assert.deepEqual(parameters, ["preview.admin"]);
        return [
          {
            id: "preview-admin-id",
            role: "user",
            banned: false,
            must_change_password: false,
            organization_id: "ulc-linz-preview",
            source_role: "admin",
            active: true,
          },
        ];
      },
      async end() {
        databaseEnded = true;
      },
    },
  };

  class FakeBackend {
    constructor(options) {
      assert.equal(options.baseURL, BASE_URL);
      assert.equal(options.sql, connection.client);
    }

    async signInWithUsername(input) {
      assert.deepEqual(input, {
        username: "appbasis.preview.root",
        password: ROOT_PASSWORD,
      });
      return {
        identityId: "root-id",
        sessionToken: "better-auth.session_token=root",
      };
    }

    async getSession(cookie) {
      assert.equal(
        cookie,
        "__Secure-better-auth.session_token=impersonated-db-token",
      );
      return {
        identityId: "preview-admin-id",
        sessionToken: cookie,
      };
    }

    async endSession(cookie) {
      endedSessions.push(cookie);
    }
  }

  const session = await createPreviewAdminImpersonationSession(
    {
      baseURL: BASE_URL,
      databaseUrl: DATABASE_URL,
      betterAuthSecret: BETTER_AUTH_SECRET,
      rootAdminPassword: ROOT_PASSWORD,
    },
    {
      createDatabase(value) {
        assert.equal(value, DATABASE_URL);
        return connection;
      },
      createAuthRuntime(options) {
        assert.equal(options.database, connection.database);
        assert.equal(options.baseURL, BASE_URL);
        assert.equal(options.secret, BETTER_AUTH_SECRET);
        return {
          async handler(request) {
            assert.equal(
              request.url,
              BASE_URL + "/api/auth/admin/impersonate-user",
            );
            assert.equal(request.method, "POST");
            assert.equal(
              request.headers.get("cookie"),
              "better-auth.session_token=root",
            );
            assert.deepEqual(await request.json(), {
              userId: "preview-admin-id",
            });
            const responseHeaders = new Headers();
            responseHeaders.append(
              "set-cookie",
              "better-auth.admin_session=root; Path=/; HttpOnly",
            );
            responseHeaders.append(
              "set-cookie",
              "__Secure-better-auth.session_token=response-cookie-value; Path=/; HttpOnly; Secure",
            );
            return Response.json(
              {
                session: {
                  token: "impersonated-db-token",
                  userId: "preview-admin-id",
                },
                user: { id: "preview-admin-id" },
              },
              {
                status: 200,
                headers: responseHeaders,
              },
            );
          },
        };
      },
      BetterAuthIdentityBackend: FakeBackend,
    },
  );

  assert.equal(
    session.cookie,
    "__Secure-better-auth.session_token=impersonated-db-token",
  );
  await session.close();
  assert.deepEqual(endedSessions, [
    "__Secure-better-auth.session_token=impersonated-db-token",
    "better-auth.session_token=root",
  ]);
  assert.equal(databaseEnded, true);
});
