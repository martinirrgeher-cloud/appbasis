import { pathToFileURL } from "node:url";

import { createPostgresDatabase } from "@appbasis/database/node-runtime";
import { BetterAuthIdentityBackend, createIdentityRuntime } from "@appbasis/identity";
import { createBetterAuthRuntime } from "@appbasis/identity/better-auth";
import {
  DEMO_KNOWN_CAPABILITIES,
  DEMO_ROLE_BUNDLES,
  DEMO_ROLES,
  PostgresPermissionStore,
  principalId,
} from "@appbasis/permissions";
import { provisionPostgresPermissions } from "@appbasis/permissions/provisioning";

import {
  assertExactM3PreviewSmokePermissionState,
  assertM3PreviewSmokePermissionStateReadyForProvisioning,
  M3PreviewSmokeBootstrapAuthenticationError,
  M3PreviewSmokeBootstrapStateError,
  readM3PreviewSmokeBootstrapEnvironment,
} from "./bootstrap-smoke-principals-contract.mjs";
import { M3_PREVIEW_SMOKE_CONTRACT } from "../../../tooling/m3-preview-smoke-contract.mjs";

export async function bootstrapM3PreviewSmokePrincipals(
  env = process.env,
  provision = provisionM3PreviewSmokePrincipals,
) {
  return provision(readM3PreviewSmokeBootstrapEnvironment(env));
}

export async function provisionM3PreviewSmokePrincipals(options) {
  const connection = createPostgresDatabase(options.connectionString);
  try {
    const auth = createBetterAuthRuntime({
      database: connection.database,
      baseURL: options.baseURL,
      secret: options.secret,
    });
    const backend = new BetterAuthIdentityBackend({
      auth,
      sql: connection.client,
      baseURL: options.baseURL,
    });

    let administratorSession;
    try {
      administratorSession = await backend.signInWithUsername({
        username: M3_PREVIEW_SMOKE_CONTRACT.rootAdmin.username,
        password: options.rootAdminPassword,
      });
    } catch {
      throw new M3PreviewSmokeBootstrapAuthenticationError();
    }

    try {
      const identity = createIdentityRuntime({
        auth,
        sql: connection.client,
        baseURL: options.baseURL,
        administrativeSessionToken: administratorSession.sessionToken,
      });
      const allowed = await identity.service.createInitialUser({
        username: M3_PREVIEW_SMOKE_CONTRACT.allowed.username,
        displayName: M3_PREVIEW_SMOKE_CONTRACT.allowed.displayName,
        temporaryPassword: options.allowedTemporaryPassword,
      });
      const denied = await identity.service.createInitialUser({
        username: M3_PREVIEW_SMOKE_CONTRACT.denied.username,
        displayName: M3_PREVIEW_SMOKE_CONTRACT.denied.displayName,
        temporaryPassword: options.deniedTemporaryPassword,
      });

      const store = new PostgresPermissionStore(connection.client);
      await assertM3PreviewSmokePermissionStateReadyForProvisioning(store, {
        allowedIdentityId: allowed.identityId,
        deniedIdentityId: denied.identityId,
      });

      await provisionPostgresPermissions(connection.client, {
        knownCapabilities: DEMO_KNOWN_CAPABILITIES,
        roles: DEMO_ROLE_BUNDLES,
        principalRoleAssignments: [
          {
            principalId: principalId(allowed.identityId),
            roleIds: [DEMO_ROLES.member],
          },
          {
            principalId: principalId(denied.identityId),
            roleIds: [],
          },
        ],
      });

      await assertExactM3PreviewSmokePermissionState(store, {
        allowedIdentityId: allowed.identityId,
        deniedIdentityId: denied.identityId,
      });

      return Object.freeze({
        allowedIdentityId: allowed.identityId,
        deniedIdentityId: denied.identityId,
      });
    } finally {
      await backend.endSession(administratorSession.sessionToken);
      if ((await backend.getSession(administratorSession.sessionToken)) !== null) {
        throw new M3PreviewSmokeBootstrapStateError(
          "m3-preview smoke bootstrap administrator session cleanup failed.",
        );
      }
    }
  } finally {
    await connection.client.end();
  }
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  try {
    await bootstrapM3PreviewSmokePrincipals();
    console.log("m3-preview smoke principal bootstrap completed.");
  } catch {
    console.error("m3-preview smoke principal bootstrap failed.");
    process.exitCode = 1;
  }
}
