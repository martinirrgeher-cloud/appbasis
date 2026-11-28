import { pathToFileURL } from "node:url";
import { hashPassword, verifyPassword } from "better-auth/crypto";
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

export async function recoverProductionClubAdminPassword(env = process.env) {
  const config = readClubAdminRecoveryEnvironment(env);
  parseUlcLinzProductionDatabaseUrl(config.databaseUrl);
  const connection = createPostgresDatabase(config.databaseUrl);
  let rootSession = null;
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
    rootSession = await backend.signInWithUsername({
      username: ROOT_USERNAME,
      password: config.rootPassword,
    });
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

    const newHash = await hashPassword(config.temporaryPassword);
    if (!(await verifyPassword({ hash: newHash, password: config.temporaryPassword }))) {
      throw new Error("Password hashing self-check failed.");
    }

    await connection.client.begin(async (tx) => {
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
      const target = assertClubAdminRecoveryTarget(rows, permissions);
      const changed = await tx.unsafe(
        "UPDATE public.account SET password=$1, updated_at=now() " +
          "WHERE id=$2 AND user_id=$3 AND provider_id='credential' RETURNING id",
        [newHash, target.credential_id, target.identity_id],
      );
      if (changed.length !== 1) throw new Error("Credential reset was not unique.");
      const state = await tx.unsafe(
        "UPDATE public.appbasis_identity_security_state " +
          "SET must_change_password=true, password_changed_at=NULL, updated_at=now() " +
          "WHERE identity_id=$1 AND disabled_at IS NULL AND must_change_password=true " +
          "RETURNING identity_id",
        [target.identity_id],
      );
      if (state.length !== 1) throw new Error("First-login state changed during reset.");
      await tx.unsafe('DELETE FROM public."session" WHERE user_id=$1', [
        target.identity_id,
      ]);
    });
  } finally {
    try {
      if (rootSession !== null) {
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
    console.error("ULC club admin password recovery FAIL; inspect protected status, never print credentials.");
    process.exitCode = 1;
  }
}
