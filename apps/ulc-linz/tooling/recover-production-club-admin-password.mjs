import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { hashPassword, verifyPassword } from "@appbasis/identity/credential-hashing";
import { createPostgresDatabase } from "@appbasis/database/node-runtime";
import { BetterAuthIdentityBackend } from "@appbasis/identity";
import { createBetterAuthRuntime } from "@appbasis/identity/better-auth";
import { PostgresPermissionStore, principalId } from "@appbasis/permissions";

import { parseUlcLinzProductionDatabaseUrl } from "../../../tooling/ulc-linz-m6-production-hyperdrive.mjs";
import {
  assertClubAdminRecoveryTarget,
  readClubAdminRecoveryEnvironment,
} from "./recover-production-club-admin-password-contract.mjs";

const ROOT_USERNAME = "ulc.production.admin";
const TARGET_USERNAME = "ulc.admin";
const ORIGIN = "https://app.ulc-linz.at";
// Fixed, non-secret phase labels permit actionable diagnostics without credentials.
let protectedRecoveryPhase = "configuration";

export async function recoverProductionClubAdminPassword(env = process.env) {
  protectedRecoveryPhase = "configuration";
  const config = readClubAdminRecoveryEnvironment(env);
  parseUlcLinzProductionDatabaseUrl(config.databaseUrl);
  const connection = createPostgresDatabase(config.databaseUrl);
  let rootSession = null;
  let recoveryBodySucceeded = false;
  try {
    const auth = createBetterAuthRuntime({
      database: connection.database,
      baseURL: ORIGIN,
      secret: config.authSecret,
    });
    const backend = new BetterAuthIdentityBackend({
      auth,
      sql: connection.client,
      baseURL: ORIGIN,
    });
    protectedRecoveryPhase = "technical-root-authentication";
    rootSession = await backend.signInWithUsername({
      username: ROOT_USERNAME,
      password: config.rootPassword,
    });
    protectedRecoveryPhase = "technical-root-authorization";
    const rootRows = await connection.client.unsafe(
      'SELECT id, username, role, banned FROM public."user" WHERE id=$1 AND username=$2',
      [rootSession.identityId, ROOT_USERNAME],
    );
    if (
      rootRows.length !== 1 ||
      rootRows[0].banned === true ||
      !rootRows[0].role?.split(",").map((part) => part.trim()).includes("admin")
    ) {
      throw new Error("Authenticated technical production root proof failed.");
    }

    // This operation must never run before the additive migration and DB guard.
    protectedRecoveryPhase = "recovery-schema-validation";
    const [schema] = await connection.client.unsafe(
      "SELECT to_regclass($1) AS audit_table, " +
      "EXISTS (SELECT 1 FROM pg_catalog.pg_trigger " +
      "WHERE tgrelid='public.account'::regclass AND tgname=$2 AND tgenabled='O') AS credential_guard, " +
      "EXISTS (SELECT 1 FROM pg_catalog.pg_trigger " +
      "WHERE tgrelid='public.session'::regclass AND tgname=$3 AND tgenabled='O') AS session_guard",
      ["ulc_linz_operations.club_admin_recovery_audit",
       "ulc_linz_club_admin_credential_expiry",
       "ulc_linz_club_admin_session_expiry"],
    );
    if (!schema?.audit_table || schema.credential_guard !== true || schema.session_guard !== true) {
      throw new Error("Recovery schema or expiry trigger unavailable.");
    }

    protectedRecoveryPhase = "new-password-hashing";
    const newHash = await hashPassword(config.temporaryPassword);
    if (!(await verifyPassword({ hash: newHash, password: config.temporaryPassword }))) {
      throw new Error("Password hashing self-check failed.");
    }

    await connection.client.begin(async (tx) => {
      protectedRecoveryPhase = "existing-admin-lock";
      const rows = await tx.unsafe(
        'SELECT u.id AS identity_id, u.username, u.role, u.banned, s.disabled_at, ' +
          's.must_change_password, m.source_role, m.active, m.ended_at, a.id AS credential_id ' +
          'FROM public."user" u ' +
          'JOIN public.appbasis_identity_security_state s ON s.identity_id=u.id ' +
          'JOIN public.ulc_linz_membership m ON m.identity_id=u.id AND m.organization_id=$1 ' +
          'JOIN public.account a ON a.user_id=u.id AND a.provider_id=$2 ' +
          'WHERE u.username=$3 FOR UPDATE OF u,s,m,a',
        ["ulc-linz", "credential", TARGET_USERNAME],
      );
      const targetId = rows.length === 1 ? rows[0].identity_id : null;
      const permissions =
        typeof targetId === "string"
          ? await new PostgresPermissionStore({
              unsafe: (query, parameters) => tx.unsafe(query, parameters),
            }).findPrincipal(principalId(targetId))
          : null;
      protectedRecoveryPhase = "existing-admin-permissions";
      const target = assertClubAdminRecoveryTarget(rows, permissions);
      protectedRecoveryPhase = "append-only-audit-read";
      const prior = await tx.unsafe(
        "SELECT operation_id, expires_at FROM ulc_linz_operations.club_admin_recovery_audit " +
          "WHERE organization_id=$1 AND target_identity_id=$2 " +
          // Existing FOR UPDATE OF u,s,m,a serializes concurrent recovery on this identity.
          // Keep the audit table append-only: the app role has SELECT+INSERT, not UPDATE.
          "ORDER BY created_at DESC, operation_id DESC LIMIT 1",
        ["ulc-linz", target.identity_id],
      );
      if (prior.length > 0 && new Date(prior[0].expires_at).getTime() > Date.now()) {
        throw new Error("A live first-login recovery is already pending.");
      }
      protectedRecoveryPhase = "append-only-audit-insert";
      const audit = await tx.unsafe(
        "INSERT INTO ulc_linz_operations.club_admin_recovery_audit " +
          "(operation_id, organization_id, actor_principal_id, target_identity_id, " +
          "reason, created_at, expires_at, retained_until) " +
          "VALUES ($1,$2,$3,$4,$5,now(),now()+interval '2 hours'," +
          "now()+interval '1 year') RETURNING operation_id",
        [randomUUID(), "ulc-linz", rootSession.identityId, target.identity_id,
         "Authorized existing ULC administrator first-login password recovery"],
      );
      if (audit.length !== 1) throw new Error("Recovery audit event was not unique.");
      protectedRecoveryPhase = "credential-update";
      const changed = await tx.unsafe(
        "UPDATE public.account SET password=$1, updated_at=now() " +
          "WHERE id=$2 AND user_id=$3 AND provider_id='credential' RETURNING id",
        [newHash, target.credential_id, target.identity_id],
      );
      if (changed.length !== 1) throw new Error("Credential reset was not unique.");
      protectedRecoveryPhase = "mandatory-password-change-state";
      const state = await tx.unsafe(
        "UPDATE public.appbasis_identity_security_state " +
          "SET must_change_password=true, password_changed_at=NULL, updated_at=now() " +
          "WHERE identity_id=$1 AND disabled_at IS NULL AND must_change_password=true " +
          "RETURNING identity_id",
        [target.identity_id],
      );
      if (state.length !== 1) throw new Error("First-login state changed during reset.");
      protectedRecoveryPhase = "existing-session-revoke";
      await tx.unsafe('DELETE FROM public."session" WHERE user_id=$1', [
        target.identity_id,
      ]);
    });
    recoveryBodySucceeded = true;
  } finally {
    try {
      if (rootSession !== null) {
        if (recoveryBodySucceeded) protectedRecoveryPhase = "technical-root-session-cleanup";
        const auth = createBetterAuthRuntime({
          database: connection.database,
          baseURL: ORIGIN,
          secret: config.authSecret,
        });
        await new BetterAuthIdentityBackend({
          auth,
          sql: connection.client,
          baseURL: ORIGIN,
        }).endSession(rootSession.sessionToken);
      }
    } finally {
      await connection.client.end({ timeout: 5 });
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await recoverProductionClubAdminPassword();
    console.log("ULC club admin first-login password recovery PASS; mandatory change pending.");
  } catch {
    console.error("ULC club admin password recovery FAIL at protected phase: " + protectedRecoveryPhase + "; credentials withheld.");
    process.exitCode = 1;
  }
}
