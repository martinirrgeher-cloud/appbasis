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
          <span class="app-brand__copy"><strong>ULC Linz</strong><small>Vereins-App</small></span>
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
          <button class="app-nav__link is-active" type="button" data-nav-view="home">Start</button>
          <button class="app-nav__link" type="button" data-nav-view="masterdata" disabled>Stammdaten</button>
          <button class="app-nav__link" type="button" data-nav-view="countdown" disabled>Countdown</button>
          <button class="app-nav__link" type="button" data-nav-view="settings" disabled>Einstellungen</button>
        </nav>

        <main class="content">
          <section class="app-section" data-app-section="home" id="start">
            <section class="hero">
              <p class="eyebrow" id="welcome-eyebrow">Angemeldet</p>
              <h1>ULC Linz</h1>
              <p class="summary">Dein Vereinsbereich für Training und Organisation.</p>
            </section>

            <section class="dashboard-grid" aria-label="ULC Linz Funktionen">
              <article class="card dashboard-card dashboard-card--primary">
                <div>
                  <p class="eyebrow">Organisation</p>
                  <h2>Stammdaten</h2>
                  <p>Athleten, Trainer und Trainingsgruppen zentral verwalten.</p>
                </div>
                <button class="button button--primary dashboard-action" id="masterdata-quick-action" type="button" data-open-view="masterdata" disabled>Stammdaten öffnen</button>
                <small id="masterdata-access-label">Berechtigung wird geprüft …</small>
              </article>

              <article class="card dashboard-card">
                <div>
                  <p class="eyebrow">Nützliches</p>
                  <h2>Intervall-Countdown</h2>
                  <p>Belastungs- und Pausenintervalle direkt am Smartphone steuern.</p>
                </div>
                <button class="button button--primary dashboard-action" id="countdown-quick-action" type="button" data-open-view="countdown" disabled>Countdown öffnen</button>
                <small id="countdown-access-label">Berechtigung wird geprüft …</small>
              </article>

              <article class="card dashboard-card">
                <div>
                  <p class="eyebrow">Vereins-App</p>
                  <h2>Weitere Bereiche folgen</h2>
                  <p>Die bestehenden ULC-Funktionen werden schrittweise und kontrolliert in AppBasis übernommen.</p>
                </div>
                <span class="dashboard-status">Stammdaten · E3B</span>
              </article>
            </section>
          </section>

          <section class="app-section" data-app-section="masterdata" id="masterdata" hidden>
            <section class="hero">
              <p class="eyebrow">Organisation</p>
              <h1>Stammdaten</h1>
              <p class="summary">Athleten, Trainer und Trainingsgruppen deiner Organisation.</p>
            </section>

            <p class="message message--error" id="masterdata-message" role="alert" hidden></p>

            <div class="masterdata-tabs" role="tablist" aria-label="Stammdatenbereiche">
              <button class="masterdata-tab is-active" type="button" role="tab" aria-selected="true" data-masterdata-tab="athletes">Athleten</button>
              <button class="masterdata-tab" type="button" role="tab" aria-selected="false" data-masterdata-tab="trainers">Trainer</button>
              <button class="masterdata-tab" type="button" role="tab" aria-selected="false" data-masterdata-tab="groups">Gruppen</button>
            </div>

            <section class="masterdata-panel" data-masterdata-panel="athletes">
              <div class="section-heading">
                <div><p class="eyebrow">Athleten</p><h2>Aktuelle Athleten</h2></div>
                <span id="athlete-count">0</span>
              </div>
              <div class="masterdata-list" id="athlete-list" aria-live="polite"></div>
              <form class="card masterdata-form" id="athlete-form">
                <div class="section-heading"><div><p class="eyebrow">Neu</p><h2>Athlet anlegen</h2></div></div>
                <div class="settings-grid">
                  <label>Vorname<input id="athlete-first-name" maxlength="80" required /></label>
                  <label>Nachname<input id="athlete-last-name" maxlength="80" required /></label>
                  <label>Jahrgang<input id="athlete-birth-year" type="number" min="1900" max="2100" inputmode="numeric" /></label>
                  <label>Notiz<input id="athlete-notes" maxlength="3000" /></label>
                </div>
                <button class="button button--primary" type="submit">Athlet anlegen</button>
              </form>
              <form class="card masterdata-form" id="athlete-group-form">
                <div class="section-heading"><div><p class="eyebrow">Gruppe</p><h2>Athlet zuordnen</h2></div></div>
                <div class="settings-grid">
                  <label>Athlet<select id="athlete-group-athlete" required></select></label>
                  <label>Trainingsgruppe<select id="athlete-group-group" required></select></label>
                  <label>Beginn<input id="athlete-group-started-on" type="date" required /></label>
                </div>
                <button class="button button--primary" type="submit">Zuordnung anlegen</button>
              </form>
            </section>

            <section class="masterdata-panel" data-masterdata-panel="trainers" hidden>
              <div class="section-heading">
                <div><p class="eyebrow">Trainer</p><h2>Aktuelle Trainer</h2></div>
                <span id="trainer-count">0</span>
              </div>
              <div class="masterdata-list" id="trainer-list" aria-live="polite"></div>
              <form class="card masterdata-form" id="trainer-form">
                <div class="section-heading"><div><p class="eyebrow">Neu</p><h2>Trainer anlegen</h2></div></div>
                <div class="settings-grid">
                  <label>Vorname<input id="trainer-first-name" maxlength="80" required /></label>
                  <label>Nachname<input id="trainer-last-name" maxlength="80" required /></label>
                  <label>Telefon<input id="trainer-phone" maxlength="80" inputmode="tel" /></label>
                  <label>E-Mail<input id="trainer-email" type="email" maxlength="320" /></label>
                  <label>Notiz<input id="trainer-notes" maxlength="3000" /></label>
                </div>
                <button class="button button--primary" type="submit">Trainer anlegen</button>
              </form>
              <form class="card masterdata-form" id="trainer-group-form">
                <div class="section-heading"><div><p class="eyebrow">Gruppe</p><h2>Trainer zuordnen</h2></div></div>
                <div class="settings-grid">
                  <label>Trainer<select id="trainer-group-trainer" required></select></label>
                  <label>Trainingsgruppe<select id="trainer-group-group" required></select></label>
                </div>
                <button class="button button--primary" type="submit">Zuordnung anlegen</button>
              </form>
            </section>

            <section class="masterdata-panel" data-masterdata-panel="groups" hidden>
              <div class="section-heading">
                <div><p class="eyebrow">Trainingsgruppen</p><h2>Aktuelle Gruppen</h2></div>
                <span id="group-count">0</span>
              </div>
              <div class="masterdata-list" id="group-list" aria-live="polite"></div>
              <form class="card masterdata-form" id="group-form">
                <div class="section-heading"><div><p class="eyebrow">Neu</p><h2>Trainingsgruppe anlegen</h2></div></div>
                <div class="settings-grid">
                  <label>Name<input id="group-name" minlength="2" maxlength="100" required /></label>
                  <label>Kurzname<input id="group-short-name" maxlength="20" /></label>
                  <label>Beschreibung<input id="group-description" maxlength="1000" /></label>
                  <label>Sortierung<input id="group-sort-order" type="number" min="0" max="10000" value="100" inputmode="numeric" /></label>
                </div>
                <button class="button button--primary" type="submit">Gruppe anlegen</button>
              </form>
            </section>
          </section>

          <section class="app-section" data-app-section="countdown" id="countdown" hidden>
            <section class="hero">
              <p class="eyebrow">Nützliches</p>
              <h1>Intervall-Countdown</h1>
              <p class="summary">Für Belastungs- und Pausenintervalle im Training.</p>
            </section>

            <p class="message message--error" id="app-message" role="alert" hidden></p>

            <section class="countdown-layout">
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
          </section>

          <section class="app-section" data-app-section="settings" hidden>
            <section class="hero">
              <p class="eyebrow">Countdown</p>
              <h1>Einstellungen</h1>
              <p class="summary">Deine Trainingseinstellungen werden lokal auf diesem Gerät gespeichert.</p>
            </section>

            <section class="card settings-panel" id="settings" aria-labelledby="settings-title">
              <div class="section-heading">
                <div>
                  <p class="eyebrow">Training</p>
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
button, input, select { font: inherit; }
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
input, select {
  width: 100%;
  min-height: var(--touch);
  border: 1px solid var(--border-strong);
  border-radius: var(--control-radius);
  background: white;
  color: var(--text);
  padding: 0 12px;
  font-size: 16px;
}
input:focus-visible, select:focus-visible, button:focus-visible, a:focus-visible {
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
  grid-template-columns: repeat(4, 1fr);
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
  border: 0;
  border-radius: var(--control-radius);
  background: transparent;
  color: #64748b;
  cursor: pointer;
  font-size: .82rem;
  font-weight: 800;
}
.app-nav__link.is-active { background: #dbeafe; color: #1d4ed8; }
.app-nav__link:disabled { cursor: not-allowed; opacity: .45; }
.content { width: min(100%, 52rem); margin: 0 auto; padding: 22px 16px 110px; }
.app-section[hidden] { display: none !important; }
.hero { padding: 6px 0 18px; }
.dashboard-grid { display: grid; gap: 12px; }
.dashboard-card { display: grid; gap: 18px; padding: 20px; }
.dashboard-card h2 { margin-bottom: 8px; }
.dashboard-card p:not(.eyebrow) { margin-bottom: 0; color: var(--secondary); line-height: 1.5; }
.dashboard-card--primary { border-color: color-mix(in srgb, var(--accent) 28%, var(--border)); }
.dashboard-action { width: 100%; }
.dashboard-card small { color: #64748b; line-height: 1.4; }
.dashboard-status {
  width: fit-content;
  padding: 6px 10px;
  border-radius: 999px;
  background: var(--muted);
  color: var(--secondary);
  font-size: .74rem;
  font-weight: 800;
}
.masterdata-tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 16px;
}
.masterdata-tab {
  min-height: var(--touch);
  border: 1px solid var(--border-strong);
  border-radius: var(--control-radius);
  background: white;
  color: var(--secondary);
  cursor: pointer;
  font-weight: 800;
}
.masterdata-tab.is-active {
  border-color: var(--accent);
  background: #dbeafe;
  color: var(--accent);
}
.masterdata-panel { display: grid; gap: 14px; }
.masterdata-list { display: grid; gap: 8px; }
.masterdata-row {
  display: grid;
  gap: 5px;
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: var(--control-radius);
  background: white;
}
.masterdata-row strong { font-size: .96rem; }
.masterdata-row span { color: var(--secondary); font-size: .8rem; line-height: 1.4; }
.masterdata-row__actions { display: flex; justify-content: flex-end; padding-top: 5px; }
.masterdata-row__action {
  min-height: 40px;
  border: 1px solid #fecaca;
  border-radius: 10px;
  background: #fff;
  color: var(--danger);
  padding: 0 12px;
  cursor: pointer;
  font-weight: 800;
}
.masterdata-empty {
  padding: 18px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--control-radius);
  color: #64748b;
  text-align: center;
}
.masterdata-form {
  display: grid;
  gap: 16px;
  margin-top: 8px;
  padding: 18px;
}
.masterdata-form .button { width: 100%; }
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
  countdownQuickAction: document.querySelector("#countdown-quick-action"),
  countdownAccessLabel: document.querySelector("#countdown-access-label"),
  masterdataQuickAction: document.querySelector("#masterdata-quick-action"),
  masterdataAccessLabel: document.querySelector("#masterdata-access-label"),
  masterdataMessage: document.querySelector("#masterdata-message"),
  athleteList: document.querySelector("#athlete-list"),
  trainerList: document.querySelector("#trainer-list"),
  groupList: document.querySelector("#group-list"),
  athleteCount: document.querySelector("#athlete-count"),
  trainerCount: document.querySelector("#trainer-count"),
  groupCount: document.querySelector("#group-count"),
  athleteForm: document.querySelector("#athlete-form"),
  athleteFirstName: document.querySelector("#athlete-first-name"),
  athleteLastName: document.querySelector("#athlete-last-name"),
  athleteBirthYear: document.querySelector("#athlete-birth-year"),
  athleteNotes: document.querySelector("#athlete-notes"),
  trainerForm: document.querySelector("#trainer-form"),
  trainerFirstName: document.querySelector("#trainer-first-name"),
  trainerLastName: document.querySelector("#trainer-last-name"),
  trainerPhone: document.querySelector("#trainer-phone"),
  trainerEmail: document.querySelector("#trainer-email"),
  trainerNotes: document.querySelector("#trainer-notes"),
  groupForm: document.querySelector("#group-form"),
  groupName: document.querySelector("#group-name"),
  groupShortName: document.querySelector("#group-short-name"),
  groupDescription: document.querySelector("#group-description"),
  groupSortOrder: document.querySelector("#group-sort-order"),
  athleteGroupForm: document.querySelector("#athlete-group-form"),
  athleteGroupAthlete: document.querySelector("#athlete-group-athlete"),
  athleteGroupGroup: document.querySelector("#athlete-group-group"),
  athleteGroupStartedOn: document.querySelector("#athlete-group-started-on"),
  trainerGroupForm: document.querySelector("#trainer-group-form"),
  trainerGroupTrainer: document.querySelector("#trainer-group-trainer"),
  trainerGroupGroup: document.querySelector("#trainer-group-group"),
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
let countdownReady = false;
let masterdataReady = false;
let masterdataLoading = false;
let masterdataSnapshot = null;
let plan = null;
let runMode = "idle";
let elapsedBeforeRunMs = 0;
let resumedAt = 0;
let timerHandle = null;
let cueIndex = 0;
let wakeLock = null;
let wakeLockRequestId = 0;

applySettings(loadSettings());
renderIdle();

elements.loginForm?.addEventListener("submit", handleLogin);
elements.passwordForm?.addEventListener("submit", handlePasswordChange);
elements.startButton?.addEventListener("click", () => void startCountdown());
elements.pauseButton?.addEventListener("click", () => void togglePause());
elements.resetButton?.addEventListener("click", () => void resetCountdown());
elements.settingsForm?.addEventListener("input", handleSettingsInput);
elements.athleteForm?.addEventListener("submit", (event) => void createMasterdataAthlete(event));
elements.trainerForm?.addEventListener("submit", (event) => void createMasterdataTrainer(event));
elements.groupForm?.addEventListener("submit", (event) => void createMasterdataGroup(event));
elements.athleteGroupForm?.addEventListener("submit", (event) => void createAthleteGroupMembership(event));
elements.trainerGroupForm?.addEventListener("submit", (event) => void createTrainerGroupMembership(event));
for (const control of document.querySelectorAll("[data-masterdata-tab]")) {
  control.addEventListener("click", () => showMasterdataTab(control.dataset.masterdataTab || "athletes"));
}
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
for (const control of document.querySelectorAll("[data-nav-view]")) {
  control.addEventListener("click", () => {
    if (control.disabled) return;
    showAppSection(control.dataset.navView || "home");
  });
}
for (const control of document.querySelectorAll("[data-open-view]")) {
  control.addEventListener("click", () => {
    if (control.disabled) return;
    showAppSection(control.dataset.openView || "home");
  });
}

void restoreSession();

async function restoreSession() {
  setBusy(true);
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
  } finally {
    setBusy(false);
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
  showAppSection("home");
  if (elements.welcomeEyebrow) {
    const name = next?.identity?.displayName || next?.identity?.username || "Benutzer";
    elements.welcomeEyebrow.textContent = "Guten Tag, " + name;
  }
  await Promise.all([bootstrapCountdown(), bootstrapMasterdata()]);
}

async function bootstrapCountdown() {
  countdownReady = false;
  refreshControls();
  showMessage(elements.appMessage, "");
  try {
    const payload = await requestJson("/api/modules/countdown");
    countdownReady =
      payload?.module?.moduleId === "countdown" &&
      payload?.module?.capability === "countdown:view" &&
      payload?.access?.view === true;
    if (!countdownReady) throw new Error("INVALID_COUNTDOWN_CONTRACT");
  } catch (error) {
    countdownReady = false;
    showMessage(
      elements.appMessage,
      error?.status === 403
        ? "Für den Countdown fehlt die Berechtigung."
        : "Der Countdown ist derzeit nicht verfügbar.",
    );
  }
  refreshControls();
  refreshAppAvailability();
}

async function bootstrapMasterdata() {
  masterdataReady = false;
  refreshAppAvailability();
  showMessage(elements.masterdataMessage, "");
  try {
    const payload = await requestJson("/api/modules/athletes");
    masterdataReady =
      payload?.module?.moduleId === "athletes" &&
      payload?.module?.capabilities?.view === "athletes:view" &&
      payload?.module?.capabilities?.edit === "athletes:edit" &&
      payload?.access?.view === true;
    if (!masterdataReady) throw new Error("INVALID_MASTERDATA_CONTRACT");
  } catch (error) {
    masterdataReady = false;
    showMessage(
      elements.masterdataMessage,
      error?.status === 403
        ? "Für Stammdaten fehlt die Berechtigung."
        : "Stammdaten sind derzeit nicht verfügbar.",
    );
  }
  refreshAppAvailability();
}

function refreshAppAvailability() {
  for (const control of document.querySelectorAll("[data-nav-view='countdown'], [data-nav-view='settings']")) {
    control.disabled = !countdownReady;
  }
  for (const control of document.querySelectorAll("[data-nav-view='masterdata']")) {
    control.disabled = !masterdataReady;
  }
  if (elements.countdownQuickAction) {
    elements.countdownQuickAction.disabled = !countdownReady;
  }
  if (elements.countdownAccessLabel) {
    elements.countdownAccessLabel.textContent = countdownReady
      ? "Für deinen Benutzer freigeschaltet."
      : "Für deinen Benutzer derzeit nicht freigeschaltet.";
  }
  if (elements.masterdataQuickAction) {
    elements.masterdataQuickAction.disabled = !masterdataReady;
  }
  if (elements.masterdataAccessLabel) {
    elements.masterdataAccessLabel.textContent = masterdataReady
      ? "Für deinen Benutzer freigeschaltet."
      : "Für deinen Benutzer derzeit nicht freigeschaltet.";
  }
}

function showAppSection(section) {
  const allowed =
    section === "home" ||
    ((section === "countdown" || section === "settings") && countdownReady) ||
    (section === "masterdata" && masterdataReady);
  const target = allowed ? section : "home";
  for (const candidate of document.querySelectorAll("[data-app-section]")) {
    candidate.hidden = candidate.dataset.appSection !== target;
  }
  for (const control of document.querySelectorAll("[data-nav-view]")) {
    control.classList.toggle("is-active", control.dataset.navView === target);
  }
  if (target !== "home") {
    document.querySelector("[data-app-section='" + target + "']")?.scrollIntoView({ block: "start" });
  } else {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  if (target === "masterdata") void loadMasterdata();
}

function showMasterdataTab(tab) {
  const target = ["athletes", "trainers", "groups"].includes(tab) ? tab : "athletes";
  for (const control of document.querySelectorAll("[data-masterdata-tab]")) {
    const selected = control.dataset.masterdataTab === target;
    control.classList.toggle("is-active", selected);
    control.setAttribute("aria-selected", selected ? "true" : "false");
  }
  for (const panel of document.querySelectorAll("[data-masterdata-panel]")) {
    panel.hidden = panel.dataset.masterdataPanel !== target;
  }
}

async function loadMasterdata(force = false) {
  if (!masterdataReady || masterdataLoading) return;
  if (!force && masterdataSnapshot !== null) {
    renderMasterdata(masterdataSnapshot);
    return;
  }
  masterdataLoading = true;
  showMessage(elements.masterdataMessage, "");
  try {
    const payload = await requestJson("/api/modules/athletes/masterdata");
    const snapshot = payload?.masterdata;
    if (
      !Array.isArray(snapshot?.athletes) ||
      !Array.isArray(snapshot?.trainers) ||
      !Array.isArray(snapshot?.trainingGroups)
    ) {
      throw new Error("INVALID_MASTERDATA_SNAPSHOT");
    }
    masterdataSnapshot = snapshot;
    renderMasterdata(snapshot);
  } catch (error) {
    masterdataSnapshot = null;
    showMessage(
      elements.masterdataMessage,
      error?.status === 403
        ? "Für Stammdaten fehlt die Berechtigung."
        : "Stammdaten konnten nicht geladen werden.",
    );
  } finally {
    masterdataLoading = false;
  }
}

function renderMasterdata(snapshot) {
  const groupsById = new Map(
    snapshot.trainingGroups.map((group) => [group.id, String(group.name || group.shortName || group.id)]),
  );
  const activeAthleteGroups = new Map();
  for (const membership of snapshot.athleteGroupMemberships || []) {
    if (membership?.endedOn !== null && membership?.endedOn !== undefined) continue;
    const name = groupsById.get(membership?.groupId);
    if (!name) continue;
    const names = activeAthleteGroups.get(membership.athleteId) || [];
    names.push(name);
    activeAthleteGroups.set(membership.athleteId, names);
  }
  const trainerGroups = new Map();
  for (const membership of snapshot.trainerGroupMemberships || []) {
    const name = groupsById.get(membership?.groupId);
    if (!name) continue;
    const names = trainerGroups.get(membership.trainerId) || [];
    names.push(name);
    trainerGroups.set(membership.trainerId, names);
  }

  renderMasterdataList(
    elements.athleteList,
    snapshot.athletes,
    "Noch keine Athleten angelegt.",
    (item) => ({
      title: String(item?.lastName || "") + ", " + String(item?.firstName || ""),
      meta:
        (item?.birthYear === null || item?.birthYear === undefined
          ? "Jahrgang nicht erfasst"
          : "Jahrgang " + String(item.birthYear)) +
        " · " +
        ((activeAthleteGroups.get(item?.id) || []).join(", ") || "keine aktive Gruppe") +
        (item?.isActive === false ? " · inaktiv" : ""),
      deactivate: item?.isActive !== false
        ? { type: "athlete", id: String(item?.id || ""), label: "Athlet deaktivieren" }
        : null,
    }),
  );
  renderMasterdataList(
    elements.trainerList,
    snapshot.trainers,
    "Noch keine Trainer angelegt.",
    (item) => ({
      title: String(item?.lastName || "") + ", " + String(item?.firstName || ""),
      meta:
        ([item?.email, item?.phone].filter((value) => typeof value === "string" && value.length > 0).join(" · ") ||
          "Keine Kontaktdaten erfasst") +
        " · " +
        ((trainerGroups.get(item?.id) || []).join(", ") || "keine Gruppe") +
        (item?.isActive === false ? " · inaktiv" : ""),
      deactivate: item?.isActive !== false
        ? { type: "trainer", id: String(item?.id || ""), label: "Trainer deaktivieren" }
        : null,
    }),
  );
  renderMasterdataList(
    elements.groupList,
    snapshot.trainingGroups,
    "Noch keine Trainingsgruppen angelegt.",
    (item) => ({
      title: String(item?.name || ""),
      meta:
        (typeof item?.shortName === "string" && item.shortName.length > 0
          ? item.shortName + " · "
          : "") +
        (item?.isActive === false ? "inaktiv" : "aktiv"),
    }),
  );
  if (elements.athleteCount) elements.athleteCount.textContent = String(snapshot.athletes.length);
  if (elements.trainerCount) elements.trainerCount.textContent = String(snapshot.trainers.length);
  if (elements.groupCount) elements.groupCount.textContent = String(snapshot.trainingGroups.length);
  renderMasterdataAssignmentOptions(snapshot);
}

function renderMasterdataList(container, items, emptyMessage, describe) {
  if (!container) return;
  container.replaceChildren();
  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "masterdata-empty";
    empty.textContent = emptyMessage;
    container.append(empty);
    return;
  }
  for (const item of items) {
    const description = describe(item);
    const row = document.createElement("article");
    row.className = "masterdata-row";
    const title = document.createElement("strong");
    title.textContent = description.title;
    const meta = document.createElement("span");
    meta.textContent = description.meta;
    row.append(title, meta);
    if (description.deactivate?.id) {
      const actions = document.createElement("div");
      actions.className = "masterdata-row__actions";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "masterdata-row__action";
      button.textContent = "Deaktivieren";
      button.addEventListener("click", () => void deactivateMasterdataEntity(description.deactivate));
      actions.append(button);
      row.append(actions);
    }
    container.append(row);
  }
}

function renderMasterdataAssignmentOptions(snapshot) {
  replaceSelectOptions(
    elements.athleteGroupAthlete,
    snapshot.athletes.filter((item) => item?.isActive !== false),
    "Athlet auswählen",
    (item) => String(item?.id || ""),
    (item) => String(item?.lastName || "") + ", " + String(item?.firstName || ""),
  );
  replaceSelectOptions(
    elements.trainerGroupTrainer,
    snapshot.trainers.filter((item) => item?.isActive !== false),
    "Trainer auswählen",
    (item) => String(item?.id || ""),
    (item) => String(item?.lastName || "") + ", " + String(item?.firstName || ""),
  );
  const activeGroups = snapshot.trainingGroups.filter((item) => item?.isActive !== false);
  for (const select of [elements.athleteGroupGroup, elements.trainerGroupGroup]) {
    replaceSelectOptions(
      select,
      activeGroups,
      "Gruppe auswählen",
      (item) => String(item?.id || ""),
      (item) => String(item?.name || ""),
    );
  }
  if (elements.athleteGroupStartedOn && !elements.athleteGroupStartedOn.value) {
    elements.athleteGroupStartedOn.value = localDateValue(new Date());
  }
}

function replaceSelectOptions(select, items, placeholder, valueOf, labelOf) {
  if (!select) return;
  const previous = select.value;
  select.replaceChildren();
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = placeholder;
  select.append(empty);
  for (const item of items) {
    const value = valueOf(item);
    if (!value) continue;
    const option = document.createElement("option");
    option.value = value;
    option.textContent = labelOf(item);
    select.append(option);
  }
  if ([...select.options].some((option) => option.value === previous)) {
    select.value = previous;
  }
}

function localDateValue(date) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

async function createMasterdataAthlete(event) {
  event.preventDefault();
  const birthYearRaw = elements.athleteBirthYear?.value.trim() || "";
  await submitMasterdataForm(
    "/api/modules/athletes/masterdata/athletes",
    {
      firstName: elements.athleteFirstName?.value ?? "",
      lastName: elements.athleteLastName?.value ?? "",
      ...(birthYearRaw === "" ? {} : { birthYear: Number(birthYearRaw) }),
      notes: emptyToNull(elements.athleteNotes?.value),
    },
    elements.athleteForm,
  );
}

async function createMasterdataTrainer(event) {
  event.preventDefault();
  await submitMasterdataForm(
    "/api/modules/athletes/masterdata/trainers",
    {
      firstName: elements.trainerFirstName?.value ?? "",
      lastName: elements.trainerLastName?.value ?? "",
      phone: emptyToNull(elements.trainerPhone?.value),
      email: emptyToNull(elements.trainerEmail?.value),
      notes: emptyToNull(elements.trainerNotes?.value),
    },
    elements.trainerForm,
  );
}

async function createMasterdataGroup(event) {
  event.preventDefault();
  const sortOrderRaw = elements.groupSortOrder?.value.trim() || "100";
  await submitMasterdataForm(
    "/api/modules/athletes/masterdata/training-groups",
    {
      name: elements.groupName?.value ?? "",
      shortName: emptyToNull(elements.groupShortName?.value),
      description: emptyToNull(elements.groupDescription?.value),
      sortOrder: Number(sortOrderRaw),
    },
    elements.groupForm,
  );
}

async function createAthleteGroupMembership(event) {
  event.preventDefault();
  await submitMasterdataForm(
    "/api/modules/athletes/masterdata/athlete-group-memberships",
    {
      athleteId: elements.athleteGroupAthlete?.value ?? "",
      groupId: elements.athleteGroupGroup?.value ?? "",
      startedOn: elements.athleteGroupStartedOn?.value ?? "",
    },
    elements.athleteGroupForm,
  );
}

async function createTrainerGroupMembership(event) {
  event.preventDefault();
  await submitMasterdataForm(
    "/api/modules/athletes/masterdata/trainer-group-memberships",
    {
      trainerId: elements.trainerGroupTrainer?.value ?? "",
      groupId: elements.trainerGroupGroup?.value ?? "",
    },
    elements.trainerGroupForm,
  );
}

async function deactivateMasterdataEntity(action) {
  if (!masterdataReady || masterdataLoading) return;
  const type = action?.type === "athlete" ? "athletes" : action?.type === "trainer" ? "trainers" : null;
  const id = typeof action?.id === "string" ? action.id : "";
  if (type === null || !id) return;
  const label = type === "athletes" ? "diesen Athleten" : "diesen Trainer";
  if (!window.confirm("Möchtest du " + label + " wirklich deaktivieren?")) return;
  setMasterdataFormsDisabled(true);
  showMessage(elements.masterdataMessage, "");
  try {
    await requestJson(
      "/api/modules/athletes/masterdata/" + type + "/" + encodeURIComponent(id) + "/deactivate",
      { method: "POST" },
    );
    masterdataSnapshot = null;
    await loadMasterdata(true);
  } catch (error) {
    showMessage(
      elements.masterdataMessage,
      error?.status === 403
        ? "Du darfst Stammdaten ansehen, aber nicht bearbeiten."
        : error?.status === 404
          ? "Der Stammdatensatz ist nicht mehr aktiv oder wurde nicht gefunden."
          : "Der Stammdatensatz konnte nicht deaktiviert werden.",
    );
  } finally {
    setMasterdataFormsDisabled(false);
  }
}

async function submitMasterdataForm(path, body, form) {
  if (!masterdataReady || masterdataLoading) return;
  setMasterdataFormsDisabled(true);
  showMessage(elements.masterdataMessage, "");
  try {
    await requestJson(path, {
      method: "POST",
      body: JSON.stringify(body),
    });
    form?.reset();
    if (form === elements.groupForm && elements.groupSortOrder) {
      elements.groupSortOrder.value = "100";
    }
    if (form === elements.athleteGroupForm && elements.athleteGroupStartedOn) {
      elements.athleteGroupStartedOn.value = localDateValue(new Date());
    }
    masterdataSnapshot = null;
    await loadMasterdata(true);
  } catch (error) {
    showMessage(
      elements.masterdataMessage,
      error?.status === 403
        ? "Du darfst Stammdaten ansehen, aber nicht bearbeiten."
        : error?.status === 400
          ? "Bitte prüfe die eingegebenen Stammdaten."
          : "Die Stammdaten konnten nicht gespeichert werden.",
    );
  } finally {
    setMasterdataFormsDisabled(false);
  }
}

function setMasterdataFormsDisabled(disabled) {
  for (const control of document.querySelectorAll(".masterdata-form input, .masterdata-form select, .masterdata-form button, .masterdata-row__action")) {
    control.disabled = disabled;
  }
}

function emptyToNull(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized.length === 0 ? null : normalized;
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
  if (!countdownReady || busy || runMode === "running" || runMode === "paused") return;
  const settings = readSettings();
  if (settings === null) {
    showMessage(elements.appMessage, "Bitte gültige Countdown-Einstellungen eingeben.");
    return;
  }

  setBusy(true);
  lockSettings(true);
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
    refreshControls();
    renderAt(0);
    processCues(0);
    startTicker();
    void acquireWakeLock();
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
      !countdownReady || busy || runMode === "running" || runMode === "paused";
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
  const requestId = ++wakeLockRequestId;
  try {
    const requested = await navigator.wakeLock.request("screen");
    if (requestId !== wakeLockRequestId || runMode !== "running") {
      try {
        await requested.release();
      } catch {
        // A stale wake lock request is best effort only.
      }
      return;
    }
    wakeLock = requested;
  } catch {
    if (requestId === wakeLockRequestId) wakeLock = null;
  }
}

async function releaseWakeLock() {
  wakeLockRequestId += 1;
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
