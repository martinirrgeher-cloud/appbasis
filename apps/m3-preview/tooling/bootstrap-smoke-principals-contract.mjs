import { M3_PREVIEW_SMOKE_CONTRACT } from "../../../tooling/m3-preview-smoke-contract.mjs";

const MINIMUM_PASSWORD_LENGTH = 8;
const MAXIMUM_PASSWORD_LENGTH = 128;

export class M3PreviewSmokeBootstrapEnvironmentError extends Error {
  constructor(message) {
    super(message);
    this.name = "M3PreviewSmokeBootstrapEnvironmentError";
  }
}

export class M3PreviewSmokeBootstrapAuthenticationError extends Error {
  constructor() {
    super("m3-preview smoke bootstrap administrator authentication failed.");
    this.name = "M3PreviewSmokeBootstrapAuthenticationError";
  }
}

export class M3PreviewSmokeBootstrapStateError extends Error {
  constructor(message) {
    super(message);
    this.name = "M3PreviewSmokeBootstrapStateError";
  }
}

export function readM3PreviewSmokeBootstrapEnvironment(env = process.env) {
  if (env.APPBASIS_M3_SMOKE_BOOTSTRAP_TARGET !== M3_PREVIEW_SMOKE_CONTRACT.target) {
    throw new M3PreviewSmokeBootstrapEnvironmentError(
      "APPBASIS_M3_SMOKE_BOOTSTRAP_TARGET must equal m3-preview.",
    );
  }
  if (env.APPBASIS_M3_SMOKE_BOOTSTRAP_APPLY !== "1") {
    throw new M3PreviewSmokeBootstrapEnvironmentError(
      "m3-preview smoke principal bootstrap was not explicitly confirmed.",
    );
  }

  const rootAdminPassword = requiredPassword(
    env.APPBASIS_ROOT_ADMIN_PASSWORD,
    "APPBASIS_ROOT_ADMIN_PASSWORD",
  );
  const allowedTemporaryPassword = requiredPassword(
    env.APPBASIS_SMOKE_ALLOWED_TEMPORARY_PASSWORD,
    "APPBASIS_SMOKE_ALLOWED_TEMPORARY_PASSWORD",
  );
  const deniedTemporaryPassword = requiredPassword(
    env.APPBASIS_SMOKE_DENIED_TEMPORARY_PASSWORD,
    "APPBASIS_SMOKE_DENIED_TEMPORARY_PASSWORD",
  );
  if (
    rootAdminPassword === allowedTemporaryPassword ||
    rootAdminPassword === deniedTemporaryPassword ||
    allowedTemporaryPassword === deniedTemporaryPassword
  ) {
    throw new M3PreviewSmokeBootstrapEnvironmentError(
      "m3-preview bootstrap credentials must be distinct.",
    );
  }

  return Object.freeze({
    connectionString: requiredPostgresURL(env.APPBASIS_DATABASE_URL),
    secret: requiredSecret(env.APPBASIS_BETTER_AUTH_SECRET),
    baseURL: requiredHttpsOrigin(env.APPBASIS_GENERATED_PREVIEW_URL),
    rootAdminPassword,
    allowedTemporaryPassword,
    deniedTemporaryPassword,
  });
}

export async function assertM3PreviewSmokePermissionStateReadyForProvisioning(
  store,
  { allowedIdentityId, deniedIdentityId },
) {
  const allowed = await store.findPrincipal(allowedIdentityId);
  const denied = await store.findPrincipal(deniedIdentityId);
  if (
    allowed !== null &&
    !isEmptyPermissionState(allowed) &&
    !isExactAllowedPermissionState(allowed)
  ) {
    throw new M3PreviewSmokeBootstrapStateError(
      "m3-preview allowed smoke principal has unsafe pre-existing permission state.",
    );
  }
  if (denied !== null && !isEmptyPermissionState(denied)) {
    throw new M3PreviewSmokeBootstrapStateError(
      "m3-preview denied smoke principal has unsafe pre-existing permission state.",
    );
  }
}

export async function assertExactM3PreviewSmokePermissionState(
  store,
  { allowedIdentityId, deniedIdentityId },
) {
  const allowed = await store.findPrincipal(allowedIdentityId);
  const denied = await store.findPrincipal(deniedIdentityId);
  if (!isExactAllowedPermissionState(allowed)) {
    throw new M3PreviewSmokeBootstrapStateError(
      "m3-preview allowed smoke principal has unexpected permission state.",
    );
  }
  if (!isEmptyPermissionState(denied)) {
    throw new M3PreviewSmokeBootstrapStateError(
      "m3-preview denied smoke principal has unexpected permission state.",
    );
  }
}

function isExactAllowedPermissionState(value) {
  return (
    value !== null &&
    value.roleIds.length === 1 &&
    value.roleIds[0] === M3_PREVIEW_SMOKE_CONTRACT.allowedRoleId &&
    value.grants.length === 0 &&
    value.revokes.length === 0
  );
}

function isEmptyPermissionState(value) {
  return (
    value !== null &&
    value.roleIds.length === 0 &&
    value.grants.length === 0 &&
    value.revokes.length === 0
  );
}

function requiredPostgresURL(value) {
  const normalized = requiredTrimmed(value, "APPBASIS_DATABASE_URL");
  let url;
  try {
    url = new URL(normalized);
  } catch {
    throw new M3PreviewSmokeBootstrapEnvironmentError(
      "APPBASIS_DATABASE_URL must be a PostgreSQL URL.",
    );
  }
  if (
    (url.protocol !== "postgres:" && url.protocol !== "postgresql:") ||
    url.hostname.length === 0 ||
    url.pathname.length <= 1
  ) {
    throw new M3PreviewSmokeBootstrapEnvironmentError(
      "APPBASIS_DATABASE_URL must be a PostgreSQL URL.",
    );
  }
  return normalized;
}

function requiredSecret(value) {
  const normalized = requiredTrimmed(value, "APPBASIS_BETTER_AUTH_SECRET");
  if (normalized.length < 32) {
    throw new M3PreviewSmokeBootstrapEnvironmentError(
      "APPBASIS_BETTER_AUTH_SECRET must contain at least 32 characters.",
    );
  }
  return normalized;
}

function requiredHttpsOrigin(value) {
  const normalized = requiredTrimmed(value, "APPBASIS_GENERATED_PREVIEW_URL");
  let url;
  try {
    url = new URL(normalized);
  } catch {
    throw new M3PreviewSmokeBootstrapEnvironmentError(
      "APPBASIS_GENERATED_PREVIEW_URL must be a canonical HTTPS origin.",
    );
  }
  if (
    url.protocol !== "https:" ||
    url.hostname.length === 0 ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    (url.pathname !== "" && url.pathname !== "/") ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw new M3PreviewSmokeBootstrapEnvironmentError(
      "APPBASIS_GENERATED_PREVIEW_URL must be a canonical HTTPS origin.",
    );
  }
  return url.origin;
}

function requiredPassword(value, field) {
  if (
    typeof value !== "string" ||
    value.length < MINIMUM_PASSWORD_LENGTH ||
    value.length > MAXIMUM_PASSWORD_LENGTH ||
    value.trim().length === 0
  ) {
    throw new M3PreviewSmokeBootstrapEnvironmentError(
      `${field} must contain ${MINIMUM_PASSWORD_LENGTH}-${MAXIMUM_PASSWORD_LENGTH} characters.`,
    );
  }
  return value;
}

function requiredTrimmed(value, field) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized.length === 0) {
    throw new M3PreviewSmokeBootstrapEnvironmentError(`${field} is required.`);
  }
  return normalized;
}
