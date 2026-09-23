import { IdentityError } from "@appbasis/identity";

import { createGeneratedApp } from "./app";
import {
  assertUlcLinzCountdownAccess,
  UlcLinzCountdownAccessDeniedError,
} from "./countdown-access";
import { recordUlcLinzSecurityEvent } from "./security-events";
import {
  createGeneratedPostgresApplicationRuntime,
  type GeneratedPostgresApplicationRuntime,
  type GeneratedPostgresApplicationRuntimeOptions,
} from "./postgres";

type GeneratedRuntimeFactory = (
  options: GeneratedPostgresApplicationRuntimeOptions,
) =>
  | GeneratedPostgresApplicationRuntime
  | PromiseLike<GeneratedPostgresApplicationRuntime>;

type WorkerErrorKind =
  | "UNEXPECTED_RUNTIME_ERROR"
  | "SECURITY_EVENT_FLUSH_ERROR"
  | "RUNTIME_CLOSE_ERROR";

export function createGeneratedWorker(
  runtimeFactory: GeneratedRuntimeFactory =
    createGeneratedPostgresApplicationRuntime,
) {
  return Object.freeze({
    async fetch(request: Request, env: unknown): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname === "/api/health") {
        return Response.json({ status: "ok", appId: "ulc-linz" });
      }

      const runtimeOptions = runtimeConfiguration(env);
      if (runtimeOptions === null) {
        return Response.json(
          {
            error: {
              code: "RUNTIME_NOT_CONFIGURED",
              message: "The generated application runtime is not configured.",
            },
          },
          { status: 503 },
        );
      }

      let runtime: GeneratedPostgresApplicationRuntime | null = null;
      let response: Response;
      try {
        runtime = await runtimeFactory(runtimeOptions);
        if (url.pathname === "/api/modules/countdown/access") {
          response = await countdownAccessResponse(request, runtime);
        } else {
          const app = createGeneratedApp({
            identity: runtime.identity,
            secureCookies: url.protocol === "https:",
            securityEvents: runtime.securityEvents,
          });
          response = await app.fetch(request);
        }
      } catch {
        logWorkerError("generated_worker_request_failed", "UNEXPECTED_RUNTIME_ERROR");
        response = Response.json(
          {
            error: {
              code: "INTERNAL_ERROR",
              message: "The generated application request failed.",
            },
          },
          { status: 500 },
        );
      }

      if (runtime !== null) {
        await flushSecurityEventsSafely(runtime);
        await closeRuntimeSafely(runtime);
      }
      return response;
    },
  });
}

export default createGeneratedWorker();

async function countdownAccessResponse(
  request: Request,
  runtime: GeneratedPostgresApplicationRuntime,
): Promise<Response> {
  if (request.method !== "GET") {
    return Response.json(
      {
        error: {
          code: "METHOD_NOT_ALLOWED",
          message: "The countdown access endpoint only supports GET.",
        },
      },
      { status: 405, headers: { allow: "GET" } },
    );
  }

  const sessionToken = request.headers.get("cookie");
  if (sessionToken === null || sessionToken.trim().length === 0) {
    recordCountdownIdentityDenial(runtime);
    return countdownAccessError(401, "SESSION_INVALID", "A valid session is required.");
  }

  let current;
  try {
    current = await runtime.identity.getCurrentIdentity(sessionToken);
  } catch (error) {
    recordCountdownIdentityDenial(runtime);
    if (error instanceof IdentityError) {
      if (
        error.code === "SESSION_INVALID" ||
        error.code === "IDENTITY_STATE_MISSING"
      ) {
        return countdownAccessError(
          401,
          "SESSION_INVALID",
          "A valid session is required.",
        );
      }
      if (
        error.code === "IDENTITY_DISABLED" ||
        error.code === "PASSWORD_CHANGE_REQUIRED"
      ) {
        return countdownAccessError(
          403,
          error.code,
          "Countdown access is not available for the current identity state.",
        );
      }
    }
    throw error;
  }

  if (current === null) {
    recordCountdownIdentityDenial(runtime);
    return countdownAccessError(401, "SESSION_INVALID", "A valid session is required.");
  }

  try {
    await assertUlcLinzCountdownAccess(current, {
      permissions: runtime.permissions,
      memberships: runtime.countdownMemberships,
      securityEvents: runtime.securityEvents,
    });
  } catch (error) {
    if (error instanceof UlcLinzCountdownAccessDeniedError) {
      return countdownAccessError(
        403,
        error.code,
        "Countdown access is denied.",
      );
    }
    if (
      error instanceof IdentityError &&
      error.code === "PASSWORD_CHANGE_REQUIRED"
    ) {
      return countdownAccessError(
        403,
        error.code,
        "Countdown access is not available until the required password change is complete.",
      );
    }
    throw error;
  }

  return Response.json({
    moduleId: "countdown",
    canView: true,
  });
}

function recordCountdownIdentityDenial(
  runtime: GeneratedPostgresApplicationRuntime,
): void {
  recordUlcLinzSecurityEvent(runtime.securityEvents, {
    eventType: "authorization.denied",
    actorPrincipalId: null,
    organizationId: null,
    action: "view",
    targetId: "countdown",
    reasonCode: "identity-access-denied",
  });
}

function countdownAccessError(
  status: 401 | 403,
  code: string,
  message: string,
): Response {
  return Response.json({ error: { code, message } }, { status });
}

function runtimeConfiguration(
  env: unknown,
): GeneratedPostgresApplicationRuntimeOptions | null {
  if (!isRecord(env)) return null;
  const hyperdrive = env.HYPERDRIVE;
  const securityLogHyperdrive = env.SECURITY_LOG_HYPERDRIVE;
  if (!isRecord(hyperdrive) || !isRecord(securityLogHyperdrive)) return null;

  const connectionString = normalizedPostgresConnectionString(
    hyperdrive.connectionString,
  );
  const securityLogConnectionString = normalizedPostgresConnectionString(
    securityLogHyperdrive.connectionString,
  );
  const baseURL = normalizedHttpsOrigin(env.APPBASIS_BASE_URL);
  const secret = normalizedSecret(env.BETTER_AUTH_SECRET);
  if (
    connectionString === null ||
    securityLogConnectionString === null ||
    connectionString === securityLogConnectionString ||
    baseURL === null ||
    secret === null
  ) {
    return null;
  }

  return Object.freeze({
    connectionString,
    securityLogConnectionString,
    baseURL,
    secret,
  });
}

async function flushSecurityEventsSafely(
  runtime: GeneratedPostgresApplicationRuntime,
): Promise<void> {
  try {
    await runtime.securityEvents.flush();
  } catch {
    logWorkerError(
      "generated_worker_security_event_flush_failed",
      "SECURITY_EVENT_FLUSH_ERROR",
    );
  }
}

async function closeRuntimeSafely(
  runtime: GeneratedPostgresApplicationRuntime,
): Promise<void> {
  try {
    await runtime.close();
  } catch {
    logWorkerError("generated_worker_runtime_close_failed", "RUNTIME_CLOSE_ERROR");
  }
}

function logWorkerError(event: string, errorKind: WorkerErrorKind): void {
  try {
    console.error(JSON.stringify({ event, errorKind }));
  } catch {
    // Logging must never replace an application response.
  }
}

function normalizedPostgresConnectionString(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() !== value) return null;
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "postgres:" && url.protocol !== "postgresql:") ||
      url.hostname.length === 0
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

function normalizedHttpsOrigin(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() !== value) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname.length === 0 ||
      url.username.length > 0 ||
      url.password.length > 0 ||
      (url.pathname !== "" && url.pathname !== "/") ||
      url.search.length > 0 ||
      url.hash.length > 0
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function normalizedSecret(value: unknown): string | null {
  return typeof value === "string" &&
    value.trim() === value &&
    value.length >= 32
    ? value
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
