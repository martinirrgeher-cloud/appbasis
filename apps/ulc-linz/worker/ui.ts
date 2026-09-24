export const ULC_LINZ_APP_HTML = `<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="color-scheme" content="light" />
    <title>ULC Linz</title>
    <link rel="stylesheet" href="/app.css" />
  </head>
  <body>
    <div class="app-shell">
      <header class="app-header">
        <a class="app-brand" href="/" aria-label="ULC Linz Startseite">
          <span class="app-brand__mark" aria-hidden="true">ULC</span>
          <span class="app-brand__copy"><strong>ULC Linz</strong><small>Intervall-Countdown</small></span>
        </a>
        <span class="app-badge">AppBasis</span>
      </header>

      <main class="gate-shell" id="login-view">
        <section class="card gate-card">
          <p class="eyebrow">Anmeldung</p>
          <h1>Willkommen.</h1>
          <p class="summary">Melde dich mit deinem ULC-Benutzer an.</p>
          <form class="form-stack" id="login-form">
            <label>Benutzername<input id="login-username" autocomplete="username" required /></label>
            <label>Passwort<input id="login-password" type="password" autocomplete="current-password" required /></label>
            <p class="message message--error" id="login-message" role="alert" hidden></p>
            <button class="button button--primary" type="submit">Anmelden</button>
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
            <p class="message message--error" id="password-message" role="alert" hidden></p>
            <button class="button button--primary" type="submit">Passwort ändern</button>
          </form>
        </section>
      </main>

      <div id="app-view" hidden>
        <nav class="app-nav" aria-label="Hauptnavigation">
          <a class="app-nav__link is-active" href="#countdown" data-nav="countdown">Countdown</a>
          <a class="app-nav__link" href="#settings" data-nav="settings">Einstellungen</a>
        </nav>

        <main class="content">
          <section class="hero">
            <p class="eyebrow" id="welcome-eyebrow">Angemeldet</p>
            <h1>Intervall-Countdown</h1>
            <p class="summary">Für Belastungs- und Pausenintervalle im Training.</p>
          </section>

          <p class="message message--error" id="app-message" role="alert" hidden></p>

          <section class="countdown-layout" id="countdown">
            <section class="timer-stage card" id="timer-stage" data-phase="idle" aria-live="polite">
              <div class="timer-topline">
                <span id="phase-label">Bereit</span>
                <span id="round-label">Übung 1 / 1</span>
              </div>
              <div class="timer-value" id="timer-value">00:30</div>
              <p class="timer-hint" id="timer-hint">Einstellungen prüfen und starten.</p>
            </section>

            <div class="timer-actions" aria-label="Countdown-Steuerung">
              <button class="button button--start" id="start-button" type="button">Start</button>
              <button class="button button--pause" id="pause-button" type="button" hidden>Pause</button>
              <button class="button button--reset" id="reset-button" type="button" disabled>Reset</button>
            </div>
          </section>

          <section class="card settings-panel" id="settings" aria-labelledby="settings-title">
            <div class="section-heading">
              <div>
                <p class="eyebrow">Einstellungen</p>
                <h2 id="settings-title">Training konfigurieren</h2>
              </div>
              <span id="total-duration">Gesamt: 0:00</span>
            </div>

            <form class="settings-grid" id="settings-form">
              <label>Übungen / Durchgänge
                <input id="rounds" type="number" min="1" max="1000" step="1" inputmode="numeric" required />
              </label>
              <label>Belastung (Sekunden)
                <input id="work-seconds" type="number" min="1" max="86400" step="1" inputmode="numeric" required />
              </label>
              <label>Pause (Sekunden)
                <input id="rest-seconds" type="number" min="0" max="86400" step="1" inputmode="numeric" required />
              </label>
              <label>Ansage Belastung alle … Sek.
                <input id="work-interval" type="number" min="0" max="86400" step="1" inputmode="numeric" required />
              </label>
              <label>Ansage Pause alle … Sek.
                <input id="rest-interval" type="number" min="0" max="86400" step="1" inputmode="numeric" required />
              </label>
              <label class="toggle-label">
                <input id="speech-enabled" type="checkbox" />
                <span>Sprachausgabe</span>
              </label>
            </form>
            <p class="settings-note">0 bei den Ansageintervallen bedeutet: nur die letzten fünf Sekunden werden einzeln angesagt.</p>
          </section>
        </main>
      </div>
    </div>
    <script type="module" src="/app.js"></script>
  </body>
</html>
`;

export const ULC_LINZ_APP_CSS = `:root {
  --accent: #1d4ed8;
  --accent-foreground: #ffffff;
  --page: #f8fafc;
  --card: #ffffff;
  --muted: #f1f5f9;
  --text: #0f172a;
  --secondary: #475569;
  --border: #e2e8f0;
  --border-strong: #cbd5e1;
  --danger: #b91c1c;
  --danger-surface: #fee2e2;
  --work: #b91c1c;
  --rest: #15803d;
  --prepare: #1d4ed8;
  --finished: #0f172a;
  --radius: 16px;
  --control-radius: 12px;
  --touch: 48px;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: var(--text);
  background: var(--page);
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; min-width: 320px; min-height: 100vh; background: var(--page); }
button, input { font: inherit; }
[hidden] { display: none !important; }
.app-shell { min-height: 100vh; }
.app-header {
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  min-height: 64px;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-bottom: 1px solid var(--border);
  background: rgb(255 255 255 / 94%);
  backdrop-filter: blur(12px);
}
.app-brand { display: flex; min-height: var(--touch); align-items: center; gap: 10px; color: var(--text); text-decoration: none; }
.app-brand__mark {
  display: grid;
  min-width: 44px;
  height: 36px;
  place-items: center;
  border-radius: 10px;
  background: var(--accent);
  color: white;
  font-size: .72rem;
  font-weight: 900;
}
.app-brand__copy { display: grid; line-height: 1.12; }
.app-brand__copy strong { font-size: .96rem; }
.app-brand__copy small { margin-top: 3px; color: #64748b; font-size: .68rem; }
.app-badge { padding: 5px 9px; border-radius: 999px; background: var(--muted); color: var(--secondary); font-size: .7rem; font-weight: 750; }
.card {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--card);
  box-shadow: 0 1px 2px rgb(15 23 42 / 4%), 0 10px 30px rgb(15 23 42 / 5%);
}
.gate-shell { display: grid; min-height: calc(100vh - 64px); place-items: start center; padding: 24px 16px 48px; }
.gate-card { width: min(100%, 32rem); margin-top: clamp(16px, 8vh, 5rem); padding: 24px; }
.eyebrow { margin: 0 0 5px; color: var(--accent); font-size: .72rem; font-weight: 850; letter-spacing: .09em; text-transform: uppercase; }
h1, h2, p { margin-top: 0; }
h1 { margin-bottom: 12px; font-size: clamp(2rem, 10vw, 3.2rem); line-height: 1.03; letter-spacing: -.04em; }
h2 { margin-bottom: 0; font-size: 1.3rem; }
.summary { margin-bottom: 0; color: var(--secondary); line-height: 1.55; }
.form-stack { display: grid; gap: 12px; margin-top: 20px; }
label { display: grid; gap: 5px; color: var(--secondary); font-size: .82rem; font-weight: 750; }
input {
  width: 100%;
  min-height: var(--touch);
  border: 1px solid var(--border-strong);
  border-radius: var(--control-radius);
  background: white;
  color: var(--text);
  padding: 0 12px;
  font-size: 16px;
}
input:focus-visible, button:focus-visible, a:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--accent) 35%, white);
  outline-offset: 2px;
}
.button {
  min-height: var(--touch);
  border: 1px solid transparent;
  border-radius: var(--control-radius);
  padding: 0 18px;
  cursor: pointer;
  font-weight: 800;
}
.button:disabled { cursor: not-allowed; opacity: .5; }
.button--primary { background: var(--accent); color: var(--accent-foreground); }
.message { margin: 12px 0 0; padding: 12px; border-radius: var(--control-radius); font-size: .84rem; }
.message--error { background: var(--danger-surface); color: var(--danger); }
.app-nav {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 25;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  padding: 8px 12px max(8px, env(safe-area-inset-bottom));
  border-top: 1px solid var(--border);
  background: white;
}
.app-nav__link {
  display: inline-flex;
  min-height: var(--touch);
  align-items: center;
  justify-content: center;
  border-radius: var(--control-radius);
  color: #64748b;
  font-size: .86rem;
  font-weight: 800;
  text-decoration: none;
}
.app-nav__link.is-active { background: #dbeafe; color: #1d4ed8; }
.content { width: min(100%, 52rem); margin: 0 auto; padding: 22px 16px 110px; }
.hero { padding: 6px 0 18px; }
.countdown-layout { display: grid; gap: 12px; }
.timer-stage {
  display: grid;
  min-height: min(58vh, 470px);
  align-content: center;
  padding: 24px;
  overflow: hidden;
  text-align: center;
  transition: background .2s ease, color .2s ease, border-color .2s ease;
}
.timer-stage[data-phase="prepare"] { border-color: var(--prepare); background: var(--prepare); color: white; }
.timer-stage[data-phase="work"] { border-color: var(--work); background: var(--work); color: white; }
.timer-stage[data-phase="rest"] { border-color: var(--rest); background: var(--rest); color: white; }
.timer-stage[data-phase="finished"] { border-color: var(--finished); background: var(--finished); color: white; }
.timer-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
  font-size: clamp(.86rem, 4vw, 1rem);
  font-weight: 850;
  letter-spacing: .02em;
}
.timer-value {
  font-variant-numeric: tabular-nums;
  font-size: clamp(5rem, 28vw, 10.5rem);
  font-weight: 900;
  line-height: .9;
  letter-spacing: -.07em;
}
.timer-hint { margin: 22px 0 0; color: currentColor; font-size: .92rem; opacity: .8; }
.timer-actions { display: grid; grid-template-columns: 1.3fr 1fr 1fr; gap: 8px; }
.timer-actions .button { min-height: 58px; font-size: 1rem; }
.button--start { background: #0f172a; color: white; }
.button--pause { border-color: #f59e0b; background: #fef3c7; color: #92400e; }
.button--reset { border-color: var(--border-strong); background: white; color: var(--secondary); }
.settings-panel { margin-top: 18px; padding: 18px; scroll-margin-top: 80px; }
.section-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
.section-heading > span { color: #64748b; font-size: .8rem; white-space: nowrap; }
.settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.toggle-label {
  display: flex;
  min-height: var(--touch);
  align-items: center;
  gap: 10px;
  grid-column: 1 / -1;
  border: 1px solid var(--border);
  border-radius: var(--control-radius);
  padding: 0 12px;
  background: var(--muted);
}
.toggle-label input { width: 20px; min-height: 20px; height: 20px; padding: 0; }
.settings-note { margin: 14px 0 0; color: #64748b; font-size: .78rem; line-height: 1.45; }
.settings-panel.is-locked { opacity: .68; }
@media (max-width: 480px) {
  .settings-grid { grid-template-columns: 1fr; }
  .toggle-label { grid-column: auto; }
  .timer-actions { grid-template-columns: 1fr 1fr; }
  .button--start { grid-column: 1 / -1; }
  .timer-stage { min-height: 48vh; }
}
@media (min-width: 640px) {
  .app-header { padding-inline: 24px; }
  .gate-card { padding: 32px; }
  .content { padding-inline: 24px; }
  .settings-panel { padding: 24px; }
}
`;

export const ULC_LINZ_APP_SCRIPT = `const SETTINGS_KEY = "ulc-linz.countdown.settings.v1";
const PREPARATION_SECONDS = 3;

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
  timerStage: document.querySelector("#timer-stage"),
  phaseLabel: document.querySelector("#phase-label"),
  roundLabel: document.querySelector("#round-label"),
  timerValue: document.querySelector("#timer-value"),
  timerHint: document.querySelector("#timer-hint"),
  startButton: document.querySelector("#start-button"),
  pauseButton: document.querySelector("#pause-button"),
  resetButton: document.querySelector("#reset-button"),
  settingsPanel: document.querySelector("#settings"),
  settingsForm: document.querySelector("#settings-form"),
  rounds: document.querySelector("#rounds"),
  workSeconds: document.querySelector("#work-seconds"),
  restSeconds: document.querySelector("#rest-seconds"),
  workInterval: document.querySelector("#work-interval"),
  restInterval: document.querySelector("#rest-interval"),
  speechEnabled: document.querySelector("#speech-enabled"),
  totalDuration: document.querySelector("#total-duration"),
};

const defaultSettings = {
  rounds: 8,
  workSeconds: 30,
  restSeconds: 15,
  workAnnouncementIntervalSeconds: 10,
  restAnnouncementIntervalSeconds: 5,
  speechEnabled: true,
};

let busy = false;
let moduleReady = false;
let plan = null;
let runMode = "idle";
let elapsedBeforeRunMs = 0;
let resumedAt = 0;
let timerHandle = null;
let cueIndex = 0;
let wakeLock = null;

applySettings(loadSettings());
renderIdle();

elements.loginForm?.addEventListener("submit", handleLogin);
elements.passwordForm?.addEventListener("submit", handlePasswordChange);
elements.startButton?.addEventListener("click", () => void startCountdown());
elements.pauseButton?.addEventListener("click", () => void togglePause());
elements.resetButton?.addEventListener("click", () => void resetCountdown());
elements.settingsForm?.addEventListener("input", handleSettingsInput);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && runMode === "running") {
    void acquireWakeLock();
  }
});
window.addEventListener("beforeunload", (event) => {
  if (runMode !== "running" && runMode !== "paused") return;
  event.preventDefault();
  event.returnValue = "";
});
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
  await bootstrapCountdown();
}

async function bootstrapCountdown() {
  moduleReady = false;
  refreshControls();
  showMessage(elements.appMessage, "");
  try {
    const payload = await requestJson("/api/modules/countdown");
    moduleReady =
      payload?.module?.moduleId === "countdown" &&
      payload?.module?.capability === "countdown:view" &&
      payload?.access?.view === true;
    if (!moduleReady) throw new Error("INVALID_COUNTDOWN_CONTRACT");
  } catch (error) {
    moduleReady = false;
    showMessage(
      elements.appMessage,
      error?.status === 403
        ? "Für den Countdown fehlt die Berechtigung."
        : "Der Countdown ist derzeit nicht verfügbar.",
    );
  }
  refreshControls();
}

function handleSettingsInput() {
  const settings = readSettings();
  if (settings !== null) {
    saveSettings(settings);
    renderEstimatedTotal(settings);
    if (runMode === "idle") renderIdle(settings);
  }
}

async function startCountdown() {
  if (!moduleReady || busy || runMode === "running" || runMode === "paused") return;
  const settings = readSettings();
  if (settings === null) {
    showMessage(elements.appMessage, "Bitte gültige Countdown-Einstellungen eingeben.");
    return;
  }

  setBusy(true);
  showMessage(elements.appMessage, "");
  try {
    saveSettings(settings);
    const nextPlan = await requestJson("/api/modules/countdown/plan", {
      method: "POST",
      body: JSON.stringify({
        rounds: settings.rounds,
        workSeconds: settings.workSeconds,
        restSeconds: settings.restSeconds,
        workAnnouncementIntervalSeconds: settings.workAnnouncementIntervalSeconds,
        restAnnouncementIntervalSeconds: settings.restAnnouncementIntervalSeconds,
      }),
    });
    if (
      nextPlan?.configuration?.totalSeconds <= 0 ||
      !Array.isArray(nextPlan?.timeline)
    ) {
      throw new Error("INVALID_COUNTDOWN_PLAN");
    }

    plan = nextPlan;
    runMode = "running";
    elapsedBeforeRunMs = 0;
    resumedAt = performance.now();
    cueIndex = 0;
    lockSettings(true);
    refreshControls();
    renderAt(0);
    processCues(0);
    startTicker();
    await acquireWakeLock();
  } catch (error) {
    plan = null;
    runMode = "idle";
    showMessage(
      elements.appMessage,
      error?.status === 400
        ? "Die Countdown-Einstellungen sind ungültig."
        : error?.status === 403
          ? "Für den Countdown fehlt die Berechtigung."
          : "Der Countdown konnte nicht gestartet werden.",
    );
    lockSettings(false);
    refreshControls();
  } finally {
    setBusy(false);
  }
}

function togglePause() {
  if (runMode === "running") {
    elapsedBeforeRunMs = currentElapsedMs();
    runMode = "paused";
    stopTicker();
    cancelSpeech();
    void releaseWakeLock();
    renderAt(elapsedBeforeRunMs / 1000);
    refreshControls();
    return;
  }
  if (runMode === "paused") {
    runMode = "running";
    resumedAt = performance.now();
    startTicker();
    void acquireWakeLock();
    refreshControls();
  }
}

function resetCountdown() {
  stopTicker();
  cancelSpeech();
  void releaseWakeLock();
  plan = null;
  runMode = "idle";
  elapsedBeforeRunMs = 0;
  resumedAt = 0;
  cueIndex = 0;
  lockSettings(false);
  renderIdle();
  refreshControls();
}

function startTicker() {
  stopTicker();
  timerHandle = window.setInterval(tick, 100);
  tick();
}

function stopTicker() {
  if (timerHandle !== null) {
    window.clearInterval(timerHandle);
    timerHandle = null;
  }
}

function tick() {
  if (runMode !== "running" || plan === null) return;
  const elapsedSeconds = currentElapsedMs() / 1000;
  processCues(elapsedSeconds);
  renderAt(elapsedSeconds);
  if (elapsedSeconds >= plan.configuration.totalSeconds) {
    finishCountdown();
  }
}

function finishCountdown() {
  if (plan === null) return;
  elapsedBeforeRunMs = plan.configuration.totalSeconds * 1000;
  runMode = "finished";
  stopTicker();
  renderAt(plan.configuration.totalSeconds);
  lockSettings(false);
  refreshControls();
  void releaseWakeLock();
}

function currentElapsedMs() {
  if (runMode !== "running") return elapsedBeforeRunMs;
  return elapsedBeforeRunMs + Math.max(0, performance.now() - resumedAt);
}

function processCues(elapsedSeconds) {
  if (plan === null) return;
  while (
    cueIndex < plan.timeline.length &&
    Number(plan.timeline[cueIndex]?.atSecond) <= elapsedSeconds + 0.05
  ) {
    const cue = plan.timeline[cueIndex];
    const cueTime = Number(cue?.atSecond);
    const lag = elapsedSeconds - cueTime;
    if (lag <= 0.8 || cue?.type === "finished") {
      speakCue(cue);
    }
    cueIndex += 1;
  }
}

function speakCue(cue) {
  if (!elements.speechEnabled?.checked || !("speechSynthesis" in window)) return;
  let text = "";
  if (cue?.type === "count") text = String(cue.value);
  if (cue?.type === "start") text = "Los";
  if (cue?.type === "remaining") text = String(cue.remainingSeconds);
  if (cue?.type === "finished") text = "Fertig";
  if (text.length === 0) return;

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "de-AT";
  utterance.rate = 1;
  const voice = preferredGermanVoice();
  if (voice !== null) utterance.voice = voice;
  window.speechSynthesis.speak(utterance);
}

function preferredGermanVoice() {
  if (!("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((voice) => voice.lang.toLowerCase() === "de-at") ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith("de")) ??
    null
  );
}

function cancelSpeech() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

function renderAt(elapsedSeconds) {
  if (plan === null) {
    renderIdle();
    return;
  }
  const snapshot = localSnapshot(plan.configuration, elapsedSeconds);
  if (elements.timerStage) elements.timerStage.dataset.phase = snapshot.phase;
  if (elements.phaseLabel) elements.phaseLabel.textContent = phaseLabel(snapshot.phase);
  if (elements.roundLabel) {
    elements.roundLabel.textContent =
      "Übung " + String(snapshot.round) + " / " + String(snapshot.rounds);
  }
  if (elements.timerValue) {
    elements.timerValue.textContent =
      snapshot.phase === "prepare"
        ? String(snapshot.remainingSeconds)
        : formatClock(snapshot.remainingSeconds);
  }
  if (elements.timerHint) elements.timerHint.textContent = phaseHint(snapshot.phase);
}

function localSnapshot(configuration, elapsedSeconds) {
  const elapsed = Math.max(0, Math.min(Number(elapsedSeconds), configuration.totalSeconds));
  if (elapsed >= configuration.totalSeconds) {
    return {
      phase: "finished",
      round: configuration.rounds,
      rounds: configuration.rounds,
      remainingSeconds: 0,
    };
  }
  if (elapsed < PREPARATION_SECONDS) {
    return {
      phase: "prepare",
      round: 1,
      rounds: configuration.rounds,
      remainingSeconds: Math.ceil(PREPARATION_SECONDS - elapsed),
    };
  }

  let cursor = PREPARATION_SECONDS;
  for (let round = 1; round <= configuration.rounds; round += 1) {
    const workEnd = cursor + configuration.workSeconds;
    if (elapsed < workEnd) {
      return {
        phase: "work",
        round,
        rounds: configuration.rounds,
        remainingSeconds: Math.ceil(workEnd - elapsed),
      };
    }
    cursor = workEnd;
    if (round === configuration.rounds) break;
    const restEnd = cursor + configuration.restSeconds;
    if (elapsed < restEnd) {
      return {
        phase: "rest",
        round,
        rounds: configuration.rounds,
        remainingSeconds: Math.ceil(restEnd - elapsed),
      };
    }
    cursor = restEnd;
  }

  return {
    phase: "finished",
    round: configuration.rounds,
    rounds: configuration.rounds,
    remainingSeconds: 0,
  };
}

function renderIdle(settings = readSettings() ?? defaultSettings) {
  if (elements.timerStage) elements.timerStage.dataset.phase = "idle";
  if (elements.phaseLabel) elements.phaseLabel.textContent = "Bereit";
  if (elements.roundLabel) {
    elements.roundLabel.textContent = "Übung 1 / " + String(settings.rounds);
  }
  if (elements.timerValue) elements.timerValue.textContent = formatClock(settings.workSeconds);
  if (elements.timerHint) elements.timerHint.textContent = "3, 2, 1 – Los";
  renderEstimatedTotal(settings);
}

function phaseLabel(phase) {
  if (phase === "prepare") return "Vorbereitung";
  if (phase === "work") return "Belastung";
  if (phase === "rest") return "Pause";
  if (phase === "finished") return "Fertig";
  return "Bereit";
}

function phaseHint(phase) {
  if (phase === "prepare") return "Gleich geht es los.";
  if (phase === "work") return "Belastung";
  if (phase === "rest") return "Erholen";
  if (phase === "finished") return "Training abgeschlossen.";
  return "Einstellungen prüfen und starten.";
}

function refreshControls() {
  if (elements.startButton) {
    elements.startButton.disabled =
      !moduleReady || busy || runMode === "running" || runMode === "paused";
    elements.startButton.textContent = runMode === "finished" ? "Neu starten" : "Start";
  }
  if (elements.pauseButton) {
    elements.pauseButton.hidden = runMode !== "running" && runMode !== "paused";
    elements.pauseButton.textContent = runMode === "paused" ? "Weiter" : "Pause";
    elements.pauseButton.disabled = busy;
  }
  if (elements.resetButton) {
    elements.resetButton.disabled = busy || runMode === "idle";
  }
}

function lockSettings(locked) {
  elements.settingsPanel?.classList.toggle("is-locked", locked);
  for (const control of elements.settingsForm?.querySelectorAll("input") ?? []) {
    control.disabled = locked;
  }
}

function readSettings() {
  const settings = {
    rounds: integerValue(elements.rounds),
    workSeconds: integerValue(elements.workSeconds),
    restSeconds: integerValue(elements.restSeconds),
    workAnnouncementIntervalSeconds: integerValue(elements.workInterval),
    restAnnouncementIntervalSeconds: integerValue(elements.restInterval),
    speechEnabled: elements.speechEnabled?.checked === true,
  };
  if (
    settings.rounds === null ||
    settings.workSeconds === null ||
    settings.restSeconds === null ||
    settings.workAnnouncementIntervalSeconds === null ||
    settings.restAnnouncementIntervalSeconds === null ||
    settings.rounds < 1 ||
    settings.workSeconds < 1 ||
    settings.restSeconds < 0 ||
    settings.workAnnouncementIntervalSeconds < 0 ||
    settings.restAnnouncementIntervalSeconds < 0
  ) {
    return null;
  }
  return settings;
}

function integerValue(element) {
  const value = Number(element?.value);
  return Number.isSafeInteger(value) ? value : null;
}

function applySettings(settings) {
  if (elements.rounds) elements.rounds.value = String(settings.rounds);
  if (elements.workSeconds) elements.workSeconds.value = String(settings.workSeconds);
  if (elements.restSeconds) elements.restSeconds.value = String(settings.restSeconds);
  if (elements.workInterval) {
    elements.workInterval.value = String(settings.workAnnouncementIntervalSeconds);
  }
  if (elements.restInterval) {
    elements.restInterval.value = String(settings.restAnnouncementIntervalSeconds);
  }
  if (elements.speechEnabled) elements.speechEnabled.checked = settings.speechEnabled;
  renderEstimatedTotal(settings);
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw === null) return defaultSettings;
    const parsed = JSON.parse(raw);
    const candidate = {
      rounds: Number(parsed?.rounds),
      workSeconds: Number(parsed?.workSeconds),
      restSeconds: Number(parsed?.restSeconds),
      workAnnouncementIntervalSeconds: Number(parsed?.workAnnouncementIntervalSeconds),
      restAnnouncementIntervalSeconds: Number(parsed?.restAnnouncementIntervalSeconds),
      speechEnabled: parsed?.speechEnabled !== false,
    };
    if (
      Number.isSafeInteger(candidate.rounds) &&
      candidate.rounds >= 1 &&
      Number.isSafeInteger(candidate.workSeconds) &&
      candidate.workSeconds >= 1 &&
      Number.isSafeInteger(candidate.restSeconds) &&
      candidate.restSeconds >= 0 &&
      Number.isSafeInteger(candidate.workAnnouncementIntervalSeconds) &&
      candidate.workAnnouncementIntervalSeconds >= 0 &&
      Number.isSafeInteger(candidate.restAnnouncementIntervalSeconds) &&
      candidate.restAnnouncementIntervalSeconds >= 0
    ) {
      return candidate;
    }
  } catch {
    // Local settings are optional; fall back to safe defaults.
  }
  return defaultSettings;
}

function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // The countdown must remain usable if local storage is unavailable.
  }
}

function renderEstimatedTotal(settings) {
  const total =
    PREPARATION_SECONDS +
    settings.rounds * settings.workSeconds +
    Math.max(0, settings.rounds - 1) * settings.restSeconds;
  if (elements.totalDuration) {
    elements.totalDuration.textContent = "Gesamt: " + formatDuration(total);
  }
}

function formatClock(seconds) {
  const value = Math.max(0, Math.ceil(Number(seconds) || 0));
  const minutes = Math.floor(value / 60);
  const remainder = value % 60;
  return String(minutes).padStart(2, "0") + ":" + String(remainder).padStart(2, "0");
}

function formatDuration(seconds) {
  const value = Math.max(0, Math.ceil(Number(seconds) || 0));
  const minutes = Math.floor(value / 60);
  const remainder = value % 60;
  return String(minutes) + ":" + String(remainder).padStart(2, "0");
}

async function acquireWakeLock() {
  if (runMode !== "running" || !("wakeLock" in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
  } catch {
    wakeLock = null;
  }
}

async function releaseWakeLock() {
  const current = wakeLock;
  wakeLock = null;
  try {
    await current?.release();
  } catch {
    // Wake lock release is best effort.
  }
}

function showView(view) {
  if (elements.loginView) elements.loginView.hidden = view !== "login";
  if (elements.passwordView) elements.passwordView.hidden = view !== "password";
  if (elements.appView) elements.appView.hidden = view !== "app";
}

function setBusy(next) {
  busy = next;
  for (const control of document.querySelectorAll("#login-view button, #login-view input, #password-view button, #password-view input")) {
    control.disabled = next;
  }
  refreshControls();
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
      ULC_LINZ_APP_HTML,
      "text/html; charset=utf-8",
      request.method === "HEAD",
      true,
    );
  }
  if (pathname === "/app.css") {
    return staticResponse(
      ULC_LINZ_APP_CSS,
      "text/css; charset=utf-8",
      request.method === "HEAD",
    );
  }
  if (pathname === "/app.js") {
    return staticResponse(
      ULC_LINZ_APP_SCRIPT,
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
