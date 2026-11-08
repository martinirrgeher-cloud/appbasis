import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const source = readFileSync(new URL("../apps/ulc-linz/worker/u12-ui.ts", import.meta.url), "utf8");
function realProductionSection(start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, "Missing production section: " + start);
  return source.slice(a, b);
}

// Use real production JavaScript, not reimplemented save/offline logic.
// This is a browser component smoke, not an authenticated full-app E2E.
const scheduler = realProductionSection("function u12IsOffline()", "function markU12DraftDirty()");
const saver = realProductionSection("async function saveU12Attendance()", "async function u12FlushChanges()");
const events = realProductionSection('window.addEventListener("offline"', 'u12Ui.prev?.addEventListener("click"');
const pillCss = realProductionSection(".u12-person__answer {", ".u12-person:focus-within {");

function chromiumBinary() {
  const candidates = [
    process.env.CHROME_BIN,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  return candidates.find(existsSync);
}

// Serialized into a real headless Chromium page after loading production functions.
async function runBrowserScenarios() {
  function check(value, message) {
    if (!value) throw Error(message);
  }
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const phone = document.querySelector("#phone");
  const pill = document.querySelector(".u12-person__answer");
  check(phone.scrollWidth <= phone.clientWidth, "360px fixture has horizontal overflow");
  check(pill.getBoundingClientRect().height >= 44, "Touch target is below 44px");
  const checkbox = pill.querySelector("input");
  checkbox.click();
  check(checkbox.checked === true, "Native checkbox click failed");

  // A known offline state prevents a POST, even after the autosave debounce.
  online = false;
  u12DirtyDates.add(u12LoadedDate);
  scheduleU12AutoSave();
  window.dispatchEvent(new Event("offline"));
  await sleep(950);
  check(posts.length === 0, "Offline scheduler attempted a POST");
  check(u12DirtyDates.size === 1, "Offline edit discarded");
  check(u12Ui.message.textContent.includes("Keine Internetverbindung"), "No offline feedback");

  // Only a never-sent draft may resume automatically on the online event.
  online = true;
  window.dispatchEvent(new Event("online"));
  await sleep(950);
  check(posts.length === 1, "Known-safe draft did not resume after reconnect");
  check(u12DirtyDates.size === 0, "Successful reconnect write did not clear draft");

  // A lost POST response is ambiguous; do not blindly replay on online.
  u12EditVersion += 1;
  u12DirtyDates.add(u12LoadedDate);
  nextFailure = "network";
  scheduleU12AutoSave();
  await sleep(950);
  check(posts.length === 2 && u12AutoSaveFailed, "Lost POST response not recorded as failure");
  window.dispatchEvent(new Event("online"));
  await sleep(950);
  check(posts.length === 2, "Ambiguous failed POST replayed automatically");
  check(u12DirtyDates.size === 1, "Uncertain failed POST discarded its draft");
  check(await saveU12Attendance(), "Explicit retry after network failure failed");
  check(posts.length === 3 && u12DirtyDates.size === 0, "Manual retry did not persist");

  // Regression: the connection returns *while a previous POST is unresolved*.
  // If its response is lost, the reconnect must not queue a duplicate write.
  u12EditVersion += 1;
  u12DirtyDates.add(u12LoadedDate);
  deferNextResponse = true;
  scheduleU12AutoSave();
  await sleep(950);
  check(posts.length === 4 && u12Saving && pendingRequest,
    "Deferred POST was not in flight");
  online = false;
  window.dispatchEvent(new Event("offline"));
  online = true;
  window.dispatchEvent(new Event("online"));
  check(u12AutoSaveTimer === null, "Reconnect queued a duplicate while POST is in flight");
  pendingRequest.reject(new Error("lost response after server may have committed"));
  pendingRequest = null;
  await sleep(950);
  check(posts.length === 4 && u12AutoSaveFailed,
    "Ambiguous in-flight POST automatically replayed after reconnect");
  check(u12DirtyDates.size === 1, "In-flight failure discarded pending changes");
  check(await saveU12Attendance(), "Explicit in-flight retry after failure failed");
  check(posts.length === 5 && u12DirtyDates.size === 0, "In-flight retry did not settle");

  // A successful in-flight POST must still flush edits made during that write.
  u12EditVersion += 1;
  u12DirtyDates.add(u12LoadedDate);
  deferNextResponse = true;
  scheduleU12AutoSave();
  await sleep(950);
  check(posts.length === 6 && u12Saving && pendingRequest, "Second POST was not in flight");
  u12EditVersion += 1;
  u12Note = "new edit during in-flight save";
  scheduleU12AutoSave(); // Should defer until the in-flight write completes.
  pendingRequest.resolve({ snapshot: u12Snapshot });
  pendingRequest = null;
  await sleep(950);
  check(posts.length === 7 && u12DirtyDates.size === 0,
    "A fresh edit was not saved after successful in-flight write");
  check(posts[6].body.note === "new edit during in-flight save",
    "Later draft was overwritten by in-flight response");

  // CAS conflict is not a network retry: never override another trainer.
  u12EditVersion += 1;
  u12DirtyDates.add(u12LoadedDate);
  nextFailure = 409;
  scheduleU12AutoSave();
  await sleep(950);
  check(u12Conflict === true, "CAS conflict not blocked");
  window.dispatchEvent(new Event("online"));
  await sleep(950);
  check(posts.length === 8, "409 conflict silently retried");
  check(await saveU12Attendance() === false, "Conflicting draft allowed a write");

  const unload = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(unload);
  check(unload.defaultPrevented, "Dirty page unload had no warning");
  check(u12DirtyDates.size === 1, "Unload protection discarded draft");
}

const setup = [
  "let online = true;",
  'Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online });',
  "let posts = [];",
  "let nextFailure = null;",
  "let deferNextResponse = false;",
  "let pendingRequest = null;",
  'let u12LoadedDate = "2026-11-08";',
  'let u12LoadedGroupId = "group-1";',
  "let u12DirtyDates = new Set();",
  "let u12AutoSaveTimer = null;",
  "let u12AutoSaveFailed = false;",
  "let u12Ready = true;",
  "let u12Conflict = false;",
  "let u12WriteAllowed = true;",
  "let u12Loading = false;",
  "let u12Saving = false;",
  "let u12SaveInFlight = null;",
  "let u12EditVersion = 0;",
  "let u12LoadId = 1;",
  "let attendanceSessionGeneration = 1;",
  "let u12ContentTitles = [];",
  "let u12ContentItems = [];",
  "let u12Note = '';",
  "let u12TrainerPresent = new Set();",
  "let u12Present = new Map([['athlete-1', false]]);",
  "let u12TouchedAthletes = new Set();",
  "let u12ContentAssignments = new Map([['athlete-1', new Set()]]);",
  "let u12Snapshot = { session: { state: 'scheduled', revision: 'rev-1', note: null },",
  "  participants: [{ athleteId: 'athlete-1', status: 'open', contentSlots: [] }],",
  "  trainers: [], contentTitles: [], contentItems: [] };",
  "let u12Ui = { message: document.querySelector('#error'),",
  "  saveState: document.querySelector('#save-state'),",
  "  contentCard: { open: false } };",
  "function showMessage(element, message) { element.textContent = message; }",
  "function refreshU12Controls() {",
  "  u12Ui.saveState.textContent = u12IsOffline() ? 'Offline' :",
  "    (u12AutoSaveFailed ? 'Erneut versuchen' : 'Bereit');",
  "}",
  "function u12ValidSnapshot() { return true; }",
  "async function requestJson(url, options) {",
  "  posts.push({ url: url, body: JSON.parse(options.body) });",
  "  if (deferNextResponse) {",
  "    deferNextResponse = false;",
  "    return await new Promise((resolve, reject) => { pendingRequest = { resolve, reject }; });",
  "  }",
  "  if (nextFailure !== null) {",
  "    const failure = nextFailure; nextFailure = null;",
  "    const error = new Error('simulated request failure');",
  "    if (failure !== 'network') error.status = failure;",
  "    throw error;",
  "  }",
  "  return { snapshot: u12Snapshot };",
  "}",
].join("\n");
const runner = "(" + runBrowserScenarios.toString() + ")().then(" +
  "() => { document.querySelector('#g02-result').textContent = 'G02_BROWSER_PASS'; }," +
  "(error) => { document.querySelector('#g02-result').textContent = " +
  "'G02_BROWSER_FAIL: ' + error.message; });";
const script = [setup, scheduler, saver, events, runner].join("\n");
const html = [
  "<!doctype html><html><head><meta charset='utf-8'>",
  "<meta name='viewport' content='width=device-width,initial-scale=1'>",
  "<style>:root{--card:#fff;--muted:#eee;--text:#222;--secondary:#555;",
  "--border-strong:#888;--accent:#236737;--ab-brand-soft:#dcf3dc;",
  "--ab-brand-contrast:#fff;} *{box-sizing:border-box}body{margin:0}",
  "#phone{width:360px;max-width:100%;padding:8px}",
  ".u12-person__toggle{display:flex;justify-content:space-between;gap:6px;min-width:0}",
  ".u12-person__toggle>span:first-child{min-width:0;overflow-wrap:anywhere}",
  pillCss,
  "</style></head><body><main id='phone'>",
  "<label class='u12-person__toggle'><span>Test-Athletin mit längerem Namen</span>",
  "<span class='u12-person__answer'><input type='checkbox' aria-label='Anwesend'>",
  "<span>Nein</span></span></label><p id='error' role='alert'></p>",
  "<p id='save-state' role='status'></p><pre id='g02-result'></pre></main>",
  "<script>", script.replaceAll("</script", "<\\/script"), "</script>",
  "</body></html>",
].join("");

test("G-02: real Chromium smoke for youth autosave, reconnect, 409 and 360px touch", () => {
  const browser = chromiumBinary();
  assert.ok(browser,
    "Chromium/Google Chrome is required; do not silently replace a browser test with mocks.");
  const root = mkdtempSync(path.join(tmpdir(), "ulc-g02-browser-"));
  try {
    const htmlFile = path.join(root, "smoke.html");
    writeFileSync(htmlFile, html, "utf8");
    const result = spawnSync(browser, [
      "--headless=new",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-background-networking",
      "--no-first-run",
      "--hide-scrollbars",
      "--window-size=390,844",
      "--virtual-time-budget=14000",
      "--user-data-dir=" + path.join(root, "chrome-profile"),
      "--dump-dom",
      pathToFileURL(htmlFile).href,
    ], { encoding: "utf8", timeout: 45000, maxBuffer: 2 * 1024 * 1024 });
    assert.equal(result.status, 0, "Chromium exited unsuccessfully: " + result.stderr?.slice(-1200));
    assert.match(result.stdout, /id="g02-result">G02_BROWSER_PASS<\/pre>/,
      "Browser smoke failed or did not finish: " + (result.stdout.match(/G02_BROWSER_FAIL[^<]*/)?.[0] || result.stderr?.slice(-700)));
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 });
  }
});
