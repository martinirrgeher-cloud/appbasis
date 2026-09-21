import { Hono, type Context } from "hono";

import {
  createIdentityHttpHandlers,
  type IdentityHttpHandlers,
  type IdentityHttpService,
} from "@appbasis/identity/http";
import type { PermissionStore } from "@appbasis/permissions";

import {
  assertUlcLinzModuleAccess,
  UlcLinzAuthorizationDeniedError,
} from "./authorization";
import {
  recordUlcLinzSecurityEvent,
  type UlcLinzIdentitySecurityOperation,
  type UlcLinzSecurityEventLogger,
} from "./security-events";
import type { UlcLinzScopeResolver } from "./scope-postgres";
import { generatedUiResponse } from "./ui";

export {
  assertUlcLinzModuleAccess,
  UlcLinzAuthorizationDeniedError,
  type UlcLinzAuthorizationDependencies,
  type UlcLinzModuleAccessRequest,
} from "./authorization";
export type {
  UlcLinzSecurityEvent,
  UlcLinzSecurityEventLogger,
} from "./security-events";

export interface GeneratedAppDependencies {
  identity: IdentityHttpService;
  permissions: PermissionStore;
  scope: UlcLinzScopeResolver;
  secureCookies?: boolean;
  securityEvents?: UlcLinzSecurityEventLogger;
}

export function createGeneratedApp(dependencies: GeneratedAppDependencies) {
  const app = new Hono();
  const identityHttp = createIdentityHttpHandlers({
    identity: dependencies.identity,
    secureCookies: dependencies.secureCookies ?? true,
  });

  app.get("/", (context) =>
    generatedUiResponse(context.req.raw) ??
    new Response("Not Found", { status: 404 }),
  );
  app.get("/app.css", (context) =>
    generatedUiResponse(context.req.raw) ??
    new Response("Not Found", { status: 404 }),
  );
  app.get("/app.js", (context) =>
    generatedUiResponse(context.req.raw) ??
    new Response("Not Found", { status: 404 }),
  );

  app.get("/api/health", (context) =>
    context.json({ status: "ok", appId: "ulc-linz" }),
  );
  app.post("/api/auth/sign-in", async (context) =>
    identityResponseWithSecurityLogging(
      "sign-in",
      identityHttp.signIn(context.req.raw),
      dependencies.securityEvents,
    ),
  );
  app.get("/api/auth/session", async (context) =>
    identityResponseWithSecurityLogging(
      "session",
      identityHttp.session(context.req.raw),
      dependencies.securityEvents,
    ),
  );
  app.post("/api/auth/change-required-password", async (context) =>
    identityResponseWithSecurityLogging(
      "change-required-password",
      identityHttp.changeRequiredPassword(context.req.raw),
      dependencies.securityEvents,
    ),
  );

  app.get("/api/modules/countdown/access", async (context) =>
    countdownAccessResponse(context, dependencies, identityHttp),
  );

  return app;
}

async function countdownAccessResponse(
  context: Context,
  dependencies: GeneratedAppDependencies,
  identityHttp: IdentityHttpHandlers,
): Promise<Response> {
  const current = await identityHttp.resolveCurrentIdentity(context.req.raw);
  if (current instanceof Response) return current;

  const organizationId = await dependencies.scope.resolveActiveOrganizationId(
    current.identity.identityId,
  );
  if (organizationId === null) {
    recordUlcLinzSecurityEvent(dependencies.securityEvents, {
      eventType: "authorization.denied",
      actorPrincipalId: current.identity.identityId,
      organizationId: null,
      action: "view",
      targetId: "countdown",
      reasonCode: "membership-denied",
    });
    return countdownDeniedResponse(context);
  }

  try {
    await assertUlcLinzModuleAccess(
      current,
      {
        permissions: dependencies.permissions,
        memberships: dependencies.scope,
        subjectScopes: dependencies.scope,
        securityEvents: dependencies.securityEvents,
      },
      {
        organizationId,
        moduleKey: "countdown",
        action: "view",
        scope: "module",
      },
    );
    return context.json({ access: "allowed", module: "countdown" });
  } catch (error) {
    if (error instanceof UlcLinzAuthorizationDeniedError) {
      return countdownDeniedResponse(context);
    }
    return identityHttp.identityErrorResponse(error);
  }
}

function countdownDeniedResponse(context: Context): Response {
  return context.json(
    {
      error: {
        code: "ULC_LINZ_ACCESS_DENIED",
        message: "The current identity cannot access the requested ULC module.",
      },
    },
    403,
  );
}

async function identityResponseWithSecurityLogging(
  operation: UlcLinzIdentitySecurityOperation,
  responsePromise: Promise<Response>,
  securityEvents: UlcLinzSecurityEventLogger | undefined,
): Promise<Response> {
  const response = await responsePromise;
  if (response.status < 400) return response;

  recordUlcLinzSecurityEvent(securityEvents, {
    eventType: "identity.request.denied",
    operation,
    httpStatus: response.status,
    errorCode: await identityErrorCode(response),
  });
  return response;
}

async function identityErrorCode(response: Response): Promise<string> {
  try {
    const payload: unknown = await response.clone().json();
    if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
      return "UNKNOWN_IDENTITY_ERROR";
    }
    const error = (payload as { error?: unknown }).error;
    if (error === null || typeof error !== "object" || Array.isArray(error)) {
      return "UNKNOWN_IDENTITY_ERROR";
    }
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" && code.length !== 0
      ? code
      : "UNKNOWN_IDENTITY_ERROR";
  } catch {
    return "UNKNOWN_IDENTITY_ERROR";
  }
}
