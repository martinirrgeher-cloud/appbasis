import assert from "node:assert/strict";
import test from "node:test";

import { verifyUlcLinzD4PreviewAuditSmoke } from "./ulc-linz-d4-preview-audit-smoke.mjs";

const BASE_URL = "https://appbasis-ulc-linz.example.test";

function responseFor(url) {
  const parsed = new URL(url);
  if (parsed.pathname === "/api/health") {
    return Response.json({ status: "ok", appId: "ulc-linz" });
  }
  if (parsed.pathname === "/") {
    return new Response(
      '<!doctype html><link rel="stylesheet" href="/app.css"><script src="/app.js"></script>',
      {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "content-security-policy":
            "default-src 'self'; script-src 'self'; frame-ancestors 'none'",
        },
      },
    );
  }
  if (parsed.pathname === "/api/modules/countdown") {
    return Response.json(
      {
        error: {
          code: "SESSION_INVALID",
          message: "A valid session is required.",
        },
      },
      { status: 401 },
    );
  }
  throw new Error("Unexpected URL: " + url);
}

function databaseFactory(counts) {
  let index = 0;
  return () => ({
    client: {
      async unsafe(sql) {
        assert.match(sql, /ulc_linz_security_event_log/);
        return [{ matching_count: String(counts[index++]) }];
      },
      async end() {},
    },
  });
}

test("passes only when the anonymous countdown denial persists a new audit event", async () => {
  const result = await verifyUlcLinzD4PreviewAuditSmoke(
    {
      baseURL: BASE_URL,
      migrationDatabaseUrl:
        "postgresql://owner:secret@example.test/appbasis_ulc_linz_preview",
      fetchImpl: async (url) => responseFor(url),
    },
    { databaseFactory: databaseFactory([4, 5]) },
  );

  assert.deepEqual(result, {
    status: "preview-audit-verified",
    persistedSecurityEvents: 1,
  });
});

test("fails closed when the denial response is correct but no audit event is persisted", async () => {
  await assert.rejects(
    verifyUlcLinzD4PreviewAuditSmoke(
      {
        baseURL: BASE_URL,
        migrationDatabaseUrl:
          "postgresql://owner:secret@example.test/appbasis_ulc_linz_preview",
        fetchImpl: async (url) => responseFor(url),
      },
      { databaseFactory: databaseFactory([4, 4]) },
    ),
    /was not persisted/,
  );
});

test("fails closed on a non-session countdown denial", async () => {
  const fetchImpl = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname !== "/api/modules/countdown") return responseFor(url);
    return Response.json(
      {
        error: {
          code: "PERMISSION_DENIED",
          message: "A valid session is required.",
        },
      },
      { status: 401 },
    );
  };

  await assert.rejects(
    verifyUlcLinzD4PreviewAuditSmoke(
      {
        baseURL: BASE_URL,
        migrationDatabaseUrl:
          "postgresql://owner:secret@example.test/appbasis_ulc_linz_preview",
        fetchImpl,
      },
      { databaseFactory: databaseFactory([1]) },
    ),
    /unexpected denial/,
  );
});
