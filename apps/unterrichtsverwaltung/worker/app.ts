import { generatedUiResponse } from "./ui";
import { Hono, type Context } from "hono";

import {
  MasterDataConflictError,
  MasterDataStateError,
  MasterDataValidationError,
  type MasterDataRepository,
} from "./master-data";

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
  masterData: MasterDataRepository;
  secureCookies?: boolean;
}

type ErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_TASK"
  | "INVALID_MASTER_DATA"
  | "MASTER_DATA_CONFLICT"
  | "PERMISSION_DENIED"
  | "CLASS_NOT_FOUND"
  | "CLASS_UNAVAILABLE"
  | "TASK_NOT_FOUND";

export function createGeneratedApp(dependencies: GeneratedAppDependencies) {
  const app = new Hono();
  app.get("/", (context) => generatedUiResponse(context.req.raw) ?? new Response("Not Found", { status: 404 }));
  app.get("/app.css", (context) => generatedUiResponse(context.req.raw) ?? new Response("Not Found", { status: 404 }));
  app.get("/app.js", (context) => generatedUiResponse(context.req.raw) ?? new Response("Not Found", { status: 404 }));
  const identityHttp = createIdentityHttpHandlers({
    identity: dependencies.identity,
    secureCookies: dependencies.secureCookies ?? true,
  });

  app.get("/api/health", (context) =>
    context.json({ status: "ok", appId: "unterrichtsverwaltung" }),
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

  app.get("/api/master-data/classes", async (context) => {
    const denied = await authorizeMasterData(context, dependencies, identityHttp);
    if (denied !== null) return denied;
    return context.json({ classes: await dependencies.masterData.listClasses() });
  });

  app.post("/api/master-data/classes", async (context) => {
    const denied = await authorizeMasterData(context, dependencies, identityHttp);
    if (denied !== null) return denied;
    const body = await readObjectBody(context);
    if (body === null) return invalidRequest(context);
    const name = stringField(body, "name");
    const schoolYear = stringField(body, "schoolYear");
    if (name === null || schoolYear === null) return invalidRequest(context);
    try {
      const schoolClass = await dependencies.masterData.createClass({
        name,
        schoolYear,
      });
      return context.json({ class: schoolClass }, 201);
    } catch (error) {
      if (error instanceof MasterDataValidationError) {
        return errorResponse(
          context,
          400,
          "INVALID_MASTER_DATA",
          "Die Klassendaten sind ungültig.",
        );
      }
      if (error instanceof MasterDataConflictError) {
        return errorResponse(
          context,
          409,
          "MASTER_DATA_CONFLICT",
          "Diese Klasse existiert in diesem Schuljahr bereits.",
        );
      }
      throw error;
    }
  });

  app.post("/api/master-data/classes/:id/archive", async (context) => {
    const denied = await authorizeMasterData(context, dependencies, identityHttp);
    if (denied !== null) return denied;
    try {
      const schoolClass = await dependencies.masterData.archiveClass(
        context.req.param("id"),
      );
      if (schoolClass === undefined) {
        return errorResponse(
          context,
          404,
          "CLASS_NOT_FOUND",
          "Die Klasse wurde nicht gefunden.",
        );
      }
      return context.json({ class: schoolClass });
    } catch (error) {
      if (error instanceof MasterDataValidationError) return invalidRequest(context);
      throw error;
    }
  });

  app.get("/api/master-data/students", async (context) => {
    const denied = await authorizeMasterData(context, dependencies, identityHttp);
    if (denied !== null) return denied;
    const classId = context.req.query("classId");
    if (classId === undefined || classId.trim().length === 0) {
      return invalidRequest(context);
    }
    try {
      return context.json({
        students: await dependencies.masterData.listStudents(classId),
      });
    } catch (error) {
      if (error instanceof MasterDataValidationError) return invalidRequest(context);
      throw error;
    }
  });

  app.post("/api/master-data/students", async (context) => {
    const denied = await authorizeMasterData(context, dependencies, identityHttp);
    if (denied !== null) return denied;
    const body = await readObjectBody(context);
    if (body === null) return invalidRequest(context);
    const classId = stringField(body, "classId");
    const firstName = stringField(body, "firstName");
    const lastName = stringField(body, "lastName");
    if (classId === null || firstName === null || lastName === null) {
      return invalidRequest(context);
    }
    try {
      const student = await dependencies.masterData.createStudent({
        classId,
        firstName,
        lastName,
      });
      return context.json({ student }, 201);
    } catch (error) {
      if (error instanceof MasterDataValidationError) {
        return errorResponse(
          context,
          400,
          "INVALID_MASTER_DATA",
          "Die Schülerdaten sind ungültig.",
        );
      }
      if (error instanceof MasterDataStateError) {
        return errorResponse(
          context,
          409,
          "CLASS_UNAVAILABLE",
          "Die ausgewählte Klasse ist nicht verfügbar.",
        );
      }
      throw error;
    }
  });

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

async function authorizeMasterData(
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
      capability: capabilityId("app:manage"),
    });
    return null;
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return errorResponse(
        context,
        403,
        "PERMISSION_DENIED",
        "Die aktuelle Identität darf die Stammdaten nicht verwalten.",
      );
    }
    return identityHttp.identityErrorResponse(error);
  }
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
  status: 400 | 403 | 404 | 409,
  code: ErrorCode,
  message: string,
): Response {
  return context.json({ error: { code, message } }, status);
}
