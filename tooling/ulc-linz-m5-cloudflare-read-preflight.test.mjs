import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { runUlcLinzM5CloudflareReadPreflight } from "./ulc-linz-m5-cloudflare-read-preflight.mjs";
import {
  buildUlcLinzM5CloudflareReadSurface,
  ULC_LINZ_M5_CLOUDFLARE_REQUEST_CLASSES,
  ULC_LINZ_M5_CLOUDFLARE_TARGET_WORKER,
} from "./ulc-linz-m5-cloudflare-read-surface.mjs";

const ACCOUNT = "account-123";
const TOKEN = "token-secret-123";
const VERSION = "11111111-1111-4111-8111-111111111111";
const OBSERVER_URL = new URL("./ulc-linz-m5-production-evidence-observer.mjs", import.meta.url);
const PREFLIGHT_URL = new URL("./ulc-linz-m5-cloudflare-read-preflight.mjs", import.meta.url);

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

function successFetch(overrides = new Map()) {
  return async (url) => {
    const value = String(url);
    for (const [needle, result] of overrides) {
      if (value.includes(needle)) return result;
    }
    if (value.endsWith("/subdomain")) {
      return response(200, { success: true, result: { enabled: false, previews_enabled: false } });
    }
    if (value.includes("/workers/domains?")) {
      return response(200, { success: true, result: [] });
    }
    if (value.endsWith("/deployments")) {
      return response(200, {
        success: true,
        result: { deployments: [{ versions: [{ percentage: 100, version_id: VERSION }] }] },
      });
    }
    if (value.endsWith("/workers/scripts")) {
      return response(200, { success: true, result: [{ id: ULC_LINZ_M5_CLOUDFLARE_TARGET_WORKER }] });
    }
    if (value.endsWith("/script-settings")) {
      return response(200, { success: true, result: { logpush: false } });
    }
    if (value.endsWith(`/versions/${VERSION}`)) {
      return response(200, { success: true, result: { id: VERSION } });
    }
    throw new Error(`Unexpected URL: ${value}`);
  };
}

async function capturedFailure(promise) {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof Error);
    return error;
  }
  assert.fail("Expected preflight to fail.");
}

test("shared Cloudflare read surface is exact and complete", () => {
  const accountPath = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}`;
  assert.deepEqual(ULC_LINZ_M5_CLOUDFLARE_REQUEST_CLASSES, [
    "subdomain",
    "custom-domains",
    "deployments",
    "script-inventory",
    "script-settings",
    "version",
  ]);
  assert.deepEqual(buildUlcLinzM5CloudflareReadSurface(ACCOUNT, VERSION), [
    { requestClass: "subdomain", url: `${accountPath}/workers/scripts/${ULC_LINZ_M5_CLOUDFLARE_TARGET_WORKER}/subdomain` },
    { requestClass: "custom-domains", url: `${accountPath}/workers/domains?service=${ULC_LINZ_M5_CLOUDFLARE_TARGET_WORKER}` },
    { requestClass: "deployments", url: `${accountPath}/workers/scripts/${ULC_LINZ_M5_CLOUDFLARE_TARGET_WORKER}/deployments` },
    { requestClass: "script-inventory", url: `${accountPath}/workers/scripts` },
    { requestClass: "script-settings", url: `${accountPath}/workers/scripts/${ULC_LINZ_M5_CLOUDFLARE_TARGET_WORKER}/script-settings` },
    { requestClass: "version", url: `${accountPath}/workers/scripts/${ULC_LINZ_M5_CLOUDFLARE_TARGET_WORKER}/versions/${VERSION}` },
  ]);
});

test("observer and preflight consume one shared Cloudflare read surface", async () => {
  const [observer, preflight] = await Promise.all([
    readFile(OBSERVER_URL, "utf8"),
    readFile(PREFLIGHT_URL, "utf8"),
  ]);
  for (const source of [observer, preflight]) {
    assert.match(source, /from "\.\/ulc-linz-m5-cloudflare-read-surface\.mjs"/);
    assert.match(source, /buildUlcLinzM5CloudflareReadSurface/);
  }
  assert.doesNotMatch(observer, /const CLOUDFLARE_API =/);
  assert.doesNotMatch(preflight, /const CLOUDFLARE_API =/);
  assert.doesNotMatch(observer, /workers\/scripts\/\$\{TARGET_WORKER\}\/deployments/);
  assert.doesNotMatch(preflight, /workers\/scripts\/\$\{TARGET_WORKER\}\/deployments/);
});

test("preflight verifies every Cloudflare read required by the M5 observer", async () => {
  const seen = [];
  const baseFetch = successFetch();
  const result = await runUlcLinzM5CloudflareReadPreflight(
    { accountId: ACCOUNT, apiToken: TOKEN },
    {
      fetchImpl: async (url, options) => {
        seen.push(String(url));
        assert.equal(options.method, "GET");
        assert.equal(options.headers.Authorization, `Bearer ${TOKEN}`);
        return baseFetch(url, options);
      },
    },
  );
  assert.deepEqual(result, { cloudflareReadPreflightVerified: true });
  assert.deepEqual(seen.sort(), buildUlcLinzM5CloudflareReadSurface(ACCOUNT, VERSION).map(({ url }) => url).sort());
});

test("preflight reports all permission failures deterministically without provider leakage", async () => {
  const error = await capturedFailure(
    runUlcLinzM5CloudflareReadPreflight(
      { accountId: ACCOUNT, apiToken: TOKEN },
      {
        fetchImpl: successFetch(
          new Map([
            ["/deployments", response(401, { secret: TOKEN })],
            ["/script-settings", response(403, { account: ACCOUNT })],
          ]),
        ),
      },
    ),
  );
  assert.match(error.message, /deployments:http-401/);
  assert.match(error.message, /script-settings:http-403/);
  assert.doesNotMatch(error.message, new RegExp(TOKEN));
  assert.doesNotMatch(error.message, new RegExp(ACCOUNT));
  assert.doesNotMatch(error.message, /secret/);
});

test("preflight distinguishes request-shape and version-access failures", async () => {
  await assert.rejects(
    runUlcLinzM5CloudflareReadPreflight(
      { accountId: ACCOUNT, apiToken: TOKEN },
      { fetchImpl: successFetch(new Map([["/deployments", response(400, { success: false })]])) },
    ),
    /deployments:http-400/,
  );

  await assert.rejects(
    runUlcLinzM5CloudflareReadPreflight(
      { accountId: ACCOUNT, apiToken: TOKEN },
      { fetchImpl: successFetch(new Map([[`/versions/${VERSION}`, response(404, { success: false })]])) },
    ),
    /version:http-404/,
  );
});

test("preflight fails closed on malformed successful deployment evidence", async () => {
  await assert.rejects(
    runUlcLinzM5CloudflareReadPreflight(
      { accountId: ACCOUNT, apiToken: TOKEN },
      { fetchImpl: successFetch(new Map([["/deployments", response(200, { success: true, result: { deployments: [] } })]])) },
    ),
    /deployments:invalid-shape/,
  );
});

test("workflow is main-only, read-only and uses only Cloudflare read credentials", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/m5-ulc-cloudflare-read-preflight.yml", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /branches:\s*\[main\]/);
  assert.match(workflow, /environment: m4-dr/);
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.match(workflow, /CLOUDFLARE_ACCOUNT_ID/);
  assert.match(workflow, /CLOUDFLARE_API_TOKEN/);
  assert.match(workflow, /ulc-linz-m5-cloudflare-read-surface\.mjs/);
  assert.doesNotMatch(workflow, /DATABASE_URL/);
  assert.doesNotMatch(workflow, /NEON_API_KEY/);
  assert.doesNotMatch(workflow, /curl .* -X (POST|PUT|PATCH|DELETE)/);
  assert.match(workflow, /ulc-linz-m5-cloudflare-read-preflight\.mjs/);
});
