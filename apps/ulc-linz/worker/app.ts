import { Hono, type Context } from "hono";

import { IdentityError } from "@appbasis/identity";
import {
  createIdentityHttpHandlers,
  type IdentityHttpHandlers,
  type IdentityHttpService,
} from "@appbasis/identity/http";
import type { PermissionStore } from "@appbasis/permissions";

import {
  assertUlcLinzCountdownAccess,
  ULC_LINZ_COUNTDOWN_MODULE_ID,
  UlcLinzCountdownAccessDeniedError,
  type UlcLinzCountdownMembershipResolver,
} from "./countdown-access";
import {
  recordUlcLinzSecurityEvent,
  type UlcLinzIdentitySecurityOperation,
  type UlcLinzSecurityEventLogger,
} from "./security-events";

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
  countdownMemberships: UlcLinzCountdownMembershipResolver;
  secureCookies?: boolean;
  securityEvents?: UlcLinzSecurityEventLogger;
}

export function createGeneratedApp(dependencies: GeneratedAppDependencies) {
  const app = new Hono();
  const identityHttp = createIdentityHttpHandlers({
    identity: dependencies.identity,
    secureCookies: dependencies.secureCookies ?? true,
  });

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
  app.get("/api/modules/countdown/access", (context) =>
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
  if (current instanceof Response) {
    recordUlcLinzSecurityEvent(dependencies.securityEvents, {
      eventType: "authorization.denied",
      actorPrincipalId: null,
      organizationId: null,
      action: "view",
      targetId: ULC_LINZ_COUNTDOWN_MODULE_ID,
      reasonCode: "identity-access-denied",
    });
    return current;
  }

  try {
    await assertUlcLinzCountdownAccess(current, {
      permissions: dependencies.permissions,
      memberships: dependencies.countdownMemberships,
      securityEvents: dependencies.securityEvents,
    });
    return context.json({
      moduleId: ULC_LINZ_COUNTDOWN_MODULE_ID,
      canView: true,
    });
  } catch (error) {
    if (error instanceof UlcLinzCountdownAccessDeniedError) {
      return context.json(
        {
          error: {
            code: error.code,
            message: "Countdown access is denied.",
          },
        },
        403,
      );
    }
    if (error instanceof IdentityError) {
      return identityHttp.identityErrorResponse(error);
    }
    throw error;
  }
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
