import {
  COUNTDOWN_CAPABILITIES,
  createCountdownTimeline,
  normalizeCountdownConfiguration,
} from "@appbasis/countdown";
import { createIdentityHttpHandlers } from "@appbasis/identity/http";

import { createGeneratedApp } from "./app";
import { UlcLinzCountdownAccessDeniedError } from "./countdown-access";
import { recordUlcLinzSecurityEvent } from "./security-events";
import { generatedUiResponse } from "./ui";
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

const AUDIT_CORRELATION_HEADER = "x-appbasis-audit-correlation";
const AUDIT_CORRELATION_PROOF_HEADER = "x-appbasis-audit-proof";
const AUDIT_CORRELATION_PATTERN = /^[a-f0-9]{32}$/;
const AUDIT_CORRELATION_PROOF_PATTERN = /^[a-f0-9]{64}$/;

export function createGeneratedWorker(
  runtimeFactory: GeneratedRuntimeFactory =
    createGeneratedPostgresApplicationRuntime,
) {
  return Object.freeze({
    async fetch(request: Request, env: unknown): Promise<Response> {
      const url = new URL(request.url);
      const staticUiResponse = generatedUiResponse(request);
      if (staticUiResponse !== null) {
        return staticUiResponse;
      }
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
        if (url.pathname === "/api/modules/countdown") {
          response = await countdownModuleResponse(
            request,
            runtime,
            url,
            runtimeOptions.secret,
          );
        } else if (url.pathname === "/api/modules/countdown/plan") {
          response = await countdownPlanResponse(
            request,
            runtime,
            url,
            runtimeOptions.secret,
          );
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

async function countdownModuleResponse(
  request: Request,
  runtime: GeneratedPostgresApplicationRuntime,
  url: URL,
  secret: string,
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed("GET");
  }

  const denied = await authorizeCountdownRequest(request, runtime, url, secret);
  if (denied !== null) return denied;

  return Response.json({
    module: {
      moduleId: "countdown",
      capability: COUNTDOWN_CAPABILITIES.view,
    },
    access: {
      view: true,
    },
  });
}

async function countdownPlanResponse(
  request: Request,
  runtime: GeneratedPostgresApplicationRuntime,
  url: URL,
  secret: string,
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST");
  }

  const denied = await authorizeCountdownRequest(request, runtime, url, secret);
  if (denied !== null) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidCountdownConfiguration();
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return invalidCountdownConfiguration();
  }

  try {
    const input = body as {
      rounds?: unknown;
      workSeconds?: unknown;
      restSeconds?: unknown;
      workAnnouncementIntervalSeconds?: unknown;
      restAnnouncementIntervalSeconds?: unknown;
    };
    const configuration = normalizeCountdownConfiguration({
      rounds: input.rounds as number,
      workSeconds: input.workSeconds as number,
      restSeconds: input.restSeconds as number,
      ...(input.workAnnouncementIntervalSeconds === undefined
        ? {}
        : {
            workAnnouncementIntervalSeconds:
              input.workAnnouncementIntervalSeconds as number,
          }),
      ...(input.restAnnouncementIntervalSeconds === undefined
        ? {}
        : {
            restAnnouncementIntervalSeconds:
              input.restAnnouncementIntervalSeconds as number,
          }),
    });
    const timeline = createCountdownTimeline(configuration);
    return Response.json({ configuration, timeline });
  } catch {
    return invalidCountdownConfiguration();
  }
}

async function authorizeCountdownRequest(
  request: Request,
  runtime: GeneratedPostgresApplicationRuntime,
  url: URL,
  secret: string,
): Promise<Response | null> {
  const identityHttp = createIdentityHttpHandlers({
    identity: runtime.identity,
    secureCookies: url.protocol === "https:",
  });
  const current = await identityHttp.resolveCurrentIdentity(request);
  if (current instanceof Response) {
    if (current.status >= 400) {
      recordUlcLinzSecurityEvent(runtime.securityEvents, {
        eventType: "authorization.denied",
        actorPrincipalId: null,
        organizationId: null,
        action: "view",
        targetId: await countdownAuditTargetId(request, secret),
        reasonCode: "identity-access-denied",
      });
    }
    return current;
  }

  try {
    await runtime.countdownAccess.assertViewAccess(current);
    return null;
  } catch (error) {
    if (error instanceof UlcLinzCountdownAccessDeniedError) {
      return Response.json(
        {
          error: {
            code: error.code,
            message: "Countdown access denied.",
          },
        },
        { status: 403 },
      );
    }
    if (isPasswordChangeRequiredError(error)) {
      return identityHttp.identityErrorResponse(error);
    }
    throw error;
  }
}

async function countdownAuditTargetId(
  request: Request,
  secret: string,
): Promise<string> {
  const correlation = request.headers.get(AUDIT_CORRELATION_HEADER);
  const proof = request.headers.get(AUDIT_CORRELATION_PROOF_HEADER);
  if (
    correlation === null ||
    proof === null ||
    !AUDIT_CORRELATION_PATTERN.test(correlation) ||
    !AUDIT_CORRELATION_PROOF_PATTERN.test(proof)
  ) {
    return "countdown";
  }

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const verified = await crypto.subtle.verify(
      "HMAC",
      key,
      hexBytes(proof),
      new TextEncoder().encode(`ulc-linz-d4:${correlation}`),
    );
    return verified ? `countdown:smoke:${correlation}` : "countdown";
  } catch {
    return "countdown";
  }
}

function hexBytes(value: string): ArrayBuffer {
  const buffer = new ArrayBuffer(value.length / 2);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return buffer;
}

function invalidCountdownConfiguration(): Response {
  return Response.json(
    {
      error: {
        code: "INVALID_COUNTDOWN_CONFIGURATION",
        message: "The countdown configuration is invalid.",
      },
    },
    { status: 400 },
  );
}

function methodNotAllowed(method: "GET" | "POST"): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: `Only ${method} is supported for this countdown endpoint.`,
      },
    }),
    {
      status: 405,
      headers: {
        "content-type": "application/json; charset=utf-8",
        allow: method,
      },
    },
  );
}

function isPasswordChangeRequiredError(
  error: unknown,
): error is Error & { readonly code: "PASSWORD_CHANGE_REQUIRED" } {
  return (
    error instanceof Error &&
    error.name === "IdentityError" &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === "PASSWORD_CHANGE_REQUIRED"
  );
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
