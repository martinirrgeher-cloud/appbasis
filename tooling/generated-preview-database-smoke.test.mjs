import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  createSignedMissingSessionCookie,
  verifyGeneratedPreviewDatabaseBinding,
} from "./generated-preview-database-smoke.mjs";

const BASE_URL = "https://appbasis-tasks-minimal.example.test";
const TEST_SECRET = "generated-preview-test-secret-0123456789abcdef";
const FIXED_TOKEN =
  "generated-preview-database-binding-missing-session-00000000-0000-4000-8000-000000000000";

test("signs the secure Better Auth session cookie with the pinned better-call HMAC format", async () => {
  const signature = createHmac("sha256", TEST_SECRET)
    .update(FIXED_TOKEN)
    .digest("base64");
  const expected = `__Secure-better-auth.session_token=${encodeURIComponent(`${FIXED_TOKEN}.${signature}`)}`;

  assert.equal(
    await createSignedMissingSessionCookie(TEST_SECRET, { token: FIXED_TOKEN }),
    expected,
  );
  assert.equal(signature.length, 44);
  assert.equal(signature.endsWith("="), true);
});

test("forces a correctly signed nonexistent session through the configured database runtime", async () => {
  let observedURL;
  let observedOptions;
  const result = await verifyGeneratedPreviewDatabaseBinding({
    baseURL: BASE_URL,
    secret: TEST_SECRET,
    fetchImpl: async (url, options) => {
      observedURL = url;
      observedOptions = options;
      return Response.json(
        {
          error: {
            code: "SESSION_INVALID",
            message: "A valid session is required.",
          },
        },
        { status: 401 },
      );
    },
  });

  assert.deepEqual(result, { status: "database-session-miss" });
  assert.equal(observedURL, `${BASE_URL}/api/tasks`);
  assert.equal(observedOptions.method, "GET");
  assert.equal(observedOptions.redirect, "error");
  assert.equal(observedOptions.headers.accept, "application/json");
  assert.match(
    observedOptions.headers.cookie,
    /^__Secure-better-auth\.session_token=generated-preview-database-binding-missing-session-/,
  );
  const encodedValue = observedOptions.headers.cookie.split("=").slice(1).join("=");
  const signedValue = decodeURIComponent(encodedValue);
  const separator = signedValue.lastIndexOf(".");
  assert.ok(separator > 0);
  const token = signedValue.slice(0, separator);
  const signature = signedValue.slice(separator + 1);
  assert.match(
    token,
    /^generated-preview-database-binding-missing-session-[0-9a-f-]{36}$/,
  );
  assert.equal(
    signature,
    createHmac("sha256", TEST_SECRET).update(token).digest("base64"),
  );
  assert.equal("authorization" in observedOptions.headers, false);
  assert.ok(observedOptions.signal instanceof AbortSignal);
});

test("fails closed when the database-bound request cannot complete", async () => {
  await assert.rejects(
    verifyGeneratedPreviewDatabaseBinding({
      baseURL: BASE_URL,
      secret: TEST_SECRET,
      fetchImpl: async () =>
        Response.json(
          { error: { code: "INTERNAL_ERROR", message: "failed" } },
          { status: 500 },
        ),
    }),
    /unexpected status/,
  );
});

test("requires the exact missing-session response without establishing a session", async () => {
  await assert.rejects(
    verifyGeneratedPreviewDatabaseBinding({
      baseURL: BASE_URL,
      secret: TEST_SECRET,
      fetchImpl: async () =>
        Response.json(
          {
            error: {
              code: "PERMISSION_DENIED",
              message: "A valid session is required.",
            },
          },
          { status: 401 },
        ),
    }),
    /did not fail closed after session lookup/,
  );

  await assert.rejects(
    verifyGeneratedPreviewDatabaseBinding({
      baseURL: BASE_URL,
      secret: TEST_SECRET,
      fetchImpl: async () =>
        Response.json(
          {
            error: {
              code: "SESSION_INVALID",
              message: "A valid session is required.",
            },
          },
          {
            status: 401,
            headers: { "set-cookie": "__Secure-better-auth.session_token=unexpected" },
          },
        ),
    }),
    /unexpectedly established a session/,
  );
});

test("keeps the timeout active while the response body is consumed", async () => {
  const verification = verifyGeneratedPreviewDatabaseBinding({
    baseURL: BASE_URL,
    secret: TEST_SECRET,
    timeoutMs: 10,
    fetchImpl: async (_url, options) => {
      const body = new ReadableStream({
        start(controller) {
          options.signal.addEventListener(
            "abort",
            () => controller.error(new Error("aborted")),
            { once: true },
          );
        },
      });
      return new Response(body, {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    },
  });
  const watchdog = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("database smoke watchdog expired")), 250);
  });

  await assert.rejects(
    Promise.race([verification, watchdog]),
    /database-bound runtime returned invalid JSON/,
  );
});

test("rejects missing secrets, non-canonical origins, invalid transports and excessive timeouts", async () => {
  await assert.rejects(
    verifyGeneratedPreviewDatabaseBinding({
      baseURL: BASE_URL,
      secret: "too-short",
      fetchImpl: async () => Response.json({}),
    }),
    /BETTER_AUTH_SECRET/,
  );
  await assert.rejects(
    verifyGeneratedPreviewDatabaseBinding({
      baseURL: "http://appbasis-tasks-minimal.example.test",
      secret: TEST_SECRET,
      fetchImpl: async () => Response.json({}),
    }),
    /canonical HTTPS origin/,
  );
  await assert.rejects(
    verifyGeneratedPreviewDatabaseBinding({
      baseURL: BASE_URL,
      secret: TEST_SECRET,
      fetchImpl: null,
    }),
    /fetchImpl must be a function/,
  );
  await assert.rejects(
    verifyGeneratedPreviewDatabaseBinding({
      baseURL: BASE_URL,
      secret: TEST_SECRET,
      timeoutMs: 30_001,
      fetchImpl: async () => Response.json({}),
    }),
    /timeoutMs/,
  );
});
