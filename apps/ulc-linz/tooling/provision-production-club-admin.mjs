import { createPostgresDatabase } from "@appbasis/database/node-runtime";
import { BetterAuthIdentityBackend, createIdentityRuntime } from "@appbasis/identity";
import { createBetterAuthRuntime } from "@appbasis/identity/better-auth";
import { PostgresPrincipalAccessAdministration, PostgresPermissionStore, principalId } from "@appbasis/permissions";

import { parseUlcLinzProductionDatabaseUrl } from "../../../tooling/ulc-linz-m6-production-hyperdrive.mjs";

const organization = "ulc-linz";
const username = "ulc.admin";
const rootUsername = "ulc.production.admin";
const role = "ulc-linz:admin";
const capability = "ulc-linz:module:athletes:edit";
const baseURL = "https://app.ulc-linz.at";
let phase = "configuration";

function required(name) {
  const value = process.env[name];
  if (!value?.trim()) throw new Error("Missing configuration.");
  return value;
}

async function provision() {
  const databaseUrl = required("ULC_LINZ_PRODUCTION_DATABASE_URL");
  parseUlcLinzProductionDatabaseUrl(databaseUrl);
  const secret = required("ULC_LINZ_PRODUCTION_BETTER_AUTH_SECRET");
  const rootPassword = required("ULC_LINZ_PRODUCTION_ADMIN_PASSWORD");
  const temporaryPassword = required("ULC_LINZ_CLUB_ADMIN_TEMPORARY_PASSWORD");
  if (temporaryPassword.length < 20 || temporaryPassword === rootPassword) {
    throw new Error("Invalid temporary password.");
  }

  phase = "target-verification";
  const { client, database } = createPostgresDatabase(databaseUrl);
  try {
    const [target] = await client`
      SELECT current_database() AS name,
        EXISTS (
          SELECT 1 FROM public.appbasis_training_group
          WHERE organization_id = ${organization} AND is_active
        ) AS club,
        EXISTS (
          SELECT 1 FROM public.appbasis_permission_role r
          JOIN public.appbasis_permission_role_capability c USING (role_id)
          WHERE r.role_id = ${role} AND r.state = 'active' AND c.capability_id = ${capability}
        ) AS capability
    `;
    if (target.name !== "neondb" || !target.club || !target.capability) {
      throw new Error("Production club prerequisites are missing.");
    }

    phase = "root-authentication";
    const auth = createBetterAuthRuntime({ database, baseURL, secret });
    const backend = new BetterAuthIdentityBackend({ auth, sql: client, baseURL });
    const root = await backend.signInWithUsername({ username: rootUsername, password: rootPassword });
    try {
      phase = "audited-identity-provisioning";
      const identity = createIdentityRuntime({
        auth, sql: client, baseURL, administrativeSessionToken: root.sessionToken,
      });
      const admin = await identity.service.createInitialUserWithAudit({
        username, displayName: "Martin Irrgeher (ULC Administration)", temporaryPassword,
      }, {
        provisioningOwner: "ulc-linz:club-admin",
        actorPrincipalId: principalId(root.identityId),
        reason: "First regular ULC Linz production club administrator",
      });
      if (admin.accountStatus !== "active" || admin.mustChangePassword !== true) {
        throw new Error("Account is outside the first-login provisioning state.");
      }

      phase = "atomic-club-access";
      const targetPrincipalId = principalId(admin.identityId);
      await client.begin(async (tx) => {
        const [account] = await tx`
          SELECT u.role FROM public."user" u
          JOIN public.appbasis_identity_security_state s ON s.identity_id = u.id
          WHERE u.id = ${admin.identityId} AND u.username = ${username}
            AND u.banned IS NOT TRUE AND s.disabled_at IS NULL AND s.must_change_password
          FOR UPDATE OF u, s
        `;
        if (!account || account.role?.split(",").some((part) => part.trim() === "admin")) {
          throw new Error("Provisioned account is not eligible.");
        }

        await tx`
          INSERT INTO public.appbasis_permission_principal (principal_id)
          VALUES (${targetPrincipalId}) ON CONFLICT (principal_id) DO NOTHING
        `;
        await tx`
          INSERT INTO public.ulc_linz_membership (identity_id, organization_id, subject_id, source_role, active)
          VALUES (${admin.identityId}, ${organization}, ${admin.identityId}, 'admin', true)
          ON CONFLICT (identity_id) DO NOTHING
        `;
        const [membership] = await tx`
          SELECT identity_id FROM public.ulc_linz_membership
          WHERE identity_id = ${admin.identityId} AND organization_id = ${organization}
            AND subject_id = ${admin.identityId} AND source_role = 'admin'
            AND active AND ended_at IS NULL
          FOR UPDATE
        `;
        if (!membership) throw new Error("Conflicting club membership.");

        const [activeRole] = await tx`
          SELECT r.role_id FROM public.appbasis_permission_role r
          JOIN public.appbasis_permission_role_capability c USING (role_id)
          WHERE r.role_id = ${role} AND r.state = 'active' AND c.capability_id = ${capability}
          FOR SHARE OF r, c
        `;
        if (!activeRole) throw new Error("Club admin role is unavailable.");

        const sql = { unsafe: (query, params) => tx.unsafe(query, params) };
        const existing = await new PostgresPermissionStore(sql).findPrincipal(targetPrincipalId);
        if (!existing || existing.grants.length || existing.revokes.length ||
            existing.roleIds.some((existingRole) => existingRole !== role)) {
          throw new Error("Conflicting principal permissions.");
        }
        if (existing.roleIds.length === 0) {
          const administration = new PostgresPrincipalAccessAdministration({
            ...sql, begin: (callback) => callback(sql),
          });
          await administration.replacePrincipalAccess(targetPrincipalId, [role], {
            grants: [], revokes: [],
          }, {
            actorPrincipalId: principalId(root.identityId),
            reason: "First regular ULC Linz production club administrator",
          }, {
            expectedRoleIds: [], expectedGrants: [], expectedRevokes: [],
          });
        }
      });
    } finally {
      await backend.endSession(root.sessionToken);
    }
  } finally {
    await client.end({ timeout: 5 });
  }
}

try {
  await provision();
  console.log("Provisioning PASS. First password change and app login are pending.");
} catch {
  console.error(`Provisioning FAIL (${phase}).`);
  process.exitCode = 1;
}
