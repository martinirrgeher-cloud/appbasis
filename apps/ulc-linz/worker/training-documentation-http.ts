import {
  TRAINING_DOCUMENTATION_CAPABILITIES,
  TrainingDocumentationCompletedError,
  TrainingDocumentationConflictError,
  TrainingDocumentationGeneratedIdConflictError,
  TrainingDocumentationTargetOccupiedError,
  TrainingDocumentationValidationError,
  normalizeTrainingDocumentationDate,
  normalizeTrainingDocumentationIdentifier,
  normalizeTrainingDocumentationRevision,
  type TrainingDocumentationItemInput,
  type TrainingDocumentationSnapshot,
  type UpdateTrainingDocumentationInput,
} from "@appbasis/training-documentation";
import type { TrainingPlanSnapshot } from "@appbasis/training-plans";
import { createIdentityHttpHandlers } from "@appbasis/identity/http";

import { UlcLinzAuthorizationDeniedError } from "./authorization";
import {
  createUlcTrainingDocumentationService,
  UlcTrainingDocumentationPlanNotFoundError,
  UlcTrainingDocumentationSubjectNotFoundError,
} from "./training-documentation-service";
import { recordUlcLinzSecurityEvent } from "./security-events";
import type { GeneratedPostgresApplicationRuntime } from "./postgres";

class InvalidTrainingDocumentationRequestError extends Error {}

export async function trainingDocumentationHttpResponse(
  request: Request,
  runtime: GeneratedPostgresApplicationRuntime,
  url: URL,
): Promise<Response> {
  if (url.pathname === "/api/modules/training-documentation") {
    return moduleResponse(request, runtime, url);
  }
  if (url.pathname === "/api/modules/training-documentation/day") {
    return dayResponse(request, runtime, url);
  }
  if (url.pathname === "/api/modules/training-documentation/start") {
    return startResponse(request, runtime, url);
  }

  const base = "/api/modules/training-documentation/";
  if (!url.pathname.startsWith(base)) return notFound();
  const route = url.pathname.slice(base.length);
  const match = /^([^/]+)\/(update|refresh-attendance|complete|reopen)$/.exec(
    route,
  );
  if (match === null) return notFound();
  if (request.method !== "POST") {
    return methodNotAllowed("POST");
  }
  if ([...url.searchParams.keys()].length !== 0) return invalidInput();

  const access = await authorize(request, runtime, url, "edit");
  if (access instanceof Response) return access;

  try {
    const documentationId = decodeIdentifier(match[1]!);
    const service = createUlcTrainingDocumentationService({
      documentation: runtime.trainingDocumentation,
      plans: runtime.trainingPlans,
    });
    const action = match[2]!;
    if (action === "update") {
      const body = await updateBody(request);
      const documentation = await service.update(
        access.organizationId,
        documentationId,
        body.expectedRevision,
        body.input,
      );
      return documentation === undefined
        ? notFound()
        : privateJson({ documentation: clientDocumentation(documentation) });
    }

    const body = await exactJsonObject(request, ["expectedRevision"], [
      "expectedRevision",
    ]);
    const expectedRevision = normalizeTrainingDocumentationRevision(
      body.expectedRevision,
      "Expected training documentation revision",
    );
    const documentation =
      action === "refresh-attendance"
        ? await service.refreshAttendance(
            access.organizationId,
            documentationId,
            expectedRevision,
          )
        : action === "complete"
          ? await service.complete(
              access.organizationId,
              documentationId,
              expectedRevision,
            )
          : await service.reopen(
              access.organizationId,
              documentationId,
              expectedRevision,
            );
    return documentation === undefined
      ? notFound()
      : privateJson({ documentation: clientDocumentation(documentation) });
  } catch (error) {
    return errorResponse(error);
  }
}

async function moduleResponse(
  request: Request,
  runtime: GeneratedPostgresApplicationRuntime,
  url: URL,
): Promise<Response> {
  if (request.method !== "GET") return methodNotAllowed("GET");
  if ([...url.searchParams.keys()].length !== 0) return invalidInput();

  const access = await authorize(request, runtime, url, "view");
  if (access instanceof Response) return access;

  const service = createUlcTrainingDocumentationService({
    documentation: runtime.trainingDocumentation,
    plans: runtime.trainingPlans,
  });
  const subjects = await service.listSubjects(access.organizationId);
  return privateJson({
    module: {
      moduleId: "training_documentation",
      capabilities: TRAINING_DOCUMENTATION_CAPABILITIES,
      features: {
        planSnapshot: true,
        attendanceImport: true,
        manualSave: true,
        optimisticConcurrency: true,
        completionLifecycle: true,
        reopen: true,
      },
    },
    access: { view: true, edit: access.canEdit },
    subjects,
  });
}

async function dayResponse(
  request: Request,
  runtime: GeneratedPostgresApplicationRuntime,
  url: URL,
): Promise<Response> {
  if (request.method !== "GET") return methodNotAllowed("GET");
  const query = dayQuery(url);
  const access = await authorize(request, runtime, url, "view");
  if (access instanceof Response) return access;

  try {
    const service = createUlcTrainingDocumentationService({
      documentation: runtime.trainingDocumentation,
      plans: runtime.trainingPlans,
    });
    const day = await service.readDay(
      access.organizationId,
      query.subjectId,
      query.sessionDate,
    );
    return privateJson({
      subject: day.subject,
      plan: day.plan === null ? null : clientPlan(day.plan),
      documentation:
        day.documentation === null
          ? null
          : clientDocumentation(day.documentation),
      attendanceStatus: day.attendanceStatus,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

async function startResponse(
  request: Request,
  runtime: GeneratedPostgresApplicationRuntime,
  url: URL,
): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed("POST");
  if ([...url.searchParams.keys()].length !== 0) return invalidInput();
  const access = await authorize(request, runtime, url, "edit");
  if (access instanceof Response) return access;

  try {
    const body = await exactJsonObject(
      request,
      ["subjectId", "sessionDate"],
      ["subjectId", "sessionDate"],
    );
    const subjectId = normalizeTrainingDocumentationIdentifier(
      body.subjectId,
      "Training documentation subject",
    );
    const sessionDate = normalizeTrainingDocumentationDate(body.sessionDate);
    const service = createUlcTrainingDocumentationService({
      documentation: runtime.trainingDocumentation,
      plans: runtime.trainingPlans,
    });
    const documentation = await service.start(
      access.organizationId,
      subjectId,
      sessionDate,
    );
    return privateJson(
      { documentation: clientDocumentation(documentation) },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

async function updateBody(
  request: Request,
): Promise<{
  readonly expectedRevision: number;
  readonly input: UpdateTrainingDocumentationInput;
}> {
  const body = await exactJsonObject(
    request,
    ["expectedRevision", "note", "items"],
    ["expectedRevision", "note", "items"],
  );
  assertItems(body.items);
  return Object.freeze({
    expectedRevision: normalizeTrainingDocumentationRevision(
      body.expectedRevision,
      "Expected training documentation revision",
    ),
    input: {
      note: body.note as string | null,
      items: body.items as readonly TrainingDocumentationItemInput[],
    },
  });
}

function dayQuery(
  url: URL,
): Readonly<{ subjectId: string; sessionDate: string }> {
  const allowed = new Set(["subjectId", "sessionDate"]);
  if (
    [...url.searchParams.keys()].some((key) => !allowed.has(key)) ||
    url.searchParams.getAll("subjectId").length !== 1 ||
    url.searchParams.getAll("sessionDate").length !== 1
  ) {
    throw new InvalidTrainingDocumentationRequestError();
  }
  return Object.freeze({
    subjectId: normalizeTrainingDocumentationIdentifier(
      url.searchParams.get("subjectId"),
      "Training documentation subject",
    ),
    sessionDate: normalizeTrainingDocumentationDate(
      url.searchParams.get("sessionDate"),
    ),
  });
}

function assertItems(value: unknown): void {
  if (!Array.isArray(value)) throw new InvalidTrainingDocumentationRequestError();
  for (const item of value) {
    if (!isPlainObject(item)) throw new InvalidTrainingDocumentationRequestError();
    if (item.kind === "exercise") {
      assertExactKeys(
        item,
        new Set([
          "kind",
          "sourceItemId",
          "sourceExerciseId",
          "name",
          "plannedSets",
          "plannedRepetitions",
          "plannedAmount",
          "plannedUnit",
          "plannedComment",
          "performed",
          "actualSets",
          "actualRepetitions",
          "actualAmount",
          "actualUnit",
          "actualComment",
          "sortOrder",
        ]),
        ["kind", "name"],
      );
      continue;
    }
    if (item.kind === "block") {
      assertExactKeys(
        item,
        new Set([
          "kind",
          "sourceItemId",
          "sourceBlockId",
          "sourceBlockRevision",
          "name",
          "plannedDurationMinutes",
          "plannedNote",
          "performed",
          "actualDurationMinutes",
          "actualNote",
          "exercises",
          "sortOrder",
        ]),
        ["kind", "name", "exercises"],
      );
      if (!Array.isArray(item.exercises)) {
        throw new InvalidTrainingDocumentationRequestError();
      }
      for (const exercise of item.exercises) {
        if (!isPlainObject(exercise)) {
          throw new InvalidTrainingDocumentationRequestError();
        }
        assertExactKeys(
          exercise,
          new Set([
            "sourceItemId",
            "sourceExerciseId",
            "name",
            "plannedSets",
            "plannedRepetitions",
            "plannedAmount",
            "plannedUnit",
            "plannedComment",
            "performed",
            "actualSets",
            "actualRepetitions",
            "actualAmount",
            "actualUnit",
            "actualComment",
            "sortOrder",
          ]),
          ["name"],
        );
      }
      continue;
    }
    throw new InvalidTrainingDocumentationRequestError();
  }
}

async function exactJsonObject(
  request: Request,
  allowedFields: readonly string[],
  requiredFields: readonly string[],
): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new InvalidTrainingDocumentationRequestError();
  }
  if (!isPlainObject(value)) {
    throw new InvalidTrainingDocumentationRequestError();
  }
  assertExactKeys(
    value,
    new Set(allowedFields),
    requiredFields,
  );
  return value;
}

function assertExactKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  required: readonly string[],
): void {
  if (
    Object.keys(value).some((key) => !allowed.has(key)) ||
    required.some(
      (key) => !Object.prototype.hasOwnProperty.call(value, key),
    ) ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) {
    throw new InvalidTrainingDocumentationRequestError();
  }
}

async function authorize(
  request: Request,
  runtime: GeneratedPostgresApplicationRuntime,
  url: URL,
  action: "view" | "edit",
): Promise<
  | Response
  | Readonly<{
      organizationId: string;
      actorPrincipalId: string;
      canEdit: boolean;
    }>
> {
  const identityHttp = createIdentityHttpHandlers({
    identity: runtime.identity,
    secureCookies: url.protocol === "https:",
  });
  const current = await identityHttp.resolveCurrentIdentity(request);
  if (current instanceof Response) return current;

  try {
    return action === "view"
      ? await runtime.trainingPlansAccess.assertViewAccess(current)
      : await runtime.trainingPlansAccess.assertEditAccess(current);
  } catch (error) {
    if (error instanceof UlcLinzAuthorizationDeniedError) {
      recordUlcLinzSecurityEvent(runtime.securityEvents, {
        eventType: "authorization.denied",
        actorPrincipalId: current.identity.identityId,
        organizationId: null,
        action,
        targetId: "training_documentation",
        reasonCode: "scope-denied",
      });
      return Response.json(
        {
          error: {
            code: error.code,
            message: "Training documentation access denied.",
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

function clientDocumentation(
  documentation: TrainingDocumentationSnapshot,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    id: documentation.id,
    subjectId: documentation.subjectId,
    sessionDate: documentation.sessionDate,
    sourcePlanId: documentation.sourcePlanId,
    sourcePlanRevision: documentation.sourcePlanRevision,
    currentRevision: documentation.currentRevision,
    status: documentation.status,
    completedAt: documentation.completedAt,
    createdAt: documentation.createdAt,
    updatedAt: documentation.updatedAt,
    revision: Object.freeze({
      revision: documentation.revision.revision,
      note: documentation.revision.note,
      items: documentation.revision.items,
      attendance: documentation.revision.attendance,
      completedAt: documentation.revision.completedAt,
      createdAt: documentation.revision.createdAt,
    }),
  });
}

function clientPlan(plan: TrainingPlanSnapshot): Readonly<Record<string, unknown>> {
  return Object.freeze({
    id: plan.id,
    subjectId: plan.subjectId,
    planDate: plan.planDate,
    currentRevision: plan.currentRevision,
    revision: Object.freeze({
      revision: plan.revision.revision,
      note: plan.revision.note,
      items: plan.revision.items,
    }),
  });
}

function errorResponse(error: unknown): Response {
  if (error instanceof TrainingDocumentationConflictError) {
    return Response.json(
      {
        error: {
          code: "TRAINING_DOCUMENTATION_CONFLICT",
          message: "The training documentation changed since it was loaded.",
          expectedRevision: error.expectedRevision,
          currentRevision: error.currentRevision,
        },
      },
      { status: 409 },
    );
  }
  if (error instanceof TrainingDocumentationCompletedError) {
    return Response.json(
      {
        error: {
          code: "TRAINING_DOCUMENTATION_COMPLETED",
          message: "Reopen the documentation before editing it.",
        },
      },
      { status: 409 },
    );
  }
  if (
    error instanceof TrainingDocumentationTargetOccupiedError ||
    error instanceof TrainingDocumentationGeneratedIdConflictError
  ) {
    return Response.json(
      {
        error: {
          code: "TRAINING_DOCUMENTATION_TARGET_OCCUPIED",
          message: "A documentation already exists for this athlete and date.",
        },
      },
      { status: 409 },
    );
  }
  if (
    error instanceof UlcTrainingDocumentationPlanNotFoundError ||
    error instanceof UlcTrainingDocumentationSubjectNotFoundError
  ) {
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
        },
      },
      { status: 404 },
    );
  }
  if (
    error instanceof TrainingDocumentationValidationError ||
    error instanceof InvalidTrainingDocumentationRequestError
  ) {
    return invalidInput();
  }
  throw error;
}

function decodeIdentifier(value: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new InvalidTrainingDocumentationRequestError();
  }
  if (decoded.includes("/")) {
    throw new InvalidTrainingDocumentationRequestError();
  }
  return normalizeTrainingDocumentationIdentifier(
    decoded,
    "Training documentation id",
  );
}

function privateJson(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "private, no-store");
  return Response.json(body, { ...init, headers });
}

function invalidInput(): Response {
  return Response.json(
    {
      error: {
        code: "INVALID_TRAINING_DOCUMENTATION",
        message: "The training documentation input is invalid.",
      },
    },
    { status: 400 },
  );
}

function notFound(): Response {
  return Response.json(
    {
      error: {
        code: "TRAINING_DOCUMENTATION_NOT_FOUND",
        message: "The training documentation was not found.",
      },
    },
    { status: 404 },
  );
}

function methodNotAllowed(allow: string): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: `Only ${allow} is supported for this training documentation endpoint.`,
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

function isPasswordChangeRequiredError(
  error: unknown,
): error is Error & { readonly code: "PASSWORD_CHANGE_REQUIRED" } {
  return (
    error instanceof Error &&
    error.name === "IdentityError" &&
    "code" in error &&
    (error as { readonly code?: unknown }).code ===
      "PASSWORD_CHANGE_REQUIRED"
  );
}

function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}
