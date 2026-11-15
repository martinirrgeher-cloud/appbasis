/**
 * A single, explicit, pilot-only switch for the already-tested P03-I
 * transactional ULC attendance/registration writer.
 *
 * This is NOT a user-controlled request flag. It is evaluated only from
 * Cloudflare Worker environment bindings before a runtime is created.
 * Disabled unless all expected preview identities match.
 *
 * If an operator requests the switch with a typo or different database,
 * BLOCK the request rather than silently falling back to legacy writes.
 */
export type PilotTrainingWriteGuardActivation =
  | "disabled"
  | "enabled"
  | "invalid";

const PILOT_ENABLE_VALUE = "p03i-preview";
const PILOT_DISABLE_VALUE = "disabled";
const PREVIEW_DB = "appbasis_ulc_linz_preview";
const APP_ROLE = "appbasis_ulc_linz_preview_application";
const LOG_ROLE = "appbasis_ulc_linz_preview_security_log";

function connectionIdentity(connectionString: string): {
  host: string;
  port: string;
  database: string;
  role: string;
} | null {
  try {
    const url = new URL(connectionString);
    if ((url.protocol !== "postgres:" && url.protocol !== "postgresql:") ||
        url.hostname.length === 0 ||
        (url.port !== "" && url.port !== "5432")) {
      return null;
    }
    const database = decodeURIComponent(url.pathname.slice(1));
    const role = decodeURIComponent(url.username);
    if (database.length === 0 || role.length === 0) return null;
    return { host: url.hostname.toLowerCase(), port: url.port || "5432", database, role };
  } catch {
    return null;
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
      env.APPBASIS_RUNTIME_ENVIRONMENT !== "generated-preview-ulc-linz" ||
      env.APPBASIS_GENERATED_APP_ID !== "ulc-linz") {
    return "invalid";
  }
  const app = connectionIdentity(appConnectionString);
  const log = connectionIdentity(securityLogConnectionString);
  if (app === null || log === null ||
      app.database !== PREVIEW_DB || log.database !== PREVIEW_DB ||
      app.role !== APP_ROLE || log.role !== LOG_ROLE) {
    // Cloudflare's two distinct Hyperdrive bindings can expose different
    // per-binding proxy hostnames, even when they reach the same Neon origin.
    // The E6H deployment preflight verifies both underlying origin endpoints
    // and distinct roles before it binds either Hyperdrive ID to the Worker.
    // Comparing their runtime *proxy* hostnames would reject that valid setup.
    return "invalid";
  }
  return "enabled";
}


/**
 * Read-only B3 diagnosis while the existing preview Worker remains in
 * the proven working "disabled" mode. No connection is opened and no
 * connection fields, role names, hosts, database names, or secrets
 * leave the Worker. This predicts what the next activation would do.
 */
export type PilotTrainingGuardPreflightCode =
  | "READY"
  | "PREVIEW_SCOPE"
  | "APP_PROXY_FORMAT"
  | "SECURITY_PROXY_FORMAT"
  | "PROXY_DATABASE"
  | "PROXY_ROLE"
  | "UNEXPECTED_GUARD_REJECTION";

export function pilotTrainingGuardPreflightCode(
  env: Record<string, unknown>,
  appConnectionString: unknown,
  securityLogConnectionString: unknown,
): PilotTrainingGuardPreflightCode {
  if (env.APPBASIS_RUNTIME_ENVIRONMENT !== "generated-preview-ulc-linz" ||
      env.APPBASIS_GENERATED_APP_ID !== "ulc-linz") {
    return "PREVIEW_SCOPE";
  }
  const app = typeof appConnectionString === "string"
    ? connectionIdentity(appConnectionString) : null;
  if (app === null) return "APP_PROXY_FORMAT";
  const log = typeof securityLogConnectionString === "string"
    ? connectionIdentity(securityLogConnectionString) : null;
  if (log === null) return "SECURITY_PROXY_FORMAT";
  if (app.database !== PREVIEW_DB || log.database !== PREVIEW_DB) {
    return "PROXY_DATABASE";
  }
  if (app.role !== APP_ROLE || log.role !== LOG_ROLE) {
    return "PROXY_ROLE";
  }
  const simulatedEnv = {
    ...env,
    APPBASIS_ULC_PILOT_TRAINING_WRITE_GUARD: PILOT_ENABLE_VALUE,
  };
  return pilotTrainingWriteGuardActivation(
    simulatedEnv, appConnectionString as string, securityLogConnectionString as string,
  ) === "enabled" ? "READY" : "UNEXPECTED_GUARD_REJECTION";
}
