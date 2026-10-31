export const ULC_TRAINING_BLOCKS_HTML = `
          <section class="app-section" data-app-section="training-blocks" id="training-blocks" hidden>
            <section class="hero training-blocks-hero">
              <div>
                <p class="eyebrow">Training</p>
                <h1>Trainingsblöcke</h1>
                <p class="summary">Wiederverwendbare Trainingsvorlagen mit Übungen, Parametern und Versionen.</p>
              </div>
              <button class="button button--primary" id="training-block-new" type="button" hidden aria-label="Neuen Trainingsblock anlegen" title="Neuer Block">＋</button>
            </section>

            <p class="message message--error" id="training-block-message" role="alert" hidden></p>

            <section class="card training-block-commandbar">
              <label>Suche
                <input id="training-block-search" type="search" maxlength="160" placeholder="Block suchen …" autocomplete="off" />
              </label>
              <label>Gruppe
                <select id="training-block-audience-filter">
                  <option value="all">Alle Gruppen</option>
                  <option value="clubwide">Generell gültig</option>
                </select>
              </label>
              <label>Kategorie
                <select id="training-block-category-filter">
                  <option value="all">Alle Kategorien</option>
                  <option value="uncategorized">Ohne Kategorie</option>
                </select>
              </label>
              <label>Status
                <select id="training-block-status-filter">
                  <option value="active">Aktiv</option>
                  <option value="all">Alle</option>
                  <option value="archived">Archiv</option>
                </select>
              </label>
            </section>

            <section class="training-block-groups" id="training-block-list" aria-live="polite"></section>

            <div class="training-block-backdrop" id="training-block-editor" hidden>
              <section class="training-block-dialog" id="training-block-dialog" role="dialog" aria-modal="true" aria-labelledby="training-block-editor-title">
                <header class="training-block-header">
                  <div>
                    <p class="eyebrow" id="training-block-editor-eyebrow">Trainingsblock</p>
                    <h2 id="training-block-editor-title">Block bearbeiten</h2>
                    <span class="training-block-save-state" id="training-block-save-state" data-state="saved">Gespeichert</span>
                  </div>
                  <button class="button button--secondary" id="training-block-close" type="button" aria-label="Trainingsblock schließen" title="Schließen">✕</button>
                </header>

                <div class="training-block-body">
                  <p class="message message--error" id="training-block-editor-message" role="alert" hidden></p>
                  <button class="button button--secondary training-block-reload" id="training-block-reload" type="button" hidden>Aktuellen Stand neu laden</button>
                  <button class="button button--secondary training-block-retry" id="training-block-retry" type="button" hidden>Erneut versuchen</button>

                  <section class="card training-block-form-card">
                    <div class="training-block-form-grid">
                      <label class="training-block-wide">Name
                        <input id="training-block-name" minlength="1" maxlength="120" />
                      </label>
                      <label>Kategorie
                        <select id="training-block-category"><option value="">Ohne Kategorie</option></select>
                      </label>
                      <fieldset class="training-block-audience-field">
                        <legend>Trainingsgruppen</legend>
                        <div class="training-block-audience-picker" id="training-block-audience" role="group" aria-label="Trainingsgruppen auswählen"></div>
                        <small>„Generell gültig“ gilt für alle Gruppen. Mehrere Gruppen können kombiniert werden.</small>
                      </fieldset>
                      <label>Dauer (Min.)
                        <input id="training-block-duration" type="number" min="1" max="2147483647" step="1" inputmode="numeric" placeholder="Optional" />
                      </label>
                      <label class="training-block-wide">Notiz
                        <textarea id="training-block-note" maxlength="3000" rows="3" placeholder="Optional"></textarea>
                      </label>
                    </div>
                  </section>

                  <section class="card training-block-exercises-card">
                    <div class="section-heading">
                      <div><p class="eyebrow">Inhalt</p><h3>Übungen</h3></div>
                      <span id="training-block-exercise-count">0</span>
                    </div>
                    <div class="training-block-add">
                      <select id="training-block-exercise-category" aria-label="Übungskategorie filtern"></select>
                      <select id="training-block-exercise-picker" aria-label="Übung auswählen"></select>
                      <button class="button button--secondary" id="training-block-exercise-add" type="button">Hinzufügen</button>
                    </div>
                    <p class="settings-note" id="training-block-catalog-hint">Dieselbe Übung kann mehrfach hinzugefügt werden.</p>
                    <div class="training-block-exercises" id="training-block-exercises"></div>
                  </section>

                  <section class="card training-block-history-card" id="training-block-history-card">
                    <div class="section-heading">
                      <div><p class="eyebrow">Versionen</p><h3>Snapshots & Vergleich</h3></div>
                      <button class="button button--secondary" id="training-block-history-load" type="button">Versionen laden</button>
                    </div>
                    <div id="training-block-history" hidden>
                      <div class="training-block-history-list" id="training-block-history-list"></div>
                      <div class="training-block-compare-controls">
                        <label>Von<select id="training-block-compare-from"></select></label>
                        <label>Bis<select id="training-block-compare-to"></select></label>
                        <button class="button button--secondary" id="training-block-compare" type="button">Vergleichen</button>
                      </div>
                      <div class="training-block-revision-preview" id="training-block-revision-preview" hidden></div>
                      <div class="training-block-comparison" id="training-block-comparison" hidden></div>
                    </div>
                  </section>
                </div>

                <footer class="training-block-footer">
                  <div class="training-block-footer__meta">
                    <span id="training-block-usage-info"></span>
                    <span class="training-block-footer__hint">Neue Version erst beim Speichern.</span>
                  </div>
                  <div class="training-block-footer__actions">
                    <button class="button button--primary training-block-save-button" id="training-block-save" type="button">Speichern</button>
                    <details class="training-block-more">
                      <summary aria-label="Weitere Blockaktionen" title="Weitere Aktionen">•••</summary>
                      <div class="training-block-more__menu">
                        <button class="button button--secondary" id="training-block-duplicate" type="button" hidden>Duplizieren</button>
                        <button class="button button--secondary" id="training-block-favorite" type="button" hidden>☆ Favorit</button>
                        <button class="button button--danger" id="training-block-delete-unused" type="button" hidden>Unbenutzten Block löschen</button>
                        <button class="button button--danger" id="training-block-deactivate" type="button" hidden>Deaktivieren</button>
                         <button class="button button--primary" id="training-block-reactivate" type="button" hidden>Wieder aktivieren</button>
                      </div>
                    </details>
                  </div>
                </footer>
              </section>
            </div>

            <div class="training-block-info-backdrop" id="training-block-exercise-info" hidden>
              <section class="training-block-info-dialog" role="dialog" aria-modal="true" aria-labelledby="training-block-info-title">
                <header class="training-block-header">
                  <div><p class="eyebrow">Übung</p><h2 id="training-block-info-title">Details</h2></div>
                  <button class="button button--secondary" id="training-block-info-close" type="button" aria-label="Übungsdetails schließen" title="Schließen">✕</button>
                </header>
                <nav class="training-block-info-tabs" aria-label="Übungsdetails">
                  <button type="button" data-training-block-info-tab="basis" aria-selected="true">Basis</button>
                  <button type="button" data-training-block-info-tab="hinweise" aria-selected="false">Hinweise</button>
                  <button type="button" data-training-block-info-tab="zuordnung" aria-selected="false">Zuordnung</button>
                  <button type="button" data-training-block-info-tab="parameter" aria-selected="false">Parameter</button>
                  <button type="button" data-training-block-info-tab="videos" aria-selected="false">Videos</button>
                </nav>
                <div class="training-block-info-body" id="training-block-info-body"></div>
              </section>
            </div>
          </section>
`;

export const ULC_TRAINING_BLOCKS_CSS = `
.training-blocks-hero {
  display: flex;
  min-width: 0;
  align-items: end;
  justify-content: space-between;
  gap: 12px;
}
.training-block-commandbar {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;
  padding: 12px;
}
.training-block-groups { display: grid; gap: 12px; }
.training-block-group {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--card);
}
.training-block-group summary {
  display: flex;
  min-height: var(--touch);
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px;
  cursor: pointer;
  font-weight: 700;
}
.training-block-group__items { display: grid; border-top: 1px solid var(--border); }
.training-block-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items: center;
  padding: 12px 14px;
  border: 0;
  border-bottom: 1px solid var(--border);
  background: var(--card);
  text-align: left;
}
.training-block-row:last-child { border-bottom: 0; }
.training-block-row__main { min-width: 0; }
.training-block-row__main strong { display: block; }
.training-block-row__audience { display: block; margin-top: 3px; color: var(--text); font-size: .78rem; font-weight: 600; }
.training-block-row__meta { display: block; margin-top: 2px; color: var(--secondary); font-size: .75rem; }
.training-block-row__badge {
  border-radius: 999px;
  padding: 3px 8px;
  background: var(--muted);
  color: var(--secondary);
  font-size: .72rem;
}
.training-block-footer__actions,
.training-block-footer__meta {
  display: flex;
  align-items: center;
  gap: 8px;
}
.training-block-footer__actions { flex: 0 0 auto; }
.training-block-footer__meta {
  min-width: 0;
  flex: 1 1 auto;
  flex-wrap: wrap;
  color: var(--secondary);
  font-size: .74rem;
}
.training-block-save-button { min-width: 104px; }
.training-block-more { position: relative; }
.training-block-more > summary {
  display: grid;
  width: 44px;
  min-height: 44px;
  place-items: center;
  border: 1px solid var(--border-strong);
  border-radius: var(--control-radius);
  background: white;
  color: var(--secondary);
  cursor: pointer;
  font-size: 1rem;
  font-weight: 900;
  list-style: none;
}
.training-block-more > summary::-webkit-details-marker { display: none; }
.training-block-more__menu {
  position: absolute;
  right: 0;
  bottom: calc(100% + 8px);
  z-index: 8;
  display: grid;
  width: min(240px, calc(100vw - 24px));
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: white;
  box-shadow: 0 12px 32px rgb(15 23 42 / 18%);
}
.training-block-more__menu .button { width: 100%; justify-content: flex-start; }
.training-block-backdrop,
.training-block-info-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: end center;
  background: rgb(15 23 42 / 46%);
}
.training-block-info-backdrop { z-index: 90; }
.training-block-dialog,
.training-block-info-dialog {
  width: min(760px, 100vw);
  max-width: 100vw;
  min-width: 0;
  max-height: min(94dvh, 920px);
  overflow: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  border-radius: 18px 18px 0 0;
  background: var(--page);
  box-shadow: 0 -20px 50px rgb(15 23 42 / 22%);
}
.training-block-info-dialog { max-height: 84vh; }
.training-block-header {
  position: sticky;
  top: 0;
  z-index: 4;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 14px;
  border-bottom: 1px solid var(--border);
  background: rgb(255 255 255 / 96%);
}
.training-block-header > div:first-child { min-width: 0; }
.training-block-header h2 {
  margin: 2px 0 4px;
  overflow-wrap: anywhere;
  line-height: 1.2;
}
.training-block-save-state {
  display: inline-flex;
  border-radius: 999px;
  padding: 3px 8px;
  background: #dcfce7;
  color: #166534;
  font-size: .74rem;
  font-weight: 700;
}
.training-block-save-state[data-state="saving"] { background: #dbeafe; color: #1d4ed8; }
.training-block-save-state[data-state="error"],
.training-block-save-state[data-state="conflict"] { background: #fee2e2; color: #991b1b; }
.training-block-save-state[data-state="draft"] { background: #fef3c7; color: #92400e; }
.training-block-body {
  display: grid;
  min-width: 0;
  gap: 12px;
  padding: 12px;
  overflow-x: hidden;
}
.training-block-body > *,
.training-block-form-grid > *,
.training-block-exercise,
.training-block-history-card,
.training-block-exercises-card,
.training-block-form-card { min-width: 0; }
.training-block-form-card,
.training-block-exercises-card,
.training-block-history-card { max-width: 100%; overflow-x: hidden; }
.training-block-audience-field {
  min-width: 0;
  margin: 0;
  border: 0;
  padding: 0;
}
.training-block-audience-field legend {
  margin-bottom: 6px;
  font-size: .78rem;
  font-weight: 750;
}
.training-block-audience-field small {
  display: block;
  margin-top: 6px;
  color: var(--secondary);
}
.training-block-audience-picker {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 6px;
}
.training-block-audience-chip {
  min-height: 38px;
  max-width: 100%;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  padding: 7px 10px;
  background: white;
  color: var(--secondary);
  font-size: .78rem;
  font-weight: 750;
}
.training-block-audience-chip[aria-pressed="true"] {
  border-color: #93c5fd;
  background: #dbeafe;
  color: #1d4ed8;
}
.training-block-audience-chip:disabled { opacity: .55; }
.training-block-form-card,
.training-block-exercises-card,
.training-block-history-card { padding: 14px; }
.training-block-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.training-block-wide { grid-column: 1 / -1; }
.training-block-add {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  margin-bottom: 8px;
}
.training-block-exercises { display: grid; gap: 10px; }
.training-block-exercise {
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--control-radius);
  background: var(--card);
}
.training-block-exercise__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.training-block-exercise__meta { margin-top: 2px; color: var(--secondary); font-size: .78rem; }
.training-block-exercise__actions { display: flex; flex-wrap: nowrap; gap: 4px; }
.training-block-exercise__action {
  min-width: 34px;
  width: 34px;
  min-height: 34px;
  padding: 0;
  font-size: .86rem;
}
.training-block-exercise__editor {
  margin-top: 7px;
  border-top: 1px solid var(--border);
  padding-top: 6px;
}
.training-block-exercise__editor > summary {
  color: var(--secondary);
  cursor: pointer;
  font-size: .78rem;
  font-weight: 750;
}
.training-block-exercise__comment {
  display: block;
  margin-top: 8px;
}
.training-block-exercise__comment input { margin-top: 4px; }
.training-block-parameters { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; margin-top: 8px; }
.training-block-parameters--prescription {
  padding: 8px;
  border-radius: 10px;
  background: var(--muted);
}
.training-block-parameter { min-width: 0; }
.training-block-parameter input { min-height: 40px; }
.training-block-parameter small { display: block; margin-top: 3px; color: var(--secondary); }
.training-block-history-list { display: grid; gap: 6px; }
.training-block-history-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: center;
  padding: 9px 0;
  border-bottom: 1px solid var(--border);
}
.training-block-compare-controls {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 8px;
  align-items: end;
  margin-top: 12px;
}
.training-block-revision-preview,
.training-block-comparison {
  margin-top: 10px;
  padding: 12px;
  border-radius: var(--control-radius);
  background: var(--muted);
}
.training-block-revision-preview[hidden],
.training-block-comparison[hidden] { display: none; }
.training-block-version-head {
  display: grid;
  gap: 3px;
  margin-bottom: 10px;
}
.training-block-version-meta { color: var(--secondary); font-size: .76rem; }
.training-block-version-exercises { display: grid; gap: 7px; }
.training-block-version-exercise {
  padding: 9px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: white;
}
.training-block-version-exercise strong { display: block; }
.training-block-version-exercise span,
.training-block-version-exercise small { display: block; margin-top: 3px; color: var(--secondary); }
.training-block-comparison-list { display: grid; gap: 7px; }
.training-block-comparison-row {
  padding: 9px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: white;
}
.training-block-comparison-row strong { display: block; margin-bottom: 3px; }
.training-block-comparison-row span { display: block; color: var(--secondary); font-size: .78rem; }
.training-block-info-tabs {
  position: sticky;
  top: 73px;
  z-index: 3;
  display: flex;
  gap: 5px;
  overflow-x: auto;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  background: rgb(255 255 255 / 97%);
  scrollbar-width: none;
}
.training-block-info-tabs::-webkit-scrollbar { display: none; }
.training-block-info-tabs button {
  min-height: 36px;
  flex: 0 0 auto;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 6px 10px;
  background: white;
  color: var(--secondary);
  font-weight: 750;
}
.training-block-info-tabs button[aria-selected="true"] {
  border-color: #93c5fd;
  background: #dbeafe;
  color: #1d4ed8;
}
.training-block-info-body {
  min-width: 0;
  margin: 0;
  padding: 12px;
  border-radius: 0;
  background: var(--page);
}
.training-block-info-section { margin: 0; }
.training-block-info-section h3 { margin: 0 0 6px; }
.training-block-info-grid { display: grid; gap: 8px; }
.training-block-info-card {
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: white;
}
.training-block-info-card strong { display: block; margin-bottom: 3px; }
.training-block-info-card span,
.training-block-info-card p { margin: 0; color: var(--secondary); font-size: .82rem; line-height: 1.45; }
.training-block-info-video {
  width: 100%;
  max-height: 260px;
  margin-top: 7px;
  border-radius: 8px;
  background: #0f172a;
}
.training-block-footer {
  position: sticky;
  bottom: 0;
  z-index: 6;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px max(8px, env(safe-area-inset-bottom));
  border-top: 1px solid var(--border);
  background: rgb(255 255 255 / 96%);
  color: var(--secondary);
  font-size: .78rem;
}
body.training-block-editor-open { overflow: hidden; }
.training-block-reload { width: 100%; }
@media (max-width: 480px) {
  .training-blocks-hero { align-items: stretch; flex-direction: column; }
  .training-block-backdrop { place-items: stretch; }
  .training-block-dialog {
    width: 100vw;
    height: 100dvh;
    max-height: 100dvh;
    border-radius: 0;
  }
  .training-block-info-dialog {
    width: 100vw;
    max-height: 92dvh;
  }
  .training-block-header { padding: 10px 11px; }
  .training-block-header .button { min-height: 40px; padding: 7px 9px; }
  .training-block-body { padding: 8px; gap: 8px; }
  .training-block-form-card,
  .training-block-exercises-card,
  .training-block-history-card { padding: 10px; }
  .training-block-info-tabs { top: 62px; }
  .training-block-commandbar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    padding: 10px;
  }
  .training-block-commandbar label:first-child { grid-column: 1 / -1; }
  .training-block-form-grid { grid-template-columns: 1fr; }
  .training-block-parameters { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .training-block-wide { grid-column: auto; }
  .training-block-exercise { padding: 9px; }
  .training-block-exercise__meta {
    max-width: 190px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .training-block-parameter small { display: none; }
  .training-block-footer__hint { display: none; }
  .training-block-footer__meta { font-size: .68rem; }
  .training-block-save-button { min-width: 92px; min-height: 40px; padding-inline: 10px; }
  .training-block-compare-controls { grid-template-columns: 1fr 1fr; }
  .training-block-compare-controls .button { grid-column: 1 / -1; }
}
/* Compact block editor and info-dialog actions remain visible on small screens. */
@media (max-width: 480px) {
  .training-block-header { padding-top: max(10px, env(safe-area-inset-top)); }
  #training-block-close,
  #training-block-info-close {
    flex: 0 0 44px;
    min-width: 44px;
    width: 44px;
    min-height: 44px;
    padding: 0;
    font-size: 1.05rem;
  }
  .training-block-form-grid > *,
  .training-block-body > *,
  .training-block-footer__actions,
  .training-block-footer__meta { min-width: 0; }
  .training-block-footer__actions { flex-shrink: 0; }
  .training-block-footer { padding-bottom: max(10px, env(safe-area-inset-bottom)); }
}
/* Training-block list summaries stay legible without shrinking action targets. */
@media (max-width: 480px) {
  .training-block-row {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    min-height: var(--touch);
    padding: 10px;
  }
  .training-block-row__main,
  .training-block-row__main strong,
  .training-block-row__audience,
  .training-block-row__meta { min-width: 0; overflow-wrap: anywhere; }
  .training-block-row__badge {
    max-width: 36vw;
    overflow-wrap: anywhere;
    text-align: right;
  }
  .training-block-group summary { min-width: 0; gap: 8px; padding: 10px; }
}

/* Category before exercise selection, still usable at phone width. */
.training-block-add { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; }
.training-block-add > select { min-width: 0; }
#training-block-new { min-width: 42px; width: 42px; min-height: var(--touch); font-size: 1.2rem; padding: 0; }
@media (max-width: 560px) {
  .training-block-add { grid-template-columns: minmax(0, 1fr) auto; }
  .training-block-add #training-block-exercise-category { grid-column: 1 / -1; }
}

.training-block-exercise__header > div:first-child { min-width: 0; flex: 1 1 auto; overflow-wrap: anywhere; }
.training-block-exercise__actions { flex: 0 0 auto; }
.training-block-field-missing {
  border: 2px solid #eab308 !important;
  background: #fef9c3 !important;
}

`;

export const ULC_TRAINING_BLOCKS_SCRIPT = `
const trainingBlockElements = Object.freeze({
  quickAction: document.querySelector("#training-block-quick-action"),
  accessLabel: document.querySelector("#training-block-access-label"),
  message: document.querySelector("#training-block-message"),
  list: document.querySelector("#training-block-list"),
  search: document.querySelector("#training-block-search"),
  audienceFilter: document.querySelector("#training-block-audience-filter"),
  categoryFilter: document.querySelector("#training-block-category-filter"),
  category: document.querySelector("#training-block-category"),
  statusFilter: document.querySelector("#training-block-status-filter"),
  newButton: document.querySelector("#training-block-new"),
  editor: document.querySelector("#training-block-editor"),
  dialog: document.querySelector("#training-block-dialog"),
  editorEyebrow: document.querySelector("#training-block-editor-eyebrow"),
  editorTitle: document.querySelector("#training-block-editor-title"),
  editorMessage: document.querySelector("#training-block-editor-message"),
  saveState: document.querySelector("#training-block-save-state"),
  reload: document.querySelector("#training-block-reload"),
  retry: document.querySelector("#training-block-retry"),
  close: document.querySelector("#training-block-close"),
  name: document.querySelector("#training-block-name"),
  audience: document.querySelector("#training-block-audience"),
  duration: document.querySelector("#training-block-duration"),
  note: document.querySelector("#training-block-note"),
  exercisePicker: document.querySelector("#training-block-exercise-picker"),
  exerciseCategory: document.querySelector("#training-block-exercise-category"),
  exerciseAdd: document.querySelector("#training-block-exercise-add"),
  exerciseCount: document.querySelector("#training-block-exercise-count"),
  exercises: document.querySelector("#training-block-exercises"),
  catalogHint: document.querySelector("#training-block-catalog-hint"),
  historyLoad: document.querySelector("#training-block-history-load"),
  history: document.querySelector("#training-block-history"),
  historyList: document.querySelector("#training-block-history-list"),
  compareFrom: document.querySelector("#training-block-compare-from"),
  compareTo: document.querySelector("#training-block-compare-to"),
  compare: document.querySelector("#training-block-compare"),
  revisionPreview: document.querySelector("#training-block-revision-preview"),
  comparison: document.querySelector("#training-block-comparison"),
  save: document.querySelector("#training-block-save"),
  duplicate: document.querySelector("#training-block-duplicate"),
  favorite: document.querySelector("#training-block-favorite"),
  usageInfo: document.querySelector("#training-block-usage-info"),
  deleteUnused: document.querySelector("#training-block-delete-unused"),
  deactivate: document.querySelector("#training-block-deactivate"),
  reactivate: document.querySelector("#training-block-reactivate"),
  info: document.querySelector("#training-block-exercise-info"),
  infoTitle: document.querySelector("#training-block-info-title"),
  infoBody: document.querySelector("#training-block-info-body"),
  infoClose: document.querySelector("#training-block-info-close"),
});

let trainingBlockSessionGeneration = 0;
let trainingBlocksReady = false;
let trainingBlocksCanEdit = false;
let trainingBlocks = [];
let trainingBlockAudiences = [];
let trainingBlockSelected = null;
let trainingBlockDraft = null;
let trainingBlockDirty = false;
let trainingBlockConflict = false;
let trainingBlockSaveTimer = null;
let trainingBlockSaveBusy = false;
let trainingBlockSavePending = false;
let trainingBlockChangeVersion = 0;
let trainingBlockCreateUncertain = false;
let trainingBlockDeactivateBusy = false;
let trainingBlockDuplicateBusy = false;
let trainingBlockFavoriteBusy = false;
let trainingBlockFavoriteRequestId = 0;
let trainingBlockReloadBusy = false;
let trainingBlockAudienceRequestId = 0;
let trainingBlockOpenRequestId = 0;
let trainingBlockHistoryRequestId = 0;
let trainingBlockRevisionRequestId = 0;
let trainingBlockCompareRequestId = 0;
let trainingBlockInfoRequestId = 0;
let trainingBlockInfoItem = null;
let trainingBlockInfoPrivateMedia = [];
let trainingBlockInfoPrivateMediaAvailable = false;
let trainingBlockInfoTab = "basis";

function isCurrentTrainingBlockSelection(blockId, requestId) {
  return (
    requestId === trainingBlockOpenRequestId &&
    trainingBlockSelected?.id === blockId
  );
}

function invalidateTrainingBlockOverviewRefresh() {
  trainingBlockAudienceRequestId += 1;
}

function invalidateTrainingBlockComparison() {
  trainingBlockCompareRequestId += 1;
  if (trainingBlockElements.comparison) {
    trainingBlockElements.comparison.hidden = true;
    trainingBlockElements.comparison.textContent = "";
  }
}

function isTrainingBlockAudience(value) {
  return value !== null &&
    typeof value === "object" &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.name === "string" &&
    value.name.length > 0 &&
    (value.shortName === null || typeof value.shortName === "string");
}

function isTrainingBlockRevision(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1 ||
    typeof value.name !== "string" ||
    value.name.length < 1 ||
    (value.audienceId !== null && typeof value.audienceId !== "string") ||
    !Array.isArray(value.audienceIds) ||
    !value.audienceIds.every((id) => typeof id === "string" && id.length > 0) ||
    (value.audienceIds[0] ?? null) !== value.audienceId ||
    (value.durationMinutes !== null &&
      (!Number.isSafeInteger(value.durationMinutes) || value.durationMinutes < 1)) ||
    (value.note !== null && typeof value.note !== "string") ||
    !Array.isArray(value.exercises) ||
    typeof value.createdAt !== "string"
  ) return false;
  return value.exercises.every((exercise) =>
    exercise !== null &&
    typeof exercise === "object" &&
    typeof exercise.itemId === "string" &&
    typeof exercise.exerciseId === "string" &&
    (exercise.note === null || typeof exercise.note === "string") &&
    Array.isArray(exercise.parameterOverrides)
  );
}

function isTrainingBlockSnapshot(value) {
  return value !== null &&
    typeof value === "object" &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.isActive === "boolean" &&
    Number.isSafeInteger(value.currentRevision) &&
    value.currentRevision >= 1 &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    typeof value.isFavorite === "boolean" &&
    Number.isSafeInteger(value.usageCount) &&
    value.usageCount >= 0 &&
    (value.lastUsedAt === null || typeof value.lastUsedAt === "string") &&
    isTrainingBlockRevision(value.revision) &&
    value.revision.revision === value.currentRevision;
}

async function bootstrapTrainingBlocks() {
  const generation = trainingBlockSessionGeneration;
  trainingBlocksReady = false;
  trainingBlocksCanEdit = false;
  trainingBlocks = [];
  trainingBlockAudiences = [];
  closeTrainingBlockEditor(true);
  refreshAppAvailability();
  showMessage(trainingBlockElements.message, "");
  try {
    const payload = await requestJson("/api/modules/training-blocks");
    if (generation !== trainingBlockSessionGeneration) return;
    const blocks = payload?.blocks;
    const audiences = payload?.audiences;
    const features = payload?.module?.features;
    if (
      payload?.module?.moduleId !== "training_blocks" ||
      payload?.module?.capabilities?.view !== "training-blocks:view" ||
      payload?.module?.capabilities?.edit !== "training-blocks:edit" ||
      features?.autosave !== true ||
      features?.revisions !== true ||
      features?.revisionComparison !== true ||
      features?.favorites !== true ||
      features?.usageSummary !== true ||
      features?.duplicate !== true ||
      features?.multipleAudiences !== true ||
      payload?.access?.view !== true ||
      typeof payload?.access?.edit !== "boolean" ||
      !Array.isArray(blocks) ||
      !blocks.every(isTrainingBlockSnapshot) ||
      !Array.isArray(audiences) ||
      !audiences.every(isTrainingBlockAudience)
    ) {
      throw new Error("INVALID_TRAINING_BLOCK_CONTRACT");
    }
    trainingBlocksReady = true;
    trainingBlocksCanEdit = payload.access.edit;
    trainingBlocks = blocks.slice();
    trainingBlockAudiences = audiences.slice();
    renderTrainingBlockAudienceFilter();
    renderTrainingBlocks();
  } catch (error) {
    if (generation !== trainingBlockSessionGeneration) return;
    showMessage(
      trainingBlockElements.message,
      error?.status === 403
        ? "Für Trainingsblöcke fehlt die Berechtigung."
        : "Trainingsblöcke sind derzeit nicht verfügbar.",
    );
  }
  if (generation === trainingBlockSessionGeneration) {
    refreshAppAvailability();
  }
}

function prepareTrainingBlocksView() {
  if (!trainingBlocksReady) return;
  renderTrainingBlocks();
  refreshTrainingBlockControls();
  refreshTrainingBlockCatalogDependency();
  void refreshTrainingBlockAudienceDependency();
}

async function refreshTrainingBlockAudienceDependency() {
  const generation = trainingBlockSessionGeneration;
  const requestId = ++trainingBlockAudienceRequestId;
  try {
    const payload = await requestJson("/api/modules/training-blocks");
    if (
      generation !== trainingBlockSessionGeneration ||
      requestId !== trainingBlockAudienceRequestId
    ) return;
    if (
      payload?.module?.moduleId !== "training_blocks" ||
      payload?.access?.view !== true ||
      typeof payload?.access?.edit !== "boolean" ||
      !Array.isArray(payload?.blocks) ||
      !payload.blocks.every(isTrainingBlockSnapshot) ||
      !Array.isArray(payload?.audiences) ||
      !payload.audiences.every(isTrainingBlockAudience)
    ) {
      throw new Error("INVALID_TRAINING_BLOCK_OVERVIEW");
    }
    trainingBlocksCanEdit = payload.access.edit;
    trainingBlocks = payload.blocks.slice();
    trainingBlockAudiences = payload.audiences.slice();
    renderTrainingBlockAudienceFilter();
    renderTrainingBlocks();
    refreshTrainingBlockControls();
    if (trainingBlockDraft) {
      renderTrainingBlockAudienceOptions();
      refreshTrainingBlockEditorLock();
    }
  } catch {
    if (
      generation !== trainingBlockSessionGeneration ||
      requestId !== trainingBlockAudienceRequestId
    ) return;
    showMessage(
      trainingBlockElements.message,
      "Trainingsgruppen konnten nicht aktualisiert werden. Der zuletzt geladene Stand bleibt sichtbar.",
    );
  }
}

function refreshTrainingBlockCatalogDependency() {
  if (!trainingBlockDraft) return;
  renderTrainingBlockAudienceOptions();
  renderTrainingBlockExercisePicker();
  renderTrainingBlockExercises();
}

function refreshTrainingBlockControls() {
  if (trainingBlockElements.quickAction) {
    trainingBlockElements.quickAction.disabled = !trainingBlocksReady;
  }
  if (trainingBlockElements.accessLabel) {
    trainingBlockElements.accessLabel.textContent = trainingBlocksReady
      ? trainingBlocksCanEdit
        ? "Lesen und Bearbeiten freigeschaltet."
        : "Nur Lesen freigeschaltet."
      : "Für deinen Benutzer derzeit nicht freigeschaltet.";
  }
  if (trainingBlockElements.newButton) {
    trainingBlockElements.newButton.hidden = !trainingBlocksCanEdit;
    trainingBlockElements.newButton.disabled =
      !trainingBlocksCanEdit ||
      trainingBlockDeactivateBusy ||
      trainingBlockReloadBusy;
  }
}

function trainingBlockAudienceLabel(id) {
  const audience = trainingBlockAudiences.find((value) => value.id === id);
  if (!audience) return id || "Ohne Gruppe";
  return audience.shortName
    ? audience.name + " (" + audience.shortName + ")"
    : audience.name;
}

function trainingBlockAudienceSetLabel(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return "Vereinsweit";
  return ids.map(trainingBlockAudienceLabel).join(", ");
}

function trainingBlockExerciseItem(id) {
  return exerciseCatalogItems.find((item) => item.id === id) || null;
}

function renderTrainingBlockAudienceFilter() {
  const select = trainingBlockElements.audienceFilter;
  if (!select) return;
  const previous = select.value || "all";
  select.replaceChildren();

  const all = document.createElement("option");
  all.value = "all";
  all.textContent = "Alle Gruppen";
  select.append(all);

  const clubwide = document.createElement("option");
  clubwide.value = "clubwide";
  clubwide.textContent = "Generell gültig";
  select.append(clubwide);

  for (const audience of trainingBlockAudiences.slice().sort((left, right) =>
    left.name.localeCompare(right.name, "de", { sensitivity: "base" }),
  )) {
    const option = document.createElement("option");
    option.value = audience.id;
    option.textContent = audience.name;
    select.append(option);
  }

  select.value = [...select.options].some((option) => option.value === previous)
    ? previous
    : "all";
}

function trainingBlockCategoryLabel(value) {
  return value ? categoryLabel(value) : "Ohne Kategorie";
}

function renderTrainingBlockCategoryEditor() {
  const select = trainingBlockElements.category;
  if (!select) return;
  const current = trainingBlockDraft?.category || "";
  select.replaceChildren();
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "Ohne Kategorie";
  select.append(empty);
  // Share the exercise catalog's canonical choices and keys; no separate list to drift.
  for (const category of EXERCISE_CATEGORIES) {
    const option = document.createElement("option");
    option.value = category.key;
    option.textContent = category.label;
    select.append(option);
  }
  // Keep pre-existing free-text values editable without silently changing them.
  if (current && !EXERCISE_CATEGORIES.some((category) => category.key === current)) {
    const legacy = document.createElement("option");
    legacy.value = current;
    legacy.textContent = current + " (bisherige Kategorie)";
    select.append(legacy);
  }
  select.value = current;
}

function renderTrainingBlockCategoryFilter() {
  const select = trainingBlockElements.categoryFilter;
  if (!select) return;
  const previous = select.value || "all";
  select.replaceChildren();
  for (const [value, label] of [["all", "Alle Kategorien"], ["uncategorized", "Ohne Kategorie"]]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.append(option);
  }
  for (const category of EXERCISE_CATEGORIES) {
    const option = document.createElement("option");
    option.value = category.key;
    option.textContent = category.label;
    select.append(option);
  }
  const legacyNames = [...new Set(trainingBlocks
    .map((block) => block.revision.category?.trim())
    .filter((value) => value && !EXERCISE_CATEGORIES.some((category) => category.key === value)))];
  legacyNames.sort((a, b) => a.localeCompare(b, "de", { sensitivity: "base" }));
  for (const name of legacyNames) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    select.append(option);
  }
  select.value = [...select.options].some((option) => option.value === previous)
    ? previous : "all";
}

function renderTrainingBlocks() {
  const container = trainingBlockElements.list;
  if (!container) return;
  container.replaceChildren();
  renderTrainingBlockCategoryFilter();

  const query = (trainingBlockElements.search?.value || "")
    .trim()
    .toLocaleLowerCase("de");
  const status = trainingBlockElements.statusFilter?.value || "active";
  const audience = trainingBlockElements.audienceFilter?.value || "all";
  const category = trainingBlockElements.categoryFilter?.value || "all";
  const filtered = trainingBlocks.filter((block) => {
    if (category === "uncategorized" && block.revision.category) return false;
    if (category !== "all" && category !== "uncategorized" &&
        block.revision.category !== category) return false;
    if (status === "active" && !block.isActive) return false;
    if (status === "archived" && block.isActive) return false;
    if (audience === "clubwide" && block.revision.audienceIds.length !== 0) {
      return false;
    }
    if (
      audience !== "all" &&
      audience !== "clubwide" &&
      !block.revision.audienceIds.includes(audience)
    ) {
      return false;
    }
    if (!query) return true;
    return (
      block.revision.name.toLocaleLowerCase("de").includes(query) ||
      trainingBlockCategoryLabel(block.revision.category).toLocaleLowerCase("de").includes(query) ||
      trainingBlockAudienceSetLabel(block.revision.audienceIds)
        .toLocaleLowerCase("de")
        .includes(query)
    );
  });

  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "card";
    empty.textContent =
      trainingBlocks.length === 0
        ? "Noch keine Trainingsblöcke vorhanden."
        : "Keine Trainingsblöcke entsprechen der Auswahl.";
    container.append(empty);
    return;
  }

  filtered
    .slice()
    .sort((left, right) =>
      left.revision.name.localeCompare(right.revision.name, "de", {
        sensitivity: "base",
      }),
    )
    .forEach((block) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "training-block-row";
      row.dataset.trainingBlockOpen = block.id;
      const main = document.createElement("span");
      main.className = "training-block-row__main";
      const strong = document.createElement("strong");
      strong.textContent = block.revision.name;
      const audienceLabel = document.createElement("span");
      audienceLabel.className = "training-block-row__audience";
      audienceLabel.textContent = trainingBlockAudienceSetLabel(
        block.revision.audienceIds,
      );
      const meta = document.createElement("span");
      meta.className = "training-block-row__meta";
      meta.textContent = [
        block.revision.durationMinutes === null
          ? null
          : String(block.revision.durationMinutes) + " Min.",
        trainingBlockCategoryLabel(block.revision.category),
        String(block.revision.exercises.length) + " Übung(en)",
        block.isFavorite ? "★ Favorit" : null,
        block.usageCount === 0
          ? "Noch nicht verwendet"
          : String(block.usageCount) + "× verwendet",
        block.lastUsedAt
          ? "Zuletzt " + new Date(block.lastUsedAt).toLocaleDateString("de-AT")
          : null,
        "Version " + String(block.currentRevision),
      ].filter(Boolean).join(" · ");
      main.append(strong, audienceLabel, meta);
      const badge = document.createElement("span");
      badge.className = "training-block-row__badge";
      badge.textContent = block.isActive ? "Aktiv" : "Archiv";
      row.append(main, badge);
      container.append(row);
    });
}

function trainingBlockDraftFromSnapshot(block) {
  return {
    name: block.revision.name,
    audienceIds: block.revision.audienceIds.slice(),
    category: block.revision.category || "",
    durationMinutes: block.revision.durationMinutes,
    note: block.revision.note || "",
    exercises: block.revision.exercises.map((exercise) => ({
      itemId: exercise.itemId,
      exerciseId: exercise.exerciseId,
      note: exercise.note || "",
      parameterOverrides: exercise.parameterOverrides.map((value) => ({
        key: value.key,
        value: value.value,
      })),
    })),
  };
}

function newTrainingBlock() {
  if (
    trainingBlockDeactivateBusy ||
    trainingBlockDuplicateBusy ||
    trainingBlockReloadBusy ||
    !trainingBlocksCanEdit ||
    trainingBlockAudiences.length === 0
  ) return;
  if (trainingBlockDraft) {
    showMessage(
      trainingBlockElements.editorMessage,
      "Bitte den geöffneten Trainingsblock zuerst schließen.",
    );
    trainingBlockElements.close?.focus();
    return;
  }
  trainingBlockOpenRequestId += 1;
  trainingBlockSelected = null;
  trainingBlockDraft = {
    name: "",
    audienceIds: [],
    category: "",
    durationMinutes: null,
    note: "",
    exercises: [],
  };
  trainingBlockDirty = false;
  trainingBlockConflict = false;
  trainingBlockChangeVersion = 0;
  trainingBlockCreateUncertain = false;
  trainingBlockDeactivateBusy = false;
  trainingBlockReloadBusy = false;
  populateTrainingBlockEditor();
  scrollTrainingBlockEditorTop();
  trainingBlockElements.name?.focus();
}

async function openTrainingBlock(id, allowReload = false) {
  if (
    !trainingBlocksReady ||
    trainingBlockDeactivateBusy ||
    (trainingBlockReloadBusy && !allowReload)
  ) return false;
  if (trainingBlockDraft && !allowReload) {
    showMessage(
      trainingBlockElements.editorMessage,
      "Bitte den geöffneten Trainingsblock zuerst schließen.",
    );
    trainingBlockElements.close?.focus();
    return false;
  }
  const requestId = ++trainingBlockOpenRequestId;
  showMessage(trainingBlockElements.message, "");
  try {
    const payload = await requestJson(
      "/api/modules/training-blocks/" + encodeURIComponent(id),
    );
    if (requestId !== trainingBlockOpenRequestId) return false;
    if (!isTrainingBlockSnapshot(payload?.block)) {
      throw new Error("INVALID_TRAINING_BLOCK_DETAIL");
    }
    trainingBlockSelected = payload.block;
    trainingBlockDraft = trainingBlockDraftFromSnapshot(payload.block);
    trainingBlockDirty = false;
    trainingBlockConflict = false;
    trainingBlockChangeVersion = 0;
    trainingBlockCreateUncertain = false;
    trainingBlockDeactivateBusy = false;
    populateTrainingBlockEditor();
    if (!allowReload) {
      scrollTrainingBlockEditorTop();
      trainingBlockElements.close?.focus();
    }
    return true;
  } catch (error) {
    if (requestId !== trainingBlockOpenRequestId) return false;
    showMessage(
      trainingBlockElements.message,
      error?.status === 404
        ? "Der Trainingsblock wurde nicht gefunden."
        : "Der Trainingsblock konnte nicht geladen werden.",
    );
    return false;
  }
}

function scrollTrainingBlockEditorTop() {
  if (!trainingBlockElements.dialog) return;
  trainingBlockElements.dialog.scrollTop = 0;
  trainingBlockElements.dialog.scrollLeft = 0;
}

function populateTrainingBlockEditor() {
  if (!trainingBlockDraft) return;
  if (trainingBlockElements.editor) trainingBlockElements.editor.hidden = false;
  document.body.classList.add("training-block-editor-open");
  if (trainingBlockElements.editorEyebrow) {
    trainingBlockElements.editorEyebrow.textContent = trainingBlockSelected
      ? trainingBlockSelected.isActive
        ? "Trainingsblock"
        : "Archiv"
      : "Neuer Trainingsblock";
  }
  if (trainingBlockElements.editorTitle) {
    trainingBlockElements.editorTitle.textContent =
      trainingBlockDraft.name || "Neuer Trainingsblock";
  }
  renderTrainingBlockCategoryEditor();
  if (trainingBlockElements.name) {
    trainingBlockElements.name.value = trainingBlockDraft.name;
    trainingBlockElements.name.disabled =
      !trainingBlocksCanEdit || trainingBlockSelected?.isActive === false;
  }
  renderTrainingBlockAudienceOptions();
  if (trainingBlockElements.duration) {
    trainingBlockElements.duration.value =
      trainingBlockDraft.durationMinutes === null
        ? ""
        : String(trainingBlockDraft.durationMinutes);
    trainingBlockElements.duration.disabled =
      !trainingBlocksCanEdit || trainingBlockSelected?.isActive === false;
  }
  if (trainingBlockElements.note) {
    trainingBlockElements.note.value = trainingBlockDraft.note;
    trainingBlockElements.note.disabled =
      !trainingBlocksCanEdit || trainingBlockSelected?.isActive === false;
  }
  if (trainingBlockElements.reload) {
    trainingBlockElements.reload.hidden = true;
    trainingBlockElements.reload.textContent = "Aktuellen Stand neu laden";
  }
  if (trainingBlockElements.retry) trainingBlockElements.retry.hidden = true;
  if (trainingBlockElements.deactivate) {
    trainingBlockElements.deactivate.hidden =
      !trainingBlocksCanEdit ||
      !trainingBlockSelected ||
      !trainingBlockSelected.isActive ||
      trainingBlockDirty;
  }
  if (trainingBlockElements.reactivate) {
    trainingBlockElements.reactivate.hidden =
      !trainingBlocksCanEdit || !trainingBlockSelected ||
      trainingBlockSelected.isActive || trainingBlockDirty;
  }
  refreshTrainingBlockParityMetadata();
  showMessage(trainingBlockElements.editorMessage, "");
  renderTrainingBlockExercisePicker();
  renderTrainingBlockExercises();
  resetTrainingBlockHistory();
  setTrainingBlockSaveState(
    trainingBlockSelected ? "saved" : "draft",
    trainingBlockSelected ? "Gespeichert" : "Entwurf",
  );
  refreshTrainingBlockEditorLock();
}

function refreshTrainingBlockParityMetadata() {
  const block = trainingBlockSelected;
  if (trainingBlockElements.duplicate) {
    trainingBlockElements.duplicate.hidden =
      !block || !trainingBlocksCanEdit;
    trainingBlockElements.duplicate.disabled =
      !block ||
      !trainingBlocksCanEdit ||
      trainingBlockDuplicateBusy ||
      trainingBlockFavoriteBusy ||
      trainingBlockSaveBusy ||
      trainingBlockDeactivateBusy ||
      trainingBlockReloadBusy ||
      trainingBlockDirty;
  }
  if (trainingBlockElements.favorite) {
    trainingBlockElements.favorite.hidden = !block;
    trainingBlockElements.favorite.disabled =
      !block ||
      trainingBlockFavoriteBusy ||
      trainingBlockSaveBusy ||
      trainingBlockDeactivateBusy ||
      trainingBlockDuplicateBusy ||
      trainingBlockReloadBusy ||
      trainingBlockDirty;
    trainingBlockElements.favorite.textContent =
      block?.isFavorite ? "★ Favorit" : "☆ Favorit";
    trainingBlockElements.favorite.setAttribute(
      "aria-pressed",
      block?.isFavorite ? "true" : "false",
    );
  }
  if (trainingBlockElements.deleteUnused) {
    trainingBlockElements.deleteUnused.hidden =
      !block ||
      !trainingBlocksCanEdit ||
      block.usageCount !== 0;
    trainingBlockElements.deleteUnused.disabled =
      !block ||
      !trainingBlocksCanEdit ||
      block.usageCount !== 0 ||
      trainingBlockSaveBusy ||
      trainingBlockFavoriteBusy ||
      trainingBlockDeactivateBusy ||
      trainingBlockDuplicateBusy ||
      trainingBlockReloadBusy ||
      trainingBlockDirty;
  }
  if (trainingBlockElements.usageInfo) {
    if (!block) {
      trainingBlockElements.usageInfo.textContent = "";
    } else if (block.usageCount === 0) {
      trainingBlockElements.usageInfo.textContent = "Noch nicht verwendet";
    } else {
      trainingBlockElements.usageInfo.textContent =
        String(block.usageCount) +
        "× verwendet" +
        (block.lastUsedAt
          ? " · zuletzt " + new Date(block.lastUsedAt).toLocaleDateString("de-AT")
          : "");
    }
  }
}

function refreshTrainingBlockEditorLock() {
  const locked =
    trainingBlockDeactivateBusy ||
    trainingBlockDuplicateBusy ||
    trainingBlockReloadBusy ||
    trainingBlockFavoriteBusy ||
    trainingBlockSaveBusy;
  const editable =
    trainingBlocksCanEdit &&
    !locked &&
    trainingBlockSelected?.isActive !== false;

  for (const control of [
    trainingBlockElements.name,
    trainingBlockElements.category,
    trainingBlockElements.duration,
    trainingBlockElements.note,
  ]) {
    if (control) control.disabled = !editable;
  }
  if (trainingBlockElements.close) {
    trainingBlockElements.close.disabled = locked;
  }
  if (trainingBlockElements.save) {
    trainingBlockElements.save.disabled =
      locked ||
      !trainingBlocksCanEdit ||
      !trainingBlockDraft ||
      !trainingBlockDirty ||
      trainingBlockSelected?.isActive === false;
  }
  if (trainingBlockElements.duplicate) {
    trainingBlockElements.duplicate.disabled =
      locked ||
      !trainingBlocksCanEdit ||
      !trainingBlockSelected ||
      trainingBlockDirty;
  }
  if (trainingBlockElements.deleteUnused) {
    trainingBlockElements.deleteUnused.disabled =
      locked ||
      !trainingBlocksCanEdit ||
      !trainingBlockSelected ||
      trainingBlockSelected.usageCount !== 0 ||
      trainingBlockDirty;
  }
  if (trainingBlockElements.deactivate) {
    trainingBlockElements.deactivate.disabled =
      locked ||
      !trainingBlocksCanEdit ||
      !trainingBlockSelected ||
      !trainingBlockSelected.isActive;
  }
  if (trainingBlockElements.reactivate) {
    trainingBlockElements.reactivate.disabled =
      locked || !trainingBlocksCanEdit || !trainingBlockSelected ||
      trainingBlockSelected.isActive || trainingBlockDirty;
  }
  if (trainingBlockElements.reload) {
    trainingBlockElements.reload.disabled = locked;
  }
  if (trainingBlockElements.retry) {
    trainingBlockElements.retry.disabled = locked;
  }
  if (trainingBlockElements.historyLoad) {
    trainingBlockElements.historyLoad.disabled =
      locked || !trainingBlockSelected;
  }
  if (trainingBlockElements.compare) {
    trainingBlockElements.compare.disabled =
      locked ||
      !trainingBlockSelected ||
      !trainingBlockElements.compareFrom?.value ||
      !trainingBlockElements.compareTo?.value;
  }
  renderTrainingBlockExercisePicker();
  renderTrainingBlockExercises();
}

function renderTrainingBlockAudienceOptions() {
  const container = trainingBlockElements.audience;
  if (!container || !trainingBlockDraft) return;
  container.replaceChildren();
  const selected = new Set(trainingBlockDraft.audienceIds || []);
  const disabled =
    !trainingBlocksCanEdit ||
    trainingBlockDeactivateBusy ||
    trainingBlockDuplicateBusy ||
    trainingBlockReloadBusy ||
    trainingBlockFavoriteBusy ||
    trainingBlockSaveBusy ||
    trainingBlockSelected?.isActive === false;

  const clubwide = document.createElement("button");
  clubwide.type = "button";
  clubwide.className = "training-block-audience-chip";
  clubwide.dataset.trainingBlockAudienceId = "__clubwide__";
  clubwide.setAttribute("aria-pressed", selected.size === 0 ? "true" : "false");
  clubwide.disabled = disabled;
  clubwide.textContent = "Generell gültig";
  container.append(clubwide);

  for (const audience of trainingBlockAudiences
    .slice()
    .sort((left, right) =>
      left.name.localeCompare(right.name, "de", { sensitivity: "base" }),
    )) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "training-block-audience-chip";
    button.dataset.trainingBlockAudienceId = audience.id;
    button.setAttribute(
      "aria-pressed",
      selected.has(audience.id) ? "true" : "false",
    );
    button.disabled = disabled;
    button.textContent = trainingBlockAudienceLabel(audience.id);
    container.append(button);
  }
}

function handleTrainingBlockAudienceClick(event) {
  const control = event.target?.closest?.("[data-training-block-audience-id]");
  if (!control || !trainingBlockDraft || control.disabled) return;
  const id = control.dataset.trainingBlockAudienceId || "";
  if (id === "__clubwide__") {
    trainingBlockDraft.audienceIds = [];
  } else if (trainingBlockDraft.audienceIds.includes(id)) {
    trainingBlockDraft.audienceIds = trainingBlockDraft.audienceIds.filter(
      (value) => value !== id,
    );
  } else {
    trainingBlockDraft.audienceIds = [...trainingBlockDraft.audienceIds, id];
  }
  renderTrainingBlockAudienceOptions();
  markTrainingBlockDirty();
}

function renderTrainingBlockExercisePicker() {
  const select = trainingBlockElements.exercisePicker;
  if (!select) return;
  select.replaceChildren();
  const activeCategories = [...new Set(exerciseCatalogItems.filter((item) => item.isActive).map((item) => item.categoryKey))].sort();
  const categorySelect = trainingBlockElements.exerciseCategory;
  const previouslySelectedCategory = categorySelect?.value || "";
  if (categorySelect) {
    categorySelect.replaceChildren();
    const all = document.createElement("option");
    all.value = "";
    all.textContent = "Alle Kategorien";
    categorySelect.append(all);
    for (const category of activeCategories) {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = categoryLabel(category);
      categorySelect.append(option);
    }
    categorySelect.value = activeCategories.includes(previouslySelectedCategory) ? previouslySelectedCategory : "";
  }
  const selectedCategory = categorySelect?.value || "";
  const activeItems = exerciseCatalogItems
    .filter((item) => item.isActive && (!selectedCategory || item.categoryKey === selectedCategory))
    .sort((a, b) =>
      a.name.localeCompare(b.name, "de", { sensitivity: "base" }),
    );
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent =
    exerciseCatalogReady && activeItems.length > 0
      ? "Übung auswählen"
      : "Übungskatalog nicht verfügbar";
  select.append(placeholder);
  for (const item of activeItems) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    select.append(option);
  }
  const editable =
    trainingBlocksCanEdit &&
    !trainingBlockDeactivateBusy &&
    !trainingBlockReloadBusy &&
    !trainingBlockFavoriteBusy &&
    trainingBlockSelected?.isActive !== false;
  const atExerciseLimit =
    (trainingBlockDraft?.exercises.length || 0) >= 200;
  select.disabled =
    !editable ||
    !exerciseCatalogReady ||
    activeItems.length === 0 ||
    atExerciseLimit;
  if (trainingBlockElements.exerciseAdd) {
    trainingBlockElements.exerciseAdd.disabled = select.disabled;
  }
  if (trainingBlockElements.catalogHint) {
    trainingBlockElements.catalogHint.textContent = atExerciseLimit
      ? "Maximal 200 Übungen pro Trainingsblock."
      : exerciseCatalogReady
        ? "Dieselbe Übung kann mehrfach hinzugefügt werden."
        : "Übungen können erst hinzugefügt werden, wenn der Übungskatalog geladen ist.";
  }
}

function trainingBlockParameterValue(draft, parameter) {
  const override = draft.parameterOverrides.find(
    (value) => value.key === parameter.key,
  );
  return override ? override.value : parameter.defaultValue || "";
}

function trainingBlockParameterValueByKey(draft, item, key) {
  const override = draft.parameterOverrides.find(
    (value) => value.key === key,
  );
  if (override) return override.value;
  const parameter = item?.parameters.find((value) => value.key === key);
  return parameter?.defaultValue || "";
}

function trainingBlockExerciseCompactSummary(draft, item) {
  const sets = trainingBlockParameterValueByKey(draft, item, "sets");
  const repetitions =
    trainingBlockParameterValueByKey(draft, item, "repetitions");
  const prescription =
    sets && repetitions
      ? sets + " × " + repetitions
      : sets
        ? sets + " Sätze"
        : repetitions
          ? repetitions + " Wdh."
          : "";
  const otherAmounts = (item?.parameters || [])
    .filter((parameter) => parameter.key !== "sets" && parameter.key !== "repetitions")
    .map((parameter) => {
      const value = trainingBlockParameterValueByKey(draft, item, parameter.key);
      if (!value) return "";
      return String(value) + (parameter.unit ? " " + parameter.unit : "");
    })
    .filter(Boolean);
  const amounts = [prescription, ...otherAmounts].filter(Boolean).join(" × ");
  return [amounts, draft.note || ""]
    .filter(Boolean)
    .join(" · ") || "Planwerte bearbeiten";
}

function refreshTrainingBlockExerciseCompactSummary(index) {
  if (!trainingBlockDraft) return;
  const draft = trainingBlockDraft.exercises[index];
  if (!draft) return;
  const summary = trainingBlockElements.exercises?.querySelector(
    '[data-training-block-exercise-summary="' + String(index) + '"]',
  );
  if (!summary) return;
  summary.textContent = trainingBlockExerciseCompactSummary(
    draft,
    trainingBlockExerciseItem(draft.exerciseId),
  );
}

function renderTrainingBlockExercises() {
  const container = trainingBlockElements.exercises;
  if (!container || !trainingBlockDraft) return;
  container.replaceChildren();
  if (trainingBlockElements.exerciseCount) {
    trainingBlockElements.exerciseCount.textContent =
      String(trainingBlockDraft.exercises.length);
  }
  const editable =
    trainingBlocksCanEdit &&
    !trainingBlockDeactivateBusy &&
    !trainingBlockReloadBusy &&
    !trainingBlockFavoriteBusy &&
    trainingBlockSelected?.isActive !== false;
  trainingBlockDraft.exercises.forEach((draft, index) => {
    const item = trainingBlockExerciseItem(draft.exerciseId);
    const row = document.createElement("article");
    row.className = "training-block-exercise";
    if (item && !item.isActive) {
      row.classList.add("training-block-exercise--unavailable");
    }
    row.dataset.trainingBlockExerciseIndex = String(index);

    const header = document.createElement("div");
    header.className = "training-block-exercise__header";
    const title = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = item?.name || draft.exerciseId;
    const meta = document.createElement("div");
    meta.className = "training-block-exercise__meta";
    meta.textContent = item
      ? item.isActive
        ? [categoryLabel(item.categoryKey), item.subcategory, item.goal]
            .filter(Boolean)
            .join(" · ")
        : "Archiviert – bitte entfernen und bei Bedarf durch eine aktive Übung ersetzen"
      : "Kataloginformation nicht verfügbar";
    title.append(strong, meta);

    const actions = document.createElement("div");
    actions.className = "training-block-exercise__actions";
    const info = trainingBlockActionButton("ⓘ", "info", index, "Übungsinfo");
    actions.append(info);
    if (editable) {
      const up = trainingBlockActionButton("↑", "up", index, "Nach oben");
      const down = trainingBlockActionButton("↓", "down", index, "Nach unten");
      const remove = trainingBlockActionButton("×", "remove", index, "Entfernen");
      const unavailable = item?.isActive === false;
      up.disabled = unavailable || index === 0;
      down.disabled =
        unavailable || index === trainingBlockDraft.exercises.length - 1;
      actions.append(up, down, remove);
    }
    header.append(title, actions);
    row.append(header);

    const editor = document.createElement("details");
    editor.className = "training-block-exercise__editor";
    const editorSummary = document.createElement("summary");
    editorSummary.dataset.trainingBlockExerciseSummary = String(index);
    editorSummary.textContent = trainingBlockExerciseCompactSummary(draft, item);
    editor.append(editorSummary);

    if (item) {
      const prescription = document.createElement("div");
      prescription.className =
        "training-block-parameters training-block-parameters--prescription";
      for (const definition of [
        { key: "sets", label: "Sätze" },
        { key: "repetitions", label: "Wdh." },
      ]) {
        const catalogParameter = item.parameters.find(
          (parameter) => parameter.key === definition.key,
        );
        const label = document.createElement("label");
        label.className = "training-block-parameter";
        label.textContent = definition.label;
        const input = document.createElement("input");
        input.maxLength = 80;
        input.placeholder = "Optional";
        input.value = trainingBlockParameterValueByKey(
          draft,
          item,
          definition.key,
        );
        input.disabled = !editable || item.isActive === false;
        input.dataset.trainingBlockParameterIndex = String(index);
        input.dataset.trainingBlockParameterKey = definition.key;
        input.dataset.trainingBlockParameterDefault =
          catalogParameter?.defaultValue || "";
        const hint = document.createElement("small");
        hint.textContent =
          catalogParameter?.defaultValue
            ? "Katalogstandard: " + catalogParameter.defaultValue
            : "Freier Planwert";
        label.append(input, hint);
        prescription.append(label);
      }
      editor.append(prescription);
    }

    const noteLabel = document.createElement("label");
    noteLabel.className = "training-block-exercise__comment";
    noteLabel.textContent = "Kommentar";
    const noteInput = document.createElement("input");
    noteInput.maxLength = 2000;
    noteInput.placeholder = "Optional";
    noteInput.value = draft.note || "";
    noteInput.disabled = !editable || item?.isActive === false;
    noteInput.dataset.trainingBlockExerciseNote = String(index);
    noteLabel.append(noteInput);
    editor.append(noteLabel);

    if (item) {
      const currentKeys = new Set([
        ...item.parameters.map((parameter) => parameter.key),
        "sets",
        "repetitions",
      ]);
      const obsoleteCount = draft.parameterOverrides.filter(
        (override) => !currentKeys.has(override.key),
      ).length;
      if (obsoleteCount > 0) {
        const obsolete = document.createElement("small");
        obsolete.className = "training-block-exercise__meta";
        obsolete.textContent =
          String(obsoleteCount) +
          " veraltete(r) Parameterwert(e) werden beim nächsten Speichern entfernt.";
        editor.append(obsolete);
      }

      const additionalParameters = item.parameters
        .filter(
          (parameter) =>
            parameter.key !== "sets" &&
            parameter.key !== "repetitions",
        )
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder);
      if (additionalParameters.length > 0) {
        const parameters = document.createElement("div");
        parameters.className = "training-block-parameters";
        additionalParameters.forEach((parameter) => {
          const label = document.createElement("label");
          label.className = "training-block-parameter";
          label.textContent =
            parameter.label + (parameter.unit ? " (" + parameter.unit + ")" : "");
          const input = document.createElement("input");
          input.maxLength = 500;
          input.value = trainingBlockParameterValue(draft, parameter);
          input.disabled = !editable || item.isActive === false;
          input.dataset.trainingBlockParameterIndex = String(index);
          input.dataset.trainingBlockParameterKey = parameter.key;
          input.dataset.trainingBlockParameterDefault =
            parameter.defaultValue === null ? "" : parameter.defaultValue;
          if (parameter.inputType === "number") {
            input.type = "number";
            input.inputMode = "decimal";
            if (parameter.minValue !== null) input.min = String(parameter.minValue);
            if (parameter.maxValue !== null) input.max = String(parameter.maxValue);
            if (parameter.stepValue !== null) input.step = String(parameter.stepValue);
          }
          const hint = document.createElement("small");
          hint.textContent =
            parameter.defaultValue === null
              ? parameter.isRequired
                ? "Pflichtwert"
                : "Kein Katalogstandard"
              : "Katalogstandard: " + parameter.defaultValue;
          label.append(input, hint);
          parameters.append(label);
        });
        editor.append(parameters);
      }
    }
    row.append(editor);
    container.append(row);
  });
}

function trainingBlockActionButton(label, action, index, ariaLabel = label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button button--secondary training-block-exercise__action";
  button.textContent = label;
  button.title = ariaLabel;
  button.setAttribute("aria-label", ariaLabel);
  button.dataset.trainingBlockExerciseAction = action;
  button.dataset.trainingBlockExerciseIndex = String(index);
  return button;
}

function markTrainingBlockDirty() {
  if (
    !trainingBlockDraft ||
    !trainingBlocksCanEdit ||
    trainingBlockConflict ||
    trainingBlockDeactivateBusy ||
    trainingBlockReloadBusy ||
    trainingBlockSaveBusy
  ) return;
  trainingBlockChangeVersion += 1;
  trainingBlockDirty = true;
  if (trainingBlockCreateUncertain) {
    setTrainingBlockSaveState("error", "Anlagezustand unklar");
    return;
  }
  setTrainingBlockSaveState("draft", "Ungespeichert");
  refreshTrainingBlockParityMetadata();
  refreshTrainingBlockEditorLock();
}

function syncTrainingBlockDraftFromFields() {
  if (!trainingBlockDraft) return;
  trainingBlockDraft.name = (trainingBlockElements.name?.value || "").trim();
  trainingBlockDraft.category = (trainingBlockElements.category?.value || "").trim();
  const duration = trainingBlockElements.duration?.value || "";
  trainingBlockDraft.durationMinutes =
    duration === "" ? null : Number(duration);
  trainingBlockDraft.note = trainingBlockElements.note?.value || "";
  if (trainingBlockElements.editorTitle) {
    trainingBlockElements.editorTitle.textContent =
      trainingBlockDraft.name || "Neuer Trainingsblock";
  }
}

function trainingBlockDraftPayload() {
  if (!trainingBlockDraft) return null;
  return {
    name: trainingBlockDraft.name,
    audienceIds: trainingBlockDraft.audienceIds.slice(),
    category: trainingBlockDraft.category || null,
    durationMinutes: trainingBlockDraft.durationMinutes,
    note: trainingBlockDraft.note.trim() || null,
    exercises: trainingBlockDraft.exercises.map((exercise) => {
      const item = trainingBlockExerciseItem(exercise.exerciseId);
      const currentKeys =
        item === null
          ? null
          : new Set([
              ...item.parameters.map((parameter) => parameter.key),
              "sets",
              "repetitions",
            ]);
      return {
        ...(exercise.itemId ? { itemId: exercise.itemId } : {}),
        exerciseId: exercise.exerciseId,
        note: exercise.note.trim() || null,
        parameterOverrides: exercise.parameterOverrides
          .filter(
            (value) =>
              currentKeys === null || currentKeys.has(value.key),
          )
          .map((value) => ({
            key: value.key,
            value: value.value,
          })),
      };
    }),
  };
}

function trainingBlockParameterError(payload) {
  for (const exercise of payload?.exercises || []) {
    const item = trainingBlockExerciseItem(exercise.exerciseId);
    if (!item) continue;
    if (!item.isActive) {
      return (
        item.name +
        ": Diese Übung ist archiviert. Bitte aus dem Trainingsblock entfernen und bei Bedarf durch eine aktive Übung ersetzen."
      );
    }
    const definitions = new Map(
      item.parameters.map((parameter) => [parameter.key, parameter]),
    );
    const overrides = new Map(
      exercise.parameterOverrides.map((override) => [
        override.key,
        override.value,
      ]),
    );

    for (const override of exercise.parameterOverrides) {
      const definition = definitions.get(override.key);
      if (
        !definition &&
        override.key !== "sets" &&
        override.key !== "repetitions"
      ) continue;
      const value = String(override.value);
      if (
        (override.key === "sets" || override.key === "repetitions") &&
        Array.from(value).length > 80
      ) {
        return item.name + ": Planwert ist zu lang.";
      }
      if (!definition) continue;
      if (Array.from(value).length > 500 || value.trim().length === 0) {
        return item.name + ": " + definition.label + " ist ungültig.";
      }
      if (definition.inputType !== "number") continue;
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) {
        return item.name + ": " + definition.label + " muss eine Zahl sein.";
      }
      if (
        definition.minValue !== null &&
        numericValue < definition.minValue
      ) {
        return (
          item.name +
          ": " +
          definition.label +
          " muss mindestens " +
          String(definition.minValue) +
          " sein."
        );
      }
      if (
        definition.maxValue !== null &&
        numericValue > definition.maxValue
      ) {
        return (
          item.name +
          ": " +
          definition.label +
          " darf höchstens " +
          String(definition.maxValue) +
          " sein."
        );
      }
      if (
        definition.stepValue !== null &&
        !trainingBlockStepAligned(
          numericValue,
          definition.minValue ?? 0,
          definition.stepValue,
        )
      ) {
        return (
          item.name +
          ": " +
          definition.label +
          " passt nicht zur Schrittweite " +
          String(definition.stepValue) +
          "."
        );
      }
    }

    for (const definition of item.parameters) {
      if (
        definition.isRequired &&
        definition.defaultValue === null &&
        !overrides.has(definition.key)
      ) {
        return item.name + ": " + definition.label + " ist erforderlich.";
      }
    }
  }
  return null;
}

function trainingBlockStepAligned(value, base, step) {
  const quotient = (value - base) / step;
  const nearest = Math.round(quotient);
  const tolerance =
    Number.EPSILON * 16 * Math.max(1, Math.abs(quotient));
  return Math.abs(quotient - nearest) <= tolerance;
}

function trainingBlockDraftReady(payload) {
  return payload &&
    typeof payload.name === "string" &&
    payload.name.length >= 1 &&
    (payload.category === null || (
      typeof payload.category === "string" && payload.category.length <= 80
    )) &&
    Array.isArray(payload.audienceIds) &&
    payload.audienceIds.length <= 100 &&
    payload.audienceIds.every(
      (value) => typeof value === "string" && value.length > 0,
    ) &&
    (payload.durationMinutes === null ||
      (Number.isSafeInteger(payload.durationMinutes) &&
        payload.durationMinutes >= 1 &&
        payload.durationMinutes <= 2_147_483_647));
}

async function saveTrainingBlock() {
  if (
    !trainingBlockDirty ||
    !trainingBlocksCanEdit ||
    trainingBlockConflict ||
    trainingBlockCreateUncertain ||
    trainingBlockDeactivateBusy ||
    trainingBlockReloadBusy
  ) return;
  if (trainingBlockFavoriteBusy) {
    trainingBlockSavePending = true;
    return;
  }
  if (trainingBlockSaveBusy) {
    trainingBlockSavePending = true;
    return;
  }
  if (trainingBlockSaveTimer !== null) {
    clearTimeout(trainingBlockSaveTimer);
    trainingBlockSaveTimer = null;
  }
  syncTrainingBlockDraftFromFields();
  const payload = trainingBlockDraftPayload();
  const parameterError = trainingBlockParameterError(payload);
  if (parameterError !== null) {
    setTrainingBlockSaveState("draft", "Parameter prüfen");
    showMessage(trainingBlockElements.editorMessage, parameterError);
    return;
  }
  if (!trainingBlockDraftReady(payload)) {
    const missingName = !payload?.name?.trim();
    if (trainingBlockElements.name) {
      trainingBlockElements.name.classList.toggle("training-block-field-missing", missingName);
      trainingBlockElements.name.setAttribute("aria-invalid", missingName ? "true" : "false");
    }
    setTrainingBlockSaveState("draft", "Pflichtfelder prüfen");
    showMessage(
      trainingBlockElements.editorMessage,
      missingName
        ? "Pflichtfeld „Name“ fehlt. Bitte das gelb markierte Feld ausfüllen."
        : "Ungültige Angaben: Bitte Dauer und Trainingsgruppen prüfen.",
    );
    return;
  }
  trainingBlockElements.name?.classList.remove("training-block-field-missing");
  trainingBlockElements.name?.removeAttribute("aria-invalid");

  const saveVersion = trainingBlockChangeVersion;
  const creating = trainingBlockSelected === null;
  let saveSucceeded = false;
  trainingBlockSaveBusy = true;
  trainingBlockSavePending = false;
  refreshTrainingBlockParityMetadata();
  setTrainingBlockSaveState("saving", "Speichert …");
  showMessage(trainingBlockElements.editorMessage, "");
  try {
    const response = trainingBlockSelected
      ? await requestJson(
          "/api/modules/training-blocks/" +
            encodeURIComponent(trainingBlockSelected.id) +
            "/update",
          {
            method: "POST",
            body: JSON.stringify({
              expectedRevision: trainingBlockSelected.currentRevision,
              ...payload,
            }),
          },
        )
      : await requestJson("/api/modules/training-blocks", {
          method: "POST",
          body: JSON.stringify(payload),
        });
    if (!isTrainingBlockSnapshot(response?.block)) {
      throw new Error("INVALID_TRAINING_BLOCK_SAVE");
    }
    saveSucceeded = true;
    invalidateTrainingBlockOverviewRefresh();
    trainingBlockSelected = response.block;
    syncTrainingBlockItemIds(response.block);
    resetTrainingBlockHistory();
    trainingBlockDirty = trainingBlockChangeVersion !== saveVersion;
    replaceTrainingBlockInList(response.block);
    if (trainingBlockElements.retry) trainingBlockElements.retry.hidden = true;
    if (trainingBlockElements.reload) trainingBlockElements.reload.hidden = true;
    setTrainingBlockSaveState(
      trainingBlockDirty ? "draft" : "saved",
      trainingBlockDirty
        ? "Ungespeichert"
        : "Gespeichert · Version " + String(response.block.currentRevision),
    );
    if (trainingBlockElements.deactivate) {
      trainingBlockElements.deactivate.hidden =
        !trainingBlocksCanEdit || !response.block.isActive;
    }
    refreshTrainingBlockParityMetadata();
  } catch (error) {
    trainingBlockDirty = true;
    if (
      error?.status === 409 &&
      ["TRAINING_BLOCK_CONFLICT", "TRAINING_BLOCK_INACTIVE"].includes(error?.code)
    ) {
      trainingBlockConflict = true;
      setTrainingBlockSaveState(
        "conflict",
        error?.code === "TRAINING_BLOCK_INACTIVE"
          ? "Archiviert – aktuellen Stand laden"
          : "Konflikt – neuer Stand vorhanden",
      );
      if (trainingBlockElements.retry) trainingBlockElements.retry.hidden = true;
      if (trainingBlockElements.reload) trainingBlockElements.reload.hidden = false;
      showMessage(
        trainingBlockElements.editorMessage,
        error?.code === "TRAINING_BLOCK_INACTIVE"
          ? "Der Trainingsblock wurde inzwischen archiviert. Bitte aktuellen Stand neu laden; deine lokale Änderung wird nicht still überschrieben."
          : "Der Block wurde parallel geändert. Bitte aktuellen Stand neu laden; deine lokale Änderung wird nicht still überschrieben.",
      );
    } else if (
      creating &&
      !(
        typeof error?.status === "number" &&
        error.status >= 400 &&
        error.status < 500
      )
    ) {
      trainingBlockCreateUncertain = true;
      setTrainingBlockSaveState("error", "Anlagezustand unklar");
      if (trainingBlockElements.retry) trainingBlockElements.retry.hidden = true;
      if (trainingBlockElements.reload) {
        trainingBlockElements.reload.hidden = false;
        trainingBlockElements.reload.textContent = "Übersicht neu laden";
      }
      showMessage(
        trainingBlockElements.editorMessage,
        "Die Verbindung brach beim Anlegen ab. Der Block könnte bereits gespeichert sein. Bitte Übersicht neu laden, bevor du erneut anlegst.",
      );
    } else {
      setTrainingBlockSaveState("error", "Speichern fehlgeschlagen");
      if (trainingBlockElements.retry) trainingBlockElements.retry.hidden = false;
      showMessage(
        trainingBlockElements.editorMessage,
        error?.status === 400
          ? "Der Block enthält ungültige oder inzwischen nicht verfügbare Werte."
          : "Der Block konnte nicht gespeichert werden.",
      );
    }
  } finally {
    trainingBlockSaveBusy = false;
    trainingBlockSavePending = false;
    refreshTrainingBlockParityMetadata();
    refreshTrainingBlockEditorLock();
  }
}

function syncTrainingBlockItemIds(block) {
  if (!trainingBlockDraft) return;
  block.revision.exercises.forEach((exercise, index) => {
    if (trainingBlockDraft.exercises[index]) {
      trainingBlockDraft.exercises[index].itemId = exercise.itemId;
    }
  });
}

function replaceTrainingBlockInList(block) {
  const index = trainingBlocks.findIndex((value) => value.id === block.id);
  if (index >= 0) trainingBlocks[index] = block;
  else trainingBlocks.push(block);
  renderTrainingBlocks();
}

function setTrainingBlockSaveState(state, label) {
  if (!trainingBlockElements.saveState) return;
  trainingBlockElements.saveState.dataset.state = state;
  trainingBlockElements.saveState.textContent = label;
}

function closeTrainingBlockEditor(force = false) {
  if (!force && trainingBlockCreateUncertain) {
    showMessage(
      trainingBlockElements.editorMessage,
      "Der Anlagezustand ist unklar. Bitte die Übersicht neu laden, bevor du den Editor verlässt.",
    );
    if (trainingBlockElements.reload) {
      trainingBlockElements.reload.hidden = false;
      trainingBlockElements.reload.textContent = "Übersicht neu laden";
    }
    return false;
  }
  if (!force && trainingBlockDeactivateBusy) {
    showMessage(
      trainingBlockElements.editorMessage,
      "Archivieren läuft noch. Der Editor bleibt bis zum Abschluss gesperrt.",
    );
    return false;
  }
  if (!force && trainingBlockReloadBusy) {
    showMessage(
      trainingBlockElements.editorMessage,
      "Der aktuelle Stand wird geladen. Der Editor bleibt bis zum Abschluss gesperrt.",
    );
    return false;
  }
  if (!force && trainingBlockSaveBusy) {
    showMessage(
      trainingBlockElements.editorMessage,
      "Speichern läuft noch. Bitte den laufenden Speichervorgang abschließen lassen.",
    );
    return false;
  }
  if (!force && trainingBlockDirty) {
    const message = trainingBlockConflict
      ? "Es gibt lokale Änderungen mit einem Versionskonflikt. Lokale Änderungen wirklich verwerfen?"
      : "Es gibt noch nicht gespeicherte Änderungen. Trotzdem schließen?";
    if (!window.confirm(message)) return false;
  }
  if (trainingBlockSaveTimer !== null) {
    clearTimeout(trainingBlockSaveTimer);
    trainingBlockSaveTimer = null;
  }
  trainingBlockSavePending = false;
  trainingBlockOpenRequestId += 1;
  trainingBlockSelected = null;
  trainingBlockDraft = null;
  trainingBlockDirty = false;
  trainingBlockConflict = false;
  trainingBlockChangeVersion = 0;
  trainingBlockCreateUncertain = false;
  trainingBlockDeactivateBusy = false;
  trainingBlockDuplicateBusy = false;
  trainingBlockReloadBusy = false;
  if (trainingBlockElements.editor) trainingBlockElements.editor.hidden = true;
  scrollTrainingBlockEditorTop();
  document.body.classList.remove("training-block-editor-open");
  showMessage(trainingBlockElements.editorMessage, "");
  return true;
}

function resetTrainingBlockSessionState() {
  trainingBlockSessionGeneration += 1;
  trainingBlockAudienceRequestId += 1;
  trainingBlockOpenRequestId += 1;
  trainingBlockHistoryRequestId += 1;
  trainingBlockRevisionRequestId += 1;
  trainingBlockCompareRequestId += 1;
  trainingBlockInfoRequestId += 1;
  trainingBlockFavoriteRequestId += 1;

  trainingBlocksReady = false;
  trainingBlocksCanEdit = false;
  trainingBlocks = [];
  trainingBlockAudiences = [];
  trainingBlockInfoItem = null;
  trainingBlockInfoPrivateMedia = [];
  trainingBlockInfoPrivateMediaAvailable = false;
  closeTrainingBlockExerciseInfo();
  trainingBlockElements.infoBody?.replaceChildren();
  if (trainingBlockElements.infoTitle) trainingBlockElements.infoTitle.textContent = "";
  closeTrainingBlockEditor(true);
  invalidateTrainingBlockComparison();
  renderTrainingBlockAudienceFilter();
  renderTrainingBlocks();
  refreshTrainingBlockControls();
  showMessage(trainingBlockElements.message, "");
}

async function prepareTrainingBlockForSessionEnd() {
  while (trainingBlockSaveBusy) {
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }
  if (
    trainingBlockFavoriteBusy ||
    trainingBlockDeactivateBusy ||
    trainingBlockDuplicateBusy ||
    trainingBlockReloadBusy
  ) {
    showMessage(
      trainingBlockElements.editorMessage,
      "Im Trainingsblock läuft noch ein Vorgang. Bitte zuerst abschließen lassen.",
    );
    return false;
  }
  return closeTrainingBlockEditor(false);
}

function retryTrainingBlockSave() {
  if (
    !trainingBlockDraft ||
    !trainingBlocksCanEdit ||
    trainingBlockSaveBusy ||
    trainingBlockConflict ||
    trainingBlockCreateUncertain
  ) return;
  trainingBlockDirty = true;
  if (trainingBlockElements.retry) trainingBlockElements.retry.hidden = true;
  void saveTrainingBlock();
}

async function reloadTrainingBlock() {
  if (trainingBlockCreateUncertain) {
    if (
      window.confirm(
        "Die Seite wird neu geladen, damit geprüft werden kann, ob der Block bereits angelegt wurde. Lokale, nicht bestätigte Änderungen werden verworfen.",
      )
    ) {
      trainingBlockDirty = false;
      trainingBlockCreateUncertain = false;
      window.location.reload();
    }
    return;
  }
  if (
    !trainingBlockSelected ||
    trainingBlockReloadBusy ||
    trainingBlockFavoriteBusy
  ) return;
  const id = trainingBlockSelected.id;
  if (
    trainingBlockDirty &&
    !window.confirm("Lokale Änderungen verwerfen und aktuellen Stand laden?")
  ) return;
  trainingBlockReloadBusy = true;
  refreshTrainingBlockEditorLock();
  setTrainingBlockSaveState("saving", "Aktueller Stand wird geladen …");
  let reloaded = false;
  try {
    reloaded = await openTrainingBlock(id, true);
  } finally {
    trainingBlockReloadBusy = false;
    if (!reloaded && trainingBlockSelected?.id === id) {
      trainingBlockConflict = true;
      setTrainingBlockSaveState("conflict", "Neu laden fehlgeschlagen");
      if (trainingBlockElements.reload) {
        trainingBlockElements.reload.hidden = false;
      }
      showMessage(
        trainingBlockElements.editorMessage,
        "Der aktuelle Stand konnte nicht geladen werden. Bitte erneut versuchen.",
      );
    }
    refreshTrainingBlockEditorLock();
  }
}

function addTrainingBlockExercise() {
  if (
    !trainingBlockDraft ||
    !trainingBlocksCanEdit ||
    trainingBlockSaveBusy ||
    trainingBlockReloadBusy ||
    trainingBlockDraft.exercises.length >= 200
  ) return;
  const id = trainingBlockElements.exercisePicker?.value || "";
  if (!id || !trainingBlockExerciseItem(id)) return;
  trainingBlockDraft.exercises.push({
    itemId: null,
    exerciseId: id,
    note: "",
    parameterOverrides: [],
  });
  if (trainingBlockElements.exercisePicker) {
    trainingBlockElements.exercisePicker.value = "";
  }
  renderTrainingBlockExercises();
  markTrainingBlockDirty();
}

function handleTrainingBlockExerciseClick(event) {
  const control = event.target?.closest?.("[data-training-block-exercise-action]");
  if (!control || !trainingBlockDraft) return;
  const index = Number(control.dataset.trainingBlockExerciseIndex);
  if (!Number.isSafeInteger(index) || !trainingBlockDraft.exercises[index]) return;
  const action = control.dataset.trainingBlockExerciseAction;
  if (action === "info") {
    showTrainingBlockExerciseInfo(trainingBlockDraft.exercises[index].exerciseId);
    return;
  }
  if (
    !trainingBlocksCanEdit ||
    trainingBlockSaveBusy ||
    trainingBlockReloadBusy
  ) return;
  if (action === "remove") {
    trainingBlockDraft.exercises.splice(index, 1);
  } else if (action === "up" && index > 0) {
    const current = trainingBlockDraft.exercises[index];
    trainingBlockDraft.exercises[index] = trainingBlockDraft.exercises[index - 1];
    trainingBlockDraft.exercises[index - 1] = current;
  } else if (
    action === "down" &&
    index < trainingBlockDraft.exercises.length - 1
  ) {
    const current = trainingBlockDraft.exercises[index];
    trainingBlockDraft.exercises[index] = trainingBlockDraft.exercises[index + 1];
    trainingBlockDraft.exercises[index + 1] = current;
  } else {
    return;
  }
  renderTrainingBlockExercises();
  markTrainingBlockDirty();
}

function handleTrainingBlockExerciseInput(event) {
  if (
    !trainingBlockDraft ||
    !trainingBlocksCanEdit ||
    trainingBlockReloadBusy
  ) return;
  const noteIndex = event.target?.dataset?.trainingBlockExerciseNote;
  if (noteIndex !== undefined) {
    const index = Number(noteIndex);
    if (trainingBlockDraft.exercises[index]) {
      trainingBlockDraft.exercises[index].note = event.target.value || "";
      refreshTrainingBlockExerciseCompactSummary(index);
      markTrainingBlockDirty();
    }
    return;
  }
  const parameterIndex = event.target?.dataset?.trainingBlockParameterIndex;
  const key = event.target?.dataset?.trainingBlockParameterKey;
  if (parameterIndex === undefined || !key) return;
  const index = Number(parameterIndex);
  const draft = trainingBlockDraft.exercises[index];
  if (!draft) return;
  const item = trainingBlockExerciseItem(draft.exerciseId);
  const parameter = item?.parameters.find((value) => value.key === key);
  const standardKey = key === "sets" || key === "repetitions";
  if (!parameter && !standardKey) return;
  const value = event.target.value;
  const standard = parameter?.defaultValue || "";
  draft.parameterOverrides = draft.parameterOverrides.filter(
    (override) => override.key !== key,
  );
  if (
    value !== "" &&
    (
      parameter === undefined ||
      value !== standard ||
      (parameter.isRequired && parameter.defaultValue === null)
    )
  ) {
    draft.parameterOverrides.push({ key, value });
  }
  refreshTrainingBlockExerciseCompactSummary(index);
  markTrainingBlockDirty();
}

async function showTrainingBlockExerciseInfo(id) {
  const fallback = trainingBlockExerciseItem(id);
  if (!fallback || !trainingBlockElements.infoBody) return;
  const requestId = ++trainingBlockInfoRequestId;
  trainingBlockInfoItem = fallback;
  trainingBlockInfoPrivateMedia = [];
  trainingBlockInfoPrivateMediaAvailable = false;
  trainingBlockInfoTab = "basis";
  if (trainingBlockElements.infoTitle) {
    trainingBlockElements.infoTitle.textContent = fallback.name;
  }
  if (trainingBlockElements.info) trainingBlockElements.info.hidden = false;
  renderTrainingBlockExerciseInfo();

  try {
    const payload = await requestJson(
      "/api/modules/exercise-catalog/" + encodeURIComponent(id),
    );
    if (
      requestId !== trainingBlockInfoRequestId ||
      !isExerciseCatalogItem(payload?.item)
    ) {
      if (requestId === trainingBlockInfoRequestId) {
        throw new Error("INVALID_TRAINING_BLOCK_EXERCISE_INFO");
      }
      return;
    }
    trainingBlockInfoItem = payload.item;
    if (trainingBlockElements.infoTitle) {
      trainingBlockElements.infoTitle.textContent = payload.item.name;
    }
    renderTrainingBlockExerciseInfo();
  } catch {
    if (requestId !== trainingBlockInfoRequestId) return;
    trainingBlockInfoItem = fallback;
    renderTrainingBlockExerciseInfo();
  }

  try {
    const mediaPayload = await requestJson(
      "/api/modules/exercise-catalog/" +
        encodeURIComponent(id) +
        "/private-media",
    );
    if (requestId !== trainingBlockInfoRequestId) return;
    trainingBlockInfoPrivateMediaAvailable = mediaPayload?.available === true;
    trainingBlockInfoPrivateMedia = Array.isArray(mediaPayload?.media)
      ? mediaPayload.media.filter(
          (entry) =>
            entry !== null &&
            typeof entry === "object" &&
            typeof entry.id === "string" &&
            typeof entry.fileName === "string",
        )
      : [];
    if (trainingBlockInfoTab === "videos") renderTrainingBlockExerciseInfo();
  } catch {
    if (requestId !== trainingBlockInfoRequestId) return;
    trainingBlockInfoPrivateMediaAvailable = false;
    trainingBlockInfoPrivateMedia = [];
    if (trainingBlockInfoTab === "videos") renderTrainingBlockExerciseInfo();
  }
}

function setTrainingBlockInfoTab(tab) {
  const allowed = ["basis", "hinweise", "zuordnung", "parameter", "videos"];
  trainingBlockInfoTab = allowed.includes(tab) ? tab : "basis";
  for (const control of trainingBlockElements.info?.querySelectorAll(
    "[data-training-block-info-tab]",
  ) || []) {
    control.setAttribute(
      "aria-selected",
      control.dataset.trainingBlockInfoTab === trainingBlockInfoTab
        ? "true"
        : "false",
    );
  }
  renderTrainingBlockExerciseInfo();
}

function appendTrainingBlockInfoCard(container, title, value) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return;
  }
  const card = document.createElement("article");
  card.className = "training-block-info-card";
  const strong = document.createElement("strong");
  strong.textContent = title;
  const text = document.createElement("p");
  text.textContent = String(value);
  card.append(strong, text);
  container.append(card);
}

function renderTrainingBlockExerciseInfo() {
  const item = trainingBlockInfoItem;
  const container = trainingBlockElements.infoBody;
  if (!item || !container) return;
  container.replaceChildren();

  const section = document.createElement("section");
  section.className = "training-block-info-section";
  const grid = document.createElement("div");
  grid.className = "training-block-info-grid";
  section.append(grid);

  if (trainingBlockInfoTab === "basis") {
    const difficulty =
      item.difficultyKey === null
        ? "Keine Angabe"
        : EXERCISE_DIFFICULTIES.find(
            (value) => value.key === item.difficultyKey,
          )?.label || item.difficultyKey;
    appendTrainingBlockInfoCard(
      grid,
      "Einordnung",
      [categoryLabel(item.categoryKey), item.subcategory, item.goal]
        .filter(Boolean)
        .join(" · "),
    );
    appendTrainingBlockInfoCard(grid, "Schwierigkeit", difficulty);
    appendTrainingBlockInfoCard(
      grid,
      "Status",
      [
        item.isActive ? "Aktiv" : "Archiviert",
        item.isFavorite ? "Favorit" : null,
      ].filter(Boolean).join(" · "),
    );
    appendTrainingBlockInfoCard(grid, "Beschreibung", item.description);
    appendTrainingBlockInfoCard(
      grid,
      "Material",
      item.equipment.length ? item.equipment.join(", ") : "Kein Material hinterlegt",
    );
  } else if (trainingBlockInfoTab === "hinweise") {
    appendTrainingBlockInfoCard(
      grid,
      "Trainerhinweise",
      item.coachingCues || "Keine Trainerhinweise hinterlegt",
    );
    appendTrainingBlockInfoCard(
      grid,
      "Typische Fehler",
      item.commonMistakes || "Keine typischen Fehler hinterlegt",
    );
  } else if (trainingBlockInfoTab === "zuordnung") {
    const groups = item.groupIds
      .map((id) => {
        const group = exerciseCatalogGroups.find((value) => value.id === id);
        return group?.shortName
          ? group.name + " (" + group.shortName + ")"
          : group?.name || id;
      });
    const similar = item.similarExerciseIds
      .map((id) => exerciseCatalogItems.find((value) => value.id === id)?.name || id);
    appendTrainingBlockInfoCard(
      grid,
      "Geeignete Gruppen",
      groups.length ? groups.join(", ") : "Für alle Gruppen",
    );
    appendTrainingBlockInfoCard(
      grid,
      "Ähnliche Übungen",
      similar.length ? similar.join(", ") : "Keine ähnlichen Übungen hinterlegt",
    );
  } else if (trainingBlockInfoTab === "parameter") {
    if (item.parameters.length === 0) {
      appendTrainingBlockInfoCard(
        grid,
        "Planungsparameter",
        "Keine Planungsparameter hinterlegt",
      );
    }
    for (const parameter of item.parameters
      .slice()
      .sort((left, right) => left.sortOrder - right.sortOrder)) {
      const limits = [
        parameter.minValue === null ? null : "Min. " + String(parameter.minValue),
        parameter.maxValue === null ? null : "Max. " + String(parameter.maxValue),
        parameter.stepValue === null ? null : "Schritt " + String(parameter.stepValue),
      ].filter(Boolean);
      appendTrainingBlockInfoCard(
        grid,
        parameter.label + (parameter.unit ? " (" + parameter.unit + ")" : ""),
        [
          parameter.defaultValue === null
            ? "Kein Standardwert"
            : "Standard: " + parameter.defaultValue,
          parameter.isRequired ? "Pflichtwert" : "Optional",
          parameter.inputType === "number" ? "Zahl" : "Text",
          ...limits,
        ].join(" · "),
      );
    }
  } else {
    if (item.videoUrls.length === 0 && trainingBlockInfoPrivateMedia.length === 0) {
      appendTrainingBlockInfoCard(
        grid,
        "Videos",
        trainingBlockInfoPrivateMediaAvailable
          ? "Keine Videos hinterlegt"
          : "Keine öffentlichen Videos hinterlegt. Private Videos sind in dieser Umgebung nicht verfügbar oder konnten nicht geladen werden.",
      );
    }
    item.videoUrls.forEach((url, index) => {
      const card = document.createElement("article");
      card.className = "training-block-info-card";
      const strong = document.createElement("strong");
      strong.textContent = "Video-Link " + String(index + 1);
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = url;
      card.append(strong, link);
      grid.append(card);
    });
    for (const entry of trainingBlockInfoPrivateMedia) {
      const card = document.createElement("article");
      card.className = "training-block-info-card";
      const strong = document.createElement("strong");
      strong.textContent = entry.fileName;
      const video = document.createElement("video");
      video.className = "training-block-info-video";
      video.controls = true;
      video.preload = "metadata";
      video.src =
        "/api/modules/exercise-catalog/" +
        encodeURIComponent(item.id) +
        "/private-media/" +
        encodeURIComponent(entry.id) +
        "/content";
      card.append(strong, video);
      grid.append(card);
    }
  }

  container.append(section);
}

function closeTrainingBlockExerciseInfo() {
  trainingBlockInfoRequestId += 1;
  trainingBlockInfoItem = null;
  trainingBlockInfoPrivateMedia = [];
  trainingBlockInfoPrivateMediaAvailable = false;
  trainingBlockInfoTab = "basis";
  if (trainingBlockElements.info) trainingBlockElements.info.hidden = true;
}

async function toggleTrainingBlockFavorite() {
  const block = trainingBlockSelected;
  if (
    !block ||
    trainingBlockFavoriteBusy ||
    trainingBlockSaveBusy ||
    trainingBlockDeactivateBusy ||
    trainingBlockReloadBusy
  ) return;
  const blockId = block.id;
  const desired = !block.isFavorite;
  const operationId = ++trainingBlockFavoriteRequestId;
  trainingBlockFavoriteBusy = true;
  refreshTrainingBlockParityMetadata();
  refreshTrainingBlockEditorLock();
  showMessage(trainingBlockElements.editorMessage, "");
  try {
    const response = await requestJson(
      "/api/modules/training-blocks/" +
        encodeURIComponent(blockId) +
        "/favorite",
      { method: desired ? "PUT" : "DELETE" },
    );
    if (
      operationId !== trainingBlockFavoriteRequestId ||
      trainingBlockSelected?.id !== blockId
    ) return;
    if (!isTrainingBlockSnapshot(response?.block)) {
      throw new Error("INVALID_TRAINING_BLOCK_FAVORITE");
    }
    invalidateTrainingBlockOverviewRefresh();
    trainingBlockSelected = {
      ...trainingBlockSelected,
      isFavorite: response.block.isFavorite,
      usageCount: response.block.usageCount,
      lastUsedAt: response.block.lastUsedAt,
    };
    const index = trainingBlocks.findIndex((value) => value.id === blockId);
    if (index >= 0) {
      trainingBlocks[index] = {
        ...trainingBlocks[index],
        isFavorite: response.block.isFavorite,
        usageCount: response.block.usageCount,
        lastUsedAt: response.block.lastUsedAt,
      };
    }
    renderTrainingBlocks();
  } catch (error) {
    if (
      operationId === trainingBlockFavoriteRequestId &&
      trainingBlockSelected?.id === blockId
    ) {
      showMessage(
        trainingBlockElements.editorMessage,
        error?.status === 404
          ? "Der Trainingsblock wurde nicht gefunden."
          : "Der Favorit konnte nicht geändert werden.",
      );
    }
  } finally {
    if (operationId === trainingBlockFavoriteRequestId) {
      trainingBlockFavoriteBusy = false;
      refreshTrainingBlockParityMetadata();
      refreshTrainingBlockEditorLock();
      trainingBlockSavePending = false;
    }
  }
}

async function duplicateTrainingBlock() {
  if (
    trainingBlockDuplicateBusy ||
    trainingBlockSaveBusy ||
    trainingBlockFavoriteBusy ||
    trainingBlockDeactivateBusy ||
    trainingBlockReloadBusy ||
    !trainingBlockSelected ||
    !trainingBlocksCanEdit ||
    trainingBlockConflict ||
    trainingBlockCreateUncertain
  ) return;

  if (trainingBlockDirty) {
    await saveTrainingBlock();
    if (
      trainingBlockDirty ||
      trainingBlockSaveBusy ||
      trainingBlockConflict ||
      trainingBlockCreateUncertain
    ) return;
  }

  const sourceId = trainingBlockSelected.id;
  const copyName = trainingBlockSelected.revision.name + " – Kopie";
  trainingBlockDuplicateBusy = true;
  refreshTrainingBlockParityMetadata();
  refreshTrainingBlockEditorLock();
  showMessage(trainingBlockElements.editorMessage, "");
  setTrainingBlockSaveState("saving", "Kopie wird angelegt …");

  try {
    const payload = await requestJson(
      "/api/modules/training-blocks/" +
        encodeURIComponent(sourceId) +
        "/duplicate",
      {
        method: "POST",
        body: JSON.stringify({ name: copyName }),
      },
    );
    if (!isTrainingBlockSnapshot(payload?.block)) {
      throw new Error("INVALID_TRAINING_BLOCK_DUPLICATE");
    }

    invalidateTrainingBlockOverviewRefresh();
    replaceTrainingBlockInList(payload.block);
    trainingBlockSelected = payload.block;
    trainingBlockDraft = trainingBlockDraftFromSnapshot(payload.block);
    trainingBlockDirty = false;
    trainingBlockConflict = false;
    trainingBlockChangeVersion = 0;
    trainingBlockCreateUncertain = false;
    resetTrainingBlockHistory();
    populateTrainingBlockEditor();
    setTrainingBlockSaveState(
      "saved",
      "Kopie angelegt · Version " + String(payload.block.currentRevision),
    );
  } catch (error) {
    setTrainingBlockSaveState("error", "Duplizieren fehlgeschlagen");
    showMessage(
      trainingBlockElements.editorMessage,
      error?.status === 404
        ? "Der Quellblock wurde nicht gefunden."
        : error?.status === 400
          ? "Der Block kann mit seinen aktuellen Referenzen nicht dupliziert werden."
          : "Der Trainingsblock konnte nicht dupliziert werden.",
    );
  } finally {
    trainingBlockDuplicateBusy = false;
    refreshTrainingBlockParityMetadata();
    refreshTrainingBlockEditorLock();
  }
}

async function deleteUnusedTrainingBlock() {
  if (
    trainingBlockSaveBusy ||
    trainingBlockFavoriteBusy ||
    trainingBlockDeactivateBusy ||
    trainingBlockDuplicateBusy ||
    trainingBlockReloadBusy ||
    !trainingBlockSelected ||
    trainingBlockSelected.usageCount !== 0 ||
    !trainingBlocksCanEdit ||
    trainingBlockConflict ||
    trainingBlockCreateUncertain
  ) return;

  if (trainingBlockDirty) {
    await saveTrainingBlock();
    if (
      trainingBlockDirty ||
      trainingBlockSaveBusy ||
      trainingBlockConflict ||
      trainingBlockCreateUncertain
    ) return;
  }

  if (!window.confirm(
    "Diesen unbenutzten Trainingsblock endgültig löschen? Diese Aktion kann nicht rückgängig gemacht werden.",
  )) return;

  const id = trainingBlockSelected.id;
  const expectedRevision = trainingBlockSelected.currentRevision;
  trainingBlockDeactivateBusy = true;
  refreshTrainingBlockParityMetadata();
  refreshTrainingBlockEditorLock();
  setTrainingBlockSaveState("saving", "Löscht …");
  showMessage(trainingBlockElements.editorMessage, "");

  try {
    const payload = await requestJson(
      "/api/modules/training-blocks/" +
        encodeURIComponent(id) +
        "/delete-unused",
      {
        method: "POST",
        body: JSON.stringify({ expectedRevision }),
      },
    );
    if (payload?.deleted !== true) {
      throw new Error("INVALID_TRAINING_BLOCK_DELETE");
    }
    invalidateTrainingBlockOverviewRefresh();
    trainingBlocks = trainingBlocks.filter((block) => block.id !== id);
    trainingBlockDeactivateBusy = false;
    closeTrainingBlockEditor(true);
    renderTrainingBlocks();
  } catch (error) {
    if (error?.status === 409 && error?.code === "TRAINING_BLOCK_IN_USE") {
      setTrainingBlockSaveState("error", "Bereits verwendet");
      showMessage(
        trainingBlockElements.editorMessage,
        "Der Trainingsblock wurde inzwischen verwendet und kann deshalb nicht mehr gelöscht werden. Du kannst ihn stattdessen archivieren.",
      );
    } else if (error?.status === 409) {
      trainingBlockConflict = true;
      setTrainingBlockSaveState("conflict", "Konflikt – neuer Stand vorhanden");
      if (trainingBlockElements.reload) trainingBlockElements.reload.hidden = false;
      showMessage(
        trainingBlockElements.editorMessage,
        "Der Trainingsblock wurde inzwischen geändert. Bitte aktuellen Stand neu laden.",
      );
    } else {
      setTrainingBlockSaveState("error", "Löschen fehlgeschlagen");
      showMessage(
        trainingBlockElements.editorMessage,
        error?.status === 404
          ? "Der Trainingsblock wurde nicht gefunden."
          : "Der Trainingsblock konnte nicht gelöscht werden.",
      );
    }
  } finally {
    if (trainingBlockElements.editor && !trainingBlockElements.editor.hidden) {
      trainingBlockDeactivateBusy = false;
      refreshTrainingBlockParityMetadata();
      refreshTrainingBlockEditorLock();
    }
  }
}

async function reactivateTrainingBlock() {
  if (
    trainingBlockSaveBusy || trainingBlockDeactivateBusy || trainingBlockFavoriteBusy ||
    !trainingBlockSelected || trainingBlockSelected.isActive || !trainingBlocksCanEdit ||
    trainingBlockDirty || trainingBlockConflict || trainingBlockCreateUncertain
  ) return;
  if (!window.confirm("Diesen archivierten Trainingsblock wieder aktivieren?")) return;
  trainingBlockDeactivateBusy = true;
  setTrainingBlockSaveState("saving", "Wird aktiviert …");
  refreshTrainingBlockEditorLock();
  try {
    const payload = await requestJson(
      "/api/modules/training-blocks/" +
        encodeURIComponent(trainingBlockSelected.id) + "/reactivate",
      {
        method: "POST",
        body: JSON.stringify({ expectedRevision: trainingBlockSelected.currentRevision }),
      },
    );
    if (!isTrainingBlockSnapshot(payload?.block) || payload.block.isActive !== true) {
      throw new Error("INVALID_TRAINING_BLOCK_REACTIVATE");
    }
    invalidateTrainingBlockOverviewRefresh();
    replaceTrainingBlockInList(payload.block);
    trainingBlockDeactivateBusy = false;
    closeTrainingBlockEditor(true);
  } catch (error) {
    if (error?.status === 409) {
      trainingBlockConflict = true;
      setTrainingBlockSaveState("conflict", "Konflikt – neuer Stand vorhanden");
      if (trainingBlockElements.reload) trainingBlockElements.reload.hidden = false;
    } else {
      setTrainingBlockSaveState("error", "Aktivieren fehlgeschlagen");
    }
    showMessage(trainingBlockElements.editorMessage, "Der Trainingsblock konnte nicht aktiviert werden.");
  } finally {
    if (trainingBlockElements.editor && !trainingBlockElements.editor.hidden) {
      trainingBlockDeactivateBusy = false;
      refreshTrainingBlockParityMetadata();
      refreshTrainingBlockEditorLock();
    }
  }
}

async function deactivateTrainingBlock() {
  if (
    trainingBlockSaveBusy ||
    trainingBlockFavoriteBusy ||
    !trainingBlockSelected ||
    !trainingBlockSelected.isActive ||
    !trainingBlocksCanEdit ||
    trainingBlockConflict ||
    trainingBlockCreateUncertain
  ) return;
  if (trainingBlockDirty) {
    await saveTrainingBlock();
    if (
      trainingBlockDirty ||
      trainingBlockSaveBusy ||
      trainingBlockConflict ||
      trainingBlockCreateUncertain
    ) return;
  }
  if (!window.confirm("Diesen Trainingsblock archivieren?")) return;
  trainingBlockDeactivateBusy = true;
  setTrainingBlockSaveState("saving", "Archiviert …");
  refreshTrainingBlockEditorLock();
  try {
    const payload = await requestJson(
      "/api/modules/training-blocks/" +
        encodeURIComponent(trainingBlockSelected.id) +
        "/deactivate",
      {
        method: "POST",
        body: JSON.stringify({
          expectedRevision: trainingBlockSelected.currentRevision,
        }),
      },
    );
    if (!isTrainingBlockSnapshot(payload?.block)) {
      throw new Error("INVALID_TRAINING_BLOCK_DEACTIVATE");
    }
    invalidateTrainingBlockOverviewRefresh();
    replaceTrainingBlockInList(payload.block);
    trainingBlockDeactivateBusy = false;
    closeTrainingBlockEditor(true);
  } catch (error) {
    if (error?.status === 409) {
      trainingBlockConflict = true;
      setTrainingBlockSaveState("conflict", "Konflikt – neuer Stand vorhanden");
      if (trainingBlockElements.reload) trainingBlockElements.reload.hidden = false;
    } else {
      setTrainingBlockSaveState("error", "Archivieren fehlgeschlagen");
    }
    showMessage(
      trainingBlockElements.editorMessage,
      "Der Trainingsblock konnte nicht archiviert werden.",
    );
  } finally {
    if (trainingBlockElements.editor && !trainingBlockElements.editor.hidden) {
      trainingBlockDeactivateBusy = false;
      refreshTrainingBlockEditorLock();
    }
  }
}

function resetTrainingBlockHistory() {
  trainingBlockHistoryRequestId += 1;
  trainingBlockRevisionRequestId += 1;
  trainingBlockCompareRequestId += 1;
  if (trainingBlockElements.history) trainingBlockElements.history.hidden = true;
  if (trainingBlockElements.historyList) trainingBlockElements.historyList.replaceChildren();
  if (trainingBlockElements.compareFrom) trainingBlockElements.compareFrom.replaceChildren();
  if (trainingBlockElements.compareTo) trainingBlockElements.compareTo.replaceChildren();
  if (trainingBlockElements.revisionPreview) {
    trainingBlockElements.revisionPreview.hidden = true;
    trainingBlockElements.revisionPreview.textContent = "";
  }
  if (trainingBlockElements.comparison) {
    trainingBlockElements.comparison.hidden = true;
    trainingBlockElements.comparison.textContent = "";
  }
  if (trainingBlockElements.historyLoad) {
    trainingBlockElements.historyLoad.disabled = !trainingBlockSelected;
  }
}

async function loadTrainingBlockHistory() {
  if (!trainingBlockSelected) return;
  const blockId = trainingBlockSelected.id;
  const requestId = trainingBlockOpenRequestId;
  const operationId = ++trainingBlockHistoryRequestId;
  try {
    const payload = await requestJson(
      "/api/modules/training-blocks/" +
        encodeURIComponent(blockId) +
        "/revisions",
    );
    if (
      operationId !== trainingBlockHistoryRequestId ||
      !isCurrentTrainingBlockSelection(blockId, requestId)
    ) return;
    if (
      !Array.isArray(payload?.revisions) ||
      !payload.revisions.every(isTrainingBlockRevision)
    ) {
      throw new Error("INVALID_TRAINING_BLOCK_REVISIONS");
    }
    renderTrainingBlockHistory(payload.revisions);
  } catch {
    if (
      operationId !== trainingBlockHistoryRequestId ||
      !isCurrentTrainingBlockSelection(blockId, requestId)
    ) return;
    showMessage(
      trainingBlockElements.editorMessage,
      "Die Versionen konnten nicht geladen werden.",
    );
  }
}

function renderTrainingBlockHistory(revisions) {
  if (!trainingBlockElements.historyList) return;
  trainingBlockElements.historyList.replaceChildren();
  const sorted = revisions.slice().sort((a, b) => b.revision - a.revision);
  for (const revision of sorted) {
    const row = document.createElement("div");
    row.className = "training-block-history-row";
    const text = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = "Version " + String(revision.revision);
    const meta = document.createElement("div");
    meta.className = "training-block-row__meta";
    meta.textContent =
      revision.name +
      " · " +
      String(revision.exercises.length) +
      " Übung(en) · " +
      new Date(revision.createdAt).toLocaleString("de-AT");
    text.append(strong, meta);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button button--secondary";
    button.textContent = "Ansehen";
    button.dataset.trainingBlockRevisionOpen = String(revision.revision);
    row.append(text, button);
    trainingBlockElements.historyList.append(row);
  }
  renderTrainingBlockRevisionSelect(trainingBlockElements.compareFrom, sorted);
  renderTrainingBlockRevisionSelect(trainingBlockElements.compareTo, sorted);
  if (trainingBlockElements.compareFrom && sorted.length > 1) {
    trainingBlockElements.compareFrom.value =
      String(sorted[sorted.length - 1].revision);
  }
  if (trainingBlockElements.compareTo && sorted.length > 0) {
    trainingBlockElements.compareTo.value = String(sorted[0].revision);
  }
  if (trainingBlockElements.history) trainingBlockElements.history.hidden = false;
  refreshTrainingBlockEditorLock();
}

function renderTrainingBlockRevisionSelect(select, revisions) {
  if (!select) return;
  select.replaceChildren();
  for (const revision of revisions) {
    const option = document.createElement("option");
    option.value = String(revision.revision);
    option.textContent = "Version " + String(revision.revision);
    select.append(option);
  }
}

async function fetchTrainingBlockRevision(blockId, number) {
  const payload = await requestJson(
    "/api/modules/training-blocks/" +
      encodeURIComponent(blockId) +
      "/revisions/" +
      encodeURIComponent(String(number)),
  );
  if (!isTrainingBlockRevision(payload?.revision)) {
    throw new Error("INVALID_TRAINING_BLOCK_REVISION");
  }
  return payload.revision;
}

function trainingBlockRevisionParameterText(exercise) {
  const item = trainingBlockExerciseItem(exercise.exerciseId);
  if (!item) {
    return exercise.parameterOverrides
      .map((value) => value.key + ": " + value.value)
      .join(" · ");
  }
  const overrides = new Map(
    exercise.parameterOverrides.map((value) => [value.key, value.value]),
  );
  return item.parameters
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((parameter) => {
      const value = overrides.has(parameter.key)
        ? overrides.get(parameter.key)
        : parameter.defaultValue;
      if (value === null || value === undefined || value === "") return null;
      return (
        parameter.label +
        ": " +
        value +
        (parameter.unit ? " " + parameter.unit : "")
      );
    })
    .filter(Boolean)
    .join(" · ");
}

function renderTrainingBlockRevisionPreview(revision) {
  const container = trainingBlockElements.revisionPreview;
  if (!container) return;
  container.replaceChildren();

  const head = document.createElement("div");
  head.className = "training-block-version-head";
  const title = document.createElement("strong");
  title.textContent =
    "Version " + String(revision.revision) + " · " + revision.name;
  const meta = document.createElement("span");
  meta.className = "training-block-version-meta";
  meta.textContent = [
    "Gruppen: " + trainingBlockAudienceSetLabel(revision.audienceIds),
    revision.durationMinutes === null
      ? "Dauer: —"
      : "Dauer: " + String(revision.durationMinutes) + " Min.",
    new Date(revision.createdAt).toLocaleString("de-AT"),
  ].join(" · ");
  head.append(title, meta);
  if (revision.note) {
    const note = document.createElement("span");
    note.className = "training-block-version-meta";
    note.textContent = "Notiz: " + revision.note;
    head.append(note);
  }
  container.append(head);

  const exercises = document.createElement("div");
  exercises.className = "training-block-version-exercises";
  if (revision.exercises.length === 0) {
    const empty = document.createElement("span");
    empty.className = "training-block-version-meta";
    empty.textContent = "Keine Übungen in dieser Version.";
    exercises.append(empty);
  }
  revision.exercises.forEach((exercise, index) => {
    const item = trainingBlockExerciseItem(exercise.exerciseId);
    const card = document.createElement("article");
    card.className = "training-block-version-exercise";
    const strong = document.createElement("strong");
    strong.textContent =
      String(index + 1) + ". " + (item?.name || exercise.exerciseId);
    card.append(strong);
    const parameterText = trainingBlockRevisionParameterText(exercise);
    if (parameterText) {
      const parameters = document.createElement("span");
      parameters.textContent = parameterText;
      card.append(parameters);
    }
    if (exercise.note) {
      const note = document.createElement("small");
      note.textContent = "Notiz: " + exercise.note;
      card.append(note);
    }
    exercises.append(card);
  });
  container.append(exercises);
  container.hidden = false;
  container.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

async function openTrainingBlockRevision(number) {
  if (!trainingBlockSelected) return;
  const blockId = trainingBlockSelected.id;
  const requestId = trainingBlockOpenRequestId;
  const operationId = ++trainingBlockRevisionRequestId;
  try {
    const revision = await fetchTrainingBlockRevision(blockId, number);
    if (
      operationId !== trainingBlockRevisionRequestId ||
      !isCurrentTrainingBlockSelection(blockId, requestId)
    ) return;
    renderTrainingBlockRevisionPreview(revision);
  } catch {
    if (
      operationId !== trainingBlockRevisionRequestId ||
      !isCurrentTrainingBlockSelection(blockId, requestId)
    ) return;
    showMessage(
      trainingBlockElements.editorMessage,
      "Die gewählte Version konnte nicht geladen werden.",
    );
  }
}

function addTrainingBlockComparisonRow(container, title, before, after) {
  const row = document.createElement("article");
  row.className = "training-block-comparison-row";
  const strong = document.createElement("strong");
  strong.textContent = title;
  const oldValue = document.createElement("span");
  oldValue.textContent = "Vorher: " + (before || "—");
  const newValue = document.createElement("span");
  newValue.textContent = "Nachher: " + (after || "—");
  row.append(strong, oldValue, newValue);
  container.append(row);
}

function revisionExerciseLabel(exercise) {
  return trainingBlockExerciseItem(exercise.exerciseId)?.name || exercise.exerciseId;
}

function renderTrainingBlockComparison(fromRevision, toRevision) {
  const container = trainingBlockElements.comparison;
  if (!container) return;
  container.replaceChildren();

  const title = document.createElement("div");
  title.className = "training-block-version-head";
  const strong = document.createElement("strong");
  strong.textContent =
    "Version " +
    String(fromRevision.revision) +
    " → Version " +
    String(toRevision.revision);
  const meta = document.createElement("span");
  meta.className = "training-block-version-meta";
  meta.textContent =
    new Date(fromRevision.createdAt).toLocaleString("de-AT") +
    " → " +
    new Date(toRevision.createdAt).toLocaleString("de-AT");
  title.append(strong, meta);
  container.append(title);

  const list = document.createElement("div");
  list.className = "training-block-comparison-list";
  let changes = 0;

  const simpleFields = [
    ["Name", fromRevision.name, toRevision.name],
    ["Kategorie", fromRevision.category, toRevision.category],
    [
      "Trainingsgruppen",
      trainingBlockAudienceSetLabel(fromRevision.audienceIds),
      trainingBlockAudienceSetLabel(toRevision.audienceIds),
    ],
    [
      "Dauer",
      fromRevision.durationMinutes === null
        ? "—"
        : String(fromRevision.durationMinutes) + " Min.",
      toRevision.durationMinutes === null
        ? "—"
        : String(toRevision.durationMinutes) + " Min.",
    ],
    ["Notiz", fromRevision.note || "—", toRevision.note || "—"],
  ];
  for (const [label, before, after] of simpleFields) {
    if (before === after) continue;
    changes += 1;
    addTrainingBlockComparisonRow(list, label, before, after);
  }

  const fromById = new Map(
    fromRevision.exercises.map((exercise, index) => [
      exercise.itemId,
      { exercise, index },
    ]),
  );
  const toById = new Map(
    toRevision.exercises.map((exercise, index) => [
      exercise.itemId,
      { exercise, index },
    ]),
  );
  const allIds = new Set([...fromById.keys(), ...toById.keys()]);

  for (const itemId of allIds) {
    const before = fromById.get(itemId);
    const after = toById.get(itemId);
    if (!before && after) {
      changes += 1;
      addTrainingBlockComparisonRow(
        list,
        "Übung hinzugefügt",
        "—",
        String(after.index + 1) + ". " + revisionExerciseLabel(after.exercise),
      );
      continue;
    }
    if (before && !after) {
      changes += 1;
      addTrainingBlockComparisonRow(
        list,
        "Übung entfernt",
        String(before.index + 1) + ". " + revisionExerciseLabel(before.exercise),
        "—",
      );
      continue;
    }
    if (!before || !after) continue;

    const beforeExercise = before.exercise;
    const afterExercise = after.exercise;
    const label =
      revisionExerciseLabel(afterExercise) ||
      revisionExerciseLabel(beforeExercise);

    if (before.index !== after.index) {
      changes += 1;
      addTrainingBlockComparisonRow(
        list,
        label + " · Reihenfolge",
        "Position " + String(before.index + 1),
        "Position " + String(after.index + 1),
      );
    }
    if (beforeExercise.exerciseId !== afterExercise.exerciseId) {
      changes += 1;
      addTrainingBlockComparisonRow(
        list,
        label + " · Übung",
        revisionExerciseLabel(beforeExercise),
        revisionExerciseLabel(afterExercise),
      );
    }
    if ((beforeExercise.note || "") !== (afterExercise.note || "")) {
      changes += 1;
      addTrainingBlockComparisonRow(
        list,
        label + " · Notiz",
        beforeExercise.note || "—",
        afterExercise.note || "—",
      );
    }

    const beforeOverrides = new Map(
      beforeExercise.parameterOverrides.map((value) => [value.key, value.value]),
    );
    const afterOverrides = new Map(
      afterExercise.parameterOverrides.map((value) => [value.key, value.value]),
    );
    const keys = new Set([...beforeOverrides.keys(), ...afterOverrides.keys()]);
    const catalogItem =
      trainingBlockExerciseItem(afterExercise.exerciseId) ||
      trainingBlockExerciseItem(beforeExercise.exerciseId);
    for (const key of keys) {
      const oldValue = beforeOverrides.get(key) || "";
      const newValue = afterOverrides.get(key) || "";
      if (oldValue === newValue) continue;
      changes += 1;
      const parameter = catalogItem?.parameters.find((value) => value.key === key);
      addTrainingBlockComparisonRow(
        list,
        label + " · " + (parameter?.label || key),
        oldValue || "Katalogstandard",
        newValue || "Katalogstandard",
      );
    }
  }

  if (changes === 0) {
    const empty = document.createElement("div");
    empty.className = "training-block-comparison-row";
    empty.textContent = "Keine fachlichen Änderungen zwischen diesen Versionen.";
    list.append(empty);
  }
  container.append(list);
  container.hidden = false;
  container.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

async function compareTrainingBlockRevisions() {
  if (!trainingBlockSelected) return;
  const blockId = trainingBlockSelected.id;
  const requestId = trainingBlockOpenRequestId;
  const operationId = ++trainingBlockCompareRequestId;
  const from = Number(trainingBlockElements.compareFrom?.value || "");
  const to = Number(trainingBlockElements.compareTo?.value || "");
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to)) return;
  if (trainingBlockElements.compare) trainingBlockElements.compare.disabled = true;
  try {
    const [fromRevision, toRevision] = await Promise.all([
      fetchTrainingBlockRevision(blockId, from),
      fetchTrainingBlockRevision(blockId, to),
    ]);
    if (
      operationId !== trainingBlockCompareRequestId ||
      !isCurrentTrainingBlockSelection(blockId, requestId)
    ) return;
    renderTrainingBlockComparison(fromRevision, toRevision);
  } catch {
    if (
      operationId !== trainingBlockCompareRequestId ||
      !isCurrentTrainingBlockSelection(blockId, requestId)
    ) return;
    showMessage(
      trainingBlockElements.editorMessage,
      "Die Versionen konnten nicht verglichen werden.",
    );
  } finally {
    if (operationId === trainingBlockCompareRequestId) {
      refreshTrainingBlockEditorLock();
    }
  }
}

trainingBlockElements.search?.addEventListener("input", renderTrainingBlocks);trainingBlockElements.search?.addEventListener("input", renderTrainingBlocks);
trainingBlockElements.audienceFilter?.addEventListener("change", renderTrainingBlocks);
trainingBlockElements.categoryFilter?.addEventListener("change", renderTrainingBlocks);
trainingBlockElements.statusFilter?.addEventListener("change", renderTrainingBlocks);
trainingBlockElements.newButton?.addEventListener("click", newTrainingBlock);
trainingBlockElements.save?.addEventListener("click", () => void saveTrainingBlock());
trainingBlockElements.close?.addEventListener("click", () => closeTrainingBlockEditor());
trainingBlockElements.reload?.addEventListener("click", () => void reloadTrainingBlock());
trainingBlockElements.retry?.addEventListener("click", retryTrainingBlockSave);
trainingBlockElements.exerciseAdd?.addEventListener("click", addTrainingBlockExercise);
trainingBlockElements.exerciseCategory?.addEventListener("change", renderTrainingBlockExercisePicker);
trainingBlockElements.exercises?.addEventListener("click", handleTrainingBlockExerciseClick);
trainingBlockElements.exercises?.addEventListener("input", handleTrainingBlockExerciseInput);
trainingBlockElements.duplicate?.addEventListener("click", () => void duplicateTrainingBlock());
trainingBlockElements.favorite?.addEventListener("click", () => void toggleTrainingBlockFavorite());
trainingBlockElements.deleteUnused?.addEventListener("click", () => void deleteUnusedTrainingBlock());
trainingBlockElements.deactivate?.addEventListener("click", () => void deactivateTrainingBlock());
trainingBlockElements.reactivate?.addEventListener("click", () => void reactivateTrainingBlock());
trainingBlockElements.historyLoad?.addEventListener("click", () => void loadTrainingBlockHistory());
trainingBlockElements.compare?.addEventListener("click", () => void compareTrainingBlockRevisions());
trainingBlockElements.compareFrom?.addEventListener("change", invalidateTrainingBlockComparison);
trainingBlockElements.compareTo?.addEventListener("change", invalidateTrainingBlockComparison);
trainingBlockElements.infoClose?.addEventListener("click", closeTrainingBlockExerciseInfo);
trainingBlockElements.info?.addEventListener("click", (event) => {
  const control = event.target?.closest?.("[data-training-block-info-tab]");
  if (!control) return;
  setTrainingBlockInfoTab(control.dataset.trainingBlockInfoTab || "basis");
});
for (const control of [
  trainingBlockElements.name,
  trainingBlockElements.category,
  trainingBlockElements.duration,
  trainingBlockElements.note,
]) {
  control?.addEventListener(control === trainingBlockElements.category ? "change" : "input", () => {
    if (control === trainingBlockElements.name && control.value.trim()) {
      control.classList.remove("training-block-field-missing");
      control.removeAttribute("aria-invalid");
    }
    syncTrainingBlockDraftFromFields();
    markTrainingBlockDirty();
  });
}
trainingBlockElements.audience?.addEventListener("click", handleTrainingBlockAudienceClick);
trainingBlockElements.list?.addEventListener("click", (event) => {
  const control = event.target?.closest?.("[data-training-block-open]");
  if (control) void openTrainingBlock(control.dataset.trainingBlockOpen || "");
});
trainingBlockElements.historyList?.addEventListener("click", (event) => {
  const control = event.target?.closest?.("[data-training-block-revision-open]");
  if (!control) return;
  void openTrainingBlockRevision(
    Number(control.dataset.trainingBlockRevisionOpen),
  );
});
window.addEventListener("beforeunload", (event) => {
  if (!trainingBlockDirty && !trainingBlockSaveBusy) return;
  event.preventDefault();
  event.returnValue = "";
});
`;
