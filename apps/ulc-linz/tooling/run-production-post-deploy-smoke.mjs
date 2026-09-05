import { pathToFileURL } from "node:url";

import { createPostgresDatabase } from "@appbasis/database/node-runtime";
import { BetterAuthIdentityBackend, createIdentityRuntime } from "@appbasis/identity";
import { createBetterAuthRuntime } from "@appbasis/identity/better-auth";
import { PostgresPermissionStore } from "@appbasis/permissions";

import {
  parseUlcLinzProductionDatabaseUrl,
  parseUlcLinzSecurityLogIngestDatabaseUrl,
} from "../../../tooling/ulc-linz-m6-production-hyperdrive.mjs";
import {
  assertUlcLinzModuleAccess,
  UlcLinzAuthorizationDeniedError,
} from "../worker/authorization.ts";
import { createPostgresUlcLinzSecurityEventLogger } from "../worker/security-events-postgres.ts";

const USERNAME = "ulc.m6.smoke";
const ORGANIZATION_ID = "ulc-linz-m6-smoke";
const ALLOWED_MODULE = "countdown";
const DENIED_MODULE = "__m6_smoke_unknown__";

export async function runUlcLinzProductionPostDeploySmoke(env = process.env) {
  const databaseUrl = required(env.ULC_LINZ_PRODUCTION_DATABASE_URL, "ULC_LINZ_PRODUCTION_DATABASE_URL");
  const securityLogUrl = required(
    env.ULC_LINZ_SECURITY_LOG_INGEST_DATABASE_URL,
    "ULC_LINZ_SECURITY_LOG_INGEST_DATABASE_URL",
  );
  const appTarget = parseUlcLinzProductionDatabaseUrl(databaseUrl);
  const securityTarget = parseUlcLinzSecurityLogIngestDatabaseUrl(securityLogUrl);
  if (
    appTarget.host !== securityTarget.host ||
    appTarget.database !== securityTarget.database ||
    appTarget.user === securityTarget.user
  ) {
    throw new Error("M6 production smoke requires one production database with distinct app and security-log principals.");
  }

  const authSecret = required(env.ULC_LINZ_PRODUCTION_BETTER_AUTH_SECRET, "ULC_LINZ_PRODUCTION_BETTER_AUTH_SECRET");
  const smokePassword = required(env.ULC_LINZ_PRODUCTION_SMOKE_PASSWORD, "ULC_LINZ_PRODUCTION_SMOKE_PASSWORD");
  const baseURL = "https://app.ulc-linz.at";
  const appConnection = createPostgresDatabase(databaseUrl);
  const securityConnection = createPostgresDatabase(securityLogUrl);
  const auth = createBetterAuthRuntime({
    database: appConnection.database,
    baseURL,
    secret: authSecret,
  });
  const backend = new BetterAuthIdentityBackend({ auth, sql: appConnection.client, baseURL });
  let smokeSessionToken = null;

  try {
    const identity = createIdentityRuntime({
      auth,
      sql: appConnection.client,
      baseURL,
    });
    const current = await identity.service.signInWithUsername({
      username: USERNAME,
      password: smokePassword,
    });
    smokeSessionToken = current.sessionToken;
    if (current.access !== "full" || current.identity.mustChangePassword !== false) {
      throw new Error("M6 smoke principal is not in steady-state full access.");
    }

    const permissions = new PostgresPermissionStore(appConnection.client);
    const securityEvents = createPostgresUlcLinzSecurityEventLogger(
      securityConnection.client,
    );
    const dependencies = {
      permissions,
      memberships: {
        async resolveMembership({ identityId, organizationId }) {
          const rows = await appConnection.client.unsafe(
            `SELECT organization_id, source_role, active
             FROM ulc_linz_membership
             WHERE identity_id = $1 AND organization_id = $2
             LIMIT 1`,
            [identityId, organizationId],
          );
          const row = rows[0];
          if (row === undefined) return null;
          return {
            organizationId: requiredRowString(row, "organization_id"),
            sourceRole: requiredRowString(row, "source_role"),
            active: row.active === true,
          };
        },
      },
      subjectScopes: {
        async hasRelation() {
          throw new Error("M6 organization-scope smoke must not resolve subject relations.");
        },
      },
      securityEvents,
    };

    await assertUlcLinzModuleAccess(current, dependencies, {
      organizationId: ORGANIZATION_ID,
      moduleKey: ALLOWED_MODULE,
      action: "view",
      scope: "organization",
    });

    let denied = false;
    try {
      await assertUlcLinzModuleAccess(current, dependencies, {
        organizationId: ORGANIZATION_ID,
        moduleKey: DENIED_MODULE,
        action: "view",
        scope: "organization",
      });
    } catch (error) {
      if (!(error instanceof UlcLinzAuthorizationDeniedError)) throw error;
      denied = true;
    }
    if (!denied) {
      throw new Error("M6 unknown-capability smoke did not fail closed.");
    }
    await securityEvents.flush();

    return Object.freeze({
      auth: true,
      permissionsAllowed: true,
      permissionsDenied: true,
      applicationScope: "identity-permissions-foundation",
      fachmoduleDataMutated: false,
    });
  } finally {
    try {
      if (smokeSessionToken !== null) {
        await backend.endSession(smokeSessionToken);
      }
    } finally {
      await securityConnection.client.end();
      await appConnection.client.end();
    }
  }
}

function required(value, name) {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    throw new Error(`Missing or invalid ${name}.`);
  }
  return value;
}

function requiredRowString(row, field) {
  const value = row[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid M6 smoke membership ${field}.`);
  }
  return value;
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  try {
    const result = await runUlcLinzProductionPostDeploySmoke();
    console.log(JSON.stringify(result));
  } catch {
    console.error("ULC M6 production post-deploy protected smoke failed.");
    process.exitCode = 1;
  }
}
