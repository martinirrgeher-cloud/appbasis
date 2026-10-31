import { pathToFileURL } from "node:url";
import {
  readUlcTrainingPlansPreviewAcceptanceEnvironment,
  UlcTrainingPlansPreviewAcceptanceError,
} from "./ulc-linz-training-plans-preview-acceptance.mjs";

const REQUEST_TIMEOUT_MS = 15_000;
const CANONICAL_GROUP = "Preview Selbstanmeldung";
const CANONICAL_ATHLETE_FIRST = "Preview";
const CANONICAL_ATHLETE_LAST = "Athlet";

/**
 * Authenticated read-only acceptance for the persistent preview tenant.
 * The full create/update/conflict acceptance remains in unit / isolated
 * integration tests, but is no longer run against persistent preview data.
 */
export async function runUlcTrainingPlansPreviewReadOnlyAcceptance(
  options,
  { fetchImpl = globalThis.fetch, now = () => new Date() } = {},
) {
  if (typeof fetchImpl !== "function" || typeof now !== "function") {
    throw new UlcTrainingPlansPreviewAcceptanceError("Read-only preview dependencies invalid.");
  }
  const baseURL = new URL(options.baseURL);
  if (baseURL.protocol !== "https:" || baseURL.origin !== options.baseURL) {
    throw new UlcTrainingPlansPreviewAcceptanceError("Read-only preview URL must be a canonical HTTPS origin.");
  }
  const signIn = await readJson(baseURL, "/api/auth/sign-in", fetchImpl, {
    method: "POST",
    body: { username: options.username, password: options.password },
  });
  const cookie = signIn.cookie;
  if (
    signIn.payload?.access !== "full" ||
    signIn.payload?.identity?.username !== options.username ||
    !cookie
  ) {
    throw new UlcTrainingPlansPreviewAcceptanceError("Read-only preview authentication failed.");
  }
  const masterdata = await readJson(baseURL, "/api/modules/athletes/masterdata", fetchImpl, { cookie });
  const groups = masterdata.payload?.masterdata?.trainingGroups;
  const athletes = masterdata.payload?.masterdata?.athletes;
  if (!Array.isArray(groups) || !Array.isArray(athletes)) {
    throw new UlcTrainingPlansPreviewAcceptanceError("Read-only preview masterdata contract failed.");
  }
  const group = groups.find((item) => item?.name === CANONICAL_GROUP && item?.isActive !== false);
  const athlete = athletes.find((item) =>
    item?.firstName === CANONICAL_ATHLETE_FIRST &&
    item?.lastName === CANONICAL_ATHLETE_LAST && item?.isActive !== false,
  );
  if (typeof group?.id !== "string" || typeof athlete?.id !== "string") {
    throw new UlcTrainingPlansPreviewAcceptanceError("Stable attendance preview group or athlete missing.");
  }
  const weekStart = mondayIso(now());
  const encodedGroup = encodeURIComponent(group.id);
  const encodedAthlete = encodeURIComponent(athlete.id);
  const week = await readJson(baseURL,
    "/api/modules/training-plans/week?subjectId=" + encodedAthlete +
    "&weekStart=" + weekStart, fetchImpl, { cookie });
  const overview = await readJson(baseURL,
    "/api/modules/training-plans/overview?groupId=" + encodedGroup +
    "&weekStart=" + weekStart, fetchImpl, { cookie });
  const blocks = await readJson(baseURL, "/api/modules/training-blocks", fetchImpl, { cookie });
  if (
    !Array.isArray(week.payload?.plans) ||
    !Array.isArray(week.payload?.attendance) ||
    !Array.isArray(overview.payload?.overview?.rows) ||
    !Array.isArray(blocks.payload?.blocks)
  ) {
    throw new UlcTrainingPlansPreviewAcceptanceError("Read-only preview planning / block contracts failed.");
  }
  return Object.freeze({
    status: "ok",
    mode: "read-only",
    groupId: group.id,
    athleteId: athlete.id,
    weekStart,
    checks: ["login", "masterdata", "week", "overview", "blocks"],
  });
}

function mondayIso(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new UlcTrainingPlansPreviewAcceptanceError("Invalid preview verification date.");
  }
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  utc.setUTCDate(utc.getUTCDate() - ((utc.getUTCDay() + 6) % 7));
  return utc.toISOString().slice(0, 10);
}

async function readJson(baseURL, path, fetchImpl, { cookie, method = "GET", body } = {}) {
  const url = new URL(path, baseURL);
  const headers = new Headers({ accept: "application/json" });
  if (cookie) headers.set("cookie", cookie);
  if (body !== undefined) headers.set("content-type", "application/json");
  let response;
  try {
    response = await fetchImpl(url, {
      method, headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new UlcTrainingPlansPreviewAcceptanceError("Read-only preview transport failure: " + method + " " + url.pathname);
  }
  if (!(response instanceof Response) || response.status !== 200) {
    throw new UlcTrainingPlansPreviewAcceptanceError("Read-only preview failed: " + method + " " + url.pathname);
  }
  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    throw new UlcTrainingPlansPreviewAcceptanceError("Read-only preview invalid JSON: " + url.pathname);
  }
  const rawCookie = response.headers.get("set-cookie") || "";
  const sessionCookie = rawCookie.split(";")[0];
  return { payload, cookie: sessionCookie.includes("=") ? sessionCookie : null };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runUlcTrainingPlansPreviewReadOnlyAcceptance(
    readUlcTrainingPlansPreviewAcceptanceEnvironment(),
  ).then(
    (result) => console.log("E7B9 persistent preview read-only acceptance PASS: " + result.checks.join(", ")),
    (error) => { console.error(error?.message || "Read-only acceptance failed."); process.exitCode = 1; },
  );
}
