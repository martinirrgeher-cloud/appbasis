import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  bootstrapUlcLinzProductionAdmin,
  readUlcLinzProductionAdminBootstrapEnvironment,
  UlcLinzProductionAdminBootstrapEnvironmentError,
} from "./ulc-linz-m5-production-admin-bootstrap.mjs";

const DATABASE_URL =
  "postgresql://neondb_owner:runtime-password@ep-crimson-boat-b1aqfjwf.c-5.eu-central-1.aws.neon.tech/neondb?sslmode=require";
const ENV = Object.freeze({
  ULC_LINZ_PRODUCTION_ADMIN_BOOTSTRAP_TARGET: "ulc-linz-production",
  ULC_LINZ_PRODUCTION_ADMIN_BOOTSTRAP_APPLY: "1",
  ULC_LINZ_PRODUCTION_DATABASE_URL: DATABASE_URL,
  ULC_LINZ_PRODUCTION_BETTER_AUTH_SECRET:
    "ulc-production-auth-secret-000000000000000000",
  ULC_LINZ_PRODUCTION_ADMIN_PASSWORD:
    "ulc-production-admin-password-000000000000",
});

test("pins the ULC production technical administrator contract", () => {
  assert.deepEqual(readUlcLinzProductionAdminBootstrapEnvironment(ENV), {
    connectionString: DATABASE_URL,
    secret: ENV.ULC_LINZ_PRODUCTION_BETTER_AUTH_SECRET,
    baseURL: "https://app.ulc-linz.at",
    username: "ulc.production.admin",
    displayName: "ULC Linz Production Technical Admin",
    password: ENV.ULC_LINZ_PRODUCTION_ADMIN_PASSWORD,
  });
});

test("fails closed without the exact production target and apply gate", () => {
  for (const env of [
    { ...ENV, ULC_LINZ_PRODUCTION_ADMIN_BOOTSTRAP_TARGET: "ulc-linz-preview" },
    { ...ENV, ULC_LINZ_PRODUCTION_ADMIN_BOOTSTRAP_APPLY: "0" },
  ]) {
    assert.throws(
      () => readUlcLinzProductionAdminBootstrapEnvironment(env),
      UlcLinzProductionAdminBootstrapEnvironmentError,
    );
  }
});

test("fails closed for a different database or invalid protected credentials", () => {
  for (const env of [
    {
      ...ENV,
      ULC_LINZ_PRODUCTION_DATABASE_URL:
        "postgresql://owner:pass@ep-other.c-5.eu-central-1.aws.neon.tech/neondb?sslmode=require",
    },
    { ...ENV, ULC_LINZ_PRODUCTION_BETTER_AUTH_SECRET: "too-short" },
    { ...ENV, ULC_LINZ_PRODUCTION_ADMIN_PASSWORD: "short" },
  ]) {
    assert.throws(
      () => readUlcLinzProductionAdminBootstrapEnvironment(env),
      UlcLinzProductionAdminBootstrapEnvironmentError,
    );
  }
});

test("delegates only the pinned production administrator options", async () => {
  let captured;
  const result = await bootstrapUlcLinzProductionAdmin(ENV, async (options) => {
    captured = options;
    return { identityId: "production-admin-id", username: options.username, role: "admin" };
  });

  assert.equal(captured.username, "ulc.production.admin");
  assert.equal(captured.baseURL, "https://app.ulc-linz.at");
  assert.equal(captured.connectionString, DATABASE_URL);
  assert.equal(captured.secret, ENV.ULC_LINZ_PRODUCTION_BETTER_AUTH_SECRET);
  assert.equal(captured.password, ENV.ULC_LINZ_PRODUCTION_ADMIN_PASSWORD);
  assert.deepEqual(result, {
    identityId: "production-admin-id",
    username: "ulc.production.admin",
    role: "admin",
  });
});

test("workflow keeps the bootstrap behind the protected production boundary", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/m5-ulc-production-admin-bootstrap.yml", import.meta.url),
    "utf8",
  );

  for (const anchor of [
    "environment: m4-dr",
    "github.ref == 'refs/heads/main'",
    "CREATE-ULC-M5-PRODUCTION-ADMIN",
    "ULC_LINZ_PRODUCTION_ADMIN_PASSWORD",
    "ULC_LINZ_PRODUCTION_ADMIN_BOOTSTRAP_TARGET: ulc-linz-production",
    "ULC_LINZ_PRODUCTION_ADMIN_BOOTSTRAP_APPLY: '1'",
    "node ./tooling/ulc-linz-m5-production-admin-bootstrap.mjs",
    "username: `ulc.production.admin`",
  ]) {
    assert.match(workflow, new RegExp(anchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  for (const forbidden of ["wrangler deploy", "workers_dev: true", "RUN-ULC-M5-PRODUCTION-RETENTION"]) {
    assert.doesNotMatch(workflow, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
