import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  bootstrapUlcLinzProductionAdmin,
  readUlcLinzProductionAdminBootstrapEnvironment,
  UlcLinzProductionAdminBootstrapEnvironmentError,
} from "../tooling/bootstrap-production-admin.mjs";

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

describe("ULC production technical administrator bootstrap", () => {
  it("pins the production target and technical principal", () => {
    expect(readUlcLinzProductionAdminBootstrapEnvironment(ENV)).toEqual({
      connectionString: DATABASE_URL,
      secret: ENV.ULC_LINZ_PRODUCTION_BETTER_AUTH_SECRET,
      baseURL: "https://app.ulc-linz.at",
      username: "ulc.production.admin",
      displayName: "ULC Linz Production Technical Admin",
      password: ENV.ULC_LINZ_PRODUCTION_ADMIN_PASSWORD,
    });
  });

  it("fails closed without the exact target, apply gate, database or credentials", () => {
    for (const env of [
      { ...ENV, ULC_LINZ_PRODUCTION_ADMIN_BOOTSTRAP_TARGET: "ulc-linz-preview" },
      { ...ENV, ULC_LINZ_PRODUCTION_ADMIN_BOOTSTRAP_APPLY: "0" },
      {
        ...ENV,
        ULC_LINZ_PRODUCTION_DATABASE_URL:
          "postgresql://owner:pass@ep-other.c-5.eu-central-1.aws.neon.tech/neondb?sslmode=require",
      },
      { ...ENV, ULC_LINZ_PRODUCTION_BETTER_AUTH_SECRET: "too-short" },
      {
        ...ENV,
        ULC_LINZ_PRODUCTION_BETTER_AUTH_SECRET:
          `${ENV.ULC_LINZ_PRODUCTION_BETTER_AUTH_SECRET} `,
      },
      { ...ENV, ULC_LINZ_PRODUCTION_ADMIN_PASSWORD: "short" },
    ]) {
      expect(() => readUlcLinzProductionAdminBootstrapEnvironment(env)).toThrow(
        UlcLinzProductionAdminBootstrapEnvironmentError,
      );
    }
  });

  it("delegates only the pinned production administrator options", async () => {
    let captured;
    const result = await bootstrapUlcLinzProductionAdmin(ENV, async (options) => {
      captured = options;
      return {
        identityId: "production-admin-id",
        username: options.username,
        role: "admin",
      };
    });

    expect(captured).toEqual(readUlcLinzProductionAdminBootstrapEnvironment(ENV));
    expect(result).toEqual({
      identityId: "production-admin-id",
      username: "ulc.production.admin",
      role: "admin",
    });
  });

  it("keeps the workflow main-only, protected, serialized and free of deploy or retention actions", async () => {
    const workflow = await readFile(
      new URL("../../../.github/workflows/m5-ulc-production-admin-bootstrap.yml", import.meta.url),
      "utf8",
    );

    for (const anchor of [
      "environment: m4-dr",
      "github.ref == 'refs/heads/main'",
      "group: m6-ulc-production-runtime-config",
      "cancel-in-progress: false",
      "CREATE-ULC-M5-PRODUCTION-ADMIN",
      "ULC_LINZ_PRODUCTION_ADMIN_PASSWORD",
      "ULC_LINZ_PRODUCTION_ADMIN_BOOTSTRAP_TARGET: ulc-linz-production",
      "ULC_LINZ_PRODUCTION_ADMIN_BOOTSTRAP_APPLY: '1'",
      "node ./apps/ulc-linz/tooling/bootstrap-production-admin.mjs",
      "username: `ulc.production.admin`",
    ]) {
      expect(workflow).toContain(anchor);
    }

    for (const forbidden of [
      "wrangler deploy",
      "workers_dev: true",
      "RUN-ULC-M5-PRODUCTION-RETENTION",
    ]) {
      expect(workflow).not.toContain(forbidden);
    }
  });
});
