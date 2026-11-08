/** G-04.6: fail-closed entrypoint guard for a separately named test Worker.
 * The Hyperdrive upstream origin is independently attested before deployment
 * (tooling/ulc-linz-g04-sandbox-target.mjs); its runtime connection string may
 * point to Cloudflare's Hyperdrive proxy rather than the actual Neon host.
 */
export const G046_SANDBOX_WORKER_NAME = "appbasis-ulc-linz-g04-sandbox";
export const G046_SANDBOX_BRANCH_ID = "br-falling-hat-b1lmifga";
const SOURCE_NEON_HOST = "ep-green-resonance-b19c78rm.c-5.eu-central-1.aws.neon.tech";
const SANDBOX_NEON_HOST = "ep-empty-frog-b187iuwz.c-5.eu-central-1.aws.neon.tech";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function binding(value: unknown): string | null {
  if (!record(value) || typeof value.connectionString !== "string") return null;
  let url: URL;
  try { url = new URL(value.connectionString); }
  catch { return null; }
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname || !url.username || !url.password ||
      url.hostname === SOURCE_NEON_HOST) return null;
  if (url.hostname.endsWith(".neon.tech") &&
      url.hostname !== SANDBOX_NEON_HOST) return null;
  return value.connectionString;
}

export function isG046SandboxRuntimeBound(request: Request, env: unknown): boolean {
  if (!record(env)) return false;
  let url: URL;
  try { url = new URL(request.url); } catch { return false; }
  const base = env.APPBASIS_BASE_URL;
  if (typeof base !== "string" ||
      !new RegExp("^https://" + G046_SANDBOX_WORKER_NAME +
        "\\.[a-z0-9-]+\\.workers\\.dev$").test(base) ||
      url.origin !== base ||
      env.APPBASIS_GENERATED_APP_ID !== "ulc-linz" ||
      env.APPBASIS_RUNTIME_ENVIRONMENT !== "generated-preview-ulc-linz" ||
      env.APPBASIS_REGISTRATION_CALENDAR_V17 !== "enabled" ||
      env.APPBASIS_G046_SANDBOX_BRANCH_ID !== G046_SANDBOX_BRANCH_ID ||
      typeof env.BETTER_AUTH_SECRET !== "string" ||
      env.BETTER_AUTH_SECRET.length < 32) return false;
  const app = binding(env.HYPERDRIVE);
  const security = binding(env.SECURITY_LOG_HYPERDRIVE);
  return app !== null && security !== null && app !== security;
}
