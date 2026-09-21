export const ULC_LINZ_HTML = `<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light" />
    <title>ULC Linz</title>
    <link rel="stylesheet" href="/app.css" />
  </head>
  <body>
    <div class="app-shell">
      <header class="app-header">
        <a class="brand" href="/" aria-label="ULC Linz Startseite">
          <span class="brand-mark" aria-hidden="true">ULC</span>
          <span><strong>ULC Linz</strong><small>Vereins-App</small></span>
        </a>
        <span class="app-badge">AppBasis</span>
      </header>

      <main class="gate-shell" id="login-view">
        <section class="card gate-card">
          <p class="eyebrow">Anmeldung</p>
          <h1>Willkommen.</h1>
          <p class="summary">Melde dich mit deinem ULC-Benutzerkonto an.</p>
          <form class="form-stack" id="login-form">
            <label>Benutzername<input id="login-username" autocomplete="username" required /></label>
            <label>Passwort<input id="login-password" type="password" autocomplete="current-password" required /></label>
            <p class="message message-error" id="login-message" role="alert" hidden></p>
            <button class="button button-primary" type="submit">Anmelden</button>
          </form>
        </section>
      </main>

      <main class="gate-shell" id="password-view" hidden>
        <section class="card gate-card">
          <p class="eyebrow">Passwortwechsel erforderlich</p>
          <h1>Neues Passwort festlegen.</h1>
          <p class="summary">Das temporäre Passwort muss vor der Nutzung ersetzt werden.</p>
          <form class="form-stack" id="password-form">
            <label>Aktuelles Passwort<input id="current-password" type="password" autocomplete="current-password" required /></label>
            <label>Neues Passwort<input id="new-password" type="password" autocomplete="new-password" required /></label>
            <label>Neues Passwort wiederholen<input id="confirm-password" type="password" autocomplete="new-password" required /></label>
            <p class="message message-error" id="password-message" role="alert" hidden></p>
            <button class="button button-primary" type="submit">Passwort ändern</button>
          </form>
        </section>
      </main>

      <main class="content" id="app-view" hidden>
        <section class="hero">
          <p class="eyebrow" id="welcome-eyebrow">Angemeldet</p>
          <h1>Training im Takt.</h1>
          <p class="summary">Der erste AppBasis-Fachbereich der ULC Vereins-App läuft direkt im Browser und speichert keine Countdown-Daten.</p>
        </section>

        <p class="message message-error" id="app-message" role="alert" hidden></p>

        <section class="card denied-card" id="denied-panel" hidden>
          <p class="eyebrow">Kein Zugriff</p>
          <h2>Intervall-Countdown nicht freigeschaltet</h2>
          <p>Für dein Benutzerkonto fehlt die Berechtigung für dieses Werkzeug.</p>
        </section>

        <section class="card countdown-card" id="countdown-panel" hidden aria-labelledby="countdown-title">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Nützliches</p>
              <h2 id="countdown-title">Intervall-Countdown</h2>
            </div>
            <span class="status-pill" id="timer-status">Bereit</span>
          </div>

          <form class="settings-grid" id="countdown-form">
            <label>Belastung
              <span class="input-unit"><input id="work-seconds" type="number" inputmode="numeric" min="5" max="600" value="30" required /><span>Sek.</span></span>
            </label>
            <label>Pause
              <span class="input-unit"><input id="rest-seconds" type="number" inputmode="numeric" min="0" max="600" value="15" required /><span>Sek.</span></span>
            </label>
            <label>Übungen
              <span class="input-unit"><input id="exercise-count" type="number" inputmode="numeric" min="1" max="99" value="10" required /><span>×</span></span>
            </label>
          </form>

          <div class="timer-stage" aria-live="polite">
            <p class="phase-label" id="phase-label">Bereit</p>
            <div class="timer-value" id="timer-value">30</div>
            <p class="exercise-progress" id="exercise-progress">Übung 1 von 10</p>
          </div>

          <div class="timer-actions">
            <button class="button button-primary" id="start-button" type="button">Start</button>
            <button class="button button-secondary" id="pause-button" type="button" disabled>Pause</button>
            <button class="button button-danger" id="stop-button" type="button" disabled>Beenden</button>
          </div>
          <p class="message message-error" id="timer-message" role="alert" hidden></p>
        </section>
      </main>
    </div>
    <script type="module" src="/app.js"></script>
  </body>
</html>
`;

export const ULC_LINZ_CSS = `:root {
  --accent: #e30613;
  --accent-foreground: #ffffff;
  --page: #f6f7f9;
  --card: #ffffff;
  --muted: #eef1f4;
  --text: #17202a;
  --text-secondary: #52606d;
  --border: #d9dee5;
  --danger: #b42318;
  --danger-surface: #fee4e2;
  --success: #18794e;
  --radius: 16px;
  --control-radius: 11px;
  --touch: 44px;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: var(--text);
  background: var(--page);
}
* { box-sizing: border-box; }
body { margin: 0; min-width: 320px; min-height: 100vh; background: var(--page); }
button, input { font: inherit; }
[hidden] { display: none !important; }
.app-shell { min-height: 100vh; }
.app-header {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  min-height: 64px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 16px;
  border-bottom: 1px solid var(--border);
  background: rgb(255 255 255 / 94%);
  backdrop-filter: blur(12px);
}
.brand { display: flex; min-height: var(--touch); align-items: center; gap: 10px; color: var(--text); text-decoration: none; }
.brand > span:last-child { display: grid; line-height: 1.1; }
.brand strong { font-size: .95rem; }
.brand small { margin-top: 4px; color: var(--text-secondary); font-size: .68rem; }
.brand-mark {
  display: grid;
  width: 42px;
  height: 34px;
  place-items: center;
  border-radius: 8px;
  background: var(--accent);
  color: white;
  font-size: .72rem;
  font-weight: 900;
  letter-spacing: .04em;
}
.app-badge { padding: 5px 10px; border-radius: 999px; background: var(--muted); color: var(--text-secondary); font-size: .72rem; font-weight: 750; }
.gate-shell { display: grid; min-height: calc(100vh - 64px); place-items: start center; padding: 24px 16px 48px; }
.card { border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); box-shadow: 0 8px 28px rgb(24 32 43 / 6%); }
.gate-card { width: min(100%, 32rem); margin-top: clamp(16px, 8vh, 5rem); padding: 24px; }
.eyebrow { margin: 0 0 5px; color: var(--accent); font-size: .72rem; font-weight: 850; letter-spacing: .09em; text-transform: uppercase; }
h1, h2, p { margin-top: 0; }
h1 { margin-bottom: 12px; font-size: clamp(2rem, 10vw, 3.2rem); line-height: 1.03; letter-spacing: -.035em; }
h2 { margin-bottom: 8px; }
.summary { margin-bottom: 0; color: var(--text-secondary); line-height: 1.55; }
.form-stack { display: grid; gap: 12px; margin-top: 22px; }
label { display: grid; gap: 6px; color: var(--text-secondary); font-size: .82rem; font-weight: 750; }
input {
  width: 100%;
  min-height: var(--touch);
  border: 1px solid var(--border);
  border-radius: var(--control-radius);
  background: white;
  color: var(--text);
  padding: 0 12px;
}
input:focus-visible, button:focus-visible, a:focus-visible { outline: 3px solid rgb(227 6 19 / 24%); outline-offset: 2px; }
.button {
  min-height: var(--touch);
  border: 1px solid transparent;
  border-radius: var(--control-radius);
  padding: 0 17px;
  cursor: pointer;
  font-weight: 800;
}
.button:disabled { cursor: not-allowed; opacity: .45; }
.button-primary { background: var(--accent); color: var(--accent-foreground); }
.button-secondary { border-color: var(--border); background: white; color: var(--text); }
.button-danger { border-color: #f0b8b5; background: #fff5f4; color: var(--danger); }
.message { margin: 14px 0 0; padding: 12px; border-radius: var(--control-radius); }
.message-error { background: var(--danger-surface); color: var(--danger); }
.content { width: min(100%, 54rem); margin: 0 auto; padding: 28px 16px 64px; }
.hero { padding: 8px 0 24px; }
.countdown-card, .denied-card { padding: 18px; }
.denied-card p:last-child { margin-bottom: 0; color: var(--text-secondary); }
.section-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.section-heading h2 { margin-bottom: 0; }
.status-pill { flex: 0 0 auto; padding: 6px 10px; border-radius: 999px; background: var(--muted); color: var(--text-secondary); font-size: .74rem; font-weight: 800; }
.settings-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 20px; }
.input-unit { position: relative; display: block; }
.input-unit input { padding-right: 44px; }
.input-unit > span { position: absolute; top: 50%; right: 10px; transform: translateY(-50%); color: var(--text-secondary); font-size: .72rem; pointer-events: none; }
.timer-stage { display: grid; place-items: center; min-height: 300px; margin: 20px 0; border-radius: var(--radius); background: linear-gradient(155deg, #fff, #f1f3f6); text-align: center; }
.phase-label { margin-bottom: 0; color: var(--accent); font-size: .86rem; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
.timer-value { font-variant-numeric: tabular-nums; font-size: clamp(5.4rem, 28vw, 9rem); font-weight: 900; line-height: .95; letter-spacing: -.06em; }
.exercise-progress { margin: 0; color: var(--text-secondary); font-weight: 750; }
.timer-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.timer-actions .button-danger { grid-column: 1 / -1; }
@media (max-width: 440px) {
  .settings-grid { grid-template-columns: 1fr 1fr; }
  .settings-grid label:last-child { grid-column: 1 / -1; }
}
@media (min-width: 640px) {
  .app-header { padding-inline: 24px; }
  .gate-card { padding: 32px; }
  .content { padding: 36px 24px 72px; }
  .countdown-card, .denied-card { padding: 28px; }
  .timer-actions { grid-template-columns: 1.2fr 1fr 1fr; }
  .timer-actions .button-danger { grid-column: auto; }
}
`;

export const ULC_LINZ_SCRIPT = `const elements = {
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
  deniedPanel: document.querySelector("#denied-panel"),
  countdownPanel: document.querySelector("#countdown-panel"),
  form: document.querySelector("#countdown-form"),
  workSeconds: document.querySelector("#work-seconds"),
  restSeconds: document.querySelector("#rest-seconds"),
  exerciseCount: document.querySelector("#exercise-count"),
  timerStatus: document.querySelector("#timer-status"),
  phaseLabel: document.querySelector("#phase-label"),
  timerValue: document.querySelector("#timer-value"),
  exerciseProgress: document.querySelector("#exercise-progress"),
  startButton: document.querySelector("#start-button"),
  pauseButton: document.querySelector("#pause-button"),
  stopButton: document.querySelector("#stop-button"),
  timerMessage: document.querySelector("#timer-message"),
};

let authBusy = false;
let timerId = null;
let wakeLock = null;
let timerState = createIdleTimerState();

elements.loginForm?.addEventListener("submit", handleLogin);
elements.passwordForm?.addEventListener("submit", handlePasswordChange);
elements.startButton?.addEventListener("click", startTimer);
elements.pauseButton?.addEventListener("click", togglePause);
elements.stopButton?.addEventListener("click", stopTimer);
for (const input of [elements.workSeconds, elements.restSeconds, elements.exerciseCount]) {
  input?.addEventListener("change", refreshIdlePreview);
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && timerState.running) void acquireWakeLock();
});

void restoreSession();

function createIdleTimerState() {
  return {
    phase: "idle",
    currentExercise: 1,
    totalExercises: 10,
    workMs: 30000,
    restMs: 15000,
    phaseEndsAt: 0,
    remainingMs: 30000,
    running: false,
  };
}

async function restoreSession() {
  try {
    const restored = await requestJson("/api/auth/session");
    await acceptSession(restored);
  } catch (error) {
    showView("login");
    if (error?.status !== 401) {
      showMessage(elements.loginMessage, "Die App ist derzeit nicht erreichbar.");
    }
  }
}

async function handleLogin(event) {
  event.preventDefault();
  if (authBusy) return;
  setAuthBusy(true);
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
    setAuthBusy(false);
  }
}

async function handlePasswordChange(event) {
  event.preventDefault();
  if (authBusy) return;
  const currentPassword = elements.currentPassword?.value ?? "";
  const newPassword = elements.newPassword?.value ?? "";
  const confirmation = elements.confirmPassword?.value ?? "";
  showMessage(elements.passwordMessage, "");
  if (newPassword.length === 0 || newPassword !== confirmation) {
    showMessage(elements.passwordMessage, "Die neuen Passwörter stimmen nicht überein.");
    return;
  }

  setAuthBusy(true);
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
    setAuthBusy(false);
  }
}

async function acceptSession(next) {
  if (
    next?.identity?.mustChangePassword === true ||
    next?.access === "password-change-required"
  ) {
    showView("password");
    return;
  }

  showView("app");
  const name = next?.identity?.displayName || next?.identity?.username || "Benutzer";
  if (elements.welcomeEyebrow) elements.welcomeEyebrow.textContent = "Guten Tag, " + name;
  showMessage(elements.appMessage, "");
  try {
    await requestJson("/api/modules/countdown/access");
    if (elements.deniedPanel) elements.deniedPanel.hidden = true;
    if (elements.countdownPanel) elements.countdownPanel.hidden = false;
    refreshIdlePreview();
  } catch (error) {
    if (elements.countdownPanel) elements.countdownPanel.hidden = true;
    if (elements.deniedPanel) elements.deniedPanel.hidden = error?.status === 403 ? false : true;
    if (error?.status !== 403) {
      showMessage(elements.appMessage, "Der Countdown-Zugriff konnte nicht geprüft werden.");
    }
  }
}

function startTimer() {
  const config = readTimerConfig();
  if (config === null) return;

  clearTimerInterval();
  timerState = {
    phase: "work",
    currentExercise: 1,
    totalExercises: config.exercises,
    workMs: config.workSeconds * 1000,
    restMs: config.restSeconds * 1000,
    phaseEndsAt: Date.now() + config.workSeconds * 1000,
    remainingMs: config.workSeconds * 1000,
    running: true,
  };
  setSettingsLocked(true);
  showMessage(elements.timerMessage, "");
  startTimerInterval();
  void acquireWakeLock();
  renderTimer();
}

function togglePause() {
  if (timerState.phase === "idle" || timerState.phase === "done") return;
  if (timerState.running) {
    timerState.remainingMs = Math.max(0, timerState.phaseEndsAt - Date.now());
    timerState.running = false;
    clearTimerInterval();
    void releaseWakeLock();
  } else {
    timerState.phaseEndsAt = Date.now() + timerState.remainingMs;
    timerState.running = true;
    startTimerInterval();
    void acquireWakeLock();
  }
  renderTimer();
}

function stopTimer() {
  clearTimerInterval();
  void releaseWakeLock();
  timerState = createIdleTimerState();
  setSettingsLocked(false);
  refreshIdlePreview();
}

function startTimerInterval() {
  clearTimerInterval();
  timerId = window.setInterval(updateTimer, 200);
}

function clearTimerInterval() {
  if (timerId !== null) {
    window.clearInterval(timerId);
    timerId = null;
  }
}

function updateTimer() {
  if (!timerState.running) return;
  timerState.remainingMs = Math.max(0, timerState.phaseEndsAt - Date.now());
  if (timerState.remainingMs > 0) {
    renderTimer();
    return;
  }
  advanceTimerPhase();
}

function advanceTimerPhase() {
  if (timerState.phase === "work") {
    if (timerState.currentExercise >= timerState.totalExercises) {
      finishTimer();
      return;
    }
    if (timerState.restMs > 0) {
      beginPhase("rest", timerState.restMs);
      return;
    }
    timerState.currentExercise += 1;
    beginPhase("work", timerState.workMs);
    return;
  }

  if (timerState.phase === "rest") {
    timerState.currentExercise += 1;
    beginPhase("work", timerState.workMs);
  }
}

function beginPhase(phase, durationMs) {
  timerState.phase = phase;
  timerState.remainingMs = durationMs;
  timerState.phaseEndsAt = Date.now() + durationMs;
  timerState.running = true;
  renderTimer();
}

function finishTimer() {
  clearTimerInterval();
  void releaseWakeLock();
  timerState.phase = "done";
  timerState.remainingMs = 0;
  timerState.running = false;
  setSettingsLocked(false);
  renderTimer();
}

function readTimerConfig() {
  const workSeconds = Number(elements.workSeconds?.value ?? "");
  const restSeconds = Number(elements.restSeconds?.value ?? "");
  const exercises = Number(elements.exerciseCount?.value ?? "");
  if (
    !Number.isInteger(workSeconds) ||
    workSeconds < 5 ||
    workSeconds > 600 ||
    !Number.isInteger(restSeconds) ||
    restSeconds < 0 ||
    restSeconds > 600 ||
    !Number.isInteger(exercises) ||
    exercises < 1 ||
    exercises > 99
  ) {
    showMessage(elements.timerMessage, "Bitte gültige Werte für Belastung, Pause und Übungen eingeben.");
    return null;
  }
  return { workSeconds, restSeconds, exercises };
}

function refreshIdlePreview() {
  if (timerState.phase !== "idle") return;
  const workSeconds = Number(elements.workSeconds?.value ?? 30);
  const exercises = Number(elements.exerciseCount?.value ?? 10);
  if (elements.timerValue) elements.timerValue.textContent = String(Number.isFinite(workSeconds) ? workSeconds : 30);
  if (elements.exerciseProgress) elements.exerciseProgress.textContent = "Übung 1 von " + String(Number.isFinite(exercises) ? exercises : 10);
  if (elements.phaseLabel) elements.phaseLabel.textContent = "Bereit";
  if (elements.timerStatus) elements.timerStatus.textContent = "Bereit";
}

function renderTimer() {
  const seconds = Math.max(0, Math.ceil(timerState.remainingMs / 1000));
  if (elements.timerValue) elements.timerValue.textContent = String(seconds);
  if (elements.exerciseProgress) {
    elements.exerciseProgress.textContent =
      "Übung " + String(timerState.currentExercise) + " von " + String(timerState.totalExercises);
  }

  const labels = {
    idle: "Bereit",
    work: timerState.running ? "Belastung" : "Pausiert",
    rest: timerState.running ? "Pause" : "Pausiert",
    done: "Fertig",
  };
  const label = labels[timerState.phase] ?? "Bereit";
  if (elements.phaseLabel) elements.phaseLabel.textContent = label;
  if (elements.timerStatus) elements.timerStatus.textContent = label;
  if (elements.pauseButton) {
    elements.pauseButton.disabled = timerState.phase === "idle" || timerState.phase === "done";
    elements.pauseButton.textContent = timerState.running ? "Pause" : "Fortsetzen";
  }
  if (elements.stopButton) {
    elements.stopButton.disabled = timerState.phase === "idle";
  }
  if (elements.startButton) {
    elements.startButton.textContent = timerState.phase === "idle" || timerState.phase === "done" ? "Start" : "Neu starten";
  }
}

function setSettingsLocked(locked) {
  for (const input of [elements.workSeconds, elements.restSeconds, elements.exerciseCount]) {
    if (input) input.disabled = locked;
  }
}

async function acquireWakeLock() {
  if (!("wakeLock" in navigator) || !timerState.running) return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
  } catch {
    wakeLock = null;
  }
}

async function releaseWakeLock() {
  if (wakeLock === null) return;
  try {
    await wakeLock.release();
  } catch {
    // Wake Lock is an optional browser enhancement.
  } finally {
    wakeLock = null;
  }
}

function showView(view) {
  if (elements.loginView) elements.loginView.hidden = view !== "login";
  if (elements.passwordView) elements.passwordView.hidden = view !== "password";
  if (elements.appView) elements.appView.hidden = view !== "app";
}

function setAuthBusy(next) {
  authBusy = next;
  for (const control of document.querySelectorAll("#login-view button, #login-view input, #password-view button, #password-view input")) {
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

export function generatedUiResponse(request: Request): Response | null {
  const pathname = new URL(request.url).pathname;
  if (request.method !== "GET" && request.method !== "HEAD") return null;

  if (pathname === "/") {
    return staticResponse(
      ULC_LINZ_HTML,
      "text/html; charset=utf-8",
      request.method === "HEAD",
      true,
    );
  }
  if (pathname === "/app.css") {
    return staticResponse(
      ULC_LINZ_CSS,
      "text/css; charset=utf-8",
      request.method === "HEAD",
    );
  }
  if (pathname === "/app.js") {
    return staticResponse(
      ULC_LINZ_SCRIPT,
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
}
