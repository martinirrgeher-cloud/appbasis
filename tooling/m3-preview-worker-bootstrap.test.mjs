import assert from "node:assert/strict";
import test from "node:test";

import {
  ensureM3PreviewWorker,
  M3_PREVIEW_WORKER,
} from "./m3-preview-worker-bootstrap.mjs";

const ACCOUNT_ID = "0123456789abcdef0123456789abcdef";
const API_TOKEN = "cloudflare-test-token-000000000000";
const WORKER_ID = "abcdef0123456789abcdef0123456789";

function workerResult(overrides = {}) {
  return {
    id: WORKER_ID,
    name: M3_PREVIEW_WORKER.name,
    subdomain: {
      enabled: true,
      previews_enabled: false,
      ...(overrides.subdomain ?? {}),
    },
    ...Object.fromEntries(
      Object.entries(overrides).filter(([key]) => key !== "subdomain"),
    ),
  };
}

function success(result, status = 200) {
  return Response.json({ success: true, result }, { status });
}

function notFound() {
  return Response.json(
    {
      success: false,
      errors: [{ code: 10090, message: "worker not found" }],
    },
    { status: 404 },
  );
}

function accountSubdomain(value = "appbasis-preview") {
  return success({ subdomain: value });
}

test("pins the dedicated m3-preview Worker target", () => {
  assert.deepEqual(M3_PREVIEW_WORKER, {
    name: "appbasis-m3-preview",
    subdomainEnabled: true,
    previewUrlsEnabled: false,
  });
  assert.equal(Object.isFrozen(M3_PREVIEW_WORKER), true);
});

test("reuses an existing exact Worker without provider mutation", async () => {
  const requests = [];
  const result = await ensureM3PreviewWorker({
    accountId: ACCOUNT_ID,
    apiToken: API_TOKEN,
    apply: false,
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      return success(workerResult());
    },
  });

  assert.deepEqual(result, {
    id: WORKER_ID,
    name: "appbasis-m3-preview",
    status: "existing",
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.method, "GET");
  assert.match(requests[0].url, /\/workers\/workers\/appbasis-m3-preview$/);
});

test("does not create a missing Worker without explicit confirmation", async () => {
  let requestCount = 0;
  await assert.rejects(
    ensureM3PreviewWorker({
      accountId: ACCOUNT_ID,
      apiToken: API_TOKEN,
      apply: false,
      fetchImpl: async (_url, options) => {
        requestCount += 1;
        assert.equal(options.method, "GET");
        return notFound();
      },
    }),
    /creation was not explicitly confirmed/,
  );
  assert.equal(requestCount, 1);
});

test("creates only the empty dedicated Worker when explicitly confirmed", async () => {
  const requests = [];
  let workerReads = 0;
  const result = await ensureM3PreviewWorker({
    accountId: ACCOUNT_ID,
    apiToken: API_TOKEN,
    apply: true,
    fetchImpl: async (url, options) => {
      const request = { url: String(url), options };
      requests.push(request);
      if (request.url.endsWith("/workers/subdomain")) {
        return accountSubdomain();
      }
      if (options.method === "GET") {
        workerReads += 1;
        return workerReads === 1 ? notFound() : success(workerResult());
      }
      return success(workerResult());
    },
  });

  assert.deepEqual(result, {
    id: WORKER_ID,
    name: "appbasis-m3-preview",
    status: "created",
  });
  assert.equal(requests.length, 4);
  assert.deepEqual(
    requests.map(({ options }) => options.method),
    ["GET", "GET", "POST", "GET"],
  );
  const create = requests[2];
  assert.match(create.url, /\/workers\/workers$/);
  assert.deepEqual(JSON.parse(create.options.body), {
    name: "appbasis-m3-preview",
    subdomain: {
      enabled: true,
      previews_enabled: false,
    },
  });
});

test("requires an account workers.dev subdomain before creating a Worker", async () => {
  const requests = [];
  await assert.rejects(
    ensureM3PreviewWorker({
      accountId: ACCOUNT_ID,
      apiToken: API_TOKEN,
      apply: true,
      fetchImpl: async (url, options) => {
        requests.push({ url: String(url), options });
        if (String(url).endsWith("/workers/subdomain")) {
          return accountSubdomain("Not Valid");
        }
        return notFound();
      },
    }),
    /account subdomain is unavailable or invalid/,
  );
  assert.equal(requests.length, 2);
  assert.deepEqual(
    requests.map(({ options }) => options.method),
    ["GET", "GET"],
  );
});

test("fails closed instead of repairing an existing Worker with wrong ingress settings", async () => {
  let requestCount = 0;
  await assert.rejects(
    ensureM3PreviewWorker({
      accountId: ACCOUNT_ID,
      apiToken: API_TOKEN,
      apply: true,
      fetchImpl: async (_url, options) => {
        requestCount += 1;
        assert.equal(options.method, "GET");
        return success(
          workerResult({
            subdomain: { enabled: false, previews_enabled: false },
          }),
        );
      },
    }),
    /does not match the bootstrap contract/,
  );
  assert.equal(requestCount, 1);
});

test("fails closed on a create race and never retries as update", async () => {
  const requests = [];
  await assert.rejects(
    ensureM3PreviewWorker({
      accountId: ACCOUNT_ID,
      apiToken: API_TOKEN,
      apply: true,
      fetchImpl: async (url, options) => {
        requests.push({ url: String(url), options });
        if (String(url).endsWith("/workers/subdomain")) {
          return accountSubdomain();
        }
        if (options.method === "GET") return notFound();
        return Response.json(
          {
            success: false,
            errors: [{ code: 10013, message: "already exists secret-provider-detail" }],
          },
          { status: 409 },
        );
      },
    }),
    /Cloudflare Worker create rejected the request \(status 409; codes 10013\)/,
  );
  assert.equal(requests.length, 3);
  assert.deepEqual(
    requests.map(({ options }) => options.method),
    ["GET", "GET", "POST"],
  );
});

test("does not expose provider response messages in errors", async () => {
  await assert.rejects(
    ensureM3PreviewWorker({
      accountId: ACCOUNT_ID,
      apiToken: API_TOKEN,
      fetchImpl: async () =>
        Response.json(
          {
            success: false,
            errors: [{ code: 10001, message: "postgresql://secret-host/private" }],
          },
          { status: 403 },
        ),
    }),
    (error) => {
      assert.match(error.message, /status 403/);
      assert.match(error.message, /codes 10001/);
      assert.doesNotMatch(error.message, /secret-host/);
      return true;
    },
  );
});
