import { pathToFileURL } from "node:url";

import { createPostgresDatabase } from "@appbasis/database/node-runtime";
import { BetterAuthIdentityBackend, createIdentityRuntime } from "@appbasis/identity";
import { createBetterAuthRuntime } from "@appbasis/identity/better-auth";
import {
  PostgresPrincipalAccessAdministration,
  PostgresPermissionStore,
  principalId,
} from "@appbasis/permissions";

import { mapUlcLinzManagedPermissionsToPrincipalOverrides } from "../../../tooling/ulc-linz-m5-principal-permission-mapping.mjs";
import { ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY } from "../../../tooling/ulc-linz-m5-role-data-scope.mjs";
import { parseUlcLinzProductionDatabaseUrl } from "../../../tooling/ulc-linz-m6-production-hyperdrive.mjs";

export const ULC_LINZ_M6_SMOKE_PRINCIPAL = Object.freeze({
  username: "ulc.m6.smoke",
  displayName: "ULC M6 Smoke Principal",
  organizationId: "ulc-linz-m6-smoke",
  subjectId: "ulc-linz-m6-smoke-subject",
  sourceRole: "trainer",
});

const PRODUCTION_ADMIN_USERNAME = "ulc.production.admin";
const SMOKE_PASSWORD_CHANGE_IDEMPOTENCY_KEY = "7b04a4e0-cc5a-4d74-9ba5-62ae25d22156";
const SMOKE_PASSWORD_RECOVERY_SESSION_TOKEN = "m6-smoke-password-change-recovery";
let smokeBootstrapDiagnosticPhase = "not-started";

function setSmokeBootstrapDiagnosticPhase(phase) {
  smokeBootstrapDiagnosticPhase = phase;
}

function classifyPermissionWriteFailure(error) {
  const code = typeof error === "object" && error !== null && "code" in error
    ? error.code
    : undefined;
  switch (code) {
    case "ROLE_NOT_FOUND":
    case "REQUIRED_ROLE_NOT_ACTIVE":
      return "permission-write-role-missing";
    case "UNKNOWN_CAPABILITY":
      return "permission-write-capability-missing";
    case "STALE_PRINCIPAL_ROLES":
    case "STALE_PRINCIPAL_PERMISSIONS":
      return "permission-write-stale-state";
    case "PRINCIPAL_NOT_FOUND":
      return "permission-write-principal-missing";
    case "INVALID_AUDIT_CONTEXT":
    case "INVALID_OVERRIDES":
    case "INVALID_ROLE":
    case "LAST_CAPABILITY_HOLDER":
    case "LAST_REQUIRED_ROLE_HOLDER":
    case "REQUIRED_ROLE_HOLDER_SCOPE_REQUIRED":
    case "TARGET_PRINCIPAL_OUTSIDE_REQUIRED_ROLE_SCOPE":
      return "permission-write-contract";
    default:
      return "permission-write-db";
  }
}

export async function bootstrapUlcLinzM6ProductionSmokePrincipal(env = process.env) {
  setSmokeBootstrapDiagnosticPhase("input-validation");
  const databaseUrl = required(env.ULC_LINZ_PRODUCTION_DATABASE_URL, "ULC_LINZ_PRODUCTION_DATABASE_URL");
  parseUlcLinzProductionDatabaseUrl(databaseUrl);

  const authSecret = required(env.ULC_LINZ_PRODUCTION_BETTER_AUTH_SECRET, "ULC_LINZ_PRODUCTION_BETTER_AUTH_SECRET");
  const adminPassword = required(env.ULC_LINZ_PRODUCTION_ADMIN_PASSWORD, "ULC_LINZ_PRODUCTION_ADMIN_PASSWORD");
  const bootstrapPassword = required(
    env.ULC_LINZ_PRODUCTION_SMOKE_BOOTSTRAP_PASSWORD,
    "ULC_LINZ_PRODUCTION_SMOKE_BOOTSTRAP_PASSWORD",
  );
  const smokePassword = required(env.ULC_LINZ_PRODUCTION_SMOKE_PASSWORD, "ULC_LINZ_PRODUCTION_SMOKE_PASSWORD");
  if (
    adminPassword === bootstrapPassword ||
    adminPassword === smokePassword ||
    bootstrapPassword === smokePassword
  ) {
    throw new Error("Production admin, M6 smoke bootstrap and steady-state passwords must all be distinct.");
  }

  const baseURL = "https://app.ulc-linz.at";
  setSmokeBootstrapDiagnosticPhase("database-connect");
  const connection = createPostgresDatabase(databaseUrl);

  try {
    const auth = createBetterAuthRuntime({ database: connection.database, baseURL, secret: authSecret });
    const bootstrapBackend = new BetterAuthIdentityBackend({ auth, sql: connection.client, baseURL });
    setSmokeBootstrapDiagnosticPhase("admin-login");
    const adminSession = await bootstrapBackend.signInWithUsername({
      username: PRODUCTION_ADMIN_USERNAME,
      password: adminPassword,
    });

    try {
      setSmokeBootstrapDiagnosticPhase("admin-evidence");
      await assertReusableProductionAdminEvidence(connection.client, adminSession.identityId);

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
      setSmokeBootstrapDiagnosticPhase("create-user");
      const created = await identity.service.createInitialUser({
        username: ULC_LINZ_M6_SMOKE_PRINCIPAL.username,
        displayName: ULC_LINZ_M6_SMOKE_PRINCIPAL.displayName,
        temporaryPassword: bootstrapPassword,
      });

      if (created.mustChangePassword === true) {
        setSmokeBootstrapDiagnosticPhase("password-transition");
        let initial;
        try {
          initial = await identity.service.signInWithUsername({
            username: ULC_LINZ_M6_SMOKE_PRINCIPAL.username,
            password: bootstrapPassword,
          });
        } catch {
          initial = null;
        }

        const changed = await identity.service.changeRequiredPassword({
          sessionToken: initial?.sessionToken ?? SMOKE_PASSWORD_RECOVERY_SESSION_TOKEN,
          currentPassword: bootstrapPassword,
          newPassword: smokePassword,
          idempotencyKey: SMOKE_PASSWORD_CHANGE_IDEMPOTENCY_KEY,
        });
        if (initial !== null && (initial.identity.identityId !== created.identityId || initial.access !== "password-change-required")) {
          throw new Error("M6 smoke principal bootstrap session is inconsistent.");
        }
        if (changed.identity.identityId !== created.identityId || changed.access !== "full") {
          throw new Error("M6 smoke principal password transition did not reach full access.");
        }
        await backend.endSession(changed.sessionToken);
      }

      setSmokeBootstrapDiagnosticPhase("steady-state-login");
      const steadyState = await identity.service.signInWithUsername({
        username: ULC_LINZ_M6_SMOKE_PRINCIPAL.username,
        password: smokePassword,
      });
      if (steadyState.identity.identityId !== created.identityId || steadyState.access !== "full") {
        throw new Error("M6 smoke principal steady-state credential is invalid.");
      }
      await backend.endSession(steadyState.sessionToken);

      const smokePrincipalId = principalId(created.identityId);
      setSmokeBootstrapDiagnosticPhase("membership");
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
      setSmokeBootstrapDiagnosticPhase("permission-read-existing");
      let existing = await store.findPrincipal(smokePrincipalId);

      if (existing === null) {
        setSmokeBootstrapDiagnosticPhase("permission-principal-register");
        await connection.client.begin(async (tx) => {
          await tx`
            INSERT INTO appbasis_permission_principal (principal_id)
            VALUES (${smokePrincipalId})
            ON CONFLICT (principal_id) DO NOTHING
          `;
        });
        setSmokeBootstrapDiagnosticPhase("permission-read-registered");
        existing = await store.findPrincipal(smokePrincipalId);
        if (existing === null) {
          throw new Error("M6 smoke permission principal registration did not become visible.");
        }
      }

      setSmokeBootstrapDiagnosticPhase("permission-role-guard");
      const adminRuntimeRoleId = ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY.runtimeRoleIds.admin;
      if (existing.roleIds.includes(adminRuntimeRoleId)) {
        throw new Error("Dedicated M6 smoke principal must never replace an administrator role.");
      }

      setSmokeBootstrapDiagnosticPhase("permission-map");
      const smokeRuntimeRoleId = ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY.runtimeRoleIds.trainer;
      const smokeOverrides = mapUlcLinzManagedPermissionsToPrincipalOverrides({
        sourceRole: ULC_LINZ_M6_SMOKE_PRINCIPAL.sourceRole,
        permissions: [{ moduleKey: "countdown", canView: true, canEdit: false }],
      });

      setSmokeBootstrapDiagnosticPhase("permission-write");
      const administration = new PostgresPrincipalAccessAdministration(connection.client);
      try {
        await administration.replacePrincipalAccess(
          smokePrincipalId,
          [smokeRuntimeRoleId],
          smokeOverrides,
          {
            actorPrincipalId: principalId(adminSession.identityId),
            reason: "M6 production post-deploy smoke principal provisioning",
          },
          {
            expectedRoleIds: existing.roleIds,
            expectedGrants: existing.grants,
            expectedRevokes: existing.revokes,
          },
        );
      } catch (error) {
        setSmokeBootstrapDiagnosticPhase(classifyPermissionWriteFailure(error));
        throw error;
      }

      setSmokeBootstrapDiagnosticPhase("permission-read-final");
      const finalState = await store.findPrincipal(smokePrincipalId);

      setSmokeBootstrapDiagnosticPhase("permission-verify");
      if (
        finalState === null ||
        finalState.roleIds.length !== 1 ||
        finalState.roleIds[0] !== smokeRuntimeRoleId ||
        finalState.grants.length !== smokeOverrides.grants.length ||
        finalState.revokes.length !== smokeOverrides.revokes.length ||
        smokeOverrides.grants.some((capability) => !finalState.grants.includes(capability)) ||
        smokeOverrides.revokes.some((capability) => !finalState.revokes.includes(capability))
      ) {
        throw new Error("M6 smoke principal permission state is incomplete.");
      }
      setSmokeBootstrapDiagnosticPhase("complete");
      return Object.freeze({ identityId: created.identityId });
    } finally {
      await bootstrapBackend.endSession(adminSession.sessionToken);
    }
  } finally {
    await connection.client.end();
  }
}

async function assertReusableProductionAdminEvidence(sql, identityId) {
  const rows = await sql`
    SELECT username, role, banned
    FROM "user"
    WHERE id = ${identityId}
    LIMIT 1
  `;
  const admin = rows[0];
  if (
    admin === undefined ||
    admin.username !== PRODUCTION_ADMIN_USERNAME ||
    admin.role !== "admin" ||
    admin.banned === true
  ) {
    throw new Error("Reusable production administrator evidence is invalid.");
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
    console.log("ULC M6 production smoke principal is provisioned for steady-state smoke use.");
  } catch {
    console.error(`ULC M6 production smoke principal provisioning failed at phase: ${smokeBootstrapDiagnosticPhase}.`);
    process.exitCode = 1;
  }
}
