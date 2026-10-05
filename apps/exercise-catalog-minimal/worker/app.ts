import { Hono, type Context } from "hono";

import { assertIdentityActionAllowed } from "@appbasis/identity/access";
import {
  createIdentityHttpHandlers,
  type IdentityHttpHandlers,
  type IdentityHttpService,
} from "@appbasis/identity/http";
import {
  EXERCISE_CATALOG_CAPABILITIES,
  ExerciseCatalogService,
  ExerciseCatalogValidationError,
  type CreateExerciseCatalogItemInput,
  type UpdateExerciseCatalogItemInput,
} from "@appbasis/exercise-catalog";
import {
  assert as assertPermission,
  capabilityId,
  PermissionDeniedError,
  principalId as permissionPrincipalId,
  type PermissionStore,
} from "@appbasis/permissions";

export interface ExerciseCatalogMinimalAppDependencies {
  readonly identity: IdentityHttpService;
  readonly permissions: PermissionStore;
  readonly catalog: ExerciseCatalogService;
  readonly organizationId: string;
  readonly secureCookies?: boolean;
}

interface AuthorizedCatalogContext {
  readonly principalId: string;
}

type ErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_EXERCISE"
  | "PERMISSION_DENIED"
  | "EXERCISE_NOT_FOUND";

export function createExerciseCatalogMinimalApp(
  dependencies: ExerciseCatalogMinimalAppDependencies,
) {
  const app = new Hono();
  const identityHttp = createIdentityHttpHandlers({
    identity: dependencies.identity,
    secureCookies: dependencies.secureCookies ?? true,
  });

  app.get("/api/health", (context) =>
    context.json({ status: "ok", appId: "exercise-catalog-minimal" }),
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

  app.get("/api/exercises", async (context) => {
    const authorized = await authorizeCatalog(
      context,
      dependencies,
      identityHttp,
      EXERCISE_CATALOG_CAPABILITIES.view,
    );
    if (authorized instanceof Response) return authorized;

    try {
      const exercises = await dependencies.catalog.list(
        dependencies.organizationId,
        authorized.principalId,
      );
      return context.json({ exercises });
    } catch (error) {
      return catalogErrorResponse(context, error);
    }
  });

  app.get("/api/exercises/:id", async (context) => {
    const authorized = await authorizeCatalog(
      context,
      dependencies,
      identityHttp,
      EXERCISE_CATALOG_CAPABILITIES.view,
    );
    if (authorized instanceof Response) return authorized;

    try {
      const exercise = await dependencies.catalog.findById(
        dependencies.organizationId,
        context.req.param("id"),
        authorized.principalId,
      );
      if (exercise === undefined) return exerciseNotFound(context);
      return context.json({ exercise });
    } catch (error) {
      return catalogErrorResponse(context, error);
    }
  });

  app.post("/api/exercises", async (context) => {
    const authorized = await authorizeCatalog(
      context,
      dependencies,
      identityHttp,
      EXERCISE_CATALOG_CAPABILITIES.edit,
    );
    if (authorized instanceof Response) return authorized;

    const body = await readObjectBody(context);
    if (body === null) return invalidRequest(context);
    try {
      const exercise = await dependencies.catalog.create(
        dependencies.organizationId,
        body as unknown as CreateExerciseCatalogItemInput,
      );
      return context.json({ exercise }, 201);
    } catch (error) {
      return catalogErrorResponse(context, error);
    }
  });

  app.put("/api/exercises/:id", async (context) => {
    const authorized = await authorizeCatalog(
      context,
      dependencies,
      identityHttp,
      EXERCISE_CATALOG_CAPABILITIES.edit,
    );
    if (authorized instanceof Response) return authorized;

    const body = await readObjectBody(context);
    if (body === null) return invalidRequest(context);
    try {
      const exercise = await dependencies.catalog.update(
        dependencies.organizationId,
        context.req.param("id"),
        body as unknown as UpdateExerciseCatalogItemInput,
      );
      if (exercise === undefined) return exerciseNotFound(context);
      return context.json({ exercise });
    } catch (error) {
      return catalogErrorResponse(context, error);
    }
  });

  app.post("/api/exercises/:id/deactivate", async (context) => {
    const authorized = await authorizeCatalog(
      context,
      dependencies,
      identityHttp,
      EXERCISE_CATALOG_CAPABILITIES.edit,
    );
    if (authorized instanceof Response) return authorized;

    try {
      const exercise = await dependencies.catalog.deactivate(
        dependencies.organizationId,
        context.req.param("id"),
      );
      if (exercise === undefined) return exerciseNotFound(context);
      return context.json({ exercise });
    } catch (error) {
      return catalogErrorResponse(context, error);
    }
  });

  app.put("/api/exercises/:id/favorite", async (context) => {
    const authorized = await authorizeCatalog(
      context,
      dependencies,
      identityHttp,
      EXERCISE_CATALOG_CAPABILITIES.view,
    );
    if (authorized instanceof Response) return authorized;

    const body = await readObjectBody(context);
    if (body === null || typeof body.favorite !== "boolean") {
      return invalidRequest(context);
    }
    try {
      const found = await dependencies.catalog.setFavorite(
        dependencies.organizationId,
        authorized.principalId,
        context.req.param("id"),
        body.favorite,
      );
      if (!found) return exerciseNotFound(context);
      return context.json({ favorite: body.favorite });
    } catch (error) {
      return catalogErrorResponse(context, error);
    }
  });

  return app;
}

async function authorizeCatalog(
  context: Context,
  dependencies: ExerciseCatalogMinimalAppDependencies,
  identityHttp: IdentityHttpHandlers,
  capability: string,
): Promise<AuthorizedCatalogContext | Response> {
  const current = await identityHttp.resolveCurrentIdentity(context.req.raw);
  if (current instanceof Response) return current;

  try {
    assertIdentityActionAllowed(current, "application");
    await assertPermission(dependencies.permissions, {
      principalId: permissionPrincipalId(current.identity.identityId),
      capability: capabilityId(capability),
    });
    return Object.freeze({
      principalId: current.identity.identityId,
    });
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return errorResponse(
        context,
        403,
        "PERMISSION_DENIED",
        "The current identity is not allowed to use this exercise catalog action.",
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
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return null;
    }
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

function catalogErrorResponse(context: Context, error: unknown): Response {
  if (error instanceof ExerciseCatalogValidationError) {
    return errorResponse(
      context,
      400,
      "INVALID_EXERCISE",
      "The exercise input is invalid.",
    );
  }
  throw error;
}

function invalidRequest(context: Context): Response {
  return errorResponse(
    context,
    400,
    "INVALID_REQUEST",
    "The request body is invalid.",
  );
}

function exerciseNotFound(context: Context): Response {
  return errorResponse(
    context,
    404,
    "EXERCISE_NOT_FOUND",
    "The exercise was not found.",
  );
}

function errorResponse(
  context: Context,
  status: 400 | 403 | 404,
  code: ErrorCode,
  message: string,
): Response {
  return context.json({ error: { code, message } }, status);
}
