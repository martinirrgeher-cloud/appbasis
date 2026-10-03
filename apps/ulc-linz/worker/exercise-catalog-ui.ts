export const ULC_EXERCISE_CATALOG_HTML = `
          <section class="app-section" data-app-section="exercise-catalog" id="exercise-catalog" hidden>
            <section class="hero exercise-catalog-hero">
              <div>
                <p class="eyebrow">Training</p>
                <h1>Übungskatalog</h1>
                <p class="summary">Übungen suchen, filtern, favorisieren und für die Trainingsplanung vorbereiten.</p>
              </div>
              <div class="exercise-catalog-hero-actions">
                <input id="exercise-catalog-import-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden />
                <button class="button button--secondary" id="exercise-catalog-import-open" type="button" hidden disabled>Import prüfen</button>
                <button class="button button--secondary" id="exercise-catalog-template" type="button" disabled>Importvorlage</button>
                <button class="button button--secondary" id="exercise-catalog-export" type="button" disabled>Export</button>
                <button class="button button--primary" id="exercise-catalog-new" type="button" hidden>Neue Übung</button>
              </div>
            </section>

            <p class="message message--error" id="exercise-catalog-message" role="alert" hidden></p>
            <p class="message message--success" id="exercise-catalog-success" role="status" hidden></p>

            <section class="card exercise-catalog-commandbar" aria-label="Übungskatalog durchsuchen">
              <label class="exercise-catalog-search">Suche
                <input id="exercise-catalog-search" type="search" maxlength="160" placeholder="Name, Ziel, Unterkategorie, Material …" autocomplete="off" />
              </label>
              <button class="button button--secondary exercise-catalog-filter-toggle" id="exercise-catalog-filter-toggle" type="button" aria-expanded="false" aria-controls="exercise-catalog-filter-sheet">
                Filter
                <span class="exercise-catalog-filter-badge" id="exercise-catalog-filter-badge" hidden>0</span>
              </button>
            </section>

            <section class="exercise-catalog-workspace">
              <section class="card exercise-catalog-list-card">
                <div class="section-heading">
                  <div>
                    <p class="eyebrow">Übungen</p>
                    <h2>Katalog</h2>
                  </div>
                  <span id="exercise-catalog-count">0</span>
                </div>
                <div class="exercise-catalog-list" id="exercise-catalog-list" aria-live="polite"></div>
              </section>
            </section>

            <button class="exercise-catalog-overlay-scrim" id="exercise-catalog-filter-scrim" type="button" aria-label="Filter schließen" hidden></button>
            <section class="exercise-catalog-filter-sheet" id="exercise-catalog-filter-sheet" role="dialog" aria-modal="true" aria-labelledby="exercise-catalog-filter-title" hidden>
              <header class="exercise-catalog-overlay-header">
                <div>
                  <p class="eyebrow">Katalog</p>
                  <h2 id="exercise-catalog-filter-title">Filter</h2>
                </div>
                <button class="button button--secondary exercise-catalog-overlay-close" id="exercise-catalog-filter-close" type="button" aria-label="Filter schließen">Schließen</button>
              </header>
              <div class="exercise-catalog-filter-grid">
                <label>Kategorie
                  <select id="exercise-catalog-category-filter"></select>
                </label>
                <label>Trainingsgruppe
                  <select id="exercise-catalog-group-filter"></select>
                </label>
                <label>Material
                  <input id="exercise-catalog-material-filter" maxlength="80" placeholder="z. B. Hürden" autocomplete="off" />
                </label>
                <label>Favoriten
                  <select id="exercise-catalog-favorite-filter">
                    <option value="all">Alle</option>
                    <option value="favorite">Nur Favoriten</option>
                  </select>
                </label>
                <label>Status
                  <select id="exercise-catalog-status-filter">
                    <option value="active">Aktiv</option>
                    <option value="archived">Archiv</option>
                    <option value="all">Alle</option>
                  </select>
                </label>
                <label>Video / Link
                  <select id="exercise-catalog-video-filter">
                    <option value="all">Alle</option>
                    <option value="with">Mit Link</option>
                    <option value="without">Ohne Link</option>
                  </select>
                </label>
              </div>
              <footer class="exercise-catalog-filter-actions">
                <button class="button button--secondary" id="exercise-catalog-filter-reset" type="button">Zurücksetzen</button>
                <button class="button button--primary" id="exercise-catalog-filter-apply" type="button">Anwenden</button>
              </footer>
            </section>

            <div class="exercise-catalog-editor-backdrop" id="exercise-catalog-import-preview" hidden>
              <section class="exercise-catalog-editor-dialog exercise-catalog-import-dialog" role="dialog" aria-modal="true" aria-labelledby="exercise-catalog-import-title">
                <header class="exercise-catalog-overlay-header">
                  <div>
                    <p class="eyebrow">Import</p>
                    <h2 id="exercise-catalog-import-title">Importvorschau</h2>
                  </div>
                  <button class="button button--secondary exercise-catalog-overlay-close" id="exercise-catalog-import-close" type="button" aria-label="Importvorschau schließen">Schließen</button>
                </header>
                <div class="exercise-catalog-import-body">
                  <p class="exercise-catalog-import-notice" id="exercise-catalog-import-notice">Vorschau: Erst nach ausdrücklicher Bestätigung werden gültige neue oder geänderte Übungen angewendet.</p>
                  <div class="exercise-catalog-import-summary" id="exercise-catalog-import-summary"></div>
                  <div class="exercise-catalog-import-issues" id="exercise-catalog-import-issues"></div>
                  <div class="exercise-catalog-import-rows" id="exercise-catalog-import-rows"></div>
                </div>
                <footer class="exercise-catalog-form-actions">
                  <button class="button button--secondary" id="exercise-catalog-import-log" type="button" hidden>Protokoll herunterladen</button>
                  <button class="button button--primary" id="exercise-catalog-import-apply" type="button" disabled>Import anwenden</button>
                </footer>
              </section>
            </div>

            <div class="exercise-catalog-editor-backdrop" id="exercise-catalog-editor" hidden>
              <section class="exercise-catalog-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="exercise-catalog-editor-title">
                <header class="exercise-catalog-overlay-header exercise-catalog-editor-header">
                  <div>
                    <p class="eyebrow" id="exercise-catalog-editor-eyebrow">Übung</p>
                    <h2 id="exercise-catalog-editor-title">Details</h2>
                  </div>
                  <button class="button button--secondary exercise-catalog-overlay-close" id="exercise-catalog-close" type="button" aria-label="Übungseditor schließen">Schließen</button>
                </header>

                <nav class="exercise-catalog-editor-tabs" aria-label="Übungsbereiche">
                  <button type="button" class="is-active" data-exercise-catalog-tab="basis" aria-selected="true">Basis</button>
                  <button type="button" data-exercise-catalog-tab="instructions" aria-selected="false">Anleitung</button>
                  <button type="button" data-exercise-catalog-tab="groups" aria-selected="false">Gruppen</button>
                  <button type="button" data-exercise-catalog-tab="parameters" aria-selected="false">Parameter</button>
                </nav>

                <form id="exercise-catalog-form" class="exercise-catalog-editor-form">
                  <div class="exercise-catalog-editor-body">
                    <section class="exercise-catalog-import-review" id="exercise-catalog-import-review" hidden>
                      <strong>Importprüfung</strong>
                      <div id="exercise-catalog-import-review-issues"></div>
                    </section>
                    <section class="exercise-catalog-editor-panel" data-exercise-catalog-panel="basis">
                      <div class="exercise-catalog-form-grid">
                        <label class="exercise-catalog-wide">Name
                          <input id="exercise-catalog-name" minlength="2" maxlength="120" required />
                        </label>
                        <label>Kategorie
                          <select id="exercise-catalog-category" required></select>
                        </label>
                        <label>Unterkategorie
                          <input id="exercise-catalog-subcategory" maxlength="100" />
                        </label>
                        <label class="exercise-catalog-wide">Trainingsziel
                          <input id="exercise-catalog-goal" maxlength="240" />
                        </label>
                        <label class="exercise-catalog-wide">Material
                          <input id="exercise-catalog-equipment" maxlength="2000" placeholder="Kommagetrennt, z. B. Hütchen, Minihürden" />
                        </label>
                      </div>
                    </section>

                    <section class="exercise-catalog-editor-panel" data-exercise-catalog-panel="instructions" hidden>
                      <div class="exercise-catalog-form-grid">
                        <label class="exercise-catalog-wide">Beschreibung / Ausführung
                          <textarea id="exercise-catalog-description" maxlength="10000" rows="5"></textarea>
                        </label>
                        <label class="exercise-catalog-wide">Trainerhinweise
                          <textarea id="exercise-catalog-cues" maxlength="10000" rows="4"></textarea>
                        </label>
                        <label class="exercise-catalog-wide">Typische Fehler
                          <textarea id="exercise-catalog-mistakes" maxlength="10000" rows="4"></textarea>
                        </label>
                        <label class="exercise-catalog-wide">Video- / Weblink
                          <input id="exercise-catalog-video-url" type="url" maxlength="2000" inputmode="url" placeholder="https://…" />
                        </label>
                        <div class="exercise-catalog-link-row exercise-catalog-wide" id="exercise-catalog-link-row" hidden>
                          <a id="exercise-catalog-link" rel="noopener noreferrer" target="_blank">Link öffnen</a>
                        </div>
                      </div>
                    </section>

                    <section class="exercise-catalog-editor-panel" data-exercise-catalog-panel="groups" hidden>
                      <fieldset class="exercise-catalog-fieldset">
                        <legend>Geeignete Trainingsgruppen</legend>
                        <p class="exercise-catalog-panel-hint">Keine Auswahl bedeutet: vereinsweit bzw. für alle Gruppen geeignet.</p>
                        <div class="exercise-catalog-check-grid" id="exercise-catalog-groups"></div>
                      </fieldset>
                    </section>

                    <section class="exercise-catalog-editor-panel" data-exercise-catalog-panel="parameters" hidden>
                      <fieldset class="exercise-catalog-fieldset">
                        <div class="exercise-catalog-parameter-heading">
                          <legend>Planungsparameter</legend>
                          <div class="exercise-catalog-parameter-add">
                            <select id="exercise-catalog-parameter-select" aria-label="Planungsparameter auswählen"></select>
                            <button class="button button--secondary" id="exercise-catalog-parameter-add" type="button">Hinzufügen</button>
                          </div>
                        </div>
                        <div class="exercise-catalog-parameters" id="exercise-catalog-parameters"></div>
                      </fieldset>
                    </section>

                    <p class="exercise-catalog-readonly" id="exercise-catalog-readonly" hidden>Nur-Lese-Zugriff: Favoriten können weiterhin gesetzt werden.</p>
                  </div>

                  <footer class="exercise-catalog-form-actions">
                    <button class="button button--danger" id="exercise-catalog-deactivate" type="button" hidden>Deaktivieren</button>
                    <button class="button button--primary" id="exercise-catalog-save" type="submit">Speichern</button>
                  </footer>
                </form>
              </section>
            </div>
          </section>
`;

export const ULC_EXERCISE_CATALOG_CSS = `
.exercise-catalog-hero {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 12px;
}
.exercise-catalog-hero .button { flex: 0 0 auto; }
.exercise-catalog-hero-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
.exercise-catalog-filters {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 14px;
  padding: 12px;
}
.exercise-catalog-search { grid-column: 1 / -1; }
.exercise-catalog-workspace { display: grid; gap: 14px; }
.exercise-catalog-list-card,
.exercise-catalog-editor { padding: 14px; }
.exercise-catalog-list { display: grid; gap: 8px; margin-top: 12px; }
.exercise-catalog-empty {
  padding: 22px 12px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--control-radius);
  color: var(--secondary);
  text-align: center;
}
.exercise-catalog-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 44px;
  gap: 8px;
  align-items: stretch;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: white;
}
.exercise-catalog-row[data-active="false"] { background: var(--muted); }
.exercise-catalog-row__main {
  display: grid;
  gap: 6px;
  min-width: 0;
  border: 0;
  background: transparent;
  padding: 10px 8px 10px 12px;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.exercise-catalog-row__title {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}
.exercise-catalog-row__title strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.exercise-catalog-badge {
  flex: 0 0 auto;
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--muted);
  color: var(--secondary);
  font-size: .66rem;
  font-weight: 800;
}
.exercise-catalog-badge--archived {
  background: var(--danger-surface);
  color: var(--danger);
}
.exercise-catalog-row__meta,
.exercise-catalog-row__info {
  overflow: hidden;
  color: var(--secondary);
  font-size: .74rem;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.exercise-catalog-favorite {
  display: grid;
  width: 44px;
  min-height: 44px;
  place-items: center;
  align-self: center;
  border: 0;
  border-left: 1px solid var(--border);
  background: transparent;
  color: #64748b;
  font-size: 1.25rem;
  cursor: pointer;
}
.exercise-catalog-favorite[aria-pressed="true"] { color: #b45309; }
.exercise-catalog-editor-heading { align-items: start; }
.exercise-catalog-form-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  margin-top: 14px;
}
.exercise-catalog-fieldset {
  min-width: 0;
  margin: 16px 0 0;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
}
.exercise-catalog-fieldset legend {
  padding: 0 4px;
  color: var(--text);
  font-size: .82rem;
  font-weight: 850;
}
.exercise-catalog-check-grid { display: grid; gap: 7px; }
.exercise-catalog-check {
  display: flex;
  min-height: 38px;
  align-items: center;
  gap: 8px;
  color: var(--text);
  font-size: .8rem;
  font-weight: 700;
}
.exercise-catalog-check input { width: 20px; min-height: 20px; margin: 0; }
.exercise-catalog-parameter-heading {
  display: grid;
  gap: 8px;
}
.exercise-catalog-parameter-add {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}
.exercise-catalog-parameters { display: grid; gap: 10px; margin-top: 10px; }
.exercise-catalog-parameter {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--muted);
}
.exercise-catalog-parameter__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.exercise-catalog-parameter__top strong { font-size: .82rem; }
.exercise-catalog-parameter__fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.exercise-catalog-parameter__required {
  display: flex;
  min-height: 44px;
  align-items: center;
  gap: 8px;
}
.exercise-catalog-parameter__required input {
  width: 20px;
  min-height: 20px;
  margin: 0;
}
.exercise-catalog-remove {
  min-height: 36px;
  padding: 0 10px;
}
.exercise-catalog-form-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
}
.button--danger {
  border: 1px solid #fecaca;
  background: white;
  color: var(--danger);
}
.exercise-catalog-link-row { margin-top: 12px; }
.exercise-catalog-link-row a {
  color: var(--accent);
  font-size: .82rem;
  font-weight: 800;
}
.exercise-catalog-readonly {
  margin: 12px 0 0;
  color: var(--secondary);
  font-size: .78rem;
}
@media (min-width: 640px) {
  .exercise-catalog-filters { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .exercise-catalog-search { grid-column: 1 / -1; }
  .exercise-catalog-form-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .exercise-catalog-wide { grid-column: 1 / -1; }
  .exercise-catalog-check-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .exercise-catalog-parameter-heading {
    grid-template-columns: minmax(0, 1fr) minmax(250px, 1fr);
    align-items: end;
  }
}
@media (min-width: 960px) {
  .exercise-catalog-workspace {
    grid-template-columns: minmax(320px, .8fr) minmax(0, 1.2fr);
    align-items: start;
  }
  .exercise-catalog-list-card {
    position: sticky;
    top: 118px;
    max-height: calc(100vh - 140px);
    overflow: auto;
  }
}
/* E6C UX polish: compact catalog page, overlay filters and a separated editor. */
.exercise-catalog-commandbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: end;
  margin-bottom: 12px;
  padding: 10px;
}
.exercise-catalog-commandbar .exercise-catalog-search { grid-column: auto; }
.exercise-catalog-filter-toggle {
  position: relative;
  min-width: 92px;
}
.exercise-catalog-filter-badge {
  display: inline-grid;
  min-width: 20px;
  height: 20px;
  place-items: center;
  margin-left: 4px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--accent);
  color: white;
  font-size: .7rem;
  font-weight: 900;
}
.exercise-catalog-filter-badge[hidden] { display: none; }
.exercise-catalog-workspace { display: block; }
.exercise-catalog-list-card {
  position: static;
  max-height: none;
  overflow: visible;
  padding: 14px;
}
.exercise-catalog-overlay-scrim {
  position: fixed;
  z-index: 59;
  inset: 0;
  border: 0;
  background: rgb(15 23 42 / 42%);
}
.exercise-catalog-overlay-scrim[hidden] { display: none; }
.exercise-catalog-filter-sheet {
  position: fixed;
  z-index: 60;
  right: 8px;
  bottom: calc(70px + env(safe-area-inset-bottom));
  left: 8px;
  display: grid;
  max-height: min(74dvh, 680px);
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: white;
  box-shadow: 0 24px 70px rgb(15 23 42 / 28%);
}
.exercise-catalog-filter-sheet[hidden] { display: none; }
.exercise-catalog-overlay-header {
  position: sticky;
  z-index: 2;
  top: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  background: rgb(255 255 255 / 97%);
  backdrop-filter: blur(10px);
}
.exercise-catalog-overlay-header h2 { margin: 0; }
.exercise-catalog-overlay-header .eyebrow { margin-bottom: 2px; }
.exercise-catalog-overlay-close { flex: 0 0 auto; }
.exercise-catalog-filter-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  overflow-y: auto;
  padding: 14px;
}
.exercise-catalog-filter-grid label {
  min-width: 0;
  display: grid;
  gap: 5px;
  color: var(--secondary);
  font-size: .76rem;
  font-weight: 800;
}
.exercise-catalog-filter-grid input,
.exercise-catalog-filter-grid select {
  width: 100%;
  min-height: 44px;
}
.exercise-catalog-filter-actions {
  position: sticky;
  bottom: 0;
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 8px;
  padding: 10px 14px calc(10px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--border);
  background: rgb(255 255 255 / 97%);
}
.exercise-catalog-editor-backdrop {
  position: fixed;
  z-index: 70;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 18px;
  background: rgb(15 23 42 / 48%);
}
.exercise-catalog-editor-backdrop[hidden] { display: none; }
.exercise-catalog-editor-dialog {
  width: min(920px, 100%);
  max-height: min(92dvh, 900px);
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: white;
  box-shadow: 0 28px 90px rgb(15 23 42 / 34%);
}
.exercise-catalog-editor-header { position: relative; }
.exercise-catalog-editor-header h2 {
  max-width: min(68vw, 620px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.exercise-catalog-editor-tabs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 4px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--muted);
}
.exercise-catalog-editor-tabs button {
  min-height: 42px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--secondary);
  font: inherit;
  font-size: .76rem;
  font-weight: 850;
  cursor: pointer;
}
.exercise-catalog-editor-tabs button.is-active {
  background: white;
  color: var(--accent);
  box-shadow: 0 1px 5px rgb(15 23 42 / 10%);
}
.exercise-catalog-editor-form {
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
}
.exercise-catalog-editor-body {
  min-height: 0;
  overflow-y: auto;
}
.exercise-catalog-editor-panel { padding: 14px; }
.exercise-catalog-editor-panel[hidden] { display: none; }
.exercise-catalog-editor-panel .exercise-catalog-form-grid { margin-top: 0; }
.exercise-catalog-editor-panel .exercise-catalog-fieldset { margin-top: 0; }
.exercise-catalog-panel-hint {
  margin: 0 0 10px;
  color: var(--secondary);
  font-size: .78rem;
}
.exercise-catalog-form-actions {
  position: sticky;
  bottom: 0;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin: 0;
  padding: 10px 14px calc(10px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--border);
  background: rgb(255 255 255 / 97%);
  backdrop-filter: blur(10px);
}
body.exercise-catalog-filter-open,
body.exercise-catalog-editor-open { overflow: hidden; }

@media (max-width: 639px) {
  .exercise-catalog-hero .summary { display: none; }
  .exercise-catalog-hero { align-items: center; }
  .exercise-catalog-commandbar { grid-template-columns: minmax(0, 1fr) 88px; }
  .exercise-catalog-commandbar .exercise-catalog-search input { font-size: 16px; }
  .exercise-catalog-filter-sheet {
    right: 6px;
    bottom: calc(64px + env(safe-area-inset-bottom));
    left: 6px;
    max-height: 78dvh;
  }
  .exercise-catalog-filter-grid { grid-template-columns: 1fr 1fr; padding: 12px; }
  .exercise-catalog-filter-grid input,
  .exercise-catalog-filter-grid select { font-size: 16px; }
  .exercise-catalog-editor-backdrop {
    place-items: stretch;
    padding: 0;
    background: white;
  }
  .exercise-catalog-editor-dialog {
    width: 100%;
    max-height: 100dvh;
    min-height: 100dvh;
    border: 0;
    border-radius: 0;
    box-shadow: none;
  }
  .exercise-catalog-overlay-header {
    padding-top: max(12px, env(safe-area-inset-top));
  }
  .exercise-catalog-editor-header h2 { max-width: 62vw; font-size: 1.08rem; }
  .exercise-catalog-editor-tabs {
    position: sticky;
    top: 0;
    z-index: 2;
    padding: 6px;
  }
  .exercise-catalog-editor-tabs button {
    min-height: 44px;
    padding: 4px;
    font-size: .72rem;
  }
  .exercise-catalog-editor-panel { padding: 12px; }
  .exercise-catalog-form-grid { grid-template-columns: 1fr; }
  .exercise-catalog-wide { grid-column: auto; }
  .exercise-catalog-form-grid input,
  .exercise-catalog-form-grid select,
  .exercise-catalog-form-grid textarea { font-size: 16px; }
  .exercise-catalog-form-actions > .button { flex: 1; }
}

@media (min-width: 640px) {
  .exercise-catalog-filter-sheet {
    right: max(18px, calc((100vw - 760px) / 2));
    left: max(18px, calc((100vw - 760px) / 2));
  }
}
.exercise-catalog-import-dialog {
  grid-template-rows: auto minmax(0, 1fr) auto;
}
.exercise-catalog-import-body {
  min-height: 0;
  overflow-y: auto;
  padding: 14px;
}
.exercise-catalog-import-notice {
  margin: 0 0 12px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--muted);
  color: var(--secondary);
  font-size: .8rem;
}
.exercise-catalog-import-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}
.exercise-catalog-import-summary > div {
  padding: 9px;
  border: 1px solid var(--border);
  border-radius: 10px;
  text-align: center;
}
.exercise-catalog-import-summary strong,
.exercise-catalog-import-summary span { display: block; }
.exercise-catalog-import-summary strong { font-size: 1rem; }
.exercise-catalog-import-summary span {
  margin-top: 2px;
  color: var(--secondary);
  font-size: .7rem;
  font-weight: 750;
}
.exercise-catalog-import-issues,
.exercise-catalog-import-review-issues {
  display: grid;
  gap: 6px;
}
.exercise-catalog-import-issue {
  margin: 0;
  padding: 8px 10px;
  border-radius: 9px;
  background: var(--muted);
  color: var(--secondary);
  font-size: .76rem;
}
.exercise-catalog-import-issue[data-level="error"] {
  background: var(--danger-surface);
  color: var(--danger);
}
.exercise-catalog-import-rows {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}
.exercise-catalog-import-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 11px;
  background: white;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.exercise-catalog-import-row__main {
  min-width: 0;
  display: grid;
  gap: 3px;
}
.exercise-catalog-import-row__main strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.exercise-catalog-import-row__meta {
  color: var(--secondary);
  font-size: .72rem;
}
.exercise-catalog-import-action {
  padding: 3px 7px;
  border-radius: 999px;
  background: var(--muted);
  color: var(--secondary);
  font-size: .68rem;
  font-weight: 850;
}
.exercise-catalog-import-action[data-action="create"] {
  background: #ecfdf5;
  color: #047857;
}
.exercise-catalog-import-action[data-action="update"] {
  background: #eff6ff;
  color: #1d4ed8;
}
.exercise-catalog-import-action[data-reason="invalid"] {
  background: var(--danger-surface);
  color: var(--danger);
}
.exercise-catalog-import-review {
  margin: 12px 14px 0;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--muted);
}
.exercise-catalog-import-review > strong {
  display: block;
  margin-bottom: 7px;
}
body.exercise-catalog-filter-open,
body.exercise-catalog-editor-open,
body.exercise-catalog-import-open { overflow: hidden; }

`;

export const ULC_EXERCISE_CATALOG_SCRIPT = String.raw`
const EXERCISE_CATEGORIES = Object.freeze([
  { key: "warmup", label: "Aufwärmen & Lauf-ABC" },
  { key: "acceleration", label: "Beschleunigung" },
  { key: "max_velocity", label: "Maximalgeschwindigkeit" },
  { key: "speed_endurance", label: "Schnelligkeitsausdauer" },
  { key: "start_reaction", label: "Start & Reaktion" },
  { key: "technique", label: "Technik" },
  { key: "plyometrics", label: "Plyometrie" },
  { key: "strength", label: "Kraft" },
  { key: "stability", label: "Stabilisation" },
  { key: "regeneration", label: "Regeneration" },
  { key: "other", label: "Sonstiges" },
]);

const EXERCISE_PARAMETER_META = Object.freeze([
  { key: "sets", label: "Sätze", unit: "", inputType: "number" },
  { key: "repetitions", label: "Wiederholungen", unit: "", inputType: "number" },
  { key: "distance_m", label: "Distanz", unit: "m", inputType: "number" },
  { key: "weight_kg", label: "Gewicht", unit: "kg", inputType: "number" },
  { key: "duration_s", label: "Dauer", unit: "s", inputType: "number" },
  { key: "target_time_s", label: "Zielzeit", unit: "s", inputType: "number" },
  { key: "intensity_percent", label: "Intensität", unit: "%", inputType: "number" },
  { key: "rest_s", label: "Pause", unit: "s", inputType: "number" },
  { key: "series_rest_s", label: "Serienpause", unit: "s", inputType: "number" },
  { key: "approach_distance_m", label: "Anlauf", unit: "m", inputType: "number" },
  { key: "flying_distance_m", label: "Fliegende Distanz", unit: "m", inputType: "number" },
  { key: "contacts", label: "Kontakte", unit: "", inputType: "number" },
  { key: "resistance_kg", label: "Widerstand", unit: "kg", inputType: "number" },
  { key: "height_cm", label: "Höhe", unit: "cm", inputType: "number" },
  { key: "tempo_text", label: "Tempo", unit: "", inputType: "text" },
  { key: "surface_text", label: "Untergrund", unit: "", inputType: "text" },
  { key: "start_position_text", label: "Startposition", unit: "", inputType: "text" },
  { key: "note_text", label: "Zusatzhinweis", unit: "", inputType: "text" },
]);

Object.assign(elements, {
  exerciseCatalogQuickAction: document.querySelector("#exercise-catalog-quick-action"),
  exerciseCatalogAccessLabel: document.querySelector("#exercise-catalog-access-label"),
  exerciseCatalogImportOpen: document.querySelector("#exercise-catalog-import-open"),
  exerciseCatalogImportFile: document.querySelector("#exercise-catalog-import-file"),
  exerciseCatalogImportPreview: document.querySelector("#exercise-catalog-import-preview"),
  exerciseCatalogImportClose: document.querySelector("#exercise-catalog-import-close"),
  exerciseCatalogImportNotice: document.querySelector("#exercise-catalog-import-notice"),
  exerciseCatalogImportApply: document.querySelector("#exercise-catalog-import-apply"),
  exerciseCatalogImportLog: document.querySelector("#exercise-catalog-import-log"),
  exerciseCatalogImportSummary: document.querySelector("#exercise-catalog-import-summary"),
  exerciseCatalogImportIssues: document.querySelector("#exercise-catalog-import-issues"),
  exerciseCatalogImportRows: document.querySelector("#exercise-catalog-import-rows"),
  exerciseCatalogImportReview: document.querySelector("#exercise-catalog-import-review"),
  exerciseCatalogImportReviewIssues: document.querySelector("#exercise-catalog-import-review-issues"),
  exerciseCatalogTemplate: document.querySelector("#exercise-catalog-template"),
  exerciseCatalogExport: document.querySelector("#exercise-catalog-export"),
  exerciseCatalogNew: document.querySelector("#exercise-catalog-new"),
  exerciseCatalogMessage: document.querySelector("#exercise-catalog-message"),
  exerciseCatalogSuccess: document.querySelector("#exercise-catalog-success"),
  exerciseCatalogSearch: document.querySelector("#exercise-catalog-search"),
  exerciseCatalogFilterToggle: document.querySelector("#exercise-catalog-filter-toggle"),
  exerciseCatalogFilterBadge: document.querySelector("#exercise-catalog-filter-badge"),
  exerciseCatalogFilterScrim: document.querySelector("#exercise-catalog-filter-scrim"),
  exerciseCatalogFilterSheet: document.querySelector("#exercise-catalog-filter-sheet"),
  exerciseCatalogFilterClose: document.querySelector("#exercise-catalog-filter-close"),
  exerciseCatalogFilterReset: document.querySelector("#exercise-catalog-filter-reset"),
  exerciseCatalogFilterApply: document.querySelector("#exercise-catalog-filter-apply"),
  exerciseCatalogCategoryFilter: document.querySelector("#exercise-catalog-category-filter"),
  exerciseCatalogGroupFilter: document.querySelector("#exercise-catalog-group-filter"),
  exerciseCatalogMaterialFilter: document.querySelector("#exercise-catalog-material-filter"),
  exerciseCatalogFavoriteFilter: document.querySelector("#exercise-catalog-favorite-filter"),
  exerciseCatalogStatusFilter: document.querySelector("#exercise-catalog-status-filter"),
  exerciseCatalogVideoFilter: document.querySelector("#exercise-catalog-video-filter"),
  exerciseCatalogCount: document.querySelector("#exercise-catalog-count"),
  exerciseCatalogList: document.querySelector("#exercise-catalog-list"),
  exerciseCatalogEditor: document.querySelector("#exercise-catalog-editor"),
  exerciseCatalogEditorEyebrow: document.querySelector("#exercise-catalog-editor-eyebrow"),
  exerciseCatalogEditorTitle: document.querySelector("#exercise-catalog-editor-title"),
  exerciseCatalogClose: document.querySelector("#exercise-catalog-close"),
  exerciseCatalogForm: document.querySelector("#exercise-catalog-form"),
  exerciseCatalogName: document.querySelector("#exercise-catalog-name"),
  exerciseCatalogCategory: document.querySelector("#exercise-catalog-category"),
  exerciseCatalogSubcategory: document.querySelector("#exercise-catalog-subcategory"),
  exerciseCatalogGoal: document.querySelector("#exercise-catalog-goal"),
  exerciseCatalogDescription: document.querySelector("#exercise-catalog-description"),
  exerciseCatalogCues: document.querySelector("#exercise-catalog-cues"),
  exerciseCatalogMistakes: document.querySelector("#exercise-catalog-mistakes"),
  exerciseCatalogEquipment: document.querySelector("#exercise-catalog-equipment"),
  exerciseCatalogVideoUrl: document.querySelector("#exercise-catalog-video-url"),
  exerciseCatalogGroups: document.querySelector("#exercise-catalog-groups"),
  exerciseCatalogParameterSelect: document.querySelector("#exercise-catalog-parameter-select"),
  exerciseCatalogParameterAdd: document.querySelector("#exercise-catalog-parameter-add"),
  exerciseCatalogParameters: document.querySelector("#exercise-catalog-parameters"),
  exerciseCatalogLinkRow: document.querySelector("#exercise-catalog-link-row"),
  exerciseCatalogLink: document.querySelector("#exercise-catalog-link"),
  exerciseCatalogSave: document.querySelector("#exercise-catalog-save"),
  exerciseCatalogDeactivate: document.querySelector("#exercise-catalog-deactivate"),
  exerciseCatalogReadonly: document.querySelector("#exercise-catalog-readonly"),
});

let exerciseCatalogReady = false;
let exerciseCatalogCanEdit = false;
let exerciseCatalogItems = [];
let exerciseCatalogGroups = [];
let exerciseCatalogSelectedId = null;
let exerciseCatalogParameterDrafts = [];
let exerciseCatalogBusy = false;
let exerciseCatalogFilterOpen = false;
let exerciseCatalogEditorDirty = false;
let exerciseCatalogEditorTab = "basis";
let exerciseCatalogImportPreviewData = null;
let exerciseCatalogImportPreviewToken = null;
let exerciseCatalogImportFileDraft = null;
let exerciseCatalogImportResultData = null;
let exerciseCatalogEditorReviewMode = false;

function categoryLabel(key) {
  return EXERCISE_CATEGORIES.find((category) => category.key === key)?.label || key;
}

function parameterMeta(key) {
  return EXERCISE_PARAMETER_META.find((parameter) => parameter.key === key) || null;
}

function isExerciseCatalogItem(item) {
  if (
    item === null ||
    typeof item !== "object" ||
    typeof item.id !== "string" ||
    item.id.length === 0 ||
    typeof item.name !== "string" ||
    item.name.length < 2 ||
    !EXERCISE_CATEGORIES.some((category) => category.key === item.categoryKey) ||
    !Array.isArray(item.equipment) ||
    item.equipment.some((value) => typeof value !== "string") ||
    !Array.isArray(item.groupIds) ||
    item.groupIds.some((value) => typeof value !== "string") ||
    !Array.isArray(item.parameters) ||
    typeof item.isActive !== "boolean" ||
    typeof item.isFavorite !== "boolean"
  ) {
    return false;
  }
  for (const parameter of item.parameters) {
    if (
      parameter === null ||
      typeof parameter !== "object" ||
      parameterMeta(parameter.key) === null ||
      typeof parameter.label !== "string" ||
      typeof parameter.unit !== "string" ||
      !["number", "text"].includes(parameter.inputType) ||
      (parameter.defaultValue !== null && typeof parameter.defaultValue !== "string") ||
      (parameter.minValue !== null && typeof parameter.minValue !== "number") ||
      (parameter.maxValue !== null && typeof parameter.maxValue !== "number") ||
      (parameter.stepValue !== null && typeof parameter.stepValue !== "number") ||
      typeof parameter.isRequired !== "boolean" ||
      !Number.isSafeInteger(parameter.sortOrder)
    ) {
      return false;
    }
  }
  return true;
}

function isExerciseCatalogGroup(group) {
  return (
    group !== null &&
    typeof group === "object" &&
    typeof group.id === "string" &&
    group.id.length > 0 &&
    typeof group.name === "string" &&
    group.name.length > 0 &&
    (group.shortName === null || typeof group.shortName === "string") &&
    Number.isSafeInteger(group.sortOrder)
  );
}

async function bootstrapExerciseCatalog() {
  exerciseCatalogReady = false;
  exerciseCatalogCanEdit = false;
  exerciseCatalogItems = [];
  exerciseCatalogGroups = [];
  exerciseCatalogSelectedId = null;
  closeExerciseCatalogEditor(true);
  closeExerciseCatalogImportPreview();
  setExerciseCatalogFilterOpen(false);
  refreshAppAvailability();
  showMessage(elements.exerciseCatalogMessage, "");
  showMessage(elements.exerciseCatalogSuccess, "");

  try {
    const payload = await requestJson("/api/modules/exercise-catalog");
    const items = payload?.catalog?.items;
    const groups = payload?.catalog?.trainingGroups;
    const edit = payload?.access?.edit;
    if (
      payload?.module?.moduleId !== "exercise_catalog" ||
      payload?.access?.view !== true ||
      typeof edit !== "boolean" ||
      !Array.isArray(items) ||
      !items.every(isExerciseCatalogItem) ||
      !Array.isArray(groups) ||
      !groups.every(isExerciseCatalogGroup)
    ) {
      throw new Error("INVALID_EXERCISE_CATALOG_CONTRACT");
    }

    exerciseCatalogReady = true;
    exerciseCatalogCanEdit = edit;
    exerciseCatalogItems = items.slice();
    exerciseCatalogGroups = groups.slice();
    initializeExerciseCatalogFilters();
    renderExerciseCatalogList();
  } catch (error) {
    showMessage(
      elements.exerciseCatalogMessage,
      error?.status === 403
        ? "Für den Übungskatalog fehlt die Berechtigung."
        : "Der Übungskatalog ist derzeit nicht verfügbar.",
    );
  }
  refreshAppAvailability();
}

function initializeExerciseCatalogFilters() {
  replaceExerciseCatalogSelectOptions(
    elements.exerciseCatalogCategoryFilter,
    [{ value: "", label: "Alle Kategorien" }].concat(
      EXERCISE_CATEGORIES.map((category) => ({
        value: category.key,
        label: category.label,
      })),
    ),
  );
  replaceExerciseCatalogSelectOptions(
    elements.exerciseCatalogCategory,
    EXERCISE_CATEGORIES.map((category) => ({
      value: category.key,
      label: category.label,
    })),
  );
  replaceExerciseCatalogSelectOptions(
    elements.exerciseCatalogGroupFilter,
    [{ value: "", label: "Alle Gruppen" }].concat(
      exerciseCatalogGroups.map((group) => ({
        value: group.id,
        label: group.shortName
          ? group.name + " (" + group.shortName + ")"
          : group.name,
      })),
    ),
  );
  renderExerciseCatalogGroupChecks([]);
  renderExerciseCatalogParameterSelect();
}

function replaceExerciseCatalogSelectOptions(select, options) {
  if (!select) return;
  const selected = select.value;
  select.replaceChildren();
  for (const value of options) {
    const option = document.createElement("option");
    option.value = value.value;
    option.textContent = value.label;
    select.append(option);
  }
  if (options.some((option) => option.value === selected)) select.value = selected;
}

function exerciseCatalogActiveFilterCount() {
  return [
    Boolean(elements.exerciseCatalogCategoryFilter?.value),
    Boolean(elements.exerciseCatalogGroupFilter?.value),
    Boolean((elements.exerciseCatalogMaterialFilter?.value || "").trim()),
    (elements.exerciseCatalogFavoriteFilter?.value || "all") !== "all",
    (elements.exerciseCatalogStatusFilter?.value || "active") !== "active",
    (elements.exerciseCatalogVideoFilter?.value || "all") !== "all",
  ].filter(Boolean).length;
}

function updateExerciseCatalogFilterBadge() {
  const count = exerciseCatalogActiveFilterCount();
  if (elements.exerciseCatalogFilterBadge) {
    elements.exerciseCatalogFilterBadge.textContent = String(count);
    elements.exerciseCatalogFilterBadge.hidden = count === 0;
  }
}

function setExerciseCatalogFilterOpen(open) {
  exerciseCatalogFilterOpen = Boolean(open);
  if (elements.exerciseCatalogFilterSheet) {
    elements.exerciseCatalogFilterSheet.hidden = !exerciseCatalogFilterOpen;
  }
  if (elements.exerciseCatalogFilterScrim) {
    elements.exerciseCatalogFilterScrim.hidden = !exerciseCatalogFilterOpen;
  }
  if (elements.exerciseCatalogFilterToggle) {
    elements.exerciseCatalogFilterToggle.setAttribute(
      "aria-expanded",
      exerciseCatalogFilterOpen ? "true" : "false",
    );
  }
  document.body.classList.toggle(
    "exercise-catalog-filter-open",
    exerciseCatalogFilterOpen,
  );
}

function resetExerciseCatalogFilters() {
  if (elements.exerciseCatalogCategoryFilter) elements.exerciseCatalogCategoryFilter.value = "";
  if (elements.exerciseCatalogGroupFilter) elements.exerciseCatalogGroupFilter.value = "";
  if (elements.exerciseCatalogMaterialFilter) elements.exerciseCatalogMaterialFilter.value = "";
  if (elements.exerciseCatalogFavoriteFilter) elements.exerciseCatalogFavoriteFilter.value = "all";
  if (elements.exerciseCatalogStatusFilter) elements.exerciseCatalogStatusFilter.value = "active";
  if (elements.exerciseCatalogVideoFilter) elements.exerciseCatalogVideoFilter.value = "all";
  updateExerciseCatalogFilterBadge();
  renderExerciseCatalogList();
}

function setExerciseCatalogEditorTab(tab) {
  const allowed = ["basis", "instructions", "groups", "parameters"];
  exerciseCatalogEditorTab = allowed.includes(tab) ? tab : "basis";
  for (const control of document.querySelectorAll("[data-exercise-catalog-tab]")) {
    const active = control.dataset.exerciseCatalogTab === exerciseCatalogEditorTab;
    control.classList.toggle("is-active", active);
    control.setAttribute("aria-selected", active ? "true" : "false");
  }
  for (const panel of document.querySelectorAll("[data-exercise-catalog-panel]")) {
    panel.hidden = panel.dataset.exerciseCatalogPanel !== exerciseCatalogEditorTab;
  }
}

function prepareExerciseCatalogView() {
  if (!exerciseCatalogReady) return;
  setExerciseCatalogFilterOpen(false);
  updateExerciseCatalogFilterBadge();
  renderExerciseCatalogList();
  if (elements.exerciseCatalogTemplate) {
    elements.exerciseCatalogTemplate.disabled = exerciseCatalogBusy;
  }
  if (elements.exerciseCatalogExport) {
    elements.exerciseCatalogExport.disabled = exerciseCatalogBusy;
  }
  if (elements.exerciseCatalogImportOpen) {
    elements.exerciseCatalogImportOpen.hidden = !exerciseCatalogCanEdit;
    elements.exerciseCatalogImportOpen.disabled =
      !exerciseCatalogCanEdit || exerciseCatalogBusy;
  }
  if (elements.exerciseCatalogNew) {
    elements.exerciseCatalogNew.hidden = !exerciseCatalogCanEdit;
    elements.exerciseCatalogNew.disabled = !exerciseCatalogCanEdit || exerciseCatalogBusy;
  }
}

function exerciseCatalogFilteredItems() {
  const query = (elements.exerciseCatalogSearch?.value || "").trim().toLocaleLowerCase("de");
  const category = elements.exerciseCatalogCategoryFilter?.value || "";
  const groupId = elements.exerciseCatalogGroupFilter?.value || "";
  const material = (elements.exerciseCatalogMaterialFilter?.value || "").trim().toLocaleLowerCase("de");
  const favorite = elements.exerciseCatalogFavoriteFilter?.value || "all";
  const status = elements.exerciseCatalogStatusFilter?.value || "active";
  const video = elements.exerciseCatalogVideoFilter?.value || "all";

  return exerciseCatalogItems.filter((item) => {
    if (category && item.categoryKey !== category) return false;
    if (groupId && !item.groupIds.includes(groupId)) return false;
    if (favorite === "favorite" && item.isFavorite !== true) return false;
    if (status === "active" && item.isActive !== true) return false;
    if (status === "archived" && item.isActive !== false) return false;
    if (video === "with" && !item.videoUrl) return false;
    if (video === "without" && item.videoUrl) return false;
    if (
      material &&
      !item.equipment.some((value) =>
        value.toLocaleLowerCase("de").includes(material),
      )
    ) return false;
    if (!query) return true;
    const haystack = [
      item.name,
      item.subcategory,
      item.goal,
      item.description,
      item.coachingCues,
      item.commonMistakes,
      ...item.equipment,
    ]
      .filter((value) => typeof value === "string")
      .join(" ")
      .toLocaleLowerCase("de");
    return haystack.includes(query);
  });
}

function renderExerciseCatalogList() {
  updateExerciseCatalogFilterBadge();
  const container = elements.exerciseCatalogList;
  if (!container) return;
  container.replaceChildren();
  const items = exerciseCatalogFilteredItems();
  if (elements.exerciseCatalogCount) {
    elements.exerciseCatalogCount.textContent =
      String(items.length) + " / " + String(exerciseCatalogItems.length);
  }

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "exercise-catalog-empty";
    empty.textContent =
      exerciseCatalogItems.length === 0
        ? "Noch keine Übungen im Katalog."
        : "Keine Übungen entsprechen den aktuellen Filtern.";
    container.append(empty);
    return;
  }

  for (const item of items) {
    const row = document.createElement("article");
    row.className = "exercise-catalog-row";
    row.dataset.active = String(item.isActive);

    const main = document.createElement("button");
    main.type = "button";
    main.className = "exercise-catalog-row__main";
    main.dataset.exerciseCatalogOpen = item.id;

    const title = document.createElement("div");
    title.className = "exercise-catalog-row__title";
    const strong = document.createElement("strong");
    strong.textContent = item.name;
    title.append(strong);
    if (!item.isActive) {
      const archived = document.createElement("span");
      archived.className = "exercise-catalog-badge exercise-catalog-badge--archived";
      archived.textContent = "Archiv";
      title.append(archived);
    }

    const meta = document.createElement("div");
    meta.className = "exercise-catalog-row__meta";
    meta.textContent = [
      categoryLabel(item.categoryKey),
      item.subcategory,
      item.goal,
    ].filter(Boolean).join(" · ");

    const info = document.createElement("div");
    info.className = "exercise-catalog-row__info";
    const groupNames = item.groupIds
      .map((id) => exerciseCatalogGroups.find((group) => group.id === id)?.shortName ||
        exerciseCatalogGroups.find((group) => group.id === id)?.name)
      .filter(Boolean);
    info.textContent = [
      item.equipment.length > 0 ? item.equipment.join(", ") : null,
      groupNames.length > 0 ? groupNames.join(", ") : null,
      item.parameters.length > 0 ? String(item.parameters.length) + " Parameter" : null,
      item.videoUrl ? "Link" : null,
    ].filter(Boolean).join(" · ") || "Keine Zusatzangaben";

    main.append(title, meta, info);

    const favorite = document.createElement("button");
    favorite.type = "button";
    favorite.className = "exercise-catalog-favorite";
    favorite.dataset.exerciseCatalogFavorite = item.id;
    favorite.setAttribute("aria-pressed", String(item.isFavorite));
    favorite.setAttribute(
      "aria-label",
      item.isFavorite ? "Favorit entfernen" : "Als Favorit markieren",
    );
    favorite.textContent = item.isFavorite ? "★" : "☆";

    row.append(main, favorite);
    container.append(row);
  }
}

async function openExerciseCatalogItem(id) {
  if (!exerciseCatalogReady || exerciseCatalogBusy) return;
  setExerciseCatalogBusy(true);
  showMessage(elements.exerciseCatalogMessage, "");
  showMessage(elements.exerciseCatalogSuccess, "");
  try {
    const payload = await requestJson(
      "/api/modules/exercise-catalog/" + encodeURIComponent(id),
    );
    if (!isExerciseCatalogItem(payload?.item)) {
      throw new Error("INVALID_EXERCISE_CATALOG_ITEM");
    }
    exerciseCatalogSelectedId = payload.item.id;
    populateExerciseCatalogEditor(payload.item);
  } catch (error) {
    showMessage(
      elements.exerciseCatalogMessage,
      error?.status === 404
        ? "Die Übung wurde nicht gefunden."
        : "Die Übung konnte nicht geladen werden.",
    );
  } finally {
    setExerciseCatalogBusy(false);
  }
}

function newExerciseCatalogItem() {
  if (!exerciseCatalogCanEdit || exerciseCatalogBusy) return;
  exerciseCatalogSelectedId = null;
  populateExerciseCatalogEditor({
    id: "",
    name: "",
    categoryKey: "warmup",
    subcategory: null,
    goal: null,
    description: null,
    coachingCues: null,
    commonMistakes: null,
    equipment: [],
    videoUrl: null,
    groupIds: [],
    parameters: [],
    isActive: true,
    isFavorite: false,
  });
}

function populateExerciseCatalogEditor(item, options = {}) {
  const review = options.review === true;
  const editable = !review && exerciseCatalogCanEdit && item.isActive;
  exerciseCatalogEditorReviewMode = review;
  setExerciseCatalogFilterOpen(false);
  if (elements.exerciseCatalogEditor) elements.exerciseCatalogEditor.hidden = false;
  document.body.classList.add("exercise-catalog-editor-open");
  setExerciseCatalogEditorTab("basis");

  if (elements.exerciseCatalogEditorEyebrow) {
    elements.exerciseCatalogEditorEyebrow.textContent = review
      ? "Importvorschau · " + importActionLabel(options.action || "skip")
      : item.id.length === 0
        ? "Neue Übung"
        : item.isActive
          ? "Übung"
          : "Archiv";
  }
  if (elements.exerciseCatalogEditorTitle) {
    elements.exerciseCatalogEditorTitle.textContent = review
      ? "Zeile " + String(options.rowNumber || "") + " · " + (item.name || "Ohne Name")
      : item.id.length === 0
        ? "Übung anlegen"
        : item.name;
  }

  if (elements.exerciseCatalogImportReview) {
    elements.exerciseCatalogImportReview.hidden = !review;
  }
  renderExerciseCatalogImportIssues(
    elements.exerciseCatalogImportReviewIssues,
    review && Array.isArray(options.issues) ? options.issues : [],
    review ? "Keine Fehler oder Warnungen in dieser Zeile." : "",
  );

  if (elements.exerciseCatalogName) elements.exerciseCatalogName.value = item.name || "";
  if (elements.exerciseCatalogCategory) elements.exerciseCatalogCategory.value = item.categoryKey || "";
  if (elements.exerciseCatalogSubcategory) elements.exerciseCatalogSubcategory.value = item.subcategory || "";
  if (elements.exerciseCatalogGoal) elements.exerciseCatalogGoal.value = item.goal || "";
  if (elements.exerciseCatalogDescription) elements.exerciseCatalogDescription.value = item.description || "";
  if (elements.exerciseCatalogCues) elements.exerciseCatalogCues.value = item.coachingCues || "";
  if (elements.exerciseCatalogMistakes) elements.exerciseCatalogMistakes.value = item.commonMistakes || "";
  if (elements.exerciseCatalogEquipment) {
    elements.exerciseCatalogEquipment.value = Array.isArray(item.equipment)
      ? item.equipment.join(", ")
      : "";
  }
  if (elements.exerciseCatalogVideoUrl) elements.exerciseCatalogVideoUrl.value = item.videoUrl || "";

  renderExerciseCatalogGroupChecks(Array.isArray(item.groupIds) ? item.groupIds : []);
  exerciseCatalogParameterDrafts = Array.isArray(item.parameters)
    ? item.parameters.map((parameter) => ({ ...parameter }))
    : [];
  renderExerciseCatalogParameters();

  for (const control of elements.exerciseCatalogForm?.querySelectorAll("input, select, textarea") || []) {
    control.disabled = !editable;
  }
  for (const control of elements.exerciseCatalogParameters?.querySelectorAll("button") || []) {
    control.disabled = !editable;
  }
  for (const control of elements.exerciseCatalogParameters?.querySelectorAll("[data-exercise-catalog-parameter-remove]") || []) {
    control.hidden = review || !exerciseCatalogCanEdit;
  }
  if (elements.exerciseCatalogSave) {
    elements.exerciseCatalogSave.hidden = !editable;
    elements.exerciseCatalogSave.disabled = !editable || exerciseCatalogBusy;
  }
  if (elements.exerciseCatalogDeactivate) {
    elements.exerciseCatalogDeactivate.hidden =
      review || !exerciseCatalogCanEdit || item.id.length === 0 || !item.isActive;
    elements.exerciseCatalogDeactivate.disabled = review || exerciseCatalogBusy;
  }
  if (elements.exerciseCatalogReadonly) {
    elements.exerciseCatalogReadonly.hidden = editable;
    elements.exerciseCatalogReadonly.textContent = review
      ? "Importvorschau: Diese Daten sind hier nur zur Prüfung geöffnet. Es wird nichts gespeichert."
      : "Nur-Lese-Zugriff: Favoriten können weiterhin gesetzt werden.";
  }
  if (elements.exerciseCatalogParameterAdd) {
    elements.exerciseCatalogParameterAdd.disabled = !editable || exerciseCatalogBusy;
  }
  if (elements.exerciseCatalogParameterSelect) {
    elements.exerciseCatalogParameterSelect.disabled = !editable || exerciseCatalogBusy;
  }

  if (elements.exerciseCatalogLinkRow) {
    elements.exerciseCatalogLinkRow.hidden = !item.videoUrl;
  }
  if (elements.exerciseCatalogLink) {
    if (item.videoUrl) {
      elements.exerciseCatalogLink.href = item.videoUrl;
    } else {
      elements.exerciseCatalogLink.removeAttribute("href");
    }
  }

  exerciseCatalogEditorDirty = false;
}

function closeExerciseCatalogEditor(force = false) {
  if (
    !force &&
    !exerciseCatalogEditorReviewMode &&
    exerciseCatalogEditorDirty &&
    exerciseCatalogCanEdit &&
    !window.confirm("Ungespeicherte Änderungen verwerfen?")
  ) {
    return false;
  }
  exerciseCatalogSelectedId = null;
  exerciseCatalogParameterDrafts = [];
  exerciseCatalogEditorDirty = false;
  exerciseCatalogEditorReviewMode = false;
  if (elements.exerciseCatalogEditor) elements.exerciseCatalogEditor.hidden = true;
  if (elements.exerciseCatalogImportReview) elements.exerciseCatalogImportReview.hidden = true;
  if (elements.exerciseCatalogImportReviewIssues) {
    elements.exerciseCatalogImportReviewIssues.replaceChildren();
  }
  document.body.classList.remove("exercise-catalog-editor-open");
  showMessage(elements.exerciseCatalogSuccess, "");
  return true;
}

function renderExerciseCatalogGroupChecks(selectedIds) {
  const container = elements.exerciseCatalogGroups;
  if (!container) return;
  container.replaceChildren();
  if (exerciseCatalogGroups.length === 0) {
    const empty = document.createElement("span");
    empty.className = "exercise-catalog-readonly";
    empty.textContent = "Keine aktiven Trainingsgruppen vorhanden.";
    container.append(empty);
    return;
  }
  for (const group of exerciseCatalogGroups) {
    const label = document.createElement("label");
    label.className = "exercise-catalog-check";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = group.id;
    input.checked = selectedIds.includes(group.id);
    input.dataset.exerciseCatalogGroup = group.id;
    const text = document.createElement("span");
    text.textContent = group.shortName
      ? group.name + " (" + group.shortName + ")"
      : group.name;
    label.append(input, text);
    container.append(label);
  }
}

function renderExerciseCatalogParameterSelect() {
  const select = elements.exerciseCatalogParameterSelect;
  if (!select) return;
  const selected = select.value;
  const used = new Set(exerciseCatalogParameterDrafts.map((parameter) => parameter.key));
  const available = EXERCISE_PARAMETER_META.filter((parameter) => !used.has(parameter.key));
  replaceExerciseCatalogSelectOptions(
    select,
    available.length === 0
      ? [{ value: "", label: "Alle Parameter verwendet" }]
      : available.map((parameter) => ({
          value: parameter.key,
          label: parameter.label,
        })),
  );
  if (available.some((parameter) => parameter.key === selected)) select.value = selected;
  if (elements.exerciseCatalogParameterAdd) {
    elements.exerciseCatalogParameterAdd.disabled =
      exerciseCatalogEditorReviewMode ||
      !exerciseCatalogCanEdit ||
      available.length === 0 ||
      exerciseCatalogBusy;
  }
}

function addExerciseCatalogParameter() {
  if (exerciseCatalogEditorReviewMode || !exerciseCatalogCanEdit || exerciseCatalogBusy) return;
  syncExerciseCatalogParameterDraftsFromDom();
  const key = elements.exerciseCatalogParameterSelect?.value || "";
  const meta = parameterMeta(key);
  if (!meta || exerciseCatalogParameterDrafts.some((parameter) => parameter.key === key)) return;
  exerciseCatalogParameterDrafts.push({
    key: meta.key,
    label: meta.label,
    unit: meta.unit,
    inputType: meta.inputType,
    defaultValue: null,
    minValue: null,
    maxValue: null,
    stepValue: null,
    isRequired: false,
    sortOrder: (exerciseCatalogParameterDrafts.length + 1) * 10,
  });
  renderExerciseCatalogParameters();
}

function renderExerciseCatalogParameters() {
  const container = elements.exerciseCatalogParameters;
  if (!container) return;
  container.replaceChildren();

  if (exerciseCatalogParameterDrafts.length === 0) {
    const empty = document.createElement("div");
    empty.className = "exercise-catalog-empty";
    empty.textContent = "Keine Planungsparameter ausgewählt.";
    container.append(empty);
    renderExerciseCatalogParameterSelect();
    return;
  }

  exerciseCatalogParameterDrafts.forEach((parameter, index) => {
    const row = document.createElement("article");
    row.className = "exercise-catalog-parameter";
    row.dataset.exerciseCatalogParameter = parameter.key;

    const top = document.createElement("div");
    top.className = "exercise-catalog-parameter__top";
    const title = document.createElement("strong");
    title.textContent =
      parameter.label + (parameter.unit ? " (" + parameter.unit + ")" : "");
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "button button--secondary exercise-catalog-remove";
    remove.textContent = "Entfernen";
    remove.dataset.exerciseCatalogParameterRemove = parameter.key;
    remove.hidden = !exerciseCatalogCanEdit;
    top.append(title, remove);

    const fields = document.createElement("div");
    fields.className = "exercise-catalog-parameter__fields";

    fields.append(
      parameterInput("Standard", "defaultValue", parameter.defaultValue, parameter.inputType),
    );

    if (parameter.inputType === "number") {
      fields.append(
        parameterInput("Minimum", "minValue", parameter.minValue, "number"),
        parameterInput("Maximum", "maxValue", parameter.maxValue, "number"),
        parameterInput("Schritt", "stepValue", parameter.stepValue, "number"),
      );
    }

    const requiredLabel = document.createElement("label");
    requiredLabel.className = "exercise-catalog-parameter__required";
    const required = document.createElement("input");
    required.type = "checkbox";
    required.checked = parameter.isRequired;
    required.dataset.exerciseCatalogParameterField = "isRequired";
    required.dataset.exerciseCatalogParameterIndex = String(index);
    const requiredText = document.createElement("span");
    requiredText.textContent = "Pflichtfeld";
    requiredLabel.append(required, requiredText);
    fields.append(requiredLabel);

    row.append(top, fields);
    container.append(row);
  });

  for (const control of container.querySelectorAll("input, button")) {
    control.disabled = !exerciseCatalogCanEdit || exerciseCatalogBusy;
  }
  renderExerciseCatalogParameterSelect();
}

function parameterInput(labelText, field, value, inputType) {
  const label = document.createElement("label");
  label.textContent = labelText;
  const input = document.createElement("input");
  input.type = inputType === "number" ? "number" : "text";
  if (inputType === "number") input.step = "any";
  input.value = value === null ? "" : String(value);
  input.dataset.exerciseCatalogParameterField = field;
  label.append(input);
  return label;
}

function syncExerciseCatalogParameterDraftsFromDom() {
  const rows = [...(elements.exerciseCatalogParameters?.querySelectorAll("[data-exercise-catalog-parameter]") || [])];
  exerciseCatalogParameterDrafts = rows.map((row, index) => {
    const key = row.dataset.exerciseCatalogParameter || "";
    const previous = exerciseCatalogParameterDrafts.find((parameter) => parameter.key === key);
    const meta = parameterMeta(key);
    if (!previous || !meta) throw new Error("INVALID_PARAMETER_STATE");
    const read = (field) =>
      row.querySelector("[data-exercise-catalog-parameter-field='" + field + "']");
    const defaultInput = read("defaultValue");
    const minInput = read("minValue");
    const maxInput = read("maxValue");
    const stepInput = read("stepValue");
    const requiredInput = read("isRequired");
    return {
      ...previous,
      label: previous.label || meta.label,
      unit: previous.unit || meta.unit,
      inputType: previous.inputType || meta.inputType,
      defaultValue: defaultInput?.value.trim() || null,
      minValue: numericInputValue(minInput),
      maxValue: numericInputValue(maxInput),
      stepValue: numericInputValue(stepInput),
      isRequired: requiredInput?.checked === true,
      sortOrder: (index + 1) * 10,
    };
  });
}

function numericInputValue(input) {
  if (!input || input.value.trim() === "") return null;
  const value = Number(input.value);
  return Number.isFinite(value) ? value : null;
}

function parseExerciseEquipment() {
  const parts = (elements.exerciseCatalogEquipment?.value || "")
    .split(/[;,\n]/)
    .map((value) => value.trim())
    .filter(Boolean);
  const result = [];
  const seen = new Set();
  for (const value of parts) {
    const folded = value.toLocaleLowerCase("de");
    if (!seen.has(folded)) {
      seen.add(folded);
      result.push(value);
    }
  }
  return result;
}

function exerciseCatalogFormPayload() {
  syncExerciseCatalogParameterDraftsFromDom();
  return {
    name: elements.exerciseCatalogName?.value || "",
    categoryKey: elements.exerciseCatalogCategory?.value || "",
    subcategory: elements.exerciseCatalogSubcategory?.value || null,
    goal: elements.exerciseCatalogGoal?.value || null,
    description: elements.exerciseCatalogDescription?.value || null,
    coachingCues: elements.exerciseCatalogCues?.value || null,
    commonMistakes: elements.exerciseCatalogMistakes?.value || null,
    equipment: parseExerciseEquipment(),
    videoUrl: elements.exerciseCatalogVideoUrl?.value || null,
    groupIds: [...(elements.exerciseCatalogGroups?.querySelectorAll("input[type='checkbox']:checked") || [])].map(
      (input) => input.value,
    ),
    parameters: exerciseCatalogParameterDrafts.map((parameter) => ({
      key: parameter.key,
      label: parameter.label,
      unit: parameter.unit,
      inputType: parameter.inputType,
      defaultValue: parameter.defaultValue,
      minValue: parameter.inputType === "number" ? parameter.minValue : null,
      maxValue: parameter.inputType === "number" ? parameter.maxValue : null,
      stepValue: parameter.inputType === "number" ? parameter.stepValue : null,
      isRequired: parameter.isRequired,
      sortOrder: parameter.sortOrder,
    })),
  };
}

async function saveExerciseCatalogItem(event) {
  event.preventDefault();
  if (exerciseCatalogEditorReviewMode || !exerciseCatalogCanEdit || exerciseCatalogBusy) return;
  setExerciseCatalogBusy(true);
  showMessage(elements.exerciseCatalogMessage, "");
  showMessage(elements.exerciseCatalogSuccess, "");

  let body;
  try {
    body = exerciseCatalogFormPayload();
  } catch {
    showMessage(
      elements.exerciseCatalogMessage,
      "Die Übung konnte nicht gespeichert werden. Bitte Eingaben prüfen.",
    );
    setExerciseCatalogBusy(false);
    return;
  }

  const path = exerciseCatalogSelectedId
    ? "/api/modules/exercise-catalog/" +
      encodeURIComponent(exerciseCatalogSelectedId) +
      "/update"
    : "/api/modules/exercise-catalog";

  let payload;
  try {
    payload = await requestJson(path, {
      method: "POST",
      body: JSON.stringify(body),
    });
  } catch (error) {
    showMessage(
      elements.exerciseCatalogMessage,
      error?.status === 409
        ? "Eine Übung mit diesem Namen ist bereits vorhanden."
        : error?.status === 404
          ? "Eine ausgewählte Trainingsgruppe ist nicht mehr verfügbar."
          : "Die Übung konnte nicht gespeichert werden. Bitte Eingaben prüfen.",
    );
    setExerciseCatalogBusy(false);
    return;
  }

  if (!isExerciseCatalogItem(payload?.item)) {
    exerciseCatalogEditorDirty = false;
    closeExerciseCatalogEditor(true);
    showMessage(
      elements.exerciseCatalogSuccess,
      "Übung wurde gespeichert. Die Ansicht konnte nicht automatisch aktualisiert werden.",
    );
    setExerciseCatalogBusy(false);
    return;
  }

  reconcileExerciseCatalogItem(payload.item);
  exerciseCatalogEditorDirty = false;
  closeExerciseCatalogEditor(true);
  showMessage(elements.exerciseCatalogSuccess, "Übung wurde gespeichert.");
  setExerciseCatalogBusy(false);
}

async function deactivateExerciseCatalogItem() {
  if (
    exerciseCatalogEditorReviewMode ||
    !exerciseCatalogCanEdit ||
    !exerciseCatalogSelectedId ||
    exerciseCatalogBusy
  ) return;
  const item = exerciseCatalogItems.find((candidate) => candidate.id === exerciseCatalogSelectedId);
  if (!item || !item.isActive) return;
  if (!window.confirm("Übung „" + item.name + "“ deaktivieren? Sie bleibt im Archiv erhalten.")) return;

  const deactivatedId = exerciseCatalogSelectedId;
  setExerciseCatalogBusy(true);
  showMessage(elements.exerciseCatalogMessage, "");
  showMessage(elements.exerciseCatalogSuccess, "");
  try {
    await requestJson(
      "/api/modules/exercise-catalog/" +
        encodeURIComponent(deactivatedId) +
        "/deactivate",
      { method: "POST" },
    );
  } catch {
    showMessage(elements.exerciseCatalogMessage, "Die Übung konnte nicht deaktiviert werden.");
    setExerciseCatalogBusy(false);
    return;
  }

  archiveExerciseCatalogItemLocally(deactivatedId);
  closeExerciseCatalogEditor(true);
  showMessage(elements.exerciseCatalogSuccess, "Übung wurde ins Archiv verschoben.");
  setExerciseCatalogBusy(false);
}

async function toggleExerciseCatalogFavorite(id) {
  if (!exerciseCatalogReady || exerciseCatalogBusy) return;
  const item = exerciseCatalogItems.find((candidate) => candidate.id === id);
  if (!item) return;
  setExerciseCatalogBusy(true);
  try {
    const payload = await requestJson(
      "/api/modules/exercise-catalog/" + encodeURIComponent(id) + "/favorite",
      { method: item.isFavorite ? "DELETE" : "PUT" },
    );
    if (!isExerciseCatalogItem(payload?.item)) {
      throw new Error("INVALID_EXERCISE_CATALOG_FAVORITE");
    }
    exerciseCatalogItems = exerciseCatalogItems.map((candidate) =>
      candidate.id === id ? payload.item : candidate,
    );
    renderExerciseCatalogList();
  } catch {
    showMessage(elements.exerciseCatalogMessage, "Favorit konnte nicht geändert werden.");
  } finally {
    setExerciseCatalogBusy(false);
  }
}

function reconcileExerciseCatalogItem(item) {
  const index = exerciseCatalogItems.findIndex(
    (candidate) => candidate.id === item.id,
  );
  const next = exerciseCatalogItems.slice();
  if (index >= 0) {
    next[index] = item;
  } else {
    next.push(item);
  }
  exerciseCatalogItems = sortedExerciseCatalogItems(next);
  renderExerciseCatalogList();
}

function archiveExerciseCatalogItemLocally(id) {
  exerciseCatalogItems = sortedExerciseCatalogItems(
    exerciseCatalogItems.map((item) =>
      item.id === id ? { ...item, isActive: false } : item,
    ),
  );
  renderExerciseCatalogList();
}

function sortedExerciseCatalogItems(items) {
  return items.slice().sort(
    (left, right) =>
      Number(right.isActive) - Number(left.isActive) ||
      left.name.localeCompare(right.name, "de", { sensitivity: "base" }) ||
      left.id.localeCompare(right.id),
  );
}

const EXERCISE_CATALOG_XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const EXERCISE_CATALOG_IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;

function importActionLabel(action) {
  if (action === "create") return "Neu";
  if (action === "update") return "Änderung";
  return "Überspringen";
}

function isExerciseCatalogImportIssue(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    ["error", "warning"].includes(value.level) &&
    typeof value.code === "string" &&
    typeof value.message === "string" &&
    typeof value.sheet === "string" &&
    (value.row === null || Number.isSafeInteger(value.row)) &&
    (value.field === null || typeof value.field === "string")
  );
}

function isExerciseCatalogImportPreview(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    value.contractVersion !== "appbasis.exercise-catalog.exchange/v1" ||
    value.applyAvailable !== false ||
    value.summary === null ||
    typeof value.summary !== "object" ||
    !Array.isArray(value.issues) ||
    !value.issues.every(isExerciseCatalogImportIssue) ||
    !Array.isArray(value.rows)
  ) return false;

  for (const key of ["rows", "create", "update", "skip", "errors", "warnings"]) {
    if (!Number.isSafeInteger(value.summary[key]) || value.summary[key] < 0) return false;
  }

  return value.rows.every((row) =>
    row !== null &&
    typeof row === "object" &&
    Number.isSafeInteger(row.rowNumber) &&
    typeof row.recordKey === "string" &&
    (row.sourceId === null || typeof row.sourceId === "string") &&
    (row.matchedExerciseId === null || typeof row.matchedExerciseId === "string") &&
    ["create", "update", "skip"].includes(row.action) &&
    ["new", "changed", "unchanged", "invalid"].includes(row.reason) &&
    row.draft !== null &&
    typeof row.draft === "object" &&
    typeof row.draft.id === "string" &&
    typeof row.draft.name === "string" &&
    typeof row.draft.categoryKey === "string" &&
    Array.isArray(row.draft.equipment) &&
    Array.isArray(row.draft.groupIds) &&
    Array.isArray(row.draft.parameters) &&
    typeof row.draft.isActive === "boolean" &&
    Array.isArray(row.issues) &&
    row.issues.every(isExerciseCatalogImportIssue),
  );
}

function isExerciseCatalogImportApplyEnvelope(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof value.available === "boolean" &&
    typeof value.previewToken === "string" &&
    /^e6f3-v1\.[0-9a-f]{64}$/.test(value.previewToken)
  );
}

function isExerciseCatalogImportResult(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    value.contractVersion !== "appbasis.exercise-catalog.import-result/v1" ||
    typeof value.previewToken !== "string" ||
    typeof value.appliedAt !== "string" ||
    value.summary === null ||
    typeof value.summary !== "object" ||
    !Array.isArray(value.rows) ||
    typeof value.logCsv !== "string"
  ) return false;

  for (const key of ["rows", "created", "updated", "skipped", "failed"]) {
    if (!Number.isSafeInteger(value.summary[key]) || value.summary[key] < 0) {
      return false;
    }
  }

  return value.rows.every((row) =>
    row !== null &&
    typeof row === "object" &&
    Number.isSafeInteger(row.rowNumber) &&
    typeof row.recordKey === "string" &&
    ["create", "update", "skip"].includes(row.requestedAction) &&
    ["created", "updated", "skipped", "failed"].includes(row.outcome) &&
    (row.exerciseId === null || typeof row.exerciseId === "string") &&
    typeof row.name === "string" &&
    (row.code === null || typeof row.code === "string") &&
    typeof row.message === "string"
  );
}

function setExerciseCatalogImportPreviewOpen(open) {
  if (elements.exerciseCatalogImportPreview) {
    elements.exerciseCatalogImportPreview.hidden = !open;
  }
  document.body.classList.toggle("exercise-catalog-import-open", Boolean(open));
}

function closeExerciseCatalogImportPreview() {
  setExerciseCatalogImportPreviewOpen(false);
  exerciseCatalogImportPreviewData = null;
  exerciseCatalogImportPreviewToken = null;
  exerciseCatalogImportFileDraft = null;
  exerciseCatalogImportResultData = null;
  if (elements.exerciseCatalogImportApply) {
    elements.exerciseCatalogImportApply.hidden = false;
    elements.exerciseCatalogImportApply.disabled = true;
    elements.exerciseCatalogImportApply.textContent = "Import anwenden";
  }
  if (elements.exerciseCatalogImportLog) {
    elements.exerciseCatalogImportLog.hidden = true;
    elements.exerciseCatalogImportLog.disabled = false;
  }
  if (elements.exerciseCatalogImportNotice) {
    elements.exerciseCatalogImportNotice.textContent =
      "Vorschau: Erst nach ausdrücklicher Bestätigung werden gültige neue oder geänderte Übungen angewendet.";
  }
}

function renderExerciseCatalogImportIssues(container, issues, emptyMessage = "") {
  if (!container) return;
  container.replaceChildren();
  if (issues.length === 0) {
    if (emptyMessage) {
      const empty = document.createElement("p");
      empty.className = "exercise-catalog-import-issue";
      empty.textContent = emptyMessage;
      container.append(empty);
    }
    return;
  }

  for (const importIssue of issues) {
    const entry = document.createElement("p");
    entry.className = "exercise-catalog-import-issue";
    entry.dataset.level = importIssue.level;
    const location = [
      importIssue.sheet,
      importIssue.row === null ? null : "Zeile " + String(importIssue.row),
      importIssue.field,
    ].filter(Boolean).join(" · ");
    entry.textContent =
      (importIssue.level === "error" ? "Fehler" : "Warnung") +
      (location ? " – " + location : "") +
      ": " +
      importIssue.message;
    container.append(entry);
  }
}

function renderExerciseCatalogImportPreview(preview) {
  if (elements.exerciseCatalogImportSummary) {
    elements.exerciseCatalogImportSummary.replaceChildren();
    for (const entry of [
      ["Neu", preview.summary.create],
      ["Ändern", preview.summary.update],
      ["Überspringen", preview.summary.skip],
      ["Fehler", preview.summary.errors],
      ["Warnungen", preview.summary.warnings],
      ["Gesamt", preview.summary.rows],
    ]) {
      const card = document.createElement("div");
      const value = document.createElement("strong");
      value.textContent = String(entry[1]);
      const label = document.createElement("span");
      label.textContent = entry[0];
      card.append(value, label);
      elements.exerciseCatalogImportSummary.append(card);
    }
  }

  renderExerciseCatalogImportIssues(
    elements.exerciseCatalogImportIssues,
    preview.issues,
  );

  if (!elements.exerciseCatalogImportRows) return;
  elements.exerciseCatalogImportRows.replaceChildren();
  if (preview.rows.length === 0) {
    const empty = document.createElement("div");
    empty.className = "exercise-catalog-empty";
    empty.textContent = "Die Importdatei enthält keine Übungszeilen.";
    elements.exerciseCatalogImportRows.append(empty);
    return;
  }

  preview.rows.forEach((row, index) => {
    const control = document.createElement("button");
    control.type = "button";
    control.className = "exercise-catalog-import-row";
    control.dataset.exerciseCatalogImportRow = String(index);

    const main = document.createElement("span");
    main.className = "exercise-catalog-import-row__main";
    const title = document.createElement("strong");
    title.textContent = row.draft.name || "Ohne Name";
    const meta = document.createElement("span");
    meta.className = "exercise-catalog-import-row__meta";
    const issueCount = row.issues.length;
    meta.textContent =
      "Excel-Zeile " +
      String(row.rowNumber) +
      (issueCount > 0 ? " · " + String(issueCount) + " Hinweis(e)" : "");
    main.append(title, meta);

    const status = document.createElement("span");
    status.className = "exercise-catalog-import-action";
    status.dataset.action = row.action;
    status.dataset.reason = row.reason;
    status.textContent =
      row.reason === "invalid"
        ? "Fehler"
        : row.reason === "unchanged"
          ? "Unverändert"
          : importActionLabel(row.action);

    control.append(main, status);
    elements.exerciseCatalogImportRows.append(control);
  });

  const changes = preview.summary.create + preview.summary.update;
  if (elements.exerciseCatalogImportApply) {
    elements.exerciseCatalogImportApply.hidden = false;
    elements.exerciseCatalogImportApply.disabled =
      exerciseCatalogBusy ||
      preview.summary.errors > 0 ||
      changes === 0 ||
      exerciseCatalogImportPreviewToken === null ||
      exerciseCatalogImportFileDraft === null;
    elements.exerciseCatalogImportApply.textContent =
      changes > 0
        ? "Import anwenden (" + String(changes) + ")"
        : "Keine Änderungen";
  }
  if (elements.exerciseCatalogImportLog) {
    elements.exerciseCatalogImportLog.hidden = true;
  }
  if (elements.exerciseCatalogImportNotice) {
    elements.exerciseCatalogImportNotice.textContent =
      preview.summary.errors > 0
        ? "Die Vorschau enthält Fehler. Der Import bleibt gesperrt, bis die XLSX-Datei korrigiert und neu geprüft wurde."
        : changes === 0
          ? "Keine Änderungen erforderlich. Alle gültigen Zeilen sind bereits aktuell."
          : "Vorschau geprüft: Der Server liest die XLSX beim Apply erneut und verwirft den Vorgang, falls sich Datei oder Katalogzustand geändert haben.";
  }
}

function reviewExerciseCatalogImportRow(index) {
  const row = exerciseCatalogImportPreviewData?.rows?.[index];
  if (!row) return;
  exerciseCatalogSelectedId = null;
  populateExerciseCatalogEditor(row.draft, {
    review: true,
    action: row.action,
    rowNumber: row.rowNumber,
    issues: row.issues,
  });
}

async function previewExerciseCatalogImportFile(file) {
  if (!exerciseCatalogReady || !exerciseCatalogCanEdit || exerciseCatalogBusy) return;
  showMessage(elements.exerciseCatalogMessage, "");
  showMessage(elements.exerciseCatalogSuccess, "");

  if (
    !file ||
    typeof file.name !== "string" ||
    !file.name.toLocaleLowerCase("de").endsWith(".xlsx")
  ) {
    showMessage(elements.exerciseCatalogMessage, "Bitte eine XLSX-Datei auswählen.");
    return;
  }
  if (file.size > EXERCISE_CATALOG_IMPORT_MAX_FILE_BYTES) {
    showMessage(elements.exerciseCatalogMessage, "Die Importdatei darf höchstens 5 MB groß sein.");
    return;
  }

  setExerciseCatalogBusy(true);
  try {
    const response = await fetch(
      "/api/modules/exercise-catalog/import-preview",
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": EXERCISE_CATALOG_XLSX_CONTENT_TYPE,
        },
        body: file,
      },
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(payload?.error?.code || "IMPORT_PREVIEW_FAILED");
      error.status = response.status;
      error.code = payload?.error?.code;
      throw error;
    }
    if (
      !isExerciseCatalogImportPreview(payload?.preview) ||
      !isExerciseCatalogImportApplyEnvelope(payload?.apply)
    ) {
      throw new Error("INVALID_IMPORT_PREVIEW_CONTRACT");
    }

    exerciseCatalogImportPreviewData = payload.preview;
    exerciseCatalogImportPreviewToken = payload.apply.previewToken;
    exerciseCatalogImportFileDraft = file;
    exerciseCatalogImportResultData = null;
    renderExerciseCatalogImportPreview(payload.preview);
    if (elements.exerciseCatalogImportApply) {
      elements.exerciseCatalogImportApply.disabled =
        !payload.apply.available || exerciseCatalogBusy;
    }
    setExerciseCatalogImportPreviewOpen(true);
  } catch (error) {
    const message =
      error?.status === 403
        ? "Für den Import fehlt die Bearbeitungsberechtigung."
        : error?.status === 413 || error?.code === "IMPORT_FILE_TOO_LARGE"
          ? "Die Importdatei darf höchstens 5 MB groß sein."
          : error?.code === "IMPORT_ROW_LIMIT_EXCEEDED"
            ? "Die Importdatei enthält mehr als 1.000 Übungen."
            : "Die XLSX-Datei konnte nicht als Importvorschau gelesen werden.";
    showMessage(elements.exerciseCatalogMessage, message);
  } finally {
    setExerciseCatalogBusy(false);
  }
}

function renderExerciseCatalogImportResult(result) {
  if (elements.exerciseCatalogImportSummary) {
    elements.exerciseCatalogImportSummary.replaceChildren();
    for (const entry of [
      ["Angelegt", result.summary.created],
      ["Aktualisiert", result.summary.updated],
      ["Übersprungen", result.summary.skipped],
      ["Fehler", result.summary.failed],
      ["Gesamt", result.summary.rows],
    ]) {
      const card = document.createElement("div");
      const value = document.createElement("strong");
      value.textContent = String(entry[1]);
      const label = document.createElement("span");
      label.textContent = entry[0];
      card.append(value, label);
      elements.exerciseCatalogImportSummary.append(card);
    }
  }
  if (elements.exerciseCatalogImportIssues) {
    elements.exerciseCatalogImportIssues.replaceChildren();
  }
  if (elements.exerciseCatalogImportRows) {
    elements.exerciseCatalogImportRows.replaceChildren();
    for (const row of result.rows) {
      const entry = document.createElement("article");
      entry.className = "exercise-catalog-import-row";
      const main = document.createElement("span");
      main.className = "exercise-catalog-import-row__main";
      const title = document.createElement("strong");
      title.textContent = row.name || "Ohne Name";
      const meta = document.createElement("span");
      meta.className = "exercise-catalog-import-row__meta";
      meta.textContent =
        "Excel-Zeile " + String(row.rowNumber) + " · " + row.message;
      main.append(title, meta);
      const status = document.createElement("span");
      status.className = "exercise-catalog-import-action";
      status.dataset.action = row.requestedAction;
      status.dataset.reason = row.outcome === "failed" ? "invalid" : row.outcome;
      status.textContent =
        row.outcome === "created"
          ? "Angelegt"
          : row.outcome === "updated"
            ? "Aktualisiert"
            : row.outcome === "skipped"
              ? "Übersprungen"
              : "Fehler";
      entry.append(main, status);
      elements.exerciseCatalogImportRows.append(entry);
    }
  }
  if (elements.exerciseCatalogImportNotice) {
    elements.exerciseCatalogImportNotice.textContent =
      result.summary.failed === 0
        ? "Import abgeschlossen. Das Protokoll kann als CSV heruntergeladen werden."
        : "Import mit Teilfehlern abgeschlossen. Das CSV-Protokoll zeigt das Ergebnis jeder Zeile.";
  }
  if (elements.exerciseCatalogImportApply) {
    elements.exerciseCatalogImportApply.hidden = true;
    elements.exerciseCatalogImportApply.disabled = true;
  }
  if (elements.exerciseCatalogImportLog) {
    elements.exerciseCatalogImportLog.hidden = false;
    elements.exerciseCatalogImportLog.disabled = false;
  }
}

async function refreshExerciseCatalogAfterImport() {
  const payload = await requestJson("/api/modules/exercise-catalog");
  const items = payload?.catalog?.items;
  const groups = payload?.catalog?.trainingGroups;
  const edit = payload?.access?.edit;
  if (
    payload?.module?.moduleId !== "exercise_catalog" ||
    payload?.access?.view !== true ||
    typeof edit !== "boolean" ||
    !Array.isArray(items) ||
    !items.every(isExerciseCatalogItem) ||
    !Array.isArray(groups) ||
    !groups.every(isExerciseCatalogGroup)
  ) {
    throw new Error("INVALID_EXERCISE_CATALOG_CONTRACT");
  }
  exerciseCatalogReady = true;
  exerciseCatalogCanEdit = edit;
  exerciseCatalogItems = items.slice();
  exerciseCatalogGroups = groups.slice();
  initializeExerciseCatalogFilters();
  renderExerciseCatalogList();
  refreshAppAvailability();
}

async function applyExerciseCatalogImport() {
  if (
    !exerciseCatalogReady ||
    !exerciseCatalogCanEdit ||
    exerciseCatalogBusy ||
    exerciseCatalogImportPreviewData === null ||
    exerciseCatalogImportPreviewToken === null ||
    exerciseCatalogImportFileDraft === null
  ) return;

  const changes =
    exerciseCatalogImportPreviewData.summary.create +
    exerciseCatalogImportPreviewData.summary.update;
  if (
    changes <= 0 ||
    exerciseCatalogImportPreviewData.summary.errors > 0 ||
    !window.confirm(
      String(changes) +
        " Änderung(en) aus der geprüften XLSX-Datei jetzt anwenden? " +
        "Der Server prüft Datei und Katalogzustand unmittelbar davor erneut.",
    )
  ) return;

  setExerciseCatalogBusy(true);
  showMessage(elements.exerciseCatalogMessage, "");
  showMessage(elements.exerciseCatalogSuccess, "");
  try {
    const response = await fetch(
      "/api/modules/exercise-catalog/import-apply",
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": EXERCISE_CATALOG_XLSX_CONTENT_TYPE,
          "x-appbasis-import-preview-token": exerciseCatalogImportPreviewToken,
        },
        body: exerciseCatalogImportFileDraft,
      },
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(payload?.error?.code || "IMPORT_APPLY_FAILED");
      error.status = response.status;
      error.code = payload?.error?.code;
      throw error;
    }
    if (!isExerciseCatalogImportResult(payload?.result)) {
      throw new Error("INVALID_IMPORT_RESULT_CONTRACT");
    }

    exerciseCatalogImportResultData = payload.result;
    exerciseCatalogImportPreviewToken = null;
    exerciseCatalogImportFileDraft = null;
    exerciseCatalogImportPreviewData = null;
    renderExerciseCatalogImportResult(payload.result);
    try {
      await refreshExerciseCatalogAfterImport();
    } catch {
      showMessage(
        elements.exerciseCatalogMessage,
        "Import wurde ausgeführt, aber die Katalogliste konnte nicht automatisch aktualisiert werden.",
      );
    }
    showMessage(
      elements.exerciseCatalogSuccess,
      payload.result.summary.failed === 0
        ? "Import wurde angewendet."
        : "Import wurde mit Teilfehlern abgeschlossen. Bitte Protokoll prüfen.",
    );
  } catch (error) {
    const stale =
      error?.code === "STALE_IMPORT_PREVIEW" ||
      error?.code === "INVALID_IMPORT_PREVIEW";
    if (stale) {
      exerciseCatalogImportPreviewToken = null;
      if (elements.exerciseCatalogImportApply) {
        elements.exerciseCatalogImportApply.disabled = true;
      }
    }
    showMessage(
      elements.exerciseCatalogMessage,
      error?.status === 403
        ? "Für den Import fehlt die Bearbeitungsberechtigung."
        : stale
          ? "Die Vorschau ist nicht mehr aktuell. Bitte XLSX-Datei erneut prüfen."
          : error?.status === 413
            ? "Die Importdatei darf höchstens 5 MB groß sein."
            : "Der Import konnte nicht angewendet werden.",
    );
  } finally {
    setExerciseCatalogBusy(false);
  }
}

function downloadExerciseCatalogImportLog() {
  if (!exerciseCatalogImportResultData?.logCsv) return;
  const blob = new Blob(
    [exerciseCatalogImportResultData.logCsv],
    { type: "text/csv;charset=utf-8" },
  );
  const href = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = href;
    link.download =
      "ulc-uebungskatalog-importprotokoll-" +
      exerciseCatalogImportResultData.appliedAt.slice(0, 10) +
      ".csv";
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(href), 0);
  }
}

async function downloadExerciseCatalogWorkbook(path, filename, successMessage) {
  if (!exerciseCatalogReady || exerciseCatalogBusy) return;
  setExerciseCatalogBusy(true);
  showMessage(elements.exerciseCatalogMessage, "");
  showMessage(elements.exerciseCatalogSuccess, "");

  try {
    const response = await fetch(path, {
      method: "GET",
      headers: {
        accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
    if (!response.ok) {
      const error = new Error("EXERCISE_CATALOG_WORKBOOK_DOWNLOAD_FAILED");
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
    showMessage(elements.exerciseCatalogSuccess, successMessage);
  } catch (error) {
    showMessage(
      elements.exerciseCatalogMessage,
      error?.status === 403
        ? "Für den Export fehlt die Berechtigung."
        : "Die Excel-Datei konnte nicht erstellt werden.",
    );
  } finally {
    setExerciseCatalogBusy(false);
  }
}

function setExerciseCatalogBusy(next) {
  exerciseCatalogBusy = next;
  if (elements.exerciseCatalogTemplate) {
    elements.exerciseCatalogTemplate.disabled = next || !exerciseCatalogReady;
  }
  if (elements.exerciseCatalogExport) {
    elements.exerciseCatalogExport.disabled = next || !exerciseCatalogReady;
  }
  if (elements.exerciseCatalogImportOpen) {
    elements.exerciseCatalogImportOpen.disabled =
      next || !exerciseCatalogReady || !exerciseCatalogCanEdit;
  }
  if (elements.exerciseCatalogImportApply) {
    const previewChanges =
      (exerciseCatalogImportPreviewData?.summary?.create || 0) +
      (exerciseCatalogImportPreviewData?.summary?.update || 0);
    elements.exerciseCatalogImportApply.disabled =
      next ||
      exerciseCatalogImportPreviewToken === null ||
      exerciseCatalogImportFileDraft === null ||
      (exerciseCatalogImportPreviewData?.summary?.errors || 0) > 0 ||
      previewChanges === 0;
  }
  if (elements.exerciseCatalogImportLog) {
    elements.exerciseCatalogImportLog.disabled =
      next || exerciseCatalogImportResultData === null;
  }
  if (elements.exerciseCatalogNew) {
    elements.exerciseCatalogNew.disabled = next || exerciseCatalogEditorReviewMode || !exerciseCatalogCanEdit;
  }
  if (elements.exerciseCatalogSave) {
    elements.exerciseCatalogSave.disabled = next || exerciseCatalogEditorReviewMode;
  }
  if (elements.exerciseCatalogDeactivate) {
    elements.exerciseCatalogDeactivate.disabled = next || exerciseCatalogEditorReviewMode;
  }
  if (elements.exerciseCatalogParameterAdd) {
    elements.exerciseCatalogParameterAdd.disabled = next || exerciseCatalogEditorReviewMode || !exerciseCatalogCanEdit;
  }
  if (elements.exerciseCatalogParameterSelect) {
    elements.exerciseCatalogParameterSelect.disabled = next || exerciseCatalogEditorReviewMode || !exerciseCatalogCanEdit;
  }
  for (const control of elements.exerciseCatalogParameters?.querySelectorAll("input, button") || []) {
    control.disabled = next || exerciseCatalogEditorReviewMode || !exerciseCatalogCanEdit;
  }
}

function handleExerciseCatalogListClick(event) {
  const favorite = event.target.closest("[data-exercise-catalog-favorite]");
  if (favorite) {
    void toggleExerciseCatalogFavorite(favorite.dataset.exerciseCatalogFavorite || "");
    return;
  }
  const open = event.target.closest("[data-exercise-catalog-open]");
  if (open) {
    void openExerciseCatalogItem(open.dataset.exerciseCatalogOpen || "");
  }
}

function handleExerciseCatalogParameterClick(event) {
  const remove = event.target.closest("[data-exercise-catalog-parameter-remove]");
  if (
    !remove ||
    exerciseCatalogEditorReviewMode ||
    !exerciseCatalogCanEdit ||
    exerciseCatalogBusy ||
    remove.disabled
  ) return;
  syncExerciseCatalogParameterDraftsFromDom();
  const key = remove.dataset.exerciseCatalogParameterRemove || "";
  exerciseCatalogParameterDrafts = exerciseCatalogParameterDrafts.filter(
    (parameter) => parameter.key !== key,
  );
  renderExerciseCatalogParameters();
}

for (const control of [
  elements.exerciseCatalogSearch,
  elements.exerciseCatalogCategoryFilter,
  elements.exerciseCatalogGroupFilter,
  elements.exerciseCatalogMaterialFilter,
  elements.exerciseCatalogFavoriteFilter,
  elements.exerciseCatalogStatusFilter,
  elements.exerciseCatalogVideoFilter,
]) {
  control?.addEventListener("input", renderExerciseCatalogList);
  control?.addEventListener("change", renderExerciseCatalogList);
}
elements.exerciseCatalogFilterToggle?.addEventListener("click", () => {
  setExerciseCatalogFilterOpen(!exerciseCatalogFilterOpen);
});
elements.exerciseCatalogFilterClose?.addEventListener("click", () => {
  setExerciseCatalogFilterOpen(false);
});
elements.exerciseCatalogFilterScrim?.addEventListener("click", () => {
  setExerciseCatalogFilterOpen(false);
});
elements.exerciseCatalogFilterApply?.addEventListener("click", () => {
  setExerciseCatalogFilterOpen(false);
});
elements.exerciseCatalogFilterReset?.addEventListener("click", resetExerciseCatalogFilters);
elements.exerciseCatalogList?.addEventListener("click", handleExerciseCatalogListClick);
elements.exerciseCatalogImportOpen?.addEventListener("click", () => {
  if (!exerciseCatalogCanEdit || exerciseCatalogBusy) return;
  elements.exerciseCatalogImportFile?.click();
});
elements.exerciseCatalogImportFile?.addEventListener("change", () => {
  const file = elements.exerciseCatalogImportFile?.files?.[0] || null;
  if (elements.exerciseCatalogImportFile) elements.exerciseCatalogImportFile.value = "";
  if (file) void previewExerciseCatalogImportFile(file);
});
elements.exerciseCatalogImportClose?.addEventListener("click", closeExerciseCatalogImportPreview);
elements.exerciseCatalogImportApply?.addEventListener("click", () => {
  void applyExerciseCatalogImport();
});
elements.exerciseCatalogImportLog?.addEventListener("click", downloadExerciseCatalogImportLog);
elements.exerciseCatalogImportRows?.addEventListener("click", (event) => {
  const control = event.target.closest("[data-exercise-catalog-import-row]");
  if (!control) return;
  const index = Number(control.dataset.exerciseCatalogImportRow);
  if (Number.isSafeInteger(index) && index >= 0) reviewExerciseCatalogImportRow(index);
});
elements.exerciseCatalogTemplate?.addEventListener("click", () => {
  void downloadExerciseCatalogWorkbook(
    "/api/modules/exercise-catalog/template.xlsx",
    "ulc-uebungskatalog-importvorlage.xlsx",
    "Importvorlage wurde erstellt.",
  );
});
elements.exerciseCatalogExport?.addEventListener("click", () => {
  void downloadExerciseCatalogWorkbook(
    "/api/modules/exercise-catalog/export.xlsx",
    "ulc-uebungskatalog-export.xlsx",
    "Übungskatalog wurde exportiert.",
  );
});
elements.exerciseCatalogNew?.addEventListener("click", newExerciseCatalogItem);
elements.exerciseCatalogClose?.addEventListener("click", () => closeExerciseCatalogEditor(false));
elements.exerciseCatalogForm?.addEventListener("input", () => {
  if (
    !elements.exerciseCatalogEditor?.hidden &&
    !exerciseCatalogEditorReviewMode &&
    exerciseCatalogCanEdit
  ) {
    exerciseCatalogEditorDirty = true;
  }
});
elements.exerciseCatalogForm?.addEventListener("change", () => {
  if (
    !elements.exerciseCatalogEditor?.hidden &&
    !exerciseCatalogEditorReviewMode &&
    exerciseCatalogCanEdit
  ) {
    exerciseCatalogEditorDirty = true;
  }
});
elements.exerciseCatalogForm?.addEventListener("submit", (event) => void saveExerciseCatalogItem(event));
elements.exerciseCatalogDeactivate?.addEventListener("click", () => void deactivateExerciseCatalogItem());
elements.exerciseCatalogParameterAdd?.addEventListener("click", () => {
  addExerciseCatalogParameter();
  if (
    !elements.exerciseCatalogEditor?.hidden &&
    !exerciseCatalogEditorReviewMode &&
    exerciseCatalogCanEdit
  ) {
    exerciseCatalogEditorDirty = true;
  }
});
elements.exerciseCatalogParameters?.addEventListener("click", (event) => {
  const before = exerciseCatalogParameterDrafts.length;
  handleExerciseCatalogParameterClick(event);
  if (
    !exerciseCatalogEditorReviewMode &&
    exerciseCatalogCanEdit &&
    exerciseCatalogParameterDrafts.length !== before
  ) {
    exerciseCatalogEditorDirty = true;
  }
});
for (const control of document.querySelectorAll("[data-exercise-catalog-tab]")) {
  control.addEventListener("click", () => {
    setExerciseCatalogEditorTab(control.dataset.exerciseCatalogTab || "basis");
  });
}
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!elements.exerciseCatalogEditor?.hidden) {
    closeExerciseCatalogEditor(false);
    return;
  }
  if (!elements.exerciseCatalogImportPreview?.hidden) {
    closeExerciseCatalogImportPreview();
    return;
  }
  if (exerciseCatalogFilterOpen) setExerciseCatalogFilterOpen(false);
});
`;
