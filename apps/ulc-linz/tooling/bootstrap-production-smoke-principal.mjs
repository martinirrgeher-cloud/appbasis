import { pathToFileURL } from "node:url";

import { createPostgresDatabase } from "@appbasis/database/node-runtime";
import { BetterAuthIdentityBackend, createIdentityRuntime } from "@appbasis/identity";
import { createBetterAuthRuntime } from "@appbasis/identity/better-auth";
import {
  PostgresPrincipalAccessAdministration,
  PostgresPermissionStore,
  principalId,
} from "@appbasis/permissions";

import { replaceUlcLinzPrincipalAccess } from "../../../tooling/ulc-linz-m5-principal-access-orchestration.mjs";

export const ULC_LINZ_M6_SMOKE_PRINCIPAL = Object.freeze({
  username: "ulc.m6.smoke",
  displayName: "ULC M6 Smoke Principal",
  organizationId: "ulc-linz-m6-smoke",
  subjectId: "ulc-linz-m6-smoke-subject",
  sourceRole: "trainer",
});

export async function bootstrapUlcLinzM6ProductionSmokePrincipal(env = process.env) {
  const databaseUrl = required(env.ULC_LINZ_PRODUCTION_DATABASE_URL, "ULC_LINZ_PRODUCTION_DATABASE_URL");
  const authSecret = required(env.ULC_LINZ_PRODUCTION_BETTER_AUTH_SECRET, "ULC_LINZ_PRODUCTION_BETTER_AUTH_SECRET");
  const adminPassword = required(env.ULC_LINZ_PRODUCTION_ADMIN_PASSWORD, "ULC_LINZ_PRODUCTION_ADMIN_PASSWORD");
  const smokePassword = required(env.ULC_LINZ_PRODUCTION_SMOKE_PASSWORD, "ULC_LINZ_PRODUCTION_SMOKE_PASSWORD");
  const baseURL = "https://app.ulc-linz.at";
  const connection = createPostgresDatabase(databaseUrl);

  try {
    const auth = createBetterAuthRuntime({ database: connection.database, baseURL, secret: authSecret });
    const bootstrapBackend = new BetterAuthIdentityBackend({ auth, sql: connection.client, baseURL });
    const adminSession = await bootstrapBackend.signInWithUsername({
      username: "ulc.production.admin",
      password: adminPassword,
    });

    try {
      const backend = new BetterAuthIdentityBackend({
        auth,
        sql: connection.client,
        baseURL,
        administrativeSessionToken: adminSession.sessionToken,
      });
      const identity = createIdentityRuntime({
        auth,
        sql: connection.client,
        baseURL,
        administrativeSessionToken: adminSession.sessionToken,
      });
      const created = await identity.service.createInitialUser({
        username: ULC_LINZ_M6_SMOKE_PRINCIPAL.username,
        displayName: ULC_LINZ_M6_SMOKE_PRINCIPAL.displayName,
        temporaryPassword: smokePassword,
      });
      const smokePrincipalId = principalId(created.identityId);

      await connection.client.begin(async (tx) => {
        await tx`
          INSERT INTO ulc_linz_membership (
            identity_id, organization_id, subject_id, source_role, active
          ) VALUES (
            ${created.identityId},
            ${ULC_LINZ_M6_SMOKE_PRINCIPAL.organizationId},
            ${ULC_LINZ_M6_SMOKE_PRINCIPAL.subjectId},
            ${ULC_LINZ_M6_SMOKE_PRINCIPAL.sourceRole},
            true
          )
          ON CONFLICT (identity_id) DO UPDATE SET
            organization_id = EXCLUDED.organization_id,
            subject_id = EXCLUDED.subject_id,
            source_role = EXCLUDED.source_role,
            active = true,
            ended_at = NULL,
            retention_exception_reason = NULL,
            retention_exception_actor = NULL,
            retention_exception_created_at = NULL,
            retention_review_at = NULL,
            updated_at = now()
        `;
      });

      const store = new PostgresPermissionStore(connection.client);
      const existing = await store.findPrincipal(smokePrincipalId);
      const administration = new PostgresPrincipalAccessAdministration(connection.client);
      await replaceUlcLinzPrincipalAccess({
        administration,
        principalId: smokePrincipalId,
        sourceRole: "trainer",
        permissions: [{ moduleKey: "countdown", canView: true, canEdit: false }],
        auditContext: {
          actorPrincipalId: principalId(adminSession.identityId),
          reason: "M6 production post-deploy smoke principal provisioning",
        },
        constraints: {
          expectedRoleIds: existing?.roleIds ?? [],
          expectedGrants: existing?.grants ?? [],
          expectedRevokes: existing?.revokes ?? [],
        },
      });

      const finalState = await store.findPrincipal(smokePrincipalId);
      if (finalState === null || finalState.roleIds.length !== 1) {
        throw new Error("M6 smoke principal permission state is incomplete.");
      }
      return Object.freeze({ identityId: created.identityId });
    } finally {
      await bootstrapBackend.endSession(adminSession.sessionToken);
    }
  } finally {
    await connection.client.end();
  }
}

function required(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing ${name}.`);
  }
  return value;
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  try {
    await bootstrapUlcLinzM6ProductionSmokePrincipal();
    console.log("ULC M6 production smoke principal is provisioned.");
  } catch {
    console.error("ULC M6 production smoke principal provisioning failed.");
    process.exitCode = 1;
  }
}
