const IDENTIFIER_PATTERN = /^[a-z][a-z0-9-]*$/;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_ACCENT_COLOR = "#2563eb";

export function renderGeneratedAppUiModule(input = {}) {
  const appId = requiredIdentifier(input.appId, "appId");
  const displayName = requiredDisplayName(input.displayName);
  const modules = requiredIdentifierList(input.modules ?? [], "module");
  const platformServices = requiredIdentifierList(
    input.platformServices ?? ["identity"],
    "platform service",
  );
  const hasTasks =
    modules.includes("tasks") && platformServices.includes("permissions");
  const brandMark = requiredBrandMark(
    input.brandMark ?? defaultBrandMark(displayName),
  );
  const accentColor = requiredAccentColor(
    input.accentColor ?? DEFAULT_ACCENT_COLOR,
  );
  const accentForeground = foregroundForHex(accentColor);

  const html = HTML_TEMPLATE
    .replaceAll("__APP_NAME__", escapeHtml(displayName))
    .replaceAll("__APP_MARK__", escapeHtml(brandMark))
    .replaceAll("__APP_ID__", escapeHtml(appId))
    .replace(
      "__TASK_NAV__",
      hasTasks
        ? '<a class="app-nav__link" href="#tasks" data-nav="tasks">Aufgaben</a>'
        : "",
    )
    .replace(
      "__TASK_PANEL__",
      hasTasks
        ? TASK_PANEL
        : '<section class="ab-card empty-module"><strong>App bereit</strong><p>Für diese App ist noch kein Fachmodul aktiviert.</p></section>',
    );

  const css = CSS_TEMPLATE
    .replaceAll("__ACCENT__", accentColor)
    .replaceAll("__ACCENT_FOREGROUND__", accentForeground);

  const script = SCRIPT_TEMPLATE.replace(
    "__HAS_TASKS__",
    hasTasks ? "true" : "false",
  );

  return [
    "export const GENERATED_APP_HTML = " + JSON.stringify(html) + ";",
    "export const GENERATED_APP_CSS = " + JSON.stringify(css) + ";",
    "export const GENERATED_APP_SCRIPT = " + JSON.stringify(script) + ";",
    "",
    UI_RESPONSE_SOURCE,
    "",
  ].join("\n");
}

const HTML_TEMPLATE = `<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light" />
    <title>__APP_NAME__</title>
    <link rel="stylesheet" href="/app.css" />
  </head>
  <body>
    <div class="app-shell">
      <header class="app-header">
        <a class="app-brand" href="/" aria-label="__APP_NAME__ Startseite">
          <span class="app-brand__mark" aria-hidden="true">__APP_MARK__</span>
          <span class="app-brand__copy"><strong>__APP_NAME__</strong><small>AppBasis</small></span>
        </a>
        <span class="app-badge">__APP_ID__</span>
      </header>

      <main class="gate-shell" id="login-view">
        <section class="ab-card gate-card">
          <p class="eyebrow">Anmeldung</p>
          <h1>Willkommen.</h1>
          <p class="summary">Melde dich mit deinem Benutzernamen an.</p>
          <form class="form-stack" id="login-form">
            <label>Benutzername<input id="login-username" autocomplete="username" required /></label>
            <label>Passwort<input id="login-password" type="password" autocomplete="current-password" required /></label>
            <p class="message message--error" id="login-message" role="alert" hidden></p>
            <button class="button button--primary" type="submit">Anmelden</button>
          </form>
        </section>
      </main>

      <main class="gate-shell" id="password-view" hidden>
        <section class="ab-card gate-card">
          <p class="eyebrow">Passwortwechsel erforderlich</p>
          <h1>Neues Passwort festlegen.</h1>
          <p class="summary">Das temporäre Passwort muss vor der Nutzung ersetzt werden.</p>
          <form class="form-stack" id="password-form">
            <label>Aktuelles Passwort<input id="current-password" type="password" autocomplete="current-password" required /></label>
            <label>Neues Passwort<input id="new-password" type="password" autocomplete="new-password" required /></label>
            <label>Neues Passwort wiederholen<input id="confirm-password" type="password" autocomplete="new-password" required /></label>
            <p class="message message--error" id="password-message" role="alert" hidden></p>
            <button class="button button--primary" type="submit">Passwort ändern</button>
          </form>
        </section>
      </main>

      <div id="app-view" hidden>
        <div class="app-body">
          <nav class="app-nav" aria-label="Hauptnavigation">
            <a class="app-nav__link is-active" href="#dashboard" data-nav="dashboard">Übersicht</a>
            __TASK_NAV__
          </nav>

          <main class="content" id="dashboard">
            <section class="hero">
              <p class="eyebrow" id="welcome-eyebrow">Angemeldet</p>
              <h1>Alles Wichtige im Blick.</h1>
              <p class="summary">Diese Anwendung wurde mit AppBasis erzeugt.</p>
            </section>
            <p class="message message--error" id="app-message" role="alert" hidden></p>
            __TASK_PANEL__
          </main>
        </div>
      </div>
    </div>
    <script type="module" src="/app.js"></script>
  </body>
</html>
`;

const TASK_PANEL = `<section class="ab-card task-panel" id="tasks" aria-labelledby="tasks-title">
  <div class="section-heading">
    <div><p class="eyebrow">Aufgaben</p><h2 id="tasks-title">Aufgaben verwalten</h2></div>
    <span id="task-count">0 gesamt</span>
  </div>
  <form class="task-form" id="task-form">
    <label>Titel<input id="task-title" placeholder="Neue Aufgabe" required /></label>
    <label>Beschreibung <span>(optional)</span><textarea id="task-description" rows="2" placeholder="Kurze Notiz"></textarea></label>
    <button class="button button--primary" type="submit">Aufgabe anlegen</button>
  </form>
  <p class="message message--error" id="task-message" role="alert" hidden></p>
  <p class="empty-state" id="task-empty">Noch keine Aufgaben vorhanden.</p>
  <ul class="task-list" id="task-list" aria-live="polite"></ul>
</section>`;

const CSS_TEMPLATE = `:root {
  --app-accent: __ACCENT__;
  --app-accent-foreground: __ACCENT_FOREGROUND__;
  --page: #f8fafc;
  --card: #ffffff;
  --muted: #f1f5f9;
  --text: #0f172a;
  --text-secondary: #475569;
  --text-muted: #64748b;
  --border: #e2e8f0;
  --border-strong: #cbd5e1;
  --danger: #b91c1c;
  --danger-surface: #fee2e2;
  --success: #15803d;
  --success-surface: #dcfce7;
  --radius: 12px;
  --control-radius: 10px;
  --touch: 44px;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: var(--text);
  background: var(--page);
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; min-width: 320px; min-height: 100vh; background: var(--page); }
button, input, textarea { font: inherit; }
[hidden] { display: none !important; }
.app-shell { min-height: 100vh; }
.app-header {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 64px;
  padding: 0 16px;
  border-bottom: 1px solid var(--border);
  background: rgb(255 255 255 / 94%);
  backdrop-filter: blur(12px);
}
.app-brand { display: flex; align-items: center; gap: 10px; color: var(--text); text-decoration: none; min-height: var(--touch); }
.app-brand__mark {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border-radius: var(--control-radius);
  background: var(--app-accent);
  color: var(--app-accent-foreground);
  font-weight: 850;
}
.app-brand__copy { display: grid; line-height: 1.15; }
.app-brand__copy strong { font-size: 0.95rem; }
.app-brand__copy small { margin-top: 3px; color: var(--text-muted); font-size: 0.68rem; }
.app-badge {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 2px 9px;
  border-radius: 999px;
  background: var(--muted);
  color: var(--text-secondary);
  font-size: 0.72rem;
  font-weight: 700;
}
.gate-shell { display: grid; min-height: calc(100vh - 64px); padding: 24px 16px 48px; place-items: start center; }
.ab-card {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--card);
  box-shadow: 0 1px 2px rgb(15 23 42 / 0.04), 0 8px 24px rgb(15 23 42 / 0.04);
}
.gate-card { width: min(100%, 32rem); margin-top: clamp(16px, 8vh, 5rem); padding: 24px; }
.eyebrow {
  margin: 0 0 4px;
  color: var(--app-accent);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
h1, h2, p { margin-top: 0; }
h1 { margin-bottom: 12px; font-size: clamp(2rem, 10vw, 3.3rem); line-height: 1.04; letter-spacing: -0.04em; }
.summary { max-width: 38rem; margin-bottom: 0; color: var(--text-secondary); line-height: 1.6; }
.form-stack { display: grid; gap: 12px; margin-top: 20px; }
label { display: grid; gap: 5px; color: var(--text-secondary); font-size: 0.82rem; font-weight: 700; }
input, textarea {
  width: 100%;
  min-height: var(--touch);
  border: 1px solid var(--border-strong);
  border-radius: var(--control-radius);
  background: var(--card);
  color: var(--text);
  padding: 0 12px;
}
textarea { min-height: 88px; padding: 10px 12px; resize: vertical; }
input:focus-visible, textarea:focus-visible, button:focus-visible, a:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--app-accent) 35%, white);
  outline-offset: 2px;
}
.button {
  min-height: var(--touch);
  border: 1px solid transparent;
  border-radius: var(--control-radius);
  padding: 0 16px;
  cursor: pointer;
  font-weight: 700;
}
.button--primary { background: var(--app-accent); color: var(--app-accent-foreground); }
.button:disabled { cursor: wait; opacity: 0.55; }
.message { margin: 12px 0 0; padding: 12px; border-radius: var(--control-radius); font-size: 0.82rem; }
.message--error { color: var(--danger); background: var(--danger-surface); }
.app-body { min-height: calc(100vh - 64px); }
.app-nav {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 20;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  gap: 4px;
  padding: 8px 12px max(8px, env(safe-area-inset-bottom));
  border-top: 1px solid var(--border);
  background: var(--card);
}
.app-nav__link {
  display: inline-flex;
  min-height: var(--touch);
  align-items: center;
  justify-content: center;
  border-radius: var(--control-radius);
  color: var(--text-muted);
  font-size: 0.84rem;
  font-weight: 700;
  text-decoration: none;
}
.app-nav__link.is-active { color: var(--app-accent); background: color-mix(in srgb, var(--app-accent) 10%, white); }
.content { width: min(100%, 64rem); margin: 0 auto; padding: 24px 16px 104px; }
.hero { padding: 8px 0 24px; }
.task-panel { padding: 16px; }
.section-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
.section-heading h2 { margin-bottom: 0; font-size: 1.35rem; }
.section-heading > span { color: var(--text-muted); font-size: 0.8rem; }
.task-form { display: grid; gap: 12px; padding: 16px; border-radius: var(--radius); background: var(--muted); }
.task-form label span { color: var(--text-muted); font-weight: 500; }
.task-list { display: grid; gap: 4px; margin: 16px 0 0; padding: 0; list-style: none; }
.task-row { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 12px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border); }
.task-row:last-child { border-bottom: 0; }
.task-toggle {
  display: grid;
  width: var(--touch);
  height: var(--touch);
  place-items: center;
  border: 2px solid var(--border-strong);
  border-radius: 50%;
  background: var(--card);
  color: white;
  cursor: pointer;
}
.task-toggle.is-complete { border-color: var(--success); background: var(--success); }
.task-copy { min-width: 0; }
.task-copy strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.task-copy small { color: var(--text-muted); }
.empty-state, .empty-module { margin-top: 16px; padding: 16px; color: var(--text-secondary); background: var(--muted); border-radius: var(--control-radius); }
.empty-module { background: var(--card); }
.empty-module p { margin-bottom: 0; }
@media (min-width: 640px) {
  .app-header { padding-inline: 24px; }
  .gate-card { padding: 32px; }
  .content { padding: 32px 24px 104px; }
  .task-panel { padding: 24px; }
}
@media (min-width: 1024px) {
  .app-body { display: grid; grid-template-columns: 224px minmax(0, 1fr); }
  .app-nav {
    position: sticky;
    top: 64px;
    right: auto;
    bottom: auto;
    left: auto;
    align-self: start;
    display: flex;
    flex-direction: column;
    height: calc(100vh - 64px);
    padding: 24px 16px;
    border-top: 0;
    border-right: 1px solid var(--border);
  }
  .app-nav__link { justify-content: flex-start; padding: 0 12px; }
  .content { padding: 32px 32px 48px; }
  .task-form { grid-template-columns: 1fr 1.4fr auto; align-items: end; }
}
`;

const SCRIPT_TEMPLATE = `const HAS_TASKS = __HAS_TASKS__;

const elements = {
  loginView: document.querySelector("#login-view"),
  passwordView: document.querySelector("#password-view"),
  appView: document.querySelector("#app-view"),
  loginForm: document.querySelector("#login-form"),
  loginUsername: document.querySelector("#login-username"),
  loginPassword: document.querySelector("#login-password"),
  loginMessage: document.querySelector("#login-message"),
  passwordForm: document.querySelector("#password-form"),
  currentPassword: document.querySelector("#current-password"),
  newPassword: document.querySelector("#new-password"),
  confirmPassword: document.querySelector("#confirm-password"),
  passwordMessage: document.querySelector("#password-message"),
  welcomeEyebrow: document.querySelector("#welcome-eyebrow"),
  appMessage: document.querySelector("#app-message"),
  taskForm: document.querySelector("#task-form"),
  taskTitle: document.querySelector("#task-title"),
  taskDescription: document.querySelector("#task-description"),
  taskMessage: document.querySelector("#task-message"),
  taskList: document.querySelector("#task-list"),
  taskEmpty: document.querySelector("#task-empty"),
  taskCount: document.querySelector("#task-count"),
};

let session = null;
let busy = false;

elements.loginForm?.addEventListener("submit", handleLogin);
elements.passwordForm?.addEventListener("submit", handlePasswordChange);
elements.taskForm?.addEventListener("submit", handleCreateTask);
for (const link of document.querySelectorAll("[data-nav]")) {
  link.addEventListener("click", () => {
    for (const candidate of document.querySelectorAll("[data-nav]")) {
      candidate.classList.toggle("is-active", candidate === link);
    }
  });
}

void restoreSession();

async function restoreSession() {
  try {
    const restored = await requestJson("/api/auth/session");
    await acceptSession(restored);
  } catch (error) {
    if (error?.status === 401) {
      showView("login");
      return;
    }
    showView("login");
    showMessage(elements.loginMessage, "Die App ist derzeit nicht erreichbar.");
  }
}

async function handleLogin(event) {
  event.preventDefault();
  if (busy) return;
  setBusy(true);
  showMessage(elements.loginMessage, "");
  try {
    const next = await requestJson("/api/auth/sign-in", {
      method: "POST",
      body: JSON.stringify({
        username: elements.loginUsername?.value ?? "",
        password: elements.loginPassword?.value ?? "",
      }),
    });
    if (elements.loginPassword) elements.loginPassword.value = "";
    await acceptSession(next);
  } catch (error) {
    showMessage(
      elements.loginMessage,
      error?.status === 401
        ? "Benutzername oder Passwort ist nicht korrekt."
        : "Die Anmeldung ist fehlgeschlagen.",
    );
  } finally {
    setBusy(false);
  }
}

async function handlePasswordChange(event) {
  event.preventDefault();
  if (busy) return;
  const currentPassword = elements.currentPassword?.value ?? "";
  const newPassword = elements.newPassword?.value ?? "";
  const confirmation = elements.confirmPassword?.value ?? "";
  showMessage(elements.passwordMessage, "");
  if (newPassword.length === 0 || newPassword !== confirmation) {
    showMessage(elements.passwordMessage, "Die neuen Passwörter stimmen nicht überein.");
    return;
  }

  setBusy(true);
  try {
    const next = await requestJson("/api/auth/change-required-password", {
      method: "POST",
      body: JSON.stringify({
        currentPassword,
        newPassword,
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    if (elements.currentPassword) elements.currentPassword.value = "";
    if (elements.newPassword) elements.newPassword.value = "";
    if (elements.confirmPassword) elements.confirmPassword.value = "";
    await acceptSession(next);
  } catch {
    showMessage(elements.passwordMessage, "Das Passwort konnte nicht geändert werden.");
  } finally {
    setBusy(false);
  }
}

async function acceptSession(next) {
  session = next;
  if (
    next?.identity?.mustChangePassword === true ||
    next?.access === "password-change-required"
  ) {
    showView("password");
    return;
  }

  showView("app");
  if (elements.welcomeEyebrow) {
    const name = next?.identity?.displayName || next?.identity?.username || "Benutzer";
    elements.welcomeEyebrow.textContent = "Guten Tag, " + name;
  }
  if (HAS_TASKS) await loadTasks();
}

async function loadTasks() {
  try {
    const payload = await requestJson("/api/tasks");
    renderTasks(Array.isArray(payload?.tasks) ? payload.tasks : []);
  } catch (error) {
    showMessage(
      elements.taskMessage,
      error?.status === 403
        ? "Für die Aufgabenverwaltung fehlt die Berechtigung."
        : "Die Aufgaben konnten nicht geladen werden.",
    );
  }
}

async function handleCreateTask(event) {
  event.preventDefault();
  if (busy || !HAS_TASKS) return;
  const title = elements.taskTitle?.value.trim() ?? "";
  const description = elements.taskDescription?.value.trim() ?? "";
  if (title.length === 0) {
    showMessage(elements.taskMessage, "Bitte einen Titel eingeben.");
    elements.taskTitle?.focus();
    return;
  }

  setBusy(true);
  showMessage(elements.taskMessage, "");
  try {
    await requestJson("/api/tasks", {
      method: "POST",
      body: JSON.stringify({
        title,
        ...(description.length > 0 ? { description } : {}),
      }),
    });
    if (elements.taskTitle) elements.taskTitle.value = "";
    if (elements.taskDescription) elements.taskDescription.value = "";
    await loadTasks();
  } catch {
    showMessage(elements.taskMessage, "Die Aufgabe konnte nicht angelegt werden.");
  } finally {
    setBusy(false);
  }
}

async function toggleTask(id) {
  if (busy) return;
  setBusy(true);
  showMessage(elements.taskMessage, "");
  try {
    await requestJson("/api/tasks/" + encodeURIComponent(id) + "/toggle", {
      method: "POST",
    });
    await loadTasks();
  } catch {
    showMessage(elements.taskMessage, "Die Aufgabe konnte nicht aktualisiert werden.");
  } finally {
    setBusy(false);
  }
}

function renderTasks(tasks) {
  if (!elements.taskList) return;
  elements.taskList.replaceChildren();
  if (elements.taskEmpty) elements.taskEmpty.hidden = tasks.length > 0;
  if (elements.taskCount) elements.taskCount.textContent = tasks.length + " gesamt";

  for (const task of tasks) {
    const row = document.createElement("li");
    row.className = "task-row";

    const toggle = document.createElement("button");
    toggle.className = "task-toggle";
    toggle.type = "button";
    toggle.setAttribute(
      "aria-label",
      String(task?.title ?? "Aufgabe") +
        (task?.status === "completed" ? " als offen markieren" : " als erledigt markieren"),
    );
    if (task?.status === "completed") {
      toggle.classList.add("is-complete");
      toggle.textContent = "✓";
    }
    toggle.addEventListener("click", () => void toggleTask(String(task?.id ?? "")));

    const copy = document.createElement("div");
    copy.className = "task-copy";
    const title = document.createElement("strong");
    title.textContent = String(task?.title ?? "");
    const state = document.createElement("small");
    state.textContent = task?.status === "completed" ? "Erledigt" : "Offen";
    copy.append(title, state);
    row.append(toggle, copy);
    elements.taskList.append(row);
  }
}

function showView(view) {
  if (elements.loginView) elements.loginView.hidden = view !== "login";
  if (elements.passwordView) elements.passwordView.hidden = view !== "password";
  if (elements.appView) elements.appView.hidden = view !== "app";
}

function setBusy(next) {
  busy = next;
  for (const control of document.querySelectorAll("button, input, textarea")) {
    control.disabled = next;
  }
}

function showMessage(element, message) {
  if (!element) return;
  element.hidden = message.length === 0;
  element.textContent = message;
}

async function requestJson(path, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (init.body !== undefined) headers.set("content-type", "application/json");

  let response;
  try {
    response = await fetch(path, {
      ...init,
      headers,
      credentials: "same-origin",
    });
  } catch {
    const error = new Error("NETWORK_ERROR");
    error.status = 0;
    throw error;
  }

  let payload = null;
  try {
    if (response.headers.get("content-type")?.includes("application/json")) {
      payload = await response.json();
    }
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = new Error(payload?.error?.message || "HTTP_ERROR");
    error.status = response.status;
    error.code = payload?.error?.code || "HTTP_ERROR";
    throw error;
  }
  return payload;
}
`;

const UI_RESPONSE_SOURCE = `export function generatedUiResponse(request: Request): Response | null {
  const pathname = new URL(request.url).pathname;
  if (request.method !== "GET" && request.method !== "HEAD") return null;

  if (pathname === "/") {
    return staticResponse(
      GENERATED_APP_HTML,
      "text/html; charset=utf-8",
      request.method === "HEAD",
      true,
    );
  }
  if (pathname === "/app.css") {
    return staticResponse(
      GENERATED_APP_CSS,
      "text/css; charset=utf-8",
      request.method === "HEAD",
    );
  }
  if (pathname === "/app.js") {
    return staticResponse(
      GENERATED_APP_SCRIPT,
      "text/javascript; charset=utf-8",
      request.method === "HEAD",
    );
  }
  return null;
}

function staticResponse(
  body: string,
  contentType: string,
  headOnly: boolean,
  html = false,
): Response {
  const headers = new Headers({
    "cache-control": "no-store",
    "content-type": contentType,
    "x-content-type-options": "nosniff",
  });
  if (html) {
    headers.set("x-frame-options", "DENY");
    headers.set(
      "content-security-policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    );
  }
  return new Response(headOnly ? undefined : body, { status: 200, headers });
}`;

function requiredIdentifier(value, field) {
  if (typeof value !== "string" || !IDENTIFIER_PATTERN.test(value)) {
    throw new Error(`Generated UI ${field} must match ${IDENTIFIER_PATTERN.source}.`);
  }
  return value;
}

function requiredDisplayName(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 80 ||
    value.trim() !== value
  ) {
    throw new Error(
      "Generated UI displayName must be a non-empty trimmed string with at most 80 characters.",
    );
  }
  return value;
}

function requiredIdentifierList(value, field) {
  if (!Array.isArray(value)) {
    throw new Error(`Generated UI ${field}s must be an array.`);
  }
  return value.map((entry) => requiredIdentifier(entry, field));
}

function requiredBrandMark(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    throw new Error("Generated UI brandMark must be a trimmed one- or two-character string.");
  }
  const normalized = value.toLocaleUpperCase("de-DE");
  if (Array.from(value).length > 2 || Array.from(normalized).length > 2) {
    throw new Error("Generated UI brandMark must be a trimmed one- or two-character string.");
  }
  return normalized;
}

function requiredAccentColor(value) {
  if (typeof value !== "string" || !HEX_COLOR_PATTERN.test(value)) {
    throw new Error("Generated UI accentColor must be a six-digit hex color.");
  }
  return value.toLowerCase();
}

function defaultBrandMark(displayName) {
  return Array.from(displayName)[0].toLocaleUpperCase("de-DE");
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function foregroundForHex(hex) {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  const whiteContrast = contrastRatio(luminance(red, green, blue), 1);
  const blackContrast = contrastRatio(luminance(red, green, blue), 0);
  return whiteContrast >= blackContrast ? "#ffffff" : "#000000";
}

function luminance(red, green, blue) {
  const channels = [red, green, blue].map((value) => {
    const normalized = value / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(left, right) {
  const lighter = Math.max(left, right);
  const darker = Math.min(left, right);
  return (lighter + 0.05) / (darker + 0.05);
}
