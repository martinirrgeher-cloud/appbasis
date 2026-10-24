import { createHmac } from "node:crypto";
import { pathToFileURL } from "node:url";

const DEFAULT_ADMIN_USERNAME = "preview.admin";
export const ATTENDANCE_PREVIEW_ATHLETE_USERNAME = "preview.athlete";
export const ATTENDANCE_PREVIEW_GROUP_NAME = "Preview Selbstanmeldung";
export const ATTENDANCE_PREVIEW_ATHLETE_FIRST_NAME = "Preview";
export const ATTENDANCE_PREVIEW_ATHLETE_LAST_NAME = "Athlet";
const REQUEST_TIMEOUT_MS = 15_000;

export class UlcAttendancePreviewAcceptanceError extends Error {
  constructor(message) {
    super(message);
    this.name = "UlcAttendancePreviewAcceptanceError";
  }
}

export function readUlcAttendancePreviewAcceptanceEnvironment(env = process.env) {
  return Object.freeze({
    baseURL: requiredHttpsOrigin(env.APPBASIS_GENERATED_PREVIEW_URL),
    adminUsername: requiredCredential(
      env.APPBASIS_PREVIEW_USER_USERNAME ?? DEFAULT_ADMIN_USERNAME,
      "APPBASIS_PREVIEW_USER_USERNAME",
    ),
    password: requiredCredential(
      env.APPBASIS_PREVIEW_USER_PASSWORD,
      "APPBASIS_PREVIEW_USER_PASSWORD",
    ),
  });
}

export async function runUlcAttendancePreviewAcceptance(
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
    throw new UlcAttendancePreviewAcceptanceError(
      "Attendance acceptance dependencies are invalid.",
    );
  }

  const baseURL = requiredHttpsOrigin(options.baseURL);
  const password = requiredCredential(
    options.password,
    "APPBASIS_PREVIEW_USER_PASSWORD",
  );
  const sessionDate = viennaIsoDate(now());
  const adminCookie = await authenticateFull({
    baseURL,
    username: options.adminUsername,
    password,
    fetchImpl,
  });

  let masterdata = await readMasterdata(baseURL, adminCookie, fetchImpl);
  let group = findExactFixture(
    masterdata.trainingGroups,
    (candidate) => candidate?.name === ATTENDANCE_PREVIEW_GROUP_NAME,
    "training group",
  );
  if (group === null) {
    const created = await requestJson(
      baseURL,
      "/api/modules/athletes/masterdata/training-groups",
      fetchImpl,
      {
        method: "POST",
        cookie: adminCookie,
        body: {
          name: ATTENDANCE_PREVIEW_GROUP_NAME,
          shortName: "PREVIEW",
          description: "Stabiler Preview-Testfall für Selbstanmeldung",
          attendanceMode: "self_registration",
          sortOrder: 9998,
        },
        expectedStatus: 201,
      },
    );
    group = created.payload?.trainingGroup ?? null;
    if (typeof group?.id !== "string") {
      throw new UlcAttendancePreviewAcceptanceError(
        "Attendance preview group creation returned an invalid group.",
      );
    }
    masterdata = await readMasterdata(baseURL, adminCookie, fetchImpl);
  }
  assertFixtureGroup(group);

  let athlete = findExactFixture(
    masterdata.athletes,
    (candidate) =>
      candidate?.firstName === ATTENDANCE_PREVIEW_ATHLETE_FIRST_NAME &&
      candidate?.lastName === ATTENDANCE_PREVIEW_ATHLETE_LAST_NAME,
    "athlete",
  );
  if (athlete === null) {
    const created = await requestJson(
      baseURL,
      "/api/modules/athletes/masterdata/athletes",
      fetchImpl,
      {
        method: "POST",
        cookie: adminCookie,
        body: {
          firstName: ATTENDANCE_PREVIEW_ATHLETE_FIRST_NAME,
          lastName: ATTENDANCE_PREVIEW_ATHLETE_LAST_NAME,
          birthYear: 2010,
          notes: "Stabiler Preview-Testathlet für Selbstanmeldung",
        },
        expectedStatus: 201,
      },
    );
    athlete = created.payload?.athlete ?? null;
    if (typeof athlete?.id !== "string") {
      throw new UlcAttendancePreviewAcceptanceError(
        "Attendance preview athlete creation returned an invalid athlete.",
      );
    }
    masterdata = await readMasterdata(baseURL, adminCookie, fetchImpl);
  }
  assertFixtureAthlete(athlete);

  const memberships = masterdata.athleteGroupMemberships.filter(
    (membership) =>
      membership?.athleteId === athlete.id &&
      membership?.groupId === group.id &&
      (membership?.endedOn === null || membership?.endedOn === undefined),
  );
  if (memberships.length > 1) {
    throw new UlcAttendancePreviewAcceptanceError(
      "Attendance preview fixture has duplicate athlete group memberships.",
    );
  }
  if (memberships.length === 0) {
    await requestJson(
      baseURL,
      "/api/modules/athletes/masterdata/athlete-group-memberships",
      fetchImpl,
      {
        method: "POST",
        cookie: adminCookie,
        body: {
          athleteId: athlete.id,
          groupId: group.id,
          startedOn: sessionDate,
        },
        expectedStatus: 201,
      },
    );
  } else if (memberships[0].startedOn > sessionDate) {
    throw new UlcAttendancePreviewAcceptanceError(
      "Attendance preview fixture membership starts after the acceptance date.",
    );
  }

  const athleteCookie = await ensureAthleteLogin({
    baseURL,
    adminCookie,
    athleteId: athlete.id,
    password,
    fetchImpl,
    randomUUID,
  });

  const optionsBefore = await requestJson(
    baseURL,
    "/api/modules/kindertraining/registration?sessionDate=" +
      encodeURIComponent(sessionDate),
    fetchImpl,
    { cookie: athleteCookie },
  );
  const registrationOption = requiredRegistrationOption(
    optionsBefore.payload?.options,
    group.id,
    sessionDate,
  );

  const attending = await requestJson(
    baseURL,
    "/api/modules/kindertraining/registration",
    fetchImpl,
    {
      method: "POST",
      cookie: athleteCookie,
      body: {
        groupId: group.id,
        sessionDate,
        intention: "attending",
        expectedRevision: registrationOption.revision,
      },
    },
  );
  const attendingOption = requiredSavedRegistration(
    attending.payload?.option,
    group.id,
    sessionDate,
    "attending",
  );

  let trainerSnapshot = await readAttendanceSnapshot({
    baseURL,
    cookie: adminCookie,
    groupId: group.id,
    sessionDate,
    fetchImpl,
  });
  assertParticipantState(
    trainerSnapshot,
    athlete.id,
    "attending",
    trainerSnapshot.participants.find((item) => item.athleteId === athlete.id)?.status ?? "open",
  );

  trainerSnapshot = await saveActualAttendance({
    baseURL,
    cookie: adminCookie,
    snapshot: trainerSnapshot,
    athleteId: athlete.id,
    status: "present",
    fetchImpl,
  });
  assertParticipantState(
    trainerSnapshot,
    athlete.id,
    "attending",
    "present",
  );

  const notAttending = await requestJson(
    baseURL,
    "/api/modules/kindertraining/registration",
    fetchImpl,
    {
      method: "POST",
      cookie: athleteCookie,
      body: {
        groupId: group.id,
        sessionDate,
        intention: "not_attending",
        expectedRevision: attendingOption.revision,
      },
    },
  );
  const notAttendingOption = requiredSavedRegistration(
    notAttending.payload?.option,
    group.id,
    sessionDate,
    "not_attending",
  );

  trainerSnapshot = await readAttendanceSnapshot({
    baseURL,
    cookie: adminCookie,
    groupId: group.id,
    sessionDate,
    fetchImpl,
  });
  assertParticipantState(
    trainerSnapshot,
    athlete.id,
    "not_attending",
    "present",
  );

  const attendingAgain = await requestJson(
    baseURL,
    "/api/modules/kindertraining/registration",
    fetchImpl,
    {
      method: "POST",
      cookie: athleteCookie,
      body: {
        groupId: group.id,
        sessionDate,
        intention: "attending",
        expectedRevision: notAttendingOption.revision,
      },
    },
  );
  requiredSavedRegistration(
    attendingAgain.payload?.option,
    group.id,
    sessionDate,
    "attending",
  );

  trainerSnapshot = await readAttendanceSnapshot({
    baseURL,
    cookie: adminCookie,
    groupId: group.id,
    sessionDate,
    fetchImpl,
  });
  trainerSnapshot = await saveActualAttendance({
    baseURL,
    cookie: adminCookie,
    snapshot: trainerSnapshot,
    athleteId: athlete.id,
    status: "open",
    fetchImpl,
  });
  assertParticipantState(
    trainerSnapshot,
    athlete.id,
    "attending",
    "open",
  );

  return Object.freeze({
    status: "ok",
    athleteUsername: ATTENDANCE_PREVIEW_ATHLETE_USERNAME,
    groupName: ATTENDANCE_PREVIEW_GROUP_NAME,
    sessionDate,
    checks: Object.freeze([
      "admin-login",
      "stable-self-registration-fixture",
      "athlete-login",
      "forced-password-change",
      "athlete-self-registration",
      "trainer-sees-intention",
      "actual-attendance-independent",
      "registration-change-independent",
      "manual-fixture-reset",
    ]),
  });
}

async function ensureAthleteLogin({
  baseURL,
  adminCookie,
  athleteId,
  password,
  fetchImpl,
  randomUUID,
}) {
  const existing = await signIn({
    baseURL,
    username: ATTENDANCE_PREVIEW_ATHLETE_USERNAME,
    password,
    fetchImpl,
    allowError: true,
  });
  if (existing.status === 200 && existing.payload?.access === "full") {
    if (existing.cookie === null) {
      throw new UlcAttendancePreviewAcceptanceError(
        "Existing preview athlete login returned no session cookie.",
      );
    }
    return existing.cookie;
  }
  if (existing.status !== 401 && existing.status !== 403) {
    throw new UlcAttendancePreviewAcceptanceError(
      "Existing preview athlete login is in an unexpected state.",
    );
  }

  const temporaryPassword = previewAthleteTemporaryPassword(password);
  await requestJson(
    baseURL,
    "/api/admin/athlete-users",
    fetchImpl,
    {
      method: "POST",
      cookie: adminCookie,
      body: {
        username: ATTENDANCE_PREVIEW_ATHLETE_USERNAME,
        displayName:
          ATTENDANCE_PREVIEW_ATHLETE_FIRST_NAME +
          " " +
          ATTENDANCE_PREVIEW_ATHLETE_LAST_NAME,
        temporaryPassword,
        athleteId,
      },
      expectedStatus: 201,
    },
  );

  const temporary = await signIn({
    baseURL,
    username: ATTENDANCE_PREVIEW_ATHLETE_USERNAME,
    password: temporaryPassword,
    fetchImpl,
  });
  if (
    temporary.payload?.access !== "password-change-required" ||
    temporary.payload?.identity?.mustChangePassword !== true ||
    temporary.cookie === null
  ) {
    throw new UlcAttendancePreviewAcceptanceError(
      "New preview athlete did not enter the required-password-change state.",
    );
  }

  await requestJson(
    baseURL,
    "/api/auth/change-required-password",
    fetchImpl,
    {
      method: "POST",
      cookie: temporary.cookie,
      body: {
        currentPassword: temporaryPassword,
        newPassword: password,
        idempotencyKey: randomUUID(),
      },
    },
  );

  return authenticateFull({
    baseURL,
    username: ATTENDANCE_PREVIEW_ATHLETE_USERNAME,
    password,
    fetchImpl,
  });
}

function previewAthleteTemporaryPassword(password) {
  const secret = requiredCredential(
    password,
    "APPBASIS_PREVIEW_USER_PASSWORD",
  );
  return (
    "Tmp!" +
    createHmac("sha256", secret)
      .update("ulc-linz-preview-athlete-bootstrap-v1")
      .digest("hex")
      .slice(0, 32)
  );
}

async function authenticateFull({
  baseURL,
  username,
  password,
  fetchImpl,
}) {
  const response = await signIn({
    baseURL,
    username,
    password,
    fetchImpl,
  });
  if (
    response.payload?.access !== "full" ||
    response.payload?.identity?.username !== username.toLowerCase() ||
    response.cookie === null
  ) {
    throw new UlcAttendancePreviewAcceptanceError(
      "Preview identity is not in full-access state.",
    );
  }
  return response.cookie;
}

function signIn({
  baseURL,
  username,
  password,
  fetchImpl,
  allowError = false,
}) {
  return requestJson(
    baseURL,
    "/api/auth/sign-in",
    fetchImpl,
    {
      method: "POST",
      body: { username, password },
      ...(allowError ? { allowError: true } : {}),
    },
  );
}

async function readMasterdata(baseURL, cookie, fetchImpl) {
  const response = await requestJson(
    baseURL,
    "/api/modules/athletes/masterdata",
    fetchImpl,
    { cookie },
  );
  const masterdata = response.payload?.masterdata;
  if (
    masterdata === null ||
    typeof masterdata !== "object" ||
    !Array.isArray(masterdata.trainingGroups) ||
    !Array.isArray(masterdata.athletes) ||
    !Array.isArray(masterdata.athleteGroupMemberships)
  ) {
    throw new UlcAttendancePreviewAcceptanceError(
      "Attendance preview masterdata response is invalid.",
    );
  }
  return masterdata;
}

function findExactFixture(items, predicate, label) {
  const matches = items.filter(predicate);
  if (matches.length > 1) {
    throw new UlcAttendancePreviewAcceptanceError(
      "Attendance preview has duplicate " + label + " fixtures.",
    );
  }
  return matches[0] ?? null;
}

function assertFixtureGroup(group) {
  if (
    group === null ||
    typeof group?.id !== "string" ||
    group.id.length === 0 ||
    group.name !== ATTENDANCE_PREVIEW_GROUP_NAME ||
    group.attendanceMode !== "self_registration" ||
    group.isActive === false
  ) {
    throw new UlcAttendancePreviewAcceptanceError(
      "Attendance preview fixture group is not canonical.",
    );
  }
}

function assertFixtureAthlete(athlete) {
  if (
    athlete === null ||
    typeof athlete?.id !== "string" ||
    athlete.id.length === 0 ||
    athlete.firstName !== ATTENDANCE_PREVIEW_ATHLETE_FIRST_NAME ||
    athlete.lastName !== ATTENDANCE_PREVIEW_ATHLETE_LAST_NAME ||
    athlete.isActive === false
  ) {
    throw new UlcAttendancePreviewAcceptanceError(
      "Attendance preview fixture athlete is not canonical.",
    );
  }
}

function requiredRegistrationOption(options, groupId, sessionDate) {
  if (!Array.isArray(options)) {
    throw new UlcAttendancePreviewAcceptanceError(
      "Athlete self-registration options are invalid.",
    );
  }
  const matches = options.filter(
    (option) =>
      option?.group?.id === groupId &&
      option?.sessionDate === sessionDate,
  );
  if (matches.length !== 1) {
    throw new UlcAttendancePreviewAcceptanceError(
      "Athlete self-registration fixture option is unavailable.",
    );
  }
  const option = matches[0];
  if (
    !["unknown", "attending", "not_attending", "maybe"].includes(
      option?.intention,
    ) ||
    !(
      option?.revision === null ||
      (Number.isSafeInteger(option?.revision) && option.revision >= 1)
    )
  ) {
    throw new UlcAttendancePreviewAcceptanceError(
      "Athlete self-registration fixture option is invalid.",
    );
  }
  return option;
}

function requiredSavedRegistration(option, groupId, sessionDate, intention) {
  if (
    option?.group?.id !== groupId ||
    option?.sessionDate !== sessionDate ||
    option?.intention !== intention ||
    !Number.isSafeInteger(option?.revision) ||
    option.revision < 1
  ) {
    throw new UlcAttendancePreviewAcceptanceError(
      "Saved athlete self-registration is invalid.",
    );
  }
  return option;
}

async function readAttendanceSnapshot({
  baseURL,
  cookie,
  groupId,
  sessionDate,
  fetchImpl,
}) {
  const response = await requestJson(
    baseURL,
    "/api/modules/kindertraining/session?groupId=" +
      encodeURIComponent(groupId) +
      "&sessionDate=" +
      encodeURIComponent(sessionDate),
    fetchImpl,
    { cookie },
  );
  const snapshot = response.payload?.snapshot;
  if (
    snapshot === null ||
    typeof snapshot !== "object" ||
    snapshot?.group?.id !== groupId ||
    snapshot?.group?.attendanceMode !== "self_registration" ||
    snapshot?.sessionDate !== sessionDate ||
    !Array.isArray(snapshot?.participants)
  ) {
    throw new UlcAttendancePreviewAcceptanceError(
      "Trainer attendance snapshot is invalid.",
    );
  }
  return snapshot;
}

async function saveActualAttendance({
  baseURL,
  cookie,
  snapshot,
  athleteId,
  status,
  fetchImpl,
}) {
  if (!["open", "present"].includes(status)) {
    throw new UlcAttendancePreviewAcceptanceError(
      "Attendance acceptance requested an invalid actual status.",
    );
  }
  const response = await requestJson(
    baseURL,
    "/api/modules/kindertraining/session",
    fetchImpl,
    {
      method: "POST",
      cookie,
      body: {
        groupId: snapshot.group.id,
        sessionDate: snapshot.sessionDate,
        state: snapshot.session?.state ?? "scheduled",
        note: snapshot.session?.note ?? null,
        expectedRevision: snapshot.session?.revision ?? null,
        attendance: snapshot.participants.map((participant) => ({
          athleteId: participant.athleteId,
          status:
            participant.athleteId === athleteId
              ? status
              : participant.status,
        })),
      },
    },
  );
  return readSavedAttendanceSnapshot(
    response.payload?.snapshot,
    snapshot.group.id,
    snapshot.sessionDate,
  );
}

function readSavedAttendanceSnapshot(snapshot, groupId, sessionDate) {
  if (
    snapshot === null ||
    typeof snapshot !== "object" ||
    snapshot?.group?.id !== groupId ||
    snapshot?.sessionDate !== sessionDate ||
    !Array.isArray(snapshot?.participants)
  ) {
    throw new UlcAttendancePreviewAcceptanceError(
      "Saved trainer attendance snapshot is invalid.",
    );
  }
  return snapshot;
}

function assertParticipantState(snapshot, athleteId, intention, status) {
  const matches = snapshot.participants.filter(
    (participant) => participant?.athleteId === athleteId,
  );
  if (
    matches.length !== 1 ||
    matches[0]?.intention !== intention ||
    matches[0]?.status !== status
  ) {
    throw new UlcAttendancePreviewAcceptanceError(
      "Athlete registration and actual attendance are not independently represented.",
    );
  }
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
    throw new UlcAttendancePreviewAcceptanceError(
      "Attendance acceptance request failed before receiving a response.",
    );
  }
  if (!(response instanceof Response)) {
    throw new UlcAttendancePreviewAcceptanceError(
      "Attendance acceptance transport returned an invalid response.",
    );
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new UlcAttendancePreviewAcceptanceError(
      "Attendance acceptance response was not JSON.",
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
    throw new UlcAttendancePreviewAcceptanceError(
      "Attendance acceptance request " + path +
        " returned HTTP " + String(response.status) + ".",
    );
  }
  return result;
}

function viennaIsoDate(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new UlcAttendancePreviewAcceptanceError(
      "Attendance acceptance current date is invalid.",
    );
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Vienna",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  if (
    !/^\d{4}$/.test(values.year ?? "") ||
    !/^\d{2}$/.test(values.month ?? "") ||
    !/^\d{2}$/.test(values.day ?? "")
  ) {
    throw new UlcAttendancePreviewAcceptanceError(
      "Attendance acceptance Vienna date could not be resolved.",
    );
  }
  return values.year + "-" + values.month + "-" + values.day;
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
    throw new UlcAttendancePreviewAcceptanceError(
      name + " is required.",
    );
  }
  return value;
}

function requiredHttpsOrigin(value) {
  const normalized = requiredCredential(
    value,
    "APPBASIS_GENERATED_PREVIEW_URL",
  );
  let url;
  try {
    url = new URL(normalized);
  } catch {
    throw new UlcAttendancePreviewAcceptanceError(
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
    throw new UlcAttendancePreviewAcceptanceError(
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
    const result = await runUlcAttendancePreviewAcceptance(
      readUlcAttendancePreviewAcceptanceEnvironment(),
    );
    console.log(
      "ULC attendance preview acceptance PASS: " +
        result.checks.join(", ") +
        ". Manual test user: " +
        result.athleteUsername +
        ".",
    );
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "ULC attendance preview acceptance failed.",
    );
    process.exitCode = 1;
  }
}
