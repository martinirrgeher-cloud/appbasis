const USERNAME = "ulc.admin";
const ROLE = "ulc-linz:admin";

function required(env, name) {
  const value = env[name];
  if (typeof value !== "string" || !value.length || value !== value.trim()) {
    throw new Error("Missing or invalid protected reset configuration.");
  }
  return value;
}

export function readClubAdminRecoveryEnvironment(env) {
  const databaseUrl = required(env, "ULC_LINZ_PRODUCTION_DATABASE_URL");
  const authSecret = required(env, "ULC_LINZ_PRODUCTION_BETTER_AUTH_SECRET");
  const rootPassword = required(env, "ULC_LINZ_PRODUCTION_ADMIN_PASSWORD");
  const temporaryPassword = required(env, "ULC_LINZ_CLUB_ADMIN_RESET_PASSWORD");
  if (
    authSecret.length < 32 ||
    rootPassword.length < 8 ||
    temporaryPassword.length < 8 ||
    temporaryPassword.length > 128 ||
    /[\u0000-\u001f\u007f]/.test(temporaryPassword) ||
    temporaryPassword === rootPassword
  ) {
    throw new Error("Protected reset password or authentication policy failed.");
  }
  return Object.freeze({ databaseUrl, authSecret, rootPassword, temporaryPassword });
}

export function assertClubAdminRecoveryTarget(rows, principal) {
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error("Existing ULC club administrator target is missing or ambiguous.");
  }
  const row = rows[0];
  if (
    typeof row.identity_id !== "string" ||
    row.identity_id.length === 0 ||
    row.username !== USERNAME ||
    row.banned === true ||
    row.disabled_at !== null ||
    row.must_change_password !== true ||
    row.source_role !== "admin" ||
    row.active !== true ||
    row.ended_at !== null ||
    typeof row.credential_id !== "string" ||
    row.credential_id.length === 0 ||
    (typeof row.role === "string" &&
      row.role.split(",").some((part) => ["admin", "superadmin"].includes(part.trim())))
  ) {
    throw new Error("Existing ULC club administrator is not eligible for first-login recovery.");
  }
  if (
    !principal ||
    !Array.isArray(principal.roleIds) ||
    principal.roleIds.length !== 1 ||
    principal.roleIds[0] !== ROLE ||
    !Array.isArray(principal.grants) ||
    principal.grants.length !== 0 ||
    !Array.isArray(principal.revokes) ||
    principal.revokes.length !== 0
  ) {
    throw new Error("Existing ULC club administrator permissions differ from approved scope.");
  }
  return row;
}
