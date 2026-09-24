import assert from "node:assert/strict";
import test from "node:test";

import {
  ensureUlcLinzD4PreviewHyperdrives,
  resolveUlcLinzD4PreviewHyperdrives,
  ULC_LINZ_D4_PREVIEW_APPLICATION_HYPERDRIVE,
  ULC_LINZ_D4_PREVIEW_SECURITY_LOG_HYPERDRIVE,
  validateUlcLinzD4PreviewDatabaseUrls,
} from "./ulc-linz-d4-preview-hyperdrive.mjs";

const ACCOUNT_ID = "0123456789abcdef0123456789abcdef";
const API_TOKEN = "cloudflare-test-token-000000000000";
const HOST = "ep-ulc-preview.eu-central-1.aws.neon.tech";
const DATABASE = "appbasis_ulc_linz_preview";
const APPLICATION_URL =
  `postgresql://ulc_preview_app:app-password@${HOST}/${DATABASE}?sslmode=require`;
const SECURITY_LOG_URL =
  `postgresql://ulc_preview_security_ingest:security-password@${HOST}/${DATABASE}?sslmode=require`;

function config(target, id, user) {
  return {
    id,
    name: target.name,
    origin: {
      scheme: "postgresql",
      host: HOST,
      port: 5432,
      database: DATABASE,
      user,
    },
    caching: { disabled: true },
  };
}

function apiResponse(result) {
  return Response.json({ success: true, result });
}

test("pins distinct ULC D4 preview Hyperdrive targets to one preview database", () => {
  assert.deepEqual(ULC_LINZ_D4_PREVIEW_APPLICATION_HYPERDRIVE, {
    appId: "ulc-linz",
    environment: "generated-preview-ulc-linz",
    name: "appbasis-ulc-linz-preview",
    database: DATABASE,
  });
  assert.deepEqual(ULC_LINZ_D4_PREVIEW_SECURITY_LOG_HYPERDRIVE, {
    appId: "ulc-linz",
    environment: "generated-preview-ulc-linz",
    name: "appbasis-ulc-linz-preview-security-log",
    database: DATABASE,
  });
});

test("requires application and security-log credentials for the same database but distinct roles", () => {
  const parsed = validateUlcLinzD4PreviewDatabaseUrls(
    APPLICATION_URL,
    SECURITY_LOG_URL,
  );
  assert.equal(parsed.application.user, "ulc_preview_app");
  assert.equal(parsed.securityLog.user, "ulc_preview_security_ingest");

  assert.throws(
    () =>
      validateUlcLinzD4PreviewDatabaseUrls(
        APPLICATION_URL,
        `postgresql://ulc_preview_app:other-password@${HOST}/${DATABASE}`,
      ),
    /roles must be distinct/,
  );
  assert.throws(
    () =>
      validateUlcLinzD4PreviewDatabaseUrls(
        APPLICATION_URL,
        "postgresql://ulc_preview_security_ingest:secret@ep-other-preview.eu-central-1.aws.neon.tech/appbasis_ulc_linz_preview",
      ),
    /same dedicated preview database/,
  );
});

test("resolves two exact cache-disabled preview Hyperdrives", async () => {
  const applicationConfig = config(
    ULC_LINZ_D4_PREVIEW_APPLICATION_HYPERDRIVE,
    "application-id",
    "ulc_preview_app",
  );
  const securityConfig = config(
    ULC_LINZ_D4_PREVIEW_SECURITY_LOG_HYPERDRIVE,
    "security-id",
    "ulc_preview_security_ingest",
  );

  const result = await resolveUlcLinzD4PreviewHyperdrives({
    accountId: ACCOUNT_ID,
    apiToken: API_TOKEN,
    applicationDatabaseUrl: APPLICATION_URL,
    securityLogDatabaseUrl: SECURITY_LOG_URL,
    fetchImpl: async (_url, options) => {
      assert.equal(options.method, "GET");
      return apiResponse([applicationConfig, securityConfig]);
    },
  });

  assert.deepEqual(result, {
    application: {
      id: "application-id",
      name: "appbasis-ulc-linz-preview",
    },
    securityLog: {
      id: "security-id",
      name: "appbasis-ulc-linz-preview-security-log",
    },
  });
});

test("requires explicit approval before creating missing ULC D4 Hyperdrives", async () => {
  let requests = 0;
  await assert.rejects(
    ensureUlcLinzD4PreviewHyperdrives({
      accountId: ACCOUNT_ID,
      apiToken: API_TOKEN,
      applicationDatabaseUrl: APPLICATION_URL,
      securityLogDatabaseUrl: SECURITY_LOG_URL,
      apply: false,
      fetchImpl: async () => {
        requests += 1;
        return apiResponse([]);
      },
    }),
    /creation was not explicitly confirmed/,
  );
  assert.equal(requests, 1);
});

test("creates two distinct ULC D4 Hyperdrives only after approval", async () => {
  const requests = [];
  const result = await ensureUlcLinzD4PreviewHyperdrives({
    accountId: ACCOUNT_ID,
    apiToken: API_TOKEN,
    applicationDatabaseUrl: APPLICATION_URL,
    securityLogDatabaseUrl: SECURITY_LOG_URL,
    apply: true,
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      if (options.method === "GET") return apiResponse([]);
      const body = JSON.parse(options.body);
      if (body.name === ULC_LINZ_D4_PREVIEW_APPLICATION_HYPERDRIVE.name) {
        return apiResponse(
          config(
            ULC_LINZ_D4_PREVIEW_APPLICATION_HYPERDRIVE,
            "application-id",
            "ulc_preview_app",
          ),
        );
      }
      return apiResponse(
        config(
          ULC_LINZ_D4_PREVIEW_SECURITY_LOG_HYPERDRIVE,
          "security-id",
          "ulc_preview_security_ingest",
        ),
      );
    },
  });

  assert.equal(result.application.id, "application-id");
  assert.equal(result.securityLog.id, "security-id");
  assert.equal(requests.filter(({ options }) => options.method === "POST").length, 2);
  const bodies = requests
    .filter(({ options }) => options.method === "POST")
    .map(({ options }) => JSON.parse(options.body));
  assert.deepEqual(
    bodies.map((body) => body.name),
    ["appbasis-ulc-linz-preview", "appbasis-ulc-linz-preview-security-log"],
  );
});
