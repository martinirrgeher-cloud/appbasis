import {
  ATHLETE_CAPABILITIES,
  ATHLETES_IMPORT_MAX_FILE_BYTES,
  ATHLETES_XLSX_CONTENT_TYPE,
  AthletesImportApplyError,
  AthletesImportFileError,
  MasterdataValidationError,
  applyAthletesImportPreview,
  createAthletesImportPreviewToken,
  createAthletesWorkbook,
  previewAthletesImport,
  type AthletesExchangeMode,
} from "@appbasis/athletes";
import {
  ExerciseCatalogValidationError as StandardExerciseCatalogValidationError,
} from "@appbasis/exercise-catalog";
import {
  COUNTDOWN_CAPABILITIES,
  createCountdownTimeline,
  normalizeCountdownConfiguration,
} from "@appbasis/countdown";
import { createIdentityHttpHandlers } from "@appbasis/identity/http";

import { createGeneratedApp } from "./app";
import { UlcLinzAuthorizationDeniedError } from "./authorization";
import { UlcLinzCountdownAccessDeniedError } from "./countdown-access";
import type { UlcLinzExerciseCatalogAccessScope } from "./exercise-catalog-access";
import {
  UlcExerciseCatalogValidationError,
  type CreateUlcExerciseCatalogItemInput,
} from "./exercise-catalog-domain";
import {
  createUlcExerciseCatalogWorkbook,
  ULC_EXERCISE_CATALOG_XLSX_CONTENT_TYPE,
  type UlcExerciseCatalogExchangeMode,
} from "./exercise-catalog-exchange";
import {
  ULC_EXERCISE_CATALOG_IMPORT_MAX_FILE_BYTES,
  UlcExerciseCatalogImportFileError,
  createUlcExerciseCatalogImportPreviewToken,
  previewUlcExerciseCatalogImport,
} from "./exercise-catalog-import";
import {
  UlcExerciseCatalogImportApplyError,
  applyUlcExerciseCatalogImportPreview,
} from "./exercise-catalog-import-apply";
import {
  normalizedPrivateVideoContentType,
  normalizedPrivateVideoFileName,
  privateExerciseVideoStorageKey,
  resolveUlcExerciseCatalogObjectStore,
  ULC_EXERCISE_CATALOG_PRIVATE_VIDEO_MAX_BYTES,
} from "./exercise-catalog-private-media";
import {
  UlcExerciseCatalogConflictError,
  UlcExerciseCatalogNotFoundError,
} from "./exercise-catalog-postgres";
import { UlcExerciseCatalogWriteQuiescedError } from "./exercise-catalog-runtime";
import { UlcExerciseCatalogGroupNotFoundError } from "./exercise-catalog-service";
import type { UlcLinzKindertrainingAccessScope } from "./kindertraining-access";
import {
  UlcKindertrainingNotFoundError,
} from "./kindertraining-service";
import type { UlcLinzU12AccessScope } from "./u12-access";
import { UlcU12NotFoundError } from "./u12-service";
import { UlcTrainingValidationError } from "./training-session-domain";
import { UlcTrainingSessionConflictError } from "./training-session-postgres";
import {
  UlcLinzTrainerIdentityConflictError,
  UlcLinzTrainerIdentityNotFoundError,
} from "./trainer-identity-postgres";
import {
  UlcLinzTrainerUserProvisioningConflictError,
  UlcLinzTrainerUserProvisioningNotFoundError,
} from "./trainer-user-provisioning";
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
        } else if (url.pathname === "/api/modules/exercise-catalog") {
          response = await exerciseCatalogModuleResponse(request, runtime, url);
        } else if (
          url.pathname === "/api/modules/exercise-catalog/export.xlsx" ||
          url.pathname === "/api/modules/exercise-catalog/template.xlsx"
        ) {
          response = await exerciseCatalogWorkbookResponse(
            request,
            runtime,
            url,
            url.pathname.endsWith("/template.xlsx") ? "template" : "export",
          );
        } else if (
          url.pathname === "/api/modules/exercise-catalog/import-preview"
        ) {
          response = await exerciseCatalogImportPreviewResponse(
            request,
            runtime,
            url,
          );
        } else if (
          url.pathname === "/api/modules/exercise-catalog/import-apply"
        ) {
          response = await exerciseCatalogImportApplyResponse(
            request,
            runtime,
            url,
          );
        } else if (
          url.pathname === "/api/modules/exercise-catalog/duplicates"
        ) {
          response = await exerciseCatalogDuplicateResponse(
            request,
            runtime,
            url,
          );
        } else if (
          url.pathname.startsWith("/api/modules/exercise-catalog/")
        ) {
          response = await exerciseCatalogItemResponse(request, runtime, url);
        } else if (url.pathname === "/api/modules/kindertraining") {
          response = await kindertrainingModuleResponse(request, runtime, url);
        } else if (url.pathname === "/api/modules/kindertraining/session") {
          response = await kindertrainingSessionResponse(request, runtime, url);
        } else if (url.pathname === "/api/modules/u12") {
          response = await u12ModuleResponse(request, runtime, url);
        } else if (url.pathname === "/api/modules/u12/session") {
          response = await u12SessionResponse(request, runtime, url);
        } else if (url.pathname === "/api/admin/trainer-users") {
          response = await trainerUserAdminResponse(request, runtime, url);
        } else if (url.pathname === "/api/admin/trainer-identities") {
          response = await trainerIdentityAdminResponse(request, runtime, url);
        } else if (url.pathname === "/api/modules/athletes") {
          response = await athletesModuleResponse(request, runtime, url);
        } else if (
          url.pathname === "/api/modules/athletes/export.xlsx" ||
          url.pathname === "/api/modules/athletes/template.xlsx"
        ) {
          response = await athletesWorkbookResponse(
            request,
            runtime,
            url,
            url.pathname.endsWith("/template.xlsx") ? "template" : "export",
          );
        } else if (
          url.pathname === "/api/modules/athletes/import-preview"
        ) {
          response = await athletesImportPreviewResponse(
            request,
            runtime,
            url,
          );
        } else if (
          url.pathname === "/api/modules/athletes/import-apply"
        ) {
          response = await athletesImportApplyResponse(
            request,
            runtime,
            url,
          );
        } else if (url.pathname === "/api/modules/athletes/masterdata") {
          response = await athletesMasterdataResponse(request, runtime, url);
        } else if (
          url.pathname.startsWith("/api/modules/athletes/masterdata/")
        ) {
          response = await athletesMasterdataMutationResponse(
            request,
            runtime,
            url,
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

async function kindertrainingModuleResponse(
  request: Request,
  runtime: GeneratedPostgresApplicationRuntime,
  url: URL,
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowedFor("GET", "Kindertraining");
  }

  const access = await authorizeKindertrainingRequest(
    request,
    runtime,
    url,
    "view",
  );
  if (access instanceof Response) return access;

  const availableTrainingGroups = await runtime.kindertraining.listGroups(
    access.organizationId,
  );
  const trainingGroups =
    access.scope === "organization"
      ? availableTrainingGroups
      : availableTrainingGroups.filter((group) =>
          access.groupIds.includes(group.id),
        );

  return Response.json({
    module: {
      moduleId: "kindertraining",
    },
    access: {
      view: true,
    },
    trainingGroups,
  });
}

async function kindertrainingSessionResponse(
  request: Request,
  runtime: GeneratedPostgresApplicationRuntime,
  url: URL,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") {
    return methodNotAllowedFor("GET, POST", "Kindertraining");
  }

  const action = request.method === "GET" ? "view" : "edit";
  const access = await authorizeKindertrainingRequest(
    request,
    runtime,
    url,
    action,
  );
  if (access instanceof Response) return access;

  try {
    if (request.method === "GET") {
      const query = kindertrainingSessionQuery(url);
      if (!kindertrainingGroupAllowed(access, query.groupId)) {
        return kindertrainingGroupScopeDenied(runtime, access, action);
      }
      const snapshot = await runtime.kindertraining.readSnapshot(
        access.organizationId,
        query.groupId,
        query.sessionDate,
      );
      return Response.json({ snapshot });
    }

    const body = await kindertrainingJsonBody(request);
    if (!kindertrainingGroupAllowed(access, body.groupId as string)) {
      return kindertrainingGroupScopeDenied(runtime, access, action);
    }
    const snapshot = await runtime.kindertraining.saveSession(
      access.organizationId,
      {
        groupId: body.groupId as string,
        sessionDate: body.sessionDate as string,
        ...(body.state === undefined
          ? {}
          : { state: body.state as "scheduled" | "cancelled" }),
        ...(body.note === undefined
          ? {}
          : { note: body.note as string | null }),
        expectedRevision: body.expectedRevision as string | null,
        attendance: body.attendance as Array<{
          athleteId: string;
          status: "open" | "present" | "excused" | "absent";
        }>,
      },
    );
    return Response.json({ snapshot });
  } catch (error) {
    if (error instanceof UlcTrainingSessionConflictError) {
      return kindertrainingSessionConflict();
    }
    if (error instanceof UlcTrainingValidationError) {
      return invalidKindertrainingSession();
    }
    if (error instanceof InvalidKindertrainingRequestError) {
      return invalidKindertrainingSession();
    }
    if (error instanceof UlcKindertrainingNotFoundError) {
      return kindertrainingGroupNotFound();
    }
    throw error;
  }
}

async function authorizeKindertrainingRequest(
  request: Request,
  runtime: GeneratedPostgresApplicationRuntime,
  url: URL,
  action: "view" | "edit",
): Promise<Response | UlcLinzKindertrainingAccessScope> {
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
        action,
        targetId: "kindertraining",
        reasonCode: "identity-access-denied",
      });
    }
    return current;
  }

  try {
    return action === "view"
      ? await runtime.kindertrainingAccess.assertViewAccess(current)
      : await runtime.kindertrainingAccess.assertEditAccess(current);
  } catch (error) {
    if (error instanceof UlcLinzAuthorizationDeniedError) {
      return Response.json(
        {
          error: {
            code: error.code,
            message: "Kindertraining access denied.",
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

function kindertrainingGroupAllowed(
  access: UlcLinzKindertrainingAccessScope,
  groupId: string,
): boolean {
  return access.scope === "organization" || access.groupIds.includes(groupId);
}

function kindertrainingGroupScopeDenied(
  runtime: GeneratedPostgresApplicationRuntime,
  access: UlcLinzKindertrainingAccessScope,
  action: "view" | "edit",
): Response {
  recordUlcLinzSecurityEvent(runtime.securityEvents, {
    eventType: "authorization.denied",
    actorPrincipalId: access.actorPrincipalId,
    organizationId: access.organizationId,
    action,
    targetId: "kindertraining",
    reasonCode: "scope-denied",
  });
  return kindertrainingGroupNotFound();
}

class InvalidKindertrainingRequestError extends Error {}

function kindertrainingSessionQuery(url: URL): {
  groupId: string;
  sessionDate: string;
} {
  const keys = [...url.searchParams.keys()];
  if (
    keys.some((key) => key !== "groupId" && key !== "sessionDate") ||
    url.searchParams.getAll("groupId").length !== 1 ||
    url.searchParams.getAll("sessionDate").length !== 1
  ) {
    throw new InvalidKindertrainingRequestError();
  }
  const groupId = url.searchParams.get("groupId");
  const sessionDate = url.searchParams.get("sessionDate");
  if (
    typeof groupId !== "string" ||
    groupId.length === 0 ||
    groupId.length > 200 ||
    groupId.trim() !== groupId ||
    typeof sessionDate !== "string"
  ) {
    throw new InvalidKindertrainingRequestError();
  }
  return { groupId, sessionDate };
}

async function kindertrainingJsonBody(
  request: Request,
): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new InvalidKindertrainingRequestError();
  }
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new InvalidKindertrainingRequestError();
  }
  const body = value as Record<string, unknown>;
  const allowed = [
    "groupId",
    "sessionDate",
    "state",
    "note",
    "expectedRevision",
    "attendance",
  ];
  if (
    Object.keys(body).some((key) => !allowed.includes(key)) ||
    !Object.prototype.hasOwnProperty.call(body, "groupId") ||
    !Object.prototype.hasOwnProperty.call(body, "sessionDate") ||
    !Object.prototype.hasOwnProperty.call(body, "expectedRevision") ||
    !Object.prototype.hasOwnProperty.call(body, "attendance") ||
    Object.getOwnPropertySymbols(body).length !== 0 ||
    typeof body.groupId !== "string" ||
    body.groupId.length === 0 ||
    body.groupId.length > 200 ||
    body.groupId.trim() !== body.groupId ||
    !Array.isArray(body.attendance) ||
    !(
      body.expectedRevision === null ||
      (typeof body.expectedRevision === "string" &&
        /^\d+$/.test(body.expectedRevision) &&
        body.expectedRevision.length <= 20)
    )
  ) {
    throw new InvalidKindertrainingRequestError();
  }
  for (const entry of body.attendance) {
    if (
      entry === null ||
      typeof entry !== "object" ||
      Array.isArray(entry) ||
      Object.getPrototypeOf(entry) !== Object.prototype ||
      JSON.stringify(Object.keys(entry).sort()) !==
        JSON.stringify(["athleteId", "status"])
    ) {
      throw new InvalidKindertrainingRequestError();
    }
  }
  return body;
}

function invalidKindertrainingSession(): Response {
  return Response.json(
    {
      error: {
        code: "INVALID_TRAINING_SESSION",
        message: "The Kindertraining input is invalid.",
      },
    },
    { status: 400 },
  );
}

function kindertrainingSessionConflict(): Response {
  return Response.json(
    {
      error: {
        code: "TRAINING_SESSION_CONFLICT",
        message: "The training session changed since it was loaded.",
      },
    },
    { status: 409 },
  );
}

function kindertrainingGroupNotFound(): Response {
  return Response.json(
    {
      error: {
        code: "TRAINING_GROUP_NOT_FOUND",
        message: "The training group was not found.",
      },
    },
    { status: 404 },
  );
}

async function u12ModuleResponse(
  request: Request,
  runtime: GeneratedPostgresApplicationRuntime,
  url: URL,
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowedFor("GET", "U12");
  }

  const access = await authorizeU12Request(
    request,
    runtime,
    url,
    "view",
  );
  if (access instanceof Response) return access;

  const availableTrainingGroups = await runtime.u12.listGroups(
    access.organizationId,
  );
  const trainingGroups =
    access.scope === "organization"
      ? availableTrainingGroups
      : availableTrainingGroups.filter((group) =>
          access.groupIds.includes(group.id),
        );

  return Response.json({
    module: {
      moduleId: "u12",
    },
    access: {
      view: true,
    },
    trainingGroups,
  });
}

async function u12SessionResponse(
  request: Request,
  runtime: GeneratedPostgresApplicationRuntime,
  url: URL,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") {
    return methodNotAllowedFor("GET, POST", "U12");
  }

  const action = request.method === "GET" ? "view" : "edit";
  const access = await authorizeU12Request(
    request,
    runtime,
    url,
    action,
  );
  if (access instanceof Response) return access;

  try {
    if (request.method === "GET") {
      const query = u12SessionQuery(url);
      if (!u12GroupAllowed(access, query.groupId)) {
        return u12GroupScopeDenied(runtime, access, action);
      }
      const snapshot = await runtime.u12.readSnapshot(
        access.organizationId,
        query.groupId,
        query.sessionDate,
      );
      return Response.json({ snapshot });
    }

    const body = await u12JsonBody(request);
    if (!u12GroupAllowed(access, body.groupId as string)) {
      return u12GroupScopeDenied(runtime, access, action);
    }
    const snapshot = await runtime.u12.saveSession(
      access.organizationId,
      {
        groupId: body.groupId as string,
        sessionDate: body.sessionDate as string,
        ...(body.state === undefined
          ? {}
          : { state: body.state as "scheduled" | "cancelled" }),
        ...(body.note === undefined
          ? {}
          : { note: body.note as string | null }),
        expectedRevision: body.expectedRevision as string | null,
        attendance: body.attendance as Array<{
          athleteId: string;
          status: "open" | "present" | "excused" | "absent";
        }>,
      },
    );
    return Response.json({ snapshot });
  } catch (error) {
    if (error instanceof UlcTrainingSessionConflictError) {
      return u12SessionConflict();
    }
    if (error instanceof UlcTrainingValidationError) {
      return invalidU12Session();
    }
    if (error instanceof InvalidU12RequestError) {
      return invalidU12Session();
    }
    if (error instanceof UlcU12NotFoundError) {
      return u12GroupNotFound();
    }
    throw error;
  }
}

async function authorizeU12Request(
  request: Request,
  runtime: GeneratedPostgresApplicationRuntime,
  url: URL,
  action: "view" | "edit",
): Promise<Response | UlcLinzU12AccessScope> {
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
        action,
        targetId: "u12",
        reasonCode: "identity-access-denied",
      });
    }
    return current;
  }

  try {
    return action === "view"
      ? await runtime.u12Access.assertViewAccess(current)
      : await runtime.u12Access.assertEditAccess(current);
  } catch (error) {
    if (error instanceof UlcLinzAuthorizationDeniedError) {
      return Response.json(
        {
          error: {
            code: error.code,
            message: "U12 access denied.",
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

function u12GroupAllowed(
  access: UlcLinzU12AccessScope,
  groupId: string,
): boolean {
  return access.scope === "organization" || access.groupIds.includes(groupId);
}

function u12GroupScopeDenied(
  runtime: GeneratedPostgresApplicationRuntime,
  access: UlcLinzU12AccessScope,
  action: "view" | "edit",
): Response {
  recordUlcLinzSecurityEvent(runtime.securityEvents, {
    eventType: "authorization.denied",
    actorPrincipalId: access.actorPrincipalId,
    organizationId: access.organizationId,
    action,
    targetId: "u12",
    reasonCode: "scope-denied",
  });
  return u12GroupNotFound();
}

class InvalidU12RequestError extends Error {}

function u12SessionQuery(url: URL): {
  groupId: string;
  sessionDate: string;
} {
  const keys = [...url.searchParams.keys()];
  if (
    keys.some((key) => key !== "groupId" && key !== "sessionDate") ||
    url.searchParams.getAll("groupId").length !== 1 ||
    url.searchParams.getAll("sessionDate").length !== 1
  ) {
    throw new InvalidU12RequestError();
  }
  const groupId = url.searchParams.get("groupId");
  const sessionDate = url.searchParams.get("sessionDate");
  if (
    typeof groupId !== "string" ||
    groupId.length === 0 ||
    groupId.length > 200 ||
    groupId.trim() !== groupId ||
    typeof sessionDate !== "string"
  ) {
    throw new InvalidU12RequestError();
  }
  return { groupId, sessionDate };
}

async function u12JsonBody(
  request: Request,
): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new InvalidU12RequestError();
  }
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new InvalidU12RequestError();
  }
  const body = value as Record<string, unknown>;
  const allowed = [
    "groupId",
    "sessionDate",
    "state",
    "note",
    "expectedRevision",
    "attendance",
  ];
  if (
    Object.keys(body).some((key) => !allowed.includes(key)) ||
    !Object.prototype.hasOwnProperty.call(body, "groupId") ||
    !Object.prototype.hasOwnProperty.call(body, "sessionDate") ||
    !Object.prototype.hasOwnProperty.call(body, "expectedRevision") ||
    !Object.prototype.hasOwnProperty.call(body, "attendance") ||
    Object.getOwnPropertySymbols(body).length !== 0 ||
    typeof body.groupId !== "string" ||
    body.groupId.length === 0 ||
    body.groupId.length > 200 ||
    body.groupId.trim() !== body.groupId ||
    !Array.isArray(body.attendance) ||
    !(
      body.expectedRevision === null ||
      (typeof body.expectedRevision === "string" &&
        /^\d+$/.test(body.expectedRevision) &&
        body.expectedRevision.length <= 20)
    )
  ) {
    throw new InvalidU12RequestError();
  }
  for (const entry of body.attendance) {
    if (
      entry === null ||
      typeof entry !== "object" ||
      Array.isArray(entry) ||
      Object.getPrototypeOf(entry) !== Object.prototype ||
      JSON.stringify(Object.keys(entry).sort()) !==
        JSON.stringify(["athleteId", "status"])
    ) {
      throw new InvalidU12RequestError();
    }
  }
  return body;
}

function invalidU12Session(): Response {
  return Response.json(
    {
      error: {
        code: "INVALID_TRAINING_SESSION",
        message: "The U12 input is invalid.",
      },
    },
    { status: 400 },
  );
}

function u12SessionConflict(): Response {
  return Response.json(
    {
      error: {
        code: "TRAINING_SESSION_CONFLICT",
        message: "The training session changed since it was loaded.",
      },
    },
    { status: 409 },
  );
}

function u12GroupNotFound(): Response {
  return Response.json(
    {
      error: {
        code: "TRAINING_GROUP_NOT_FOUND",
        message: "The training group was not found.",
      },
    },
    { status: 404 },
  );
}


async function trainerUserAdminResponse(
  request: Request,
  runtime: GeneratedPostgresApplicationRuntime,
  url: URL,
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowedFor("POST", "Trainer user administration");
  }
  if ([...url.searchParams.keys()].length !== 0) {
    return invalidTrainerUserRequest();
  }

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
        action: "edit",
        targetId: "trainer-user-admin",
        reasonCode: "identity-access-denied",
      });
    }
    return current;
  }

  let access: Readonly<{ organizationId: string; actorPrincipalId: string }>;
  try {
    access = await runtime.trainerIdentityAccess.assertAdminAccess(current);
  } catch (error) {
    if (error instanceof UlcLinzAuthorizationDeniedError) {
      return Response.json(
        {
          error: {
            code: error.code,
            message: "Trainer user administration access denied.",
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

  try {
    const body = await trainerUserJsonBody(request);
    const trainerUser = await runtime.trainerUserProvisioning.createTrainerUser({
      organizationId: access.organizationId,
      actorPrincipalId: access.actorPrincipalId,
      username: body.username as string,
      displayName: body.displayName as string,
      temporaryPassword: body.temporaryPassword as string,
      trainerId: body.trainerId as string,
      ...(body.contactEmail === undefined
        ? {}
        : { contactEmail: body.contactEmail as string }),
    });
    return Response.json({ trainerUser }, { status: 201 });
  } catch (error) {
    if (
      error instanceof InvalidTrainerUserRequestError ||
      error instanceof TypeError
    ) {
      return invalidTrainerUserRequest();
    }
    if (
      error instanceof UlcLinzTrainerUserProvisioningNotFoundError ||
      error instanceof UlcLinzTrainerIdentityNotFoundError
    ) {
      return Response.json(
        {
          error: {
            code: "TRAINER_USER_TARGET_NOT_FOUND",
            message: "The selected trainer is no longer available.",
          },
        },
        { status: 404 },
      );
    }
    if (
      error instanceof UlcLinzTrainerUserProvisioningConflictError ||
      error instanceof UlcLinzTrainerIdentityConflictError
    ) {
      return Response.json(
        {
          error: {
            code: "TRAINER_USER_CONFLICT",
            message: "The username or trainer conflicts with existing active state.",
          },
        },
        { status: 409 },
      );
    }
    throw error;
  }
}

function invalidTrainerUserRequest(): Response {
  return Response.json(
    {
      error: {
        code: "INVALID_TRAINER_USER_REQUEST",
        message: "The trainer user input is invalid.",
      },
    },
    { status: 400 },
  );
}

class InvalidTrainerUserRequestError extends Error {}

async function trainerUserJsonBody(
  request: Request,
): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new InvalidTrainerUserRequestError();
  }
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new InvalidTrainerUserRequestError();
  }
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body).sort();
  const allowedWithoutEmail = ["displayName", "temporaryPassword", "trainerId", "username"];
  const allowedWithEmail = ["contactEmail", ...allowedWithoutEmail].sort();
  const validKeys =
    JSON.stringify(keys) === JSON.stringify(allowedWithoutEmail) ||
    JSON.stringify(keys) === JSON.stringify(allowedWithEmail);
  if (
    !validKeys ||
    Object.getOwnPropertySymbols(body).length !== 0 ||
    !validTrainerUsername(body.username) ||
    !validTrainerDisplayName(body.displayName) ||
    !validTemporaryPassword(body.temporaryPassword) ||
    !validRequestIdentifier(body.trainerId) ||
    (body.contactEmail !== undefined && !validContactEmail(body.contactEmail))
  ) {
    throw new InvalidTrainerUserRequestError();
  }
  return body;
}

function validTrainerUsername(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 3 &&
    value.length <= 30 &&
    value.trim() === value &&
    /^[a-z0-9._]+$/.test(value)
  );
}

function validTrainerDisplayName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 120 &&
    value.trim() === value
  );
}

function validTemporaryPassword(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 8 &&
    value.length <= 128 &&
    value.trim().length > 0
  );
}

function validContactEmail(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 3 &&
    value.length <= 320 &&
    value.trim() === value &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)
  );
}

async function trainerIdentityAdminResponse(
  request: Request,
  runtime: GeneratedPostgresApplicationRuntime,
  url: URL,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") {
    return methodNotAllowedFor("GET, POST", "Trainer identity administration");
  }
  if ([...url.searchParams.keys()].length !== 0) {
    return invalidTrainerIdentityLink();
  }

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
        action: "edit",
        targetId: "trainer-identity-admin",
        reasonCode: "identity-access-denied",
      });
    }
    return current;
  }

  let access: Readonly<{ organizationId: string; actorPrincipalId: string }>;
  try {
    access = await runtime.trainerIdentityAccess.assertAdminAccess(current);
  } catch (error) {
    if (error instanceof UlcLinzAuthorizationDeniedError) {
      return Response.json(
        {
          error: {
            code: error.code,
            message: "Trainer identity administration access denied.",
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

  if (request.method === "GET") {
    const trainerIdentities =
      await runtime.trainerIdentityLinks.listBindings(access.organizationId);
    return Response.json({ trainerIdentities });
  }

  try {
    const body = await trainerIdentityJsonBody(request);
    const trainerIdentity = await runtime.trainerIdentityLinks.bindTrainer({
      organizationId: access.organizationId,
      actorPrincipalId: access.actorPrincipalId,
      identityId: body.identityId as string,
      trainerId: body.trainerId as string,
    });
    return Response.json({ trainerIdentity });
  } catch (error) {
    if (error instanceof InvalidTrainerIdentityRequestError) {
      return invalidTrainerIdentityLink();
    }
    if (error instanceof UlcLinzTrainerIdentityNotFoundError) {
      return Response.json(
        {
          error: {
            code: "TRAINER_IDENTITY_NOT_FOUND",
            message: "The trainer identity or trainer was not found.",
          },
        },
        { status: 404 },
      );
    }
    if (error instanceof UlcLinzTrainerIdentityConflictError) {
      return Response.json(
        {
          error: {
            code: "TRAINER_IDENTITY_CONFLICT",
            message: "The trainer is already linked to another identity.",
          },
        },
        { status: 409 },
      );
    }
    throw error;
  }
}

function invalidTrainerIdentityLink(): Response {
  return Response.json(
    {
      error: {
        code: "INVALID_TRAINER_IDENTITY_LINK",
        message: "The trainer identity link input is invalid.",
      },
    },
    { status: 400 },
  );
}

class InvalidTrainerIdentityRequestError extends Error {}

async function trainerIdentityJsonBody(
  request: Request,
): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new InvalidTrainerIdentityRequestError();
  }
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new InvalidTrainerIdentityRequestError();
  }
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body).sort();
  if (
    JSON.stringify(keys) !== JSON.stringify(["identityId", "trainerId"]) ||
    Object.getOwnPropertySymbols(body).length !== 0 ||
    !validRequestIdentifier(body.identityId) ||
    !validRequestIdentifier(body.trainerId)
  ) {
    throw new InvalidTrainerIdentityRequestError();
  }
  return body;
}

function validRequestIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 200 &&
    value.trim() === value
  );
}

async function exerciseCatalogModuleResponse(
  request: Request,
  runtime: GeneratedPostgresApplicationRuntime,
  url: URL,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") {
    return methodNotAllowedFor("GET, POST", "exercise catalog");
  }
  if ([...url.searchParams.keys()].length !== 0) {
    return invalidExerciseCatalogInput();
  }

  const action = request.method === "GET" ? "view" : "edit";
  const access = await authorizeExerciseCatalogRequest(
    request,
    runtime,
    url,
    action,
  );
  if (access instanceof Response) return access;

  try {
    if (request.method === "GET") {
      const catalog = await runtime.exerciseCatalog.list(
        access.organizationId,
        access.actorPrincipalId,
      );
      return Response.json({
        module: {
          moduleId: "exercise_catalog",
          features: {
            difficulty:
              runtime.exerciseCatalogRuntimeMode === "standard-module",
            similarExercises:
              runtime.exerciseCatalogRuntimeMode === "standard-module",
            duplicateWarnings:
              runtime.exerciseCatalogRuntimeMode === "standard-module",
            usageHistory:
              runtime.exerciseCatalogRuntimeMode === "standard-module",
            multipleExternalVideos:
              runtime.exerciseCatalogRuntimeMode === "standard-module",
            privateVideoUpload:
              runtime.exerciseCatalogRuntimeMode === "standard-module" &&
              runtime.exerciseCatalogMediaStore !== null,
          },
        },
        access: { view: true, edit: access.canEdit },
        catalog,
      });
    }

    const body = await exerciseCatalogJsonBody(
      request,
      EXERCISE_CREATE_FIELDS,
      ["name", "categoryKey"],
    );
    const item = await runtime.exerciseCatalog.create(
      access.organizationId,
      access.actorPrincipalId,
      body as unknown as CreateUlcExerciseCatalogItemInput,
    );
    return Response.json({ item }, { status: 201 });
  } catch (error) {
    return exerciseCatalogErrorResponse(error);
  }
}

async function exerciseCatalogWorkbookResponse(
  request: Request,
  runtime: GeneratedPostgresApplicationRuntime,
  url: URL,
  mode: UlcExerciseCatalogExchangeMode,
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowedFor("GET", "exercise catalog workbook");
  }
  if ([...url.searchParams.keys()].length !== 0) {
    return invalidExerciseCatalogInput();
  }

  const access = await authorizeExerciseCatalogRequest(
    request,
    runtime,
    url,
    "view",
  );
  if (access instanceof Response) return access;

  const catalog = await runtime.exerciseCatalog.list(
    access.organizationId,
    access.actorPrincipalId,
  );
  const workbook = createUlcExerciseCatalogWorkbook(catalog, mode);
  const responseBytes = new Uint8Array(workbook.byteLength);
  responseBytes.set(workbook);

  return new Response(responseBytes.buffer, {
    status: 200,
    headers: {
      "content-type": ULC_EXERCISE_CATALOG_XLSX_CONTENT_TYPE,
      "content-disposition":
        mode === "template"
          ? 'attachment; filename="ulc-uebungskatalog-importvorlage.xlsx"'
          : 'attachment; filename="ulc-uebungskatalog-export.xlsx"',
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function isExerciseCatalogImportContentType(value: string): boolean {
  return (
    value === ULC_EXERCISE_CATALOG_XLSX_CONTENT_TYPE ||
    value === "application/xml" ||
    value === "text/xml" ||
    value === "application/vnd.ms-excel"
  );
}

async function exerciseCatalogImportPreviewResponse(
  request: Request,
  runtime: GeneratedPostgresApplicationRuntime,
  url: URL,
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowedFor("POST", "exercise catalog import preview");
  }
  if ([...url.searchParams.keys()].length !== 0) {
    return invalidExerciseCatalogInput();
  }

  const access = await authorizeExerciseCatalogRequest(
    request,
    runtime,
    url,
    "edit",
  );
  if (access instanceof Response) return access;

  const contentType = (request.headers.get("content-type") ?? "")
    .split(";", 1)[0]!
    .trim()
    .toLocaleLowerCase("en");
  if (!isExerciseCatalogImportContentType(contentType)) {
    return Response.json(
      {
        error: {
          code: "INVALID_IMPORT_CONTENT_TYPE",
          message: "Only XLSX or Excel XML files are supported for exercise catalog import preview.",
        },
      },
      {
        status: 415,
        headers: { "cache-control": "private, no-store" },
      },
    );
  }

  try {
    const bytes = await readRequestBytesLimited(
      request,
      ULC_EXERCISE_CATALOG_IMPORT_MAX_FILE_BYTES,
    );
    const catalog = await runtime.exerciseCatalog.list(
      access.organizationId,
      access.actorPrincipalId,
    );
    const preview = await previewUlcExerciseCatalogImport(bytes, catalog);
    const previewToken = await createUlcExerciseCatalogImportPreviewToken(
      bytes,
      catalog,
      access.organizationId,
    );
    return Response.json(
      {
        preview,
        apply: {
          available:
            preview.summary.errors === 0 &&
            preview.summary.create + preview.summary.update > 0,
          previewToken,
        },
      },
      {
        headers: {
          "cache-control": "private, no-store",
          "x-content-type-options": "nosniff",
        },
      },
    );
  } catch (error) {
    if (error instanceof XlsxRequestBodyError) {
      return Response.json(
        { error: { code: error.code, message: error.message } },
        {
          status: error.code === "IMPORT_FILE_TOO_LARGE" ? 413 : 400,
          headers: {
            "cache-control": "private, no-store",
            "x-content-type-options": "nosniff",
          },
        },
      );
    }
    if (error instanceof UlcExerciseCatalogImportFileError) {
      return Response.json(
        {
          error: {
            code: error.code,
            message: error.message,
          },
        },
        {
          status: error.code === "IMPORT_FILE_TOO_LARGE" ? 413 : 400,
          headers: {
            "cache-control": "private, no-store",
            "x-content-type-options": "nosniff",
          },
        },
      );
    }
    throw error;
  }
}

async function exerciseCatalogImportApplyResponse(
  request: Request,
  runtime: GeneratedPostgresApplicationRuntime,
  url: URL,
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowedFor("POST", "exercise catalog import apply");
  }
  if ([...url.searchParams.keys()].length !== 0) {
    return invalidExerciseCatalogInput();
  }

  const access = await authorizeExerciseCatalogRequest(
    request,
    runtime,
    url,
    "edit",
  );
  if (access instanceof Response) return access;

  const contentType = (request.headers.get("content-type") ?? "")
    .split(";", 1)[0]!
    .trim()
    .toLocaleLowerCase("en");
  if (!isExerciseCatalogImportContentType(contentType)) {
    return Response.json(
      {
        error: {
          code: "INVALID_IMPORT_CONTENT_TYPE",
          message: "Only XLSX or Excel XML files are supported for exercise catalog import apply.",
        },
      },
      {
        status: 415,
        headers: { "cache-control": "private, no-store" },
      },
    );
  }

  const expectedPreviewToken =
    request.headers.get("x-appbasis-import-preview-token") ?? "";

  try {
    const bytes = await readRequestBytesLimited(
      request,
      ULC_EXERCISE_CATALOG_IMPORT_MAX_FILE_BYTES,
    );
    const catalog = await runtime.exerciseCatalog.list(
      access.organizationId,
      access.actorPrincipalId,
    );
    const preview = await previewUlcExerciseCatalogImport(bytes, catalog);
    const actualPreviewToken =
      await createUlcExerciseCatalogImportPreviewToken(
        bytes,
        catalog,
        access.organizationId,
      );
    const result = await applyUlcExerciseCatalogImportPreview({
      preview,
      expectedPreviewToken,
      actualPreviewToken,
      organizationId: access.organizationId,
      actorPrincipalId: access.actorPrincipalId,
      service: runtime.exerciseCatalog,
    });
    return Response.json(
      { result },
      {
        headers: {
          "cache-control": "private, no-store",
          "x-content-type-options": "nosniff",
        },
      },
    );
  } catch (error) {
    if (error instanceof XlsxRequestBodyError) {
      return Response.json(
        { error: { code: error.code, message: error.message } },
        {
          status: error.code === "IMPORT_FILE_TOO_LARGE" ? 413 : 400,
          headers: {
            "cache-control": "private, no-store",
            "x-content-type-options": "nosniff",
          },
        },
      );
    }
    if (error instanceof UlcExerciseCatalogImportFileError) {
      return Response.json(
        {
          error: {
            code: error.code,
            message: error.message,
          },
        },
        {
          status: error.code === "IMPORT_FILE_TOO_LARGE" ? 413 : 400,
          headers: {
            "cache-control": "private, no-store",
            "x-content-type-options": "nosniff",
          },
        },
      );
    }
    if (error instanceof UlcExerciseCatalogImportApplyError) {
      return Response.json(
        {
          error: {
            code: error.code,
            message: error.message,
          },
        },
        {
          status:
            error.code === "INVALID_IMPORT_TOKEN"
              ? 400
              : 409,
          headers: {
            "cache-control": "private, no-store",
            "x-content-type-options": "nosniff",
          },
        },
      );
    }
    throw error;
  }
}

class XlsxRequestBodyError extends Error {
  readonly code: "IMPORT_FILE_TOO_LARGE" | "INVALID_XLSX";

  constructor(
    code: "IMPORT_FILE_TOO_LARGE" | "INVALID_XLSX",
    message: string,
  ) {
    super(message);
    this.name = "XlsxRequestBodyError";
    this.code = code;
  }
}

async function readRequestBytesLimited(
  request: Request,
  maximumBytes: number,
): Promise<Uint8Array> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsed = Number(declaredLength);
    if (Number.isFinite(parsed) && parsed > maximumBytes) {
      throw new XlsxRequestBodyError(
        "IMPORT_FILE_TOO_LARGE",
        "Die XLSX-Datei überschreitet 5 MB.",
      );
    }
  }

  if (request.body === null) {
    throw new XlsxRequestBodyError(
      "INVALID_XLSX",
      "Die XLSX-Datei fehlt.",
    );
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      throw new XlsxRequestBodyError(
        "IMPORT_FILE_TOO_LARGE",
        "Die XLSX-Datei überschreitet 5 MB.",
      );
    }
    chunks.push(next.value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function exerciseCatalogDuplicateResponse(
  request: Request,
  runtime: GeneratedPostgresApplicationRuntime,
  url: URL,
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowedFor("POST", "exercise catalog duplicate check");
  }
  if ([...url.searchParams.keys()].length !== 0) {
    return invalidExerciseCatalogInput();
  }
  const access = await authorizeExerciseCatalogRequest(
    request,
    runtime,
    url,
    "view",
  );
  if (access instanceof Response) return access;

  try {
    const body = await exerciseCatalogJsonBody(
      request,
      EXERCISE_DUPLICATE_FIELDS,
      ["name", "categoryKey"],
    );
    const excludeExerciseId =
      typeof body.excludeExerciseId === "string"
        ? body.excludeExerciseId
        : body.excludeExerciseId === undefined ||
            body.excludeExerciseId === null
          ? null
          : (() => {
              throw new InvalidExerciseCatalogRequestError();
            })();
    const { excludeExerciseId: _ignored, ...input } = body;
    const candidates = await runtime.exerciseCatalog.findDuplicateCandidates(
      access.organizationId,
      input as unknown as CreateUlcExerciseCatalogItemInput,
      excludeExerciseId,
    );
    return Response.json(
      { candidates },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return exerciseCatalogErrorResponse(error);
  }
}

async function exerciseCatalogItemResponse(
  request: Request,
  runtime: GeneratedPostgresApplicationRuntime,
  url: URL,
): Promise<Response> {
  if ([...url.searchParams.keys()].length !== 0) {
    return invalidExerciseCatalogInput();
  }

  const base = "/api/modules/exercise-catalog/";
  const route = url.pathname.slice(base.length);
  const detail = /^([^/]+)$/.exec(route);
  const update = /^([^/]+)\/update$/.exec(route);
  const deactivate = /^([^/]+)\/deactivate$/.exec(route);
  const favorite = /^([^/]+)\/favorite$/.exec(route);
  const usage = /^([^/]+)\/usage$/.exec(route);
  const privateMedia = /^([^/]+)\/private-media$/.exec(route);
  const privateMediaContent =
    /^([^/]+)\/private-media\/([^/]+)\/content$/.exec(route);
  const privateMediaDelete =
    /^([^/]+)\/private-media\/([^/]+)$/.exec(route);

  let action: "view" | "edit";
  if (
    (detail !== null ||
      (usage !== null && request.method === "GET") ||
      (privateMedia !== null && request.method === "GET") ||
      (privateMediaContent !== null && request.method === "GET")) &&
    request.method === "GET"
  ) {
    action = "view";
  } else if (
    ((update !== null || deactivate !== null || usage !== null) &&
      request.method === "POST") ||
    (privateMedia !== null && request.method === "POST") ||
    (privateMediaDelete !== null && request.method === "DELETE")
  ) {
    action = "edit";
  } else if (
    favorite !== null &&
    (request.method === "PUT" || request.method === "DELETE")
  ) {
    action = "view";
  } else {
    return methodNotAllowedFor(
      "GET, POST, PUT, DELETE",
      "exercise catalog item",
    );
  }

  const access = await authorizeExerciseCatalogRequest(
    request,
    runtime,
    url,
    action,
  );
  if (access instanceof Response) return access;

  try {
    if (detail !== null) {
      const id = decodeExerciseCatalogPathIdentifier(detail[1]);
      const item = await runtime.exerciseCatalog.read(
        access.organizationId,
        access.actorPrincipalId,
        id,
      );
      if (item === null) return exerciseCatalogNotFound();
      return Response.json({ item });
    }

    if (update !== null) {
      const id = decodeExerciseCatalogPathIdentifier(update[1]);
      const body = await exerciseCatalogJsonBody(
        request,
        EXERCISE_UPDATE_FIELDS,
        EXERCISE_UPDATE_FIELDS,
      );
      const item = await runtime.exerciseCatalog.update(
        access.organizationId,
        access.actorPrincipalId,
        id,
        body as unknown as CreateUlcExerciseCatalogItemInput,
      );
      return Response.json({ item });
    }

    if (deactivate !== null) {
      const id = decodeExerciseCatalogPathIdentifier(deactivate[1]);
      await runtime.exerciseCatalog.deactivate(access.organizationId, id);
      return Response.json({ deactivated: true });
    }

    if (favorite !== null) {
      const id = decodeExerciseCatalogPathIdentifier(favorite[1]);
      const item = await runtime.exerciseCatalog.setFavorite(
        access.organizationId,
        access.actorPrincipalId,
        id,
        request.method === "PUT",
      );
      return Response.json({ item });
    }

    if (usage !== null) {
      const id = decodeExerciseCatalogPathIdentifier(usage[1]);
      if (request.method === "GET") {
        const [events, summaries] = await Promise.all([
          runtime.exerciseCatalog.listUsage(access.organizationId, id, 100),
          runtime.exerciseCatalog.listUsageSummaries(access.organizationId),
        ]);
        const summary = summaries.find((entry) => entry.exerciseId === id) ?? {
          exerciseId: id,
          usageCount: 0,
          lastUsedAt: null,
        };
        return Response.json(
          { summary, events },
          { headers: { "cache-control": "private, no-store" } },
        );
      }
      const body = await exerciseCatalogJsonBody(
        request,
        EXERCISE_USAGE_FIELDS,
        ["sourceKind"],
      );
      const event = await runtime.exerciseCatalog.recordUsage(
        access.organizationId,
        id,
        body as {
          occurredAt?: string;
          sourceKind: string;
          sourceRef?: string | null;
          note?: string | null;
        },
      );
      if (event === undefined) return exerciseCatalogNotFound();
      return Response.json({ event }, { status: 201 });
    }

    if (privateMedia !== null) {
      const id = decodeExerciseCatalogPathIdentifier(privateMedia[1]);
      if (request.method === "GET") {
        const media = await runtime.exerciseCatalog.listPrivateMedia(
          access.organizationId,
          id,
        );
        return Response.json(
          {
            available: runtime.exerciseCatalogMediaStore !== null,
            maximumBytes: ULC_EXERCISE_CATALOG_PRIVATE_VIDEO_MAX_BYTES,
            media,
          },
          { headers: { "cache-control": "private, no-store" } },
        );
      }
      return uploadExerciseCatalogPrivateMedia(
        request,
        runtime,
        access.organizationId,
        access.actorPrincipalId,
        id,
      );
    }

    if (privateMediaContent !== null) {
      const exerciseId = decodeExerciseCatalogPathIdentifier(
        privateMediaContent[1],
      );
      const mediaId = decodeExerciseCatalogPathIdentifier(
        privateMediaContent[2],
      );
      return exerciseCatalogPrivateMediaContent(
        request,
        runtime,
        access.organizationId,
        exerciseId,
        mediaId,
      );
    }

    if (privateMediaDelete !== null) {
      const exerciseId = decodeExerciseCatalogPathIdentifier(
        privateMediaDelete[1],
      );
      const mediaId = decodeExerciseCatalogPathIdentifier(
        privateMediaDelete[2],
      );
      return deleteExerciseCatalogPrivateMedia(
        runtime,
        access.organizationId,
        exerciseId,
        mediaId,
      );
    }

    return exerciseCatalogNotFound();
  } catch (error) {
    if (error instanceof PrivateExerciseVideoRequestError) {
      return Response.json(
        { error: { code: error.code, message: error.message } },
        {
          status: error.code === "PRIVATE_VIDEO_TOO_LARGE" ? 413 : 400,
          headers: { "cache-control": "private, no-store" },
        },
      );
    }
    return exerciseCatalogErrorResponse(error);
  }
}

async function uploadExerciseCatalogPrivateMedia(
  request: Request,
  runtime: GeneratedPostgresApplicationRuntime,
  organizationId: string,
  actorPrincipalId: string,
  exerciseId: string,
): Promise<Response> {
  const store = runtime.exerciseCatalogMediaStore;
  if (store === null) return exerciseCatalogPrivateMediaUnavailable();

  const item = await runtime.exerciseCatalog.read(
    organizationId,
    actorPrincipalId,
    exerciseId,
  );
  if (item === null) return exerciseCatalogNotFound();

  let contentType: string;
  let fileName: string;
  try {
    contentType = normalizedPrivateVideoContentType(
      request.headers.get("content-type"),
    );
    fileName = normalizedPrivateVideoFileName(
      request.headers.get("x-appbasis-file-name"),
    );
  } catch {
    throw new PrivateExerciseVideoRequestError(
      "INVALID_PRIVATE_VIDEO",
      "Die private Videodatei oder ihre Metadaten sind ungültig.",
    );
  }
  const bytes = await readPrivateExerciseVideoBytes(request);
  const mediaId = crypto.randomUUID();
  const storageKey = privateExerciseVideoStorageKey(
    organizationId,
    exerciseId,
    mediaId,
  );

  await store.put(storageKey, bytes, {
    httpMetadata: { contentType },
    customMetadata: {
      exerciseId,
      organizationId,
      uploadedBy: actorPrincipalId,
    },
  });

  try {
    const media = await runtime.exerciseCatalog.registerPrivateMedia(
      organizationId,
      exerciseId,
      {
        id: mediaId,
        fileName,
        storageKey,
        contentType,
        sizeBytes: bytes.byteLength,
      },
    );
    if (media === undefined) {
      await store.delete(storageKey);
      return exerciseCatalogNotFound();
    }
    return Response.json({ media }, { status: 201 });
  } catch (error) {
    try {
      await store.delete(storageKey);
    } catch {
      // Preserve the metadata failure; orphan cleanup can be retried separately.
    }
    throw error;
  }
}

async function exerciseCatalogPrivateMediaContent(
  request: Request,
  runtime: GeneratedPostgresApplicationRuntime,
  organizationId: string,
  exerciseId: string,
  mediaId: string,
): Promise<Response> {
  const store = runtime.exerciseCatalogMediaStore;
  if (store === null) return exerciseCatalogPrivateMediaUnavailable();
  const media = (
    await runtime.exerciseCatalog.listPrivateMedia(organizationId, exerciseId)
  ).find((entry) => entry.id === mediaId);
  if (media === undefined) return exerciseCatalogNotFound();

  const stored = await store.get(media.storageKey, { range: request.headers });
  if (stored === null) return exerciseCatalogPrivateMediaUnavailable();

  const headers = new Headers({
    "content-type": media.contentType,
    "content-disposition":
      "inline; filename*=UTF-8''" + encodeURIComponent(media.fileName),
    "cache-control": "private, no-store",
    "accept-ranges": "bytes",
    "x-content-type-options": "nosniff",
  });
  if (typeof stored.httpEtag === "string" && stored.httpEtag.length > 0) {
    headers.set("etag", stored.httpEtag);
  }

  let status = 200;
  if (
    request.headers.has("range") &&
    stored.range !== undefined &&
    typeof stored.range.offset === "number" &&
    typeof stored.range.length === "number" &&
    typeof stored.size === "number"
  ) {
    const start = stored.range.offset;
    const end = start + stored.range.length - 1;
    headers.set(
      "content-range",
      "bytes " + String(start) + "-" + String(end) + "/" + String(stored.size),
    );
    headers.set("content-length", String(stored.range.length));
    status = 206;
  } else if (typeof stored.size === "number") {
    headers.set("content-length", String(stored.size));
  }

  const responseBody =
    stored.body instanceof Uint8Array
      ? Uint8Array.from(stored.body).buffer
      : stored.body;
  return new Response(responseBody, { status, headers });
}

async function deleteExerciseCatalogPrivateMedia(
  runtime: GeneratedPostgresApplicationRuntime,
  organizationId: string,
  exerciseId: string,
  mediaId: string,
): Promise<Response> {
  const store = runtime.exerciseCatalogMediaStore;
  if (store === null) return exerciseCatalogPrivateMediaUnavailable();
  const media = (
    await runtime.exerciseCatalog.listPrivateMedia(organizationId, exerciseId)
  ).find((entry) => entry.id === mediaId);
  if (media === undefined) return exerciseCatalogNotFound();

  await store.delete(media.storageKey);
  const deleted = await runtime.exerciseCatalog.deletePrivateMedia(
    organizationId,
    exerciseId,
    mediaId,
  );
  if (deleted === undefined) return exerciseCatalogNotFound();
  return Response.json({ deleted: true });
}

class PrivateExerciseVideoRequestError extends Error {
  readonly code: "INVALID_PRIVATE_VIDEO" | "PRIVATE_VIDEO_TOO_LARGE";

  constructor(
    code: "INVALID_PRIVATE_VIDEO" | "PRIVATE_VIDEO_TOO_LARGE",
    message: string,
  ) {
    super(message);
    this.name = "PrivateExerciseVideoRequestError";
    this.code = code;
  }
}

async function readPrivateExerciseVideoBytes(
  request: Request,
): Promise<Uint8Array> {
  const maximumBytes = ULC_EXERCISE_CATALOG_PRIVATE_VIDEO_MAX_BYTES;
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsed = Number(declaredLength);
    if (Number.isFinite(parsed) && parsed > maximumBytes) {
      throw new PrivateExerciseVideoRequestError(
        "PRIVATE_VIDEO_TOO_LARGE",
        "Das private Video darf höchstens 100 MB groß sein.",
      );
    }
  }
  if (request.body === null) {
    throw new PrivateExerciseVideoRequestError(
      "INVALID_PRIVATE_VIDEO",
      "Die Videodatei fehlt.",
    );
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      throw new PrivateExerciseVideoRequestError(
        "PRIVATE_VIDEO_TOO_LARGE",
        "Das private Video darf höchstens 100 MB groß sein.",
      );
    }
    chunks.push(next.value);
  }
  if (total === 0) {
    throw new PrivateExerciseVideoRequestError(
      "INVALID_PRIVATE_VIDEO",
      "Die Videodatei ist leer.",
    );
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function exerciseCatalogPrivateMediaUnavailable(): Response {
  return Response.json(
    {
      error: {
        code: "EXERCISE_CATALOG_PRIVATE_MEDIA_UNAVAILABLE",
        message: "Private exercise video storage is not configured.",
      },
    },
    {
      status: 503,
      headers: { "cache-control": "private, no-store" },
    },
  );
}

const EXERCISE_CREATE_FIELDS = Object.freeze([
  "name",
  "categoryKey",
  "subcategory",
  "difficultyKey",
  "goal",
  "description",
  "coachingCues",
  "commonMistakes",
  "equipment",
  "videoUrl",
  "videoUrls",
  "groupIds",
  "similarExerciseIds",
  "parameters",
]);

const EXERCISE_UPDATE_FIELDS = EXERCISE_CREATE_FIELDS;

const EXERCISE_DUPLICATE_FIELDS = Object.freeze([
  ...EXERCISE_CREATE_FIELDS,
  "excludeExerciseId",
]);

const EXERCISE_USAGE_FIELDS = Object.freeze([
  "occurredAt",
  "sourceKind",
  "sourceRef",
  "note",
]);

class InvalidExerciseCatalogRequestError extends Error {}

async function exerciseCatalogJsonBody(
  request: Request,
  allowedFields: readonly string[],
  requiredFields: readonly string[],
): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new InvalidExerciseCatalogRequestError();
  }
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new InvalidExerciseCatalogRequestError();
  }
  const body = value as Record<string, unknown>;
  if (
    Object.keys(body).some((key) => !allowedFields.includes(key)) ||
    requiredFields.some(
      (key) => !Object.prototype.hasOwnProperty.call(body, key),
    ) ||
    Object.getOwnPropertySymbols(body).length !== 0
  ) {
    throw new InvalidExerciseCatalogRequestError();
  }
  return body;
}

function decodeExerciseCatalogPathIdentifier(value: string | undefined): string {
  if (value === undefined) throw new InvalidExerciseCatalogRequestError();
  try {
    const decoded = decodeURIComponent(value);
    if (
      decoded.length === 0 ||
      decoded.length > 200 ||
      decoded.trim() !== decoded ||
      decoded.includes("/")
    ) {
      throw new InvalidExerciseCatalogRequestError();
    }
    return decoded;
  } catch (error) {
    if (error instanceof InvalidExerciseCatalogRequestError) throw error;
    throw new InvalidExerciseCatalogRequestError();
  }
}

async function authorizeExerciseCatalogRequest(
  request: Request,
  runtime: GeneratedPostgresApplicationRuntime,
  url: URL,
  action: "view" | "edit",
): Promise<Response | UlcLinzExerciseCatalogAccessScope> {
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
        action,
        targetId: "exercise_catalog",
        reasonCode: "identity-access-denied",
      });
    }
    return current;
  }

  try {
    return action === "view"
      ? await runtime.exerciseCatalogAccess.assertViewAccess(current)
      : await runtime.exerciseCatalogAccess.assertEditAccess(current);
  } catch (error) {
    if (error instanceof UlcLinzAuthorizationDeniedError) {
      return Response.json(
        {
          error: {
            code: error.code,
            message: "Exercise catalog access denied.",
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

function exerciseCatalogErrorResponse(error: unknown): Response {
  if (error instanceof UlcExerciseCatalogWriteQuiescedError) {
    return Response.json(
      {
        error: {
          code: error.code,
          message:
            "Exercise catalog writes are temporarily blocked for the guarded runtime cutover.",
        },
      },
      {
        status: 503,
        headers: { "retry-after": "60" },
      },
    );
  }
  if (
    error instanceof UlcExerciseCatalogValidationError ||
    error instanceof StandardExerciseCatalogValidationError ||
    error instanceof InvalidExerciseCatalogRequestError
  ) {
    return invalidExerciseCatalogInput();
  }
  if (
    error instanceof UlcExerciseCatalogNotFoundError ||
    error instanceof UlcExerciseCatalogGroupNotFoundError
  ) {
    return exerciseCatalogNotFound();
  }
  if (error instanceof UlcExerciseCatalogConflictError) {
    return Response.json(
      {
        error: {
          code: error.code,
          message: "An exercise with this name already exists.",
        },
      },
      { status: 409 },
    );
  }
  throw error;
}

function invalidExerciseCatalogInput(): Response {
  return Response.json(
    {
      error: {
        code: "INVALID_EXERCISE_CATALOG_INPUT",
        message: "The exercise catalog input is invalid.",
      },
    },
    { status: 400 },
  );
}

function exerciseCatalogNotFound(): Response {
  return Response.json(
    {
      error: {
        code: "EXERCISE_CATALOG_NOT_FOUND",
        message: "The exercise or training group was not found.",
      },
    },
    { status: 404 },
  );
}

async function athletesModuleResponse(
  request: Request,
  runtime: GeneratedPostgresApplicationRuntime,
  url: URL,
): Promise<Response> {
  if (request.method !== "GET") {
    return athletesMethodNotAllowed();
  }

  const access = await authorizeAthletesRequest(request, runtime, url, "view");
  if (access instanceof Response) return access;

  return Response.json({
    module: {
      moduleId: "athletes",
      capabilities: ATHLETE_CAPABILITIES,
    },
    access: {
      view: true,
      edit: access.canEdit,
      organizationId: access.organizationId,
    },
  });
}

async function athletesWorkbookResponse(
  request: Request,
  runtime: GeneratedPostgresApplicationRuntime,
  url: URL,
  mode: AthletesExchangeMode,
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowedFor("GET", "athletes workbook");
  }
  if ([...url.searchParams.keys()].length !== 0) {
    return invalidAthletesMasterdata();
  }

  const access = await authorizeAthletesRequest(request, runtime, url, "view");
  if (access instanceof Response) return access;

  const snapshot = await runtime.athleteMasterdata.readOrganizationSnapshot(
    access.organizationId,
  );
  const workbook = createAthletesWorkbook(snapshot, mode);
  const responseBytes = new Uint8Array(workbook.byteLength);
  responseBytes.set(workbook);

  return new Response(responseBytes.buffer, {
    status: 200,
    headers: {
      "content-type": ATHLETES_XLSX_CONTENT_TYPE,
      "content-disposition":
        mode === "template"
          ? 'attachment; filename="athleten-importvorlage.xlsx"'
          : 'attachment; filename="athleten-export.xlsx"',
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

async function athletesImportPreviewResponse(
  request: Request,
  runtime: GeneratedPostgresApplicationRuntime,
  url: URL,
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowedFor("POST", "athletes import preview");
  }
  if ([...url.searchParams.keys()].length !== 0) {
    return invalidAthletesMasterdata();
  }

  const access = await authorizeAthletesRequest(request, runtime, url, "edit");
  if (access instanceof Response) return access;

  const contentType = (request.headers.get("content-type") ?? "")
    .split(";", 1)[0]!
    .trim()
    .toLocaleLowerCase("en");
  if (contentType !== ATHLETES_XLSX_CONTENT_TYPE) {
    return Response.json(
      {
        error: {
          code: "INVALID_IMPORT_CONTENT_TYPE",
          message: "Only XLSX files are supported for athletes import preview.",
        },
      },
      {
        status: 415,
        headers: { "cache-control": "private, no-store" },
      },
    );
  }

  try {
    const bytes = await readRequestBytesLimited(
      request,
      ATHLETES_IMPORT_MAX_FILE_BYTES,
    );
    const snapshot = await runtime.athleteMasterdata.readOrganizationSnapshot(
      access.organizationId,
    );
    const preview = await previewAthletesImport(bytes, snapshot);
    const previewToken = await createAthletesImportPreviewToken(
      bytes,
      snapshot,
      access.organizationId,
    );
    return Response.json(
      {
        preview,
        apply: {
          available:
            preview.summary.errors === 0 &&
            preview.summary.create + preview.summary.update > 0,
          previewToken,
        },
      },
      {
        headers: {
          "cache-control": "private, no-store",
          "x-content-type-options": "nosniff",
        },
      },
    );
  } catch (error) {
    if (error instanceof XlsxRequestBodyError) {
      return Response.json(
        { error: { code: error.code, message: error.message } },
        {
          status: error.code === "IMPORT_FILE_TOO_LARGE" ? 413 : 400,
          headers: {
            "cache-control": "private, no-store",
            "x-content-type-options": "nosniff",
          },
        },
      );
    }
    if (error instanceof AthletesImportFileError) {
      return Response.json(
        { error: { code: error.code, message: error.message } },
        {
          status: error.code === "IMPORT_FILE_TOO_LARGE" ? 413 : 400,
          headers: {
            "cache-control": "private, no-store",
            "x-content-type-options": "nosniff",
          },
        },
      );
    }
    throw error;
  }
}

async function athletesImportApplyResponse(
  request: Request,
  runtime: GeneratedPostgresApplicationRuntime,
  url: URL,
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowedFor("POST", "athletes import apply");
  }
  if ([...url.searchParams.keys()].length !== 0) {
    return invalidAthletesMasterdata();
  }

  const access = await authorizeAthletesRequest(request, runtime, url, "edit");
  if (access instanceof Response) return access;

  const contentType = (request.headers.get("content-type") ?? "")
    .split(";", 1)[0]!
    .trim()
    .toLocaleLowerCase("en");
  if (contentType !== ATHLETES_XLSX_CONTENT_TYPE) {
    return Response.json(
      {
        error: {
          code: "INVALID_IMPORT_CONTENT_TYPE",
          message: "Only XLSX files are supported for athletes import apply.",
        },
      },
      {
        status: 415,
        headers: { "cache-control": "private, no-store" },
      },
    );
  }

  const expectedPreviewToken =
    request.headers.get("x-appbasis-import-preview-token") ?? "";

  try {
    const bytes = await readRequestBytesLimited(
      request,
      ATHLETES_IMPORT_MAX_FILE_BYTES,
    );
    const snapshot = await runtime.athleteMasterdata.readOrganizationSnapshot(
      access.organizationId,
    );
    const preview = await previewAthletesImport(bytes, snapshot);
    const actualPreviewToken = await createAthletesImportPreviewToken(
      bytes,
      snapshot,
      access.organizationId,
    );
    const result = await applyAthletesImportPreview({
      preview,
      expectedPreviewToken,
      actualPreviewToken,
      organizationId: access.organizationId,
      service: runtime.athleteMasterdata,
    });
    return Response.json(
      { result },
      {
        headers: {
          "cache-control": "private, no-store",
          "x-content-type-options": "nosniff",
        },
      },
    );
  } catch (error) {
    if (error instanceof XlsxRequestBodyError) {
      return Response.json(
        { error: { code: error.code, message: error.message } },
        {
          status: error.code === "IMPORT_FILE_TOO_LARGE" ? 413 : 400,
          headers: {
            "cache-control": "private, no-store",
            "x-content-type-options": "nosniff",
          },
        },
      );
    }
    if (error instanceof AthletesImportFileError) {
      return Response.json(
        { error: { code: error.code, message: error.message } },
        {
          status: error.code === "IMPORT_FILE_TOO_LARGE" ? 413 : 400,
          headers: {
            "cache-control": "private, no-store",
            "x-content-type-options": "nosniff",
          },
        },
      );
    }
    if (error instanceof AthletesImportApplyError) {
      return Response.json(
        { error: { code: error.code, message: error.message } },
        {
          status: error.code === "INVALID_IMPORT_TOKEN" ? 400 : 409,
          headers: {
            "cache-control": "private, no-store",
            "x-content-type-options": "nosniff",
          },
        },
      );
    }
    throw error;
  }
}

async function athletesMasterdataResponse(
  request: Request,
  runtime: GeneratedPostgresApplicationRuntime,
  url: URL,
): Promise<Response> {
  if (request.method !== "GET") {
    return athletesMethodNotAllowed();
  }

  const access = await authorizeAthletesRequest(request, runtime, url, "view");
  if (access instanceof Response) return access;

  const masterdata = await runtime.athleteMasterdata.readOrganizationSnapshot(
    access.organizationId,
  );
  return Response.json({ masterdata });
}

async function athletesMasterdataMutationResponse(
  request: Request,
  runtime: GeneratedPostgresApplicationRuntime,
  url: URL,
): Promise<Response> {
  if (request.method !== "POST") {
    return athletesMutationMethodNotAllowed();
  }

  const access = await authorizeAthletesRequest(request, runtime, url, "edit");
  if (access instanceof Response) return access;

  const base = "/api/modules/athletes/masterdata/";
  const route = url.pathname.slice(base.length);

  try {
    if (route === "training-groups") {
      const body = await athletesJsonBody(request, [
        "name",
        "shortName",
        "description",
        "sortOrder",
      ]);
      const trainingGroup = await runtime.athleteMasterdata.createTrainingGroup(
        access.organizationId,
        {
          name: body.name as string,
          ...(body.shortName === undefined
            ? {}
            : { shortName: body.shortName as string | null }),
          ...(body.description === undefined
            ? {}
            : { description: body.description as string | null }),
          ...(body.sortOrder === undefined
            ? {}
            : { sortOrder: body.sortOrder as number }),
        },
      );
      return Response.json({ trainingGroup }, { status: 201 });
    }

    if (route === "athletes") {
      const body = await athletesJsonBody(request, [
        "firstName",
        "lastName",
        "birthYear",
        "notes",
      ]);
      const athlete = await runtime.athleteMasterdata.createAthlete(
        access.organizationId,
        {
          firstName: body.firstName as string,
          lastName: body.lastName as string,
          ...(body.birthYear === undefined
            ? {}
            : { birthYear: body.birthYear as number | null }),
          ...(body.notes === undefined
            ? {}
            : { notes: body.notes as string | null }),
        },
      );
      return Response.json({ athlete }, { status: 201 });
    }

    if (route === "trainers") {
      const body = await athletesJsonBody(request, [
        "firstName",
        "lastName",
        "phone",
        "email",
        "notes",
      ]);
      const trainer = await runtime.athleteMasterdata.createTrainer(
        access.organizationId,
        {
          firstName: body.firstName as string,
          lastName: body.lastName as string,
          ...(body.phone === undefined
            ? {}
            : { phone: body.phone as string | null }),
          ...(body.email === undefined
            ? {}
            : { email: body.email as string | null }),
          ...(body.notes === undefined
            ? {}
            : { notes: body.notes as string | null }),
        },
      );
      return Response.json({ trainer }, { status: 201 });
    }

    if (route === "athlete-group-memberships") {
      const body = await athletesJsonBody(request, [
        "athleteId",
        "groupId",
        "startedOn",
        "endedOn",
      ]);
      const membership =
        await runtime.athleteMasterdata.createAthleteGroupMembership(
          access.organizationId,
          {
            athleteId: body.athleteId as string,
            groupId: body.groupId as string,
            startedOn: body.startedOn as string,
            ...(body.endedOn === undefined
              ? {}
              : { endedOn: body.endedOn as string | null }),
          },
        );
      return Response.json({ membership }, { status: 201 });
    }

    if (route === "trainer-group-memberships") {
      const body = await athletesJsonBody(request, [
        "trainerId",
        "groupId",
      ]);
      const membership =
        await runtime.athleteMasterdata.createTrainerGroupMembership(
          access.organizationId,
          {
            trainerId: body.trainerId as string,
            groupId: body.groupId as string,
          },
        );
      return Response.json({ membership }, { status: 201 });
    }

    const update = /^(athletes|trainers|training-groups)\/([^/]+)\/update$/.exec(route);
    if (update !== null) {
      const id = decodePathIdentifier(update[2]);

      if (update[1] === "athletes") {
        const body = await athletesJsonBody(
          request,
          ["firstName", "lastName", "birthYear", "notes"],
          ["firstName", "lastName", "birthYear", "notes"],
        );
        const athlete = await runtime.athleteMasterdata.updateAthlete(
          access.organizationId,
          id,
          {
            firstName: body.firstName as string,
            lastName: body.lastName as string,
            birthYear: body.birthYear as number | null,
            notes: body.notes as string | null,
          },
        );
        if (athlete === null) return athletesNotFound();
        return Response.json({ athlete });
      }

      if (update[1] === "trainers") {
        const body = await athletesJsonBody(
          request,
          ["firstName", "lastName", "phone", "email", "notes"],
          ["firstName", "lastName", "phone", "email", "notes"],
        );
        const trainer = await runtime.athleteMasterdata.updateTrainer(
          access.organizationId,
          id,
          {
            firstName: body.firstName as string,
            lastName: body.lastName as string,
            phone: body.phone as string | null,
            email: body.email as string | null,
            notes: body.notes as string | null,
          },
        );
        if (trainer === null) return athletesNotFound();
        return Response.json({ trainer });
      }

      const body = await athletesJsonBody(
        request,
        ["name", "shortName", "description", "sortOrder"],
        ["name", "shortName", "description", "sortOrder"],
      );
      const trainingGroup =
        await runtime.athleteMasterdata.updateTrainingGroup(
          access.organizationId,
          id,
          {
            name: body.name as string,
            shortName: body.shortName as string | null,
            description: body.description as string | null,
            sortOrder: body.sortOrder as number,
          },
        );
      if (trainingGroup === null) return athletesNotFound();
      return Response.json({ trainingGroup });
    }

    const deactivate = /^(athletes|trainers)\/([^/]+)\/deactivate$/.exec(route);
    if (deactivate !== null) {
      const id = decodePathIdentifier(deactivate[2]);
      const changed =
        deactivate[1] === "athletes"
          ? await runtime.athleteMasterdata.deactivateAthlete(
              access.organizationId,
              id,
            )
          : await runtime.athleteMasterdata.deactivateTrainer(
              access.organizationId,
              id,
            );
      if (!changed) return athletesNotFound();
      return Response.json({ deactivated: true });
    }

    return athletesNotFound();
  } catch (error) {
    if (error instanceof MasterdataValidationError) {
      return invalidAthletesMasterdata();
    }
    if (error instanceof InvalidAthletesRequestError) {
      return invalidAthletesMasterdata();
    }
    throw error;
  }
}

class InvalidAthletesRequestError extends Error {}

async function athletesJsonBody(
  request: Request,
  allowedFields: readonly string[],
  requiredFields: readonly string[] = [],
): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new InvalidAthletesRequestError();
  }
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new InvalidAthletesRequestError();
  }
  const body = value as Record<string, unknown>;
  if (
    Object.keys(body).some((key) => !allowedFields.includes(key)) ||
    requiredFields.some(
      (key) => !Object.prototype.hasOwnProperty.call(body, key),
    ) ||
    Object.getOwnPropertySymbols(body).length !== 0
  ) {
    throw new InvalidAthletesRequestError();
  }
  return body;
}

function decodePathIdentifier(value: string | undefined): string {
  if (value === undefined) throw new InvalidAthletesRequestError();
  try {
    const decoded = decodeURIComponent(value);
    if (
      decoded.length === 0 ||
      decoded.length > 200 ||
      decoded.trim() !== decoded ||
      decoded.includes("/")
    ) {
      throw new InvalidAthletesRequestError();
    }
    return decoded;
  } catch (error) {
    if (error instanceof InvalidAthletesRequestError) throw error;
    throw new InvalidAthletesRequestError();
  }
}

function invalidAthletesMasterdata(): Response {
  return Response.json(
    {
      error: {
        code: "INVALID_MASTERDATA",
        message: "The Stammdaten input is invalid.",
      },
    },
    { status: 400 },
  );
}

function athletesNotFound(): Response {
  return Response.json(
    {
      error: {
        code: "MASTERDATA_NOT_FOUND",
        message: "The Stammdaten resource was not found.",
      },
    },
    { status: 404 },
  );
}

function athletesMutationMethodNotAllowed(): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: "Only POST is supported for this Stammdaten endpoint.",
      },
    }),
    {
      status: 405,
      headers: {
        "content-type": "application/json; charset=utf-8",
        allow: "POST",
      },
    },
  );
}

async function authorizeAthletesRequest(
  request: Request,
  runtime: GeneratedPostgresApplicationRuntime,
  url: URL,
  action: "view" | "edit",
): Promise<
  Response |
  Readonly<{ organizationId: string; canEdit: boolean }>
> {
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
        action,
        targetId: "athletes",
        reasonCode: "identity-access-denied",
      });
    }
    return current;
  }

  try {
    return action === "view"
      ? await runtime.athletesAccess.assertViewAccess(current)
      : await runtime.athletesAccess.assertEditAccess(current);
  } catch (error) {
    if (error instanceof UlcLinzAuthorizationDeniedError) {
      return Response.json(
        {
          error: {
            code: error.code,
            message: "Stammdaten access denied.",
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

function athletesMethodNotAllowed(): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: "Only GET is supported for this Stammdaten endpoint.",
      },
    }),
    {
      status: 405,
      headers: {
        "content-type": "application/json; charset=utf-8",
        allow: "GET",
      },
    },
  );
}

function methodNotAllowedFor(
  allow: string,
  label: string,
): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: `Only ${allow} is supported for this ${label} endpoint.`,
      },
    }),
    {
      status: 405,
      headers: {
        "content-type": "application/json; charset=utf-8",
        allow,
      },
    },
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

  const exerciseCatalogMediaStore =
    resolveUlcExerciseCatalogObjectStore(env.EXERCISE_MEDIA);

  return Object.freeze({
    connectionString,
    securityLogConnectionString,
    baseURL,
    secret,
    ...(exerciseCatalogMediaStore === null
      ? {}
      : { exerciseCatalogMediaStore }),
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
