import { pathToFileURL } from "node:url";

const DEFAULT_USERNAME = "preview.admin";
const REQUEST_TIMEOUT_MS = 15_000;

export class UlcTrainingPlansPreviewAcceptanceError extends Error {
  constructor(message) {
    super(message);
    this.name = "UlcTrainingPlansPreviewAcceptanceError";
  }
}

export function readUlcTrainingPlansPreviewAcceptanceEnvironment(
  env = process.env,
) {
  return Object.freeze({
    baseURL: requiredHttpsOrigin(
      env.APPBASIS_GENERATED_PREVIEW_URL,
    ),
    username: requiredCredential(
      env.APPBASIS_PREVIEW_USER_USERNAME ?? DEFAULT_USERNAME,
      "APPBASIS_PREVIEW_USER_USERNAME",
    ),
    password: requiredCredential(
      env.APPBASIS_PREVIEW_USER_PASSWORD,
      "APPBASIS_PREVIEW_USER_PASSWORD",
    ),
  });
}

export async function runUlcTrainingPlansPreviewAcceptance(
  options,
  {
    fetchImpl = globalThis.fetch,
    randomUUID = () => crypto.randomUUID(),
    now = () => new Date(),
  } = {},
) {
  if (
    typeof fetchImpl !== "function" ||
    typeof randomUUID !== "function" ||
    typeof now !== "function"
  ) {
    throw new UlcTrainingPlansPreviewAcceptanceError(
      "E7B9 acceptance dependencies are invalid.",
    );
  }

  const baseURL = requiredHttpsOrigin(options.baseURL);
  const cookie = await authenticate({
    baseURL,
    username: options.username,
    password: options.password,
    fetchImpl,
  });
  const marker = randomUUID().replaceAll("-", "").slice(0, 12);
  const planDate = mondayOfUtcWeek(now());

  const training = await requestJson(
    baseURL,
    "/api/modules/kindertraining",
    fetchImpl,
    { cookie },
  );
  const groups = training.payload?.trainingGroups;
  if (!Array.isArray(groups) || groups.length === 0) {
    throw new UlcTrainingPlansPreviewAcceptanceError(
      "E7B9 acceptance requires at least one preview Kindertraining group.",
    );
  }
  const group = groups.find(
    (value) =>
      value !== null &&
      typeof value === "object" &&
      typeof value.id === "string" &&
      value.id.length > 0,
  );
  if (group === undefined) {
    throw new UlcTrainingPlansPreviewAcceptanceError(
      "E7B9 acceptance training-group response is invalid.",
    );
  }

  const athleteResponse = await requestJson(
    baseURL,
    "/api/modules/athletes/masterdata/athletes",
    fetchImpl,
    {
      method: "POST",
      cookie,
      body: {
        firstName: "E7B9",
        lastName: "Preview-" + marker,
        birthYear: 2010,
        notes: "E7B9 isolated preview acceptance",
      },
      expectedStatus: 201,
    },
  );
  const athleteId = requiredId(
    athleteResponse.payload?.athlete?.id,
    "E7B9 preview athlete",
  );

  await requestJson(
    baseURL,
    "/api/modules/athletes/masterdata/athlete-group-memberships",
    fetchImpl,
    {
      method: "POST",
      cookie,
      body: {
        athleteId,
        groupId: group.id,
        startedOn: planDate,
      },
      expectedStatus: 201,
    },
  );

  const exerciseName = "E7B9 Preview Exercise " + marker;
  const exerciseResponse = await requestJson(
    baseURL,
    "/api/modules/exercise-catalog",
    fetchImpl,
    {
      method: "POST",
      cookie,
      body: {
        name: exerciseName,
        categoryKey: "speed",
        groupIds: [group.id],
      },
      expectedStatus: 201,
    },
  );
  const exerciseId = requiredId(
    exerciseResponse.payload?.item?.id,
    "E7B9 preview exercise",
  );

  const blockName = "E7B9 Preview Block " + marker;
  const blockResponse = await requestJson(
    baseURL,
    "/api/modules/training-blocks",
    fetchImpl,
    {
      method: "POST",
      cookie,
      body: {
        name: blockName,
        audienceId: group.id,
        durationMinutes: 25,
        note: "E7B9 preview source template",
        exercises: [
          {
            exerciseId,
            note: "E7B9 preview exercise occurrence",
            parameterOverrides: [],
          },
        ],
      },
      expectedStatus: 201,
    },
  );
  const block = blockResponse.payload?.block;
  const blockId = requiredId(
    block?.id,
    "E7B9 preview training block",
  );
  if (block?.currentRevision !== 1) {
    throw new UlcTrainingPlansPreviewAcceptanceError(
      "E7B9 source block did not start at revision 1.",
    );
  }

  const templateResponse = await requestJson(
    baseURL,
    "/api/modules/training-plans/block-templates/" +
      encodeURIComponent(blockId) +
      "?revision=1",
    fetchImpl,
    { cookie },
  );
  const template = templateResponse.payload?.template;
  if (
    template?.id !== blockId ||
    template?.currentRevision !== 1 ||
    template?.item?.kind !== "block"
  ) {
    throw new UlcTrainingPlansPreviewAcceptanceError(
      "E7B9 training-plan block adoption contract is invalid.",
    );
  }

  const planResponse = await requestJson(
    baseURL,
    "/api/modules/training-plans",
    fetchImpl,
    {
      method: "POST",
      cookie,
      body: {
        subjectId: athleteId,
        planDate,
        note: "E7B9 preview plan",
        items: [template.item],
      },
      expectedStatus: 201,
    },
  );
  let plan = requiredPlan(planResponse.payload?.plan);
  const planId = plan.id;
  const planBlock = plan.revision.items[0];
  if (
    planBlock?.kind !== "block" ||
    planBlock.sourceBlockId !== blockId ||
    planBlock.sourceBlockRevision !== 1
  ) {
    throw new UlcTrainingPlansPreviewAcceptanceError(
      "E7B9 plan did not persist exact block-template provenance.",
    );
  }

  await upsertAttendance({
    baseURL,
    cookie,
    fetchImpl,
    groupId: group.id,
    athleteId,
    sessionDate: planDate,
  });

  const createdBlockExercise = block?.revision?.exercises?.[0];
  if (
    createdBlockExercise === null ||
    typeof createdBlockExercise !== "object" ||
    typeof createdBlockExercise.itemId !== "string"
  ) {
    throw new UlcTrainingPlansPreviewAcceptanceError(
      "E7B9 source block exercise identity is unavailable.",
    );
  }

  await requestJson(
    baseURL,
    "/api/modules/training-blocks/" +
      encodeURIComponent(blockId) +
      "/update",
    fetchImpl,
    {
      method: "POST",
      cookie,
      body: {
        expectedRevision: 1,
        name: blockName + " changed",
        audienceId: group.id,
        durationMinutes: 30,
        note: "Template changed after adoption",
        exercises: [
          {
            itemId: createdBlockExercise.itemId,
            exerciseId,
            note: "Changed source occurrence",
            parameterOverrides: [],
          },
        ],
      },
    },
  );

  const week = await readWeek({
    baseURL,
    cookie,
    fetchImpl,
    athleteId,
    weekStart: planDate,
  });
  const weekPlan = week.plans.find((value) => value?.id === planId);
  const weekBlock = weekPlan?.revision?.items?.[0];
  if (
    weekBlock?.kind !== "block" ||
    weekBlock.name !== blockName ||
    weekBlock.sourceBlockId !== blockId ||
    weekBlock.sourceBlockRevision !== 1
  ) {
    throw new UlcTrainingPlansPreviewAcceptanceError(
      "E7B9 adopted plan block did not remain an independent snapshot.",
    );
  }
  if (
    !week.attendance.some(
      (entry) =>
        entry?.sessionDate === planDate &&
        entry?.status === "present",
    )
  ) {
    throw new UlcTrainingPlansPreviewAcceptanceError(
      "E7B9 week view did not expose the preview attendance entry.",
    );
  }

  const autosaveResponse = await requestJson(
    baseURL,
    "/api/modules/training-plans/" +
      encodeURIComponent(planId) +
      "/update",
    fetchImpl,
    {
      method: "POST",
      cookie,
      body: {
        expectedRevision: 1,
        note: "E7B9 autosave verified",
        items: plan.revision.items,
      },
    },
  );
  plan = requiredPlan(autosaveResponse.payload?.plan);
  if (plan.currentRevision !== 2) {
    throw new UlcTrainingPlansPreviewAcceptanceError(
      "E7B9 autosave did not advance the plan revision.",
    );
  }

  const stale = await requestJson(
    baseURL,
    "/api/modules/training-plans/" +
      encodeURIComponent(planId) +
      "/update",
    fetchImpl,
    {
      method: "POST",
      cookie,
      body: {
        expectedRevision: 1,
        note: "E7B9 stale write",
        items: plan.revision.items,
      },
      allowError: true,
    },
  );
  if (
    stale.status !== 409 ||
    stale.payload?.error?.code !== "TRAINING_PLAN_CONFLICT"
  ) {
    throw new UlcTrainingPlansPreviewAcceptanceError(
      "E7B9 optimistic-concurrency smoke did not fail closed.",
    );
  }

  const persistedPlanBlock = plan.revision.items[0];
  if (
    persistedPlanBlock?.kind !== "block" ||
    typeof persistedPlanBlock.itemId !== "string"
  ) {
    throw new UlcTrainingPlansPreviewAcceptanceError(
      "E7B9 persisted plan block identity is unavailable.",
    );
  }

  const savedBack = await requestJson(
    baseURL,
    "/api/modules/training-plans/block-templates",
    fetchImpl,
    {
      method: "POST",
      cookie,
      body: {
        planId,
        blockItemId: persistedPlanBlock.itemId,
        expectedRevision: plan.currentRevision,
        audienceId: group.id,
        name: "E7B9 Save-back " + marker,
      },
      expectedStatus: 201,
    },
  );
  const savedTemplateId = requiredId(
    savedBack.payload?.template?.id,
    "E7B9 saved-back template",
  );
  if (savedBack.payload?.template?.currentRevision !== 1) {
    throw new UlcTrainingPlansPreviewAcceptanceError(
      "E7B9 save-back did not create a new revision-1 template.",
    );
  }

  const overview = await requestJson(
    baseURL,
    "/api/modules/training-blocks",
    fetchImpl,
    { cookie },
  );
  const blocks = overview.payload?.blocks;
  if (!Array.isArray(blocks)) {
    throw new UlcTrainingPlansPreviewAcceptanceError(
      "E7B9 training-block overview is invalid.",
    );
  }
  const sourceOverview = blocks.find((value) => value?.id === blockId);
  const savedOverview = blocks.find(
    (value) => value?.id === savedTemplateId,
  );
  if (
    !Number.isSafeInteger(sourceOverview?.usageCount) ||
    sourceOverview.usageCount < 1 ||
    typeof sourceOverview.lastUsedAt !== "string" ||
    savedOverview?.currentRevision !== 1
  ) {
    throw new UlcTrainingPlansPreviewAcceptanceError(
      "E7B9 usage metadata or save-back overview is incomplete.",
    );
  }

  return Object.freeze({
    status: "ok",
    planId,
    sourceBlockId: blockId,
    savedTemplateId,
    athleteId,
    groupId: group.id,
    planDate,
    checks: Object.freeze([
      "login",
      "week-view",
      "attendance",
      "autosave",
      "block-template-adoption",
      "independent-snapshot",
      "save-back",
      "usage-metadata",
      "optimistic-concurrency",
    ]),
  });
}

async function authenticate({
  baseURL,
  username,
  password,
  fetchImpl,
}) {
  const response = await requestJson(
    baseURL,
    "/api/auth/sign-in",
    fetchImpl,
    {
      method: "POST",
      body: { username, password },
    },
  );
  if (
    response.payload?.access !== "full" ||
    response.payload?.identity?.username !== username.toLowerCase()
  ) {
    throw new UlcTrainingPlansPreviewAcceptanceError(
      "E7B9 preview user is not in full-access state.",
    );
  }
  if (response.cookie === null) {
    throw new UlcTrainingPlansPreviewAcceptanceError(
      "E7B9 login returned no session cookie.",
    );
  }
  return response.cookie;
}

async function upsertAttendance({
  baseURL,
  cookie,
  fetchImpl,
  groupId,
  athleteId,
  sessionDate,
}) {
  const query =
    "?groupId=" + encodeURIComponent(groupId) +
    "&sessionDate=" + encodeURIComponent(sessionDate);
  const current = await requestJson(
    baseURL,
    "/api/modules/kindertraining/session" + query,
    fetchImpl,
    { cookie },
  );
  const snapshot = current.payload?.snapshot;
  if (
    snapshot === null ||
    typeof snapshot !== "object" ||
    !Array.isArray(snapshot.participants)
  ) {
    throw new UlcTrainingPlansPreviewAcceptanceError(
      "E7B9 attendance preview snapshot is invalid.",
    );
  }

  const attendance = snapshot.participants.map((participant) => ({
    athleteId: participant.athleteId,
    status:
      participant.athleteId === athleteId
        ? "present"
        : participant.status,
  }));
  if (!attendance.some((entry) => entry.athleteId === athleteId)) {
    attendance.push({ athleteId, status: "present" });
  }

  await requestJson(
    baseURL,
    "/api/modules/kindertraining/session",
    fetchImpl,
    {
      method: "POST",
      cookie,
      body: {
        groupId,
        sessionDate,
        state: snapshot.session?.state ?? "scheduled",
        note: snapshot.session?.note ?? null,
        expectedRevision: snapshot.session?.revision ?? null,
        attendance,
      },
    },
  );
}

async function readWeek({
  baseURL,
  cookie,
  fetchImpl,
  athleteId,
  weekStart,
}) {
  const response = await requestJson(
    baseURL,
    "/api/modules/training-plans/week?subjectId=" +
      encodeURIComponent(athleteId) +
      "&weekStart=" + encodeURIComponent(weekStart),
    fetchImpl,
    { cookie },
  );
  if (
    !Array.isArray(response.payload?.plans) ||
    !Array.isArray(response.payload?.attendance)
  ) {
    throw new UlcTrainingPlansPreviewAcceptanceError(
      "E7B9 week-view response is invalid.",
    );
  }
  return response.payload;
}

function requiredPlan(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    typeof value.id !== "string" ||
    !Number.isSafeInteger(value.currentRevision) ||
    value.revision === null ||
    typeof value.revision !== "object" ||
    !Array.isArray(value.revision.items)
  ) {
    throw new UlcTrainingPlansPreviewAcceptanceError(
      "E7B9 training-plan response is invalid.",
    );
  }
  return value;
}

async function requestJson(
  baseURL,
  path,
  fetchImpl,
  options = {},
) {
  const headers = new Headers({ accept: "application/json" });
  if (options.cookie !== undefined) {
    headers.set("cookie", options.cookie);
  }
  let body;
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(options.body);
  }

  let response;
  try {
    response = await fetchImpl(new URL(path, baseURL), {
      method: options.method ?? "GET",
      headers,
      ...(body === undefined ? {} : { body }),
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new UlcTrainingPlansPreviewAcceptanceError(
      "E7B9 acceptance request failed before receiving a response.",
    );
  }
  if (!(response instanceof Response)) {
    throw new UlcTrainingPlansPreviewAcceptanceError(
      "E7B9 acceptance transport returned an invalid response.",
    );
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new UlcTrainingPlansPreviewAcceptanceError(
      "E7B9 acceptance response was not JSON.",
    );
  }
  const result = Object.freeze({
    status: response.status,
    payload,
    cookie: cookiePair(response.headers.get("set-cookie")),
  });
  const expectedStatus = options.expectedStatus ?? 200;
  if (
    options.allowError !== true &&
    response.status !== expectedStatus
  ) {
    throw new UlcTrainingPlansPreviewAcceptanceError(
      "E7B9 acceptance request " + path +
        " returned HTTP " + String(response.status) + ".",
    );
  }
  return result;
}

function mondayOfUtcWeek(value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new UlcTrainingPlansPreviewAcceptanceError(
      "E7B9 acceptance clock is invalid.",
    );
  }
  const day = value.getUTCDay();
  const delta = day === 0 ? -6 : 1 - day;
  const monday = new Date(Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate() + delta,
  ));
  return monday.toISOString().slice(0, 10);
}

function requiredId(value, label) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    throw new UlcTrainingPlansPreviewAcceptanceError(
      label + " id is invalid.",
    );
  }
  return value;
}

function cookiePair(value) {
  const pair = value?.split(";", 1)[0]?.trim() ?? "";
  return pair.length === 0 ? null : pair;
}

function requiredCredential(value, name) {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length < 1
  ) {
    throw new UlcTrainingPlansPreviewAcceptanceError(
      name + " is required.",
    );
  }
  return value;
}

function requiredHttpsOrigin(value) {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length === 0
  ) {
    throw new UlcTrainingPlansPreviewAcceptanceError(
      "APPBASIS_GENERATED_PREVIEW_URL must be a canonical HTTPS origin.",
    );
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new UlcTrainingPlansPreviewAcceptanceError(
      "APPBASIS_GENERATED_PREVIEW_URL must be a canonical HTTPS origin.",
    );
  }
  if (
    url.protocol !== "https:" ||
    url.hostname.length === 0 ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    (url.pathname !== "" && url.pathname !== "/") ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw new UlcTrainingPlansPreviewAcceptanceError(
      "APPBASIS_GENERATED_PREVIEW_URL must be a canonical HTTPS origin.",
    );
  }
  return url.origin;
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  import.meta.url === pathToFileURL(invokedPath).href
) {
  try {
    const result = await runUlcTrainingPlansPreviewAcceptance(
      readUlcTrainingPlansPreviewAcceptanceEnvironment(),
    );
    console.log(
      "E7B9 preview acceptance PASS: " +
        result.checks.join(", ") + ".",
    );
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "E7B9 preview acceptance failed.",
    );
    process.exitCode = 1;
  }
}
