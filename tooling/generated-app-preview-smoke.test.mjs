import assert from "node:assert/strict";
import test from "node:test";

import {
  verifyGeneratedAppPreview,
  verifyGeneratedAppPreviewUi,
} from "./generated-app-preview-smoke.mjs";

const BASE_URL = "https://appbasis-demo.example.test";

const HTML = '<!doctype html><link rel="stylesheet" href="/app.css"><script type="module" src="/app.js"></script>';
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'";

test("accepts a generated preview UI only with the expected security boundary", async () => {
  const result = await verifyGeneratedAppPreviewUi({
    baseURL: BASE_URL,
    fetchImpl: async () =>
      new Response(HTML, {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "content-security-policy": CSP,
        },
      }),
  });

  assert.deepEqual(result, { status: "ui-reachable" });
});

test("generic preview smoke composes health, UI and fail-closed runtime checks", async () => {
  const observed = [];
  const result = await verifyGeneratedAppPreview({
    baseURL: BASE_URL,
    appId: "demo",
    fetchImpl: async (url) => {
      observed.push(String(url));
      const pathname = new URL(url).pathname;
      if (pathname === "/api/health") {
        return Response.json({ status: "ok", appId: "demo" });
      }
      if (pathname === "/") {
        return new Response(HTML, {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "content-security-policy": CSP,
          },
        });
      }
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

  assert.deepEqual(result, {
    health: { status: "ok", appId: "demo" },
    ui: { status: "ui-reachable" },
    runtime: { status: "session-required" },
  });
  assert.deepEqual(observed, [
    BASE_URL + "/api/health",
    BASE_URL + "/",
    BASE_URL + "/api/tasks",
  ]);
});

test("rejects generated preview HTML without required CSP", async () => {
  await assert.rejects(
    verifyGeneratedAppPreviewUi({
      baseURL: BASE_URL,
      fetchImpl: async () =>
        new Response(HTML, {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
    }),
    /security headers are incomplete/,
  );
});
