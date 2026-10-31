import {
  ULC_USER_ADMIN_HTML,
  ULC_USER_ADMIN_CSS,
  ULC_USER_ADMIN_SCRIPT,
} from "./user-admin-ui";
import {
  ULC_EXERCISE_CATALOG_CSS,
  ULC_EXERCISE_CATALOG_HTML,
  ULC_EXERCISE_CATALOG_SCRIPT,
} from "./exercise-catalog-ui";
import {
  ULC_TRAINING_BLOCKS_CSS,
  ULC_TRAINING_BLOCKS_HTML,
  ULC_TRAINING_BLOCKS_SCRIPT,
} from "./training-blocks-ui";
import {
  ULC_TRAINING_PLANS_CSS,
  ULC_TRAINING_PLANS_HTML,
  ULC_TRAINING_PLANS_SCRIPT,
} from "./training-plans-ui";
import {
  ULC_TRAINING_DOCUMENTATION_CSS,
  ULC_TRAINING_DOCUMENTATION_HTML,
  ULC_TRAINING_DOCUMENTATION_SCRIPT,
} from "./training-documentation-ui";

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
            <button class="button button--secondary" id="password-sign-out" type="button">Abmelden / Benutzer wechseln</button>
          </form>
        </section>
      </main>

      <div id="app-view" hidden>
        <p class="message message--error app-session-message" id="app-session-message" role="alert" hidden></p>
        <nav class="app-nav" aria-label="Hauptnavigation">
          <div class="app-nav__primary" id="app-nav-primary">
            <button class="app-nav__link is-active" type="button" data-nav-view="home" data-nav-priority="0">Start</button>
            <button class="app-nav__link" type="button" data-nav-view="registration" data-nav-priority="1" hidden disabled>Anmeldung</button>
            <button class="app-nav__link" type="button" data-nav-view="kindertraining" data-nav-priority="2" hidden disabled>Training</button>
            <button class="app-nav__link" type="button" data-nav-view="training-plans" data-nav-priority="3" hidden disabled>Planung</button>
            <button class="app-nav__link" type="button" data-nav-view="training-documentation" data-nav-priority="4" hidden disabled>Dokumentation</button>
            <button class="app-nav__link" type="button" data-nav-view="exercise-catalog" data-nav-priority="5" hidden disabled>Übungen</button>
            <button class="app-nav__link" type="button" data-nav-view="training-blocks" data-nav-priority="6" hidden disabled>Blöcke</button>
            <button class="app-nav__link" type="button" data-nav-view="masterdata" data-nav-priority="7" hidden disabled>Stammdaten</button>
            <button class="app-nav__link" type="button" data-nav-view="users" data-nav-priority="9" hidden disabled>Benutzer</button>
            <button class="app-nav__link" type="button" data-nav-view="useful" data-nav-priority="8" hidden disabled>Nützliches</button>
            <button class="app-nav__link app-nav__more" id="app-nav-more" type="button" aria-expanded="false" aria-controls="app-nav-overflow" hidden>Mehr</button>
          </div>
          <div class="app-nav__overflow" id="app-nav-overflow" aria-label="Weitere Bereiche" hidden>
            <button class="app-nav__link app-nav__signout" id="app-sign-out" type="button">Abmelden / Benutzer wechseln</button>
          </div>
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

              <article class="card dashboard-card dashboard-card--primary" id="registration-dashboard">
                <div>
                  <p class="eyebrow">Training</p>
                  <h2>Meine Trainingsanmeldung</h2>
                  <p>Für deine Trainingsgruppe anmelden, absagen oder „vielleicht“ auswählen.</p>
                </div>
                <button class="button button--primary dashboard-action" id="registration-quick-action" type="button" data-open-view="registration" disabled>Anmeldung öffnen</button>
                <small id="registration-access-label">Berechtigung wird geprüft …</small>
              </article>

              <article class="card dashboard-card dashboard-card--primary" id="user-admin-dashboard" hidden>
                <div>
                  <p class="eyebrow">Organisation</p>
                  <h2>Benutzerverwaltung</h2>
                  <p>Testzugänge anlegen und bestehende Konten prüfen.</p>
                </div>
                <button class="button button--primary dashboard-action" type="button" data-open-view="users">Benutzer öffnen</button>
              </article>

              <article class="card dashboard-card dashboard-card--primary">
                <div>
                  <p class="eyebrow">Training</p>
                  <h2>Anwesenheit</h2>
                  <p>Voranmeldungen einer Trainingsgruppe prüfen und die tatsächliche Anwesenheit für einen Trainingstag erfassen.</p>
                </div>
                <button class="button button--primary dashboard-action" id="kindertraining-quick-action" type="button" data-open-view="kindertraining" disabled>Anwesenheit öffnen</button>
                <small id="kindertraining-access-label">Berechtigung wird geprüft …</small>
              </article>

              <article class="card dashboard-card dashboard-card--primary">
                <div>
                  <p class="eyebrow">Training</p>
                  <h2>Trainingsplanung</h2>
                  <p>Trainingspläne für Gruppen und Athleten erstellen, gezielt speichern und beim Verlassen sichern.</p>
                </div>
                <button class="button button--primary dashboard-action" id="training-plan-quick-action" type="button" data-open-view="training-plans" disabled>Trainingsplanung öffnen</button>
                <small id="training-plan-access-label">Berechtigung wird geprüft …</small>
              </article>

              <article class="card dashboard-card dashboard-card--primary">
                <div>
                  <p class="eyebrow">Training</p>
                  <h2>Trainingsdokumentation</h2>
                  <p>Geplante Einheiten übernehmen, tatsächliche Durchführung festhalten und abschließen.</p>
                </div>
                <button class="button button--primary dashboard-action" id="training-documentation-quick-action" type="button" data-open-view="training-documentation" disabled>Dokumentation öffnen</button>
                <small id="training-documentation-access-label">Berechtigung wird geprüft …</small>
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

              <article class="card dashboard-card dashboard-card--primary">
                <div>
                  <p class="eyebrow">Training</p>
                  <h2>Trainingsblöcke</h2>
                  <p>Trainingsvorlagen zusammenstellen, bewusst speichern und Versionen vergleichen.</p>
                </div>
                <button class="button button--primary dashboard-action" id="training-block-quick-action" type="button" data-open-view="training-blocks" disabled>Trainingsblöcke öffnen</button>
                <small id="training-block-access-label">Berechtigung wird geprüft …</small>
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
                <span class="dashboard-status">Stammdaten · Anwesenheit · Trainingsplanung</span>
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
              <div class="section-heading masterdata-list-heading">
                <div><p class="eyebrow">Athleten</p><h2>Athleten <span class="masterdata-inline-count" id="athlete-count">(0)</span></h2></div>
                <div class="masterdata-heading-actions">
                  <label class="masterdata-inactive-toggle"><input id="athlete-show-inactive" type="checkbox" /> Inaktive</label>
                  <button class="button button--primary masterdata-icon-action" id="athlete-new" type="button" aria-label="Athlet anlegen" title="Athlet anlegen">
                    <span aria-hidden="true">＋</span><span class="masterdata-icon-action__label">Athlet</span>
                  </button>
                </div>
              </div>
              <p class="settings-note masterdata-list-hint">Athlet antippen, um Details, Kontakte und Gruppenzuordnung zu öffnen.</p>
              <div class="masterdata-list" id="athlete-list" aria-live="polite"></div>

              <div class="masterdata-athlete-backdrop" id="athlete-overlay" hidden>
                <section class="masterdata-athlete-dialog" role="dialog" aria-modal="true" aria-labelledby="athlete-overlay-title">
                  <header class="masterdata-athlete-header">
                    <div>
                      <p class="eyebrow">Athlet</p>
                      <h2 id="athlete-overlay-title">Athlet</h2>
                      <p class="settings-note" id="athlete-overlay-meta"></p>
                    </div>
                    <button class="button button--secondary masterdata-overlay-close" id="athlete-overlay-close" type="button" aria-label="Athletenfenster schließen" title="Schließen">✕</button>
                  </header>

                  <div class="masterdata-athlete-body">
                    <section id="athlete-detail">
                      <p class="masterdata-athlete-note" id="athlete-detail-notes" hidden></p>
                      <div class="masterdata-athlete-actions" id="athlete-detail-actions">
                        <button class="button button--secondary" id="athlete-detail-edit" type="button"><span aria-hidden="true">✎</span> Bearbeiten</button>
                        <button class="button button--secondary" id="athlete-detail-contact-new" type="button"><span aria-hidden="true">＋</span> Kontakt</button>
                        <button class="button button--secondary" id="athlete-detail-group-new" type="button"><span aria-hidden="true">＋</span> Gruppe</button>
                        <button class="button button--secondary" id="athlete-detail-user" type="button"><span aria-hidden="true">👤</span> Benutzer</button>
                        <button class="button button--danger" id="athlete-detail-deactivate" type="button"><span aria-hidden="true">⏸</span> Deaktivieren</button>
                         <button class="button button--primary" id="athlete-detail-reactivate" type="button" hidden>Wieder aktivieren</button>
                      </div>
                      <section class="masterdata-athlete-contacts">
                        <div class="section-heading">
                          <div><p class="eyebrow">Kontakte</p><h3>Kontaktpersonen</h3></div>
                        </div>
                        <div class="masterdata-list" id="athlete-contact-list" aria-live="polite"></div>
                      </section>
                    </section>

                    <form class="card masterdata-form masterdata-overlay-form" id="athlete-form" hidden>
                      <div class="section-heading"><div><p class="eyebrow">Stammdaten</p><h2 id="athlete-form-title">Athlet anlegen</h2></div></div>
                      <div class="settings-grid">
                        <label>Vorname<input id="athlete-first-name" maxlength="80" required /></label>
                        <label>Nachname<input id="athlete-last-name" maxlength="80" required /></label>
                        <label>Jahrgang<input id="athlete-birth-year" type="number" min="1900" max="2100" inputmode="numeric" /></label>
                        <label>Notiz<input id="athlete-notes" maxlength="3000" /></label>
                      </div>
                      <div class="masterdata-form-actions">
                        <button class="button button--primary" id="athlete-submit-button" type="submit">Athlet anlegen</button>
                        <button class="button button--secondary" id="athlete-edit-cancel" type="button">Zurück</button>
                      </div>
                    </form>

                    <form class="card masterdata-form masterdata-overlay-form" id="athlete-contact-form" hidden>
                      <div class="section-heading">
                        <div><p class="eyebrow">Kontakt</p><h2 id="athlete-contact-form-title">Kontakt anlegen</h2></div>
                      </div>
                      <div class="settings-grid">
                        <label class="masterdata-athlete-fixed-owner">Athlet<select id="athlete-contact-athlete" required></select></label>
                        <label>Name<input id="athlete-contact-name" maxlength="120" required /></label>
                        <label>Beziehung<input id="athlete-contact-relationship" maxlength="80" placeholder="z. B. Mutter, Vater" /></label>
                        <label>Telefon<input id="athlete-contact-phone" maxlength="80" minlength="3" inputmode="tel" required /></label>
                        <label>Priorität<input id="athlete-contact-priority" type="number" min="1" max="1000" value="1" inputmode="numeric" required /></label>
                        <label class="setting-checkbox">
                          <input id="athlete-contact-emergency" type="checkbox" checked />
                          <span>Notfallkontakt</span>
                        </label>
                        <label>Notiz<input id="athlete-contact-notes" maxlength="3000" /></label>
                      </div>
                      <div class="masterdata-form-actions">
                        <button class="button button--primary" id="athlete-contact-submit-button" type="submit">Kontakt anlegen</button>
                        <button class="button button--secondary" id="athlete-contact-edit-cancel" type="button">Zurück</button>
                      </div>
                    </form>

                    <form class="card masterdata-form masterdata-overlay-form" id="athlete-group-form" hidden>
                      <div class="section-heading"><div><p class="eyebrow">Gruppe</p><h2>Athlet zuordnen</h2></div></div>
                      <div class="settings-grid">
                        <label class="masterdata-athlete-fixed-owner">Athlet<select id="athlete-group-athlete" required></select></label>
                        <label>Trainingsgruppe<select id="athlete-group-group" required></select></label>
                        <label>Beginn<input id="athlete-group-started-on" type="date" required /></label>
                      </div>
                      <div class="masterdata-form-actions">
                        <button class="button button--primary" type="submit">Zuordnung anlegen</button>
                        <button class="button button--secondary" id="athlete-group-cancel" type="button">Zurück</button>
                      </div>
                    </form>

                    <form class="card masterdata-form masterdata-overlay-form" id="athlete-user-form" hidden>
                      <div class="section-heading">
                        <div><p class="eyebrow">Benutzer</p><h2>Athleten-Benutzer anlegen</h2></div>
                      </div>
                      <p class="settings-note">Der Benutzer wird direkt mit diesem Athleten verknüpft. Beim ersten Login muss das temporäre Passwort geändert werden.</p>
                      <p class="message message--error" id="athlete-user-message" role="alert" hidden></p>
                      <p class="message message--success" id="athlete-user-success" role="status" hidden></p>
                      <div class="settings-grid">
                        <label>Benutzername<input id="athlete-user-username" minlength="3" maxlength="30" pattern="[a-z0-9._]+" autocomplete="off" required /></label>
                        <label>Anzeigename<input id="athlete-user-display-name" maxlength="120" autocomplete="off" required /></label>
                        <label>E-Mail optional<input id="athlete-user-email" type="email" maxlength="320" autocomplete="off" /></label>
                        <label>Temporäres Passwort<input id="athlete-user-password" type="password" minlength="8" maxlength="128" autocomplete="new-password" required /></label>
                      </div>
                      <div class="masterdata-form-actions">
                        <button class="button button--primary" type="submit">Benutzer anlegen</button>
                        <button class="button button--secondary" id="athlete-user-cancel" type="button">Zurück</button>
                      </div>
                    </form>
                  </div>
                </section>
              </div>
            </section>

            <section class="masterdata-panel" data-masterdata-panel="trainers" hidden>
              <div class="section-heading masterdata-list-heading">
                <div><p class="eyebrow">Trainer</p><h2>Aktuelle Trainer <span class="masterdata-inline-count" id="trainer-count">(0)</span></h2></div>
                <label class="masterdata-inactive-toggle"><input id="trainer-show-inactive" type="checkbox" /> Inaktive</label>
                <button class="button button--primary masterdata-icon-action" id="trainer-new" type="button" aria-label="Trainer anlegen" title="Trainer anlegen">
                  <span aria-hidden="true">＋</span><span class="masterdata-icon-action__label">Trainer</span>
                </button>
              </div>
              <p class="settings-note masterdata-list-hint">Trainer antippen, um Details, Gruppen- und Benutzerzuordnung zu öffnen.</p>
              <div class="masterdata-list" id="trainer-list" aria-live="polite"></div>

              <div class="masterdata-athlete-backdrop" id="trainer-overlay" hidden>
                <section class="masterdata-athlete-dialog" role="dialog" aria-modal="true" aria-labelledby="trainer-overlay-title">
                  <header class="masterdata-athlete-header">
                    <div>
                      <p class="eyebrow">Trainer</p>
                      <h2 id="trainer-overlay-title">Trainer</h2>
                      <p class="settings-note" id="trainer-overlay-meta"></p>
                    </div>
                    <button class="button button--secondary masterdata-overlay-close" id="trainer-overlay-close" type="button" aria-label="Trainerfenster schließen" title="Schließen">✕</button>
                  </header>
                  <div class="masterdata-athlete-body">
                    <section id="trainer-detail">
                      <p class="masterdata-athlete-note" id="trainer-detail-notes" hidden></p>
                      <div class="masterdata-athlete-actions">
                        <button class="button button--secondary" id="trainer-detail-edit" type="button"><span aria-hidden="true">✎</span> Bearbeiten</button>
                        <button class="button button--secondary" id="trainer-detail-group" type="button"><span aria-hidden="true">＋</span> Gruppe</button>
                        <button class="button button--secondary" id="trainer-detail-user" type="button"><span aria-hidden="true">👤</span> Benutzer</button>
                        <button class="button button--danger" id="trainer-detail-deactivate" type="button"><span aria-hidden="true">⏸</span> Deaktivieren</button>
                         <button class="button button--primary" id="trainer-detail-reactivate" type="button" hidden>Wieder aktivieren</button>
                      </div>
                    </section>

                    <form class="card masterdata-form masterdata-overlay-form" id="trainer-form" hidden>
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
                        <button class="button button--secondary" id="trainer-edit-cancel" type="button">Zurück</button>
                      </div>
                    </form>

                    <form class="card masterdata-form masterdata-overlay-form" id="trainer-group-form" hidden>
                      <div class="section-heading"><div><p class="eyebrow">Gruppe</p><h2>Trainer zuordnen</h2></div></div>
                      <div class="settings-grid">
                        <label class="masterdata-athlete-fixed-owner">Trainer<select id="trainer-group-trainer" required></select></label>
                        <label>Trainingsgruppe<select id="trainer-group-group" required></select></label>
                      </div>
                      <div class="masterdata-form-actions">
                        <button class="button button--primary" type="submit">Zuordnung anlegen</button>
                        <button class="button button--secondary" id="trainer-group-cancel" type="button">Zurück</button>
                      </div>
                    </form>

                    <section class="card masterdata-form masterdata-overlay-form" id="trainer-identity-admin" hidden>
                      <div class="section-heading">
                        <div><p class="eyebrow">Benutzer</p><h2>Trainer-Benutzer</h2></div>
                        <button class="button button--secondary" id="trainer-identity-load" type="button">Verwalten</button>
                      </div>
                      <p class="settings-note">Nur für Administratoren. Die Zuordnung wird erst auf ausdrücklichen Aufruf geladen. Ein neu angelegter Trainer-Benutzer muss beim ersten Login das temporäre Passwort ändern.</p>
                      <p class="message message--error" id="trainer-identity-message" role="alert" hidden></p>
                      <p class="message message--success" id="trainer-identity-success" role="status" hidden></p>
                      <div id="trainer-identity-workspace" hidden>
                        <form id="trainer-user-form">
                          <div class="section-heading"><div><p class="eyebrow">Neu</p><h3>Trainer-Benutzer anlegen</h3></div></div>
                          <div class="settings-grid">
                            <label>Benutzername<input id="trainer-user-username" minlength="3" maxlength="30" pattern="[a-z0-9._]+" autocomplete="off" required /></label>
                            <label>Anzeigename<input id="trainer-user-display-name" maxlength="120" autocomplete="off" required /></label>
                            <label>E-Mail optional<input id="trainer-user-email" type="email" maxlength="320" autocomplete="off" /></label>
                            <label>Temporäres Passwort<input id="trainer-user-password" type="password" minlength="8" maxlength="128" autocomplete="new-password" required /></label>
                            <label class="masterdata-athlete-fixed-owner">Trainer<select id="trainer-user-trainer" required></select></label>
                          </div>
                          <button class="button button--primary" type="submit">Benutzer anlegen</button>
                        </form>
                        <div class="masterdata-list masterdata-trainer-identity-list" id="trainer-identity-list" aria-live="polite"></div>
                        <form id="trainer-identity-form">
                          <div class="section-heading"><div><p class="eyebrow">Bestehend</p><h3>Benutzer diesem Trainer zuordnen</h3></div></div>
                          <div class="settings-grid">
                            <label>Benutzer<select id="trainer-identity-identity" required></select></label>
                            <label class="masterdata-athlete-fixed-owner">Trainer<select id="trainer-identity-trainer" required></select></label>
                          </div>
                          <button class="button button--secondary" type="submit">Zuordnung speichern</button>
                        </form>
                      </div>
                      <div class="masterdata-form-actions">
                        <span></span>
                        <button class="button button--secondary" id="trainer-identity-close" type="button">Zurück</button>
                      </div>
                    </section>
                  </div>
                </section>
              </div>
            </section>

            <section class="masterdata-panel" data-masterdata-panel="groups" hidden>
              <div class="section-heading masterdata-list-heading">
                <div><p class="eyebrow">Trainingsgruppen</p><h2>Aktuelle Gruppen <span class="masterdata-inline-count" id="group-count">(0)</span></h2></div>
                <label class="masterdata-inactive-toggle"><input id="group-show-inactive" type="checkbox" /> Inaktive</label>
                <button class="button button--primary masterdata-icon-action" id="group-new" type="button" aria-label="Trainingsgruppe anlegen" title="Trainingsgruppe anlegen">
                  <span aria-hidden="true">＋</span><span class="masterdata-icon-action__label">Gruppe</span>
                </button>
              </div>
              <p class="settings-note masterdata-list-hint">Gruppe antippen, um Details und Bearbeitung zu öffnen.</p>
              <div class="masterdata-list" id="group-list" aria-live="polite"></div>

              <div class="masterdata-athlete-backdrop" id="group-overlay" hidden>
                <section class="masterdata-athlete-dialog" role="dialog" aria-modal="true" aria-labelledby="group-overlay-title">
                  <header class="masterdata-athlete-header">
                    <div>
                      <p class="eyebrow">Trainingsgruppe</p>
                      <h2 id="group-overlay-title">Gruppe</h2>
                      <p class="settings-note" id="group-overlay-meta"></p>
                    </div>
                    <button class="button button--secondary masterdata-overlay-close" id="group-overlay-close" type="button" aria-label="Gruppenfenster schließen" title="Schließen">✕</button>
                  </header>
                  <div class="masterdata-athlete-body">
                    <section id="group-detail">
                      <p class="masterdata-athlete-note" id="group-detail-description" hidden></p>
                      <div class="masterdata-athlete-actions masterdata-group-actions">
                        <button class="button button--secondary" id="group-detail-edit" type="button"><span aria-hidden="true">✎</span> Bearbeiten</button>
                      </div>
                    </section>
                    <form class="card masterdata-form masterdata-overlay-form" id="group-form" hidden>
                      <div class="section-heading"><div><p class="eyebrow">Stammdaten</p><h2 id="group-form-title">Trainingsgruppe anlegen</h2></div></div>
                      <div class="settings-grid">
                        <label>Name<input id="group-name" minlength="2" maxlength="100" required /></label>
                        <label>Kurzname<input id="group-short-name" maxlength="20" /></label>
                        <label>Beschreibung<input id="group-description" maxlength="1000" /></label>
                        <label>Anwesenheit
                          <select id="group-attendance-mode">
                            <option value="trainer_roll_call">Trainer-Erfassung</option>
                            <option value="self_registration">Selbstanmeldung</option>
                          </select>
                        </label>
                        <label>Sortierung<input id="group-sort-order" type="number" min="0" max="10000" value="100" inputmode="numeric" /></label>
                      </div>
                      <div class="masterdata-form-actions">
                        <button class="button button--primary" id="group-submit-button" type="submit">Gruppe anlegen</button>
                        <button class="button button--secondary" id="group-edit-cancel" type="button">Zurück</button>
                      </div>
                    </form>
                  </div>
                </section>
              </div>
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

          <section class="app-section" data-app-section="registration" id="registration" hidden>
            <section class="hero">
              <p class="eyebrow">Training</p>
              <h1>Trainingsanmeldung</h1>
              <p class="summary">Gib für deine Trainingsgruppen an, ob du kommst.</p>
            </section>

            <p class="message message--error" id="registration-message" role="alert" hidden></p>
            <p class="message message--success" id="registration-success" role="status" hidden></p>

            <section class="card registration-week-toolbar">
              <div class="registration-week-nav">
                <button class="button button--secondary registration-week-arrow" id="registration-week-prev" type="button" aria-label="Vorherige Woche">‹</button>
                <div class="registration-week-title">
                  <strong id="registration-week-label">Diese Woche</strong>
                  <small>Montag bis Sonntag</small>
                </div>
                <button class="button button--secondary registration-week-arrow" id="registration-week-next" type="button" aria-label="Nächste Woche">›</button>
              </div>
              <div class="registration-week-actions">
                <button class="button button--secondary" id="registration-week-current" type="button">Aktuelle Woche</button>
                <button class="button button--secondary" id="registration-reload" type="button">↻ Neu laden</button>
              </div>
            </section>

            <div class="registration-list" id="registration-list" aria-live="polite"></div>
          </section>

          <section class="app-section" data-app-section="kindertraining" id="kindertraining" hidden>
            <section class="hero">
              <p class="eyebrow">Training</p>
              <h1>Anwesenheit</h1>
              <p class="summary">Die ganze Trainingswoche im Blick: Voranmeldungen prüfen und die tatsächliche Anwesenheit gesammelt erfassen.</p>
            </section>

            <p class="message message--error" id="kindertraining-message" role="alert" hidden></p>
            <p class="message message--success" id="kindertraining-success" role="status" hidden></p>

            <section class="card kindertraining-week-toolbar">
              <label>Trainingsgruppe
                <select id="kindertraining-group" required>
                  <option value="">Gruppe wählen</option>
                </select>
              </label>
              <div class="kindertraining-week-nav">
                <button class="button button--secondary kindertraining-week-arrow" id="kindertraining-week-prev" type="button" aria-label="Vorherige Woche">‹</button>
                <div class="kindertraining-week-title">
                  <strong id="kindertraining-week-label">Diese Woche</strong>
                  <small>Montag bis Sonntag</small>
                </div>
                <button class="button button--secondary kindertraining-week-arrow" id="kindertraining-week-next" type="button" aria-label="Nächste Woche">›</button>
              </div>
              <div class="kindertraining-week-actions">
                <button class="button button--secondary" id="kindertraining-week-current" type="button">Aktuelle Woche</button>
                <button class="button button--secondary" id="kindertraining-week-reload" type="button">↻ Neu laden</button>
              </div>
            </section>

            <section class="kindertraining-week" id="kindertraining-week" hidden>
              <div class="card kindertraining-week-savebar">
                <div>
                  <strong id="kindertraining-week-state">Gespeichert</strong>
                  <small>Speichert nur geänderte Tage dieser Woche.</small>
                </div>
                <button class="button button--primary" id="kindertraining-week-save" type="button" disabled>💾 Speichern</button>
              </div>
              <div class="kindertraining-week-days" id="kindertraining-week-days" aria-live="polite"></div>
            </section>
          </section>

          ${ULC_EXERCISE_CATALOG_HTML}
${ULC_TRAINING_BLOCKS_HTML}
${ULC_TRAINING_PLANS_HTML}
${ULC_TRAINING_DOCUMENTATION_HTML}

          <section class="app-section" data-app-section="useful" id="useful" hidden>
            <section class="hero">
              <p class="eyebrow">Werkzeuge</p>
              <h1>Nützliches</h1>
              <p class="summary">Kleine Helfer für Training und Organisation.</p>
            </section>
            <section class="utility-grid">
              <article class="card utility-card">
                <div>
                  <p class="eyebrow">Training</p>
                  <h2>Intervall-Countdown</h2>
                  <p>Belastungs- und Pausenintervalle mit optionaler Sprachausgabe.</p>
                </div>
                <button class="button button--primary" type="button" data-open-view="countdown">Countdown öffnen</button>
              </article>
            </section>
          </section>

          ${ULC_USER_ADMIN_HTML}

          <section class="app-section" data-app-section="countdown" id="countdown" hidden>
            <section class="hero countdown-hero">
              <div>
                <p class="eyebrow">Nützliches</p>
                <h1>Intervall-Countdown</h1>
                <p class="summary">Für Belastungs- und Pausenintervalle im Training.</p>
              </div>
              <button class="button button--secondary" type="button" data-open-view="useful">← Nützliches</button>
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
                <button class="button button--stop" id="stop-button" type="button" hidden>Stop</button>
                <button class="button button--reset" id="reset-button" type="button" disabled>Reset</button>
              </div>
            </section>

            <details class="card countdown-settings">
              <summary>⚙ Einstellungen</summary>
              <section class="settings-panel" id="settings" aria-labelledby="settings-title">
                <div class="section-heading">
                  <div>
                    <p class="eyebrow">Countdown</p>
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
            </details>
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
  --ui-space: 12px;
  --ui-panel-padding: 14px;
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
input:focus-visible, select:focus-visible, textarea:focus-visible, button:focus-visible, a:focus-visible, summary:focus-visible {
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
.app-session-message {
  position: fixed;
  right: 12px;
  bottom: 66px;
  left: 12px;
  z-index: 30;
  width: min(calc(100% - 24px), 52rem);
  margin: 0 auto;
  box-shadow: 0 8px 24px rgb(15 23 42 / 16%);
}
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
/* Shared ULC page hierarchy; editor dialogs keep their existing layout. */
.app-section,
.app-section > .hero,
.app-section > .hero > div,
.section-heading > div,
.card { min-width: 0; }
.app-section > .hero h1 {
  margin-bottom: 6px;
  font-size: clamp(1.55rem, 4vw, 2rem);
  line-height: 1.12;
  letter-spacing: -.03em;
  overflow-wrap: anywhere;
}
.app-section > .hero .summary {
  max-width: 62ch;
  line-height: 1.45;
}
.app-section > .hero .eyebrow { margin-bottom: 4px; }
.section-heading h2,
.section-heading h3 { line-height: 1.2; overflow-wrap: anywhere; }
@media (max-width: 480px) {
  .app-section > .hero h1 { font-size: 1.55rem; }
}
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
}
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
.masterdata-row__right {
  grid-column: 2;
  grid-row: 1;
  max-width: 48vw;
  overflow: hidden;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.masterdata-row__secondary {
  grid-column: 1 / -1;
  grid-row: 2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.masterdata-inline-count {
  color: var(--secondary);
  font-size: .78em;
  font-weight: 700;
}
.masterdata-row__actions { grid-column: 2; grid-row: 1 / 3; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px; padding: 0; }
.masterdata-form-actions { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
.masterdata-heading-actions { display: flex; align-items: center; gap: 8px; }
.masterdata-icon-action { min-height: 38px; padding: 7px 10px; }
.masterdata-list-hint { margin: -4px 0 8px; }
.masterdata-row--interactive { cursor: pointer; transition: background .15s ease, transform .15s ease; }
.masterdata-row--interactive:hover { background: var(--surface-soft); }
.masterdata-row--interactive:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.masterdata-athlete-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  align-items: end;
  background: rgb(15 23 42 / 48%);
  backdrop-filter: blur(6px);
}
.masterdata-athlete-backdrop[hidden] { display: none; }
.masterdata-athlete-dialog {
  width: min(760px, 100%);
  max-height: min(92vh, 900px);
  margin: 0 auto;
  overflow: auto;
  border-radius: 22px 22px 0 0;
  background: var(--page);
  box-shadow: 0 -18px 50px rgb(15 23 42 / 18%);
}
.masterdata-athlete-header {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  background: rgb(255 255 255 / 96%);
  backdrop-filter: blur(10px);
}
.masterdata-athlete-header h2 { margin: 2px 0 0; }
.masterdata-overlay-close { min-width: 42px; width: 42px; padding-inline: 0; font-size: 1rem; }
.masterdata-athlete-body {
  display: grid;
  gap: 12px;
  padding: 12px 12px max(16px, env(safe-area-inset-bottom));
}
.masterdata-athlete-actions {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}
.masterdata-athlete-note {
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--surface-soft);
  white-space: pre-wrap;
}
.masterdata-group-actions { grid-template-columns: minmax(0, 180px); }
.masterdata-trainer-identity-list { margin: 10px 0; }
.masterdata-athlete-contacts { display: grid; gap: 8px; }
.masterdata-athlete-contacts h3 { margin: 0; }
.masterdata-overlay-form { margin: 0; }
.masterdata-athlete-fixed-owner { display: none !important; }
body.masterdata-athlete-overlay-open { overflow: hidden; }

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
.registration-week-toolbar {
  display: grid;
  gap: 8px;
  margin-bottom: 10px;
  padding: 10px;
}
.registration-week-nav {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 44px;
  align-items: center;
  gap: 8px;
}
.registration-week-arrow { min-width: 44px; padding-inline: 0; font-size: 1.25rem; }
.registration-week-title { min-width: 0; text-align: center; }
.registration-week-title strong,
.registration-week-title small { display: block; }
.registration-week-title small { margin-top: 2px; color: var(--secondary); font-size: .7rem; }
.registration-week-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.registration-week-actions .button { min-height: 40px; }
.registration-list { display: grid; gap: 12px; }
.registration-day { display: grid; gap: 7px; }
.registration-day__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 0 2px;
}
.registration-day__head strong { font-size: .88rem; }
.registration-day__head span { color: var(--secondary); font-size: .72rem; }
.registration-card {
  display: grid;
  gap: 10px;
  padding: 12px;
}
.registration-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.registration-card__head strong { display: block; }
.registration-card__head small {
  display: block;
  margin-top: 2px;
  color: var(--secondary);
}
.registration-current {
  border-radius: 999px;
  padding: 4px 8px;
  background: var(--muted);
  color: var(--secondary);
  font-size: .72rem;
  font-weight: 800;
  white-space: nowrap;
}
.registration-current[data-intention="attending"] {
  background: #dcfce7;
  color: #166534;
}
.registration-current[data-intention="not_attending"] {
  background: #fee2e2;
  color: #991b1b;
}
.registration-current[data-intention="maybe"] {
  background: #fef3c7;
  color: #92400e;
}
.registration-actions {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}
.registration-action {
  min-height: 44px;
  padding: 6px 4px;
  font-size: .72rem;
}
.registration-action[aria-pressed="true"] {
  border-color: var(--accent);
  background: #dbeafe;
  color: var(--accent);
}
.registration-action[data-intention="attending"][aria-pressed="true"] {
  border-color: #86efac;
  background: #dcfce7;
  color: #166534;
}
.registration-action[data-intention="not_attending"][aria-pressed="true"] {
  border-color: #fecaca;
  background: #fee2e2;
  color: #991b1b;
}
.registration-action[data-intention="maybe"][aria-pressed="true"] {
  border-color: #fde68a;
  background: #fef3c7;
  color: #92400e;
}
.registration-cancelled {
  color: var(--danger);
  font-weight: 750;
}
.registration-empty {
  padding: 18px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--control-radius);
  color: #64748b;
  text-align: center;
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
.kindertraining-registration {
  display: inline-flex;
  width: fit-content;
  max-width: 100%;
  align-items: center;
  gap: 4px;
  border-radius: 999px;
  padding: 3px 7px;
  background: var(--muted);
  color: var(--secondary);
  font-size: .7rem;
  font-weight: 750;
}
.kindertraining-registration[data-intention="attending"] {
  background: #dcfce7;
  color: #166534;
}
.kindertraining-registration[data-intention="not_attending"] {
  background: #fee2e2;
  color: #991b1b;
}
.kindertraining-registration[data-intention="maybe"] {
  background: #fef3c7;
  color: #92400e;
}
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
.timer-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
@media (min-width: 620px) {
  .timer-actions { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
.timer-stage[data-mode="stopped"] {
  background: var(--muted);
  border-color: var(--border-strong);
  color: var(--text);
}
.timer-actions .button { min-height: 58px; font-size: 1rem; }
.button--start { background: #0f172a; color: white; }
.button--pause { border-color: #f59e0b; background: #fef3c7; color: #92400e; }
.button--stop { border-color: #fca5a5; background: #fee2e2; color: #991b1b; }
.button--reset { border-color: var(--border-strong); background: white; color: var(--secondary); }
.utility-grid { display: grid; gap: 12px; }
.utility-card { display: grid; gap: 12px; padding: 16px; }
.countdown-hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 10px;
}
.countdown-settings {
  margin-top: 16px;
  overflow: hidden;
  padding: 0;
}
.countdown-settings > summary {
  min-height: var(--touch);
  padding: 12px 14px;
  cursor: pointer;
  font-weight: 800;
  list-style: none;
}
.countdown-settings > summary::-webkit-details-marker { display: none; }
.countdown-settings[open] > summary { border-bottom: 1px solid var(--border); }
.settings-panel { margin-top: 0; padding: 16px; scroll-margin-top: 80px; }
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
  .countdown-hero { align-items: stretch; flex-direction: column; }
  .masterdata-form .settings-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .masterdata-overlay-form .settings-grid { grid-template-columns: 1fr; }
  .masterdata-athlete-actions { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .masterdata-athlete-actions .button { min-height: 42px; padding: 8px 9px; font-size: .82rem; }
  .masterdata-icon-action__label { display: none; }
  .masterdata-icon-action { min-width: 40px; width: 40px; padding-inline: 0; font-size: 1.1rem; }
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
  .registration-selector,
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
${ULC_TRAINING_BLOCKS_CSS}
${ULC_TRAINING_PLANS_CSS}
${ULC_TRAINING_DOCUMENTATION_CSS}

.kindertraining-week-toolbar {
  display: grid;
  gap: 10px;
  margin-bottom: 10px;
  padding: 12px;
}

.kindertraining-week-nav {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 44px;
  align-items: center;
  gap: 8px;
}

.kindertraining-week-arrow {
  min-width: 44px;
  padding-inline: 0;
  font-size: 1.25rem;
}

.kindertraining-week-title {
  min-width: 0;
  text-align: center;
}

.kindertraining-week-title strong,
.kindertraining-week-title small {
  display: block;
}

.kindertraining-week-title small {
  margin-top: 2px;
  color: var(--secondary);
  font-size: .7rem;
}

.kindertraining-week-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.kindertraining-week {
  display: grid;
  gap: 10px;
}

.kindertraining-week-savebar {
  position: sticky;
  top: 6px;
  z-index: 8;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
}

.kindertraining-week-savebar strong,
.kindertraining-week-savebar small {
  display: block;
}

.kindertraining-week-savebar small {
  margin-top: 2px;
  color: var(--secondary);
  font-size: .7rem;
}

.kindertraining-week-savebar .button {
  flex: 0 0 auto;
}

.kindertraining-week-days {
  display: grid;
  gap: 8px;
}

.kindertraining-week-day {
  overflow: hidden;
  padding: 0;
}

.kindertraining-day-toggle {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(92px, .7fr) minmax(0, 1.8fr) auto;
  align-items: center;
  gap: 8px;
  border: 0;
  background: white;
  color: inherit;
  padding: 11px 12px;
  text-align: left;
  cursor: pointer;
}

.kindertraining-day-title strong,
.kindertraining-day-title small {
  display: block;
}

.kindertraining-day-title small {
  margin-top: 2px;
  color: var(--secondary);
  font-size: .7rem;
}

.kindertraining-day-registration-summary {
  min-width: 0;
  color: var(--secondary);
  font-size: .72rem;
  line-height: 1.35;
}

.kindertraining-day-marker {
  font-weight: 900;
  color: var(--secondary);
}

.kindertraining-day-details {
  display: grid;
  gap: 10px;
  padding: 0 12px 12px;
  border-top: 1px solid var(--border);
}

.kindertraining-day-details > :first-child {
  margin-top: 10px;
}

.kindertraining-day-session-controls {
  display: grid;
  grid-template-columns: minmax(100px, .6fr) minmax(0, 1.4fr);
  gap: 8px;
}

.kindertraining-day-session-controls label {
  display: grid;
  gap: 4px;
  color: var(--secondary);
  font-size: .72rem;
  font-weight: 700;
}

.kindertraining-day-session-controls input,
.kindertraining-day-session-controls select {
  width: 100%;
}

.kindertraining-week-empty {
  padding: 18px;
  color: var(--secondary);
  text-align: center;
}

@media (max-width: 560px) {
  .kindertraining-day-toggle {
    grid-template-columns: minmax(80px, .8fr) minmax(0, 1.8fr) auto;
  }

  .kindertraining-day-registration-summary {
    font-size: .67rem;
  }

  .kindertraining-day-session-controls {
    grid-template-columns: 1fr;
  }

  .kindertraining-week-savebar {
    align-items: stretch;
  }

  .kindertraining-week-savebar .button {
    min-width: 108px;
  }
}

/* Mobile editor surfaces: shared geometry without changing form actions or handlers. */
@media (max-width: 480px) {
  .masterdata-athlete-backdrop,
  .masterdata-import-overlay { align-items: stretch; }
  .masterdata-athlete-dialog,
  .masterdata-import-dialog {
    width: 100%;
    height: 100dvh;
    max-height: 100dvh;
    border-radius: 0;
  }
  .masterdata-import-body,
  .masterdata-athlete-body,
  .masterdata-overlay-form,
  .masterdata-form .settings-grid > * { min-width: 0; }
  .masterdata-import-body { min-height: 0; }
  .masterdata-athlete-header,
  .masterdata-import-header {
    padding: max(10px, env(safe-area-inset-top)) 12px 10px;
  }
  .masterdata-athlete-header > div:first-child,
  .masterdata-import-header > div:first-child { min-width: 0; }
  .masterdata-athlete-header h2 { overflow-wrap: anywhere; line-height: 1.2; }
  .masterdata-overlay-close {
    flex: 0 0 44px;
    min-width: 44px;
    width: 44px;
    min-height: 44px;
  }
  .masterdata-import-footer {
    padding-bottom: max(12px, env(safe-area-inset-bottom));
  }
  .kindertraining-week-savebar {
    top: max(6px, env(safe-area-inset-top));
  }
}
/* Compact list layout: keep secondary data readable instead of clipping it. */
@media (max-width: 480px) {
  .masterdata-row { min-width: 0; padding: 9px 10px; }
  .masterdata-row__right { max-width: min(40vw, 170px); }
  .masterdata-row__secondary {
    white-space: normal;
    overflow-wrap: anywhere;
    text-overflow: clip;
  }
  .registration-card { gap: 8px; padding: 10px; }
  .registration-card__head > * { min-width: 0; }
  .registration-card__head strong { overflow-wrap: anywhere; }
  .kindertraining-statuses {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  .kindertraining-status {
    min-width: 0;
    min-height: var(--touch);
    overflow-wrap: anywhere;
  }
}
@media (max-width: 380px) {
  .kindertraining-day-toggle {
    grid-template-columns: minmax(0, 1fr) auto;
    min-height: var(--touch);
  }
  .kindertraining-day-title { grid-column: 1; grid-row: 1; min-width: 0; }
  .kindertraining-day-marker { grid-column: 2; grid-row: 1; }
  .kindertraining-day-registration-summary {
    grid-column: 1 / -1;
    grid-row: 2;
    overflow-wrap: anywhere;
  }
}

.kindertraining-week-day--unavailable {
  display: grid;
  gap: 3px;
  padding: 12px;
  border-style: dashed;
}
.kindertraining-week-day--unavailable small { color: var(--secondary); }
/* Keep functional page controls visible without repetitive hero descriptions. */
.app-section[data-app-section]:not([data-app-section="home"]) > .hero .summary { display: none; }
.masterdata-inactive-toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: .76rem;
  color: var(--secondary);
  white-space: nowrap;
}
.masterdata-inactive-toggle input { width: 18px; height: 18px; margin: 0; }
.masterdata-heading-actions { flex-wrap: wrap; justify-content: flex-end; }
@media (max-width: 480px) {
  .masterdata-list-heading > div:first-child { min-width: 0; }
  .masterdata-heading-actions { gap: 6px; }
}

/* Uniform compact create action: semantic name remains available to assistive tech. */
.masterdata-icon-action {
  min-width: 42px;
  width: 42px;
  min-height: var(--touch);
  padding: 0;
  justify-content: center;
  font-size: 1.18rem;
}
.masterdata-icon-action__label { display: none; }

${ULC_USER_ADMIN_CSS}
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
  passwordSignOut: document.querySelector("#password-sign-out"),
  appSignOut: document.querySelector("#app-sign-out"),
  appSessionMessage: document.querySelector("#app-session-message"),
  welcomeEyebrow: document.querySelector("#welcome-eyebrow"),
  appMessage: document.querySelector("#app-message"),
  countdownQuickAction: document.querySelector("#countdown-quick-action"),
  countdownAccessLabel: document.querySelector("#countdown-access-label"),
  masterdataQuickAction: document.querySelector("#masterdata-quick-action"),
  masterdataAccessLabel: document.querySelector("#masterdata-access-label"),
  userAdminDashboard: document.querySelector("#user-admin-dashboard"),
  registrationDashboard: document.querySelector("#registration-dashboard"),
  registrationQuickAction: document.querySelector("#registration-quick-action"),
  registrationAccessLabel: document.querySelector("#registration-access-label"),
  registrationMessage: document.querySelector("#registration-message"),
  registrationSuccess: document.querySelector("#registration-success"),
  registrationWeekPrev: document.querySelector("#registration-week-prev"),
  registrationWeekNext: document.querySelector("#registration-week-next"),
  registrationWeekCurrent: document.querySelector("#registration-week-current"),
  registrationWeekLabel: document.querySelector("#registration-week-label"),
  registrationReload: document.querySelector("#registration-reload"),
  registrationList: document.querySelector("#registration-list"),
  kindertrainingQuickAction: document.querySelector("#kindertraining-quick-action"),
  kindertrainingAccessLabel: document.querySelector("#kindertraining-access-label"),
  kindertrainingMessage: document.querySelector("#kindertraining-message"),
  kindertrainingSuccess: document.querySelector("#kindertraining-success"),
  kindertrainingGroup: document.querySelector("#kindertraining-group"),
  kindertrainingWeekPrev: document.querySelector("#kindertraining-week-prev"),
  kindertrainingWeekNext: document.querySelector("#kindertraining-week-next"),
  kindertrainingWeekCurrent: document.querySelector("#kindertraining-week-current"),
  kindertrainingWeekReload: document.querySelector("#kindertraining-week-reload"),
  kindertrainingWeekLabel: document.querySelector("#kindertraining-week-label"),
  kindertrainingWeek: document.querySelector("#kindertraining-week"),
  kindertrainingWeekState: document.querySelector("#kindertraining-week-state"),
  kindertrainingWeekDays: document.querySelector("#kindertraining-week-days"),
  kindertrainingWeekSave: document.querySelector("#kindertraining-week-save"),
  kindertrainingDate: document.querySelector("#kindertraining-date"),
  kindertrainingLoad: document.querySelector("#kindertraining-load"),
  kindertrainingSession: document.querySelector("#kindertraining-session"),
  kindertrainingTitle: document.querySelector("#kindertraining-title"),
  kindertrainingMode: document.querySelector("#kindertraining-mode"),
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
  athleteShowInactive: document.querySelector("#athlete-show-inactive"),
  trainerShowInactive: document.querySelector("#trainer-show-inactive"),
  groupShowInactive: document.querySelector("#group-show-inactive"),
  athleteNew: document.querySelector("#athlete-new"),
  athleteOverlay: document.querySelector("#athlete-overlay"),
  athleteOverlayClose: document.querySelector("#athlete-overlay-close"),
  athleteOverlayTitle: document.querySelector("#athlete-overlay-title"),
  athleteOverlayMeta: document.querySelector("#athlete-overlay-meta"),
  athleteDetail: document.querySelector("#athlete-detail"),
  athleteDetailNotes: document.querySelector("#athlete-detail-notes"),
  athleteDetailEdit: document.querySelector("#athlete-detail-edit"),
  athleteDetailContactNew: document.querySelector("#athlete-detail-contact-new"),
  athleteDetailGroupNew: document.querySelector("#athlete-detail-group-new"),
  athleteDetailUser: document.querySelector("#athlete-detail-user"),
  athleteDetailDeactivate: document.querySelector("#athlete-detail-deactivate"),
  athleteDetailReactivate: document.querySelector("#athlete-detail-reactivate"),
  athleteUserForm: document.querySelector("#athlete-user-form"),
  athleteUserMessage: document.querySelector("#athlete-user-message"),
  athleteUserSuccess: document.querySelector("#athlete-user-success"),
  athleteUserUsername: document.querySelector("#athlete-user-username"),
  athleteUserDisplayName: document.querySelector("#athlete-user-display-name"),
  athleteUserEmail: document.querySelector("#athlete-user-email"),
  athleteUserPassword: document.querySelector("#athlete-user-password"),
  athleteUserCancel: document.querySelector("#athlete-user-cancel"),
  trainerList: document.querySelector("#trainer-list"),
  trainerNew: document.querySelector("#trainer-new"),
  trainerOverlay: document.querySelector("#trainer-overlay"),
  trainerOverlayClose: document.querySelector("#trainer-overlay-close"),
  trainerOverlayTitle: document.querySelector("#trainer-overlay-title"),
  trainerOverlayMeta: document.querySelector("#trainer-overlay-meta"),
  trainerDetail: document.querySelector("#trainer-detail"),
  trainerDetailNotes: document.querySelector("#trainer-detail-notes"),
  trainerDetailEdit: document.querySelector("#trainer-detail-edit"),
  trainerDetailGroup: document.querySelector("#trainer-detail-group"),
  trainerDetailUser: document.querySelector("#trainer-detail-user"),
  trainerDetailDeactivate: document.querySelector("#trainer-detail-deactivate"),
  trainerDetailReactivate: document.querySelector("#trainer-detail-reactivate"),
  groupList: document.querySelector("#group-list"),
  groupNew: document.querySelector("#group-new"),
  groupOverlay: document.querySelector("#group-overlay"),
  groupOverlayClose: document.querySelector("#group-overlay-close"),
  groupOverlayTitle: document.querySelector("#group-overlay-title"),
  groupOverlayMeta: document.querySelector("#group-overlay-meta"),
  groupDetail: document.querySelector("#group-detail"),
  groupDetailDescription: document.querySelector("#group-detail-description"),
  groupDetailEdit: document.querySelector("#group-detail-edit"),
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
  athleteContactList: document.querySelector("#athlete-contact-list"),
  athleteContactForm: document.querySelector("#athlete-contact-form"),
  athleteContactAthlete: document.querySelector("#athlete-contact-athlete"),
  athleteContactName: document.querySelector("#athlete-contact-name"),
  athleteContactRelationship: document.querySelector("#athlete-contact-relationship"),
  athleteContactPhone: document.querySelector("#athlete-contact-phone"),
  athleteContactEmergency: document.querySelector("#athlete-contact-emergency"),
  athleteContactPriority: document.querySelector("#athlete-contact-priority"),
  athleteContactNotes: document.querySelector("#athlete-contact-notes"),
  athleteContactFormTitle: document.querySelector("#athlete-contact-form-title"),
  athleteContactSubmitButton: document.querySelector("#athlete-contact-submit-button"),
  athleteContactEditCancel: document.querySelector("#athlete-contact-edit-cancel"),
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
  groupAttendanceMode: document.querySelector("#group-attendance-mode"),
  groupSortOrder: document.querySelector("#group-sort-order"),
  groupFormTitle: document.querySelector("#group-form-title"),
  groupSubmitButton: document.querySelector("#group-submit-button"),
  groupEditCancel: document.querySelector("#group-edit-cancel"),
  athleteGroupForm: document.querySelector("#athlete-group-form"),
  athleteGroupAthlete: document.querySelector("#athlete-group-athlete"),
  athleteGroupGroup: document.querySelector("#athlete-group-group"),
  athleteGroupStartedOn: document.querySelector("#athlete-group-started-on"),
  athleteGroupCancel: document.querySelector("#athlete-group-cancel"),
  trainerGroupForm: document.querySelector("#trainer-group-form"),
  trainerGroupTrainer: document.querySelector("#trainer-group-trainer"),
  trainerGroupGroup: document.querySelector("#trainer-group-group"),
  trainerGroupCancel: document.querySelector("#trainer-group-cancel"),
  trainerIdentityClose: document.querySelector("#trainer-identity-close"),
  trainerIdentityAdmin: document.querySelector("#trainer-identity-admin"),
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
  stopButton: document.querySelector("#stop-button"),
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
  "registration",
  "kindertraining",
  "training-plans",
  "training-documentation",
  "exercise-catalog",
  "training-blocks",
  "masterdata",
  "users",
  "useful",
]);

let appNavMoreOpen = false;
let busy = false;
let countdownReady = false;
let masterdataReady = false;
let masterdataCanEdit = false;
let attendanceSessionGeneration = 0;
let selfRegistrationReady = false;
let selfRegistrationLoading = false;
let selfRegistrationSavingKeys = new Set();
let selfRegistrationConflictReloadPending = false;
let selfRegistrationWeekStart = "";
let selfRegistrationOptions = [];
let kindertrainingReady = false;
let kindertrainingLoading = false;
let kindertrainingGroups = [];
let kindertrainingSnapshot = null;
let kindertrainingWeekStart = "";
let kindertrainingWeekSnapshots = [];
let kindertrainingWeekDirtyDates = new Set();
let kindertrainingWeekExpandedDates = new Set();
let kindertrainingWeekFailedDates = new Set();
let kindertrainingWeekSaving = false;
let kindertrainingWeekLoadId = 0;
let kindertrainingLoadedGroupId = "";
let masterdataLoading = false;
let masterdataSessionGeneration = 0;
let masterdataExchangeBusy = false;
let masterdataImportPreviewData = null;
let masterdataImportPreviewToken = null;
let masterdataImportFileDraft = null;
let masterdataImportResultData = null;
let masterdataSnapshot = null;
let masterdataShowInactiveAthletes = false;
let masterdataShowInactiveTrainers = false;
let masterdataShowInactiveGroups = false;
let masterdataEdit = null;
let masterdataContactEdit = null;
let masterdataAthleteOverlayId = null;
let masterdataAthleteOverlayMode = "closed";
let masterdataTrainerOverlayId = null;
let masterdataTrainerOverlayMode = "closed";
let masterdataGroupOverlayId = null;
let masterdataGroupOverlayMode = "closed";
let masterdataSwipeStart = null;
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
elements.passwordSignOut?.addEventListener("click", () => void handleSignOut());
elements.appSignOut?.addEventListener("click", () => void handleSignOut());
elements.startButton?.addEventListener("click", () => void startCountdown());
elements.pauseButton?.addEventListener("click", () => void togglePause());
elements.stopButton?.addEventListener("click", () => void stopCountdown());
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
elements.athleteContactForm?.addEventListener("submit", (event) => void saveMasterdataAthleteContact(event));
elements.athleteNew?.addEventListener("click", openNewMasterdataAthlete);
elements.athleteShowInactive?.addEventListener("change", () => {
  masterdataShowInactiveAthletes = elements.athleteShowInactive.checked;
  if (masterdataSnapshot) renderMasterdata(masterdataSnapshot);
});
elements.trainerShowInactive?.addEventListener("change", () => {
  masterdataShowInactiveTrainers = elements.trainerShowInactive.checked;
  if (masterdataSnapshot) renderMasterdata(masterdataSnapshot);
});
elements.groupShowInactive?.addEventListener("change", () => {
  masterdataShowInactiveGroups = elements.groupShowInactive.checked;
  if (masterdataSnapshot) renderMasterdata(masterdataSnapshot);
});
elements.athleteOverlayClose?.addEventListener("click", closeMasterdataAthleteOverlay);
elements.athleteDetailEdit?.addEventListener("click", () => {
  const athlete = selectedMasterdataAthlete();
  if (athlete) beginMasterdataEdit({ type: "athlete", id: athlete.id, item: athlete });
});
elements.athleteDetailContactNew?.addEventListener("click", openNewMasterdataAthleteContact);
elements.athleteDetailGroupNew?.addEventListener("click", openNewMasterdataAthleteGroup);
elements.athleteDetailUser?.addEventListener("click", openMasterdataAthleteUser);
elements.athleteUserForm?.addEventListener("submit", (event) => void createAthleteUser(event));
elements.athleteUserCancel?.addEventListener("click", () => showMasterdataAthleteOverlayMode("detail"));
elements.athleteDetailDeactivate?.addEventListener("click", () => {
  const athlete = selectedMasterdataAthlete();
  if (athlete) void deactivateMasterdataEntity({ type: "athlete", id: athlete.id });
});
elements.athleteDetailReactivate?.addEventListener("click", () => {
  const athlete = selectedMasterdataAthlete();
  if (athlete) void reactivateMasterdataEntity({ type: "athlete", id: athlete.id });
});
elements.athleteContactEditCancel?.addEventListener("click", cancelMasterdataAthleteContactEdit);
elements.trainerForm?.addEventListener("submit", (event) => void createMasterdataTrainer(event));
elements.trainerNew?.addEventListener("click", openNewMasterdataTrainer);
elements.trainerOverlayClose?.addEventListener("click", closeMasterdataTrainerOverlay);
elements.trainerDetailEdit?.addEventListener("click", () => {
  const trainer = selectedMasterdataTrainer();
  if (trainer) beginMasterdataEdit({ type: "trainer", id: trainer.id, item: trainer });
});
elements.trainerDetailGroup?.addEventListener("click", openNewMasterdataTrainerGroup);
elements.trainerDetailUser?.addEventListener("click", openMasterdataTrainerIdentity);
elements.trainerDetailDeactivate?.addEventListener("click", () => {
  const trainer = selectedMasterdataTrainer();
  if (trainer) void deactivateMasterdataEntity({ type: "trainer", id: trainer.id });
});
elements.trainerDetailReactivate?.addEventListener("click", () => {
  const trainer = selectedMasterdataTrainer();
  if (trainer) void reactivateMasterdataEntity({ type: "trainer", id: trainer.id });
});
elements.groupForm?.addEventListener("submit", (event) => void createMasterdataGroup(event));
elements.groupNew?.addEventListener("click", openNewMasterdataGroup);
elements.groupOverlayClose?.addEventListener("click", closeMasterdataGroupOverlay);
elements.groupDetailEdit?.addEventListener("click", () => {
  const group = selectedMasterdataGroup();
  if (group) beginMasterdataEdit({ type: "group", id: group.id, item: group });
});
elements.athleteEditCancel?.addEventListener("click", () => {
  if (masterdataEdit?.type === "athlete") cancelMasterdataEdit();
  else closeMasterdataAthleteOverlay();
});
elements.trainerEditCancel?.addEventListener("click", () => {
  if (masterdataEdit?.type === "trainer") cancelMasterdataEdit();
  else closeMasterdataTrainerOverlay();
});
elements.groupEditCancel?.addEventListener("click", () => {
  if (masterdataEdit?.type === "group") cancelMasterdataEdit();
  else closeMasterdataGroupOverlay();
});
elements.athleteGroupForm?.addEventListener("submit", (event) => void createAthleteGroupMembership(event));
elements.athleteGroupCancel?.addEventListener("click", () => showMasterdataAthleteOverlayMode("detail"));
elements.trainerGroupForm?.addEventListener("submit", (event) => void createTrainerGroupMembership(event));
elements.trainerGroupCancel?.addEventListener("click", () => showMasterdataTrainerOverlayMode("detail"));
elements.trainerIdentityClose?.addEventListener("click", () => showMasterdataTrainerOverlayMode("detail"));
elements.trainerIdentityLoad?.addEventListener("click", () => void loadTrainerIdentityAdmin());
elements.trainerUserForm?.addEventListener("submit", (event) => void createTrainerUser(event));
elements.trainerIdentityForm?.addEventListener("submit", (event) => void bindTrainerIdentity(event));
elements.trainerIdentityIdentity?.addEventListener("change", syncTrainerIdentitySelection);
elements.registrationReload?.addEventListener("click", () => void loadSelfRegistration());
elements.registrationWeekPrev?.addEventListener("click", () => void moveSelfRegistrationWeek(-1));
elements.registrationWeekNext?.addEventListener("click", () => void moveSelfRegistrationWeek(1));
elements.registrationWeekCurrent?.addEventListener("click", () => void moveSelfRegistrationWeek(0));
elements.registrationList?.addEventListener("click", (event) => {
  void handleSelfRegistrationClick(event);
});
elements.kindertrainingWeekPrev?.addEventListener("click", () => void moveKindertrainingWeek(-1));
elements.kindertrainingWeekNext?.addEventListener("click", () => void moveKindertrainingWeek(1));
elements.kindertrainingWeekCurrent?.addEventListener("click", () => void moveKindertrainingWeek(0));
elements.kindertrainingWeekReload?.addEventListener("click", () => void reloadKindertrainingWeek());
elements.kindertrainingWeekSave?.addEventListener("click", () => void saveKindertrainingWeek());
elements.kindertrainingGroup?.addEventListener("change", () => void handleKindertrainingWeekGroupChange());
elements.kindertrainingWeekDays?.addEventListener("click", handleKindertrainingWeekClick);
elements.kindertrainingWeekDays?.addEventListener("change", handleKindertrainingWeekChange);
elements.kindertrainingWeekDays?.addEventListener("input", handleKindertrainingWeekInput);
for (const control of document.querySelectorAll("[data-masterdata-tab]")) {
  control.addEventListener("click", () => showMasterdataTab(control.dataset.masterdataTab || "athletes"));
}
bindMasterdataSwipe();
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
async function navigateAppSection(section) {
  const current = document.querySelector("[data-nav-view].is-active")?.dataset.navView || "home";
  if (
    current === "training-plans" &&
    section !== "training-plans" &&
    typeof closeTrainingPlanEditor === "function"
  ) {
    const closed = await closeTrainingPlanEditor(false);
    if (!closed) return;
  }
  if (
    current === "training-documentation" &&
    section !== "training-documentation" &&
    typeof prepareTrainingDocumentationForLeave === "function"
  ) {
    const closed = await prepareTrainingDocumentationForLeave();
    if (!closed) return;
  }
  showAppSection(section);
}

for (const control of document.querySelectorAll("[data-nav-view]")) {
  control.addEventListener("click", () => {
    if (control.disabled) return;
    setAppNavMoreOpen(false);
    void navigateAppSection(control.dataset.navView || "home");
  });
}
for (const control of document.querySelectorAll("[data-open-view]")) {
  control.addEventListener("click", () => {
    if (control.disabled) return;
    void navigateAppSection(control.dataset.openView || "home");
  });
}

${ULC_EXERCISE_CATALOG_SCRIPT}

${ULC_TRAINING_BLOCKS_SCRIPT}

${ULC_TRAINING_PLANS_SCRIPT}

${ULC_TRAINING_DOCUMENTATION_SCRIPT}

${ULC_USER_ADMIN_SCRIPT}

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

function resetAttendanceSessionState() {
  attendanceSessionGeneration += 1;

  selfRegistrationReady = false;
  selfRegistrationLoading = false;
  selfRegistrationSavingKeys = new Set();
  selfRegistrationConflictReloadPending = false;
  selfRegistrationWeekStart = "";
  selfRegistrationOptions = [];
  showMessage(elements.registrationMessage, "");
  showMessage(elements.registrationSuccess, "");
  renderSelfRegistrationWeekLabel();
  renderSelfRegistration();

  kindertrainingReady = false;
  kindertrainingLoading = false;
  kindertrainingGroups = [];
  kindertrainingSnapshot = null;
  kindertrainingWeekStart = "";
  kindertrainingWeekSnapshots = [];
  kindertrainingWeekDirtyDates = new Set();
  kindertrainingWeekExpandedDates = new Set();
  kindertrainingWeekFailedDates = new Set();
  kindertrainingWeekSaving = false;
  kindertrainingWeekLoadId += 1;
  kindertrainingLoadedGroupId = "";
  renderKindertrainingGroups();
  renderKindertrainingWeekLabel();
  renderKindertrainingWeek();
  if (elements.kindertrainingSession) {
    elements.kindertrainingSession.hidden = true;
  }
  if (elements.kindertrainingParticipants) {
    elements.kindertrainingParticipants.replaceChildren();
  }
  if (elements.kindertrainingSummary) {
    elements.kindertrainingSummary.replaceChildren();
  }
  if (elements.kindertrainingCount) {
    elements.kindertrainingCount.textContent = "0 Teilnehmer";
  }
  showMessage(elements.kindertrainingMessage, "");
  showMessage(elements.kindertrainingSuccess, "");

  refreshAppAvailability();
}

function resetMasterdataSessionState() {
  masterdataSessionGeneration += 1;
  masterdataReady = false;
  masterdataCanEdit = false;
  masterdataLoading = false;
  masterdataExchangeBusy = false;
  masterdataSnapshot = null;
  masterdataShowInactiveAthletes = false;
  masterdataShowInactiveTrainers = false;
  masterdataShowInactiveGroups = false;
  for (const control of [
    elements.athleteShowInactive,
    elements.trainerShowInactive,
    elements.groupShowInactive,
  ]) {
    if (control) control.checked = false;
  }
  masterdataEdit = null;
  masterdataContactEdit = null;
  masterdataSwipeStart = null;

  closeMasterdataImportPreview();
  closeMasterdataAthleteOverlay();
  closeMasterdataTrainerOverlay();
  closeMasterdataGroupOverlay();

  trainerIdentityAdminReady = false;
  trainerIdentityLoading = false;
  trainerIdentityBindings = [];
  elements.trainerUserForm?.reset();
  if (elements.trainerIdentityWorkspace) {
    elements.trainerIdentityWorkspace.hidden = true;
  }
  elements.trainerIdentityList?.replaceChildren();
  setTrainerIdentityControlsDisabled(false);

  elements.athleteList?.replaceChildren();
  elements.trainerList?.replaceChildren();
  elements.groupList?.replaceChildren();
  if (elements.athleteCount) elements.athleteCount.textContent = "(0)";
  if (elements.trainerCount) elements.trainerCount.textContent = "(0)";
  if (elements.groupCount) elements.groupCount.textContent = "(0)";
  if (elements.masterdataImportFile) elements.masterdataImportFile.value = "";
  elements.masterdataImportSummary?.replaceChildren();
  elements.masterdataImportIssues?.replaceChildren();
  elements.masterdataImportRows?.replaceChildren();

  showMessage(elements.masterdataMessage, "");
  showMessage(elements.masterdataSuccess, "");
  showMessage(elements.trainerIdentityMessage, "");
  showMessage(elements.trainerIdentitySuccess, "");
  refreshAppAvailability();
}

async function handleSignOut() {
  if (busy) return;

  if (masterdataExchangeBusy || trainerIdentityLoading) {
    showMessage(
      elements.appSessionMessage,
      "In den Stammdaten läuft noch ein Vorgang. Bitte zuerst abschließen lassen.",
    );
    return;
  }
  if (
    typeof closeTrainingPlanEditor === "function" &&
    !(await closeTrainingPlanEditor(false))
  ) {
    return;
  }
  if (
    typeof prepareTrainingDocumentationForLeave === "function" &&
    !(await prepareTrainingDocumentationForLeave())
  ) {
    return;
  }
  if (
    typeof prepareTrainingBlockForSessionEnd === "function" &&
    !(await prepareTrainingBlockForSessionEnd())
  ) {
    return;
  }
  if (
    typeof prepareExerciseCatalogForSessionEnd === "function" &&
    !prepareExerciseCatalogForSessionEnd()
  ) {
    return;
  }
  if (
    (runMode === "running" || runMode === "paused") &&
    !window.confirm(
      "Der Countdown läuft noch. Wirklich abmelden und den Countdown beenden?",
    )
  ) {
    return;
  }

  setAuthenticatedAppInteractionLocked(true);
  setBusy(true);
  if (elements.appSignOut) elements.appSignOut.disabled = true;
  if (elements.passwordSignOut) elements.passwordSignOut.disabled = true;
  showMessage(elements.appSessionMessage, "");
  showMessage(elements.passwordMessage, "");
  try {
    await requestJson("/api/auth/sign-out", { method: "POST" });
    resetCountdown();
    setTrainingPlanSessionIdentity("");
    resetAttendanceSessionState();
    resetMasterdataSessionState();
    resetUserAdminSessionState();
    resetTrainingBlockSessionState();
    resetExerciseCatalogSessionState();
    resetTrainingPlanSessionState();
    resetTrainingDocumentationSessionState();
    setAppNavMoreOpen(false);
    showView("login");
    if (elements.loginPassword) elements.loginPassword.value = "";
    if (elements.currentPassword) elements.currentPassword.value = "";
    if (elements.newPassword) elements.newPassword.value = "";
    if (elements.confirmPassword) elements.confirmPassword.value = "";
  } catch {
    const message = "Abmelden ist fehlgeschlagen. Bitte erneut versuchen.";
    showMessage(elements.appSessionMessage, message);
    showMessage(elements.passwordMessage, message);
  } finally {
    setAuthenticatedAppInteractionLocked(false);
    if (elements.appSignOut) elements.appSignOut.disabled = false;
    if (elements.passwordSignOut) elements.passwordSignOut.disabled = false;
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

  setTrainingPlanSessionIdentity(next?.identity?.identityId);
  showView("app");
  showAppSection("home");
  if (elements.welcomeEyebrow) {
    const name = next?.identity?.displayName || next?.identity?.username || "Benutzer";
    elements.welcomeEyebrow.textContent = "Guten Tag, " + name;
  }
  await Promise.all([
    bootstrapCountdown(),
    bootstrapMasterdata(),
    bootstrapUserAdmin(),
    bootstrapSelfRegistration(),
    bootstrapKindertraining(),
    bootstrapExerciseCatalog(),
    bootstrapTrainingBlocks(),
    bootstrapTrainingPlans(),
    bootstrapTrainingDocumentation(),
  ]);
  refreshTrainingBlockCatalogDependency();
}

async function bootstrapSelfRegistration() {
  const generation = attendanceSessionGeneration;
  selfRegistrationReady = false;
  selfRegistrationLoading = false;
  selfRegistrationSavingKeys = new Set();
  selfRegistrationWeekStart = localWeekStart(new Date());
  selfRegistrationOptions = [];
  renderSelfRegistrationWeekLabel();
  renderSelfRegistration();
  refreshAppAvailability();

  const probeDate = localIsoDate(new Date());
  try {
    const probe = await requestJson(
      "/api/modules/kindertraining/registration?sessionDate=" +
        encodeURIComponent(probeDate),
    );
    if (generation !== attendanceSessionGeneration) return;
    if (
      probe?.sessionDate !== probeDate ||
      !Array.isArray(probe?.options) ||
      !probe.options.every((option) =>
        isSelfRegistrationOption(option, probeDate),
      )
    ) {
      throw new Error("INVALID_SELF_REGISTRATION_CONTRACT");
    }
    selfRegistrationReady = true;
    await loadSelfRegistration(true, new Map([[probeDate, probe]]));
  } catch (error) {
    if (generation !== attendanceSessionGeneration) return;
    selfRegistrationReady = false;
    selfRegistrationOptions = [];
    if (error?.status !== 403) {
      showMessage(
        elements.registrationMessage,
        "Die Trainingsanmeldung konnte nicht geladen werden.",
      );
    }
    renderSelfRegistration();
    refreshAppAvailability();
  }
}

async function loadSelfRegistration(
  bootstrap = false,
  prefetched = new Map(),
) {
  if (selfRegistrationLoading || (!selfRegistrationReady && !bootstrap)) return;
  const generation = attendanceSessionGeneration;
  const weekStart =
    selfRegistrationWeekStart || localWeekStart(new Date());
  const dates = registrationWeekDates(weekStart);
  const wasReady = selfRegistrationReady;
  selfRegistrationLoading = true;
  showMessage(elements.registrationMessage, "");
  showMessage(elements.registrationSuccess, "");
  renderSelfRegistrationWeekLabel();
  renderSelfRegistration();
  refreshAppAvailability();

  try {
    const payloads = await Promise.all(
      dates.map((sessionDate) =>
        prefetched.has(sessionDate)
          ? Promise.resolve(prefetched.get(sessionDate))
          : requestJson(
              "/api/modules/kindertraining/registration?sessionDate=" +
                encodeURIComponent(sessionDate),
            ),
      ),
    );
    if (generation !== attendanceSessionGeneration) return;
    const options = [];
    for (let index = 0; index < dates.length; index += 1) {
      const sessionDate = dates[index];
      const payload = payloads[index];
      if (
        payload?.sessionDate !== sessionDate ||
        !Array.isArray(payload?.options) ||
        !payload.options.every((option) =>
          isSelfRegistrationOption(option, sessionDate),
        )
      ) {
        throw new Error("INVALID_SELF_REGISTRATION_CONTRACT");
      }
      options.push(...payload.options);
    }
    selfRegistrationWeekStart = weekStart;
    selfRegistrationOptions = options;
    selfRegistrationReady = true;
  } catch (error) {
    if (generation !== attendanceSessionGeneration) return;
    selfRegistrationOptions = [];
    if (!wasReady || error?.status === 403) {
      selfRegistrationReady = false;
    }
    if (error?.status !== 403) {
      showMessage(
        elements.registrationMessage,
        "Die Trainingsanmeldung für diese Woche konnte nicht geladen werden.",
      );
    }
  } finally {
    if (generation === attendanceSessionGeneration) {
      selfRegistrationLoading = false;
      renderSelfRegistrationWeekLabel();
      renderSelfRegistration();
      refreshAppAvailability();
    }
  }
}

function isSelfRegistrationOption(option, sessionDate) {
  return (
    option !== null &&
    typeof option === "object" &&
    option?.sessionDate === sessionDate &&
    option?.group !== null &&
    typeof option?.group === "object" &&
    typeof option.group.id === "string" &&
    option.group.id.length > 0 &&
    typeof option.group.name === "string" &&
    option.group.name.length > 0 &&
    (option.group.shortName === null ||
      typeof option.group.shortName === "string") &&
    (option.sessionState === null ||
      option.sessionState === "scheduled" ||
      option.sessionState === "cancelled") &&
    ["unknown", "attending", "not_attending", "maybe"].includes(
      option.intention,
    ) &&
    (option.revision === null ||
      (Number.isSafeInteger(option.revision) && option.revision >= 1))
  );
}

function selfRegistrationLabel(intention) {
  return {
    unknown: "Noch offen",
    attending: "Ich komme",
    not_attending: "Abgesagt",
    maybe: "Vielleicht",
  }[intention] || "Noch offen";
}

function renderSelfRegistration() {
  const container = elements.registrationList;
  if (!container) return;
  container.replaceChildren();

  if (selfRegistrationLoading) {
    const loading = document.createElement("div");
    loading.className = "card registration-empty";
    loading.textContent = "Trainingsanmeldung wird geladen …";
    container.append(loading);
    return;
  }

  if (!selfRegistrationReady) return;
  const dates = registrationWeekDates(
    selfRegistrationWeekStart || localWeekStart(new Date()),
  );
  if (selfRegistrationOptions.length === 0) {
    const empty = document.createElement("div");
    empty.className = "registration-empty";
    empty.textContent =
      "Für diese Woche ist keine Gruppe mit Selbstanmeldung verfügbar.";
    container.append(empty);
    return;
  }

  for (const sessionDate of dates) {
    const day = document.createElement("section");
    day.className = "registration-day";

    const dayHead = document.createElement("div");
    dayHead.className = "registration-day__head";
    const dayName = document.createElement("strong");
    dayName.textContent = germanWeekday(sessionDate);
    const dayDate = document.createElement("span");
    dayDate.textContent = germanDate(sessionDate);
    dayHead.append(dayName, dayDate);
    day.append(dayHead);

    const dayOptions = selfRegistrationOptions.filter(
      (option) => option.sessionDate === sessionDate,
    );
    if (dayOptions.length === 0) {
      const empty = document.createElement("div");
      empty.className = "registration-empty";
      empty.textContent = "Keine Anmeldung verfügbar.";
      day.append(empty);
      container.append(day);
      continue;
    }

    for (const option of dayOptions) {
      const card = document.createElement("article");
      card.className = "card registration-card";

      const head = document.createElement("div");
      head.className = "registration-card__head";
      const identity = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = option.group.name;
      const meta = document.createElement("small");
      meta.textContent = option.group.shortName || germanWeekday(option.sessionDate);
      identity.append(title, meta);

      const current = document.createElement("span");
      current.className = "registration-current";
      current.dataset.intention = option.intention;
      const optionKey = option.group.id + "|" + option.sessionDate;
      const optionSaving = selfRegistrationSavingKeys.has(optionKey);
      current.dataset.saving = optionSaving ? "true" : "false";
      current.textContent = selfRegistrationLabel(option.intention);
      current.setAttribute(
        "aria-label",
        optionSaving
          ? selfRegistrationLabel(option.intention) + " – wird gespeichert"
          : selfRegistrationLabel(option.intention),
      );
      head.append(identity, current);
      card.append(head);

      if (option.sessionState === "cancelled") {
        const cancelled = document.createElement("p");
        cancelled.className = "registration-cancelled";
        cancelled.textContent = "Dieses Training wurde abgesagt.";
        card.append(cancelled);
        day.append(card);
        continue;
      }

      const actions = document.createElement("div");
      actions.className = "registration-actions";
      for (const action of [
        { intention: "attending", label: "Komme" },
        { intention: "maybe", label: "Vielleicht" },
        { intention: "not_attending", label: "Absage" },
        { intention: "unknown", label: "Offen" },
      ]) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "button button--secondary registration-action";
        button.dataset.registrationGroup = option.group.id;
        button.dataset.registrationDate = option.sessionDate;
        button.dataset.intention = action.intention;
        button.textContent = action.label;
        button.setAttribute(
          "aria-pressed",
          option.intention === action.intention ? "true" : "false",
        );
        button.disabled =
          optionSaving ||
          selfRegistrationLoading;
        actions.append(button);
      }
      card.append(actions);
      day.append(card);
    }
    container.append(day);
  }
}

async function handleSelfRegistrationClick(event) {
  const generation = attendanceSessionGeneration;
  const control = event.target?.closest?.("[data-registration-group]");
  if (
    !control ||
    !selfRegistrationReady ||
    selfRegistrationLoading
  ) {
    return;
  }
  const groupId = control.dataset.registrationGroup || "";
  const sessionDate = control.dataset.registrationDate || "";
  const intention = control.dataset.intention || "";
  if (
    !groupId ||
    !sessionDate ||
    !["unknown", "attending", "not_attending", "maybe"].includes(intention)
  ) {
    return;
  }
  const optionKey = groupId + "|" + sessionDate;
  if (selfRegistrationSavingKeys.has(optionKey)) return;

  const option = selfRegistrationOptions.find(
    (candidate) =>
      candidate.group.id === groupId &&
      candidate.sessionDate === sessionDate,
  );
  if (!option || option.sessionState === "cancelled" || option.intention === intention) {
    return;
  }

  const previous = option;
  selfRegistrationSavingKeys.add(optionKey);
  selfRegistrationOptions = selfRegistrationOptions.map((candidate) =>
    candidate.group.id === groupId &&
    candidate.sessionDate === sessionDate
      ? { ...candidate, intention }
      : candidate,
  );
  showMessage(elements.registrationMessage, "");
  showMessage(elements.registrationSuccess, "");
  renderSelfRegistration();
  refreshAppAvailability();

  try {
    const payload = await requestJson(
      "/api/modules/kindertraining/registration",
      {
        method: "POST",
        body: JSON.stringify({
          expectedRevision: previous.revision,
          groupId,
          intention,
          sessionDate,
        }),
      },
    );
    if (generation !== attendanceSessionGeneration) return;
    const saved = payload?.option;
    if (!isSelfRegistrationOption(saved, sessionDate)) {
      throw new Error("INVALID_SELF_REGISTRATION_SAVE");
    }
    selfRegistrationOptions = selfRegistrationOptions.map((candidate) =>
      candidate.group.id === groupId &&
      candidate.sessionDate === sessionDate
        ? saved
        : candidate,
    );

  } catch (error) {
    if (generation !== attendanceSessionGeneration) return;
    selfRegistrationOptions = selfRegistrationOptions.map((candidate) =>
      candidate.group.id === groupId &&
      candidate.sessionDate === sessionDate
        ? previous
        : candidate,
    );
    if (
      error?.status === 409 &&
      error?.code === "TRAINING_REGISTRATION_CONFLICT"
    ) {
      selfRegistrationConflictReloadPending = true;
      showMessage(
        elements.registrationMessage,
        "Die Anmeldung wurde zwischenzeitlich geändert. Die aktuelle Woche wird nach den laufenden Speicherungen neu geladen.",
      );
      return;
    }
    showMessage(
      elements.registrationMessage,
      error?.status === 404
        ? "Die Trainingsgruppe ist für diesen Tag nicht mehr verfügbar."
        : error?.status === 409
          ? "Für dieses Training ist die Selbstanmeldung nicht mehr möglich."
          : "Die Trainingsanmeldung konnte nicht gespeichert werden.",
    );
  } finally {
    if (generation === attendanceSessionGeneration) {
      selfRegistrationSavingKeys.delete(optionKey);
      renderSelfRegistration();
      refreshAppAvailability();

      if (
        selfRegistrationConflictReloadPending &&
        selfRegistrationSavingKeys.size === 0
      ) {
        selfRegistrationConflictReloadPending = false;
        await loadSelfRegistration();
      }
    }
  }
}

async function moveSelfRegistrationWeek(offset) {
  if (selfRegistrationLoading || selfRegistrationSavingKeys.size > 0) return;
  selfRegistrationWeekStart =
    offset === 0
      ? localWeekStart(new Date())
      : shiftIsoDate(
          selfRegistrationWeekStart || localWeekStart(new Date()),
          offset * 7,
        );
  renderSelfRegistrationWeekLabel();
  await loadSelfRegistration();
}

function renderSelfRegistrationWeekLabel() {
  if (!elements.registrationWeekLabel) return;
  const start = selfRegistrationWeekStart || localWeekStart(new Date());
  const end = shiftIsoDate(start, 6);
  elements.registrationWeekLabel.textContent =
    germanDate(start) + " – " + germanDate(end);
}

function prepareSelfRegistrationView() {
  if (!selfRegistrationWeekStart) {
    selfRegistrationWeekStart = localWeekStart(new Date());
  }
  renderSelfRegistrationWeekLabel();
}

function localWeekStart(date) {
  const copy = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    12,
    0,
    0,
    0,
  );
  const day = copy.getDay();
  copy.setDate(copy.getDate() - (day === 0 ? 6 : day - 1));
  return localIsoDate(copy);
}

function registrationWeekDates(weekStart) {
  return Array.from({ length: 7 }, (_, index) =>
    shiftIsoDate(weekStart, index),
  );
}

function shiftIsoDate(value, days) {
  const parts = String(value).split("-").map(Number);
  if (
    parts.length !== 3 ||
    !Number.isSafeInteger(parts[0]) ||
    !Number.isSafeInteger(parts[1]) ||
    !Number.isSafeInteger(parts[2])
  ) {
    return value;
  }
  const date = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return localIsoDate(date);
}

function germanWeekday(value) {
  const parts = String(value).split("-").map(Number);
  if (parts.length !== 3) return "";
  const date = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
  return new Intl.DateTimeFormat("de-AT", { weekday: "long" }).format(date);
}

async function bootstrapKindertraining() {
  const generation = attendanceSessionGeneration;
  kindertrainingReady = false;
  kindertrainingGroups = [];
  kindertrainingSnapshot = null;
  kindertrainingWeekStart = localWeekStart(new Date());
  kindertrainingWeekSnapshots = [];
  kindertrainingWeekDirtyDates = new Set();
  kindertrainingWeekExpandedDates = new Set();
  kindertrainingLoadedGroupId = "";
  refreshAppAvailability();
  showMessage(elements.kindertrainingMessage, "");
  showMessage(elements.kindertrainingSuccess, "");
  renderKindertrainingWeekLabel();
  renderKindertrainingWeek();

  try {
    const payload = await requestJson("/api/modules/kindertraining");
    if (generation !== attendanceSessionGeneration) return;
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
          (group.shortName === null || typeof group.shortName === "string") &&
          ["trainer_roll_call", "self_registration"].includes(
            group.attendanceMode,
          ),
      )
      .map((group) => ({
        id: group.id,
        name: group.name,
        shortName: group.shortName,
        attendanceMode: group.attendanceMode,
      }));
    if (kindertrainingGroups.length !== groups.length) {
      throw new Error("INVALID_KINDERTRAINING_GROUPS");
    }
    renderKindertrainingGroups();
    if (kindertrainingGroups.length === 0) {
      showMessage(
        elements.kindertrainingMessage,
        "Für die Anwesenheit ist noch keine aktive Trainingsgruppe angelegt.",
      );
    } else if (elements.kindertrainingGroup?.value) {
      await loadKindertrainingWeek();
    }
  } catch (error) {
    if (generation !== attendanceSessionGeneration) return;
    kindertrainingReady = false;
    kindertrainingGroups = [];
    renderKindertrainingGroups();
    renderKindertrainingWeek();
    showMessage(
      elements.kindertrainingMessage,
      error?.status === 403
        ? "Für Anwesenheit fehlt die Berechtigung."
        : "Anwesenheit ist derzeit nicht verfügbar.",
    );
  }
  if (generation === attendanceSessionGeneration) {
    refreshAppAvailability();
  }
}

function renderKindertrainingWeekLabel() {
  if (!elements.kindertrainingWeekLabel) return;
  const start = kindertrainingWeekStart || localWeekStart(new Date());
  const end = shiftIsoDate(start, 6);
  elements.kindertrainingWeekLabel.textContent =
    germanDate(start) + " – " + germanDate(end);
}

function withKindertrainingWeekDraft(snapshot) {
  return {
    ...snapshot,
    draftState: snapshot.session?.state || "scheduled",
    draftNote: snapshot.session?.note || "",
  };
}

function kindertrainingRegistrationLabel(intention) {
  return {
    unknown: "Offen",
    attending: "Kommt",
    not_attending: "Abgesagt",
    maybe: "Vielleicht",
  }[intention] || "Offen";
}

function kindertrainingAttendanceLabel(status) {
  return {
    open: "Noch offen",
    present: "Da",
    excused: "Entschuldigt",
    absent: "Fehlt",
  }[status] || "Noch offen";
}

function kindertrainingWeekCounts(snapshot) {
  const registration = { unknown: 0, attending: 0, not_attending: 0, maybe: 0 };
  const attendance = { open: 0, present: 0, excused: 0, absent: 0 };
  for (const participant of snapshot.participants) {
    if (Object.prototype.hasOwnProperty.call(registration, participant.intention)) {
      registration[participant.intention] += 1;
    }
    if (Object.prototype.hasOwnProperty.call(attendance, participant.status)) {
      attendance[participant.status] += 1;
    }
  }
  return { registration, attendance };
}

function renderKindertrainingWeek() {
  const root = elements.kindertrainingWeek;
  const container = elements.kindertrainingWeekDays;
  if (!root || !container) return;
  container.replaceChildren();

  const groupId = elements.kindertrainingGroup?.value || "";
  if (!kindertrainingReady || !groupId) {
    root.hidden = true;
    return;
  }
  root.hidden = false;

  if (kindertrainingLoading) {
    const loading = document.createElement("div");
    loading.className = "card kindertraining-week-empty";
    loading.textContent = "Anwesenheitswoche wird geladen …";
    container.append(loading);
    refreshKindertrainingWeekControls();
    return;
  }

  if (kindertrainingWeekSnapshots.length === 0 && kindertrainingWeekFailedDates.size === 0) {
    const empty = document.createElement("div");
    empty.className = "card kindertraining-week-empty";
    empty.textContent = "Für diese Woche konnten keine Trainingstage geladen werden.";
    container.append(empty);
    refreshKindertrainingWeekControls();
    return;
  }

  // Render all seven dates, even if only some API requests succeed. An
  // unavailable date is not a valid attendance snapshot and must not be editable.
  for (const sessionDate of registrationWeekDates(kindertrainingWeekStart)) {
    const snapshot = kindertrainingWeekSnapshots.find(
      (entry) => entry.sessionDate === sessionDate,
    );
    if (!snapshot) {
      const unavailable = document.createElement("div");
      unavailable.className = "card kindertraining-week-day kindertraining-week-day--unavailable";
      const label = document.createElement("strong");
      label.textContent = germanWeekday(sessionDate) + " · " + germanDate(sessionDate);
      const message = document.createElement("small");
      message.textContent = kindertrainingWeekFailedDates.has(sessionDate)
        ? "Nicht geladen – über „Neu laden“ erneut versuchen."
        : "Noch keine Anwesenheitsdaten geladen.";
      unavailable.append(label, message);
      container.append(unavailable);
      continue;
    }
    const expanded = kindertrainingWeekExpandedDates.has(snapshot.sessionDate);
    const counts = kindertrainingWeekCounts(snapshot);
    const day = document.createElement("section");
    day.className = "card kindertraining-week-day";
    day.dataset.sessionDate = snapshot.sessionDate;

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "kindertraining-day-toggle";
    toggle.dataset.kindertrainingDayToggle = snapshot.sessionDate;
    toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    toggle.disabled = kindertrainingWeekSaving;

    const title = document.createElement("span");
    title.className = "kindertraining-day-title";
    const weekday = document.createElement("strong");
    weekday.textContent = germanWeekday(snapshot.sessionDate);
    const date = document.createElement("small");
    date.textContent = germanDate(snapshot.sessionDate);
    title.append(weekday, date);

    const registrationSummary = document.createElement("span");
    registrationSummary.className = "kindertraining-day-registration-summary";
    registrationSummary.textContent =
      "Voranmeldung: " +
      counts.registration.attending +
      " kommt · " +
      counts.registration.maybe +
      " vielleicht · " +
      counts.registration.not_attending +
      " abgesagt · " +
      counts.registration.unknown +
      " offen";

    const marker = document.createElement("span");
    marker.className = "kindertraining-day-marker";
    marker.textContent = expanded ? "▴" : "▾";
    toggle.append(title, registrationSummary, marker);
    day.append(toggle);

    if (!expanded) {
      container.append(day);
      continue;
    }

    const details = document.createElement("div");
    details.className = "kindertraining-day-details";

    const attendanceSummary = document.createElement("div");
    attendanceSummary.className = "kindertraining-summary";
    for (const item of [
      ["present", "Da"],
      ["excused", "Entschuldigt"],
      ["absent", "Fehlt"],
      ["open", "Noch offen"],
    ]) {
      const box = document.createElement("div");
      box.className = "kindertraining-summary__item";
      const count = document.createElement("strong");
      count.textContent = String(counts.attendance[item[0]]);
      const label = document.createElement("span");
      label.textContent = item[1];
      box.append(count, label);
      attendanceSummary.append(box);
    }
    details.append(attendanceSummary);

    const sessionControls = document.createElement("div");
    sessionControls.className = "kindertraining-day-session-controls";
    const stateLabel = document.createElement("label");
    stateLabel.textContent = "Training";
    const state = document.createElement("select");
    state.dataset.kindertrainingStateDate = snapshot.sessionDate;
    state.disabled = kindertrainingWeekSaving;
    for (const item of [
      ["scheduled", "Geplant"],
      ["cancelled", "Abgesagt"],
    ]) {
      const option = document.createElement("option");
      option.value = item[0];
      option.textContent = item[1];
      state.append(option);
    }
    state.value = snapshot.draftState || "scheduled";
    stateLabel.append(state);

    const noteLabel = document.createElement("label");
    noteLabel.textContent = "Notiz";
    const note = document.createElement("input");
    note.type = "text";
    note.maxLength = 3000;
    note.placeholder = "Optional";
    note.value = snapshot.draftNote || "";
    note.dataset.kindertrainingNoteDate = snapshot.sessionDate;
    note.disabled = kindertrainingWeekSaving;
    noteLabel.append(note);
    sessionControls.append(stateLabel, noteLabel);
    details.append(sessionControls);

    const bulk = document.createElement("div");
    bulk.className = "kindertraining-bulk-actions";
    for (const item of [
      ["present", "Alle anwesend"],
      ["open", "Alle offen"],
    ]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button button--secondary";
      button.dataset.kindertrainingBulkDate = snapshot.sessionDate;
      button.dataset.status = item[0];
      button.textContent = item[1];
      button.disabled = kindertrainingWeekSaving;
      bulk.append(button);
    }
    details.append(bulk);

    const participants = document.createElement("div");
    participants.className = "kindertraining-participants";
    if (snapshot.participants.length === 0) {
      const empty = document.createElement("div");
      empty.className = "kindertraining-empty";
      empty.textContent = "Für diesen Tag sind keine Teilnehmer zugeordnet.";
      participants.append(empty);
    } else {
      for (const participant of snapshot.participants) {
        const row = document.createElement("article");
        row.className = "kindertraining-participant";

        const identity = document.createElement("div");
        identity.className = "kindertraining-participant__identity";
        const name = document.createElement("strong");
        name.textContent = participant.lastName + ", " + participant.firstName;
        const registration = document.createElement("span");
        registration.className = "kindertraining-registration";
        registration.dataset.intention = participant.intention;
        registration.textContent =
          "Voranmeldung: " + kindertrainingRegistrationLabel(participant.intention);
        identity.append(name, registration);

        const statuses = document.createElement("div");
        statuses.className = "kindertraining-statuses";
        statuses.setAttribute(
          "aria-label",
          "Anwesenheit für " + participant.firstName + " " + participant.lastName,
        );
        for (const status of ["open", "present", "excused", "absent"]) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "kindertraining-status";
          button.dataset.kindertrainingDate = snapshot.sessionDate;
          button.dataset.athleteId = participant.athleteId;
          button.dataset.status = status;
          button.setAttribute(
            "aria-pressed",
            participant.status === status ? "true" : "false",
          );
          button.textContent = kindertrainingAttendanceLabel(status);
          button.disabled = kindertrainingWeekSaving;
          statuses.append(button);
        }
        row.append(identity, statuses);
        participants.append(row);
      }
    }
    details.append(participants);
    day.append(details);
    container.append(day);
  }
  refreshKindertrainingWeekControls();
}

function refreshKindertrainingWeekControls() {
  const hasGroup = Boolean(elements.kindertrainingGroup?.value);
  const busyWeek = kindertrainingLoading || kindertrainingWeekSaving;
  if (elements.kindertrainingGroup) {
    elements.kindertrainingGroup.disabled = !kindertrainingReady || busyWeek;
  }
  for (const control of [
    elements.kindertrainingWeekPrev,
    elements.kindertrainingWeekNext,
    elements.kindertrainingWeekCurrent,
    elements.kindertrainingWeekReload,
  ]) {
    if (control) control.disabled = !kindertrainingReady || !hasGroup || busyWeek;
  }
  if (elements.kindertrainingWeekSave) {
    elements.kindertrainingWeekSave.disabled =
      !kindertrainingReady ||
      !hasGroup ||
      busyWeek ||
      kindertrainingWeekDirtyDates.size === 0;
  }
  if (elements.kindertrainingWeekState) {
    elements.kindertrainingWeekState.textContent = kindertrainingWeekSaving
      ? "Woche wird gespeichert …"
      : kindertrainingWeekDirtyDates.size > 0
        ? String(kindertrainingWeekDirtyDates.size) + " Tag(e) ungespeichert"
        : "Gespeichert";
  }
}

async function loadKindertrainingWeek({ preserveExpansion = false } = {}) {
  if (!kindertrainingReady || kindertrainingLoading || kindertrainingWeekSaving) return;
  const groupId = elements.kindertrainingGroup?.value || "";
  if (!groupId) {
    renderKindertrainingWeek();
    return;
  }
  const generation = attendanceSessionGeneration;
  const loadId = ++kindertrainingWeekLoadId;
  const weekStart = kindertrainingWeekStart || localWeekStart(new Date());
  const dates = registrationWeekDates(weekStart);
  kindertrainingLoading = true;
  showMessage(elements.kindertrainingMessage, "");
  showMessage(elements.kindertrainingSuccess, "");
  renderKindertrainingWeekLabel();
  renderKindertrainingWeek();

  try {
    const responses = await Promise.allSettled(
      dates.map((sessionDate) =>
        requestJson(
          "/api/modules/kindertraining/session?groupId=" +
            encodeURIComponent(groupId) +
            "&sessionDate=" +
            encodeURIComponent(sessionDate),
        ),
      ),
    );
    if (
      generation !== attendanceSessionGeneration ||
      loadId !== kindertrainingWeekLoadId
    ) return;

    const snapshots = [];
    const failedDates = new Set();
    for (const [index, response] of responses.entries()) {
      const snapshot = response.status === "fulfilled" ? response.value?.snapshot : null;
      if (isKindertrainingSnapshot(snapshot, groupId, dates[index])) {
        snapshots.push(withKindertrainingWeekDraft(snapshot));
      } else {
        failedDates.add(dates[index]);
      }
    }
    kindertrainingWeekStart = weekStart;
    kindertrainingWeekSnapshots = snapshots;
    kindertrainingWeekFailedDates = failedDates;
    if (failedDates.size > 0) {
      showMessage(
        elements.kindertrainingMessage,
        String(failedDates.size) + " Trainingstag(e) konnten nicht geladen werden. " +
          "Die übrigen Tage bleiben sichtbar. Bitte „Neu laden“ versuchen.",
      );
    }
    kindertrainingWeekDirtyDates = new Set();
    kindertrainingLoadedGroupId = groupId;

    if (!preserveExpansion) {
      kindertrainingWeekExpandedDates = new Set();
      // A newly selected week starts fully collapsed; days open on demand.
    } else {
      kindertrainingWeekExpandedDates = new Set(
        [...kindertrainingWeekExpandedDates].filter((date) => dates.includes(date)),
      );

    }
  } catch (error) {
    if (
      generation !== attendanceSessionGeneration ||
      loadId !== kindertrainingWeekLoadId
    ) return;
    kindertrainingWeekSnapshots = [];
    kindertrainingWeekFailedDates = new Set(dates);
    kindertrainingWeekDirtyDates = new Set();
    kindertrainingLoadedGroupId = groupId;
    showMessage(
      elements.kindertrainingMessage,
      error?.status === 403
        ? "Für die Anwesenheit dieser Trainingsgruppe fehlt die Berechtigung."
        : error?.status === 404
          ? "Die Trainingsgruppe wurde nicht gefunden."
          : "Die Anwesenheitswoche konnte nicht geladen werden.",
    );
  } finally {
    if (
      generation === attendanceSessionGeneration &&
      loadId === kindertrainingWeekLoadId
    ) {
      kindertrainingLoading = false;
      renderKindertrainingWeekLabel();
      renderKindertrainingWeek();
      refreshAppAvailability();
    }
  }
}

function discardKindertrainingWeekChanges() {
  if (kindertrainingWeekDirtyDates.size === 0) return true;
  return window.confirm(
    "Es gibt ungespeicherte Anwesenheitsänderungen. Wirklich verwerfen?",
  );
}

async function moveKindertrainingWeek(offset) {
  if (kindertrainingLoading || kindertrainingWeekSaving) return;
  if (!discardKindertrainingWeekChanges()) return;
  kindertrainingWeekDirtyDates = new Set();
  kindertrainingWeekStart =
    offset === 0
      ? localWeekStart(new Date())
      : shiftIsoDate(
          kindertrainingWeekStart || localWeekStart(new Date()),
          offset * 7,
        );
  renderKindertrainingWeekLabel();
  await loadKindertrainingWeek();
}

async function reloadKindertrainingWeek() {
  if (kindertrainingLoading || kindertrainingWeekSaving) return;
  if (!discardKindertrainingWeekChanges()) return;
  kindertrainingWeekDirtyDates = new Set();
  await loadKindertrainingWeek({ preserveExpansion: true });
}

async function handleKindertrainingWeekGroupChange() {
  if (kindertrainingLoading || kindertrainingWeekSaving) return;
  const nextGroupId = elements.kindertrainingGroup?.value || "";
  if (
    kindertrainingWeekDirtyDates.size > 0 &&
    kindertrainingLoadedGroupId &&
    nextGroupId !== kindertrainingLoadedGroupId &&
    !discardKindertrainingWeekChanges()
  ) {
    if (elements.kindertrainingGroup) {
      elements.kindertrainingGroup.value = kindertrainingLoadedGroupId;
    }
    return;
  }
  kindertrainingWeekDirtyDates = new Set();
  kindertrainingWeekSnapshots = [];
  kindertrainingWeekExpandedDates = new Set();
  kindertrainingWeekFailedDates = new Set();
  kindertrainingLoadedGroupId = "";
  renderKindertrainingWeek();
  if (nextGroupId) await loadKindertrainingWeek();
}

function updateKindertrainingWeekSnapshot(sessionDate, update) {
  kindertrainingWeekSnapshots = kindertrainingWeekSnapshots.map((snapshot) =>
    snapshot.sessionDate === sessionDate ? update(snapshot) : snapshot,
  );
}

function markKindertrainingWeekDirty(sessionDate) {
  kindertrainingWeekDirtyDates.add(sessionDate);
  showMessage(elements.kindertrainingSuccess, "");
  refreshKindertrainingWeekControls();
}

function handleKindertrainingWeekClick(event) {
  if (kindertrainingLoading || kindertrainingWeekSaving) return;

  const toggle = event.target?.closest?.("[data-kindertraining-day-toggle]");
  if (toggle && elements.kindertrainingWeekDays?.contains(toggle)) {
    const sessionDate = toggle.dataset.kindertrainingDayToggle || "";
    if (kindertrainingWeekExpandedDates.has(sessionDate)) {
      kindertrainingWeekExpandedDates.delete(sessionDate);
    } else {
      kindertrainingWeekExpandedDates.add(sessionDate);
    }
    renderKindertrainingWeek();
    return;
  }

  const bulk = event.target?.closest?.("[data-kindertraining-bulk-date][data-status]");
  if (bulk && elements.kindertrainingWeekDays?.contains(bulk)) {
    const sessionDate = bulk.dataset.kindertrainingBulkDate || "";
    const status = bulk.dataset.status || "";
    if (!["open", "present"].includes(status)) return;
    updateKindertrainingWeekSnapshot(sessionDate, (snapshot) => ({
      ...snapshot,
      participants: snapshot.participants.map((participant) => ({
        ...participant,
        status,
      })),
    }));
    markKindertrainingWeekDirty(sessionDate);
    renderKindertrainingWeek();
    return;
  }

  const statusButton = event.target?.closest?.(
    "[data-kindertraining-date][data-athlete-id][data-status]",
  );
  if (!statusButton || !elements.kindertrainingWeekDays?.contains(statusButton)) return;
  const sessionDate = statusButton.dataset.kindertrainingDate || "";
  const athleteId = statusButton.dataset.athleteId || "";
  const status = statusButton.dataset.status || "";
  if (!["open", "present", "excused", "absent"].includes(status)) return;

  updateKindertrainingWeekSnapshot(sessionDate, (snapshot) => ({
    ...snapshot,
    participants: snapshot.participants.map((participant) =>
      participant.athleteId === athleteId
        ? { ...participant, status }
        : participant,
    ),
  }));
  markKindertrainingWeekDirty(sessionDate);
  renderKindertrainingWeek();
}

function handleKindertrainingWeekChange(event) {
  if (kindertrainingLoading || kindertrainingWeekSaving) return;
  const control = event.target;
  const sessionDate = control?.dataset?.kindertrainingStateDate || "";
  if (!sessionDate) return;
  const state = control.value;
  if (!["scheduled", "cancelled"].includes(state)) return;
  updateKindertrainingWeekSnapshot(sessionDate, (snapshot) => ({
    ...snapshot,
    draftState: state,
  }));
  markKindertrainingWeekDirty(sessionDate);
}

function handleKindertrainingWeekInput(event) {
  if (kindertrainingLoading || kindertrainingWeekSaving) return;
  const control = event.target;
  const sessionDate = control?.dataset?.kindertrainingNoteDate || "";
  if (!sessionDate) return;
  updateKindertrainingWeekSnapshot(sessionDate, (snapshot) => ({
    ...snapshot,
    draftNote: control.value,
  }));
  markKindertrainingWeekDirty(sessionDate);
}

async function saveKindertrainingWeek() {
  if (
    !kindertrainingReady ||
    kindertrainingLoading ||
    kindertrainingWeekSaving ||
    kindertrainingWeekDirtyDates.size === 0
  ) {
    return;
  }

  const generation = attendanceSessionGeneration;
  const groupId = elements.kindertrainingGroup?.value || "";
  const dirtySnapshots = kindertrainingWeekSnapshots.filter((snapshot) =>
    kindertrainingWeekDirtyDates.has(snapshot.sessionDate),
  );
  if (!groupId || dirtySnapshots.length === 0) return;

  kindertrainingWeekSaving = true;
  showMessage(elements.kindertrainingMessage, "");
  showMessage(elements.kindertrainingSuccess, "");
  renderKindertrainingWeek();

  try {
    const results = await Promise.allSettled(
      dirtySnapshots.map(async (snapshot) => {
        const payload = await requestJson("/api/modules/kindertraining/session", {
          method: "POST",
          body: JSON.stringify({
            groupId,
            sessionDate: snapshot.sessionDate,
            state: snapshot.draftState || "scheduled",
            note: (snapshot.draftNote || "").trim() || null,
            expectedRevision: snapshot.session?.revision ?? null,
            attendance: snapshot.participants.map((participant) => ({
              athleteId: participant.athleteId,
              status: participant.status,
            })),
          }),
        });
        const saved = payload?.snapshot;
        if (!isKindertrainingSnapshot(saved, groupId, snapshot.sessionDate)) {
          throw new Error("INVALID_KINDERTRAINING_WEEK_SAVE");
        }
        return withKindertrainingWeekDraft(saved);
      }),
    );
    if (generation !== attendanceSessionGeneration) return;

    const failedDates = [];
    let savedCount = 0;
    results.forEach((result, index) => {
      const sessionDate = dirtySnapshots[index].sessionDate;
      if (result.status === "fulfilled") {
        savedCount += 1;
        kindertrainingWeekDirtyDates.delete(sessionDate);
        updateKindertrainingWeekSnapshot(sessionDate, () => result.value);
      } else {
        failedDates.push(germanDate(sessionDate));
      }
    });

    if (failedDates.length > 0) {
      showMessage(
        elements.kindertrainingMessage,
        "Nicht alle Tage konnten gespeichert werden: " +
          failedDates.join(", ") +
          ". Die übrigen Änderungen bleiben markiert.",
      );
    }
    if (savedCount > 0) {
      showMessage(
        elements.kindertrainingSuccess,
        savedCount === 1
          ? "1 Trainingstag wurde gespeichert."
          : String(savedCount) + " Trainingstage wurden gespeichert.",
        "success",
      );
    }
  } finally {
    if (generation === attendanceSessionGeneration) {
      kindertrainingWeekSaving = false;
      renderKindertrainingWeek();
      refreshAppAvailability();
    }
  }
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
  if (section === "users") return userAdminReady;
  if (section === "registration") return selfRegistrationReady;
  if (section === "kindertraining") return kindertrainingReady;
  if (section === "exercise-catalog") return exerciseCatalogReady;
  if (section === "training-blocks") return trainingBlocksReady;
  if (section === "training-plans") return trainingPlansReady;
  if (section === "training-documentation") return trainingDocumentationReady;
  if (section === "useful" || section === "countdown") return countdownReady;
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

  const hasOverflow = overflow.length > 0 || elements.appSignOut !== null;
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
    (elements.appNavOverflow?.querySelectorAll("[data-nav-view]").length ?? 0) > 0 ||
    elements.appSignOut !== null;
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
  const navigationSection = section === "countdown" ? "useful" : section;
  for (const control of document.querySelectorAll("[data-nav-view]")) {
    control.classList.toggle(
      "is-active",
      control.dataset.navView === navigationSection,
    );
  }
  const overflowActive = [
    ...(elements.appNavOverflow?.querySelectorAll("[data-nav-view]") ?? []),
  ].some((control) => control.dataset.navView === navigationSection);
  elements.appNavMore?.classList.toggle("is-active", overflowActive);
}

function refreshAppAvailability() {
  refreshAppNavigation();
  for (const control of [
    elements.registrationWeekPrev,
    elements.registrationWeekNext,
    elements.registrationWeekCurrent,
    elements.registrationReload,
  ]) {
    if (control) {
      control.disabled =
        selfRegistrationLoading || selfRegistrationSavingKeys.size > 0;
    }
  }
  refreshTrainingBlockControls();
  refreshTrainingPlanControls();
  refreshTrainingDocumentationControls();
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
  if (elements.registrationDashboard) {
    elements.registrationDashboard.hidden = false;
  }
  if (elements.registrationQuickAction) {
    elements.registrationQuickAction.disabled = !selfRegistrationReady;
  }
  if (elements.registrationAccessLabel) {
    elements.registrationAccessLabel.textContent = selfRegistrationReady
      ? "Für deine Athleten-Identität freigeschaltet."
      : "Nur mit einem verknüpften Athletenkonto verfügbar.";
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
  if (elements.userAdminDashboard) elements.userAdminDashboard.hidden = !userAdminReady;
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
    ((section === "useful" || section === "countdown") && countdownReady) ||
    (section === "masterdata" && masterdataReady) ||
    (section === "users" && userAdminReady) ||
    (section === "registration" && selfRegistrationReady) ||
    (section === "kindertraining" && kindertrainingReady) ||
    (section === "exercise-catalog" && exerciseCatalogReady) ||
    (section === "training-blocks" && trainingBlocksReady) ||
    (section === "training-plans" && trainingPlansReady) ||
    (section === "training-documentation" && trainingDocumentationReady);
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
  if (target === "users") void prepareUserAdminView();
  if (target === "registration") prepareSelfRegistrationView();
  if (target === "kindertraining") prepareKindertrainingView();
  if (target === "exercise-catalog") prepareExerciseCatalogView();
  if (target === "training-blocks") prepareTrainingBlocksView();
  if (target === "training-plans") prepareTrainingPlansView();
  if (target === "training-documentation") prepareTrainingDocumentationView();
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
  const generation = attendanceSessionGeneration;
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
    if (generation !== attendanceSessionGeneration) return;
    const snapshot = payload?.snapshot;
    if (!isKindertrainingSnapshot(snapshot, groupId, sessionDate)) {
      throw new Error("INVALID_KINDERTRAINING_SNAPSHOT");
    }
    kindertrainingSnapshot = snapshot;
    renderKindertrainingSnapshot();
  } catch (error) {
    if (generation !== attendanceSessionGeneration) return;
    kindertrainingSnapshot = null;
    if (elements.kindertrainingSession) elements.kindertrainingSession.hidden = true;
    showMessage(
      elements.kindertrainingMessage,
      error?.status === 403
        ? "Für die Anwesenheit dieser Trainingsgruppe fehlt die Berechtigung."
        : error?.status === 404
          ? "Die Trainingsgruppe wurde nicht gefunden."
          : "Die Anwesenheit konnte nicht geladen werden.",
    );
  } finally {
    if (generation === attendanceSessionGeneration) {
      setKindertrainingLoading(false);
    }
  }
}

function isKindertrainingSnapshot(snapshot, groupId, sessionDate) {
  if (
    snapshot === null ||
    typeof snapshot !== "object" ||
    snapshot?.group?.id !== groupId ||
    !["trainer_roll_call", "self_registration"].includes(
      snapshot?.group?.attendanceMode,
    ) ||
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
      !["unknown", "attending", "not_attending", "maybe"].includes(
        participant?.intention,
      ) ||
      !(
        participant?.registrationRevision === null ||
        (Number.isSafeInteger(participant?.registrationRevision) &&
          participant.registrationRevision >= 1)
      ) ||
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
  if (elements.kindertrainingMode) {
    elements.kindertrainingMode.textContent =
      snapshot.group.attendanceMode === "self_registration"
        ? "Modus: Selbstanmeldung + Trainerbestätigung"
        : "Modus: Anwesenheit durch Trainer";
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
    if (snapshot.group.attendanceMode === "self_registration") {
      const registration = document.createElement("span");
      registration.className = "kindertraining-registration";
      registration.dataset.intention = participant.intention;
      registration.textContent = {
        unknown: "Voranmeldung: offen",
        attending: "Voranmeldung: kommt",
        not_attending: "Voranmeldung: abgesagt",
        maybe: "Voranmeldung: vielleicht",
      }[participant.intention] || "Voranmeldung: offen";
      identity.append(registration);
    }

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
  const generation = attendanceSessionGeneration;
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
    if (generation !== attendanceSessionGeneration) return;
    const snapshot = payload?.snapshot;
    if (!isKindertrainingSnapshot(snapshot, groupId, sessionDate)) {
      throw new Error("INVALID_KINDERTRAINING_SAVE");
    }
    kindertrainingSnapshot = snapshot;
    renderKindertrainingSnapshot();
    showMessage(elements.kindertrainingSuccess, "Training wurde gespeichert.");
  } catch (error) {
    if (generation !== attendanceSessionGeneration) return;
    const conflict = error?.status === 409;
    showMessage(
      elements.kindertrainingMessage,
      error?.status === 403
        ? "Du darfst diese Anwesenheit ansehen, aber nicht speichern."
        : conflict
          ? "Dieses Training wurde inzwischen von jemand anderem geändert. Bitte neu laden, bevor du weiter speicherst."
          : error?.status === 400
            ? "Die Teilnehmerliste hat sich geändert. Bitte das Training neu laden."
            : "Die Anwesenheit konnte nicht gespeichert werden.",
    );
    if (conflict && elements.kindertrainingSaveState) {
      elements.kindertrainingSaveState.textContent = "Konflikt – neu laden";
    }
  } finally {
    if (generation === attendanceSessionGeneration) {
      setKindertrainingLoading(false);
    }
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
    elements.kindertrainingWeekPrev,
    elements.kindertrainingWeekNext,
    elements.kindertrainingWeekCurrent,
    elements.kindertrainingWeekReload,
    elements.kindertrainingWeekSave,
  ]) {
    if (control) control.disabled = value;
  }
  if (elements.kindertrainingParticipants) {
    for (const button of elements.kindertrainingParticipants.querySelectorAll("button")) {
      button.disabled = value;
    }
  }
  refreshKindertrainingWeekControls();
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

function bindMasterdataSwipe() {
  const root = document.querySelector("#masterdata");
  if (!root) return;
  let suppressClick = false;
  root.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 1) return;
    if (event.target?.closest?.("input, select, textarea, button, a, [role='dialog']")) {
      masterdataSwipeStart = null;
      return;
    }
    const touch = event.touches[0];
    masterdataSwipeStart = { x: touch.clientX, y: touch.clientY };
  }, { passive: true });
  root.addEventListener("touchend", (event) => {
    if (!masterdataSwipeStart || event.changedTouches.length !== 1) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - masterdataSwipeStart.x;
    const dy = touch.clientY - masterdataSwipeStart.y;
    masterdataSwipeStart = null;
    if (Math.abs(dx) < 65 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
    const order = ["athletes", "trainers", "groups"];
    const active = document.querySelector("[data-masterdata-tab].is-active")?.dataset.masterdataTab || "athletes";
    const index = order.indexOf(active);
    const target = dx < 0
      ? order[Math.min(order.length - 1, index + 1)]
      : order[Math.max(0, index - 1)];
    if (target && target !== active) {
      suppressClick = true;
      showMasterdataTab(target);
      window.setTimeout(() => { suppressClick = false; }, 250);
    }
  }, { passive: true });
  root.addEventListener("click", (event) => {
    if (!suppressClick) return;
    event.preventDefault();
    event.stopPropagation();
  }, true);
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
  const generation = masterdataSessionGeneration;
  masterdataLoading = true;
  showMessage(elements.masterdataMessage, "");
  try {
    const payload = await requestJson("/api/modules/athletes/masterdata");
    if (generation !== masterdataSessionGeneration) return false;
    const snapshot = payload?.masterdata;
    if (
      !Array.isArray(snapshot?.athletes) ||
      !Array.isArray(snapshot?.athleteContacts) ||
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
    if (generation !== masterdataSessionGeneration) return false;
    masterdataSnapshot = null;
    showMessage(
      elements.masterdataMessage,
      error?.status === 403
        ? "Für Stammdaten fehlt die Berechtigung."
        : "Stammdaten konnten nicht geladen werden.",
    );
    return false;
  } finally {
    if (generation === masterdataSessionGeneration) {
      masterdataLoading = false;
    }
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

  const visibleAthletes = masterdataShowInactiveAthletes
    ? snapshot.athletes
    : snapshot.athletes.filter((athlete) => athlete.isActive !== false);
  renderMasterdataList(
    elements.athleteList,
    visibleAthletes,
    "Noch keine Athleten angelegt.",
    (item) => ({
      title: String(item?.lastName || "") + ", " + String(item?.firstName || ""),
      topRight:
        item?.birthYear === null || item?.birthYear === undefined
          ? "Jahrgang –"
          : "Jahrgang " + String(item.birthYear),
      meta:
        ((activeAthleteGroups.get(item?.id) || []).join(", ") || "keine aktive Gruppe") +
        (item?.isActive === false ? " · inaktiv" : ""),
      open: { type: "athlete", id: String(item?.id || ""), item },
    }),
  );
  const visibleTrainers = masterdataShowInactiveTrainers
    ? snapshot.trainers
    : snapshot.trainers.filter((trainer) => trainer.isActive !== false);
  renderMasterdataList(
    elements.trainerList,
    visibleTrainers,
    "Noch keine Trainer angelegt.",
    (item) => ({
      title: String(item?.lastName || "") + ", " + String(item?.firstName || ""),
      topRight:
        [item?.phone, item?.email]
          .filter((value) => typeof value === "string" && value.length > 0)
          .join(" · ") || "keine Kontaktdaten",
      meta:
        ((trainerGroups.get(item?.id) || []).join(", ") || "keine Gruppe") +
        (item?.isActive === false ? " · inaktiv" : ""),
      open: { type: "trainer", id: String(item?.id || ""), item },
    }),
  );
  const visibleGroups = masterdataShowInactiveGroups
    ? snapshot.trainingGroups
    : snapshot.trainingGroups.filter((group) => group.isActive !== false);
  renderMasterdataList(
    elements.groupList,
    visibleGroups,
    "Noch keine Trainingsgruppen angelegt.",
    (item) => ({
      title: String(item?.name || ""),
      topRight:
        typeof item?.shortName === "string" && item.shortName.length > 0
          ? item.shortName
          : "",
      meta:
        (String(item?.description || "").trim() || "Keine Beschreibung") +
        (item?.isActive === false ? " · inaktiv" : ""),
      open: { type: "group", id: String(item?.id || ""), item },
    }),
  );
  renderMasterdataAthleteOverlay(snapshot);
  renderMasterdataTrainerOverlay(snapshot);
  renderMasterdataGroupOverlay(snapshot);
  if (elements.athleteCount) elements.athleteCount.textContent = "(" + String(visibleAthletes.length) + ")";
  if (elements.trainerCount) elements.trainerCount.textContent = "(" + String(visibleTrainers.length) + ")";
  if (elements.groupCount) elements.groupCount.textContent = "(" + String(visibleGroups.length) + ")";
  renderMasterdataAssignmentOptions(snapshot);
  renderTrainerIdentityAdmin();
}

function renderMasterdataAthleteContacts(snapshot, athleteId = masterdataAthleteOverlayId) {
  const container = elements.athleteContactList;
  if (!container) return;
  container.replaceChildren();

  if (!athleteId) {
    const empty = document.createElement("div");
    empty.className = "masterdata-empty";
    empty.textContent = "Athlet auswählen, um Kontakte anzuzeigen.";
    container.append(empty);
    return;
  }

  const athlete = snapshot.athletes.find((item) => item.id === athleteId);
  const contacts = snapshot.athleteContacts
    .filter((contact) => contact.athleteId === athleteId)
    .slice()
    .sort(
      (left, right) =>
        Number(left.priority || 1) - Number(right.priority || 1) ||
        String(left.contactName || "").localeCompare(
          String(right.contactName || ""),
          "de",
          { sensitivity: "base" },
        ),
    );

  if (contacts.length === 0) {
    const empty = document.createElement("div");
    empty.className = "masterdata-empty";
    empty.textContent = "Für diesen Athleten sind noch keine Kontaktpersonen erfasst.";
    container.append(empty);
    return;
  }

  for (const contact of contacts) {
    const row = document.createElement("article");
    row.className = "masterdata-row masterdata-contact-row";
    const title = document.createElement("strong");
    title.textContent = String(contact.contactName || "");
    const meta = document.createElement("span");
    meta.textContent = [
      contact.relationship || null,
      contact.phone || null,
      contact.isEmergency ? "Notfallkontakt" : null,
      "Priorität " + String(contact.priority ?? 1),
    ].filter(Boolean).join(" · ");
    row.append(title, meta);

    if (masterdataCanEdit && athlete?.isActive !== false) {
      const actions = document.createElement("div");
      actions.className = "masterdata-row__actions";

      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "masterdata-row__action masterdata-row__action--edit";
      edit.textContent = "✎";
      edit.title = "Kontakt bearbeiten";
      edit.setAttribute("aria-label", "Kontakt bearbeiten");
      edit.addEventListener("click", () => beginMasterdataAthleteContactEdit(contact));

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "masterdata-row__action";
      remove.textContent = "🗑";
      remove.title = "Kontakt löschen";
      remove.setAttribute("aria-label", "Kontakt löschen");
      remove.addEventListener("click", () => void deleteMasterdataAthleteContact(contact));

      actions.append(edit, remove);
      row.append(actions);
    }
    container.append(row);
  }
}

function beginMasterdataAthleteContactEdit(contact) {
  if (!contact || typeof contact.id !== "string" || !contact.id) return;
  masterdataContactEdit = {
    id: contact.id,
    athleteId: contact.athleteId,
  };
  if (elements.athleteContactAthlete) {
    elements.athleteContactAthlete.value = String(contact.athleteId || "");
    elements.athleteContactAthlete.disabled = true;
  }
  if (elements.athleteContactName) elements.athleteContactName.value = String(contact.contactName || "");
  if (elements.athleteContactRelationship) elements.athleteContactRelationship.value = String(contact.relationship || "");
  if (elements.athleteContactPhone) elements.athleteContactPhone.value = String(contact.phone || "");
  if (elements.athleteContactEmergency) elements.athleteContactEmergency.checked = contact.isEmergency !== false;
  if (elements.athleteContactPriority) elements.athleteContactPriority.value = String(contact.priority ?? 1);
  if (elements.athleteContactNotes) elements.athleteContactNotes.value = String(contact.notes || "");
  if (elements.athleteContactFormTitle) elements.athleteContactFormTitle.textContent = "Kontakt bearbeiten";
  if (elements.athleteContactSubmitButton) elements.athleteContactSubmitButton.textContent = "Änderungen speichern";
  if (elements.athleteContactEditCancel) elements.athleteContactEditCancel.hidden = false;
  showMasterdataAthleteOverlayMode("contact");
}

function cancelMasterdataAthleteContactEdit() {
  masterdataContactEdit = null;
  elements.athleteContactForm?.reset();
  if (elements.athleteContactPriority) elements.athleteContactPriority.value = "1";
  if (elements.athleteContactEmergency) elements.athleteContactEmergency.checked = true;
  if (elements.athleteContactAthlete) elements.athleteContactAthlete.disabled = false;
  if (elements.athleteContactFormTitle) elements.athleteContactFormTitle.textContent = "Kontakt anlegen";
  if (elements.athleteContactSubmitButton) elements.athleteContactSubmitButton.textContent = "Kontakt anlegen";
  if (elements.athleteContactEditCancel) elements.athleteContactEditCancel.hidden = false;
  if (masterdataSnapshot) renderMasterdataAssignmentOptions(masterdataSnapshot);
  if (masterdataAthleteOverlayId) showMasterdataAthleteOverlayMode("detail");
}

async function saveMasterdataAthleteContact(event) {
  event.preventDefault();
  const athleteId =
    masterdataContactEdit?.athleteId ||
    elements.athleteContactAthlete?.value ||
    "";
  const editId = masterdataContactEdit?.id || null;
  const priorityRaw = elements.athleteContactPriority?.value.trim() || "1";
  const saved = await submitMasterdataForm(
    editId
      ? "/api/modules/athletes/masterdata/athlete-contacts/" +
          encodeURIComponent(editId) +
          "/update"
      : "/api/modules/athletes/masterdata/athlete-contacts",
    {
      athleteId,
      contactName: elements.athleteContactName?.value ?? "",
      relationship: emptyToNull(elements.athleteContactRelationship?.value),
      phone: elements.athleteContactPhone?.value ?? "",
      isEmergency: elements.athleteContactEmergency?.checked === true,
      priority: Number(priorityRaw),
      notes: emptyToNull(elements.athleteContactNotes?.value),
    },
    elements.athleteContactForm,
  );
  if (saved) cancelMasterdataAthleteContactEdit();
}

async function deleteMasterdataAthleteContact(contact) {
  if (
    !masterdataCanEdit ||
    masterdataLoading ||
    typeof contact?.id !== "string" ||
    typeof contact?.athleteId !== "string"
  ) return;
  if (!window.confirm("Diese Kontaktperson wirklich löschen?")) return;
  setMasterdataFormsDisabled(true);
  showMessage(elements.masterdataMessage, "");
  try {
    await requestJson(
      "/api/modules/athletes/masterdata/athlete-contacts/" +
        encodeURIComponent(contact.id) +
        "/delete",
      {
        method: "POST",
        body: JSON.stringify({ athleteId: contact.athleteId }),
      },
    );
    if (masterdataContactEdit?.id === contact.id) {
      cancelMasterdataAthleteContactEdit();
    }
    masterdataSnapshot = null;
    await loadMasterdata(true);
    showMessage(elements.masterdataSuccess, "Kontaktperson wurde gelöscht.");
  } catch (error) {
    showMessage(
      elements.masterdataMessage,
      error?.status === 403
        ? "Du darfst Stammdaten ansehen, aber nicht bearbeiten."
        : error?.status === 404
          ? "Die Kontaktperson wurde nicht gefunden."
          : "Die Kontaktperson konnte nicht gelöscht werden.",
    );
  } finally {
    setMasterdataFormsDisabled(false);
  }
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
      const selectedTrainer = selectedMasterdataTrainer();
      const visibleBindings = selectedTrainer
        ? trainerIdentityBindings.filter(
            (binding) => binding.trainerId === selectedTrainer.id,
          )
        : trainerIdentityBindings;
      if (selectedTrainer && visibleBindings.length === 0) {
        const empty = document.createElement("div");
        empty.className = "masterdata-empty";
        empty.textContent = "Für diesen Trainer ist noch kein Benutzer zugeordnet.";
        container.append(empty);
      }
      for (const binding of visibleBindings) {
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
  if (masterdataTrainerOverlayId) {
    if (elements.trainerIdentityTrainer) {
      elements.trainerIdentityTrainer.value = masterdataTrainerOverlayId;
    }
    if (elements.trainerUserTrainer) {
      elements.trainerUserTrainer.value = masterdataTrainerOverlayId;
    }
  } else {
    syncTrainerIdentitySelection();
  }
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
  const generation = masterdataSessionGeneration;
  trainerIdentityLoading = true;
  trainerIdentityAdminReady = false;
  setTrainerIdentityControlsDisabled(true);
  showMessage(elements.trainerIdentityMessage, "");
  showMessage(elements.trainerIdentitySuccess, "");
  try {
    const bindings = await fetchTrainerIdentityBindings();
    if (generation !== masterdataSessionGeneration) return;
    trainerIdentityBindings = bindings;
    trainerIdentityAdminReady = true;
    if (elements.trainerIdentityWorkspace) {
      elements.trainerIdentityWorkspace.hidden = false;
    }
    renderTrainerIdentityAdmin();
  } catch (error) {
    if (generation !== masterdataSessionGeneration) return;
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
    if (generation === masterdataSessionGeneration) {
      trainerIdentityLoading = false;
      setTrainerIdentityControlsDisabled(false);
    }
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
  if (masterdataTrainerOverlayId) {
    elements.trainerIdentityTrainer.value = masterdataTrainerOverlayId;
    return;
  }
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
    const right = document.createElement("span");
    right.className = "masterdata-row__right";
    right.textContent = description.topRight || "";
    const meta = document.createElement("span");
    meta.className = "masterdata-row__secondary";
    meta.textContent = description.meta || "";
    row.append(title, right, meta);
    if (description.open?.id) {
      row.classList.add("masterdata-row--interactive");
      row.tabIndex = 0;
      row.setAttribute("role", "button");
      row.setAttribute("aria-label", description.title + " öffnen");
      const open = () => openMasterdataEntityOverlay(description.open);
      row.addEventListener("click", open);
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      });
    }
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

function openMasterdataEntityOverlay(action) {
  if (action?.type === "athlete") {
    openMasterdataAthleteOverlay(action.id);
    return;
  }
  if (action?.type === "trainer") {
    openMasterdataTrainerOverlay(action.id);
    return;
  }
  if (action?.type === "group") {
    openMasterdataGroupOverlay(action.id);
  }
}

function selectedMasterdataTrainer() {
  if (!masterdataSnapshot || !masterdataTrainerOverlayId) return null;
  return (
    masterdataSnapshot.trainers.find(
      (trainer) => trainer.id === masterdataTrainerOverlayId,
    ) || null
  );
}

function openMasterdataTrainerOverlay(trainerId) {
  if (!masterdataSnapshot) return;
  const trainer = masterdataSnapshot.trainers.find((item) => item.id === trainerId);
  if (!trainer) return;
  masterdataEdit = null;
  masterdataTrainerOverlayId = trainerId;
  showMasterdataTrainerOverlayMode("detail");
}

function openNewMasterdataTrainer() {
  if (!masterdataCanEdit) return;
  masterdataTrainerOverlayId = null;
  masterdataEdit = null;
  elements.trainerForm?.reset();
  refreshMasterdataEditMode();
  showMasterdataTrainerOverlayMode("trainer");
  if (elements.trainerOverlayTitle) elements.trainerOverlayTitle.textContent = "Trainer anlegen";
  if (elements.trainerOverlayMeta) elements.trainerOverlayMeta.textContent = "Neuen Trainer erfassen";
  elements.trainerFirstName?.focus();
}

function closeMasterdataTrainerOverlay() {
  masterdataTrainerOverlayMode = "closed";
  masterdataTrainerOverlayId = null;
  masterdataEdit = null;
  elements.trainerForm?.reset();
  elements.trainerGroupForm?.reset();
  if (elements.trainerIdentityAdmin) elements.trainerIdentityAdmin.hidden = true;
  refreshMasterdataEditMode();
  if (elements.trainerOverlay) elements.trainerOverlay.hidden = true;
  document.body.classList.remove("masterdata-athlete-overlay-open");
}

function showMasterdataTrainerOverlayMode(mode) {
  masterdataTrainerOverlayMode = mode;
  if (elements.trainerOverlay) elements.trainerOverlay.hidden = false;
  document.body.classList.add("masterdata-athlete-overlay-open");
  if (elements.trainerDetail) elements.trainerDetail.hidden = mode !== "detail";
  if (elements.trainerForm) elements.trainerForm.hidden = mode !== "trainer";
  if (elements.trainerGroupForm) elements.trainerGroupForm.hidden = mode !== "group";
  if (elements.trainerIdentityAdmin) elements.trainerIdentityAdmin.hidden = mode !== "identity";
  if (masterdataSnapshot) renderMasterdataTrainerOverlay(masterdataSnapshot);
}

function renderMasterdataTrainerOverlay(snapshot) {
  if (masterdataTrainerOverlayMode === "closed") return;
  const trainer = selectedMasterdataTrainer();
  if (masterdataTrainerOverlayMode === "trainer" && trainer === null) return;
  if (trainer === null) {
    closeMasterdataTrainerOverlay();
    return;
  }
  const groupsById = new Map(
    snapshot.trainingGroups.map((group) => [group.id, group.name]),
  );
  const groups = (snapshot.trainerGroupMemberships || [])
    .filter((membership) => membership.trainerId === trainer.id)
    .map((membership) => groupsById.get(membership.groupId))
    .filter(Boolean);

  if (elements.trainerOverlayTitle) {
    elements.trainerOverlayTitle.textContent =
      String(trainer.firstName || "") + " " + String(trainer.lastName || "");
  }
  if (elements.trainerOverlayMeta) {
    elements.trainerOverlayMeta.textContent = [
      groups.length ? groups.join(", ") : "keine Gruppe",
      trainer.phone || null,
      trainer.email || null,
      trainer.isActive === false ? "inaktiv" : null,
    ].filter(Boolean).join(" · ");
  }
  if (elements.trainerDetailNotes) {
    const notes = String(trainer.notes || "").trim();
    elements.trainerDetailNotes.textContent = notes;
    elements.trainerDetailNotes.hidden = notes.length === 0;
  }
  const editable = masterdataCanEdit && trainer.isActive !== false;
  for (const control of [
    elements.trainerDetailEdit,
    elements.trainerDetailGroup,
    elements.trainerDetailUser,
  ]) {
    if (control) control.disabled = !editable;
  }
  if (elements.trainerDetailDeactivate) {
    elements.trainerDetailDeactivate.hidden = trainer.isActive === false;
    elements.trainerDetailDeactivate.disabled = !editable;
  }
  if (elements.trainerDetailReactivate) {
    elements.trainerDetailReactivate.hidden = trainer.isActive !== false || !masterdataCanEdit;
    elements.trainerDetailReactivate.disabled = !masterdataCanEdit;
  }
  if (elements.trainerGroupTrainer) elements.trainerGroupTrainer.value = trainer.id;
  if (elements.trainerUserTrainer) elements.trainerUserTrainer.value = trainer.id;
  if (elements.trainerIdentityTrainer) elements.trainerIdentityTrainer.value = trainer.id;
  if (masterdataTrainerOverlayMode === "identity") renderTrainerIdentityAdmin();
}

function openNewMasterdataTrainerGroup() {
  const trainer = selectedMasterdataTrainer();
  if (!trainer || !masterdataCanEdit || trainer.isActive === false) return;
  elements.trainerGroupForm?.reset();
  renderMasterdataAssignmentOptions(masterdataSnapshot);
  if (elements.trainerGroupTrainer) elements.trainerGroupTrainer.value = trainer.id;
  showMasterdataTrainerOverlayMode("group");
}

function openMasterdataTrainerIdentity() {
  const trainer = selectedMasterdataTrainer();
  if (!trainer || !masterdataCanEdit || trainer.isActive === false) return;
  showMasterdataTrainerOverlayMode("identity");
  if (!trainerIdentityAdminReady && !trainerIdentityLoading) {
    void loadTrainerIdentityAdmin();
  }
}

function selectedMasterdataGroup() {
  if (!masterdataSnapshot || !masterdataGroupOverlayId) return null;
  return (
    masterdataSnapshot.trainingGroups.find(
      (group) => group.id === masterdataGroupOverlayId,
    ) || null
  );
}

function openMasterdataGroupOverlay(groupId) {
  if (!masterdataSnapshot) return;
  const group = masterdataSnapshot.trainingGroups.find((item) => item.id === groupId);
  if (!group) return;
  masterdataEdit = null;
  masterdataGroupOverlayId = groupId;
  showMasterdataGroupOverlayMode("detail");
}

function openNewMasterdataGroup() {
  if (!masterdataCanEdit) return;
  masterdataGroupOverlayId = null;
  masterdataEdit = null;
  elements.groupForm?.reset();
  if (elements.groupAttendanceMode) {
    elements.groupAttendanceMode.value = "trainer_roll_call";
  }
  if (elements.groupSortOrder) elements.groupSortOrder.value = "100";
  refreshMasterdataEditMode();
  showMasterdataGroupOverlayMode("group");
  if (elements.groupOverlayTitle) elements.groupOverlayTitle.textContent = "Trainingsgruppe anlegen";
  if (elements.groupOverlayMeta) elements.groupOverlayMeta.textContent = "Neue Trainingsgruppe erfassen";
  elements.groupName?.focus();
}

function closeMasterdataGroupOverlay() {
  masterdataGroupOverlayMode = "closed";
  masterdataGroupOverlayId = null;
  masterdataEdit = null;
  elements.groupForm?.reset();
  if (elements.groupAttendanceMode) {
    elements.groupAttendanceMode.value = "trainer_roll_call";
  }
  if (elements.groupSortOrder) elements.groupSortOrder.value = "100";
  refreshMasterdataEditMode();
  if (elements.groupOverlay) elements.groupOverlay.hidden = true;
  document.body.classList.remove("masterdata-athlete-overlay-open");
}

function showMasterdataGroupOverlayMode(mode) {
  masterdataGroupOverlayMode = mode;
  if (elements.groupOverlay) elements.groupOverlay.hidden = false;
  document.body.classList.add("masterdata-athlete-overlay-open");
  if (elements.groupDetail) elements.groupDetail.hidden = mode !== "detail";
  if (elements.groupForm) elements.groupForm.hidden = mode !== "group";
  if (masterdataSnapshot) renderMasterdataGroupOverlay(masterdataSnapshot);
}

function renderMasterdataGroupOverlay(snapshot) {
  if (masterdataGroupOverlayMode === "closed") return;
  const group = selectedMasterdataGroup();
  if (masterdataGroupOverlayMode === "group" && group === null) return;
  if (group === null) {
    closeMasterdataGroupOverlay();
    return;
  }
  if (elements.groupOverlayTitle) elements.groupOverlayTitle.textContent = String(group.name || "");
  if (elements.groupOverlayMeta) {
    elements.groupOverlayMeta.textContent = [
      group.shortName || null,
      group.attendanceMode === "self_registration"
        ? "Selbstanmeldung"
        : "Trainer-Erfassung",
      group.isActive === false ? "inaktiv" : "aktiv",
    ].filter(Boolean).join(" · ");
  }
  if (elements.groupDetailDescription) {
    const description = String(group.description || "").trim();
    elements.groupDetailDescription.textContent = description;
    elements.groupDetailDescription.hidden = description.length === 0;
  }
  if (elements.groupDetailEdit) {
    elements.groupDetailEdit.disabled = !masterdataCanEdit || group.isActive === false;
  }
}

function selectedMasterdataAthlete() {
  if (!masterdataSnapshot || !masterdataAthleteOverlayId) return null;
  return (
    masterdataSnapshot.athletes.find(
      (athlete) => athlete.id === masterdataAthleteOverlayId,
    ) || null
  );
}

function openMasterdataAthleteOverlay(athleteId) {
  if (!masterdataSnapshot) return;
  const athlete = masterdataSnapshot.athletes.find(
    (item) => item.id === athleteId,
  );
  if (!athlete) return;
  masterdataEdit = null;
  masterdataContactEdit = null;
  masterdataAthleteOverlayId = athleteId;
  showMasterdataAthleteOverlayMode("detail");
}

function openNewMasterdataAthlete() {
  if (!masterdataCanEdit) return;
  masterdataAthleteOverlayId = null;
  masterdataEdit = null;
  masterdataContactEdit = null;
  elements.athleteForm?.reset();
  refreshMasterdataEditMode();
  showMasterdataAthleteOverlayMode("athlete");
  if (elements.athleteOverlayTitle) {
    elements.athleteOverlayTitle.textContent = "Athlet anlegen";
  }
  if (elements.athleteOverlayMeta) {
    elements.athleteOverlayMeta.textContent = "Neuen Athleten erfassen";
  }
  elements.athleteFirstName?.focus();
}

function closeMasterdataAthleteOverlay() {
  masterdataAthleteOverlayMode = "closed";
  masterdataAthleteOverlayId = null;
  masterdataEdit = null;
  masterdataContactEdit = null;
  elements.athleteForm?.reset();
  elements.athleteContactForm?.reset();
  elements.athleteGroupForm?.reset();
  elements.athleteUserForm?.reset();
  refreshMasterdataEditMode();
  if (elements.athleteOverlay) elements.athleteOverlay.hidden = true;
  document.body.classList.remove("masterdata-athlete-overlay-open");
}

function showMasterdataAthleteOverlayMode(mode) {
  masterdataAthleteOverlayMode = mode;
  if (elements.athleteOverlay) elements.athleteOverlay.hidden = false;
  document.body.classList.add("masterdata-athlete-overlay-open");
  if (elements.athleteDetail) elements.athleteDetail.hidden = mode !== "detail";
  if (elements.athleteForm) elements.athleteForm.hidden = mode !== "athlete";
  if (elements.athleteContactForm) {
    elements.athleteContactForm.hidden = mode !== "contact";
  }
  if (elements.athleteGroupForm) {
    elements.athleteGroupForm.hidden = mode !== "group";
  }
  if (elements.athleteUserForm) {
    elements.athleteUserForm.hidden = mode !== "user";
  }
  if (elements.athleteEditCancel) {
    elements.athleteEditCancel.hidden = mode !== "athlete";
  }
  if (masterdataSnapshot) renderMasterdataAthleteOverlay(masterdataSnapshot);
}

function renderMasterdataAthleteOverlay(snapshot) {
  if (masterdataAthleteOverlayMode === "closed") return;
  const athlete = selectedMasterdataAthlete();

  if (masterdataAthleteOverlayMode === "athlete" && athlete === null) {
    return;
  }
  if (athlete === null) {
    closeMasterdataAthleteOverlay();
    return;
  }

  const memberships = (snapshot.athleteGroupMemberships || []).filter(
    (membership) =>
      membership.athleteId === athlete.id &&
      (membership.endedOn === null || membership.endedOn === undefined),
  );
  const groupNames = memberships
    .map((membership) =>
      snapshot.trainingGroups.find((group) => group.id === membership.groupId),
    )
    .filter(Boolean)
    .map((group) => group.name);

  if (elements.athleteOverlayTitle) {
    elements.athleteOverlayTitle.textContent =
      String(athlete.firstName || "") + " " + String(athlete.lastName || "");
  }
  if (elements.athleteOverlayMeta) {
    elements.athleteOverlayMeta.textContent = [
      athlete.birthYear === null || athlete.birthYear === undefined
        ? "Jahrgang nicht erfasst"
        : "Jahrgang " + String(athlete.birthYear),
      groupNames.length ? groupNames.join(", ") : "keine aktive Gruppe",
      athlete.isActive === false ? "inaktiv" : null,
    ].filter(Boolean).join(" · ");
  }
  if (elements.athleteDetailNotes) {
    const notes = String(athlete.notes || "").trim();
    elements.athleteDetailNotes.textContent = notes;
    elements.athleteDetailNotes.hidden = notes.length === 0;
  }

  const editable = masterdataCanEdit && athlete.isActive !== false;
  for (const control of [
    elements.athleteDetailEdit,
    elements.athleteDetailContactNew,
    elements.athleteDetailGroupNew,
    elements.athleteDetailUser,
  ]) {
    if (control) control.disabled = !editable;
  }
  if (elements.athleteDetailDeactivate) {
    elements.athleteDetailDeactivate.hidden = athlete.isActive === false;
    elements.athleteDetailDeactivate.disabled = !editable;
  }

  if (elements.athleteDetailReactivate) {
    elements.athleteDetailReactivate.hidden = athlete.isActive !== false || !masterdataCanEdit;
    elements.athleteDetailReactivate.disabled = !masterdataCanEdit;
  }
  renderMasterdataAthleteContacts(snapshot, athlete.id);
  if (elements.athleteContactAthlete) {
    elements.athleteContactAthlete.value = athlete.id;
  }
  if (elements.athleteGroupAthlete) {
    elements.athleteGroupAthlete.value = athlete.id;
  }
}

function openNewMasterdataAthleteContact() {
  const athlete = selectedMasterdataAthlete();
  if (!athlete || !masterdataCanEdit || athlete.isActive === false) return;
  masterdataContactEdit = null;
  elements.athleteContactForm?.reset();
  if (elements.athleteContactPriority) elements.athleteContactPriority.value = "1";
  if (elements.athleteContactEmergency) elements.athleteContactEmergency.checked = true;
  if (elements.athleteContactAthlete) {
    elements.athleteContactAthlete.value = athlete.id;
    elements.athleteContactAthlete.disabled = false;
  }
  if (elements.athleteContactFormTitle) {
    elements.athleteContactFormTitle.textContent = "Kontakt anlegen";
  }
  if (elements.athleteContactSubmitButton) {
    elements.athleteContactSubmitButton.textContent = "Kontakt anlegen";
  }
  showMasterdataAthleteOverlayMode("contact");
  elements.athleteContactName?.focus();
}

function openNewMasterdataAthleteGroup() {
  const athlete = selectedMasterdataAthlete();
  if (!athlete || !masterdataCanEdit || athlete.isActive === false) return;
  elements.athleteGroupForm?.reset();
  renderMasterdataAssignmentOptions(masterdataSnapshot);
  if (elements.athleteGroupAthlete) {
    elements.athleteGroupAthlete.value = athlete.id;
  }
  if (elements.athleteGroupStartedOn) {
    elements.athleteGroupStartedOn.value = localDateValue(new Date());
  }
  showMasterdataAthleteOverlayMode("group");
}

function openMasterdataAthleteUser() {
  const athlete = selectedMasterdataAthlete();
  if (!athlete || !masterdataCanEdit || athlete.isActive === false) return;
  elements.athleteUserForm?.reset();
  showMessage(elements.athleteUserMessage, "");
  showMessage(elements.athleteUserSuccess, "");
  if (elements.athleteUserDisplayName) {
    elements.athleteUserDisplayName.value =
      String(athlete.firstName || "") + " " + String(athlete.lastName || "");
  }
  showMasterdataAthleteOverlayMode("user");
  elements.athleteUserUsername?.focus();
}

async function createAthleteUser(event) {
  event.preventDefault();
  const athlete = selectedMasterdataAthlete();
  if (!athlete || !masterdataCanEdit || athlete.isActive === false) return;

  const username = elements.athleteUserUsername?.value.trim() || "";
  const displayName = elements.athleteUserDisplayName?.value.trim() || "";
  const contactEmail = elements.athleteUserEmail?.value.trim() || "";
  const temporaryPassword = elements.athleteUserPassword?.value || "";

  showMessage(elements.athleteUserMessage, "");
  showMessage(elements.athleteUserSuccess, "");

  try {
    await requestJson("/api/admin/athlete-users", {
      method: "POST",
      body: JSON.stringify({
        username,
        displayName,
        temporaryPassword,
        athleteId: athlete.id,
        ...(contactEmail ? { contactEmail } : {}),
      }),
    });
    elements.athleteUserForm?.reset();
    if (elements.athleteUserDisplayName) {
      elements.athleteUserDisplayName.value =
        String(athlete.firstName || "") + " " + String(athlete.lastName || "");
    }
    showMessage(
      elements.athleteUserSuccess,
      "Athleten-Benutzer wurde angelegt. Beim ersten Login ist ein Passwortwechsel erforderlich.",
    );
  } catch (error) {
    showMessage(
      elements.athleteUserMessage,
      error?.status === 403
        ? "Athleten-Benutzer können nur von Administratoren angelegt werden."
        : error?.status === 404
          ? "Der ausgewählte Athlet ist nicht mehr verfügbar."
          : error?.status === 409
            ? "Benutzername oder Athlet ist bereits mit einem aktiven Benutzer verknüpft."
            : error?.status === 400
              ? "Bitte Benutzername, Passwort und Eingaben prüfen."
              : "Der Athleten-Benutzer konnte nicht angelegt werden.",
    );
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
    masterdataAthleteOverlayId = id;
    showMasterdataAthleteOverlayMode("athlete");
  } else if (type === "trainer") {
    showMasterdataTab("trainers");
    if (elements.trainerFirstName) elements.trainerFirstName.value = String(item.firstName || "");
    if (elements.trainerLastName) elements.trainerLastName.value = String(item.lastName || "");
    if (elements.trainerPhone) elements.trainerPhone.value = String(item.phone || "");
    if (elements.trainerEmail) elements.trainerEmail.value = String(item.email || "");
    if (elements.trainerNotes) elements.trainerNotes.value = String(item.notes || "");
    masterdataTrainerOverlayId = id;
    showMasterdataTrainerOverlayMode("trainer");
  } else {
    showMasterdataTab("groups");
    if (elements.groupName) elements.groupName.value = String(item.name || "");
    if (elements.groupShortName) elements.groupShortName.value = String(item.shortName || "");
    if (elements.groupDescription) elements.groupDescription.value = String(item.description || "");
    if (elements.groupAttendanceMode) {
      elements.groupAttendanceMode.value =
        item.attendanceMode === "self_registration"
          ? "self_registration"
          : "trainer_roll_call";
    }
    if (elements.groupSortOrder) elements.groupSortOrder.value = String(item.sortOrder ?? 100);
    masterdataGroupOverlayId = id;
    showMasterdataGroupOverlayMode("group");
  }

  refreshMasterdataEditMode();
}

function cancelMasterdataEdit() {
  const previousType = masterdataEdit?.type;
  masterdataEdit = null;
  if (previousType === "athlete") {
    elements.athleteForm?.reset();
    if (masterdataAthleteOverlayId) showMasterdataAthleteOverlayMode("detail");
  }
  if (previousType === "trainer") {
    elements.trainerForm?.reset();
    if (masterdataTrainerOverlayId) showMasterdataTrainerOverlayMode("detail");
  }
  if (previousType === "group") {
    elements.groupForm?.reset();
    if (elements.groupAttendanceMode) {
      elements.groupAttendanceMode.value = "trainer_roll_call";
    }
    if (elements.groupSortOrder) elements.groupSortOrder.value = "100";
    if (masterdataGroupOverlayId) showMasterdataGroupOverlayMode("detail");
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
  if (elements.athleteEditCancel) {
    elements.athleteEditCancel.hidden = masterdataAthleteOverlayMode !== "athlete";
  }

  if (elements.trainerFormTitle) {
    elements.trainerFormTitle.textContent = trainerEditing ? "Trainer bearbeiten" : "Trainer anlegen";
  }
  if (elements.trainerSubmitButton) {
    elements.trainerSubmitButton.textContent = trainerEditing ? "Änderungen speichern" : "Trainer anlegen";
  }
  if (elements.trainerEditCancel) elements.trainerEditCancel.hidden = masterdataTrainerOverlayMode !== "trainer";

  if (elements.groupFormTitle) {
    elements.groupFormTitle.textContent = groupEditing ? "Trainingsgruppe bearbeiten" : "Trainingsgruppe anlegen";
  }
  if (elements.groupSubmitButton) {
    elements.groupSubmitButton.textContent = groupEditing ? "Änderungen speichern" : "Gruppe anlegen";
  }
  if (elements.groupEditCancel) elements.groupEditCancel.hidden = masterdataGroupOverlayMode !== "group";
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
    elements.athleteContactAthlete,
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
  if (saved) {
    if (editId) cancelMasterdataEdit();
    else closeMasterdataAthleteOverlay();
  }
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
  if (saved) {
    if (editId) cancelMasterdataEdit();
    else closeMasterdataTrainerOverlay();
  }
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
      attendanceMode:
        elements.groupAttendanceMode?.value === "self_registration"
          ? "self_registration"
          : "trainer_roll_call",
      sortOrder: Number(sortOrderRaw),
    },
    elements.groupForm,
  );
  if (saved) {
    if (editId) cancelMasterdataEdit();
    else closeMasterdataGroupOverlay();
  }
}

async function createAthleteGroupMembership(event) {
  event.preventDefault();
  const athleteId =
    masterdataAthleteOverlayId ||
    elements.athleteGroupAthlete?.value ||
    "";
  const saved = await submitMasterdataForm(
    "/api/modules/athletes/masterdata/athlete-group-memberships",
    {
      athleteId,
      groupId: elements.athleteGroupGroup?.value ?? "",
      startedOn: elements.athleteGroupStartedOn?.value ?? "",
    },
    elements.athleteGroupForm,
  );
  if (saved && athleteId) {
    masterdataAthleteOverlayId = athleteId;
    showMasterdataAthleteOverlayMode("detail");
  }
}

async function createTrainerGroupMembership(event) {
  event.preventDefault();
  const trainerId =
    masterdataTrainerOverlayId ||
    elements.trainerGroupTrainer?.value ||
    "";
  const saved = await submitMasterdataForm(
    "/api/modules/athletes/masterdata/trainer-group-memberships",
    {
      trainerId,
      groupId: elements.trainerGroupGroup?.value ?? "",
    },
    elements.trainerGroupForm,
  );
  if (saved && trainerId) {
    masterdataTrainerOverlayId = trainerId;
    showMasterdataTrainerOverlayMode("detail");
  }
}

async function reactivateMasterdataEntity(action) {
  if (!masterdataReady || masterdataLoading || !masterdataCanEdit) return;
  const type = action?.type === "athlete" ? "athletes" : action?.type === "trainer" ? "trainers" : null;
  const id = typeof action?.id === "string" ? action.id : "";
  if (!type || !id) return;
  if (!window.confirm("Datensatz wieder aktivieren? Frühere Gruppenzuordnungen werden nicht automatisch wiederhergestellt.")) return;
  setMasterdataFormsDisabled(true);
  showMessage(elements.masterdataMessage, "");
  try {
    await requestJson(
      "/api/modules/athletes/masterdata/" + type + "/" + encodeURIComponent(id) + "/reactivate",
      { method: "POST" },
    );
    masterdataSnapshot = null;
    await loadMasterdata(true);
  } catch (error) {
    showMessage(elements.masterdataMessage,
      error?.status === 403
        ? "Du darfst Stammdaten ansehen, aber nicht bearbeiten."
        : error?.status === 404
          ? "Der Datensatz wurde nicht gefunden oder ist bereits aktiv."
          : "Der Datensatz konnte nicht wieder aktiviert werden.");
  } finally {
    setMasterdataFormsDisabled(false);
  }
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
    if (form === elements.groupForm) {
      if (elements.groupAttendanceMode) {
        elements.groupAttendanceMode.value = "trainer_roll_call";
      }
      if (elements.groupSortOrder) {
        elements.groupSortOrder.value = "100";
      }
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
  // Stop preserves the original server timeline and cue position. Start must
  // resume the same session, not re-fetch a plan or replay preparation cues.
  if (runMode === "stopped" && plan !== null) {
    runMode = "running";
    resumedAt = performance.now();
    renderAt(elapsedBeforeRunMs / 1000);
    refreshControls();
    startTicker();
    void acquireWakeLock();
    return;
  }
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

function stopCountdown() {
  if (runMode !== "running" && runMode !== "paused") return;
  elapsedBeforeRunMs = currentElapsedMs();
  runMode = "stopped";
  stopTicker();
  cancelSpeech();
  void releaseWakeLock();
  renderAt(elapsedBeforeRunMs / 1000);
  refreshControls();
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
  if (elements.timerStage) {
    elements.timerStage.dataset.phase = snapshot.phase;
    elements.timerStage.dataset.mode = runMode;
  }
  if (elements.phaseLabel) {
    elements.phaseLabel.textContent = runMode === "stopped"
      ? "Gestoppt" : phaseLabel(snapshot.phase);
  }
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
  if (elements.timerHint) {
    elements.timerHint.textContent = runMode === "stopped"
      ? "Mit Start an dieser Stelle fortsetzen."
      : phaseHint(snapshot.phase);
  }
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
  if (elements.timerStage) {
    elements.timerStage.dataset.phase = "idle";
    elements.timerStage.dataset.mode = "idle";
  }
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
    elements.startButton.textContent = runMode === "finished"
      ? "Neu starten"
      : runMode === "stopped" ? "Fortsetzen" : "Start";
  }
  if (elements.pauseButton) {
    elements.pauseButton.hidden = runMode !== "running" && runMode !== "paused";
    elements.pauseButton.textContent = runMode === "paused" ? "Weiter" : "Pause";
    elements.pauseButton.disabled = busy;
  }
  if (elements.stopButton) {
    elements.stopButton.hidden = runMode !== "running" && runMode !== "paused";
    elements.stopButton.disabled = busy;
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

function setAuthenticatedAppInteractionLocked(locked) {
  if (!elements.appView) return;
  if (locked) {
    elements.appView.setAttribute("inert", "");
    elements.appView.setAttribute("aria-busy", "true");
    return;
  }
  elements.appView.removeAttribute("inert");
  elements.appView.removeAttribute("aria-busy");
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
