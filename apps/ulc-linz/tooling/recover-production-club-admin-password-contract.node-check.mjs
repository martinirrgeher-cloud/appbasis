import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  assertClubAdminRecoveryTarget,
  readClubAdminRecoveryEnvironment,
} from "./recover-production-club-admin-password-contract.mjs";

const env = {
  ULC_LINZ_PRODUCTION_DATABASE_URL: "postgres://protected",
  ULC_LINZ_PRODUCTION_BETTER_AUTH_SECRET: "A".repeat(40),
  ULC_LINZ_PRODUCTION_ADMIN_PASSWORD: "TechnicalRootPassword2026",
  ULC_LINZ_CLUB_ADMIN_RESET_PASSWORD: "NewOneTimeClubAdminPassword2026!",
};
const row = {
  identity_id: "identity-1", username: "ulc.admin", role: "user",
  banned: false, disabled_at: null, must_change_password: true,
  source_role: "admin", active: true, ended_at: null, credential_id: "credential-1",
};
const principal = { roleIds: ["ulc-linz:admin"], grants: [], revokes: [] };

test("requires an 8-character minimum and distinct protected reset secret", () => {
  assert.equal(readClubAdminRecoveryEnvironment({ ...env, ULC_LINZ_CLUB_ADMIN_RESET_PASSWORD: "Abcd1234" }).temporaryPassword, "Abcd1234");
  assert.throws(() => readClubAdminRecoveryEnvironment({ ...env, ULC_LINZ_CLUB_ADMIN_RESET_PASSWORD: "Abcd123" }));
  assert.equal(readClubAdminRecoveryEnvironment(env).temporaryPassword, env.ULC_LINZ_CLUB_ADMIN_RESET_PASSWORD);
  assert.throws(() => readClubAdminRecoveryEnvironment({ ...env, ULC_LINZ_CLUB_ADMIN_RESET_PASSWORD: "short" }));
  assert.throws(() => readClubAdminRecoveryEnvironment({ ...env, ULC_LINZ_CLUB_ADMIN_RESET_PASSWORD: env.ULC_LINZ_PRODUCTION_ADMIN_PASSWORD }));
  assert.throws(() => readClubAdminRecoveryEnvironment({ ...env, ULC_LINZ_PRODUCTION_BETTER_AUTH_SECRET: "" }));
});

test("accepts only the existing active first-login ULC administrator and exact role", () => {
  assert.equal(assertClubAdminRecoveryTarget([row], principal).credential_id, "credential-1");
  assert.throws(() => assertClubAdminRecoveryTarget([], principal));
  assert.throws(() => assertClubAdminRecoveryTarget([row, row], principal));
  assert.throws(() => assertClubAdminRecoveryTarget([{ ...row, must_change_password: false }], principal));
  assert.throws(() => assertClubAdminRecoveryTarget([{ ...row, username: "ulc.production.admin" }], principal));
  assert.throws(() => assertClubAdminRecoveryTarget([{ ...row, source_role: "trainer" }], principal));
  assert.throws(() => assertClubAdminRecoveryTarget([{ ...row, role: "admin" }], principal));
  assert.throws(() => assertClubAdminRecoveryTarget([{ ...row, banned: true }], principal));
  assert.throws(() => assertClubAdminRecoveryTarget([{ ...row, disabled_at: new Date() }], principal));
  assert.throws(() => assertClubAdminRecoveryTarget([{ ...row, ended_at: new Date() }], principal));
  assert.throws(() => assertClubAdminRecoveryTarget([row], { ...principal, grants: ["extra"] }));
  assert.throws(() => assertClubAdminRecoveryTarget([row], { ...principal, roleIds: ["ulc-linz:trainer"] }));
});

test("recovery serializes on the target identity without UPDATE lock on append-only audit", () => {
  const script = readFileSync(new URL("./recover-production-club-admin-password.mjs", import.meta.url), "utf8");
  assert.match(script, /FOR UPDATE OF u,s,m,a/);
  assert.match(script, /FROM ulc_linz_operations\.club_admin_recovery_audit/);
  assert.match(script, /ORDER BY created_at DESC, operation_id DESC LIMIT 1/);
  assert.doesNotMatch(script, /ORDER BY created_at DESC, operation_id DESC LIMIT 1 FOR UPDATE/);
});
