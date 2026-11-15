/**
 * Pilot-only P03-I transactional write guard.
 *
 * Cloudflare Hyperdrive gives Workers a dynamic proxy connectionString.
 * Its URL host, username and database path are transport details and MUST
 * NOT be mistaken for the underlying Neon origin identity.
 *
 * The ULC E6H deploy workflow independently validates source PostgreSQL
 * database, endpoint, owner/application/security-log roles and the two
 * cache-disabled Hyperdrive configs before rendering a build-bound marker.
 * The marker is NOT a credential, and does not replace DB access controls.
 */
export type PilotTrainingWriteGuardActivation =
  | "disabled"
  | "enabled"
  | "invalid";

const PILOT_ENABLE_VALUE = "p03i-preview";
const PILOT_DISABLE_VALUE = "disabled";
const EXACT_PREVIEW_RUNTIME = "generated-preview-ulc-linz";
const EXACT_PREVIEW_APP = "ulc-linz";
const ORIGIN_ATTESTATION_PREFIX = "e6h-origin-checked:";
const BUILD_SHA_PATTERN = /^[a-f0-9]{40}$/;

function previewScope(env: Record<string, unknown>): boolean {
  return env.APPBASIS_RUNTIME_ENVIRONMENT === EXACT_PREVIEW_RUNTIME &&
    env.APPBASIS_GENERATED_APP_ID === EXACT_PREVIEW_APP;
}

function originAttestedForBuild(env: Record<string, unknown>): boolean {
  const buildSha = env.APPBASIS_BUILD_SHA;
  return typeof buildSha === "string" &&
    BUILD_SHA_PATTERN.test(buildSha) &&
    env.APPBASIS_ULC_P03I_ORIGIN_ATTESTATION ===
      `${ORIGIN_ATTESTATION_PREFIX}${buildSha}`;
}

function validProxyConnectionString(connectionString: unknown): boolean {
  if (typeof connectionString !== "string" ||
      connectionString.trim() !== connectionString) return false;
  try {
    const url = new URL(connectionString);
    return (url.protocol === "postgres:" || url.protocol === "postgresql:") &&
      url.hostname.length > 0 &&
      url.username.length > 0 &&
      url.pathname.length > 1 &&
      url.hash === "";
  } catch {
    return false;
  }
}

export function pilotTrainingWriteGuardActivation(
  env: Record<string, unknown>,
  appConnectionString: string,
  securityLogConnectionString: string,
): PilotTrainingWriteGuardActivation {
  const setting = env.APPBASIS_ULC_PILOT_TRAINING_WRITE_GUARD;
  if (setting === undefined || setting === PILOT_DISABLE_VALUE) return "disabled";
  if (setting !== PILOT_ENABLE_VALUE ||
      !previewScope(env) ||
      !originAttestedForBuild(env) ||
      !validProxyConnectionString(appConnectionString) ||
      !validProxyConnectionString(securityLogConnectionString) ||
      appConnectionString === securityLogConnectionString) {
    return "invalid";
  }
  // These values are PROXY URLs; actual Neon database/roles are attested
  // by E6H at deploy, and P03-I checks live actor rights in the same BEGIN.
  return "enabled";
}

/**
 * Read-only preview diagnostic while P03-I stays disabled. No DB connection,
 * no raw URL, host, role, username, database name, password or key is returned.
 */
export type PilotTrainingGuardPreflightCode =
  | "READY"
  | "PREVIEW_SCOPE"
  | "ORIGIN_NOT_ATTESTED"
  | "APP_PROXY_FORMAT"
  | "SECURITY_PROXY_FORMAT"
  | "PROXY_BINDINGS_IDENTICAL"
  | "UNEXPECTED_GUARD_REJECTION";

export function pilotTrainingGuardPreflightCode(
  env: Record<string, unknown>,
  appConnectionString: unknown,
  securityLogConnectionString: unknown,
): PilotTrainingGuardPreflightCode {
  if (!previewScope(env)) return "PREVIEW_SCOPE";
  if (!originAttestedForBuild(env)) return "ORIGIN_NOT_ATTESTED";
  if (!validProxyConnectionString(appConnectionString)) return "APP_PROXY_FORMAT";
  if (!validProxyConnectionString(securityLogConnectionString)) return "SECURITY_PROXY_FORMAT";
  if (appConnectionString === securityLogConnectionString) {
    return "PROXY_BINDINGS_IDENTICAL";
  }
  const simulatedEnv = {
    ...env,
    APPBASIS_ULC_PILOT_TRAINING_WRITE_GUARD: PILOT_ENABLE_VALUE,
  };
  return pilotTrainingWriteGuardActivation(
    simulatedEnv, appConnectionString as string, securityLogConnectionString as string,
  ) === "enabled" ? "READY" : "UNEXPECTED_GUARD_REJECTION";
}
