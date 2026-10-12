import {
  TRAINING_PLAN_CAPABILITIES,
  TrainingPlanConflictError,
  TrainingPlanGeneratedIdConflictError,
  TrainingPlanTargetOccupiedError,
  TrainingPlanValidationError,
  normalizeTrainingPlanDate,
  normalizeTrainingPlanIdentifier,
  type CreateTrainingPlanDraftInput,
  type TrainingPlanItemInput,
  type TrainingPlanSnapshot,
  type UpdateTrainingPlanDraftInput,
} from "@appbasis/training-plans";
import { createIdentityHttpHandlers } from "@appbasis/identity/http";

import { UlcLinzAuthorizationDeniedError } from "./authorization";
import { UlcTrainingPlanReferenceError } from "./training-plans-service";
import { recordUlcLinzSecurityEvent } from "./security-events";
import type { GeneratedPostgresApplicationRuntime } from "./postgres";

class InvalidTrainingPlanRequestError extends Error {}

const CREATE_FIELDS = Object.freeze([
  "subjectId",
  "planDate",
  "note",
  "items",
]);
const UPDATE_FIELDS = Object.freeze([
  "expectedRevision",
  "note",
  "items",
]);

export async function trainingPlansHttpResponse(
  request: Request,
  runtime: GeneratedPostgresApplicationRuntime,
  url: URL,
): Promise<Response> {
  if (url.pathname === "/api/modules/training-plans") {
    return trainingPlansModuleResponse(request, runtime, url);
  }
  if (url.pathname === "/api/modules/training-plans/week") {
    return trainingPlansWeekResponse(request, runtime, url);
  }

  const base = "/api/modules/training-plans/";
  if (!url.pathname.startsWith(base)) {
    return trainingPlanNotFound();
  }
  const route = url.pathname.slice(base.length);
  const update = /^([^/]+)\/update$/.exec(route);
  if (update === null) {
    return trainingPlanNotFound();
  }
  if (request.method !== "POST") {
    return methodNotAllowedFor("POST", "training plan");
  }
  if ([...url.searchParams.keys()].length !== 0) {
    return invalidTrainingPlanInput();
  }

  const access = await authorizeTrainingPlansRequest(
    request,
    runtime,
    url,
    "edit",
  );
  if (access instanceof Response) return access;

  try {
    const planId = decodeIdentifier(update[1]);
    const body = await trainingPlanUpdateBody(request);
    const current = await runtime.trainingPlans.findCurrent(
      access.organizationId,
      planId,
    );
    if (current === undefined) return trainingPlanNotFound();
    if (current.currentRevision !== body.expectedRevision) {
      throw new TrainingPlanConflictError(
        body.expectedRevision,
        current.currentRevision,
      );
    }
    assertE7B4BlockProvenanceUpdate(current, body.input);
    const plan = await runtime.trainingPlans.update(
      access.organizationId,
      planId,
      body.expectedRevision,
      body.input,
    );
    if (plan === undefined) return trainingPlanNotFound();
    return privateJson({ plan: trainingPlanClientSnapshot(plan) });
  } catch (error) {
    return trainingPlanErrorResponse(error);
  }
}

async function trainingPlansModuleResponse(
  request: Request,
  runtime: GeneratedPostgresApplicationRuntime,
  url: URL,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") {
    return methodNotAllowedFor("GET, POST", "training plans");
  }
  if ([...url.searchParams.keys()].length !== 0) {
    return invalidTrainingPlanInput();
  }

  const access = await authorizeTrainingPlansRequest(
    request,
    runtime,
    url,
    request.method === "GET" ? "view" : "edit",
  );
  if (access instanceof Response) return access;

  try {
    if (request.method === "GET") {
      const subjects = await runtime.trainingPlans.listSubjects(
        access.organizationId,
      );
      return privateJson({
        module: {
          moduleId: "training_planning",
          capabilities: TRAINING_PLAN_CAPABILITIES,
          features: {
            weekView: true,
            autosave: true,
            optimisticConcurrency: true,
          },
        },
        access: { view: true, edit: access.canEdit },
        subjects,
      });
    }

    const input = await trainingPlanCreateBody(request);
    assertE7B4BlockProvenanceCreate(input);
    const plan = await runtime.trainingPlans.create(
      access.organizationId,
      input,
    );
    return privateJson(
      { plan: trainingPlanClientSnapshot(plan) },
      { status: 201 },
    );
  } catch (error) {
    return trainingPlanErrorResponse(error);
  }
}

async function trainingPlansWeekResponse(
  request: Request,
  runtime: GeneratedPostgresApplicationRuntime,
  url: URL,
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowedFor("GET", "training plan week");
  }

  const access = await authorizeTrainingPlansRequest(
    request,
    runtime,
    url,
    "view",
  );
  if (access instanceof Response) return access;

  try {
    const { subjectId, weekStart } = trainingPlanWeekQuery(url);
    const subjects = await runtime.trainingPlans.listSubjects(
      access.organizationId,
    );
    if (!subjects.some((subject) => subject.id === subjectId)) {
      throw new UlcTrainingPlanReferenceError("subject", subjectId);
    }
    const weekEnd = addCalendarDays(weekStart, 6);
    const plans = await runtime.trainingPlans.listForSubjectDateRange(
      access.organizationId,
      subjectId,
      weekStart,
      weekEnd,
    );
    return privateJson({
      subjectId,
      weekStart,
      weekEnd,
      plans: plans.map(trainingPlanClientSnapshot),
    });
  } catch (error) {
    return trainingPlanErrorResponse(error);
  }
}

async function authorizeTrainingPlansRequest(
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
  if (current instanceof Response) {
    if (current.status >= 400) {
      recordUlcLinzSecurityEvent(runtime.securityEvents, {
        eventType: "authorization.denied",
        actorPrincipalId: null,
        organizationId: null,
        action,
        targetId: "training_planning",
        reasonCode: "identity-access-denied",
      });
    }
    return current;
  }

  try {
    return action === "view"
      ? await runtime.trainingPlansAccess.assertViewAccess(current)
      : await runtime.trainingPlansAccess.assertEditAccess(current);
  } catch (error) {
    if (error instanceof UlcLinzAuthorizationDeniedError) {
      return Response.json(
        {
          error: {
            code: error.code,
            message: "Training plan access denied.",
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

function trainingPlanWeekQuery(
  url: URL,
): Readonly<{ subjectId: string; weekStart: string }> {
  const allowed = new Set(["subjectId", "weekStart"]);
  if (
    [...url.searchParams.keys()].some((key) => !allowed.has(key)) ||
    url.searchParams.getAll("subjectId").length !== 1 ||
    url.searchParams.getAll("weekStart").length !== 1
  ) {
    throw new InvalidTrainingPlanRequestError();
  }

  const subjectId = normalizeTrainingPlanIdentifier(
    url.searchParams.get("subjectId"),
    "Training plan subject",
  );
  const weekStart = normalizeTrainingPlanDate(
    url.searchParams.get("weekStart"),
  );
  const parsed = new Date(weekStart + "T00:00:00.000Z");
  if (parsed.getUTCDay() !== 1) {
    throw new InvalidTrainingPlanRequestError();
  }
  return Object.freeze({ subjectId, weekStart });
}

async function trainingPlanCreateBody(
  request: Request,
): Promise<CreateTrainingPlanDraftInput> {
  const body = await trainingPlanJsonObject(
    request,
    CREATE_FIELDS,
    ["subjectId", "planDate"],
  );
  assertTrainingPlanItems(body.items, false);
  return {
    subjectId: body.subjectId as string,
    planDate: body.planDate as string,
    ...(body.note === undefined ? {} : { note: body.note as string | null }),
    ...(body.items === undefined
      ? {}
      : { items: body.items as readonly TrainingPlanItemInput[] }),
  };
}

async function trainingPlanUpdateBody(
  request: Request,
): Promise<{
  readonly expectedRevision: number;
  readonly input: UpdateTrainingPlanDraftInput;
}> {
  const body = await trainingPlanJsonObject(
    request,
    UPDATE_FIELDS,
    ["expectedRevision", "note", "items"],
  );
  assertTrainingPlanItems(body.items, true);
  return Object.freeze({
    expectedRevision: requiredRevision(body.expectedRevision),
    input: {
      ...(body.note === undefined ? {} : { note: body.note as string | null }),
      ...(body.items === undefined
        ? {}
        : {
            items:
              body.items as UpdateTrainingPlanDraftInput["items"],
          }),
    },
  });
}

async function trainingPlanJsonObject(
  request: Request,
  allowedFields: readonly string[],
  requiredFields: readonly string[],
): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new InvalidTrainingPlanRequestError();
  }
  if (!isPlainObject(value)) {
    throw new InvalidTrainingPlanRequestError();
  }
  const body = value as Record<string, unknown>;
  if (
    Object.keys(body).some((key) => !allowedFields.includes(key)) ||
    requiredFields.some(
      (key) => !Object.prototype.hasOwnProperty.call(body, key),
    ) ||
    Object.getOwnPropertySymbols(body).length !== 0
  ) {
    throw new InvalidTrainingPlanRequestError();
  }
  return body;
}

function assertTrainingPlanItems(
  value: unknown,
  allowItemId: boolean,
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    throw new InvalidTrainingPlanRequestError();
  }
  for (const item of value) {
    if (!isPlainObject(item)) {
      throw new InvalidTrainingPlanRequestError();
    }
    const kind = item.kind;
    if (kind === "exercise") {
      assertExerciseItem(item, allowItemId, true);
      continue;
    }
    if (kind === "block") {
      assertBlockItem(item, allowItemId);
      continue;
    }
    throw new InvalidTrainingPlanRequestError();
  }
}

function assertBlockItem(
  item: Record<string, unknown>,
  allowItemId: boolean,
): void {
  const allowed = new Set([
    "kind",
    ...(allowItemId ? ["itemId"] : []),
    "sourceBlockId",
    "sourceBlockRevision",
    "name",
    "durationMinutes",
    "note",
    "exercises",
  ]);
  assertExactObject(item, allowed, ["kind", "name"]);
  if (item.exercises === undefined) return;
  if (!Array.isArray(item.exercises)) {
    throw new InvalidTrainingPlanRequestError();
  }
  for (const exercise of item.exercises) {
    if (!isPlainObject(exercise)) {
      throw new InvalidTrainingPlanRequestError();
    }
    assertExerciseItem(exercise, allowItemId, false);
  }
}

function assertExerciseItem(
  item: Record<string, unknown>,
  allowItemId: boolean,
  requireKind: boolean,
): void {
  const allowed = new Set([
    ...(requireKind ? ["kind"] : []),
    ...(allowItemId ? ["itemId"] : []),
    "sourceExerciseId",
    "name",
    "sets",
    "repetitions",
    "amount",
    "unit",
    "comment",
  ]);
  assertExactObject(
    item,
    allowed,
    requireKind ? ["kind", "name"] : ["name"],
  );
}

function assertExactObject(
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
    throw new InvalidTrainingPlanRequestError();
  }
}

function assertE7B4BlockProvenanceCreate(
  input: CreateTrainingPlanDraftInput,
): void {
  for (const item of input.items ?? []) {
    if (
      item.kind === "block" &&
      (item.sourceBlockId != null || item.sourceBlockRevision != null)
    ) {
      throw new InvalidTrainingPlanRequestError();
    }
  }
}

function assertE7B4BlockProvenanceUpdate(
  current: TrainingPlanSnapshot,
  input: UpdateTrainingPlanDraftInput,
): void {
  if (input.items === undefined) return;

  const currentBlocks = new Map(
    current.revision.items
      .filter((item) => item.kind === "block")
      .map((item) => [
        item.itemId,
        {
          sourceBlockId: item.sourceBlockId,
          sourceBlockRevision: item.sourceBlockRevision,
        },
      ] as const),
  );

  for (const item of input.items) {
    if (item.kind !== "block") continue;
    const itemId =
      typeof item.itemId === "string" ? item.itemId : null;
    const existing =
      itemId === null ? undefined : currentBlocks.get(itemId);
    const nextSourceBlockId = item.sourceBlockId ?? null;
    const nextSourceBlockRevision = item.sourceBlockRevision ?? null;

    if (existing === undefined) {
      if (
        nextSourceBlockId !== null ||
        nextSourceBlockRevision !== null
      ) {
        throw new InvalidTrainingPlanRequestError();
      }
      continue;
    }

    if (
      existing.sourceBlockId !== nextSourceBlockId ||
      existing.sourceBlockRevision !== nextSourceBlockRevision
    ) {
      throw new InvalidTrainingPlanRequestError();
    }
  }
}

function requiredRevision(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1
  ) {
    throw new InvalidTrainingPlanRequestError();
  }
  return value;
}

function decodeIdentifier(value: string | undefined): string {
  if (value === undefined) throw new InvalidTrainingPlanRequestError();
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.includes("/")) {
      throw new InvalidTrainingPlanRequestError();
    }
    return normalizeTrainingPlanIdentifier(
      decoded,
      "Training plan id",
    );
  } catch (error) {
    if (
      error instanceof TrainingPlanValidationError ||
      error instanceof URIError
    ) {
      throw new InvalidTrainingPlanRequestError();
    }
    throw error;
  }
}

function addCalendarDays(date: string, days: number): string {
  const value = new Date(date + "T00:00:00.000Z");
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function trainingPlanClientSnapshot(
  plan: TrainingPlanSnapshot,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    id: plan.id,
    subjectId: plan.subjectId,
    planDate: plan.planDate,
    currentRevision: plan.currentRevision,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    revision: Object.freeze({
      revision: plan.revision.revision,
      note: plan.revision.note,
      items: plan.revision.items,
      createdAt: plan.revision.createdAt,
    }),
  });
}

function trainingPlanErrorResponse(error: unknown): Response {
  if (error instanceof TrainingPlanConflictError) {
    return Response.json(
      {
        error: {
          code: "TRAINING_PLAN_CONFLICT",
          message: "The training plan changed since it was loaded.",
          expectedRevision: error.expectedRevision,
          currentRevision: error.currentRevision,
        },
      },
      { status: 409 },
    );
  }
  if (error instanceof TrainingPlanTargetOccupiedError) {
    return Response.json(
      {
        error: {
          code: "TRAINING_PLAN_TARGET_OCCUPIED",
          message: "A training plan already exists for this subject and date.",
          existingPlanId: error.existingPlanId,
          currentRevision: error.currentRevision,
        },
      },
      { status: 409 },
    );
  }
  if (error instanceof TrainingPlanGeneratedIdConflictError) {
    return Response.json(
      {
        error: {
          code: "TRAINING_PLAN_ID_CONFLICT",
          message: "The generated training plan id is already in use.",
        },
      },
      { status: 409 },
    );
  }
  if (error instanceof UlcTrainingPlanReferenceError) {
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
          referenceType: error.referenceType,
          referenceId: error.referenceId,
        },
      },
      { status: 400 },
    );
  }
  if (
    error instanceof TrainingPlanValidationError ||
    error instanceof InvalidTrainingPlanRequestError
  ) {
    return invalidTrainingPlanInput();
  }
  throw error;
}

function privateJson(
  body: unknown,
  init: ResponseInit = {},
): Response {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "private, no-store");
  return Response.json(body, { ...init, headers });
}

function invalidTrainingPlanInput(): Response {
  return Response.json(
    {
      error: {
        code: "INVALID_TRAINING_PLAN",
        message: "The training plan input is invalid.",
      },
    },
    { status: 400 },
  );
}

function trainingPlanNotFound(): Response {
  return Response.json(
    {
      error: {
        code: "TRAINING_PLAN_NOT_FOUND",
        message: "The training plan was not found.",
      },
    },
    { status: 404 },
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
