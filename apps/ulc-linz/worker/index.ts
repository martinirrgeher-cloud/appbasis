import {
  ATHLETE_CAPABILITIES,
  MasterdataValidationError,
} from "@appbasis/athletes";
import {
  COUNTDOWN_CAPABILITIES,
  createCountdownTimeline,
  normalizeCountdownConfiguration,
} from "@appbasis/countdown";
import { createIdentityHttpHandlers } from "@appbasis/identity/http";

import { createGeneratedApp } from "./app";
import { UlcLinzAuthorizationDeniedError } from "./authorization";
import { UlcLinzCountdownAccessDeniedError } from "./countdown-access";
import type { UlcLinzKindertrainingAccessScope } from "./kindertraining-access";
import {
  UlcKindertrainingNotFoundError,
} from "./kindertraining-service";
import { UlcTrainingValidationError } from "./training-session-domain";
import { UlcTrainingSessionConflictError } from "./training-session-postgres";
import {
  UlcLinzTrainerIdentityConflictError,
  UlcLinzTrainerIdentityNotFoundError,
} from "./trainer-identity-postgres";
import {
  UlcLinzTrainerUserConflictError,
  UlcLinzTrainerUserValidationError,
} from "./trainer-user-admin";
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
        } else if (url.pathname === "/api/modules/kindertraining") {
          response = await kindertrainingModuleResponse(request, runtime, url);
        } else if (url.pathname === "/api/modules/kindertraining/session") {
          response = await kindertrainingSessionResponse(request, runtime, url);
        } else if (url.pathname === "/api/admin/trainer-identities") {
          response = await trainerIdentityAdminResponse(request, runtime, url);
        } else if (url.pathname === "/api/admin/trainer-users") {
          response = await trainerUserAdminResponse(request, runtime, url);
        } else if (url.pathname === "/api/modules/athletes") {
          response = await athletesModuleResponse(request, runtime, url);
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

async function trainerUserAdminResponse(
  request: Request,
  runtime: GeneratedPostgresApplicationRuntime,
  url: URL,
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowedFor("POST", "Trainer user administration");
  }
  if ([...url.searchParams.keys()].length !== 0) {
    return invalidTrainerUser();
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
        targetId: "user-management-admin",
        reasonCode: "identity-access-denied",
      });
    }
    return current;
  }

  let access: Readonly<{ organizationId: string; actorPrincipalId: string }>;
  try {
    access = await runtime.userAdminAccess.assertAdminAccess(current);
  } catch (error) {
    if (error instanceof UlcLinzAuthorizationDeniedError) {
      return Response.json(
        {
          error: {
            code: error.code,
            message: "User administration access denied.",
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
    const trainerUser = await runtime.trainerUserAdmin.createTrainerUser({
      organizationId: access.organizationId,
      actorPrincipalId: access.actorPrincipalId,
      username: body.username as string,
      displayName: body.displayName as string,
      ...(body.contactEmail === undefined
        ? {}
        : { contactEmail: body.contactEmail as string | null }),
      temporaryPassword: body.temporaryPassword as string,
      profile: body.profile as "kindertrainer" | "leistungstrainer",
    });
    return Response.json(
      { trainerUser },
      { status: trainerUser.created ? 201 : 200 },
    );
  } catch (error) {
    if (
      error instanceof InvalidTrainerUserRequestError ||
      error instanceof UlcLinzTrainerUserValidationError
    ) {
      return invalidTrainerUser();
    }
    if (error instanceof UlcLinzTrainerUserConflictError) {
      return Response.json(
        {
          error: {
            code: "TRAINER_USER_CONFLICT",
            message: "The trainer username conflicts with existing state.",
          },
        },
        { status: 409 },
      );
    }
    throw error;
  }
}

function invalidTrainerUser(): Response {
  return Response.json(
    {
      error: {
        code: "INVALID_TRAINER_USER",
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
  const allowed = new Set([
    "username",
    "displayName",
    "contactEmail",
    "temporaryPassword",
    "profile",
  ]);
  if (
    Object.keys(body).some((key) => !allowed.has(key)) ||
    !Object.prototype.hasOwnProperty.call(body, "username") ||
    !Object.prototype.hasOwnProperty.call(body, "displayName") ||
    !Object.prototype.hasOwnProperty.call(body, "temporaryPassword") ||
    !Object.prototype.hasOwnProperty.call(body, "profile") ||
    Object.getOwnPropertySymbols(body).length !== 0 ||
    typeof body.username !== "string" ||
    typeof body.displayName !== "string" ||
    typeof body.temporaryPassword !== "string" ||
    (body.profile !== "kindertrainer" && body.profile !== "leistungstrainer") ||
    !(
      body.contactEmail === undefined ||
      body.contactEmail === null ||
      typeof body.contactEmail === "string"
    )
  ) {
    throw new InvalidTrainerUserRequestError();
  }
  return body;
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
      organizationId: access.organizationId,
    },
  });
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
): Promise<Response | Readonly<{ organizationId: string }>> {
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
