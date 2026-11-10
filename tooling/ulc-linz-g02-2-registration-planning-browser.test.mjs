import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const registrationSource = readFileSync(new URL("../apps/ulc-linz/worker/ui.ts", import.meta.url), "utf8");
const planSource = readFileSync(new URL("../apps/ulc-linz/worker/training-plans-ui.ts", import.meta.url), "utf8");

// Execute actual production functions in a browser component smoke; this does
// not claim to be a logged-in app E2E or use any personal/preview data.
function productionFunction(source, signature) {
  const begin = source.indexOf(signature);
  assert.ok(begin >= 0, "Missing production function " + signature);
  const end = source.indexOf("\n}\n", begin);
  assert.ok(end > begin, "Missing function closing boundary " + signature);
  return source.slice(begin, end + 2);
}
function productionListener(source, signature) {
  const begin = source.indexOf(signature);
  assert.ok(begin >= 0, "Missing production handler " + signature);
  const end = source.indexOf("\n});", begin);
  assert.ok(end > begin, "Missing handler closing boundary " + signature);
  return source.slice(begin, end + 4);
}
const production = [
  productionFunction(registrationSource, "async function handleSelfRegistrationClick(event) {"),
  productionListener(registrationSource, 'window.addEventListener("beforeunload", (event) => {'),
  productionFunction(planSource, "function requestTrainingPlanLeaveDecision() {"),
  productionFunction(planSource, "function resolveTrainingPlanLeaveDecision(decision) {"),
  productionFunction(planSource, "function saveTrainingPlan() {"),
  productionFunction(planSource, "async function performTrainingPlanSave() {"),
  productionListener(planSource, 'window.addEventListener("beforeunload", (event) => {'),
].join("\n");
function chromiumBinary() {
  return [
    process.env.CHROME_BIN, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium", "/usr/bin/chromium-browser",
  ].filter(Boolean).find(existsSync);
}
const setup = [
  // DOM dispatch reports exceptions from event listeners without throwing to
  // the caller. Capture both synchronous and asynchronous browser failures,
  // so a broken production handler cannot cause a false PASS.
  "const browserErrors = [];",
  'function recordBrowserError(value) { const message = String(value); browserErrors.push(message); const result = document.querySelector("#result"); if (result) result.textContent = "G02_2_FAIL: " + browserErrors.join("; "); }',
  'window.addEventListener("error", (event) => recordBrowserError(event.error?.message || event.message || "Uncaught browser error"));',
  'window.addEventListener("unhandledrejection", (event) => recordBrowserError(event.reason?.message || event.reason || "Unhandled rejection"));',
  'let runMode = "idle";',
  "let u12Saving = false, u14Saving = false, kidsSaving = false;",
  "let u12DirtyDates = new Set(), u14DirtyDates = new Set(), kidsDirtyDates = new Set();",
  "let selfRegistrationSavingKeys = new Set(), selfRegistrationConflictReloadPending = false;",
  "let selfRegistrationNoteDrafts = new Map(), selfRegistrationProxy = null;",
  "let selfRegistrationReady = true, selfRegistrationLoading = false;",
  "let attendanceSessionGeneration = 1;",
  'const date1 = "2026-11-08", date2 = "2026-11-09", groupId = "group-a";',
  "let selfRegistrationOptions = [",
  ' { group: { id: groupId }, sessionDate: date1, sessionState: "scheduled", intention: "unknown", revision: 1, note: null },',
  ' { group: { id: groupId }, sessionDate: date2, sessionState: "scheduled", intention: "unknown", revision: 1, note: null },',
  "];",
  'const elements = { registrationMessage: document.querySelector("#registration-message"), registrationSuccess: document.querySelector("#registration-success") };',
  "function showMessage(element, value) { element.textContent = value; }",
  "function renderSelfRegistration() {}",
  "function refreshAppAvailability() {}",
  'function isSelfRegistrationOption(value, date) { return !!value && value.sessionDate === date && ["unknown","attending","not_attending","maybe"].includes(value.intention) && Number.isSafeInteger(value.revision) && value.revision >= 1; }',
  "let registrationReloads = 0;",
  "async function loadSelfRegistration() { registrationReloads += 1; }",
  "let pendingRegistrations = [], pendingPlans = [], calls = [];",
  'async function requestJson(url, options) { calls.push({ url, payload: JSON.parse(options.body) }); return await new Promise((resolve, reject) => { const pending = {resolve, reject}; if (url.includes("/registration")) pendingRegistrations.push(pending); else pendingPlans.push(pending); }); }',
  "const trainingPlanElements = {",
  ' editorMessage: document.querySelector("#plan-message"), reload: document.querySelector("#plan-reload"), retry: document.querySelector("#plan-retry"), leaveDialog: document.querySelector("#leave-dialog"), leaveSave: document.querySelector("#leave-save")',
  "};",
  'let trainingPlanDraft = { note: "First", items: [] };',
  'let trainingPlanEditorDate = date1, trainingPlanSelectedSubjectId = "athlete-a";',
  "let trainingPlansCanEdit = true, trainingPlanConflict = false, trainingPlanDirty = false;",
  "let trainingPlanSaveBusy = false, trainingPlanTemplateBusy = false, trainingPlanSaveBackBusy = false, trainingPlanDistributeBusy = false;",
  "let trainingPlanSessionGeneration = 1, trainingPlanSessionIdentityId = 'trainer-a';",
  "let trainingPlanSaveInFlight = null, trainingPlanAutoSavePaused = false;",
  "let scheduledPlanSaves = 0;",
  "function cancelTrainingPlanAutoSave() {}",
  "function scheduleTrainingPlanSave() { scheduledPlanSaves += 1; }",
  "function trainingPlanWriteLeaveBackup() {}",
  "let trainingPlanChangeVersion = 1, trainingPlanLeaveResolver = null;",
  'let trainingPlanSelected = { id: "plan-1", currentRevision: 1 };',
  "let clearBackups = 0;",
  "function trainingPlanDraftPayload(draft) { return { note: draft.note, items: draft.items }; }",
  "function refreshTrainingPlanEditorState() {}",
  'function trainingPlanSetSaveState(state, label) { document.querySelector("#plan-state").textContent = state + ": " + label; }',
  "function isTrainingPlanSnapshot(value) { return !!value && Array.isArray(value.revision?.items); }",
  "function trainingPlanApplySavedIds() {}",
  "function trainingPlanClearLeaveBackup() { clearBackups += 1; }",
  "function replaceTrainingPlanWeekSnapshot() {}",
  "function renderTrainingPlanWeek() {}",
  "function replaceTrainingPlanOverviewSummary() {}",
  'let trainingPlanViewMode = "week";',
  "function renderTrainingPlanOverview() {}",
  "function renderTrainingPlanItems() {}",
].join("\n");

async function browserScenarios() {
  const check = (value, message) => { if (!value) throw Error(message); };
  const warning = () => {
    const e = new Event("beforeunload", { cancelable: true });
    const errorsBefore = browserErrors.length;
    window.dispatchEvent(e);
    check(browserErrors.length === errorsBefore,
      "beforeunload handler threw: " + browserErrors.slice(errorsBefore).join("; "));
    return e.defaultPrevented;
  };
  const click = (date, intention) => {
    const button = document.querySelector(
      '[data-registration-date="' + date + '"][data-intention="' + intention + '"]',
    );
    check(!!button, "Registration action unavailable");
    return handleSelfRegistrationClick({ target: button });
  };
  const savedPlan = () => ({
    id: "plan-1", subjectId: "athlete-a", planDate: date1,
    currentRevision: 2, revision: { items: [] },
  });
  check(document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    "Mobile test fixture overflows horizontally");
  check(!warning(), "Clean registration and plan warn on unload");
  trainingPlanDistributeBusy = true;
  check(warning(), "In-flight plan distribution not guarded");
  trainingPlanDistributeBusy = false;
  check(!warning(), "Clean plan unexpectedly warns after distribution");

  selfRegistrationNoteDrafts.set(groupId + "|" + date1, "Arrive later");
  check(warning(), "Unsaved registration note not protected");
  selfRegistrationNoteDrafts.clear();
  selfRegistrationProxy = { saving: true, noteDrafts: new Map() };
  check(warning(), "In-flight proxy save not protected");
  selfRegistrationProxy.saving = false;
  selfRegistrationProxy.noteDrafts.set("person", "Proxy draft");
  check(warning(), "Unsaved proxy note not protected");
  selfRegistrationProxy = null;

  // Two days can save concurrently. A 409 must not reload until the second
  // request is done, and a rejected optimistic selection must roll back.
  const first = click(date1, "attending");
  const second = click(date2, "attending");
  check(selfRegistrationSavingKeys.size === 2 && warning(), "In-flight registration can be lost");
  check(pendingRegistrations.length === 2, "Concurrent registration requests missing");
  pendingRegistrations[0].reject(Object.assign(new Error("conflict"), {
    status: 409, code: "TRAINING_REGISTRATION_CONFLICT",
  }));
  await first;
  check(registrationReloads === 0 && selfRegistrationSavingKeys.size === 1,
    "Conflict reload disrupted still-running registration");
  pendingRegistrations[1].resolve({
    option: { ...selfRegistrationOptions[1], intention: "attending", revision: 2 },
  });
  await second;
  check(registrationReloads === 1 && selfRegistrationSavingKeys.size === 0,
    "Conflict reload should occur once, after all writes complete");
  check(selfRegistrationOptions[0].intention === "unknown", "Failed optimistic state not restored");

  // Failed POST must not erase a free-text note draft.
  const key = groupId + "|" + date1;
  selfRegistrationNoteDrafts.set(key, "Original pending note");
  const noteSave = handleSelfRegistrationClick({ target: document.querySelector("#note-save") });
  check(warning(), "In-flight note not protected");
  pendingRegistrations[2].reject(new Error("network failed"));
  await noteSave;
  check(selfRegistrationNoteDrafts.get(key) === "Original pending note",
    "Failed note request discarded draft");
  selfRegistrationNoteDrafts.clear();
  check(!warning(), "Clean registration still warns");

  // The existing plan editor leave confirmation must retain the draft on Stay.
  trainingPlanDirty = true;
  const leave = requestTrainingPlanLeaveDecision();
  await Promise.resolve();
  check(!trainingPlanElements.leaveDialog.hidden, "Plan leave dialog not opened");
  check(document.activeElement === trainingPlanElements.leaveSave,
    "Save button not focused on leave dialog");
  resolveTrainingPlanLeaveDecision("stay");
  check((await leave) === "stay" && trainingPlanDirty, "Stay discarded the plan");

  // Network failure preserves the dirty draft for explicit retry. CAS 409
  // blocks writes until the conflict has been dealt with. Both code paths
  // execute the actual serialized auto-save wrapper and CAS writer.
  let operation = saveTrainingPlan();
  check(trainingPlanSaveBusy && warning(), "In-flight plan write not guarded");
  pendingPlans[0].reject(new Error("network failure"));
  check((await operation) === false && trainingPlanDirty &&
    trainingPlanAutoSavePaused && !trainingPlanElements.retry.hidden,
    "Plan network failure not retriable");

  operation = saveTrainingPlan();
  pendingPlans[1].resolve({ plan: savedPlan() });
  check(await operation && !trainingPlanDirty && clearBackups === 1,
    "Plan retry did not persist and clear backup");
  check(scheduledPlanSaves === 0,
    "Clean plan unexpectedly scheduled another network write");
  check(!warning(), "Saved plan still triggers unload warning");

  trainingPlanDirty = true;
  trainingPlanChangeVersion += 1;
  operation = saveTrainingPlan();
  pendingPlans[2].reject(Object.assign(new Error("conflict"), {
    status: 409, code: "TRAINING_PLAN_CONFLICT",
  }));
  check((await operation) === false && trainingPlanConflict &&
    trainingPlanDirty && !trainingPlanElements.reload.hidden,
    "Plan revision conflict not blocked");
  check((await saveTrainingPlan()) === false && pendingPlans.length === 3,
    "Conflicted plan sent another write");
  check(warning(), "Conflicting plan draft lacks unload protection");
}

const runner = "(" + browserScenarios.toString() + ")().then(" +
  "() => { document.querySelector('#result').textContent = browserErrors.length ? 'G02_2_FAIL: ' + browserErrors.join('; ') : 'G02_2_PASS'; }," +
  "(error) => { document.querySelector('#result').textContent = 'G02_2_FAIL: ' + error.message; });";
const script = [setup, production, runner].join("\n");
const html = [
  "<!doctype html><html><head><meta charset='utf-8'>",
  "<meta name='viewport' content='width=device-width,initial-scale=1'>",
  "<style>*{box-sizing:border-box}body{margin:0}main{width:360px;max-width:100%;padding:8px}",
  "button{min-height:44px;max-width:100%}section{display:grid;gap:8px}</style></head>",
  "<body><main><section>",
  '<button data-registration-group="group-a" data-registration-date="2026-11-08" data-intention="attending">Komme Sonntag</button>',
  '<button data-registration-group="group-a" data-registration-date="2026-11-09" data-intention="attending">Komme Montag</button>',
  '<button id="note-save" data-registration-group="group-a" data-registration-date="2026-11-08" data-registration-note-save="true">Hinweis speichern</button>',
  '<p id="registration-message"></p><p id="registration-success"></p>',
  '<div id="leave-dialog" hidden><button id="leave-save">Speichern</button></div>',
  '<p id="plan-message"></p><p id="plan-state"></p>',
  '<button id="plan-reload" hidden>Neu laden</button><button id="plan-retry" hidden>Wiederholen</button>',
  '<pre id="result"></pre></section></main>',
  "<script>", script.replaceAll("</script", "<\\/script"), "</script>",
  "</body></html>",
].join("");

test("G-02.2: real Chromium registration and planning save/leave safety smoke", () => {
  const browser = [
    process.env.CHROME_BIN, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium", "/usr/bin/chromium-browser",
  ].filter(Boolean).find(existsSync);
  assert.ok(browser, "Chrome/Chromium is required: never silently replace browser testing with mocks.");
  const root = mkdtempSync(path.join(tmpdir(), "ulc-g02-2-"));
  try {
    const file = path.join(root, "smoke.html");
    writeFileSync(file, html);
    const result = spawnSync(browser, [
      "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
      "--disable-gpu", "--disable-background-networking", "--no-first-run",
      "--window-size=390,844", "--virtual-time-budget=3200",
      "--user-data-dir=" + path.join(root, "chrome-profile"),
      "--dump-dom", pathToFileURL(file).href,
    ], { encoding: "utf8", timeout: 45000, maxBuffer: 2 * 1024 * 1024 });
    assert.equal(result.status, 0, "Chromium exited abnormally: " + result.stderr?.slice(-900));
    assert.match(result.stdout, /id="result">G02_2_PASS<\/pre>/,
      "Browser smoke failed: " + (result.stdout.match(/G02_2_FAIL[^<]*/)?.[0] || result.stderr?.slice(-700)));
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
