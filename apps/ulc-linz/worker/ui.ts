import {
  ULC_EXERCISE_CATALOG_CSS,
  ULC_EXERCISE_CATALOG_HTML,
  ULC_EXERCISE_CATALOG_SCRIPT,
} from "./exercise-catalog-ui";

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
          <div class="app-nav__primary" id="app-nav-primary">
            <button class="app-nav__link is-active" type="button" data-nav-view="home" data-nav-priority="0">Start</button>
            <button class="app-nav__link" type="button" data-nav-view="kindertraining" data-nav-priority="1" hidden disabled>Training</button>
            <button class="app-nav__link" type="button" data-nav-view="exercise-catalog" data-nav-priority="2" hidden disabled>Übungen</button>
            <button class="app-nav__link" type="button" data-nav-view="masterdata" data-nav-priority="3" hidden disabled>Stammdaten</button>
            <button class="app-nav__link" type="button" data-nav-view="countdown" data-nav-priority="4" hidden disabled>Countdown</button>
            <button class="app-nav__link" type="button" data-nav-view="settings" data-nav-priority="5" hidden disabled>Einstellungen</button>
            <button class="app-nav__link app-nav__more" id="app-nav-more" type="button" aria-expanded="false" aria-controls="app-nav-overflow" hidden>Mehr</button>
          </div>
          <div class="app-nav__overflow" id="app-nav-overflow" aria-label="Weitere Bereiche" hidden></div>
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

              <article class="card dashboard-card dashboard-card--primary">
                <div>
                  <p class="eyebrow">Training</p>
                  <h2>Kindertraining</h2>
                  <p>Anwesenheit für eine Trainingsgruppe und einen Trainingstag direkt am Smartphone erfassen.</p>
                </div>
                <button class="button button--primary dashboard-action" id="kindertraining-quick-action" type="button" data-open-view="kindertraining" disabled>Kindertraining öffnen</button>
                <small id="kindertraining-access-label">Berechtigung wird geprüft …</small>
              </article>

              <article class="card dashboard-card dashboard-card--primary">
                <div>
                  <p class="eyebrow">Training</p>
                  <h2>Übungskatalog</h2>
                  <p>Übungen, Favoriten und Planungsparameter zentral verwalten.</p>
                </div>
                <button class="button button--primary dashboard-action" id="exercise-catalog-quick-action" type="button" data-open-view="exercise-catalog" disabled>Übungskatalog öffnen</button>
                <small id="exercise-catalog-access-label">Berechtigung wird geprüft …</small>
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
                <span class="dashboard-status">Stammdaten · Kindertraining</span>
              </article>
            </section>
          </section>

          <section class="app-section" data-app-section="masterdata" id="masterdata" hidden>
            <section class="hero">
              <p class="eyebrow">Organisation</p>
              <h1>Stammdaten</h1>
              <p class="summary">Athleten, Trainer und Trainingsgruppen deiner Organisation.</p>
              <div class="masterdata-exchange-actions">
                <input id="masterdata-import-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden />
                <button class="button button--secondary" id="masterdata-import-open" type="button" disabled>Import prüfen</button>
                <button class="button button--secondary" id="masterdata-template" type="button" disabled>Importvorlage</button>
                <button class="button button--secondary" id="masterdata-export" type="button" disabled>Export</button>
              </div>
            </section>

            <p class="message message--error" id="masterdata-message" role="alert" hidden></p>
            <p class="message message--success" id="masterdata-success" role="status" hidden></p>

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
                <div class="section-heading"><div><p class="eyebrow">Stammdaten</p><h2 id="athlete-form-title">Athlet anlegen</h2></div></div>
                <div class="settings-grid">
                  <label>Vorname<input id="athlete-first-name" maxlength="80" required /></label>
                  <label>Nachname<input id="athlete-last-name" maxlength="80" required /></label>
                  <label>Jahrgang<input id="athlete-birth-year" type="number" min="1900" max="2100" inputmode="numeric" /></label>
                  <label>Notiz<input id="athlete-notes" maxlength="3000" /></label>
                </div>
                <div class="masterdata-form-actions">
                  <button class="button button--primary" id="athlete-submit-button" type="submit">Athlet anlegen</button>
                  <button class="button button--secondary" id="athlete-edit-cancel" type="button" hidden>Abbrechen</button>
                </div>
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
                <div class="section-heading"><div><p class="eyebrow">Stammdaten</p><h2 id="trainer-form-title">Trainer anlegen</h2></div></div>
                <div class="settings-grid">
                  <label>Vorname<input id="trainer-first-name" maxlength="80" required /></label>
                  <label>Nachname<input id="trainer-last-name" maxlength="80" required /></label>
                  <label>Telefon<input id="trainer-phone" maxlength="80" inputmode="tel" /></label>
                  <label>E-Mail<input id="trainer-email" type="email" maxlength="320" /></label>
                  <label>Notiz<input id="trainer-notes" maxlength="3000" /></label>
                </div>
                <div class="masterdata-form-actions">
                  <button class="button button--primary" id="trainer-submit-button" type="submit">Trainer anlegen</button>
                  <button class="button button--secondary" id="trainer-edit-cancel" type="button" hidden>Abbrechen</button>
                </div>
              </form>
              <form class="card masterdata-form" id="trainer-group-form">
                <div class="section-heading"><div><p class="eyebrow">Gruppe</p><h2>Trainer zuordnen</h2></div></div>
                <div class="settings-grid">
                  <label>Trainer<select id="trainer-group-trainer" required></select></label>
                  <label>Trainingsgruppe<select id="trainer-group-group" required></select></label>
                </div>
                <button class="button button--primary" type="submit">Zuordnung anlegen</button>
              </form>

              <section class="card masterdata-form" id="trainer-identity-admin">
                <div class="section-heading">
                  <div><p class="eyebrow">Benutzer</p><h2>Trainer-Benutzer zuordnen</h2></div>
                  <button class="button button--secondary" id="trainer-identity-load" type="button">Verwalten</button>
                </div>
                <p class="settings-note">Nur für Administratoren. Die Zuordnung wird erst auf ausdrücklichen Aufruf geladen.</p>
                <p class="message message--error" id="trainer-identity-message" role="alert" hidden></p>
                <p class="message message--success" id="trainer-identity-success" role="status" hidden></p>
                <div id="trainer-identity-workspace" hidden>
                  <form id="trainer-user-form">
                    <div class="section-heading">
                      <div><p class="eyebrow">Neu</p><h3>Trainer-Benutzer anlegen</h3></div>
                    </div>
                    <p class="settings-note">Der Benutzer erhält die Rolle Trainer mit Kindertraining-Zugriff und muss beim ersten Login das temporäre Passwort ändern.</p>
                    <div class="settings-grid">
                      <label>Benutzername<input id="trainer-user-username" minlength="3" maxlength="30" pattern="[a-z0-9._]+" autocomplete="off" required /></label>
                      <label>Anzeigename<input id="trainer-user-display-name" maxlength="120" autocomplete="off" required /></label>
                      <label>E-Mail optional<input id="trainer-user-email" type="email" maxlength="320" autocomplete="off" /></label>
                      <label>Temporäres Passwort<input id="trainer-user-password" type="password" minlength="8" maxlength="128" autocomplete="new-password" required /></label>
                      <label>Trainer<select id="trainer-user-trainer" required></select></label>
                    </div>
                    <button class="button button--primary" type="submit">Benutzer anlegen</button>
                  </form>
                  <div class="masterdata-list" id="trainer-identity-list" aria-live="polite"></div>
                  <form id="trainer-identity-form">
                    <div class="section-heading">
                      <div><p class="eyebrow">Bestehend</p><h3>Benutzerzuordnung ändern</h3></div>
                    </div>
                    <div class="settings-grid">
                      <label>Benutzer<select id="trainer-identity-identity" required></select></label>
                      <label>Trainer<select id="trainer-identity-trainer" required></select></label>
                    </div>
                    <button class="button button--secondary" type="submit">Zuordnung speichern</button>
                  </form>
                </div>
              </section>
            </section>

            <section class="masterdata-panel" data-masterdata-panel="groups" hidden>
              <div class="section-heading">
                <div><p class="eyebrow">Trainingsgruppen</p><h2>Aktuelle Gruppen</h2></div>
                <span id="group-count">0</span>
              </div>
              <div class="masterdata-list" id="group-list" aria-live="polite"></div>
              <form class="card masterdata-form" id="group-form">
                <div class="section-heading"><div><p class="eyebrow">Stammdaten</p><h2 id="group-form-title">Trainingsgruppe anlegen</h2></div></div>
                <div class="settings-grid">
                  <label>Name<input id="group-name" minlength="2" maxlength="100" required /></label>
                  <label>Kurzname<input id="group-short-name" maxlength="20" /></label>
                  <label>Beschreibung<input id="group-description" maxlength="1000" /></label>
                  <label>Sortierung<input id="group-sort-order" type="number" min="0" max="10000" value="100" inputmode="numeric" /></label>
                </div>
                <div class="masterdata-form-actions">
                  <button class="button button--primary" id="group-submit-button" type="submit">Gruppe anlegen</button>
                  <button class="button button--secondary" id="group-edit-cancel" type="button" hidden>Abbrechen</button>
                </div>
              </form>
            </section>
          </section>

          <div class="masterdata-import-overlay" id="masterdata-import-preview" hidden>
            <section class="masterdata-import-dialog" role="dialog" aria-modal="true" aria-labelledby="masterdata-import-title">
              <header class="masterdata-import-header">
                <div>
                  <p class="eyebrow">Athleten · XLSX</p>
                  <h2 id="masterdata-import-title">Import prüfen</h2>
                </div>
                <button class="button button--secondary" id="masterdata-import-close" type="button">Schließen</button>
              </header>
              <div class="masterdata-import-body">
                <p class="masterdata-import-notice" id="masterdata-import-notice">Vorschau: Erst nach ausdrücklicher Bestätigung werden gültige Athleten und neue Gruppenzuordnungen angewendet.</p>
                <div class="masterdata-import-summary" id="masterdata-import-summary"></div>
                <div class="masterdata-import-issues" id="masterdata-import-issues"></div>
                <div class="masterdata-import-rows" id="masterdata-import-rows"></div>
              </div>
              <footer class="masterdata-import-footer">
                <button class="button button--secondary" id="masterdata-import-log" type="button" hidden>Protokoll herunterladen</button>
                <button class="button button--primary" id="masterdata-import-apply" type="button" disabled>Import anwenden</button>
              </footer>
            </section>
          </div>

          <section class="app-section" data-app-section="kindertraining" id="kindertraining" hidden>
            <section class="hero">
              <p class="eyebrow">Training</p>
              <h1>Kindertraining</h1>
              <p class="summary">Training auswählen, Anwesenheit erfassen und gemeinsam speichern.</p>
            </section>

            <p class="message message--error" id="kindertraining-message" role="alert" hidden></p>
            <p class="message message--success" id="kindertraining-success" role="status" hidden></p>

            <section class="card kindertraining-selector">
              <div class="settings-grid">
                <label>Trainingsgruppe
                  <select id="kindertraining-group" required>
                    <option value="">Gruppe wählen</option>
                  </select>
                </label>
                <label>Datum
                  <input id="kindertraining-date" type="date" required />
                </label>
              </div>
              <button class="button button--secondary" id="kindertraining-load" type="button">Training laden</button>
            </section>

            <section class="kindertraining-session" id="kindertraining-session" hidden>
              <section class="card kindertraining-session-card">
                <div class="section-heading">
                  <div>
                    <p class="eyebrow">Trainingseinheit</p>
                    <h2 id="kindertraining-title">Kindertraining</h2>
                  </div>
                  <span id="kindertraining-save-state">Noch nicht gespeichert</span>
                </div>

                <div class="settings-grid">
                  <label>Status
                    <select id="kindertraining-state">
                      <option value="scheduled">Geplant</option>
                      <option value="cancelled">Abgesagt</option>
                    </select>
                  </label>
                  <label class="kindertraining-note-label">Notiz
                    <textarea id="kindertraining-note" maxlength="3000" rows="3" placeholder="Optional"></textarea>
                  </label>
                </div>
              </section>

              <section class="card kindertraining-attendance-card">
                <div class="section-heading">
                  <div>
                    <p class="eyebrow">Anwesenheit</p>
                    <h2>Teilnehmer</h2>
                  </div>
                  <span id="kindertraining-count">0</span>
                </div>

                <div class="kindertraining-summary" id="kindertraining-summary" aria-live="polite"></div>
                <div class="kindertraining-bulk-actions" aria-label="Anwesenheit gesammelt setzen">
                  <button class="button button--secondary" id="kindertraining-all-present" type="button">Alle anwesend</button>
                  <button class="button button--secondary" id="kindertraining-all-open" type="button">Alle offen</button>
                </div>
                <div class="kindertraining-participants" id="kindertraining-participants" aria-live="polite"></div>
              </section>

              <button class="button button--primary kindertraining-save" id="kindertraining-save" type="button">Training speichern</button>
            </section>
          </section>

${ULC_EXERCISE_CATALOG_HTML}

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
  --radius: 14px;
  --control-radius: 10px;
  --touch: 44px;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: var(--text);
  background: var(--page);
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; min-width: 320px; min-height: 100vh; background: var(--page); }
button, input, select, textarea { font: inherit; }
[hidden] { display: none !important; }
.app-shell { min-height: 100vh; }
.app-header {
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  min-height: 56px;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  border-bottom: 1px solid var(--border);
  background: rgb(255 255 255 / 94%);
  backdrop-filter: blur(12px);
}
.app-brand { display: flex; min-height: var(--touch); align-items: center; gap: 8px; color: var(--text); text-decoration: none; }
.app-brand__mark {
  display: grid;
  min-width: 40px;
  height: 32px;
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
.app-badge { padding: 4px 8px; border-radius: 999px; background: var(--muted); color: var(--secondary); font-size: .7rem; font-weight: 750; }
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
h1 { margin-bottom: 8px; font-size: clamp(1.7rem, 8vw, 2.5rem); line-height: 1.03; letter-spacing: -.04em; }
h2 { margin-bottom: 0; font-size: 1.15rem; }
.summary { margin-bottom: 0; color: var(--secondary); font-size: .9rem; line-height: 1.4; }
.form-stack { display: grid; gap: 12px; margin-top: 20px; }
label { display: grid; gap: 4px; color: var(--secondary); font-size: .78rem; font-weight: 750; }
input, select, textarea {
  width: 100%;
  min-height: var(--touch);
  border: 1px solid var(--border-strong);
  border-radius: var(--control-radius);
  background: white;
  color: var(--text);
  padding: 0 10px;
  font-size: 16px;
}
textarea {
  min-height: 72px;
  padding-block: 9px;
  resize: vertical;
}
input:focus-visible, select:focus-visible, textarea:focus-visible, button:focus-visible, a:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--accent) 35%, white);
  outline-offset: 2px;
}
.button {
  min-height: var(--touch);
  border: 1px solid transparent;
  border-radius: var(--control-radius);
  padding: 0 14px;
  cursor: pointer;
  font-weight: 800;
}
.button:disabled { cursor: not-allowed; opacity: .5; }
.button--primary { background: var(--accent); color: var(--accent-foreground); }
.button--secondary { border-color: var(--border-strong); background: white; color: var(--secondary); }
.message { margin: 8px 0 0; padding: 9px 10px; border-radius: var(--control-radius); font-size: .84rem; }
.message--error { background: var(--danger-surface); color: var(--danger); }
.message--success { background: #dcfce7; color: #166534; }
.app-nav {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 25;
  padding: 4px 8px max(4px, env(safe-area-inset-bottom));
  border-top: 1px solid var(--border);
  background: white;
}
.app-nav__primary {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  gap: 2px;
}
.app-nav__overflow {
  position: absolute;
  right: 8px;
  bottom: calc(100% + 6px);
  display: grid;
  width: min(320px, calc(100vw - 16px));
  gap: 4px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: white;
  box-shadow: 0 12px 36px rgb(15 23 42 / 18%);
}
.app-nav__overflow[hidden] { display: none !important; }
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
  padding: 4px;
  font-size: .7rem;
  font-weight: 800;
  line-height: 1.15;
}
.app-nav__overflow .app-nav__link {
  justify-content: flex-start;
  min-height: 44px;
  padding-inline: 12px;
  font-size: .8rem;
}
.app-nav__more { font-weight: 900; }
.app-nav__link.is-active { background: #dbeafe; color: #1d4ed8; }
.app-nav__link:disabled { cursor: not-allowed; opacity: .45; }
.content { width: min(100%, 52rem); margin: 0 auto; padding: 12px 12px 86px; }
.app-section[hidden] { display: none !important; }
.hero { padding: 2px 0 12px; }
.dashboard-grid { display: grid; gap: 8px; }
.dashboard-card { display: grid; gap: 9px; padding: 13px; }
.dashboard-card h2 { margin-bottom: 4px; }
.dashboard-card p:not(.eyebrow) { margin-bottom: 0; color: var(--secondary); font-size: .86rem; line-height: 1.35; }
.dashboard-card--primary { border-color: color-mix(in srgb, var(--accent) 28%, var(--border)); }
.dashboard-action { width: 100%; }
.dashboard-card small { color: #64748b; font-size: .72rem; line-height: 1.3; }
.dashboard-status {
  width: fit-content;
  padding: 6px 10px;
  border-radius: 999px;
  background: var(--muted);
  color: var(--secondary);
  font-size: .74rem;
  font-weight: 800;
}
.masterdata-exchange-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 9px;
}
.masterdata-exchange-actions .button {
  min-height: var(--touch);
  padding: 7px 11px;
  font-size: .78rem;
}
.masterdata-import-overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  align-items: end;
  background: rgba(15, 23, 42, .54);
}
.masterdata-import-overlay[hidden] { display: none; }
.masterdata-import-dialog {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  width: min(100%, 52rem);
  max-height: min(92vh, 54rem);
  margin: 0 auto;
  background: var(--card);
  border-radius: 18px 18px 0 0;
  box-shadow: 0 -18px 50px rgba(15, 23, 42, .22);
  overflow: hidden;
}
.masterdata-import-header,
.masterdata-import-footer {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border-bottom: 1px solid var(--border);
}
.masterdata-import-footer {
  justify-content: flex-end;
  border-top: 1px solid var(--border);
  border-bottom: 0;
}
.masterdata-import-body {
  overflow: auto;
  padding: 12px;
}
.masterdata-import-notice {
  margin: 0 0 10px;
  font-size: .82rem;
}
.masterdata-import-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin-bottom: 10px;
}
.masterdata-import-summary > div {
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--muted);
}
.masterdata-import-summary strong,
.masterdata-import-summary span {
  display: block;
}
.masterdata-import-summary span { font-size: .7rem; }
.masterdata-import-issues {
  display: grid;
  gap: 6px;
  margin-bottom: 10px;
}
.masterdata-import-issue {
  padding: 8px;
  border-radius: 10px;
  background: var(--muted);
  font-size: .78rem;
}
.masterdata-import-issue[data-level="error"] { font-weight: 800; }
.masterdata-import-rows {
  display: grid;
  gap: 7px;
}
.masterdata-import-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: start;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--card);
}
.masterdata-import-row__main,
.masterdata-import-row__meta {
  display: block;
}
.masterdata-import-row__meta {
  margin-top: 3px;
  font-size: .72rem;
  color: var(--secondary);
}
.masterdata-import-action {
  padding: 4px 7px;
  border-radius: 999px;
  background: var(--muted);
  font-size: .68rem;
  font-weight: 800;
  white-space: nowrap;
}
.masterdata-tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 5px;
  margin-bottom: 10px;
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
.masterdata-panel { display: grid; gap: 10px; }
.masterdata-list { display: grid; gap: 5px; }
.masterdata-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 2px 8px;
  align-items: center;
  padding: 9px 10px;
  border: 1px solid var(--border);
  border-radius: var(--control-radius);
  background: white;
}
.masterdata-row strong { min-width: 0; font-size: .9rem; }
.masterdata-row span { min-width: 0; color: var(--secondary); font-size: .74rem; line-height: 1.3; }
.masterdata-row__actions { grid-column: 2; grid-row: 1 / 3; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px; padding: 0; }
.masterdata-form-actions { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
.masterdata-row__action {
  min-height: var(--touch);
  border: 1px solid #fecaca;
  border-radius: 10px;
  background: #fff;
  color: var(--danger);
  padding: 0 8px;
  cursor: pointer;
  font-size: .72rem;
  font-weight: 800;
}
.masterdata-row__action--edit {
  border-color: var(--border-strong);
  color: var(--accent);
}
.masterdata-empty {
  padding: 12px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--control-radius);
  color: #64748b;
  text-align: center;
}
.masterdata-form {
  display: grid;
  gap: 10px;
  margin-top: 4px;
  padding: 12px;
}
.masterdata-form .button { width: 100%; }
.masterdata-form .settings-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
#trainer-form .settings-grid label:last-child,
#athlete-group-form .settings-grid label:last-child {
  grid-column: 1 / -1;
}
#trainer-identity-workspace { display: grid; gap: 12px; }
#trainer-identity-workspace[hidden] { display: none; }
#trainer-user-form,
#trainer-identity-form { display: grid; gap: 10px; }
#trainer-user-form {
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}
.kindertraining-selector .settings-grid {
  grid-template-columns: minmax(0, 1.25fr) minmax(120px, .75fr);
  gap: 8px;
}
.kindertraining-session-card .settings-grid {
  grid-template-columns: minmax(104px, .55fr) minmax(0, 1.45fr);
  gap: 8px;
}
.kindertraining-note-label textarea {
  min-height: 44px;
  height: 44px;
  padding-block: 9px;
}
.kindertraining-selector,
.kindertraining-session-card,
.kindertraining-attendance-card {
  display: grid;
  gap: 10px;
  padding: 12px;
}
.kindertraining-selector { margin-bottom: 10px; }
.kindertraining-selector .button { width: 100%; }
.kindertraining-session { display: grid; gap: 10px; }
.kindertraining-note-label { grid-column: auto; }
.kindertraining-summary {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}
.kindertraining-summary__item {
  display: grid;
  gap: 2px;
  min-width: 0;
  padding: 6px 4px;
  border-radius: 10px;
  background: var(--muted);
  text-align: center;
}
.kindertraining-summary__item strong { font-size: 1rem; }
.kindertraining-summary__item span { color: var(--secondary); font-size: .68rem; }
.kindertraining-bulk-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.kindertraining-participants { display: grid; gap: 6px; }
.kindertraining-participant {
  display: grid;
  gap: 6px;
  padding: 8px 9px;
  border: 1px solid var(--border);
  border-radius: var(--control-radius);
  background: white;
}
.kindertraining-participant__identity { display: grid; gap: 3px; }
.kindertraining-participant__identity strong { font-size: .9rem; }
.kindertraining-participant__identity span { color: var(--secondary); font-size: .72rem; }
.kindertraining-statuses {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}
.kindertraining-status {
  min-height: 44px;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  background: white;
  color: var(--secondary);
  cursor: pointer;
  padding: 5px 4px;
  font-size: .72rem;
  font-weight: 800;
}
.kindertraining-status[aria-pressed="true"] {
  border-color: var(--accent);
  background: #dbeafe;
  color: var(--accent);
}
.kindertraining-status[data-status="present"][aria-pressed="true"] {
  border-color: #86efac;
  background: #dcfce7;
  color: #166534;
}
.kindertraining-status[data-status="excused"][aria-pressed="true"] {
  border-color: #fde68a;
  background: #fef3c7;
  color: #92400e;
}
.kindertraining-status[data-status="absent"][aria-pressed="true"] {
  border-color: #fecaca;
  background: #fee2e2;
  color: var(--danger);
}
.kindertraining-empty {
  padding: 18px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--control-radius);
  color: #64748b;
  text-align: center;
}
.kindertraining-save { width: 100%; min-height: 48px; }

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
.section-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
.section-heading > span { color: #64748b; font-size: .8rem; white-space: nowrap; }
.settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
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
  .masterdata-form .settings-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .kindertraining-selector .settings-grid {
    grid-template-columns: minmax(0, 1.25fr) minmax(120px, .75fr);
  }
  .kindertraining-session-card .settings-grid {
    grid-template-columns: minmax(104px, .55fr) minmax(0, 1.45fr);
  }
  .toggle-label { grid-column: auto; }
  .timer-actions { grid-template-columns: 1fr 1fr; }
  .button--start { grid-column: 1 / -1; }
  .timer-stage { min-height: 48vh; }
}
@media (max-width: 359px) {
  .masterdata-row { grid-template-columns: 1fr; }
  .masterdata-row__actions {
    grid-column: 1;
    grid-row: auto;
    justify-content: flex-start;
    padding-top: 4px;
  }
  .masterdata-form .settings-grid,
  .kindertraining-selector .settings-grid,
  .kindertraining-session-card .settings-grid {
    grid-template-columns: 1fr;
  }
  #trainer-form .settings-grid label:last-child,
  #athlete-group-form .settings-grid label:last-child {
    grid-column: auto;
  }
}
@media (min-width: 640px) {
  .app-header { padding-inline: 20px; }
  .gate-card { padding: 28px; }
  .content { padding-inline: 20px; }
  .dashboard-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .settings-panel { padding: 20px; }
}
${ULC_EXERCISE_CATALOG_CSS}
`;

export const ULC_LINZ_APP_SCRIPT = `const SETTINGS_KEY = "ulc-linz.countdown.settings.v1";
const PREPARATION_SECONDS = 3;

const elements = {
  loginView: document.querySelector("#login-view"),
  passwordView: document.querySelector("#password-view"),
  appView: document.querySelector("#app-view"),
  appNavPrimary: document.querySelector("#app-nav-primary"),
  appNavMore: document.querySelector("#app-nav-more"),
  appNavOverflow: document.querySelector("#app-nav-overflow"),
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
  kindertrainingQuickAction: document.querySelector("#kindertraining-quick-action"),
  kindertrainingAccessLabel: document.querySelector("#kindertraining-access-label"),
  kindertrainingMessage: document.querySelector("#kindertraining-message"),
  kindertrainingSuccess: document.querySelector("#kindertraining-success"),
  kindertrainingGroup: document.querySelector("#kindertraining-group"),
  kindertrainingDate: document.querySelector("#kindertraining-date"),
  kindertrainingLoad: document.querySelector("#kindertraining-load"),
  kindertrainingSession: document.querySelector("#kindertraining-session"),
  kindertrainingTitle: document.querySelector("#kindertraining-title"),
  kindertrainingSaveState: document.querySelector("#kindertraining-save-state"),
  kindertrainingState: document.querySelector("#kindertraining-state"),
  kindertrainingNote: document.querySelector("#kindertraining-note"),
  kindertrainingCount: document.querySelector("#kindertraining-count"),
  kindertrainingSummary: document.querySelector("#kindertraining-summary"),
  kindertrainingAllPresent: document.querySelector("#kindertraining-all-present"),
  kindertrainingAllOpen: document.querySelector("#kindertraining-all-open"),
  kindertrainingParticipants: document.querySelector("#kindertraining-participants"),
  kindertrainingSave: document.querySelector("#kindertraining-save"),
  masterdataMessage: document.querySelector("#masterdata-message"),
  masterdataSuccess: document.querySelector("#masterdata-success"),
  masterdataImportFile: document.querySelector("#masterdata-import-file"),
  masterdataImportOpen: document.querySelector("#masterdata-import-open"),
  masterdataImportPreview: document.querySelector("#masterdata-import-preview"),
  masterdataImportClose: document.querySelector("#masterdata-import-close"),
  masterdataImportNotice: document.querySelector("#masterdata-import-notice"),
  masterdataImportSummary: document.querySelector("#masterdata-import-summary"),
  masterdataImportIssues: document.querySelector("#masterdata-import-issues"),
  masterdataImportRows: document.querySelector("#masterdata-import-rows"),
  masterdataImportApply: document.querySelector("#masterdata-import-apply"),
  masterdataImportLog: document.querySelector("#masterdata-import-log"),
  masterdataTemplate: document.querySelector("#masterdata-template"),
  masterdataExport: document.querySelector("#masterdata-export"),
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
  athleteFormTitle: document.querySelector("#athlete-form-title"),
  athleteSubmitButton: document.querySelector("#athlete-submit-button"),
  athleteEditCancel: document.querySelector("#athlete-edit-cancel"),
  trainerForm: document.querySelector("#trainer-form"),
  trainerFirstName: document.querySelector("#trainer-first-name"),
  trainerLastName: document.querySelector("#trainer-last-name"),
  trainerPhone: document.querySelector("#trainer-phone"),
  trainerEmail: document.querySelector("#trainer-email"),
  trainerNotes: document.querySelector("#trainer-notes"),
  trainerFormTitle: document.querySelector("#trainer-form-title"),
  trainerSubmitButton: document.querySelector("#trainer-submit-button"),
  trainerEditCancel: document.querySelector("#trainer-edit-cancel"),
  groupForm: document.querySelector("#group-form"),
  groupName: document.querySelector("#group-name"),
  groupShortName: document.querySelector("#group-short-name"),
  groupDescription: document.querySelector("#group-description"),
  groupSortOrder: document.querySelector("#group-sort-order"),
  groupFormTitle: document.querySelector("#group-form-title"),
  groupSubmitButton: document.querySelector("#group-submit-button"),
  groupEditCancel: document.querySelector("#group-edit-cancel"),
  athleteGroupForm: document.querySelector("#athlete-group-form"),
  athleteGroupAthlete: document.querySelector("#athlete-group-athlete"),
  athleteGroupGroup: document.querySelector("#athlete-group-group"),
  athleteGroupStartedOn: document.querySelector("#athlete-group-started-on"),
  trainerGroupForm: document.querySelector("#trainer-group-form"),
  trainerGroupTrainer: document.querySelector("#trainer-group-trainer"),
  trainerGroupGroup: document.querySelector("#trainer-group-group"),
  trainerIdentityLoad: document.querySelector("#trainer-identity-load"),
  trainerIdentityMessage: document.querySelector("#trainer-identity-message"),
  trainerIdentitySuccess: document.querySelector("#trainer-identity-success"),
  trainerIdentityWorkspace: document.querySelector("#trainer-identity-workspace"),
  trainerUserForm: document.querySelector("#trainer-user-form"),
  trainerUserUsername: document.querySelector("#trainer-user-username"),
  trainerUserDisplayName: document.querySelector("#trainer-user-display-name"),
  trainerUserEmail: document.querySelector("#trainer-user-email"),
  trainerUserPassword: document.querySelector("#trainer-user-password"),
  trainerUserTrainer: document.querySelector("#trainer-user-trainer"),
  trainerIdentityList: document.querySelector("#trainer-identity-list"),
  trainerIdentityForm: document.querySelector("#trainer-identity-form"),
  trainerIdentityIdentity: document.querySelector("#trainer-identity-identity"),
  trainerIdentityTrainer: document.querySelector("#trainer-identity-trainer"),
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

const MASTERDATA_XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MASTERDATA_IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;

const APP_NAV_PRIORITY = Object.freeze([
  "home",
  "kindertraining",
  "exercise-catalog",
  "masterdata",
  "countdown",
  "settings",
]);

let appNavMoreOpen = false;
let busy = false;
let countdownReady = false;
let masterdataReady = false;
let masterdataCanEdit = false;
let kindertrainingReady = false;
let kindertrainingLoading = false;
let kindertrainingGroups = [];
let kindertrainingSnapshot = null;
let masterdataLoading = false;
let masterdataExchangeBusy = false;
let masterdataImportPreviewData = null;
let masterdataImportPreviewToken = null;
let masterdataImportFileDraft = null;
let masterdataImportResultData = null;
let masterdataSnapshot = null;
let masterdataEdit = null;
let trainerIdentityAdminReady = false;
let trainerIdentityLoading = false;
let trainerIdentityBindings = [];
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
elements.masterdataImportOpen?.addEventListener("click", () => {
  if (masterdataExchangeBusy || !masterdataReady || !masterdataCanEdit) return;
  elements.masterdataImportFile?.click();
});
elements.masterdataImportFile?.addEventListener("change", () => {
  const file = elements.masterdataImportFile?.files?.[0] ?? null;
  if (elements.masterdataImportFile) elements.masterdataImportFile.value = "";
  if (file) void previewMasterdataImportFile(file);
});
elements.masterdataImportClose?.addEventListener("click", closeMasterdataImportPreview);
elements.masterdataImportApply?.addEventListener("click", () => {
  void applyMasterdataImport();
});
elements.masterdataImportLog?.addEventListener("click", downloadMasterdataImportLog);
elements.masterdataTemplate?.addEventListener("click", () => {
  void downloadMasterdataWorkbook(
    "/api/modules/athletes/template.xlsx",
    "athleten-importvorlage.xlsx",
    "Athleten-Importvorlage wurde erstellt.",
  );
});
elements.masterdataExport?.addEventListener("click", () => {
  void downloadMasterdataWorkbook(
    "/api/modules/athletes/export.xlsx",
    "athleten-export.xlsx",
    "Athleten-Export wurde erstellt.",
  );
});
elements.athleteForm?.addEventListener("submit", (event) => void createMasterdataAthlete(event));
elements.trainerForm?.addEventListener("submit", (event) => void createMasterdataTrainer(event));
elements.groupForm?.addEventListener("submit", (event) => void createMasterdataGroup(event));
elements.athleteEditCancel?.addEventListener("click", cancelMasterdataEdit);
elements.trainerEditCancel?.addEventListener("click", cancelMasterdataEdit);
elements.groupEditCancel?.addEventListener("click", cancelMasterdataEdit);
elements.athleteGroupForm?.addEventListener("submit", (event) => void createAthleteGroupMembership(event));
elements.trainerGroupForm?.addEventListener("submit", (event) => void createTrainerGroupMembership(event));
elements.trainerIdentityLoad?.addEventListener("click", () => void loadTrainerIdentityAdmin());
elements.trainerUserForm?.addEventListener("submit", (event) => void createTrainerUser(event));
elements.trainerIdentityForm?.addEventListener("submit", (event) => void bindTrainerIdentity(event));
elements.trainerIdentityIdentity?.addEventListener("change", syncTrainerIdentitySelection);
elements.kindertrainingLoad?.addEventListener("click", () => void loadKindertraining());
elements.kindertrainingSave?.addEventListener("click", () => void saveKindertraining());
elements.kindertrainingAllPresent?.addEventListener("click", () => setAllKindertrainingStatuses("present"));
elements.kindertrainingAllOpen?.addEventListener("click", () => setAllKindertrainingStatuses("open"));
elements.kindertrainingGroup?.addEventListener("change", resetKindertrainingSelection);
elements.kindertrainingDate?.addEventListener("change", resetKindertrainingSelection);
elements.kindertrainingParticipants?.addEventListener("click", handleKindertrainingStatusClick);
elements.kindertrainingState?.addEventListener("change", markKindertrainingDirty);
elements.kindertrainingNote?.addEventListener("input", markKindertrainingDirty);
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
elements.appNavMore?.addEventListener("click", () => {
  setAppNavMoreOpen(!appNavMoreOpen);
});
document.addEventListener("click", (event) => {
  if (!appNavMoreOpen || event.target?.closest?.(".app-nav")) return;
  setAppNavMoreOpen(false);
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  setAppNavMoreOpen(false);
  if (!elements.masterdataImportPreview?.hidden) closeMasterdataImportPreview();
});
for (const control of document.querySelectorAll("[data-nav-view]")) {
  control.addEventListener("click", () => {
    if (control.disabled) return;
    setAppNavMoreOpen(false);
    showAppSection(control.dataset.navView || "home");
  });
}
for (const control of document.querySelectorAll("[data-open-view]")) {
  control.addEventListener("click", () => {
    if (control.disabled) return;
    showAppSection(control.dataset.openView || "home");
  });
}

${ULC_EXERCISE_CATALOG_SCRIPT}

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
  await Promise.all([
    bootstrapCountdown(),
    bootstrapMasterdata(),
    bootstrapKindertraining(),
    bootstrapExerciseCatalog(),
  ]);
}

async function bootstrapKindertraining() {
  kindertrainingReady = false;
  kindertrainingGroups = [];
  kindertrainingSnapshot = null;
  refreshAppAvailability();
  showMessage(elements.kindertrainingMessage, "");
  showMessage(elements.kindertrainingSuccess, "");
  if (elements.kindertrainingSession) elements.kindertrainingSession.hidden = true;
  if (elements.kindertrainingDate && !elements.kindertrainingDate.value) {
    elements.kindertrainingDate.value = localIsoDate(new Date());
  }

  try {
    const payload = await requestJson("/api/modules/kindertraining");
    const groups = payload?.trainingGroups;
    kindertrainingReady =
      payload?.module?.moduleId === "kindertraining" &&
      payload?.access?.view === true &&
      Array.isArray(groups);
    if (!kindertrainingReady) throw new Error("INVALID_KINDERTRAINING_CONTRACT");

    kindertrainingGroups = groups
      .filter(
        (group) =>
          typeof group?.id === "string" &&
          group.id.length > 0 &&
          typeof group?.name === "string" &&
          group.name.length > 0 &&
          (group.shortName === null || typeof group.shortName === "string"),
      )
      .map((group) => ({
        id: group.id,
        name: group.name,
        shortName: group.shortName,
      }));
    if (kindertrainingGroups.length !== groups.length) {
      throw new Error("INVALID_KINDERTRAINING_GROUPS");
    }
    renderKindertrainingGroups();
    if (kindertrainingGroups.length === 0) {
      showMessage(
        elements.kindertrainingMessage,
        "Für Kindertraining ist noch keine aktive Trainingsgruppe angelegt.",
      );
    }
  } catch (error) {
    kindertrainingReady = false;
    kindertrainingGroups = [];
    renderKindertrainingGroups();
    showMessage(
      elements.kindertrainingMessage,
      error?.status === 403
        ? "Für Kindertraining fehlt die Berechtigung."
        : "Kindertraining ist derzeit nicht verfügbar.",
    );
  }
  refreshAppAvailability();
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
  masterdataCanEdit = false;
  refreshAppAvailability();
  showMessage(elements.masterdataMessage, "");
  try {
    const payload = await requestJson("/api/modules/athletes");
    masterdataReady =
      payload?.module?.moduleId === "athletes" &&
      payload?.module?.capabilities?.view === "athletes:view" &&
      payload?.module?.capabilities?.edit === "athletes:edit" &&
      payload?.access?.view === true;
    masterdataCanEdit = masterdataReady && payload?.access?.edit === true;
    if (!masterdataReady) throw new Error("INVALID_MASTERDATA_CONTRACT");
  } catch (error) {
    masterdataReady = false;
    masterdataCanEdit = false;
    showMessage(
      elements.masterdataMessage,
      error?.status === 403
        ? "Für Stammdaten fehlt die Berechtigung."
        : "Stammdaten sind derzeit nicht verfügbar.",
    );
  }
  refreshAppAvailability();
}

function isAppNavigationAvailable(section) {
  if (section === "home") return true;
  if (section === "masterdata") return masterdataReady;
  if (section === "kindertraining") return kindertrainingReady;
  if (section === "exercise-catalog") return exerciseCatalogReady;
  if (section === "countdown" || section === "settings") return countdownReady;
  return false;
}

function refreshAppNavigation() {
  const controls = new Map();
  for (const control of document.querySelectorAll("[data-nav-view]")) {
    controls.set(control.dataset.navView || "", control);
    control.hidden = true;
    control.disabled = true;
  }

  const available = APP_NAV_PRIORITY
    .map((section) => controls.get(section))
    .filter(
      (control) =>
        control && isAppNavigationAvailable(control.dataset.navView || ""),
    );
  const primary = available.slice(0, 3);
  const overflow = available.slice(3);

  for (const control of primary) {
    control.hidden = false;
    control.disabled = false;
    elements.appNavPrimary?.insertBefore(control, elements.appNavMore ?? null);
  }
  for (const control of overflow) {
    control.hidden = false;
    control.disabled = false;
    elements.appNavOverflow?.append(control);
  }

  const hasOverflow = overflow.length > 0;
  if (!hasOverflow) appNavMoreOpen = false;
  if (elements.appNavMore) {
    elements.appNavMore.hidden = !hasOverflow;
    elements.appNavMore.setAttribute(
      "aria-expanded",
      hasOverflow && appNavMoreOpen ? "true" : "false",
    );
  }
  if (elements.appNavOverflow) {
    elements.appNavOverflow.hidden = !hasOverflow || !appNavMoreOpen;
  }

  const activeSection =
    document.querySelector("[data-app-section]:not([hidden])")?.dataset.appSection ||
    "home";
  syncAppNavigationActive(activeSection);
}

function setAppNavMoreOpen(open) {
  const hasOverflow =
    (elements.appNavOverflow?.querySelectorAll("[data-nav-view]").length ?? 0) > 0;
  appNavMoreOpen = hasOverflow && open;
  if (elements.appNavMore) {
    elements.appNavMore.setAttribute(
      "aria-expanded",
      appNavMoreOpen ? "true" : "false",
    );
  }
  if (elements.appNavOverflow) {
    elements.appNavOverflow.hidden = !appNavMoreOpen;
  }
}

function syncAppNavigationActive(section) {
  for (const control of document.querySelectorAll("[data-nav-view]")) {
    control.classList.toggle("is-active", control.dataset.navView === section);
  }
  const overflowActive = [
    ...(elements.appNavOverflow?.querySelectorAll("[data-nav-view]") ?? []),
  ].some((control) => control.dataset.navView === section);
  elements.appNavMore?.classList.toggle("is-active", overflowActive);
}

function refreshAppAvailability() {
  refreshAppNavigation();
  if (elements.exerciseCatalogQuickAction) {
    elements.exerciseCatalogQuickAction.disabled = !exerciseCatalogReady;
  }
  if (elements.exerciseCatalogAccessLabel) {
    elements.exerciseCatalogAccessLabel.textContent = exerciseCatalogReady
      ? exerciseCatalogCanEdit
        ? "Lesen und Bearbeiten freigeschaltet."
        : "Lesen und Favoriten freigeschaltet."
      : "Für deinen Benutzer derzeit nicht freigeschaltet.";
  }
  if (elements.countdownQuickAction) {
    elements.countdownQuickAction.disabled = !countdownReady;
  }
  if (elements.countdownAccessLabel) {
    elements.countdownAccessLabel.textContent = countdownReady
      ? "Für deinen Benutzer freigeschaltet."
      : "Für deinen Benutzer derzeit nicht freigeschaltet.";
  }
  if (elements.kindertrainingQuickAction) {
    elements.kindertrainingQuickAction.disabled = !kindertrainingReady;
  }
  if (elements.kindertrainingAccessLabel) {
    elements.kindertrainingAccessLabel.textContent = kindertrainingReady
      ? "Für deinen Benutzer freigeschaltet."
      : "Für deinen Benutzer derzeit nicht freigeschaltet.";
  }
  if (elements.masterdataQuickAction) {
    elements.masterdataQuickAction.disabled = !masterdataReady;
  }
  if (elements.masterdataImportOpen) {
    elements.masterdataImportOpen.disabled =
      !masterdataReady || !masterdataCanEdit || masterdataExchangeBusy;
  }
  if (elements.masterdataTemplate) {
    elements.masterdataTemplate.disabled = !masterdataReady || masterdataExchangeBusy;
  }
  if (elements.masterdataExport) {
    elements.masterdataExport.disabled = !masterdataReady || masterdataExchangeBusy;
  }
  if (elements.masterdataImportApply) {
    const changes =
      (masterdataImportPreviewData?.summary?.create || 0) +
      (masterdataImportPreviewData?.summary?.update || 0);
    elements.masterdataImportApply.disabled =
      masterdataExchangeBusy ||
      !masterdataCanEdit ||
      masterdataImportPreviewToken === null ||
      masterdataImportFileDraft === null ||
      (masterdataImportPreviewData?.summary?.errors || 0) > 0 ||
      changes === 0;
  }
  if (elements.masterdataImportLog) {
    elements.masterdataImportLog.disabled =
      masterdataExchangeBusy || masterdataImportResultData === null;
  }
  if (elements.masterdataAccessLabel) {
    elements.masterdataAccessLabel.textContent = masterdataReady
      ? masterdataCanEdit
        ? "Lesen und Bearbeiten freigeschaltet."
        : "Nur Lesen freigeschaltet."
      : "Für deinen Benutzer derzeit nicht freigeschaltet.";
  }
}

function showAppSection(section) {
  const allowed =
    section === "home" ||
    ((section === "countdown" || section === "settings") && countdownReady) ||
    (section === "masterdata" && masterdataReady) ||
    (section === "kindertraining" && kindertrainingReady) ||
    (section === "exercise-catalog" && exerciseCatalogReady);
  const target = allowed ? section : "home";
  for (const candidate of document.querySelectorAll("[data-app-section]")) {
    candidate.hidden = candidate.dataset.appSection !== target;
  }
  setAppNavMoreOpen(false);
  syncAppNavigationActive(target);
  if (target !== "home") {
    document.querySelector("[data-app-section='" + target + "']")?.scrollIntoView({ block: "start" });
  } else {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  if (target === "masterdata") void loadMasterdata();
  if (target === "kindertraining") prepareKindertrainingView();
  if (target === "exercise-catalog") prepareExerciseCatalogView();
}

function prepareKindertrainingView() {
  if (elements.kindertrainingDate && !elements.kindertrainingDate.value) {
    elements.kindertrainingDate.value = localIsoDate(new Date());
  }
  if (
    elements.kindertrainingGroup &&
    !elements.kindertrainingGroup.value &&
    kindertrainingGroups.length === 1
  ) {
    elements.kindertrainingGroup.value = kindertrainingGroups[0].id;
  }
}

function renderKindertrainingGroups() {
  const select = elements.kindertrainingGroup;
  if (!select) return;
  const selected = select.value;
  select.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Gruppe wählen";
  select.append(placeholder);
  for (const group of kindertrainingGroups) {
    const option = document.createElement("option");
    option.value = group.id;
    option.textContent =
      group.shortName && group.shortName.length > 0
        ? group.name + " (" + group.shortName + ")"
        : group.name;
    select.append(option);
  }
  if (kindertrainingGroups.some((group) => group.id === selected)) {
    select.value = selected;
  } else if (kindertrainingGroups.length === 1) {
    select.value = kindertrainingGroups[0].id;
  }
  select.disabled = !kindertrainingReady || kindertrainingGroups.length === 0;
  if (elements.kindertrainingLoad) {
    elements.kindertrainingLoad.disabled =
      !kindertrainingReady || kindertrainingGroups.length === 0;
  }
}

function resetKindertrainingSelection() {
  kindertrainingSnapshot = null;
  if (elements.kindertrainingSession) elements.kindertrainingSession.hidden = true;
  showMessage(elements.kindertrainingMessage, "");
  showMessage(elements.kindertrainingSuccess, "");
}

async function loadKindertraining() {
  if (!kindertrainingReady || kindertrainingLoading) return;
  const groupId = elements.kindertrainingGroup?.value || "";
  const sessionDate = elements.kindertrainingDate?.value || "";
  if (!groupId || !sessionDate) {
    showMessage(
      elements.kindertrainingMessage,
      "Bitte Trainingsgruppe und Datum auswählen.",
    );
    return;
  }

  setKindertrainingLoading(true);
  showMessage(elements.kindertrainingMessage, "");
  showMessage(elements.kindertrainingSuccess, "");
  try {
    const payload = await requestJson(
      "/api/modules/kindertraining/session?groupId=" +
        encodeURIComponent(groupId) +
        "&sessionDate=" +
        encodeURIComponent(sessionDate),
    );
    const snapshot = payload?.snapshot;
    if (!isKindertrainingSnapshot(snapshot, groupId, sessionDate)) {
      throw new Error("INVALID_KINDERTRAINING_SNAPSHOT");
    }
    kindertrainingSnapshot = snapshot;
    renderKindertrainingSnapshot();
  } catch (error) {
    kindertrainingSnapshot = null;
    if (elements.kindertrainingSession) elements.kindertrainingSession.hidden = true;
    showMessage(
      elements.kindertrainingMessage,
      error?.status === 403
        ? "Für dieses Kindertraining fehlt die Berechtigung."
        : error?.status === 404
          ? "Die Trainingsgruppe wurde nicht gefunden."
          : "Das Kindertraining konnte nicht geladen werden.",
    );
  } finally {
    setKindertrainingLoading(false);
  }
}

function isKindertrainingSnapshot(snapshot, groupId, sessionDate) {
  if (
    snapshot === null ||
    typeof snapshot !== "object" ||
    snapshot?.group?.id !== groupId ||
    snapshot?.sessionDate !== sessionDate ||
    !Array.isArray(snapshot?.participants)
  ) {
    return false;
  }
  if (
    snapshot.session !== null &&
    (typeof snapshot.session?.id !== "string" ||
      typeof snapshot.session?.revision !== "string" ||
      !/^\\d+$/.test(snapshot.session.revision) ||
      !["scheduled", "cancelled"].includes(snapshot.session?.state) ||
      (snapshot.session?.note !== null &&
        typeof snapshot.session?.note !== "string"))
  ) {
    return false;
  }
  const ids = new Set();
  for (const participant of snapshot.participants) {
    if (
      typeof participant?.athleteId !== "string" ||
      participant.athleteId.length === 0 ||
      typeof participant?.firstName !== "string" ||
      typeof participant?.lastName !== "string" ||
      !["open", "present", "excused", "absent"].includes(participant?.status) ||
      ids.has(participant.athleteId)
    ) {
      return false;
    }
    ids.add(participant.athleteId);
  }
  return true;
}

function renderKindertrainingSnapshot() {
  const snapshot = kindertrainingSnapshot;
  if (!snapshot) {
    if (elements.kindertrainingSession) elements.kindertrainingSession.hidden = true;
    return;
  }
  if (elements.kindertrainingSession) elements.kindertrainingSession.hidden = false;
  if (elements.kindertrainingTitle) {
    elements.kindertrainingTitle.textContent =
      snapshot.group.name + " · " + germanDate(snapshot.sessionDate);
  }
  if (elements.kindertrainingSaveState) {
    elements.kindertrainingSaveState.textContent = snapshot.session
      ? "Gespeichert"
      : "Noch nicht gespeichert";
  }
  if (elements.kindertrainingState) {
    elements.kindertrainingState.value = snapshot.session?.state || "scheduled";
  }
  if (elements.kindertrainingNote) {
    elements.kindertrainingNote.value = snapshot.session?.note || "";
  }
  renderKindertrainingParticipants();
  updateKindertrainingSummary();
}

function renderKindertrainingParticipants() {
  const container = elements.kindertrainingParticipants;
  const snapshot = kindertrainingSnapshot;
  if (!container || !snapshot) return;
  container.replaceChildren();

  if (snapshot.participants.length === 0) {
    const empty = document.createElement("div");
    empty.className = "kindertraining-empty";
    empty.textContent = "Für diesen Tag sind keine Teilnehmer zugeordnet.";
    container.append(empty);
    return;
  }

  const labels = {
    open: "Offen",
    present: "Da",
    excused: "Entschuldigt",
    absent: "Fehlt",
  };
  for (const participant of snapshot.participants) {
    const row = document.createElement("article");
    row.className = "kindertraining-participant";

    const identity = document.createElement("div");
    identity.className = "kindertraining-participant__identity";
    const name = document.createElement("strong");
    name.textContent = participant.lastName + ", " + participant.firstName;
    const meta = document.createElement("span");
    meta.textContent =
      participant.birthYear === null || participant.birthYear === undefined
        ? "Jahrgang nicht erfasst"
        : "Jahrgang " + String(participant.birthYear);
    identity.append(name, meta);

    const statuses = document.createElement("div");
    statuses.className = "kindertraining-statuses";
    statuses.setAttribute("role", "group");
    statuses.setAttribute(
      "aria-label",
      "Anwesenheit für " + participant.firstName + " " + participant.lastName,
    );
    for (const status of ["open", "present", "excused", "absent"]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "kindertraining-status";
      button.dataset.athleteId = participant.athleteId;
      button.dataset.status = status;
      button.setAttribute(
        "aria-pressed",
        participant.status === status ? "true" : "false",
      );
      button.textContent = labels[status];
      statuses.append(button);
    }

    row.append(identity, statuses);
    container.append(row);
  }
}

function markKindertrainingDirty() {
  if (!kindertrainingSnapshot) return;
  showMessage(elements.kindertrainingSuccess, "");
  if (elements.kindertrainingSaveState) {
    elements.kindertrainingSaveState.textContent = "Ungespeicherte Änderungen";
  }
}

function handleKindertrainingStatusClick(event) {
  const button = event.target?.closest?.("[data-athlete-id][data-status]");
  if (!button || !elements.kindertrainingParticipants?.contains(button)) return;
  const athleteId = button.dataset.athleteId || "";
  const status = button.dataset.status || "";
  if (
    !kindertrainingSnapshot ||
    !["open", "present", "excused", "absent"].includes(status)
  ) {
    return;
  }
  kindertrainingSnapshot = {
    ...kindertrainingSnapshot,
    participants: kindertrainingSnapshot.participants.map((participant) =>
      participant.athleteId === athleteId
        ? { ...participant, status }
        : participant,
    ),
  };
  renderKindertrainingParticipants();
  updateKindertrainingSummary();
  markKindertrainingDirty();
}

function setAllKindertrainingStatuses(status) {
  if (
    !kindertrainingSnapshot ||
    !["open", "present", "excused", "absent"].includes(status)
  ) {
    return;
  }
  kindertrainingSnapshot = {
    ...kindertrainingSnapshot,
    participants: kindertrainingSnapshot.participants.map((participant) => ({
      ...participant,
      status,
    })),
  };
  renderKindertrainingParticipants();
  updateKindertrainingSummary();
  markKindertrainingDirty();
}

function updateKindertrainingSummary() {
  const snapshot = kindertrainingSnapshot;
  if (!snapshot) return;
  const counts = { open: 0, present: 0, excused: 0, absent: 0 };
  for (const participant of snapshot.participants) {
    if (Object.prototype.hasOwnProperty.call(counts, participant.status)) {
      counts[participant.status] += 1;
    }
  }
  if (elements.kindertrainingCount) {
    elements.kindertrainingCount.textContent =
      String(snapshot.participants.length) + " Teilnehmer";
  }
  if (elements.kindertrainingSummary) {
    elements.kindertrainingSummary.replaceChildren();
    for (const item of [
      ["present", "Da"],
      ["excused", "Entschuldigt"],
      ["absent", "Fehlt"],
      ["open", "Offen"],
    ]) {
      const box = document.createElement("div");
      box.className = "kindertraining-summary__item";
      const count = document.createElement("strong");
      count.textContent = String(counts[item[0]]);
      const label = document.createElement("span");
      label.textContent = item[1];
      box.append(count, label);
      elements.kindertrainingSummary.append(box);
    }
  }
}

async function saveKindertraining() {
  if (!kindertrainingReady || kindertrainingLoading || !kindertrainingSnapshot) {
    return;
  }
  const groupId = elements.kindertrainingGroup?.value || "";
  const sessionDate = elements.kindertrainingDate?.value || "";
  if (
    groupId !== kindertrainingSnapshot.group.id ||
    sessionDate !== kindertrainingSnapshot.sessionDate
  ) {
    showMessage(
      elements.kindertrainingMessage,
      "Gruppe oder Datum wurden geändert. Bitte das Training neu laden.",
    );
    return;
  }

  setKindertrainingLoading(true);
  showMessage(elements.kindertrainingMessage, "");
  showMessage(elements.kindertrainingSuccess, "");
  try {
    const payload = await requestJson("/api/modules/kindertraining/session", {
      method: "POST",
      body: JSON.stringify({
        groupId,
        sessionDate,
        state: elements.kindertrainingState?.value || "scheduled",
        note: elements.kindertrainingNote?.value.trim() || null,
        expectedRevision: kindertrainingSnapshot.session?.revision ?? null,
        attendance: kindertrainingSnapshot.participants.map((participant) => ({
          athleteId: participant.athleteId,
          status: participant.status,
        })),
      }),
    });
    const snapshot = payload?.snapshot;
    if (!isKindertrainingSnapshot(snapshot, groupId, sessionDate)) {
      throw new Error("INVALID_KINDERTRAINING_SAVE");
    }
    kindertrainingSnapshot = snapshot;
    renderKindertrainingSnapshot();
    showMessage(elements.kindertrainingSuccess, "Training wurde gespeichert.");
  } catch (error) {
    const conflict = error?.status === 409;
    showMessage(
      elements.kindertrainingMessage,
      error?.status === 403
        ? "Du darfst dieses Kindertraining ansehen, aber nicht speichern."
        : conflict
          ? "Dieses Training wurde inzwischen von jemand anderem geändert. Bitte neu laden, bevor du weiter speicherst."
          : error?.status === 400
            ? "Die Teilnehmerliste hat sich geändert. Bitte das Training neu laden."
            : "Das Kindertraining konnte nicht gespeichert werden.",
    );
    if (conflict && elements.kindertrainingSaveState) {
      elements.kindertrainingSaveState.textContent = "Konflikt – neu laden";
    }
  } finally {
    setKindertrainingLoading(false);
  }
}

function setKindertrainingLoading(value) {
  kindertrainingLoading = value;
  for (const control of [
    elements.kindertrainingGroup,
    elements.kindertrainingDate,
    elements.kindertrainingLoad,
    elements.kindertrainingState,
    elements.kindertrainingNote,
    elements.kindertrainingAllPresent,
    elements.kindertrainingAllOpen,
    elements.kindertrainingSave,
  ]) {
    if (control) control.disabled = value;
  }
  if (elements.kindertrainingParticipants) {
    for (const button of elements.kindertrainingParticipants.querySelectorAll("button")) {
      button.disabled = value;
    }
  }
}

function localIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

function germanDate(value) {
  const parts = String(value).split("-");
  return parts.length === 3
    ? parts[2] + "." + parts[1] + "." + parts[0]
    : String(value);
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

function isMasterdataImportPreview(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    value.contractVersion === "appbasis.athletes.exchange/v2" &&
    value.applyAvailable === false &&
    value.summary !== null &&
    typeof value.summary === "object" &&
    Array.isArray(value.issues) &&
    Array.isArray(value.rows) &&
    ["rows", "create", "update", "skip", "errors", "warnings"].every(
      (key) => Number.isSafeInteger(value.summary[key]) && value.summary[key] >= 0,
    )
  );
}

function isMasterdataImportApplyEnvelope(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof value.available === "boolean" &&
    typeof value.previewToken === "string" &&
    /^e6f4b-v1\.[0-9a-f]{64}$/.test(value.previewToken)
  );
}

function isMasterdataImportResult(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    value.contractVersion === "appbasis.athletes.import-result/v1" &&
    typeof value.previewToken === "string" &&
    typeof value.appliedAt === "string" &&
    typeof value.logCsv === "string" &&
    Array.isArray(value.rows) &&
    value.summary !== null &&
    typeof value.summary === "object" &&
    ["rows", "created", "updated", "skipped", "failed"].every(
      (key) => Number.isSafeInteger(value.summary[key]) && value.summary[key] >= 0,
    )
  );
}

function setMasterdataImportPreviewOpen(open) {
  if (!elements.masterdataImportPreview) return;
  elements.masterdataImportPreview.hidden = !open;
  document.body.style.overflow = open ? "hidden" : "";
}

function closeMasterdataImportPreview() {
  setMasterdataImportPreviewOpen(false);
  masterdataImportPreviewData = null;
  masterdataImportPreviewToken = null;
  masterdataImportFileDraft = null;
  masterdataImportResultData = null;
  if (elements.masterdataImportApply) {
    elements.masterdataImportApply.hidden = false;
    elements.masterdataImportApply.disabled = true;
    elements.masterdataImportApply.textContent = "Import anwenden";
  }
  if (elements.masterdataImportLog) elements.masterdataImportLog.hidden = true;
}

function appendMasterdataImportIssue(container, issueValue) {
  const item = document.createElement("div");
  item.className = "masterdata-import-issue";
  item.dataset.level = issueValue?.level === "error" ? "error" : "warning";
  const location = [
    issueValue?.sheet,
    Number.isSafeInteger(issueValue?.row) ? "Zeile " + String(issueValue.row) : "",
  ].filter(Boolean).join(" · ");
  item.textContent =
    (issueValue?.level === "error" ? "Fehler" : "Warnung") +
    (location ? " · " + location : "") +
    ": " +
    String(issueValue?.message || "Unbekannter Hinweis");
  container.append(item);
}

function renderMasterdataImportPreview(preview) {
  elements.masterdataImportSummary?.replaceChildren();
  for (const [label, value] of [
    ["Neu", preview.summary.create],
    ["Ändern", preview.summary.update],
    ["Überspringen", preview.summary.skip],
    ["Fehler", preview.summary.errors],
    ["Warnungen", preview.summary.warnings],
    ["Gesamt", preview.summary.rows],
  ]) {
    const card = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = String(value);
    const span = document.createElement("span");
    span.textContent = label;
    card.append(strong, span);
    elements.masterdataImportSummary?.append(card);
  }

  elements.masterdataImportIssues?.replaceChildren();
  for (const issueValue of preview.issues) {
    appendMasterdataImportIssue(elements.masterdataImportIssues, issueValue);
  }

  elements.masterdataImportRows?.replaceChildren();
  for (const row of preview.rows) {
    const article = document.createElement("article");
    article.className = "masterdata-import-row";
    const main = document.createElement("span");
    main.className = "masterdata-import-row__main";
    const title = document.createElement("strong");
    title.textContent =
      String(row?.draft?.lastName || "") +
      ", " +
      String(row?.draft?.firstName || "");
    const meta = document.createElement("span");
    meta.className = "masterdata-import-row__meta";
    const membershipCreates = Array.isArray(row?.draft?.memberships)
      ? row.draft.memberships.filter((membership) => membership?.action === "create").length
      : 0;
    meta.textContent =
      "Excel-Zeile " +
      String(row?.rowNumber || "") +
      (row?.draft?.birthYear ? " · Jahrgang " + String(row.draft.birthYear) : "") +
      (membershipCreates > 0
        ? " · " + String(membershipCreates) + " neue Gruppenzuordnung(en)"
        : "");
    main.append(title, meta);
    for (const issueValue of row.issues || []) {
      const issueLine = document.createElement("span");
      issueLine.className = "masterdata-import-row__meta";
      issueLine.textContent =
        (issueValue?.level === "error" ? "Fehler: " : "Warnung: ") +
        String(issueValue?.message || "");
      main.append(issueLine);
    }
    const status = document.createElement("span");
    status.className = "masterdata-import-action";
    status.textContent =
      row.action === "create"
        ? "Neu"
        : row.action === "update"
          ? "Ändern"
          : row.reason === "invalid"
            ? "Fehler"
            : "Unverändert";
    article.append(main, status);
    elements.masterdataImportRows?.append(article);
  }

  const changes = preview.summary.create + preview.summary.update;
  if (elements.masterdataImportApply) {
    elements.masterdataImportApply.hidden = false;
    elements.masterdataImportApply.textContent =
      changes > 0 ? "Import anwenden (" + String(changes) + ")" : "Keine Änderungen";
  }
  if (elements.masterdataImportLog) elements.masterdataImportLog.hidden = true;
  if (elements.masterdataImportNotice) {
    elements.masterdataImportNotice.textContent =
      preview.summary.errors > 0
        ? "Die Vorschau enthält Fehler. Der Import bleibt gesperrt, bis die XLSX-Datei korrigiert und neu geprüft wurde."
        : changes === 0
          ? "Keine Änderungen erforderlich."
          : "Vorschau geprüft: Der Server liest Datei und aktuellen Stammdatenstand beim Apply erneut. Änderungen an bestehender Gruppenhistorie werden nicht automatisch umgeschrieben.";
  }
  refreshAppAvailability();
}

function renderMasterdataImportResult(result) {
  elements.masterdataImportSummary?.replaceChildren();
  for (const [label, value] of [
    ["Angelegt", result.summary.created],
    ["Aktualisiert", result.summary.updated],
    ["Übersprungen", result.summary.skipped],
    ["Fehler", result.summary.failed],
    ["Gesamt", result.summary.rows],
  ]) {
    const card = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = String(value);
    const span = document.createElement("span");
    span.textContent = label;
    card.append(strong, span);
    elements.masterdataImportSummary?.append(card);
  }
  elements.masterdataImportIssues?.replaceChildren();
  elements.masterdataImportRows?.replaceChildren();
  for (const row of result.rows) {
    const article = document.createElement("article");
    article.className = "masterdata-import-row";
    const main = document.createElement("span");
    main.className = "masterdata-import-row__main";
    const title = document.createElement("strong");
    title.textContent = String(row.name || "Ohne Name");
    const meta = document.createElement("span");
    meta.className = "masterdata-import-row__meta";
    meta.textContent = "Excel-Zeile " + String(row.rowNumber) + " · " + String(row.message || "");
    main.append(title, meta);
    const status = document.createElement("span");
    status.className = "masterdata-import-action";
    status.textContent =
      row.outcome === "created"
        ? "Angelegt"
        : row.outcome === "updated"
          ? "Aktualisiert"
          : row.outcome === "skipped"
            ? "Übersprungen"
            : "Fehler";
    article.append(main, status);
    elements.masterdataImportRows?.append(article);
  }
  if (elements.masterdataImportNotice) {
    elements.masterdataImportNotice.textContent =
      result.summary.failed === 0
        ? "Import abgeschlossen. Das Ergebnisprotokoll kann als CSV heruntergeladen werden."
        : "Import mit Teilfehlern abgeschlossen. Bitte CSV-Protokoll prüfen und die Datei danach erneut prüfen.";
  }
  if (elements.masterdataImportApply) {
    elements.masterdataImportApply.hidden = true;
    elements.masterdataImportApply.disabled = true;
  }
  if (elements.masterdataImportLog) elements.masterdataImportLog.hidden = false;
  refreshAppAvailability();
}

async function previewMasterdataImportFile(file) {
  if (!masterdataReady || masterdataExchangeBusy) return;
  if (
    !file?.name?.toLocaleLowerCase("de").endsWith(".xlsx") ||
    file.size > MASTERDATA_IMPORT_MAX_FILE_BYTES
  ) {
    showMessage(
      elements.masterdataMessage,
      file?.size > MASTERDATA_IMPORT_MAX_FILE_BYTES
        ? "Die Importdatei darf höchstens 5 MB groß sein."
        : "Bitte eine XLSX-Datei auswählen.",
    );
    return;
  }

  masterdataExchangeBusy = true;
  refreshAppAvailability();
  showMessage(elements.masterdataMessage, "");
  showMessage(elements.masterdataSuccess, "");
  try {
    const response = await fetch("/api/modules/athletes/import-preview", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": MASTERDATA_XLSX_CONTENT_TYPE,
      },
      credentials: "same-origin",
      body: file,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(payload?.error?.code || "ATHLETES_IMPORT_PREVIEW_FAILED");
      error.status = response.status;
      error.code = payload?.error?.code;
      error.detail =
        typeof payload?.error?.message === "string"
          ? payload.error.message
          : null;
      throw error;
    }
    if (
      !isMasterdataImportPreview(payload?.preview) ||
      !isMasterdataImportApplyEnvelope(payload?.apply)
    ) {
      throw new Error("INVALID_ATHLETES_IMPORT_PREVIEW_CONTRACT");
    }
    masterdataImportPreviewData = payload.preview;
    masterdataImportPreviewToken = payload.apply.previewToken;
    masterdataImportFileDraft = file;
    masterdataImportResultData = null;
    renderMasterdataImportPreview(payload.preview);
    setMasterdataImportPreviewOpen(true);
  } catch (error) {
    showMessage(
      elements.masterdataMessage,
      error?.status === 403
        ? "Für den Athleten-Import fehlt die Bearbeitungsberechtigung."
        : error?.status === 413
          ? "Die Importdatei darf höchstens 5 MB groß sein."
          : error?.status === 400 &&
              ["INVALID_XLSX", "INVALID_EXCHANGE_CONTRACT", "IMPORT_ROW_LIMIT_EXCEEDED"].includes(
                error?.code,
              ) &&
              typeof error?.detail === "string"
            ? error.detail
            : "Die Athleten-Importdatei konnte nicht geprüft werden.",
    );
  } finally {
    masterdataExchangeBusy = false;
    refreshAppAvailability();
  }
}

async function applyMasterdataImport() {
  if (
    !masterdataReady ||
    masterdataExchangeBusy ||
    masterdataImportPreviewData === null ||
    masterdataImportPreviewToken === null ||
    masterdataImportFileDraft === null
  ) return;
  const changes =
    masterdataImportPreviewData.summary.create +
    masterdataImportPreviewData.summary.update;
  if (
    changes <= 0 ||
    masterdataImportPreviewData.summary.errors > 0 ||
    !window.confirm(
      String(changes) +
        " Athletenänderung(en) jetzt anwenden? Bestehende Gruppenhistorie wird nicht überschrieben.",
    )
  ) return;

  masterdataExchangeBusy = true;
  refreshAppAvailability();
  showMessage(elements.masterdataMessage, "");
  showMessage(elements.masterdataSuccess, "");
  try {
    const response = await fetch("/api/modules/athletes/import-apply", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": MASTERDATA_XLSX_CONTENT_TYPE,
        "x-appbasis-import-preview-token": masterdataImportPreviewToken,
      },
      credentials: "same-origin",
      body: masterdataImportFileDraft,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(payload?.error?.code || "ATHLETES_IMPORT_APPLY_FAILED");
      error.status = response.status;
      error.code = payload?.error?.code;
      throw error;
    }
    if (!isMasterdataImportResult(payload?.result)) {
      throw new Error("INVALID_ATHLETES_IMPORT_RESULT_CONTRACT");
    }
    masterdataImportResultData = payload.result;
    masterdataImportPreviewToken = null;
    masterdataImportFileDraft = null;
    masterdataImportPreviewData = null;
    renderMasterdataImportResult(payload.result);
    masterdataSnapshot = null;
    await loadMasterdata(true);
    showMessage(
      elements.masterdataSuccess,
      payload.result.summary.failed === 0
        ? "Athleten-Import wurde angewendet."
        : "Athleten-Import wurde mit Teilfehlern abgeschlossen.",
    );
  } catch (error) {
    const stale =
      error?.code === "STALE_IMPORT_PREVIEW" ||
      error?.code === "INVALID_IMPORT_PREVIEW";
    if (stale) {
      masterdataImportPreviewToken = null;
      masterdataImportFileDraft = null;
    }
    showMessage(
      elements.masterdataMessage,
      error?.status === 403
        ? "Für den Athleten-Import fehlt die Bearbeitungsberechtigung."
        : stale
          ? "Die Vorschau ist nicht mehr aktuell. Bitte XLSX-Datei erneut prüfen."
          : "Der Athleten-Import konnte nicht angewendet werden.",
    );
  } finally {
    masterdataExchangeBusy = false;
    refreshAppAvailability();
  }
}

function downloadMasterdataImportLog() {
  if (!masterdataImportResultData?.logCsv) return;
  const blob = new Blob(
    [masterdataImportResultData.logCsv],
    { type: "text/csv;charset=utf-8" },
  );
  const href = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = href;
    link.download =
      "athleten-importprotokoll-" +
      masterdataImportResultData.appliedAt.slice(0, 10) +
      ".csv";
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(href), 0);
  }
}

async function downloadMasterdataWorkbook(path, filename, successMessage) {
  if (!masterdataReady || masterdataExchangeBusy) return;
  masterdataExchangeBusy = true;
  refreshAppAvailability();
  showMessage(elements.masterdataMessage, "");
  showMessage(elements.masterdataSuccess, "");

  try {
    const response = await fetch(path, {
      method: "GET",
      headers: {
        accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
      credentials: "same-origin",
    });
    if (!response.ok) {
      const error = new Error("MASTERDATA_WORKBOOK_DOWNLOAD_FAILED");
      error.status = response.status;
      throw error;
    }

    const blob = await response.blob();
    const href = URL.createObjectURL(blob);
    try {
      const link = document.createElement("a");
      link.href = href;
      link.download = filename;
      link.hidden = true;
      document.body.append(link);
      link.click();
      link.remove();
    } finally {
      setTimeout(() => URL.revokeObjectURL(href), 0);
    }
    showMessage(elements.masterdataSuccess, successMessage);
  } catch (error) {
    showMessage(
      elements.masterdataMessage,
      error?.status === 403
        ? "Für den Athleten-Export fehlt die Berechtigung."
        : "Die Excel-Datei konnte nicht erstellt werden.",
    );
  } finally {
    masterdataExchangeBusy = false;
    refreshAppAvailability();
  }
}

async function loadMasterdata(force = false) {
  if (!masterdataReady || masterdataLoading) return false;
  if (!force && masterdataSnapshot !== null) {
    renderMasterdata(masterdataSnapshot);
    return true;
  }
  masterdataLoading = true;
  showMessage(elements.masterdataMessage, "");
  try {
    const payload = await requestJson("/api/modules/athletes/masterdata");
    const snapshot = payload?.masterdata;
    if (
      !Array.isArray(snapshot?.athletes) ||
      !Array.isArray(snapshot?.trainers) ||
      !Array.isArray(snapshot?.trainingGroups) ||
      !Array.isArray(snapshot?.athleteGroupMemberships) ||
      !Array.isArray(snapshot?.trainerGroupMemberships)
    ) {
      throw new Error("INVALID_MASTERDATA_SNAPSHOT");
    }
    masterdataSnapshot = snapshot;
    renderMasterdata(snapshot);
    return true;
  } catch (error) {
    masterdataSnapshot = null;
    showMessage(
      elements.masterdataMessage,
      error?.status === 403
        ? "Für Stammdaten fehlt die Berechtigung."
        : "Stammdaten konnten nicht geladen werden.",
    );
    return false;
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
      edit: item?.isActive !== false
        ? { type: "athlete", id: String(item?.id || ""), item }
        : null,
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
      edit: item?.isActive !== false
        ? { type: "trainer", id: String(item?.id || ""), item }
        : null,
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
      edit: item?.isActive !== false
        ? { type: "group", id: String(item?.id || ""), item }
        : null,
    }),
  );
  if (elements.athleteCount) elements.athleteCount.textContent = String(snapshot.athletes.length);
  if (elements.trainerCount) elements.trainerCount.textContent = String(snapshot.trainers.length);
  if (elements.groupCount) elements.groupCount.textContent = String(snapshot.trainingGroups.length);
  renderMasterdataAssignmentOptions(snapshot);
  renderTrainerIdentityAdmin();
}

function renderTrainerIdentityAdmin() {
  if (!trainerIdentityAdminReady) return;
  const container = elements.trainerIdentityList;
  if (container) {
    container.replaceChildren();
    if (trainerIdentityBindings.length === 0) {
      const empty = document.createElement("div");
      empty.className = "masterdata-empty";
      empty.textContent = "Keine aktiven Trainer-Benutzer verfügbar.";
      container.append(empty);
    } else {
      const trainersById = new Map(
        (masterdataSnapshot?.trainers || []).map((trainer) => [
          trainer.id,
          String(trainer.lastName || "") + ", " + String(trainer.firstName || ""),
        ]),
      );
      for (const binding of trainerIdentityBindings) {
        const row = document.createElement("article");
        row.className = "masterdata-row";
        const title = document.createElement("strong");
        title.textContent = binding.displayName;
        const meta = document.createElement("span");
        const trainerName =
          binding.trainerId === null
            ? "nicht zugeordnet"
            : trainersById.get(binding.trainerId) || "zugeordneter Trainer";
        meta.textContent = binding.username + " · " + trainerName;
        row.append(title, meta);
        container.append(row);
      }
    }
  }

  replaceSelectOptions(
    elements.trainerIdentityIdentity,
    trainerIdentityBindings,
    "Benutzer auswählen",
    (item) => item.identityId,
    (item) => item.displayName + " (" + item.username + ")",
  );
  const activeTrainers = (masterdataSnapshot?.trainers || []).filter(
    (item) => item?.isActive !== false,
  );
  replaceSelectOptions(
    elements.trainerIdentityTrainer,
    activeTrainers,
    "Trainer auswählen",
    (item) => String(item?.id || ""),
    (item) => String(item?.lastName || "") + ", " + String(item?.firstName || ""),
  );
  replaceSelectOptions(
    elements.trainerUserTrainer,
    activeTrainers,
    "Trainer auswählen",
    (item) => String(item?.id || ""),
    (item) => String(item?.lastName || "") + ", " + String(item?.firstName || ""),
  );
  syncTrainerIdentitySelection();
}

function normalizeTrainerIdentityBindings(value) {
  if (!Array.isArray(value)) throw new Error("INVALID_TRAINER_IDENTITY_BINDINGS");
  const seen = new Set();
  const result = [];
  for (const item of value) {
    if (
      item === null ||
      typeof item !== "object" ||
      typeof item.identityId !== "string" ||
      item.identityId.length === 0 ||
      typeof item.username !== "string" ||
      item.username.length === 0 ||
      typeof item.displayName !== "string" ||
      item.displayName.length === 0 ||
      !(item.trainerId === null || (typeof item.trainerId === "string" && item.trainerId.length > 0)) ||
      seen.has(item.identityId)
    ) {
      throw new Error("INVALID_TRAINER_IDENTITY_BINDINGS");
    }
    seen.add(item.identityId);
    result.push({
      identityId: item.identityId,
      username: item.username,
      displayName: item.displayName,
      trainerId: item.trainerId,
    });
  }
  return result;
}

async function fetchTrainerIdentityBindings() {
  const payload = await requestJson("/api/admin/trainer-identities");
  return normalizeTrainerIdentityBindings(payload?.trainerIdentities);
}

async function loadTrainerIdentityAdmin() {
  if (trainerIdentityLoading) return;
  trainerIdentityLoading = true;
  trainerIdentityAdminReady = false;
  setTrainerIdentityControlsDisabled(true);
  showMessage(elements.trainerIdentityMessage, "");
  showMessage(elements.trainerIdentitySuccess, "");
  try {
    trainerIdentityBindings = await fetchTrainerIdentityBindings();
    trainerIdentityAdminReady = true;
    if (elements.trainerIdentityWorkspace) {
      elements.trainerIdentityWorkspace.hidden = false;
    }
    renderTrainerIdentityAdmin();
  } catch (error) {
    trainerIdentityBindings = [];
    if (elements.trainerIdentityWorkspace) {
      elements.trainerIdentityWorkspace.hidden = true;
    }
    showMessage(
      elements.trainerIdentityMessage,
      error?.status === 403
        ? "Die Benutzerzuordnung ist nur für Administratoren verfügbar."
        : "Die Trainer-Benutzerzuordnung konnte nicht geladen werden.",
    );
  } finally {
    trainerIdentityLoading = false;
    setTrainerIdentityControlsDisabled(false);
  }
}

async function createTrainerUser(event) {
  event.preventDefault();
  if (!trainerIdentityAdminReady || trainerIdentityLoading) return;
  const username = elements.trainerUserUsername?.value || "";
  const displayName = elements.trainerUserDisplayName?.value || "";
  const contactEmail = elements.trainerUserEmail?.value.trim() || "";
  const temporaryPassword = elements.trainerUserPassword?.value || "";
  const trainerId = elements.trainerUserTrainer?.value || "";
  showMessage(elements.trainerIdentityMessage, "");
  showMessage(elements.trainerIdentitySuccess, "");

  if (!username || !displayName || !temporaryPassword || !trainerId) {
    showMessage(
      elements.trainerIdentityMessage,
      "Bitte Benutzername, Anzeigename, temporäres Passwort und Trainer angeben.",
    );
    return;
  }

  trainerIdentityLoading = true;
  setTrainerIdentityControlsDisabled(true);
  try {
    try {
      await requestJson("/api/admin/trainer-users", {
        method: "POST",
        body: JSON.stringify({
          username,
          displayName,
          temporaryPassword,
          trainerId,
          ...(contactEmail ? { contactEmail } : {}),
        }),
      });
    } catch (error) {
      showMessage(
        elements.trainerIdentityMessage,
        error?.status === 403
          ? "Benutzer können nur von Administratoren angelegt werden."
          : error?.status === 404
            ? "Der ausgewählte Trainer ist nicht mehr verfügbar."
            : error?.status === 409
              ? "Benutzername oder Trainer ist bereits in einer widersprüchlichen Zuordnung vorhanden."
              : error?.status === 400
                ? "Bitte Benutzername, Passwort und Eingaben prüfen."
                : "Der Trainer-Benutzer konnte nicht angelegt werden.",
      );
      return;
    }

    elements.trainerUserForm?.reset();
    try {
      trainerIdentityBindings = await fetchTrainerIdentityBindings();
      trainerIdentityAdminReady = true;
      renderTrainerIdentityAdmin();
      showMessage(
        elements.trainerIdentitySuccess,
        "Trainer-Benutzer wurde angelegt. Beim ersten Login ist ein Passwortwechsel erforderlich.",
      );
    } catch {
      trainerIdentityAdminReady = false;
      trainerIdentityBindings = [];
      if (elements.trainerIdentityWorkspace) {
        elements.trainerIdentityWorkspace.hidden = true;
      }
      showMessage(
        elements.trainerIdentitySuccess,
        "Trainer-Benutzer wurde angelegt, aber die aktualisierte Liste konnte nicht geladen werden. Bitte neu laden.",
      );
    }
  } finally {
    trainerIdentityLoading = false;
    setTrainerIdentityControlsDisabled(false);
  }
}

async function bindTrainerIdentity(event) {
  event.preventDefault();
  if (!trainerIdentityAdminReady || trainerIdentityLoading) return;
  const identityId = elements.trainerIdentityIdentity?.value || "";
  const trainerId = elements.trainerIdentityTrainer?.value || "";
  showMessage(elements.trainerIdentityMessage, "");
  showMessage(elements.trainerIdentitySuccess, "");
  if (!identityId || !trainerId) {
    showMessage(
      elements.trainerIdentityMessage,
      "Bitte Benutzer und Trainer auswählen.",
    );
    return;
  }

  trainerIdentityLoading = true;
  setTrainerIdentityControlsDisabled(true);
  try {
    try {
      await requestJson("/api/admin/trainer-identities", {
        method: "POST",
        body: JSON.stringify({ identityId, trainerId }),
      });
    } catch (error) {
      showMessage(
        elements.trainerIdentityMessage,
        error?.status === 403
          ? "Die Benutzerzuordnung ist nur für Administratoren verfügbar."
          : error?.status === 404
            ? "Benutzer oder Trainer ist nicht mehr verfügbar."
            : error?.status === 409
              ? "Dieser Trainer ist bereits einem anderen aktiven Benutzer zugeordnet."
              : error?.status === 400
                ? "Bitte Benutzer und Trainer erneut auswählen."
                : "Die Trainer-Benutzerzuordnung konnte nicht gespeichert werden.",
      );
      return;
    }

    try {
      trainerIdentityBindings = await fetchTrainerIdentityBindings();
      trainerIdentityAdminReady = true;
      renderTrainerIdentityAdmin();
      showMessage(
        elements.trainerIdentitySuccess,
        "Trainer-Benutzerzuordnung wurde gespeichert.",
      );
    } catch {
      trainerIdentityAdminReady = false;
      trainerIdentityBindings = [];
      if (elements.trainerIdentityWorkspace) {
        elements.trainerIdentityWorkspace.hidden = true;
      }
      showMessage(
        elements.trainerIdentitySuccess,
        "Trainer-Benutzerzuordnung wurde gespeichert, aber die aktualisierte Liste konnte nicht geladen werden. Bitte neu laden.",
      );
    }
  } finally {
    trainerIdentityLoading = false;
    setTrainerIdentityControlsDisabled(false);
  }
}

function syncTrainerIdentitySelection() {
  if (!trainerIdentityAdminReady || !elements.trainerIdentityTrainer) return;
  const identityId = elements.trainerIdentityIdentity?.value || "";
  const binding = trainerIdentityBindings.find((item) => item.identityId === identityId);
  const trainerId = binding?.trainerId || "";
  elements.trainerIdentityTrainer.value = [...elements.trainerIdentityTrainer.options].some(
    (option) => option.value === trainerId,
  )
    ? trainerId
    : "";
}

function setTrainerIdentityControlsDisabled(disabled) {
  if (elements.trainerIdentityLoad) {
    elements.trainerIdentityLoad.disabled = disabled;
    elements.trainerIdentityLoad.textContent = trainerIdentityAdminReady
      ? "Neu laden"
      : "Verwalten";
  }
  for (const control of [
    elements.trainerUserUsername,
    elements.trainerUserDisplayName,
    elements.trainerUserEmail,
    elements.trainerUserPassword,
    elements.trainerUserTrainer,
    elements.trainerUserForm?.querySelector("button"),
    elements.trainerIdentityIdentity,
    elements.trainerIdentityTrainer,
    elements.trainerIdentityForm?.querySelector("button"),
  ]) {
    if (control) control.disabled = disabled || !trainerIdentityAdminReady;
  }
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
    if (description.edit?.id || description.deactivate?.id) {
      const actions = document.createElement("div");
      actions.className = "masterdata-row__actions";
      if (description.edit?.id) {
        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "masterdata-row__action masterdata-row__action--edit";
        editButton.textContent = "Bearbeiten";
        editButton.addEventListener("click", () => beginMasterdataEdit(description.edit));
        actions.append(editButton);
      }
      if (description.deactivate?.id) {
        const deactivateButton = document.createElement("button");
        deactivateButton.type = "button";
        deactivateButton.className = "masterdata-row__action";
        deactivateButton.textContent = "Deaktivieren";
        deactivateButton.addEventListener("click", () => void deactivateMasterdataEntity(description.deactivate));
        actions.append(deactivateButton);
      }
      row.append(actions);
    }
    container.append(row);
  }
}

function beginMasterdataEdit(action) {
  const type = action?.type;
  const id = typeof action?.id === "string" ? action.id : "";
  const item = action?.item;
  if (!["athlete", "trainer", "group"].includes(type) || !id || !item) return;

  cancelMasterdataEdit();
  masterdataEdit = { type, id };

  if (type === "athlete") {
    showMasterdataTab("athletes");
    if (elements.athleteFirstName) elements.athleteFirstName.value = String(item.firstName || "");
    if (elements.athleteLastName) elements.athleteLastName.value = String(item.lastName || "");
    if (elements.athleteBirthYear) {
      elements.athleteBirthYear.value =
        item.birthYear === null || item.birthYear === undefined ? "" : String(item.birthYear);
    }
    if (elements.athleteNotes) elements.athleteNotes.value = String(item.notes || "");
    elements.athleteForm?.scrollIntoView({ block: "start", behavior: "smooth" });
  } else if (type === "trainer") {
    showMasterdataTab("trainers");
    if (elements.trainerFirstName) elements.trainerFirstName.value = String(item.firstName || "");
    if (elements.trainerLastName) elements.trainerLastName.value = String(item.lastName || "");
    if (elements.trainerPhone) elements.trainerPhone.value = String(item.phone || "");
    if (elements.trainerEmail) elements.trainerEmail.value = String(item.email || "");
    if (elements.trainerNotes) elements.trainerNotes.value = String(item.notes || "");
    elements.trainerForm?.scrollIntoView({ block: "start", behavior: "smooth" });
  } else {
    showMasterdataTab("groups");
    if (elements.groupName) elements.groupName.value = String(item.name || "");
    if (elements.groupShortName) elements.groupShortName.value = String(item.shortName || "");
    if (elements.groupDescription) elements.groupDescription.value = String(item.description || "");
    if (elements.groupSortOrder) elements.groupSortOrder.value = String(item.sortOrder ?? 100);
    elements.groupForm?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  refreshMasterdataEditMode();
}

function cancelMasterdataEdit() {
  const previousType = masterdataEdit?.type;
  masterdataEdit = null;
  if (previousType === "athlete") elements.athleteForm?.reset();
  if (previousType === "trainer") elements.trainerForm?.reset();
  if (previousType === "group") {
    elements.groupForm?.reset();
    if (elements.groupSortOrder) elements.groupSortOrder.value = "100";
  }
  refreshMasterdataEditMode();
}

function refreshMasterdataEditMode() {
  const athleteEditing = masterdataEdit?.type === "athlete";
  const trainerEditing = masterdataEdit?.type === "trainer";
  const groupEditing = masterdataEdit?.type === "group";

  if (elements.athleteFormTitle) {
    elements.athleteFormTitle.textContent = athleteEditing ? "Athlet bearbeiten" : "Athlet anlegen";
  }
  if (elements.athleteSubmitButton) {
    elements.athleteSubmitButton.textContent = athleteEditing ? "Änderungen speichern" : "Athlet anlegen";
  }
  if (elements.athleteEditCancel) elements.athleteEditCancel.hidden = !athleteEditing;

  if (elements.trainerFormTitle) {
    elements.trainerFormTitle.textContent = trainerEditing ? "Trainer bearbeiten" : "Trainer anlegen";
  }
  if (elements.trainerSubmitButton) {
    elements.trainerSubmitButton.textContent = trainerEditing ? "Änderungen speichern" : "Trainer anlegen";
  }
  if (elements.trainerEditCancel) elements.trainerEditCancel.hidden = !trainerEditing;

  if (elements.groupFormTitle) {
    elements.groupFormTitle.textContent = groupEditing ? "Trainingsgruppe bearbeiten" : "Trainingsgruppe anlegen";
  }
  if (elements.groupSubmitButton) {
    elements.groupSubmitButton.textContent = groupEditing ? "Änderungen speichern" : "Gruppe anlegen";
  }
  if (elements.groupEditCancel) elements.groupEditCancel.hidden = !groupEditing;
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
  const editId = masterdataEdit?.type === "athlete" ? masterdataEdit.id : null;
  const saved = await submitMasterdataForm(
    editId
      ? "/api/modules/athletes/masterdata/athletes/" + encodeURIComponent(editId) + "/update"
      : "/api/modules/athletes/masterdata/athletes",
    {
      firstName: elements.athleteFirstName?.value ?? "",
      lastName: elements.athleteLastName?.value ?? "",
      ...(editId
        ? { birthYear: birthYearRaw === "" ? null : Number(birthYearRaw) }
        : birthYearRaw === "" ? {} : { birthYear: Number(birthYearRaw) }),
      notes: emptyToNull(elements.athleteNotes?.value),
    },
    elements.athleteForm,
  );
  if (saved && editId) cancelMasterdataEdit();
}

async function createMasterdataTrainer(event) {
  event.preventDefault();
  const editId = masterdataEdit?.type === "trainer" ? masterdataEdit.id : null;
  const saved = await submitMasterdataForm(
    editId
      ? "/api/modules/athletes/masterdata/trainers/" + encodeURIComponent(editId) + "/update"
      : "/api/modules/athletes/masterdata/trainers",
    {
      firstName: elements.trainerFirstName?.value ?? "",
      lastName: elements.trainerLastName?.value ?? "",
      phone: emptyToNull(elements.trainerPhone?.value),
      email: emptyToNull(elements.trainerEmail?.value),
      notes: emptyToNull(elements.trainerNotes?.value),
    },
    elements.trainerForm,
  );
  if (saved && editId) cancelMasterdataEdit();
}

async function createMasterdataGroup(event) {
  event.preventDefault();
  const sortOrderRaw = elements.groupSortOrder?.value.trim() || "100";
  const editId = masterdataEdit?.type === "group" ? masterdataEdit.id : null;
  const saved = await submitMasterdataForm(
    editId
      ? "/api/modules/athletes/masterdata/training-groups/" + encodeURIComponent(editId) + "/update"
      : "/api/modules/athletes/masterdata/training-groups",
    {
      name: elements.groupName?.value ?? "",
      shortName: emptyToNull(elements.groupShortName?.value),
      description: emptyToNull(elements.groupDescription?.value),
      sortOrder: Number(sortOrderRaw),
    },
    elements.groupForm,
  );
  if (saved && editId) cancelMasterdataEdit();
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
  if (!masterdataReady || masterdataLoading) return false;
  setMasterdataFormsDisabled(true);
  showMessage(elements.masterdataMessage, "");
  showMessage(elements.masterdataSuccess, "");
  try {
    try {
      await requestJson(path, {
        method: "POST",
        body: JSON.stringify(body),
      });
    } catch (error) {
      showMessage(
        elements.masterdataMessage,
        error?.status === 403
          ? "Du darfst Stammdaten ansehen, aber nicht bearbeiten."
          : error?.status === 400
            ? "Bitte prüfe die eingegebenen Stammdaten."
            : "Die Stammdaten konnten nicht gespeichert werden.",
      );
      return false;
    }

    form?.reset();
    if (form === elements.groupForm && elements.groupSortOrder) {
      elements.groupSortOrder.value = "100";
    }
    if (form === elements.athleteGroupForm && elements.athleteGroupStartedOn) {
      elements.athleteGroupStartedOn.value = localDateValue(new Date());
    }
    masterdataSnapshot = null;
    const refreshed = await loadMasterdata(true);
    if (refreshed) {
      showMessage(elements.masterdataSuccess, "Stammdaten wurden gespeichert.");
    } else {
      showMessage(elements.masterdataMessage, "");
      showMessage(
        elements.masterdataSuccess,
        "Stammdaten wurden gespeichert. Die aktualisierte Liste konnte nicht geladen werden; bitte die Ansicht neu öffnen.",
      );
    }
    return true;
  } finally {
    setMasterdataFormsDisabled(false);
  }
}

function setMasterdataFormsDisabled(disabled) {
  for (const control of document.querySelectorAll(".masterdata-form input, .masterdata-form select, .masterdata-form button, .masterdata-row__action")) {
    control.disabled = disabled;
  }
  setTrainerIdentityControlsDisabled(disabled || trainerIdentityLoading);
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
