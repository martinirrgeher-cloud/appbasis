export const ULC_U12_HTML = `
          <section class="app-section" data-app-section="u12" id="u12" hidden>
            <header class="u12-head ab-page-header">
              <div class="u12-head__title ab-page-header__copy">
                <h1>U12 · Anwesenheit</h1>
                <small id="u12-group-label" hidden>Trainingsgruppe wird geladen</small>
              </div>
            </header>
            <p class="message message--error" id="u12-message" role="alert" hidden></p>
            <p class="message message--success" id="u12-success" role="status" hidden></p>
            <select id="u12-group" aria-label="Zugeordnete U12-Gruppe" hidden>
              <option value="">Gruppe wird geladen</option>
            </select>
            <div class="u12-date-toolbar ab-surface" aria-label="Trainingstermin">
              <div class="u12-date-nav">
                <button class="u12-date-arrow" type="button" id="u12-prev" aria-label="Vorheriger Tag">‹</button>
                <label class="u12-date-field" for="u12-date">
                  <span>Trainingstag</span>
                  <input type="date" id="u12-date" required aria-label="Trainingstag auswählen" />
                </label>
                <button class="u12-date-arrow" type="button" id="u12-next" aria-label="Nächster Tag">›</button>
              </div>
              <div class="u12-date-shortcuts">
                <button class="u12-date-today" type="button" id="u12-today">Heute</button>
                <button class="u12-date-reload ab-icon-button" type="button" id="u12-reload" title="Anwesenheit neu laden" aria-label="Liste neu laden">↻</button>
              </div>
            </div>
            <section id="u12-week" class="u12-week" hidden>
              <div class="card u12-savebar ab-surface">
                <div>
                  <strong id="u12-count">0 von 0 anwesend</strong>
                  <small id="u12-save-state" role="status">Training auswählen</small>
                </div>
                <button class="button button--secondary" type="button" id="u12-save" aria-label="Speichern erneut versuchen" hidden disabled>Erneut versuchen</button>
              </div>
              <div class="u12-content-shell">
                <details class="u12-content-card ab-surface" id="u12-content-card">
                <summary class="u12-content-summary ab-disclosure">
                  <span>Trainingsinhalte <small id="u12-content-count">0 / 5</small></span>
                </summary>
                <div class="u12-content-body">
                  <div id="u12-content-rows" class="u12-content-rows"></div>
                  <div class="u12-content-actions">
                    <button type="button" class="u12-content-add" id="u12-content-add">＋ Inhalt</button>
                    <button type="button" class="button button--secondary u12-content-assign" id="u12-content-assign" aria-haspopup="dialog" aria-controls="u12-assignment-section" disabled>Inhalte zuordnen</button>
                  </div>
                </div>
                </details>
                <button class="u12-category-shortcut ab-icon-button" type="button" data-youth-category-area="u12" hidden disabled
                  aria-label="U12-Trainingskategorien bearbeiten" title="Trainingskategorien bearbeiten">⚙</button>
              </div>
              <details class="u12-trainers-card ab-surface" id="u12-trainers-card">
                <summary class="u12-trainers-summary ab-disclosure" aria-label="Traineranwesenheit">
                  <span>Trainer</span>
                  <span class="u12-trainers-summary-status">
                    <small id="u12-trainers-count">0/0</small>
                  </span>
                </summary>
                <div class="u12-trainers-list" id="u12-trainers-rows"></div>
              </details>
              <details class="u12-notes-card ab-surface" id="u12-notes-card">
                <summary class="ab-disclosure">Notizen zum Training <small>optional</small></summary>
                <div class="u12-notes-body">
                  <label for="u12-note">Besondere Vorkommnisse und Informationen</label>
                  <textarea id="u12-note" maxlength="3000" rows="3"
                    placeholder="z. B. Wetter, Änderungen, Besonderheiten"></textarea>
                </div>
              </details>
              <div class="u12-attendance-toolbar">
                <strong>Anwesenheit</strong>
                <div class="u12-attendance-toolbar__actions">
                  <button class="button button--secondary u12-statistics-open" type="button" id="u12-statistics-open"
                    aria-haspopup="dialog" aria-controls="u12-statistics-dialog">Statistik</button>
                  <button class="button button--secondary u12-athlete-new ab-icon-button" type="button" id="u12-add-athlete" hidden
                    title="Kind direkt der U12-Gruppe zuordnen" aria-label="Neues Kind anlegen">＋</button>
                </div>
              </div>
              <div id="u12-days" class="u12-days" aria-live="polite"></div>
            </section>
            <dialog class="u12-details-dialog u12-matrix-dialog" id="u12-assignment-section" aria-labelledby="u12-assignment-heading" aria-describedby="u12-assignment-help">
              <header class="u12-details-header u12-matrix-dialog__header">
                <div class="u12-matrix-heading">
                  <h2 id="u12-assignment-heading">Trainingsinhalte zuordnen</h2>
                  <small id="u12-assignment-summary" role="status">Nur anwesende Athleten</small>
                </div>
                <button type="button" class="button button--secondary u12-matrix-dialog__close" id="u12-assignment-close" aria-label="Zuordnung schließen">✕</button>
              </header>
              <p class="u12-matrix-help" id="u12-assignment-help">Häkchen pro Kind setzen oder oben „Alle“ wählen.</p>
              <div class="u12-matrix-legend" id="u12-assignment-legend"></div>
              <div class="u12-matrix-scroll" role="region" aria-label="Trainingsinhalte-Matrix" tabindex="0">
                <table class="u12-matrix-table" id="u12-assignment-matrix"></table>
              </div>
              <footer class="u12-matrix-dialog__footer">
                <button type="button" class="button button--primary" id="u12-assignment-done">Fertig</button>
              </footer>
            </dialog>
            <dialog class="u12-statistics-dialog" id="u12-statistics-dialog" aria-labelledby="u12-statistics-title">
              <header class="u12-statistics-header">
                <div>
                  <small>U12 · Anwesenheit</small>
                  <h2 id="u12-statistics-title">Statistik</h2>
                </div>
                <button type="button" class="button button--secondary u12-statistics-close" id="u12-statistics-close" aria-label="Statistik schließen">✕</button>
              </header>
              <form class="u12-statistics-filter" id="u12-statistics-filter">
                <label for="u12-statistics-from">Von
                  <input id="u12-statistics-from" type="date" required />
                </label>
                <label for="u12-statistics-to">Bis
                  <input id="u12-statistics-to" type="date" required />
                </label>
                <button type="submit" class="button button--primary" aria-label="Zeitraum auswerten" title="Zeitraum auswerten">↻</button>
                <button type="button" class="button button--secondary" id="u12-statistics-export" disabled title="Alle fünf Statistikbereiche als CSV exportieren">CSV</button>
              </form>
              <p class="message message--error" id="u12-statistics-error" role="alert" hidden></p>
              <p class="u12-statistics-state" id="u12-statistics-state" role="status"></p>
              <div class="u12-statistics-summary" id="u12-statistics-summary"></div>
              <p class="u12-statistics-completeness" id="u12-statistics-completeness" role="status"></p>
              <div class="u12-statistics-tabs" aria-label="Statistiken auswählen">
                <button type="button" data-u12-stats-tab="trainings" aria-pressed="true">Trainings</button>
                <button type="button" data-u12-stats-tab="athletes" aria-pressed="false">Athleten</button>
                <button type="button" data-u12-stats-tab="categories" aria-pressed="false">Kategorien</button>
                <button type="button" data-u12-stats-tab="trainers" aria-pressed="false">Trainer</button>
              </div>
              <div class="u12-statistics-results">
                <section data-u12-stats-panel="trainings" aria-label="Anwesende pro Training">
                  <h3>Monatsübersicht</h3>
                  <div id="u12-statistics-months" class="u12-statistics-list"></div>
                  <h3 class="u12-statistics-subheading">Einzelne Trainings</h3>
                  <div id="u12-statistics-trainings" class="u12-statistics-list"></div>
                </section>
                <section data-u12-stats-panel="athletes" aria-label="Anwesenheit pro Athlet" hidden>
                  <h3>Anwesenheit pro Athlet <small>anwesend / erfasst · Quote</small></h3>
                  <div id="u12-statistics-athletes" class="u12-statistics-list"></div>
                </section>
                <section data-u12-stats-panel="categories" aria-label="Trainingskategorien" hidden>
                  <h3>Trainingskategorien</h3>
                  <div id="u12-statistics-categories" class="u12-statistics-list"></div>
                </section>
                <section data-u12-stats-panel="trainers" aria-label="Trainer-Einsätze" hidden>
                  <h3>Trainer-Einsätze <small>absteigend</small></h3>
                  <div id="u12-statistics-trainers" class="u12-statistics-list"></div>
                </section>
              </div>
            </dialog>
            <dialog class="u12-details-dialog" id="u12-details-dialog" aria-labelledby="u12-details-title">
              <header class="u12-details-header">
                <h2 id="u12-details-title">Athletenhinweise</h2>
                <button class="button button--secondary" id="u12-details-close" type="button" aria-label="Hinweise schließen">✕</button>
              </header>
              <div id="u12-details-content"></div>
            </dialog>
          </section>
`;

export const ULC_U12_CSS = `
/* Compact U12: single configured group, date picker, context action. */
.u12-head { display:flex; justify-content:space-between; align-items:center; gap:var(--ab-space-2); margin:0 0 var(--ab-space-2); min-width:0; }
.u12-head__title { min-width:0; }
.u12-head h1 { margin:0; line-height:1.2; font-size:var(--ab-page-title-size); font-weight:800; letter-spacing:-.025em; }
.u12-head small { display:block; color:var(--secondary); margin-top:2px; overflow-wrap:anywhere; font-size:.75rem; }
.u12-athlete-new { flex:0 0 44px; align-self:center; width:44px; min-height:var(--ab-touch-target); border-radius:9px; font-size:1.35rem; padding:0; font-weight:800; }
.u12-attendance-toolbar { display:flex; gap:8px; align-items:center; justify-content:space-between; padding:3px 1px 0; min-width:0; }
.u12-attendance-toolbar > strong { font-size:1rem; font-weight:800; letter-spacing:-.015em; }
.u12-attendance-toolbar__actions { display:flex; align-items:center; gap:5px; }
.u12-statistics-open { min-height:42px; padding:0 10px; font-size:.82rem; }
.u12-content-shell { position:relative; min-width:0; }
.u12-category-shortcut { position:absolute; top:3px; right:38px; width:44px; min-width:44px; height:44px; padding:0; border:1px solid var(--border); border-radius:9px; background:var(--card); color:var(--text); font-size:1.1rem; cursor:pointer; z-index:1; }
.u12-category-shortcut[hidden] { display:none !important; }
.u12-category-shortcut:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
.u12-date-toolbar { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:5px; padding:6px var(--ab-space-2); border-radius:var(--ab-radius-card); background:var(--card); border:1px solid var(--border); min-width:0; box-shadow:0 2px 8px rgba(15,23,42,.035); }
.u12-date-nav { display:grid; grid-template-columns:36px minmax(0,1fr) 36px; align-items:center; gap:3px; min-width:0; }
.u12-date-arrow { min-width:36px; height:42px; border:0; border-radius:9px; background:var(--muted); color:var(--text); font-size:1.2rem; font-weight:800; cursor:pointer; }
.u12-date-field { display:grid; gap:0; min-width:0; text-align:center; }
.u12-date-field span { font-size:.62rem; font-weight:750; color:var(--secondary); letter-spacing:.03em; }
.u12-date-field input, .u12-date-field select { display:block; box-sizing:border-box; width:100%; min-width:0; min-height:38px; padding:0 1px; text-align:center; font-size:.8rem; font-weight:780; background:transparent; border:0; color:var(--text); }
.u12-date-shortcuts { display:flex; justify-content:center; gap:2px; align-items:center; }
.u12-date-shortcuts button { min-height:var(--ab-touch-target); border:0; background:transparent; color:var(--accent); padding:3px 5px; font-size:.73rem; font-weight:750; border-radius:8px; cursor:pointer; }
.u12-date-shortcuts button[aria-pressed="true"] { background:var(--muted); color:var(--secondary); }
.u12-week, .u12-days { display:grid; gap:8px; min-width:0; max-width:100%; }
.u12-info { width:44px; min-width:44px; height:44px; padding:0; border:1px solid var(--border); border-radius:9px; background:var(--card); color:var(--secondary); font-size:1.1rem; font-weight:750; cursor:pointer; }
.u12-info--emergency { color:var(--accent); border-color:var(--accent); }
.u12-info:focus-visible, .u12-contact-call:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
.u12-person__toggle { display: flex; gap: 10px; flex: 1 1 auto; align-items: center; min-width: 0; cursor: pointer; }
.u12-details-dialog { box-sizing:border-box; width: min(96vw, 480px); max-height: min(85dvh, 690px); border-radius: 16px; border: 1px solid var(--border); padding: 18px; color: inherit; background: var(--surface, #fff); overflow-y: auto; }
.u12-details-dialog::backdrop { background: rgba(0, 0, 0, .6); }
.u12-details-header { display: flex; gap: 10px; align-items: center; justify-content: space-between; }
.u12-details-header h2 { margin: 0; font-size: 1.2rem; }
.u12-details-section { margin-top: 16px; display: grid; gap: 8px; }
.u12-details-section h3 { font-size: .94rem; margin: 0; }
.u12-contact-entry { padding: 10px 0; border-top: 1px solid var(--border); display: grid; gap: 3px; }
.u12-contact-entry small { color: var(--secondary); }
.u12-contact-group { display:grid; gap:4px; min-width:0; }
.u12-contact-group h4 { font-size:.87rem; margin:12px 0 0; }
.u12-contact-entry span { overflow-wrap:anywhere; }
.u12-contact-call { display:inline-flex; align-items:center; justify-content:center; min-height:44px; min-width:105px; width:max-content; max-width:100%; box-sizing:border-box; padding:8px 13px; border-radius:9px; background:var(--accent); color:var(--on-accent,#fff); text-decoration:none; font-size:.85rem; font-weight:750; }
.u12-contact-call:hover { text-decoration:underline; }
.u12-contact-call[hidden] { display:none; }
.u12-details-section p { overflow-wrap: anywhere; white-space: pre-wrap; }
 .u12-roster { isolation: isolate; }
.u12-content-card { border:1px solid var(--border); border-radius:12px; background:var(--card); padding:0; min-width:0; box-shadow:0 2px 8px rgba(15,23,42,.035); }
.u12-content-summary { display:flex; justify-content:flex-start; align-items:center; gap:8px; cursor:pointer; padding:6px 10px; padding-right:90px; font-size:.9rem; font-weight:800; min-height:44px; }
.u12-content-summary::marker { content:""; }
.u12-content-summary small { font-size:.75rem; color:var(--secondary); margin-left:7px; }
.u12-content-body { display:grid; gap:7px; padding:0 8px 9px; }
.u12-content-body p { margin:0; font-size:.79rem; line-height:1.4; color:var(--secondary); }
.u12-content-rows { display:grid; gap:7px; min-width:0; }
.u12-content-row { display:grid; gap:5px; min-width:0; padding:6px 8px 8px; border:1px solid var(--border); border-left:3px solid var(--accent); border-radius:9px; background:color-mix(in srgb, var(--accent) 3%, var(--card)); }
.u12-content-row:nth-child(even) { background:var(--muted); border-left-color:var(--accent); }
.u12-content-row__header { display:flex; justify-content:space-between; align-items:center; gap:6px; padding-bottom:3px; min-height:36px; }
.u12-content-row__number { display:inline-flex; align-items:center; min-height:25px; padding:2px 8px; border-radius:7px; background:color-mix(in srgb, var(--accent) 10%, var(--card)); font-size:.75rem; font-weight:800; color:var(--text); }
.u12-content-fields { display:grid; gap:5px; min-width:0; }
.u12-content-fields input, .u12-content-fields select { box-sizing:border-box; min-width:0; width:100%; min-height:40px; border:1px solid var(--border-strong); border-radius:8px; padding:5px 8px; background:var(--card); color:var(--text); font-size:.83rem; }
.u12-content-fields .u12-content-detail { font-size:.84rem; }
.u12-content-legacy { display:block; color:var(--secondary); font-size:.75rem; overflow-wrap:anywhere; line-height:1.35; }
.u12-content-remove { flex:0 0 38px; width:38px; min-height:38px; border:1px solid var(--border); background:var(--card); color:var(--secondary); border-radius:8px; font-size:1rem; cursor:pointer; }
.u12-content-remove:focus-visible, .u12-content-fields select:focus-visible, .u12-content-fields input:focus-visible { outline:2px solid var(--accent, #147a46); outline-offset:2px; }
.u12-content-add { justify-self:start; min-height:42px; padding:0 11px; border:1px solid var(--border-strong); border-radius:9px; background:var(--card); color:var(--accent); font-weight:750; cursor:pointer; }
.u12-content-actions { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
.u12-content-assign { min-height:42px; font-size:.82rem; }
.u12-content-assign:disabled { opacity:.5; cursor:not-allowed; }
/* Compact header/controls follow the common 42px touch-target layout. */
.u12-statistics-dialog { box-sizing:border-box; width:min(96vw,640px); max-width:640px; max-height:calc(100dvh - 20px); padding:0; border:1px solid var(--border); border-radius:14px; color:var(--text); background:var(--card); overflow-y:auto; overscroll-behavior:contain; }
.u12-statistics-dialog::backdrop { background:rgba(0,0,0,.55); }
.u12-statistics-header { position:sticky; top:0; z-index:3; display:flex; align-items:center; justify-content:space-between; padding:8px 10px; border-bottom:1px solid var(--border); background:var(--card); }
.u12-statistics-header h2 { margin:0; font-size:1.1rem; line-height:1.3; }
.u12-statistics-header small { font-size:.74rem; color:var(--secondary); }
.u12-statistics-close { min-width:42px; min-height:42px; padding:0; }
.u12-statistics-filter { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)) 42px; gap:6px; align-items:end; margin:0; padding:8px 10px; }
.u12-statistics-filter label { display:grid; gap:3px; min-width:0; font-size:.73rem; font-weight:700; color:var(--secondary); }
.u12-statistics-filter input { box-sizing:border-box; display:block; width:100%; min-width:0; min-height:42px; padding:5px 4px; border:1px solid var(--border); border-radius:8px; background:var(--card); color:var(--text); font-size:.8rem; }
.u12-statistics-filter button { min-height:42px; padding:0; font-size:1.15rem; }
.u12-statistics-state { margin:0 10px 5px; font-size:.75rem; color:var(--secondary); }
.u12-statistics-dialog .message { margin:5px 10px; }
.u12-statistics-summary { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; margin:4px 10px 8px; }
.u12-statistics-kpi { display:grid; gap:3px; padding:9px 5px; border:1px solid var(--border); border-radius:9px; text-align:center; background:var(--muted); min-width:0; }
.u12-statistics-kpi strong { font-size:1.15rem; line-height:1.2; }
.u12-statistics-kpi small { font-size:.68rem; color:var(--secondary); overflow-wrap:anywhere; }
.u12-statistics-completeness { margin:0 10px 9px; font-size:.78rem; color:var(--secondary); line-height:1.45; overflow-wrap:anywhere; }
.u12-statistics-tabs { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:4px; padding:0 10px 8px; }
@media(min-width:560px) { .u12-statistics-tabs { grid-template-columns:repeat(4,minmax(0,1fr)); } }
.u12-statistics-tabs button { min-width:0; min-height:var(--ab-touch-target); padding:5px 3px; border:1px solid var(--border); border-radius:8px; background:var(--card); color:var(--text); font:inherit; font-size:.8rem; font-weight:650; cursor:pointer; }
.u12-statistics-tabs button[aria-pressed="true"] { border-color:var(--accent); background:var(--muted); }
.u12-statistics-results { padding:0 10px 12px; }
.u12-statistics-results section[hidden] { display:none !important; }
.u12-statistics-results h3 { display:flex; gap:6px; align-items:baseline; margin:3px 0 8px; font-size:.95rem; }
.u12-statistics-results h3.u12-statistics-subheading { margin-top:16px; }
.u12-statistics-results h3 small { font-size:.7rem; color:var(--secondary); }
.u12-statistics-list { display:grid; gap:5px; min-width:0; }
.u12-statistics-line { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:8px; align-items:center; padding:8px 10px; border:1px solid var(--border); border-radius:9px; font-size:.82rem; }
.u12-statistics-line span { min-width:0; overflow-wrap:anywhere; }
.u12-statistics-line > strong { white-space:nowrap; font-size:.88rem; }
.u12-statistics-line small { font-size:.71rem; color:var(--secondary); }
.u12-statistics-athlete { border:1px solid var(--border); border-radius:9px; }
.u12-statistics-athlete summary { display:flex; gap:8px; align-items:center; justify-content:space-between; min-height:42px; padding:6px 10px; cursor:pointer; font-size:.83rem; }
.u12-statistics-athlete summary strong { margin-left:auto; white-space:nowrap; }
.u12-statistics-athlete__detail { padding:3px 10px 9px; border-top:1px solid var(--border); display:grid; gap:5px; font-size:.75rem; }
.u12-statistics-athlete__detail > div { display:flex; justify-content:space-between; gap:6px; }
@media(max-width:370px) { .u12-statistics-filter input { font-size:.76rem; } .u12-statistics-tabs button { font-size:.75rem; } }
.u12-person { display:grid !important; grid-template-columns:minmax(0,1fr) 44px; column-gap:8px; }
.u12-person__toggle { grid-column:1; }
.u12-person:not(:has(.u12-info)) > .u12-person__toggle { grid-column:1 / -1; }
.u12-person__contents { grid-column:1 / -1; min-width:0; display:flex; align-items:center; flex-wrap:wrap; gap:3px 4px; padding:1px 2px 3px; font-size:.7rem; color:var(--secondary); }
.u12-person__contents[hidden] { display:none !important; }
.u12-person__contents-label { flex:0 0 auto; font-weight:700; }
.u12-person__content-chip { display:inline-flex; max-width:100%; padding:2px 6px; border-radius:6px; background:var(--muted); color:var(--text); overflow-wrap:anywhere; }
.u12-person__content-empty { font-style:italic; }

/* Mobile matrix: fixed athlete names and horizontal scrolling across up to five slots. */
.u12-matrix-dialog { box-sizing:border-box; width:min(96vw,580px); max-width:580px; max-height:calc(100dvh - 24px); padding:0; overflow-y:auto; overscroll-behavior:contain; }
.u12-matrix-dialog__header { position:sticky; top:0; z-index:3; padding:12px; background:var(--surface, #fff); border-bottom:1px solid var(--border); }
.u12-matrix-dialog__close { flex:0 0 42px; width:42px; min-height:42px; padding:0; }
.u12-matrix-dialog__footer { display:flex; flex-wrap:wrap; gap:10px; align-items:center; justify-content:flex-end; padding:12px; border-top:1px solid var(--border); }
.u12-matrix-dialog__footer small { font-size:.75rem; color:var(--secondary); max-width:290px; }
.u12-matrix-dialog__footer button { min-height:44px; }
.u12-matrix-dialog .u12-matrix-scroll { padding-bottom:10px; }
.u12-matrix-heading { display:grid; gap:2px; min-width:0; flex:1 1 auto; }
.u12-matrix-heading h2 { font-size:.94rem; margin:0; }
.u12-matrix-heading small { font-size:.72rem; color:var(--secondary); text-align:right; }
.u12-matrix-help { margin:10px 12px; font-size:.76rem; color:var(--secondary); line-height:1.4; }
.u12-matrix-legend { display:flex; flex-wrap:wrap; gap:5px 10px; margin:0 12px 10px; }
.u12-matrix-legend span { font-size:.73rem; color:var(--text); overflow-wrap:anywhere; }
.u12-matrix-legend strong { color:var(--accent); }
.u12-matrix-scroll { max-width:100%; overflow-x:auto; overscroll-behavior-x:contain; }
.u12-matrix-scroll:focus-visible { outline:2px solid var(--accent); outline-offset:-2px; }
.u12-matrix-table { border-spacing:0; border-collapse:separate; width:max-content; min-width:100%; table-layout:fixed; font-size:.8rem; }
.u12-matrix-table th, .u12-matrix-table td { border-bottom:1px solid var(--border); padding:4px; text-align:center; vertical-align:middle; }
.u12-matrix-table th:first-child, .u12-matrix-table td:first-child {
  position:sticky; left:0; z-index:1; width:130px; min-width:130px; max-width:160px;
  text-align:left; background:var(--card); overflow-wrap:anywhere; padding:8px 10px;
}
.u12-matrix-table thead th { background:var(--muted); vertical-align:top; font-weight:750; }
.u12-matrix-table thead th:first-child { z-index:2; background:var(--muted); }
.u12-matrix-table th:not(:first-child), .u12-matrix-table td:not(:first-child) { width:72px; min-width:72px; max-width:72px; }
.u12-matrix-col { display:grid; gap:5px; justify-items:center; }
.u12-matrix-col__name { width:100%; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; font-size:.75rem; }
.u12-matrix-col__all { display:grid; gap:2px; justify-items:center; cursor:pointer; font-size:.7rem; }
.u12-matrix-col__all input, .u12-matrix-check {
  width:24px; height:24px; margin:0; accent-color:var(--accent); cursor:pointer;
}
.u12-matrix-table td label { display:flex; min-height:44px; align-items:center; justify-content:center; cursor:pointer; }
.u12-matrix-table input:disabled { cursor:not-allowed; opacity:.5; }
.u12-matrix-empty { padding:12px 8px; color:var(--secondary); font-size:.8rem; }

.u12-trainers-card { margin-top:6px; border:1px solid var(--border); border-radius:10px; background:var(--card); overflow:hidden; }
.u12-trainers-summary { min-height:44px; padding:0 10px; display:flex; justify-content:flex-start; align-items:center; gap:8px; cursor:pointer; font-size:.86rem; font-weight:750; }
.u12-trainers-summary::marker { content:""; }
.u12-trainers-summary::-webkit-details-marker { display:none; }
.u12-trainers-summary-status { display:inline-flex; align-items:center; gap:8px; margin-left:auto; white-space:nowrap; }
.u12-trainers-summary small { font-size:.76rem; font-weight:600; color:var(--secondary); }
.u12-trainers-list { padding:0 8px 8px; display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,140px),1fr)); gap:5px; }
.u12-trainers-list > small { grid-column:1/-1; padding:5px 2px; font-size:.78rem; }
.u12-trainer-row { box-sizing:border-box; min-height:40px; min-width:0; display:flex; align-items:center; gap:7px; padding:3px 8px; border:1px solid var(--border); border-radius:8px; background:var(--card); cursor:pointer; }
.u12-trainer-row:has(input:checked) { border-color:var(--accent); background:color-mix(in srgb, var(--accent) 7%, var(--card)); }
.u12-trainer-name { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:.81rem; }
.u12-trainer-row input { width:20px; height:20px; margin:0; flex:none; accent-color:var(--accent); }
.u12-trainer-row:focus-within { outline:2px solid var(--accent); outline-offset:1px; }
/* Visible only for an attended session with unfinished training documentation. */
.u12-content-card.u12-reminder-pending,
.u12-trainers-card.u12-reminder-pending { border-color:var(--ab-state-warning-border); background:color-mix(in srgb, var(--ab-state-warning-tint) 23%, var(--card)); box-shadow:inset 3px 0 0 var(--ab-state-warning-edge); }
.u12-reminder-pending > summary small { color:var(--text); }
.u12-notes-card { margin-top:8px; background:var(--card); border:1px solid var(--border); border-radius:11px; overflow:hidden; }
.u12-notes-card summary { padding:11px 12px; font-weight:750; cursor:pointer; }
.u12-notes-card summary small { font-weight:400; color:var(--secondary); margin-left:6px; }
.u12-notes-body { padding:0 11px 11px; display:grid; gap:5px; }
.u12-notes-body label { font-size:.78rem; color:var(--secondary); }
.u12-notes-body textarea { display:block; width:100%; max-width:100%; box-sizing:border-box; min-height:86px; resize:vertical; border-radius:8px; border:1px solid var(--border); padding:9px; font:inherit; background:var(--card); color:var(--text); }
.u12-savebar { position:sticky; top:56px; z-index:8; display:flex; gap:var(--ab-space-2); align-items:center; justify-content:space-between; padding:7px 9px; border-radius:var(--ab-radius-card); box-shadow:0 5px 18px rgba(15,23,42,.09); }
.u12-savebar > div { display:grid; gap:1px; min-width:0; }
.u12-savebar strong { font-size:.82rem; }
.u12-savebar small { font-size:.68rem; color:var(--secondary); line-height:1.2; }
.u12-savebar button { min-height:42px; flex:0 0 auto; padding:0 12px; font-size:.78rem; border-radius:9px; }
.u12-roster { min-width:0; padding:6px 8px 5px; border-radius:12px; box-shadow:0 2px 8px rgba(15,23,42,.035); }
.u12-roster-hint { display:block; padding:2px 4px 6px; font-size:.7rem; color:var(--secondary); }
.u12-person { display:grid; align-items:center; grid-template-columns:minmax(0,1fr) 40px; gap:2px 6px; min-height:50px; padding:7px 4px; border-bottom:1px solid var(--border); cursor:default; }
.u12-person:last-child { border-bottom: 0; }
.u12-person__name { min-width:0; font-size:.84rem; font-weight:750; overflow-wrap:anywhere; }
.u12-person__answer { position:relative; display:inline-flex; flex:0 0 auto; align-items:center; justify-content:center; gap:7px; min-width:90px; min-height:44px; box-sizing:border-box; border:1px solid var(--border-strong); border-radius:999px; padding:0 12px; background:var(--muted); color:var(--text); font-weight:750; cursor:pointer; transition:background .15s ease, border-color .15s ease; }
.u12-person__answer::before { content:"–"; display:grid; place-items:center; width:20px; height:20px; border-radius:50%; background:var(--card); color:var(--secondary); font-size:.85rem; }
.u12-person__answer input { position:absolute; inset:0; width:100%; height:100%; margin:0; opacity:0; cursor:pointer; }
.u12-person__answer span { font-size:.8rem; min-width:26px; text-align:left; }
.u12-person__answer:has(input:checked) { background:var(--ab-brand-soft); border-color:var(--accent); color:var(--accent); }
.u12-person__answer:has(input:checked)::before { content:"✓"; background:var(--accent); color:var(--ab-brand-contrast); }
.u12-person__answer[data-attendance-status="open"] { background:var(--card); border-style:dashed; color:var(--secondary); }
.u12-person__answer[data-attendance-status="open"]::before { content:"?"; }
.u12-person__answer[data-attendance-status="excused"] { background:var(--muted); color:var(--secondary); }
.u12-person__answer[data-attendance-status="excused"]::before { content:"E"; }
.u12-person__answer:has(input:focus-visible) { outline:3px solid var(--accent); outline-offset:2px; }
.u12-person:focus-within { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 7px; }
@media (max-width: 370px) {
  .u12-date-nav { gap: 5px; }
  .u12-savebar { padding: 10px; }
  .u12-savebar button { padding: 9px 10px; font-size: .8rem; }
}
`;

export const ULC_U12_SCRIPT = `
/* A03 U12: exactly one training date and a binary trainer roll call.
   Data, training-group access and CAS revisions remain server-authoritative. */
const u12Ui = {
  group: document.querySelector("#u12-group"),
  groupLabel: document.querySelector("#u12-group-label"),
  date: document.querySelector("#u12-date"),
  calendarHint: document.querySelector("#u12-calendar-hint"),
  prev: document.querySelector("#u12-prev"),
  next: document.querySelector("#u12-next"),
  reload: document.querySelector("#u12-reload"),
  today: document.querySelector("#u12-today"),
  addAthlete: document.querySelector("#u12-add-athlete"),
  statsOpen: document.querySelector("#u12-statistics-open"),
  statsDialog: document.querySelector("#u12-statistics-dialog"),
  statsClose: document.querySelector("#u12-statistics-close"),
  statsFilter: document.querySelector("#u12-statistics-filter"),
  statsExport: document.querySelector("#u12-statistics-export"),
  statsFrom: document.querySelector("#u12-statistics-from"),
  statsTo: document.querySelector("#u12-statistics-to"),
  statsError: document.querySelector("#u12-statistics-error"),
  statsState: document.querySelector("#u12-statistics-state"),
  statsSummary: document.querySelector("#u12-statistics-summary"),
  statsCompleteness: document.querySelector("#u12-statistics-completeness"),
  statsMonths: document.querySelector("#u12-statistics-months"),
  statsTrainings: document.querySelector("#u12-statistics-trainings"),
  statsAthletes: document.querySelector("#u12-statistics-athletes"),
  statsCategories: document.querySelector("#u12-statistics-categories"),
  statsTrainers: document.querySelector("#u12-statistics-trainers"),
  note: document.querySelector("#u12-note"),
  notesCard: document.querySelector("#u12-notes-card"),
  trainersCard: document.querySelector("#u12-trainers-card"),
  trainerRows: document.querySelector("#u12-trainers-rows"),
  trainerCount: document.querySelector("#u12-trainers-count"),
  contentCard: document.querySelector("#u12-content-card"),
  contentCount: document.querySelector("#u12-content-count"),
  contentRows: document.querySelector("#u12-content-rows"),
  contentAdd: document.querySelector("#u12-content-add"),
  contentAssign: document.querySelector("#u12-content-assign"),
  matrixSection: document.querySelector("#u12-assignment-section"),
  assignmentClose: document.querySelector("#u12-assignment-close"),
  assignmentDone: document.querySelector("#u12-assignment-done"),
  matrix: document.querySelector("#u12-assignment-matrix"),
  matrixLegend: document.querySelector("#u12-assignment-legend"),
  matrixSummary: document.querySelector("#u12-assignment-summary"),
  detailsDialog: document.querySelector("#u12-details-dialog"),
  detailsTitle: document.querySelector("#u12-details-title"),
  detailsContent: document.querySelector("#u12-details-content"),
  detailsClose: document.querySelector("#u12-details-close"),
  week: document.querySelector("#u12-week"),
  days: document.querySelector("#u12-days"),
  count: document.querySelector("#u12-count"),
  saveState: document.querySelector("#u12-save-state"),
  save: document.querySelector("#u12-save"),
  message: document.querySelector("#u12-message"),
  success: document.querySelector("#u12-success"),
};
const u12FollowGroupCalendar = false; // Kids enables this in the generated youth adapter.
const U12_SERVER_STATUSES = Object.freeze(["open", "present", "excused", "absent"]);
const U12_ATTENDANCE_STATUS_TEXT = Object.freeze({
  open: { short: "Offen", long: "Offen – noch nicht erfasst" },
  present: { short: "Ja", long: "Anwesend" },
  absent: { short: "Nein", long: "Abwesend" },
  excused: { short: "Entsch.", long: "Entschuldigt" },
});

// Display only: saved open/excused states remain untouched unless the trainer
// explicitly operates the existing binary Ja/Nein checkbox.
function u12DisplayedAttendanceStatus(person, checked, touched) {
  return touched ? (checked ? "present" : "absent") : person.status;
}
function updateU12AttendanceStatus(mark, person) {
  const athleteId = person.athleteId;
  const status = u12DisplayedAttendanceStatus(
    person, u12Present.get(athleteId) === true, u12TouchedAthletes.has(athleteId),
  );
  const copy = U12_ATTENDANCE_STATUS_TEXT[status];
  if (!copy) return; // Incoming snapshots are validated separately.
  mark.textContent = copy.short;
  const pill = mark.closest(".u12-person__answer");
  if (!pill) return;
  pill.dataset.attendanceStatus = status;
  pill.title = copy.long;
  const checkbox = pill.querySelector("input[type=checkbox]");
  checkbox?.setAttribute("aria-label",
    "Anwesenheit " + person.firstName + " " + person.lastName + ": " + copy.long);
}
let U12_STANDARD_CONTENT_CATALOG = [];

function updateU12CategoryCatalog(categories) {
  U12_STANDARD_CONTENT_CATALOG = categories.filter((category) => category.isActive)
    .map((category) => ({ code: category.code, label: category.label }));
  if (u12Snapshot && !u12Loading && !u12Saving) {
    renderU12ContentRows();
    refreshU12Controls();
  }
}

let u12Ready = false;
let u12WriteAllowed = true;
let u12Groups = [];
let u12LoadedGroupId = "";
let u12LoadedDate = "";
let u12Snapshot = null;
let u12Present = new Map();
let u12TouchedAthletes = new Set();
let u12TrainerPresent = new Set();
let u12ContentTitles = [];
let u12ContentItems = [];
let u12ContentAssignments = new Map();
let u12DirtyDates = new Set();
let u12Loading = false;
let u12Saving = false;
let u12Conflict = false;
let u12Note = "";
let u12EditVersion = 0;
let u12AutoSaveTimer = null;
let u12AutoSaveFailed = false;
let u12SaveInFlight = null;
let u12StatisticsLoadId = 0;
let u12StatisticsExport = null;
let u12LoadId = 0;
let u12CalendarBusy = false;
let u12CalendarWeekCache = new Map();
let u12CalendarEnabled = false;
let u12CalendarRuleWeekdays = null;

function resetU12SessionState() {
  u12StatisticsExport = null;
  if (u12Ui.statsExport) u12Ui.statsExport.disabled = true;
  if (u12AutoSaveTimer !== null) clearTimeout(u12AutoSaveTimer);
  u12AutoSaveTimer = null;
  u12EditVersion = 0;
  u12Note = "";
  u12AutoSaveFailed = false;
  u12SaveInFlight = null;
  if (u12Ui.note) u12Ui.note.value = "";
  if (u12Ui.notesCard) u12Ui.notesCard.open = false;
  u12LoadId += 1;
  u12Ready = false;
  u12WriteAllowed = true;
  u12CalendarBusy = false;
  u12CalendarWeekCache = new Map();
  u12CalendarEnabled = false;
  u12CalendarRuleWeekdays = null;
  u12Groups = [];
  u12LoadedGroupId = "";
  u12LoadedDate = "";
  u12Snapshot = null;
  u12Present = new Map();
  u12TouchedAthletes = new Set();
  u12TrainerPresent = new Set();
  u12ContentTitles = [];
  u12ContentItems = [];
  u12ContentAssignments = new Map();
  u12Ui.contentRows?.replaceChildren();
  if (u12Ui.matrixSection?.open) u12Ui.matrixSection.close();
  if (u12Ui.contentCard) u12Ui.contentCard.open = false;
  u12DirtyDates = new Set();
  u12Loading = false;
  u12Saving = false;
  u12Conflict = false;
  if (u12Ui.group) {
    u12Ui.group.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Gruppe wählen";
    u12Ui.group.append(placeholder);
  }
  if (u12Ui.date) {
    const today = localIsoDate(new Date());
    if (u12FollowGroupCalendar) {
      u12Ui.date.replaceChildren();
      const option = document.createElement("option");
      option.value = today;
      option.textContent = "Trainingstage laden …";
      u12Ui.date.append(option);
    } else {
      u12Ui.date.value = today;
    }
  }
  if (u12Ui.detailsDialog?.open) u12Ui.detailsDialog.close();
  u12Ui.detailsContent?.replaceChildren();
  showMessage(u12Ui.message, "");
  showMessage(u12Ui.success, "");
  renderU12Attendance();
}

function u12ValidGroup(group) {
  return !!group && typeof group === "object" &&
    typeof group.id === "string" && group.id.length > 0 &&
    typeof group.name === "string" && group.name.length > 0 &&
    (group.shortName === null || typeof group.shortName === "string");
}

function u12ValidSnapshot(snapshot, date, groupId) {
  if (!snapshot || typeof snapshot !== "object" ||
      snapshot.sessionDate !== date || !u12ValidGroup(snapshot.group) ||
      snapshot.group.id !== groupId || !Array.isArray(snapshot.participants) ||
      !Array.isArray(snapshot.contentTitles) || snapshot.contentTitles.length > 5 ||
      !snapshot.contentTitles.every((title) =>
        typeof title === "string" && title.length > 0 &&
        title.length <= 120 && title.trim() === title) ||
      !Array.isArray(snapshot.contentItems) ||
      snapshot.contentItems.length !== snapshot.contentTitles.length ||
      !snapshot.contentItems.every((meta, i) =>
        meta && typeof meta === "object" &&
        typeof meta.code === "string" && typeof meta.detail === "string" &&
        meta.detail.length <= 200 && meta.detail.trim() === meta.detail &&
        (meta.code === "" || /^[a-z][a-z0-9_]{0,79}$/.test(meta.code)))) return false;
  if (snapshot.trainers !== undefined && (!Array.isArray(snapshot.trainers) ||
      snapshot.trainers.length > 100 ||
      new Set(snapshot.trainers.map((trainer) => trainer?.trainerId)).size !== snapshot.trainers.length ||
      !snapshot.trainers.every((trainer) => trainer &&
        typeof trainer.trainerId === "string" && trainer.trainerId.length > 0 &&
        typeof trainer.firstName === "string" && typeof trainer.lastName === "string" &&
        typeof trainer.present === "boolean"))) return false;
  if (snapshot.session !== null && (
      typeof snapshot.session !== "object" ||
      typeof snapshot.session.revision !== "string" ||
      !["scheduled", "cancelled"].includes(snapshot.session.state) ||
      (snapshot.session.note !== null && (typeof snapshot.session.note !== "string" || snapshot.session.note.length > 3000)))) return false;
  const ids = new Set();
  for (const person of snapshot.participants) {
    if (!person || typeof person.athleteId !== "string" || !person.athleteId ||
        typeof person.firstName !== "string" || typeof person.lastName !== "string" ||
        !U12_SERVER_STATUSES.includes(person.status) ||
        !Array.isArray(person.contentSlots) ||
        person.contentSlots.length > snapshot.contentTitles.length ||
        new Set(person.contentSlots).size !== person.contentSlots.length ||
        !person.contentSlots.every((slot) => Number.isInteger(slot) &&
          slot >= 1 && slot <= snapshot.contentTitles.length) ||
        (person.status !== "present" && person.contentSlots.length > 0) ||
        (person.notes !== null && typeof person.notes !== "string") ||
        !Array.isArray(person.contacts) ||
        !person.contacts.every((contact) =>
          contact && typeof contact.id === "string" &&
          typeof contact.contactName === "string" &&
          typeof contact.phone === "string" &&
          typeof contact.isEmergency === "boolean" &&
          (contact.priority === undefined ||
            (Number.isSafeInteger(contact.priority) && contact.priority >= 1 &&
             contact.priority <= 1000)) &&
          (contact.relationship === null || typeof contact.relationship === "string") &&
          (contact.notes === null || typeof contact.notes === "string")) ||
        ids.has(person.athleteId)) return false;
    ids.add(person.athleteId);
  }
  return true;
}

function u12GroupOptions() {
  if (!u12Ui.group) return;
  const selected = u12Ui.group.value;
  u12Ui.group.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Gruppe wählen";
  u12Ui.group.append(placeholder);
  for (const group of u12Groups) {
    const option = document.createElement("option");
    option.value = group.id;
    option.textContent = group.shortName
      ? group.name + " (" + group.shortName + ")" : group.name;
    u12Ui.group.append(option);
  }
  u12Ui.group.value = u12Groups.some((group) => group.id === selected)
    ? selected : u12Groups.length === 1 ? u12Groups[0].id : "";
  const active = u12Groups.find((group) => group.id === u12Ui.group.value);
  if (u12Ui.groupLabel) {
    u12Ui.groupLabel.textContent = active ? active.name :
      u12Groups.length === 0 ? "Keine U12-Gruppe freigeschaltet" :
      "Trainingsgruppe nicht zugeordnet";
    const heading = u12Ui.groupLabel.closest(".u12-head")?.querySelector("h1")
      ?.textContent?.split("·")[0]?.trim().toLocaleLowerCase("de-AT") || "";
    // Suppress the repeated page name; preserve genuine distinct group names.
    u12Ui.groupLabel.hidden = !active ||
      active.name.trim().toLocaleLowerCase("de-AT") === heading;
  }
}

async function bootstrapU12() {
  const generation = attendanceSessionGeneration;
  resetU12SessionState();
  try {
    const payload = await requestJson("/api/modules/u12");
    if (generation !== attendanceSessionGeneration) return;
    const groups = payload?.trainingGroups;
    if (payload?.module?.moduleId !== "u12" || payload?.access?.view !== true ||
        !Array.isArray(groups) || !groups.every(u12ValidGroup) ||
        new Set(groups.map((group) => group.id)).size !== groups.length) {
      throw new Error("U12_MODULE_INVALID");
    }
    u12Ready = true;
    u12Groups = groups;
    u12GroupOptions();
    refreshAppAvailability();
    if (groups.length === 0) {
      showMessage(u12Ui.message, "Es ist noch keine aktive U12-Gruppe zugeordnet.");
    } else if (u12Ui.group?.value) {
      await loadU12Attendance();
    }
  } catch (error) {
    if (generation !== attendanceSessionGeneration) return;
    u12Ready = false;
    u12Groups = [];
    showMessage(u12Ui.message,
      error?.status === 401 || error?.status === 403 ? "" :
      "U12 ist derzeit nicht verfügbar.");
  } finally {
    if (generation === attendanceSessionGeneration) refreshAppAvailability();
  }
}

// Older U12 sessions can still contain open/excused states. Displaying these
// as "Nein" must not claim that the binary answer has already been saved.
function u12HasUnconfirmedAnswers() {
  if (!u12Snapshot) return false;
  if (JSON.stringify(u12Snapshot.contentTitles) !==
      JSON.stringify(u12ContentTitles.map((title) => title.trim()))) return true;
  return u12Snapshot.participants.some((person) => {
    const present = u12Present.get(person.athleteId) === true;
    if (person.status !== (present ? "present" : "absent")) return true;
    const slots = present
      ? [...(u12ContentAssignments.get(person.athleteId) ?? new Set())].sort((a, b) => a - b)
      : [];
    return JSON.stringify(person.contentSlots) !== JSON.stringify(slots);
  });
}

function groupIdOrValidU12Group() {
  return u12Groups.some((group) => group.id === u12Ui.group?.value);
}

function u12MissingTrainingDetails() {
  // An untouched or empty session does not need documentation reminders.
  const hasPresentAthlete = !!u12Snapshot &&
    u12Snapshot.session?.state !== "cancelled" &&
    u12Snapshot.participants.some((person) => u12Present.get(person.athleteId) === true);
  return {
    content: hasPresentAthlete &&
      (u12ContentTitles.length === 0 || u12ContentTitles.some((title) => !title.trim())),
    trainers: hasPresentAthlete && u12TrainerPresent.size === 0,
  };
}

function refreshU12Controls() {
  const busy = u12Loading || u12Saving || u12CalendarBusy;
  for (const control of [u12Ui.group, u12Ui.date, u12Ui.prev, u12Ui.next, u12Ui.reload, u12Ui.today]) {
    if (control) control.disabled = busy || !u12Ready;
  }
  const cancelled = u12Snapshot?.session?.state === "cancelled";
  const editable = !!u12Snapshot && !u12Loading && !u12CalendarBusy && !cancelled &&
    u12WriteAllowed && !u12Conflict;
  if (u12Ui.note) u12Ui.note.disabled = !editable;
  for (const input of u12Ui.trainerRows?.querySelectorAll("[data-u12-trainer-id]") ?? []) {
    input.disabled = !editable;
  }
  const missing = u12MissingTrainingDetails();
  u12Ui.contentCard?.classList.toggle("u12-reminder-pending", missing.content);
  u12Ui.trainersCard?.classList.toggle("u12-reminder-pending", missing.trainers);
  if (u12Ui.trainerCount) {
    const totalTrainers = u12Snapshot?.trainers?.length ?? 0;
    u12Ui.trainerCount.textContent = u12TrainerPresent.size + "/" + totalTrainers +
      (missing.trainers ? " · offen" : "");
  }
  for (const input of u12Ui.days?.querySelectorAll("[data-u12-athlete-id]") ?? []) {
    input.disabled = !editable;
  }
  for (const input of u12Ui.contentRows?.querySelectorAll("input, select, button") ?? []) {
    input.disabled = !editable;
  }
  if (u12Ui.contentAdd) {
    u12Ui.contentAdd.disabled = !editable || u12ContentTitles.length >= 5 ||
      U12_STANDARD_CONTENT_CATALOG.length === 0;
    u12Ui.contentAdd.hidden = u12ContentTitles.length >= 5;
  }
  if (u12Ui.contentCount) {
    u12Ui.contentCount.textContent = u12ContentTitles.length + " / 5" +
      (missing.content ? " · offen" : "");
  }
  if (u12Ui.contentAssign) {
    u12Ui.contentAssign.disabled = !u12Snapshot || u12Loading || u12CalendarBusy || u12ContentTitles.length === 0;
  }
  if (u12Ui.statsOpen) u12Ui.statsOpen.disabled = !u12Ready || busy ||
    !u12Ui.group?.value || !u12Snapshot;
  refreshU12MatrixControls(editable);
  refreshU12AssignmentSummaries();
  if (u12Ui.addAthlete) {
    const canCreate = masterdataReady && masterdataCanEdit && u12Ready;
    u12Ui.addAthlete.hidden = !canCreate;
    u12Ui.addAthlete.disabled = busy || !groupIdOrValidU12Group();
  }
  if (u12FollowGroupCalendar) refreshU12CalendarHint();
  if (u12Ui.today) {
    if (u12FollowGroupCalendar) u12Ui.today.removeAttribute("aria-pressed");
    else u12Ui.today.setAttribute(
      "aria-pressed", String(u12Ui.date?.value === localIsoDate(new Date())),
    );
  }
  if (u12Ui.save) {
    u12Ui.save.hidden = !u12AutoSaveFailed || u12DirtyDates.size === 0;
    u12Ui.save.disabled = !editable || u12Saving || u12Conflict || u12IsOffline();
  }
  if (u12Ui.count) {
    const total = u12Snapshot?.participants.length ?? 0;
    const present = [...u12Present.values()].filter(Boolean).length;
    const open = (u12Snapshot?.participants ?? []).filter((person) =>
      u12DisplayedAttendanceStatus(person,
        u12Present.get(person.athleteId) === true,
        u12TouchedAthletes.has(person.athleteId)) === "open").length;
    u12Ui.count.textContent = present + " von " + total + " anwesend" +
      (open > 0 ? " · " + open + " offen" : "");
  }
  if (u12Ui.saveState) {
    u12Ui.saveState.textContent = u12Saving ? "Wird gespeichert …" :
      u12Conflict ? "Konflikt – Liste bitte neu laden" :
      !u12WriteAllowed ? "Keine Schreibberechtigung" :
      cancelled ? "Training wurde abgesagt" :
      u12Loading ? "Namensliste wird geladen …" :
      !u12Snapshot ? "Training auswählen" :
      u12AutoSaveFailed ? "Automatisches Speichern fehlgeschlagen – erneut versuchen" :
      u12DirtyDates.size > 0 && u12IsOffline()
        ? "Offline – ungespeicherte Änderungen nur in dieser Ansicht" :
      u12DirtyDates.size > 0 && u12ContentTitles.some((title) => !title.trim())
        ? "Kategorie auswählen · Speichern pausiert" :
      u12DirtyDates.size > 0 ? "Änderungen werden automatisch gespeichert …" :
      u12Snapshot.session === null ? "Noch kein Training erfasst" :
      u12HasUnconfirmedAnswers() ? "Nicht bearbeitete Einträge bleiben unverändert" :
      "Automatisch gespeichert";
  }
  const participantsById = new Map((u12Snapshot?.participants ?? [])
    .map((person) => [person.athleteId, person]));
  for (const mark of u12Ui.days?.querySelectorAll("[data-u12-answer-id]") ?? []) {
    const person = participantsById.get(mark.dataset.u12AnswerId);
    if (person) updateU12AttendanceStatus(mark, person);
  }
}


function u12IsOffline() {
  // Offline information is advisory: positive online status is not proof that
  // the server is reachable. Never replay an uncertain failed POST on reconnection.
  return typeof navigator !== "undefined" && navigator.onLine === false;
}
function scheduleU12AutoSave() {
  if (u12AutoSaveTimer !== null) clearTimeout(u12AutoSaveTimer);
  u12AutoSaveTimer = null;
  if (!u12DirtyDates.size || u12AutoSaveFailed || !u12Ready || u12Conflict ||
      !u12WriteAllowed || u12Loading || u12Saving || u12CalendarBusy || u12IsOffline() ||
      u12ContentTitles.some((title) => !title.trim())) return;
  u12AutoSaveTimer = setTimeout(() => {
    u12AutoSaveTimer = null;
    // Network/revision/write state can change during debounce. In particular,
    // a failed in-flight POST may commit before its response is lost. Never
    // replay a draft after its failure flag was raised.
    if (!u12DirtyDates.size || u12AutoSaveFailed || !u12Ready || u12Conflict ||
        !u12WriteAllowed || u12Loading || u12Saving || u12CalendarBusy || u12IsOffline() ||
        u12ContentTitles.some((title) => !title.trim())) return;
    void saveU12Attendance();
  }, 850);
}
function markU12DraftDirty() {
  u12DirtyDates.add(u12LoadedDate);
  u12EditVersion += 1;
  u12AutoSaveFailed = false;
  showMessage(u12Ui.success, "");
  scheduleU12AutoSave();
  refreshU12Controls();
}

function renderU12ContentRows() {
  if (!u12Ui.contentRows) return;
  u12Ui.contentRows.replaceChildren();
  if (u12Ui.contentCard) u12Ui.contentCard.hidden = !u12Snapshot;
  if (!u12Snapshot) return;
  if (u12ContentTitles.length === 0) {
    const empty = document.createElement("small");
    empty.textContent = U12_STANDARD_CONTENT_CATALOG.length
      ? "Noch keine Trainingsinhalte erfasst."
      : "Keine aktive U12-Kategorie verfügbar. Kategorien über ⚙ verwalten.";
    u12Ui.contentRows.append(empty);
  }
  for (const [index, title] of u12ContentTitles.entries()) {
    const meta = u12ContentItems[index] ?? { code: "", detail: "" };
    const row = document.createElement("section");
    row.className = "u12-content-row";
    row.setAttribute("aria-label", "Inhalt " + (index + 1));
    const header = document.createElement("div");
    header.className = "u12-content-row__header";
    const number = document.createElement("strong");
    number.className = "u12-content-row__number";
    number.textContent = "Inhalt " + (index + 1);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "u12-content-remove";
    remove.dataset.u12RemoveIndex = String(index);
    remove.textContent = "×";
    remove.setAttribute("aria-label", "Inhalt " + (index + 1) + " entfernen");
    header.append(number, remove);
    const fields = document.createElement("div");
    fields.className = "u12-content-fields";
    const category = document.createElement("select");
    category.dataset.u12CodeIndex = String(index);
    category.setAttribute("aria-label", "Kategorie für Inhalt " + (index + 1));
    for (const standard of U12_STANDARD_CONTENT_CATALOG) {
      const option = document.createElement("option");
      option.value = standard.code;
      option.textContent = standard.label;
      category.append(option);
    }
    // Historical free text, renamed and inactive categories stay visible and unchanged.
    // A category selection is an explicit conversion, never a silent rewrite.
    const current = U12_STANDARD_CONTENT_CATALOG.find((entry) => entry.code === meta.code);
    if (!meta.code && !title.trim()) {
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Kategorie auswählen";
      placeholder.disabled = true;
      placeholder.selected = true;
      category.prepend(placeholder);
      category.value = "";
    } else if (!meta.code || !current || current.label !== title) {
      const savedOption = document.createElement("option");
      savedOption.value = "__historical__";
      savedOption.textContent = !meta.code
        ? "Bisheriger Inhalt (Altbestand)" : title + " (im Training gespeichert)";
      savedOption.disabled = true;
      savedOption.selected = true;
      category.append(savedOption);
      category.value = "__historical__";
    } else {
      category.value = meta.code;
    }
    fields.append(category);
    if (!meta.code && title.trim()) {
      const legacy = document.createElement("small");
      legacy.className = "u12-content-legacy";
      legacy.textContent = "Bisher erfasst: " + title +
        " · Zur Umstellung eine Kategorie auswählen.";
      fields.append(legacy);
    }
    const detail = document.createElement("input");
    detail.type = "text";
    detail.maxLength = 200;
    detail.className = "u12-content-detail";
    detail.placeholder = "Zusatzinfo (optional), z. B. 4 × 30 m";
    detail.value = meta.detail;
    detail.dataset.u12DetailIndex = String(index);
    detail.setAttribute("aria-label", "Zusatzinfo für Inhalt " + (index + 1));
    fields.append(detail);
    row.append(header, fields);
    u12Ui.contentRows.append(row);
  }
}

function addU12Content() {
  if (!u12Snapshot || u12ContentTitles.length >= 5 || u12Loading || u12CalendarBusy ||
      !u12WriteAllowed || u12Conflict ||
      u12Snapshot.session?.state === "cancelled") return;
  const initial = U12_STANDARD_CONTENT_CATALOG[0];
  if (!initial) {
    showMessage(u12Ui.message, "Bitte zuerst eine U12-Kategorie über ⚙ anlegen oder aktivieren.");
    return;
  }
  // A new content always requires a deliberate category selection.
  // A placeholder is not a free-text category and can never be saved.
  u12ContentTitles.push("");
  u12ContentItems.push({ code: "", detail: "" });
  if (u12Ui.contentCard) u12Ui.contentCard.open = true;
  renderU12Attendance();
  markU12DraftDirty();
  u12Ui.contentRows?.querySelectorAll("[data-u12-code-index]")[u12ContentTitles.length - 1]?.focus();
}

function removeU12Content(index) {
  if (!u12Snapshot || !Number.isInteger(index) ||
      index < 0 || index >= u12ContentTitles.length ||
      u12Loading || u12CalendarBusy || !u12WriteAllowed || u12Conflict ||
      u12Snapshot.session?.state === "cancelled") return;
  u12ContentTitles.splice(index, 1);
  u12ContentItems.splice(index, 1);
  for (const [id, slots] of u12ContentAssignments) {
    u12ContentAssignments.set(id, new Set(
      [...slots].filter((slot) => slot !== index + 1)
        .map((slot) => slot > index + 1 ? slot - 1 : slot),
    ));
  }
  renderU12Attendance();
  markU12DraftDirty();
}

function u12PresentAthletes() {
  return (u12Snapshot?.participants ?? []).filter((person) =>
    u12Present.get(person.athleteId) === true,
  );
}

function u12EditableDraft() {
  return !!u12Snapshot && u12Ready && u12WriteAllowed && !u12Conflict &&
    !u12Loading && !u12CalendarBusy && u12Snapshot.session?.state !== "cancelled";
}

function refreshU12MatrixControls(editable = u12EditableDraft()) {
  const athletes = u12PresentAthletes();
  for (const input of u12Ui.matrix?.querySelectorAll("[data-u12-matrix-athlete]") ?? []) {
    const athleteId = input.dataset.u12MatrixAthlete;
    const slot = Number(input.dataset.u12MatrixSlot);
    input.checked = u12ContentAssignments.get(athleteId)?.has(slot) === true;
    input.disabled = !editable || !u12Present.get(athleteId);
  }
  for (const input of u12Ui.matrix?.querySelectorAll("[data-u12-matrix-all]") ?? []) {
    const slot = Number(input.dataset.u12MatrixAll);
    const assigned = athletes.filter((person) =>
      u12ContentAssignments.get(person.athleteId)?.has(slot)).length;
    input.checked = athletes.length > 0 && assigned === athletes.length;
    input.indeterminate = assigned > 0 && assigned < athletes.length;
    input.disabled = !editable || athletes.length === 0;
    input.setAttribute("aria-label",
      "Inhalt " + slot + (input.checked ? " bei allen entfernen" : " allen zuordnen"));
  }
}


function refreshU12AssignmentSummaries() {
  for (const container of u12Ui.days?.querySelectorAll("[data-u12-summary-id]") ?? []) {
    const athleteId = container.dataset.u12SummaryId;
    container.replaceChildren();
    const present = u12Present.get(athleteId) === true;
    container.hidden = !present || u12ContentTitles.length === 0;
    if (container.hidden) continue;

    const prefix = document.createElement("span");
    prefix.className = "u12-person__contents-label";
    prefix.textContent = "Inhalte:";
    container.append(prefix);
    const slots = [...(u12ContentAssignments.get(athleteId) ?? new Set())]
      .filter((slot) => Number.isInteger(slot) && slot > 0 && slot <= u12ContentTitles.length)
      .sort((a, b) => a - b);
    if (slots.length === 0) {
      const empty = document.createElement("span");
      empty.className = "u12-person__content-empty";
      empty.textContent = "keine zugeordnet";
      container.append(empty);
    }
    for (const slot of slots) {
      const chip = document.createElement("span");
      chip.className = "u12-person__content-chip";
      const detail = u12ContentItems[slot - 1]?.detail?.trim();
      chip.textContent = slot + ". " + (u12ContentTitles[slot - 1]?.trim() || "Ohne Bezeichnung") +
        (detail ? " · " + detail : "");
      container.append(chip);
    }
  }
}

function openU12AssignmentDialog() {
  if (!u12Ui.matrixSection || !u12Snapshot || !u12Ready || u12Loading || u12Saving || u12CalendarBusy ||
      u12ContentTitles.length === 0 || u12Ui.matrixSection.open) return;
  renderU12AssignmentMatrix();
  u12Ui.matrixSection.showModal();
  refreshU12MatrixControls();
}

function renderU12AssignmentMatrix() {
  if (!u12Ui.matrix || !u12Ui.matrixSection) return;
  u12Ui.matrix.replaceChildren();
  u12Ui.matrixLegend?.replaceChildren();
  if (!u12Snapshot || u12ContentTitles.length === 0) {
    if (u12Ui.matrixSection.open) u12Ui.matrixSection.close();
    return;
  }
  const athletes = u12PresentAthletes();
  if (u12Ui.matrixSummary) u12Ui.matrixSummary.textContent =
    athletes.length + " anwesend · " + u12ContentTitles.length + " Inhalte";
  for (const [index, title] of u12ContentTitles.entries()) {
    const legend = document.createElement("span");
    const number = document.createElement("strong");
    number.textContent = String(index + 1) + ". ";
    legend.dataset.u12MatrixLegend = String(index);
    const detail = u12ContentItems[index]?.detail?.trim();
    legend.append(number, document.createTextNode(
      (title.trim() || "Inhalt ohne Bezeichnung") + (detail ? " · " + detail : ""),
    ));
    u12Ui.matrixLegend?.append(legend);
  }
  const head = document.createElement("thead");
  const header = document.createElement("tr");
  const first = document.createElement("th");
  first.scope = "col";
  first.textContent = "Athlet";
  header.append(first);
  for (const [index, title] of u12ContentTitles.entries()) {
    const column = document.createElement("th");
    column.scope = "col";
    const stack = document.createElement("div");
    stack.className = "u12-matrix-col";
    const titleLabel = document.createElement("span");
    titleLabel.className = "u12-matrix-col__name";
    titleLabel.dataset.u12MatrixHeading = String(index);
    titleLabel.textContent = String(index + 1);
    titleLabel.title = titleLabel.textContent;
    const all = document.createElement("label");
    all.className = "u12-matrix-col__all";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.u12MatrixAll = String(index + 1);
    const legend = document.createElement("span");
    legend.textContent = "Alle";
    all.append(checkbox, legend);
    stack.append(titleLabel, all);
    column.append(stack);
    header.append(column);
  }
  head.append(header);
  u12Ui.matrix.append(head);
  const body = document.createElement("tbody");
  if (athletes.length === 0) {
    const tr = document.createElement("tr");
    const empty = document.createElement("td");
    empty.colSpan = u12ContentTitles.length + 1;
    empty.className = "u12-matrix-empty";
    empty.textContent = "Zuerst die anwesenden Athleten anhaken.";
    tr.append(empty);
    body.append(tr);
  }
  for (const person of athletes) {
    const tr = document.createElement("tr");
    const name = document.createElement("th");
    name.scope = "row";
    name.textContent = person.lastName + " " + person.firstName;
    tr.append(name);
    for (const [index, title] of u12ContentTitles.entries()) {
      const td = document.createElement("td");
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.className = "u12-matrix-check";
      input.dataset.u12MatrixAthlete = person.athleteId;
      input.dataset.u12MatrixSlot = String(index + 1);
      input.setAttribute("aria-label", (title.trim() || "Inhalt " + (index + 1)) +
        " für " + person.firstName + " " + person.lastName);
      label.append(input);
      td.append(label);
      tr.append(td);
    }
    body.append(tr);
  }
  u12Ui.matrix.append(body);
  refreshU12MatrixControls();
}

function changeU12MatrixAssignment(athleteId, slot, checked) {
  if (!u12EditableDraft() || !Number.isInteger(slot) ||
      slot < 1 || slot > u12ContentTitles.length ||
      !u12Present.get(athleteId) ||
      !u12Snapshot.participants.some((person) => person.athleteId === athleteId)) return;
  const selected = new Set(u12ContentAssignments.get(athleteId) ?? []);
  if (checked) selected.add(slot);
  else selected.delete(slot);
  u12ContentAssignments.set(athleteId, selected);
  markU12DraftDirty();
}

function changeU12MatrixColumn(slot, checked) {
  if (!u12EditableDraft() || !Number.isInteger(slot) ||
      slot < 1 || slot > u12ContentTitles.length) return;
  const athletes = u12PresentAthletes();
  if (athletes.length === 0) return;
  for (const person of athletes) {
    const selected = new Set(u12ContentAssignments.get(person.athleteId) ?? []);
    if (checked) selected.add(slot);
    else selected.delete(slot);
    u12ContentAssignments.set(person.athleteId, selected);
  }
  markU12DraftDirty();
}

function u12StatisticsDefaultRange() {
  const today = new Date();
  const day = today.getDate();
  const start = new Date(today.getFullYear(), today.getMonth() - 3, 1);
  const endOfMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  start.setDate(Math.min(day, endOfMonth));
  return { from: localIsoDate(start), to: localIsoDate(today) };
}

function selectU12StatisticsTab(tab) {
  if (!["trainings", "athletes", "categories", "trainers"].includes(tab)) return;
  for (const button of u12Ui.statsDialog?.querySelectorAll("[data-u12-stats-tab]") ?? []) {
    button.setAttribute("aria-pressed", String(button.dataset.u12StatsTab === tab));
  }
  for (const panel of u12Ui.statsDialog?.querySelectorAll("[data-u12-stats-panel]") ?? []) {
    panel.hidden = panel.dataset.u12StatsPanel !== tab;
  }
}

function appendU12StatisticsLine(container, left, right, helper = "") {
  if (!container) return;
  const row = document.createElement("div");
  row.className = "u12-statistics-line";
  const body = document.createElement("span");
  body.textContent = left;
  if (helper) {
    const note = document.createElement("small");
    note.textContent = helper;
    body.append(document.createElement("br"), note);
  }
  const value = document.createElement("strong");
  value.textContent = String(right);
  row.append(body, value);
  container.append(row);
}

function u12StatisticsCsvValue(value) {
  const text = String(value ?? "");
  // Protect spreadsheet consumers against formula injection in names and labels.
  const safe = /^\s*[=+@-]/.test(text) ? "'" + text : text;
  return '"' + safe.replace(/"/g, '""') + '"';
}

function exportU12StatisticsCsv() {
  const saved = u12StatisticsExport;
  if (!saved || !u12Ui.statsDialog?.open || saved.groupId !== u12Ui.group?.value ||
      saved.from !== u12Ui.statsFrom?.value || saved.to !== u12Ui.statsTo?.value) return;
  const report = saved.report;
  const rows = [["Bereich", "Datum/Monat", "Name/Kategorie", "Kennzahl", "Wert", "Zusatz"]];
  const add = (...cells) => rows.push(cells);
  add("Übersicht", "", "", "Trainings", report.summary.trainings, "");
  add("Übersicht", "", "", "Anwesenheiten", report.summary.attendance, "");
  add("Übersicht", "", "", "Trainer-Einsätze", report.summary.trainerAttendances, "");
  add("Übersicht", "", "", "Kategorien", report.summary.categories, "");
  add("Übersicht", "", "", "Geklärte Status", report.summary.evaluatedStatuses, "");
  add("Übersicht", "", "", "Offene Status", report.summary.openStatuses, "");
  for (const month of report.months) {
    add("Monate", month.month, "", "Trainings", month.trainings, "");
    add("Monate", month.month, "", "Anwesenheiten", month.attendance, "");
    add("Monate", month.month, "", "Trainer-Einsätze", month.trainerAttendances, "");
  }
  for (const training of report.trainings) {
    add("Trainings", training.date, "", "Anwesende", training.presentCount, "");
    add("Trainings", training.date, "", "Erfasste", training.registeredCount, "");
    add("Trainings", training.date, "", "Offene", training.openCount, "");
    add("Trainings", training.date, "", "Kategorien", training.categoryCount, "");
    add("Trainings", training.date, "", "Trainer", training.trainerPresentCount, "");
  }
  for (const athlete of report.athletes) {
    const name = athlete.lastName + " " + athlete.firstName;
    add("Athleten", "", name, "Anwesend", athlete.attended, "");
    add("Athleten", "", name, "Gewertet", athlete.evaluated, "");
    add("Athleten", "", name, "Offen", athlete.openCount, "");
    add("Athleten", "", name, "Quote (%)", athlete.attendancePercent ?? "", "");
    for (const category of athlete.categories || []) {
      add("Athleten-Kategorien", "", name, category.label, category.count, "");
    }
  }
  for (const category of report.categories) {
    add("Kategorien", "", category.label, "Trainings", category.trainings, "");
    add("Kategorien", "", category.label, "Zuordnungen", category.assignments, "");
  }
  for (const trainer of report.trainers) {
    add("Trainer", "", trainer.lastName + " " + trainer.firstName, "Einsätze", trainer.attended, "");
  }
  if (report.summary.unidentifiedTrainerAttendances > 0) {
    add("Trainer", "", "Nicht mehr zuordenbar", "Einsätze",
      report.summary.unidentifiedTrainerAttendances, "");
  }
  const csv = "\uFEFF" + rows.map(row => row.map(u12StatisticsCsvValue).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "ulc-statistik-" + saved.from + "-" + saved.to + ".csv";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderU12Statistics(report) {
  if (!report || !report.summary || !Array.isArray(report.trainings) ||
      !Array.isArray(report.months) || !Array.isArray(report.athletes) ||
      !Array.isArray(report.categories) || !Array.isArray(report.trainers)) {
    throw new Error("U12_STATISTICS_INVALID");
  }
  u12Ui.statsSummary?.replaceChildren();
  const assessed = report.summary.evaluatedStatuses;
  const open = report.summary.openStatuses;
  if (!Number.isSafeInteger(assessed) || assessed < 0 ||
      !Number.isSafeInteger(open) || open < 0) {
    throw new Error("U12_STATISTICS_INVALID");
  }
  if (u12Ui.statsCompleteness) {
    const total = assessed + open;
    u12Ui.statsCompleteness.textContent =
      "Status geklärt: " + assessed + " von " + total +
      " vorhandenen Anwesenheitseinträgen · " + open + " offen. " +
      "Nicht angelegte Einträge werden nicht als Fehlzeiten gewertet.";
  }
  const kpis = [
    ["Trainings", report.summary.trainings],
    ["Anwesenheiten", report.summary.attendance],
    ["Trainer-Einsätze", report.summary.trainerAttendances],
    ["Kategorien", report.summary.categories],
  ];
  for (const [label, count] of kpis) {
    const card = document.createElement("div");
    card.className = "u12-statistics-kpi";
    const strong = document.createElement("strong");
    strong.textContent = String(count);
    const small = document.createElement("small");
    small.textContent = label;
    card.append(strong, small);
    u12Ui.statsSummary?.append(card);
  }
  u12Ui.statsMonths?.replaceChildren();
  u12Ui.statsTrainings?.replaceChildren();
  u12Ui.statsAthletes?.replaceChildren();
  u12Ui.statsCategories?.replaceChildren();
  u12Ui.statsTrainers?.replaceChildren();
  for (const month of report.months) {
    const label = month.month.slice(5) + "." + month.month.slice(0, 4);
    const average = month.trainings === 0 ? "–" :
      (month.attendance / month.trainings).toLocaleString("de-AT", {
        maximumFractionDigits: 1,
      });
    appendU12StatisticsLine(u12Ui.statsMonths, label,
      month.attendance + " Anwesenheiten",
      month.trainings + " Trainings · Ø " + average + " anwesend · " +
        month.trainerAttendances + " Trainer-Einsätze");
  }
  for (const training of report.trainings) {
    appendU12StatisticsLine(
      u12Ui.statsTrainings, germanDate(training.date),
      training.presentCount + " anwesend",
      training.categoryCount + " Kategorien · " +
        (training.registeredCount - training.openCount) + " / " +
        training.registeredCount + " Status geklärt · " +
        training.trainerPresentCount + " Trainer",
    );
  }
  for (const athlete of report.athletes) {
    const details = document.createElement("details");
    details.className = "u12-statistics-athlete";
    const summary = document.createElement("summary");
    summary.className = "ab-disclosure";
    const name = document.createElement("span");
    name.textContent = athlete.lastName + " " + athlete.firstName;
    const count = document.createElement("strong");
    count.textContent = athlete.attended + " / " + athlete.evaluated +
      (athlete.attendancePercent === null ? " · –" : " · " + athlete.attendancePercent + " %");
    summary.append(name, count);
    const contents = document.createElement("div");
    contents.className = "u12-statistics-athlete__detail";
    const explanation = document.createElement("small");
    explanation.textContent = "Quote: anwesend / (anwesend + abwesend + entschuldigt). " +
      "Offene und nicht vorhandene Einträge zählen nicht als Fehlzeit.";
    contents.append(explanation);
    if (athlete.openCount > 0) {
      const openStatus = document.createElement("small");
      openStatus.textContent = athlete.openCount + " vorhandene Einträge noch offen";
      contents.append(openStatus);
    }
    if (!Array.isArray(athlete.categories) || athlete.categories.length === 0) {
      const empty = document.createElement("small");
      empty.textContent = "Keine standardisierten Trainingsinhalte zugeordnet.";
      contents.append(empty);
    } else {
      for (const category of athlete.categories) {
        const row = document.createElement("div");
        const label = document.createElement("span");
        label.textContent = category.label;
        const value = document.createElement("strong");
        value.textContent = category.count + " ×";
        row.append(label, value);
        contents.append(row);
      }
    }
    details.append(summary, contents);
    u12Ui.statsAthletes?.append(details);
  }
  for (const category of report.categories) {
    appendU12StatisticsLine(
      u12Ui.statsCategories, category.label, category.trainings + " Trainings",
      category.assignments + " Athleten-Zuordnungen",
    );
  }
  for (const trainer of report.trainers) {
    appendU12StatisticsLine(u12Ui.statsTrainers,
      trainer.lastName + " " + trainer.firstName,
      trainer.attended + " Trainings");
  }
  if (report.summary.unidentifiedTrainerAttendances > 0) {
    appendU12StatisticsLine(u12Ui.statsTrainers, "Nicht mehr zuordenbar",
      report.summary.unidentifiedTrainerAttendances + " Einsätze",
      "Trainer ist nicht mehr in den Stammdaten vorhanden");
  }
  for (const [list, hasEntries, emptyText] of [
    [u12Ui.statsMonths, report.months.length > 0, "Keine Monatsdaten im Zeitraum."],
    [u12Ui.statsTrainings, report.trainings.length > 0, "Keine gespeicherten U12-Trainings im Zeitraum."],
    [u12Ui.statsAthletes, report.athletes.length > 0, "Keine U12-Athleten im Zeitraum."],
    [u12Ui.statsCategories, report.categories.length > 0, "Keine standardisierten Kategorien verwendet."],
    [u12Ui.statsTrainers, report.trainers.length > 0 ||
      report.summary.unidentifiedTrainerAttendances > 0, "Keine Trainer-Einsätze im Zeitraum."],
  ]) {
    if (!hasEntries && list) {
      const empty = document.createElement("p");
      empty.className = "u12-statistics-state";
      empty.textContent = emptyText;
      list.append(empty);
    }
  }
}

async function loadU12Statistics() {
  const groupId = u12Ui.group?.value || "";
  const from = u12Ui.statsFrom?.value || "";
  const to = u12Ui.statsTo?.value || "";
  const id = ++u12StatisticsLoadId;
  if (!groupId || !u12Ui.statsDialog?.open) return;
  showMessage(u12Ui.statsError, "");
  u12StatisticsExport = null;
  if (u12Ui.statsExport) u12Ui.statsExport.disabled = true;
  u12Ui.statsState.textContent = "Statistik wird geladen …";
  u12Ui.statsSummary?.replaceChildren();
  if (u12Ui.statsCompleteness) u12Ui.statsCompleteness.textContent = "";
  u12Ui.statsMonths?.replaceChildren();
  u12Ui.statsTrainings?.replaceChildren();
  u12Ui.statsAthletes?.replaceChildren();
  u12Ui.statsCategories?.replaceChildren();
  u12Ui.statsTrainers?.replaceChildren();
  for (const input of [u12Ui.statsFrom, u12Ui.statsTo]) input.disabled = true;
  try {
    if (!from || !to || from > to) throw new Error("INVALID_RANGE");
    const payload = await requestJson("/api/modules/u12/statistics?groupId=" +
      encodeURIComponent(groupId) + "&from=" + encodeURIComponent(from) +
      "&to=" + encodeURIComponent(to));
    if (id !== u12StatisticsLoadId || !u12Ui.statsDialog.open ||
        groupId !== u12Ui.group?.value) return;
    renderU12Statistics(payload?.report);
    u12StatisticsExport = { groupId, from, to, report: payload.report };
    if (u12Ui.statsExport) u12Ui.statsExport.disabled = false;
    u12Ui.statsState.textContent = "Nur gespeicherte Anwesenheiten · " +
      germanDate(from) + " – " + germanDate(to) + ".";
  } catch {
    if (id === u12StatisticsLoadId && u12Ui.statsDialog.open) {
      u12Ui.statsState.textContent = "";
      showMessage(u12Ui.statsError, "Statistik konnte nicht geladen werden. Zeitraum prüfen und erneut versuchen.");
    }
  } finally {
    if (id === u12StatisticsLoadId) {
      for (const input of [u12Ui.statsFrom, u12Ui.statsTo]) input.disabled = false;
    }
  }
}

function openU12Statistics() {
  if (!u12Ui.statsDialog || u12Ui.statsDialog.open || !u12Ready || !u12Snapshot) return;
  const range = u12StatisticsDefaultRange();
  u12Ui.statsFrom.value = range.from;
  u12Ui.statsTo.value = range.to;
  selectU12StatisticsTab("trainings");
  u12Ui.statsDialog.showModal();
  void loadU12Statistics();
}

function renderU12Trainers() {
  if (!u12Ui.trainerRows) return;
  u12Ui.trainerRows.replaceChildren();
  const trainers = u12Snapshot?.trainers ?? [];
  if (u12Ui.trainersCard) u12Ui.trainersCard.hidden = !u12Snapshot;
  if (!u12Snapshot) return;
  if (trainers.length === 0) {
    const empty = document.createElement("small");
    empty.textContent = "Dieser Gruppe sind keine aktiven Trainer zugeordnet.";
    u12Ui.trainerRows.append(empty);
  }
  for (const trainer of trainers) {
    const label = document.createElement("label");
    label.className = "u12-trainer-row";
    const name = document.createElement("span");
    name.className = "u12-trainer-name";
    name.textContent = trainer.lastName + " " + trainer.firstName;
    const input = document.createElement("input");
    input.type = "checkbox";
    input.dataset.u12TrainerId = trainer.trainerId;
    input.checked = u12TrainerPresent.has(trainer.trainerId);
    input.setAttribute("aria-label", "Trainer anwesend: " + trainer.firstName + " " + trainer.lastName);
    label.append(input, name);
    u12Ui.trainerRows.append(label);
  }
}

function renderU12Attendance() {
  if (!u12Ui.days || !u12Ui.week) return;
  u12Ui.days.replaceChildren();
  renderU12Trainers();
  renderU12ContentRows();
  renderU12AssignmentMatrix();
  const groupId = u12Ui.group?.value || "";
  const date = u12Ui.date?.value || "";
  u12Ui.week.hidden = !u12Ready || !groupId || !date;
  if (!u12Ready || !groupId || !date) {
    refreshU12Controls();
    return;
  }
  if (u12Loading) {
    const placeholder = document.createElement("div");
    placeholder.className = "card";
    placeholder.textContent = "Namensliste wird geladen …";
    u12Ui.days.append(placeholder);
    refreshU12Controls();
    return;
  }
  if (!u12Snapshot) {
    const placeholder = document.createElement("div");
    placeholder.className = "card";
    placeholder.textContent = "Keine Liste geladen. Bitte Trainingstermin erneut auswählen.";
    u12Ui.days.append(placeholder);
    refreshU12Controls();
    return;
  }
  const roster = document.createElement("div");
  roster.className = "card u12-roster";
  if (u12Snapshot.session?.state === "cancelled") {
    const hint = document.createElement("small");
    hint.className = "u12-roster-hint";
    hint.textContent = "Dieser Trainingstermin ist abgesagt. Die Anwesenheit kann nicht geändert werden.";
    roster.append(hint);
  }
  if (u12Snapshot.participants.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "Für diesen Trainingstermin sind keine Athleten zugeordnet.";
    roster.append(empty);
  }
  for (const person of u12Snapshot.participants) {
    const row = document.createElement("div");
    row.className = "u12-person";
    const label = document.createElement("label");
    label.className = "u12-person__toggle";
    const name = document.createElement("span");
    name.className = "u12-person__name";
    name.textContent = person.lastName + " " + person.firstName;
    const answer = document.createElement("span");
    answer.className = "u12-person__answer";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.dataset.u12AthleteId = person.athleteId;
    input.checked = u12Present.get(person.athleteId) === true;
    input.setAttribute("aria-label", "Anwesend: " + person.firstName + " " + person.lastName);
    const status = document.createElement("span");
    status.dataset.u12AnswerId = person.athleteId;
    answer.append(input, status);
    updateU12AttendanceStatus(status, person);
    label.append(name, answer);
    row.append(label);
    if (person.notes || person.contacts.length > 0) {
      const info = document.createElement("button");
      info.type = "button";
      info.className = "u12-info";
      info.dataset.u12InfoId = person.athleteId;
      const hasEmergencyContact = person.contacts.some((contact) => contact.isEmergency);
      info.textContent = hasEmergencyContact ? "☎" : "ⓘ";
      info.classList.toggle("u12-info--emergency", hasEmergencyContact);
      info.title = hasEmergencyContact ? "Notfallkontakte öffnen" : "Hinweise und Kontakte öffnen";
      info.setAttribute("aria-label",
        (hasEmergencyContact ? "Notfallkontakte zu " : "Hinweise und Kontakte zu ") +
        person.firstName + " " + person.lastName + " anzeigen");
      row.append(info);
    }
    const summary = document.createElement("div");
    summary.className = "u12-person__contents";
    summary.dataset.u12SummaryId = person.athleteId;
    summary.hidden = true;
    row.append(summary);
    roster.append(row);
  }
  u12Ui.days.append(roster);
  refreshU12Controls();
}


/**
 * Kids-only trainer calendar reader. The v17 calendar endpoint projects group
 * weekdays plus explicit extra/cancelled exceptions; it never returns old test
 * sessions as schedule exceptions. U12/U14 keep their accepted day-navigation.
 */
function u12CalendarWeekStart(date) {
  const parsed = new Date(String(date) + "T12:00:00");
  if (!Number.isFinite(parsed.getTime()) || localIsoDate(parsed) !== date) {
    throw new Error("INVALID_CALENDAR_DATE");
  }
  return localWeekStart(parsed);
}


function refreshU12CalendarHint() {
  if (!u12FollowGroupCalendar) return;
  const hasRule = Array.isArray(u12CalendarRuleWeekdays);
  if (u12Ui.calendarHint) {
    u12Ui.calendarHint.hidden = hasRule || !u12Ready;
    u12Ui.calendarHint.textContent = u12CalendarEnabled
      ? "Für diese Gruppe ist noch keine Wochenregel gespeichert. Mit den Pfeilen wechselst du jeweils eine Woche."
      : "Der Gruppenkalender ist hier nicht aktiv. Mit den Pfeilen wechselst du jeweils eine Woche.";
  }
  for (const [control, label] of [
    [u12Ui.prev, hasRule ? "Vorheriges Training" : "Gleicher Wochentag in der Vorwoche"],
    [u12Ui.next, hasRule ? "Nächstes Training" : "Gleicher Wochentag in der Folgewoche"],
  ]) {
    if (!control) continue;
    control.setAttribute("aria-label", label);
    control.title = label;
  }
}

async function u12FetchCalendarDates(groupId, weekStart) {
  const cache = u12CalendarWeekCache;
  const generation = attendanceSessionGeneration;
  const cacheKey = groupId + "|" + weekStart;
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  const result = await requestJson(
    "/api/modules/kindertraining/calendar?groupId=" + encodeURIComponent(groupId) +
    "&weekStart=" + encodeURIComponent(weekStart));
  if (generation !== attendanceSessionGeneration || cache !== u12CalendarWeekCache) {
    throw new Error("STALE_CALENDAR_REQUEST");
  }
  const validWeek = registrationWeekDates(weekStart);
  if (result?.groupId !== groupId || result?.weekStart !== weekStart ||
      !Array.isArray(result.dates) ||
      typeof result.calendarEnabled !== "boolean" ||
      !(result.weekdays === null ||
        (Array.isArray(result.weekdays) &&
         result.weekdays.length > 0 &&
         result.weekdays.length <= 7 &&
         result.weekdays.every((day, i) => Number.isInteger(day) &&
           day >= 1 && day <= 7 && (i === 0 || day > result.weekdays[i - 1])))) ||
      (!result.calendarEnabled && result.weekdays !== null)) {
    throw new Error("INVALID_CALENDAR_RESPONSE");
  }
  u12CalendarEnabled = result.calendarEnabled;
  u12CalendarRuleWeekdays = result.weekdays;
  refreshU12CalendarHint();
  const positions = result.dates.map((date) => validWeek.indexOf(date));
  if (!positions.every((index, i) => index >= 0 &&
      (i === 0 || index > positions[i - 1]))) {
    throw new Error("INVALID_CALENDAR_DATES");
  }
  cache.set(cacheKey, result.dates);
  return result.dates;
}

// An accessible, native select contains only verified training days, unlike
// a browser date picker which cannot disable individual weekdays reliably.
async function u12PopulateCalendarChoices(groupId, selected, isCurrent) {
  if (!u12FollowGroupCalendar || !u12Ui.date) return;
  const weekStart = u12CalendarWeekStart(selected);
  const weekStarts = Array.from({ length: 8 }, (_, i) =>
    shiftIsoDate(weekStart, (i - 3) * 7));
  const days = (await Promise.all(
    weekStarts.map(async (monday) => {
      try { return await u12FetchCalendarDates(groupId, monday); }
      catch { return []; } // Keep other authorized weeks available.
    }),
  )).flat();
  if (!isCurrent()) return;
  if (!days.includes(selected)) throw new Error("SELECTED_DATE_NOT_IN_CALENDAR");
  const select = u12Ui.date;
  select.replaceChildren();
  for (const day of [...new Set(days)].sort()) {
    const option = document.createElement("option");
    option.value = day;
    option.textContent = germanWeekday(day).slice(0, 2) + " · " + germanDate(day);
    select.append(option);
  }
  select.value = selected;
}

async function u12FindCalendarDate(groupId, anchor, direction, includeAnchor,
    onlyWeekday = null) {
  let searchDate = includeAnchor ? anchor : shiftIsoDate(anchor, direction);
  for (let week = 0; week < 16; week += 1) {
    const weekStart = u12CalendarWeekStart(searchDate);
    const dates = await u12FetchCalendarDates(groupId, weekStart);
    const eligible = dates.filter((date) =>
      (direction > 0 ? date >= searchDate : date <= searchDate) &&
      (onlyWeekday === null ||
        new Date(date + "T12:00:00").getDay() === onlyWeekday));
    if (eligible.length) return direction > 0
      ? eligible[0] : eligible[eligible.length - 1];
    searchDate = shiftIsoDate(weekStart, direction > 0 ? 7 : -1);
  }
  throw new Error("NO_CALENDAR_TRAINING_DAY");
}

async function u12NavigateCalendarDate(anchor, direction, includeAnchor = false,
    resolveMoveMode = false) {
  if (!u12Ui.date || !u12Ready || u12CalendarBusy || u12Loading || u12Saving) return;
  const groupId = u12Ui.group?.value || "";
  if (!groupId) return;
  const generation = attendanceSessionGeneration;
  const loadId = u12LoadId;
  // Lock all draft inputs *before* the potentially asynchronous CAS flush.
  // saveU12Attendance must remain callable by this explicit flush.
  u12CalendarBusy = true;
  refreshU12Controls();
  try {
    if (!(await u12FlushChanges())) return;
    if (generation !== attendanceSessionGeneration || u12Ui.group?.value !== groupId ||
        u12LoadId !== loadId) return;
    // A fresh navigation must observe schedule updates from other sessions.
    // Remember the prior rule only for deciding whether the displayed
    // dropdown can be reused. It never substitutes for server validation.
    const previousRuleWeekdays = JSON.stringify(u12CalendarRuleWeekdays);
    u12CalendarWeekCache = new Map();
    let selectedAnchor = anchor;
    let includeSelectedAnchor = includeAnchor;
    let onlyWeekday = null;
    if (resolveMoveMode) {
      // A calendar rule can change in another session since the dropdown
      // was loaded. Decide the arrow semantics only after a fresh API read.
      await u12FetchCalendarDates(groupId, u12CalendarWeekStart(anchor));
      if (u12CalendarRuleWeekdays === null) {
        // Without a saved weekly rule the seven-day API fallback must not
        // make the trainer click through seven calendar days.
        onlyWeekday = new Date(anchor + "T12:00:00").getDay();
        selectedAnchor = shiftIsoDate(anchor, direction * 7);
        includeSelectedAnchor = true;
      }
    }
    const chosen = await u12FindCalendarDate(
      groupId, selectedAnchor, direction, includeSelectedAnchor, onlyWeekday);
    if (generation !== attendanceSessionGeneration || u12Ui.group?.value !== groupId ||
        u12LoadId !== loadId) return;
    // The next/previous arrow normally selects a date already in the
    // dropdown. Avoid an eight-week network burst when the freshly verified
    // target week matches the current authorized options exactly.
    // Rule changes, added/cancelled dates and dates outside the visible range
    // still rebuild the options from the server. No write uses this shortcut.
    const chosenWeek = u12CalendarWeekStart(chosen);
    await u12FetchCalendarDates(groupId, chosenWeek);
    const optionValues = Array.from(u12Ui.date.options ?? [],
      (option) => option.value);
    // Compare every freshly visited week, not just the destination. For
    // example, a cancelled Tuesday that the search skipped must disappear
    // from the dropdown even when the next Tuesday was already displayed.
    const verifiedWeeks = [...u12CalendarWeekCache.entries()].filter(
      ([key]) => key.startsWith(groupId + "|"),
    );
    const displayedWeeksMatch = verifiedWeeks.every(([key, verifiedDays]) => {
      const weekStart = key.slice(groupId.length + 1);
      const weekEnd = shiftIsoDate(weekStart, 6);
      const displayedDays = optionValues.filter((day) =>
        day >= weekStart && day <= weekEnd);
      return displayedDays.length === verifiedDays.length &&
        verifiedDays.every((day, index) => displayedDays[index] === day);
    });
    const choicesStillCurrent =
      previousRuleWeekdays === JSON.stringify(u12CalendarRuleWeekdays) &&
      optionValues.includes(chosen) &&
      displayedWeeksMatch;
    if (!choicesStillCurrent) {
      await u12PopulateCalendarChoices(groupId, chosen, () =>
        generation === attendanceSessionGeneration &&
        u12Ui.group?.value === groupId && u12LoadId === loadId);
    }
    if (generation !== attendanceSessionGeneration || u12Ui.group?.value !== groupId ||
        u12LoadId !== loadId) return;
    u12Ui.date.value = chosen;
    // Keep the old draft locked throughout the destination load. Never clear
    // calendarBusy between the last flush and the new attendance snapshot.
    await loadU12Attendance({ calendarChoicesReady: true });
  } catch {
    if (generation === attendanceSessionGeneration && u12Ui.group?.value === groupId) {
      showMessage(u12Ui.message,
        "Geplante Trainingstage konnten nicht ermittelt werden. Datum unverändert.");
    }
  } finally {
    if (generation === attendanceSessionGeneration) {
      u12CalendarBusy = false;
      refreshU12Controls();
    }
  }
}

async function loadU12Attendance({ calendarChoicesReady = false } = {}) {
  const groupId = u12Ui.group?.value || "";
  let date = u12Ui.date?.value || "";
  if (!u12Ready || u12Loading || u12Saving || !groupId || !date) {
    renderU12Attendance();
    return;
  }
  const generation = attendanceSessionGeneration;
  const loadId = ++u12LoadId;
  if (u12FollowGroupCalendar) {
    // Revalidate on every new attendance read; never trust a prior visit.
    u12CalendarWeekCache = new Map();
    u12CalendarBusy = true;
    refreshU12Controls();
    try {
      const requestedDate = date;
      const dates = await u12FetchCalendarDates(groupId, u12CalendarWeekStart(date));
      if (!dates.includes(date)) {
        date = await u12FindCalendarDate(groupId, date, 1, true);
      }
      if (generation !== attendanceSessionGeneration ||
          loadId !== u12LoadId || u12Ui.group?.value !== groupId) return;
      // Arrow navigation has already populated the authorized options. Recheck
      // the target week freshly, but do not issue another eight-week request
      // burst unless the selected training day was removed in the meantime.
      if (!calendarChoicesReady || date !== requestedDate) {
        await u12PopulateCalendarChoices(groupId, date, () =>
          generation === attendanceSessionGeneration &&
          loadId === u12LoadId && u12Ui.group?.value === groupId);
      }
      if (generation !== attendanceSessionGeneration ||
          loadId !== u12LoadId || u12Ui.group?.value !== groupId) return;
      u12Ui.date.value = date;
    } catch {
      if (generation === attendanceSessionGeneration && loadId === u12LoadId) {
        u12Snapshot = null;
        renderU12Attendance();
        showMessage(u12Ui.message,
          "Trainingskalender nicht verfügbar. Anwesenheit wurde nicht geladen.");
      }
      return;
    } finally {
      if (generation === attendanceSessionGeneration && loadId === u12LoadId) {
        u12CalendarBusy = false;
        refreshU12Controls();
      }
    }
  }
  u12LoadedGroupId = groupId;
  u12LoadedDate = date;
  if (u12Ui.detailsDialog?.open) u12Ui.detailsDialog.close();
  if (u12Ui.matrixSection?.open) u12Ui.matrixSection.close();
  u12Ui.detailsContent?.replaceChildren();
  u12Snapshot = null;
  u12Present = new Map();
  u12TouchedAthletes = new Set();
  u12TrainerPresent = new Set();
  u12ContentTitles = [];
  u12ContentItems = [];
  u12ContentAssignments = new Map();
  if (u12AutoSaveTimer !== null) clearTimeout(u12AutoSaveTimer);
  u12AutoSaveTimer = null;
  u12Note = "";
  u12EditVersion = 0;
  u12AutoSaveFailed = false;
  u12DirtyDates.clear();
  u12Conflict = false;
  u12Loading = true;
  showMessage(u12Ui.message, "");
  showMessage(u12Ui.success, "");
  renderU12Attendance();
  try {
    await refreshYouthCategoryCatalog();
    if (generation !== attendanceSessionGeneration || loadId !== u12LoadId) return;
    const payload = await requestJson("/api/modules/u12/session?groupId=" +
      encodeURIComponent(groupId) + "&sessionDate=" + encodeURIComponent(date));
    if (generation !== attendanceSessionGeneration || loadId !== u12LoadId) return;
    if (!u12ValidSnapshot(payload?.snapshot, date, groupId)) {
      throw new Error("U12_SESSION_INVALID");
    }
    u12Snapshot = payload.snapshot;
    u12TrainerPresent = new Set((u12Snapshot.trainers ?? [])
      .filter((trainer) => trainer.present).map((trainer) => trainer.trainerId));
    u12Note = u12Snapshot.session?.note ?? "";
    if (u12Ui.note) u12Ui.note.value = u12Note;
    if (u12Ui.notesCard) u12Ui.notesCard.open = u12Note.length > 0;
    u12Present = new Map(u12Snapshot.participants.map((person) =>
      [person.athleteId, person.status === "present"]));
    u12ContentTitles = [...u12Snapshot.contentTitles];
    u12ContentItems = u12Snapshot.contentItems.map((meta) => ({ ...meta }));
    u12ContentAssignments = new Map(u12Snapshot.participants.map((person) =>
      [person.athleteId, new Set(person.contentSlots)]));
  } catch (error) {
    if (generation !== attendanceSessionGeneration || loadId !== u12LoadId) return;
    if (error?.status === 401 || error?.status === 403) {
      u12Ready = false;
      refreshAppAvailability();
      showMessage(u12Ui.message, "Keine Berechtigung für diese U12-Gruppe.");
    } else {
      showMessage(u12Ui.message, "U12-Namensliste konnte nicht geladen werden.");
    }
  } finally {
    if (generation === attendanceSessionGeneration && loadId === u12LoadId) {
      u12Loading = false;
      renderU12Attendance();
    }
  }
}

async function saveU12Attendance() {
  if (u12Saving) return u12SaveInFlight ?? false;
  // Calendar navigation locks new edits before flushing the existing draft.
  // The flush itself must still be able to save while calendarBusy is true.
  if (!u12Snapshot || u12Loading || !u12Ready || !u12WriteAllowed ||
      u12Conflict || u12Snapshot.session?.state === "cancelled") return false;
  if (u12DirtyDates.size === 0) return true;
  const titles = u12ContentTitles.map((title) => title.trim());
  const invalidTitleIndex = titles.findIndex((title) => title.length === 0 || title.length > 120);
  if (invalidTitleIndex !== -1) {
    u12AutoSaveFailed = true;
    if (u12Ui.contentCard) u12Ui.contentCard.open = true;
    showMessage(u12Ui.message, "Bitte für jeden neuen Trainingsinhalt eine Kategorie auswählen.");
    refreshU12Controls();
    return false;
  }
  if (u12IsOffline()) {
    showMessage(u12Ui.message,
      "Keine Internetverbindung. Änderungen noch nicht gespeichert; " +
      "bitte nicht schließen. Nach Wiederverbindung wird erneut gespeichert.");
    refreshU12Controls();
    return false;
  }
  const generation = attendanceSessionGeneration;
  const loadId = u12LoadId;
  const groupId = u12LoadedGroupId;
  const date = u12LoadedDate;
  const savedVersion = u12EditVersion;
  // Freeze this draft; the trainer can continue editing during the request.
  const body = {
    groupId,
    sessionDate: date,
    expectedRevision: u12Snapshot.session?.revision ?? null,
    state: u12Snapshot.session?.state ?? "scheduled",
    note: u12Note.trim() || null,
    trainerIds: [...u12TrainerPresent].sort(),
    attendance: u12Snapshot.participants.map((person) => ({
      athleteId: person.athleteId,
      status: u12TouchedAthletes.has(person.athleteId)
        ? (u12Present.get(person.athleteId) === true ? "present" : "absent")
        : person.status,
      contentSlots: u12Present.get(person.athleteId) === true
        ? [...(u12ContentAssignments.get(person.athleteId) ?? new Set())].sort((a, b) => a - b)
        : [],
    })),
    contentTitles: titles,
    contentItems: u12ContentItems.map((meta) => ({
      code: meta.code,
      detail: meta.detail.trim(),
    })),
  };
  u12Saving = true;
  refreshU12Controls();
  showMessage(u12Ui.message, "");
  const operation = (async () => {
    try {
      const payload = await requestJson("/api/modules/u12/session", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (generation !== attendanceSessionGeneration || loadId !== u12LoadId) return false;
      if (!u12ValidSnapshot(payload?.snapshot, date, groupId)) {
        throw new Error("U12_SAVED_INVALID");
      }
      u12Snapshot = payload.snapshot;
      if (savedVersion === u12EditVersion) {
        u12Present = new Map(u12Snapshot.participants.map((person) =>
          [person.athleteId, person.status === "present"]));
        u12ContentTitles = [...u12Snapshot.contentTitles];
        u12ContentItems = u12Snapshot.contentItems.map((meta) => ({ ...meta }));
        u12ContentAssignments = new Map(u12Snapshot.participants.map((person) =>
          [person.athleteId, new Set(person.contentSlots)]));
        u12Note = u12Snapshot.session?.note ?? "";
        u12TrainerPresent = new Set((u12Snapshot.trainers ?? [])
          .filter((trainer) => trainer.present).map((trainer) => trainer.trainerId));
        u12TouchedAthletes.clear();
        u12DirtyDates.clear();
      }
      u12AutoSaveFailed = false;
      return true;
    } catch (error) {
      if (generation !== attendanceSessionGeneration || loadId !== u12LoadId) return false;
      u12AutoSaveFailed = true;
      if (error?.status === 409) {
        u12Conflict = true;
        showMessage(u12Ui.message,
          "Die Liste wurde zwischenzeitlich geändert. Bitte neu laden, um Daten nicht zu überschreiben.");
      } else if (u12FollowGroupCalendar && error?.status === 422) {
        u12CalendarWeekCache = new Map();
        showMessage(u12Ui.message,
          "Dieser Trainingstag ist inzwischen entfallen. Änderungen nicht gespeichert. " +
          "Bitte neu laden und einen gültigen Trainingstag wählen.");
      } else if (error?.status === 401 || error?.status === 403) {
        u12WriteAllowed = false;
        showMessage(u12Ui.message, "Keine Schreibberechtigung. Änderungen wurden nicht gespeichert.");
      } else if (u12IsOffline()) {
        showMessage(u12Ui.message,
          "Verbindung während des Speicherns verloren. Ergebnis unklar; " +
          "nach Wiederverbindung bitte manuell „Erneut versuchen“ wählen.");
      } else {
        showMessage(u12Ui.message, "Automatisches Speichern fehlgeschlagen. Änderungen bleiben erhalten.");
      }
      return false;
    } finally {
      if (generation === attendanceSessionGeneration && loadId === u12LoadId) {
        u12Saving = false;
        u12SaveInFlight = null;
        if (u12DirtyDates.size > 0 && savedVersion !== u12EditVersion &&
            !u12AutoSaveFailed) scheduleU12AutoSave();
        refreshU12Controls();
      }
    }
  })();
  u12SaveInFlight = operation;
  return operation;
}

async function u12FlushChanges() {
  if (u12AutoSaveTimer !== null) clearTimeout(u12AutoSaveTimer);
  u12AutoSaveTimer = null;
  if (u12Loading) return false;
  // Wait for the current CAS write and then persist edits made during it.
  for (let attempt = 0; attempt < 5; attempt++) {
    if (u12Saving) {
      if (!(await u12SaveInFlight)) return false;
      continue;
    }
    if (u12DirtyDates.size === 0) return true;
    if (!(await saveU12Attendance())) return false;
  }
  return u12DirtyDates.size === 0;
}

async function u12MoveDate(offset) {
  if (u12FollowGroupCalendar) {
    if (!u12Ui.date || offset === 0) return;
    const selected = u12Ui.date.value || localIsoDate(new Date());
    const direction = offset > 0 ? 1 : -1;
    // Exactly one navigation per arrow press. The final mode is determined
    // from a fresh calendar read inside the guarded navigation, not from
    // potentially stale dropdown metadata.
    await u12NavigateCalendarDate(selected, direction, false, true);
    return;
  }
  if (!(await u12FlushChanges())) return;
  if (!u12Ui.date) return;
  const selected = u12Ui.date.value || localIsoDate(new Date());
  u12Ui.date.value = shiftIsoDate(selected, offset);
  await loadU12Attendance();
}

async function u12ChangeDate() {
  if (u12Saving || u12Loading || u12CalendarBusy) return;
  if (u12Ui.date?.value === u12LoadedDate) return;
  if (u12FollowGroupCalendar) {
    if (!u12Ui.date?.value) return;
    const groupId = u12Ui.group?.value || "";
    const selected = u12Ui.date.value;
    const generation = attendanceSessionGeneration;
    const loadId = u12LoadId;
    // Select change already altered the visible value; lock draft editing
    // before flushing the old date to prevent late unsaved modifications.
    u12CalendarBusy = true;
    refreshU12Controls();
    try {
      if (!(await u12FlushChanges())) {
        u12Ui.date.value = u12LoadedDate || localIsoDate(new Date());
        return;
      }
      if (generation !== attendanceSessionGeneration ||
          u12Ui.group?.value !== groupId || loadId !== u12LoadId) return;
      u12CalendarWeekCache = new Map();
      const dates = await u12FetchCalendarDates(
        groupId, u12CalendarWeekStart(selected));
      if (generation !== attendanceSessionGeneration ||
          u12Ui.group?.value !== groupId || loadId !== u12LoadId) return;
      if (!dates.includes(selected)) {
        u12Ui.date.value = u12LoadedDate || localIsoDate(new Date());
        showMessage(u12Ui.message,
          "Dieser Tag ist kein geplanter Trainingstag. Bitte einen Trainingstag wählen.");
        return;
      }
      await loadU12Attendance();
    } catch {
      if (generation === attendanceSessionGeneration && u12Ui.group?.value === groupId) {
        u12Ui.date.value = u12LoadedDate || localIsoDate(new Date());
        showMessage(u12Ui.message, "Trainingskalender konnte nicht geladen werden.");
      }
    } finally {
      if (generation === attendanceSessionGeneration) {
        u12CalendarBusy = false;
        refreshU12Controls();
      }
    }
    return;
  }
  if (!(await u12FlushChanges())) {
    if (u12Ui.date) u12Ui.date.value = u12LoadedDate || localIsoDate(new Date());
    return;
  }
  await loadU12Attendance();
}

async function u12ChangeGroup() {
  if (u12Saving || u12Loading || u12CalendarBusy) return;
  const next = u12Ui.group?.value || "";
  if (next === u12LoadedGroupId) return;
  const generation = attendanceSessionGeneration;
  // Freeze Kids drafts before a potentially slow CAS flush, just as in day
  // navigation. U12/U14 continue to use their existing group-change path.
  if (u12FollowGroupCalendar) {
    u12CalendarBusy = true;
    refreshU12Controls();
  }
  try {
    if (!(await u12FlushChanges())) {
      if (u12Ui.group) u12Ui.group.value = u12LoadedGroupId;
      return;
    }
    if (generation !== attendanceSessionGeneration) return;
    u12Snapshot = null;
    u12Present = new Map();
    u12LoadedGroupId = "";
    u12LoadedDate = "";
    if (u12FollowGroupCalendar) {
      u12CalendarWeekCache = new Map();
      if (u12Ui.date) {
        u12Ui.date.replaceChildren();
        const placeholder = document.createElement("option");
        placeholder.value = localIsoDate(new Date());
        placeholder.textContent = "Trainingstage laden …";
        u12Ui.date.append(placeholder);
      }
    }
    u12DirtyDates.clear();
    u12Conflict = false;
    if (next) await loadU12Attendance();
    else renderU12Attendance();
  } finally {
    if (u12FollowGroupCalendar && generation === attendanceSessionGeneration) {
      u12CalendarBusy = false;
      refreshU12Controls();
    }
  }
}

async function u12ReloadAttendance() {
  if (u12Saving || u12Loading || u12CalendarBusy) return;
  if (u12DirtyDates.size > 0 &&
      !window.confirm("Ungespeicherte Anwesenheit und Trainingsinhalte verwerfen und neu laden?")) return;
  if (u12FollowGroupCalendar) u12CalendarWeekCache = new Map();
  u12DirtyDates.clear();
  u12Conflict = false;
  await loadU12Attendance();
}


// Dial through the device only after strict validation. Never put arbitrary
// contact text, extensions or URI syntax into a clickable tel: destination.
function u12DialablePhone(rawPhone) {
  if (typeof rawPhone !== "string") return null;
  const phone = rawPhone.trim();
  // The domestic trunk prefix in +43 (0)664 must not be dialed as +430664.
  // Only strip the documented optional (0) pattern for known country codes
  // that drop the leading zero internationally. For others, fail closed:
  // some countries (e.g. Italy) use a significant domestic zero.
  const optionalTrunk = /^\\+(43|49|41|44)\\s*\\(0\\)\\s*/.exec(phone);
  let dial = phone;
  if (optionalTrunk) {
    const localNumber = phone.slice(optionalTrunk[0].length);
    if (!/^[1-9]/.test(localNumber)) return null;
    dial = "+" + optionalTrunk[1] + localNumber;
  } else if (phone.includes("(0)")) {
    return null; // Never guess whether a parenthesized zero is significant.
  }
  if (!dial || !dial.split("").every((char, index) =>
      (char >= "0" && char <= "9") ||
      " ()/.-".includes(char) || (index === 0 && char === "+"))) return null;
  const digits = dial.split("").filter((char) => char >= "0" && char <= "9").join("");
  if (digits.length < 3 || digits.length > 15) return null;
  return "tel:" + (dial.startsWith("+") ? "+" : "") + digits;
}

function openU12AthleteDetails(athleteId) {
  const person = u12Snapshot?.participants.find(
    (item) => item.athleteId === athleteId,
  );
  if (!person || !u12Ui.detailsDialog || !u12Ui.detailsContent) return;
  u12Ui.detailsTitle.textContent = person.firstName + " " + person.lastName;
  u12Ui.detailsContent.replaceChildren();
  const notes = document.createElement("section");
  notes.className = "u12-details-section";
  const notesTitle = document.createElement("h3");
  notesTitle.textContent = "Hinweise";
  const notesBody = document.createElement("p");
  notesBody.textContent = person.notes?.trim() || "Keine Hinweise hinterlegt.";
  notes.append(notesTitle, notesBody);
  u12Ui.detailsContent.append(notes);

  const contacts = document.createElement("section");
  contacts.className = "u12-details-section";
  const title = document.createElement("h3");
  title.textContent = "Kontaktpersonen";
  contacts.append(title);
  if (person.contacts.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "Keine Kontaktperson hinterlegt.";
    contacts.append(empty);
  }
  // Preserve server-side emergency/priority ordering, with distinct groups.
  for (const group of [
    { title: "Notfallkontakte", entries: person.contacts.filter((contact) => contact.isEmergency) },
    { title: "Weitere Kontakte", entries: person.contacts.filter((contact) => !contact.isEmergency) },
  ]) {
    if (group.entries.length === 0) continue;
    const section = document.createElement("div");
    section.className = "u12-contact-group";
    const heading = document.createElement("h4");
    heading.textContent = group.title;
    section.append(heading);
    for (const contact of group.entries) {
      const entry = document.createElement("div");
      entry.className = "u12-contact-entry";
      const name = document.createElement("strong");
      name.textContent = contact.contactName +
        (contact.relationship ? " · " + contact.relationship : "");
      const phone = document.createElement("span");
      phone.textContent = "Telefon: " + contact.phone;
      const label = document.createElement("small");
      label.textContent = contact.isEmergency ? "Notfallkontakt" : "Kontakt";
      entry.append(name, phone, label);
      const href = u12DialablePhone(contact.phone);
      if (href) {
        const call = document.createElement("a");
        call.className = "u12-contact-call";
        call.href = href;
        call.textContent = "☎ Anrufen";
        call.setAttribute("aria-label", "Anrufen: " + contact.contactName);
        entry.append(call);
      } else {
        const hint = document.createElement("small");
        hint.textContent = "Nummer prüfen – Direktwahl nicht möglich.";
        entry.append(hint);
      }
      if (contact.notes) {
        const note = document.createElement("p");
        note.textContent = contact.notes;
        entry.append(note);
      }
      section.append(entry);
    }
    contacts.append(section);
  }
  u12Ui.detailsContent.append(contacts);
  u12Ui.detailsDialog.showModal();
}

async function u12GoToday() {
  if (!u12Ui.date || u12Loading || u12Saving || u12CalendarBusy) return;
  const today = localIsoDate(new Date());
  if (u12FollowGroupCalendar) {
    await u12NavigateCalendarDate(today, 1, true);
    return;
  }
  if (u12Ui.date.value === today && u12LoadedDate === today) return;
  u12Ui.date.value = today;
  await u12ChangeDate();
}

async function openU12NewAthlete() {
  const groupId = u12Ui.group?.value || "";
  const startedOn = u12Ui.date?.value || "";
  if (!masterdataReady || !masterdataCanEdit ||
      !u12Ready || !u12Groups.some((group) => group.id === groupId)) return;
  if (!(await u12FlushChanges())) return;
  // Load the authorized masterdata snapshot first without navigating away.
  // Its existing edit permission also gates this U12 shortcut.
  if (!(await loadMasterdata())) {
    showMessage(u12Ui.message, "Stammdaten konnten nicht geladen werden.");
    return;
  }
  // Keep the U12 attendance page behind the shared athlete dialog. The
  // dialog is portalled to the body for visibility while masterdata is hidden.
  openNewMasterdataAthlete({
    source: "u12", groupId, startedOn,
  });
}

function prepareU12View() {
  if (u12FollowGroupCalendar) {
    u12CalendarWeekCache = new Map();
    // Returning from the group-calendar editor must refresh existing options,
    // unless a draft is pending (never discard unsaved attendance).
    if (u12Ready && u12Ui.group?.value && !u12Loading &&
        !u12Saving && !u12CalendarBusy && u12DirtyDates.size === 0) {
      void loadU12Attendance();
    }
    return;
  }
  if (u12Ready && u12Ui.group?.value && u12Ui.date?.value &&
      !u12Snapshot && !u12Loading) void loadU12Attendance();
}

// Only a confirmed offline state pauses unsent autosaves. A failed in-flight
// request may have reached the server: never blindly replay that draft.
window.addEventListener("offline", () => {
  if (u12AutoSaveTimer !== null) clearTimeout(u12AutoSaveTimer);
  u12AutoSaveTimer = null;
  if (u12DirtyDates.size > 0) {
    showMessage(u12Ui.message,
      "Keine Internetverbindung. Ungespeicherte Änderungen bleiben nur in " +
      "dieser geöffneten Ansicht erhalten.");
  }
  refreshU12Controls();
});
window.addEventListener("online", () => {
  if (u12DirtyDates.size > 0 && !u12AutoSaveFailed &&
      !u12Conflict && !u12Saving && !u12IsOffline()) {
    showMessage(u12Ui.message, "");
    scheduleU12AutoSave();
  }
  refreshU12Controls();
});
window.addEventListener("beforeunload", (event) => {
  if (!u12DirtyDates.size) return;
  // Browser-controlled confirmation only; do not put personal data into storage.
  event.preventDefault();
  event.returnValue = "";
});
u12Ui.prev?.addEventListener("click", () => void u12MoveDate(-1));
u12Ui.next?.addEventListener("click", () => void u12MoveDate(1));
u12Ui.today?.addEventListener("click", () => void u12GoToday());
u12Ui.addAthlete?.addEventListener("click", () => void openU12NewAthlete());
u12Ui.statsOpen?.addEventListener("click", () => openU12Statistics());
u12Ui.statsClose?.addEventListener("click", () => u12Ui.statsDialog?.close());
u12Ui.statsDialog?.addEventListener("close", () => {
  u12StatisticsLoadId += 1;
  u12StatisticsExport = null;
  if (u12Ui.statsExport) u12Ui.statsExport.disabled = true;
});
u12Ui.statsExport?.addEventListener("click", exportU12StatisticsCsv);
u12Ui.statsFilter?.addEventListener("submit", (event) => {
  event.preventDefault();
  void loadU12Statistics();
});
u12Ui.statsDialog?.addEventListener("click", (event) => {
  const tab = event.target?.closest?.("[data-u12-stats-tab]");
  if (tab) selectU12StatisticsTab(tab.dataset.u12StatsTab || "");
});
u12Ui.detailsClose?.addEventListener("click", () => u12Ui.detailsDialog?.close());
u12Ui.days?.addEventListener("click", (event) => {
  const info = event.target?.closest?.("[data-u12-info-id]");
  if (info && u12Ui.days.contains(info)) openU12AthleteDetails(info.dataset.u12InfoId);
});
u12Ui.date?.addEventListener("change", () => void u12ChangeDate());
u12Ui.group?.addEventListener("change", () => void u12ChangeGroup());
u12Ui.save?.addEventListener("click", () => {
  u12AutoSaveFailed = false;
  void saveU12Attendance();
});
u12Ui.note?.addEventListener("input", (event) => {
  if (!u12EditableDraft()) return;
  u12Note = event.target.value;
  markU12DraftDirty();
});
u12Ui.trainerRows?.addEventListener("change", (event) => {
  const input = event.target;
  const trainerId = input?.dataset?.u12TrainerId;
  if (!trainerId || !u12EditableDraft() ||
      !u12Snapshot?.trainers?.some((trainer) => trainer.trainerId === trainerId)) return;
  if (input.checked) u12TrainerPresent.add(trainerId);
  else u12TrainerPresent.delete(trainerId);
  markU12DraftDirty();
});
u12Ui.contentAdd?.addEventListener("click", () => addU12Content());
u12Ui.contentAssign?.addEventListener("click", () => openU12AssignmentDialog());
u12Ui.assignmentClose?.addEventListener("click", () => u12Ui.matrixSection?.close());
u12Ui.assignmentDone?.addEventListener("click", () => u12Ui.matrixSection?.close());
u12Ui.contentRows?.addEventListener("click", (event) => {
  const remove = event.target?.closest?.("[data-u12-remove-index]");
  if (remove && u12Ui.contentRows.contains(remove)) {
    removeU12Content(Number(remove.dataset.u12RemoveIndex));
  }
});
u12Ui.contentRows?.addEventListener("change", (event) => {
  const select = event.target;
  if (!select || !Object.prototype.hasOwnProperty.call(select.dataset, "u12CodeIndex")) return;
  const index = Number(select.dataset.u12CodeIndex);
  const item = u12ContentItems[index];
  if (!Number.isInteger(index) || index < 0 || index >= u12ContentTitles.length ||
      !item || !u12EditableDraft()) return;
  const standard = U12_STANDARD_CONTENT_CATALOG.find((entry) => entry.code === select.value);
  if (!standard) return;
  const oldTitle = u12ContentTitles[index]?.trim() || "";
  // When reclassifying legacy free text, keep its former title as part of
  // the optional detail and retain any existing detail too.
  if (!item.code && oldTitle) {
    const previousDetail = item.detail.trim();
    item.detail = (previousDetail && previousDetail !== oldTitle
      ? oldTitle + " · " + previousDetail : oldTitle).slice(0, 200);
  }
  item.code = standard.code;
  u12ContentTitles[index] = standard.label;
  renderU12ContentRows();
  renderU12AssignmentMatrix();
  markU12DraftDirty();
});
u12Ui.contentRows?.addEventListener("input", (event) => {
  const input = event.target;
  if (!input || !Object.prototype.hasOwnProperty.call(input.dataset, "u12DetailIndex")) return;
  const index = Number(input.dataset.u12DetailIndex);
  if (!Number.isInteger(index) || index < 0 || index >= u12ContentTitles.length ||
      u12Loading || u12CalendarBusy || !u12WriteAllowed || u12Conflict ||
      u12Snapshot?.session?.state === "cancelled") return;
  u12ContentItems[index].detail = input.value;
  markU12DraftDirty();
});
u12Ui.matrix?.addEventListener("change", (event) => {
  const input = event.target;
  if (!input || input.type !== "checkbox") return;
  if (Object.prototype.hasOwnProperty.call(input.dataset, "u12MatrixAll")) {
    changeU12MatrixColumn(Number(input.dataset.u12MatrixAll), input.checked === true);
  } else if (Object.prototype.hasOwnProperty.call(input.dataset, "u12MatrixAthlete")) {
    changeU12MatrixAssignment(
      input.dataset.u12MatrixAthlete,
      Number(input.dataset.u12MatrixSlot),
      input.checked === true,
    );
  }
  refreshU12MatrixControls();
});
u12Ui.reload?.addEventListener("click", () => void u12ReloadAttendance());
u12Ui.days?.addEventListener("change", (event) => {
  const input = event.target;
  const athleteId = input?.dataset?.u12AthleteId;
  if (!athleteId || !u12Snapshot || u12Loading || u12CalendarBusy ||
      !u12WriteAllowed || u12Conflict ||
      u12Snapshot.session?.state === "cancelled" ||
      !u12Snapshot.participants.some((person) => person.athleteId === athleteId)) return;
  u12Present.set(athleteId, input.checked === true);
  u12TouchedAthletes.add(athleteId);
  if (!input.checked) u12ContentAssignments.set(athleteId, new Set());
  renderU12AssignmentMatrix();
  // Update just the count/status: no DOM rebuild and no lost checkbox focus.
  markU12DraftDirty();
});
`;
