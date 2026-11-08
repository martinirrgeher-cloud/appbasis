import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

// Executes actual production functions. Component smoke, not an authenticated app E2E.
const source = readFileSync(new URL("../apps/ulc-linz/worker/u12-ui.ts", import.meta.url), "utf8");
function productionFunction(signature) {
  const begin = source.indexOf(signature);
  assert.ok(begin >= 0, "Missing production function " + signature);
  const end = source.indexOf("\n}\n", begin);
  assert.ok(end > begin, "Missing closing boundary " + signature);
  return source.slice(begin, end + 2);
}
const cssSignature = "export const ULC_U12_CSS = " + String.fromCharCode(96);
const cssStart = source.indexOf(cssSignature);
assert.ok(cssStart >= 0);
const cssEnd = source.indexOf(String.fromCharCode(96) + ";", cssStart + cssSignature.length);
assert.ok(cssEnd > cssStart);
const css = source.slice(cssStart + cssSignature.length, cssEnd);
const production = [
  productionFunction("function u12DialablePhone(rawPhone) {"),
  productionFunction("function openU12AthleteDetails(athleteId) {"),
].join("\n");
const script = [
  'const errors = [];',
  'window.addEventListener("error", e => errors.push(String(e.error?.message || e.message)));',
  'window.addEventListener("unhandledrejection", e => errors.push(String(e.reason?.message || e.reason)));',
  'const result = document.querySelector("#result");',
  'const dialog = document.querySelector("#details-dialog");',
  'const u12Ui = { detailsDialog: dialog, detailsContent: document.querySelector("#details-content"), detailsTitle: document.querySelector("#details-title") };',
  'const u12Snapshot = { participants: [{ athleteId: "a", firstName: "Anna", lastName: "Auer", notes: "<img src=x onerror=alert(1)>", contacts: [',
  '  { id:"b", contactName:"Vater", relationship:"Vater", phone:"+43 664 123-45", isEmergency:true, priority:1, notes:"Wochentags" },',
  '  { id:"a", contactName:"Mutter", relationship:"Mutter", phone:"0732/123456", isEmergency:true, priority:2, notes:null },',
  '  { id:"c", contactName:"Nachbar", relationship:null, phone:"javascript:alert(1)", isEmergency:false, priority:1, notes:"Kein Anruf möglich" },',
  '] }] };',
  production,
  'try {',
  '  const check = (value, message) => { if (!value) throw new Error(message); };',
  '  const info = document.querySelector("#roster-info");',
  '  check(!info.hasAttribute("href"), "Roster must not dial directly");',
  '  info.addEventListener("click", () => openU12AthleteDetails("a"));',
  '  info.click();',
  '  check(dialog.open, "Emergency button failed to open contact dialog");',
  '  check(u12Ui.detailsTitle.textContent === "Anna Auer", "Wrong athlete");',
  '  const sections = dialog.querySelectorAll(".u12-contact-group");',
  '  check(sections.length === 2, "Missing distinct contact groups");',
  '  check(sections[0].querySelector("h4").textContent === "Notfallkontakte", "Emergency group not first");',
  '  check(sections[1].querySelector("h4").textContent === "Weitere Kontakte", "Regular contacts not separated");',
  '  const names = [...sections[0].querySelectorAll(".u12-contact-entry strong")].map(node => node.textContent);',
  '  check(names[0].includes("Vater") && names[1].includes("Mutter"), "Incorrect priority order");',
  '  const links = [...dialog.querySelectorAll("a.u12-contact-call")];',
  '  check(links.length === 2, "Unsafe phone has dial link");',
  '  check(links[0].getAttribute("href") === "tel:+4366412345", "Wrong emergency dial target");',
  '  check(links[1].getAttribute("href") === "tel:0732123456", "Wrong second dial target");',
  '  check(!dialog.querySelector("img"), "Contact notes rendered as HTML");',
  '  check(dialog.textContent.includes("Nummer prüfen"), "Invalid number lacks explanation");',
  '  check(links.every(link => link.getBoundingClientRect().height >= 44), "Call buttons below 44px");',
  '  check(info.getBoundingClientRect().height >= 44 && info.getBoundingClientRect().width >= 44, "Roster button below 44px");',
  '  check(dialog.getBoundingClientRect().width <= window.innerWidth, "Dialog exceeds mobile width");',
  '  check(document.documentElement.scrollWidth <= window.innerWidth, "Horizontal overflow");',
  '  check(errors.length === 0, "Browser errors: " + errors.join("; "));',
  '  result.textContent = "G03_CONTACT_PASS";',
  '} catch (error) { result.textContent = "G03_CONTACT_FAIL: " + error.message; }',
].join("\n");
const html = [
  "<!doctype html><html><head><meta charset='utf-8'>",
  "<meta name='viewport' content='width=device-width,initial-scale=1'>",
  "<style>*{box-sizing:border-box}body{margin:0;padding:8px}",
  css.replaceAll("</style", "<\\/style"),
  "</style></head><body>",
  '<button id="roster-info" class="u12-info u12-info--emergency" aria-label="Notfallkontakte zu Anna Auer anzeigen">☎</button>',
  '<dialog class="u12-details-dialog" id="details-dialog"><header class="u12-details-header"><h2 id="details-title"></h2></header><div id="details-content"></div></dialog>',
  '<pre id="result"></pre><script>', script.replaceAll("</script", "<\\/script"), "</script>",
  "</body></html>",
].join("");

test("G-03.1 real Chromium contact dialing and 320–390px mobile smoke", () => {
  const browser = [
    process.env.CHROME_BIN, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium", "/usr/bin/chromium-browser",
  ].filter(Boolean).find(existsSync);
  assert.ok(browser, "Chrome/Chromium required; no mocked browser fallback.");
  const root = mkdtempSync(path.join(tmpdir(), "ulc-g03-"));
  try {
    const file = path.join(root, "test.html");
    writeFileSync(file, html);
    for (const width of [320, 360, 390]) {
      const run = spawnSync(browser, [
        "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
        "--disable-gpu", "--disable-background-networking", "--no-first-run",
        "--window-size=" + width + ",844", "--virtual-time-budget=2000",
        "--user-data-dir=" + path.join(root, "chrome-" + width),
        "--dump-dom", pathToFileURL(file).href,
      ], { encoding: "utf8", timeout: 45000, maxBuffer: 2 * 1024 * 1024 });
      assert.equal(run.status, 0, "Chromium " + width + " failed: " + run.stderr?.slice(-500));
      assert.match(run.stdout, /id="result">G03_CONTACT_PASS<\/pre>/,
        "G-03.1 browser " + width + " failed: " +
        (run.stdout.match(/G03_CONTACT_FAIL[^<]*/)?.[0] || run.stderr?.slice(-800)));
    }
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
