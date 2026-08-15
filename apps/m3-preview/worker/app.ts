import { Hono, type Context } from "hono";

import { assertIdentityActionAllowed } from "@appbasis/identity/access";
import {
  createIdentityHttpHandlers,
  type IdentityHttpHandlers,
  type IdentityHttpService,
} from "@appbasis/identity/http";
import {
  assert as assertPermission,
  capabilityId,
  PermissionDeniedError,
  principalId,
  type PermissionStore,
} from "@appbasis/permissions";
import {
  TASK_CAPABILITIES,
  TaskValidationError,
  type TaskRepository,
} from "@appbasis/tasks";

export interface GeneratedAppDependencies {
  identity: IdentityHttpService;
  permissions: PermissionStore;
  tasks: TaskRepository;
  secureCookies?: boolean;
}

type ErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_TASK"
  | "PERMISSION_DENIED"
  | "TASK_NOT_FOUND";

export function createGeneratedApp(dependencies: GeneratedAppDependencies) {
  const app = new Hono();
  const identityHttp = createIdentityHttpHandlers({
    identity: dependencies.identity,
    secureCookies: dependencies.secureCookies ?? true,
  });

  app.get("/api/health", (context) =>
    context.json({ status: "ok", appId: "m3-preview" }),
  );
  app.post("/api/auth/sign-in", (context) =>
    identityHttp.signIn(context.req.raw),
  );
  app.get("/api/auth/session", (context) =>
    identityHttp.session(context.req.raw),
  );
  app.post("/api/auth/change-required-password", (context) =>
    identityHttp.changeRequiredPassword(context.req.raw),
  );

  app.get("/api/tasks", async (context) => {
    const denied = await authorizeTasks(context, dependencies, identityHttp);
    if (denied !== null) return denied;
    return context.json({ tasks: await dependencies.tasks.list() });
  });

  app.post("/api/tasks", async (context) => {
    const denied = await authorizeTasks(context, dependencies, identityHttp);
    if (denied !== null) return denied;
    const body = await readObjectBody(context);
    if (body === null) return invalidRequest(context);
    const title = stringField(body, "title");
    const description = optionalStringField(body, "description");
    if (title === null || description === undefined) return invalidRequest(context);

    try {
      const task = await dependencies.tasks.create({
        title,
        ...(description === null ? {} : { description }),
      });
      return context.json({ task }, 201);
    } catch (error) {
      if (error instanceof TaskValidationError) {
        return errorResponse(context, 400, "INVALID_TASK", "The task input is invalid.");
      }
      throw error;
    }
  });

  app.post("/api/tasks/:id/toggle", async (context) => {
    const denied = await authorizeTasks(context, dependencies, identityHttp);
    if (denied !== null) return denied;
    const task = await dependencies.tasks.toggleStatus(context.req.param("id"));
    if (task === undefined) {
      return errorResponse(context, 404, "TASK_NOT_FOUND", "The task was not found.");
    }
    return context.json({ task });
  });

  return app;
}

async function authorizeTasks(
  context: Context,
  dependencies: GeneratedAppDependencies,
  identityHttp: IdentityHttpHandlers,
): Promise<Response | null> {
  const current = await identityHttp.resolveCurrentIdentity(context.req.raw);
  if (current instanceof Response) return current;

  try {
    assertIdentityActionAllowed(current, "application");
    await assertPermission(dependencies.permissions, {
      principalId: principalId(current.identity.identityId),
      capability: capabilityId(TASK_CAPABILITIES.manage),
    });
    return null;
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return errorResponse(
        context,
        403,
        "PERMISSION_DENIED",
        "The current identity is not allowed to manage tasks.",
      );
    }
    return identityHttp.identityErrorResponse(error);
  }
}

async function readObjectBody(
  context: Context,
): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await context.req.json();
    if (body === null || typeof body !== "object" || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

function stringField(body: Record<string, unknown>, field: string): string | null {
  const value = body[field];
  return typeof value === "string" ? value : null;
}

function optionalStringField(
  body: Record<string, unknown>,
  field: string,
): string | null | undefined {
  const value = body[field];
  if (value === undefined) return null;
  return typeof value === "string" ? value : undefined;
}

function invalidRequest(context: Context) {
  return errorResponse(context, 400, "INVALID_REQUEST", "The request body is invalid.");
}

function errorResponse(
  context: Context,
  status: 400 | 403 | 404,
  code: ErrorCode,
  message: string,
): Response {
  return context.json({ error: { code, message } }, status);
}
