export const ULC_TRAINING_PLANS_HTML = `
          <section class="app-section" data-app-section="training-plans" id="training-plans" hidden>
            <section class="hero training-plans-hero">
              <div>
                <p class="eyebrow">Training</p>
                <h1>Trainingsplanung</h1>
                <p class="summary">Wochenpläne pro Athlet mit konfliktfestem Autosave.</p>
              </div>
            </section>

            <p class="message message--error" id="training-plan-message" role="alert" hidden></p>

            <section class="card training-plan-shell">
              <div class="training-plan-mode-tabs" role="tablist" aria-label="Planungsansicht">
                <button type="button" role="tab" data-training-plan-mode="group" aria-selected="true">Gruppe</button>
                <button type="button" role="tab" data-training-plan-mode="athlete" aria-selected="false">Athlet</button>
              </div>

              <div class="training-plan-weekbar">
                <div class="training-plan-week-nav" aria-label="Woche wechseln">
                  <button class="button button--secondary" id="training-plan-week-prev" type="button" aria-label="Vorherige Woche">←</button>
                  <button class="button button--secondary" id="training-plan-week-today" type="button">Diese Woche</button>
                  <button class="button button--secondary" id="training-plan-week-next" type="button" aria-label="Nächste Woche">→</button>
                </div>
                <strong id="training-plan-week-label"></strong>
              </div>

              <section class="training-plan-mode-panel" id="training-plan-group-panel" data-training-plan-mode-panel="group">
                <div class="training-plan-group-controls">
                  <label class="training-plan-primary-select">Trainingsgruppe
                    <select id="training-plan-overview-group"></select>
                  </label>
                  <label>Anwesenheit
                    <select id="training-plan-overview-attendance-filter">
                      <option value="all">Alle</option>
                      <option value="present">Anwesend</option>
                      <option value="excused">Entschuldigt</option>
                      <option value="absent">Abwesend</option>
                      <option value="open">Offen</option>
                      <option value="none">Kein Eintrag</option>
                    </select>
                  </label>
                </div>
                <nav class="training-plan-day-tabs" id="training-plan-overview-days" aria-label="Trainingstag auswählen"></nav>
                <div class="training-plan-overview" id="training-plan-overview" aria-live="polite"></div>
              </section>

              <section class="training-plan-mode-panel" id="training-plan-athlete-panel" data-training-plan-mode-panel="athlete" hidden>
                <div class="training-plan-athlete-controls">
                  <label>Athlet
                    <select id="training-plan-subject"></select>
                  </label>
                  <label>Anwesenheit
                    <select id="training-plan-attendance-filter">
                      <option value="all">Alle</option>
                      <option value="present">Anwesend</option>
                      <option value="excused">Entschuldigt</option>
                      <option value="absent">Abwesend</option>
                      <option value="open">Offen</option>
                      <option value="none">Kein Eintrag</option>
                    </select>
                  </label>
                </div>
                <section class="training-plan-week" id="training-plan-week" aria-live="polite"></section>
              </section>
            </section>

            <div class="training-plan-backdrop" id="training-plan-editor" hidden>
              <section class="training-plan-dialog" role="dialog" aria-modal="true" aria-labelledby="training-plan-editor-title">
                <header class="training-plan-header">
                  <div>
                    <p class="eyebrow">Tagesplan</p>
                    <h2 id="training-plan-editor-title">Training bearbeiten</h2>
                    <span class="training-plan-save-state" id="training-plan-save-state" data-state="saved">Gespeichert</span>
                  </div>
                  <div class="training-plan-header-actions">
                    <button class="button button--secondary training-plan-mini" id="training-plan-prev-athlete" type="button" aria-label="Vorheriger Athlet" title="Vorheriger Athlet">←</button>
                    <button class="button button--secondary training-plan-mini" id="training-plan-next-athlete" type="button" aria-label="Nächster Athlet" title="Nächster Athlet">→</button>
                    <button class="button button--secondary" id="training-plan-distribute-open" type="button">Verteilen</button>
                    <button class="button button--secondary training-plan-icon-close" id="training-plan-close" type="button" aria-label="Tagesplan schließen" title="Schließen"><span aria-hidden="true">✕</span><span class="training-plan-close-label">Schließen</span></button>
                  </div>
                </header>

                <div class="training-plan-body">
                  <p class="message message--error" id="training-plan-editor-message" role="alert" hidden></p>
                  <div class="training-plan-recovery">
                    <button class="button button--secondary" id="training-plan-reload" type="button" hidden>Aktuellen Stand neu laden</button>
                    <button class="button button--secondary" id="training-plan-retry" type="button" hidden>Erneut speichern</button>
                  </div>

                  <section class="card training-plan-note-card">
                    <label>Notiz zum Training
                      <textarea id="training-plan-note" maxlength="3000" rows="3" placeholder="Optional"></textarea>
                    </label>
                  </section>

                  <section class="card training-plan-items-card">
                    <div class="section-heading">
                      <div><p class="eyebrow">Inhalt</p><h3>Blöcke & Übungen</h3></div>
                      <span id="training-plan-item-count">0</span>
                    </div>
                    <div class="training-plan-add-actions">
                      <button class="button button--secondary training-plan-add-button" id="training-plan-add-exercise" type="button"><span aria-hidden="true">＋</span> Übung</button>
                      <button class="button button--secondary training-plan-add-button" id="training-plan-add-block" type="button"><span aria-hidden="true">＋</span> Block</button>
                    </div>
                    <div class="training-plan-template-picker" hidden>
                      <label>Blockvorlage
                        <select id="training-plan-block-template"></select>
                      </label>
                      <button class="button button--secondary" id="training-plan-add-template" type="button">Vorlage übernehmen</button>
                    </div>
                    <div class="training-plan-items" id="training-plan-items"></div>
                  </section>
                </div>

                <footer class="training-plan-footer">
                  <div class="training-plan-footer__meta">
                    <span id="training-plan-editor-meta"></span>
                    <span>Beim Schließen oder Wechseln wird automatisch gespeichert.</span>
                  </div>
                  <button class="button button--primary" id="training-plan-save" type="button">Speichern</button>
                </footer>
              </section>
            </div>


            <div class="training-plan-picker-backdrop" id="training-plan-distribute" hidden>
              <section class="training-plan-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="training-plan-distribute-title">
                <header class="training-plan-header">
                  <div><p class="eyebrow">Gruppenplanung</p><h2 id="training-plan-distribute-title">Plan verteilen</h2></div>
                  <button class="button button--secondary training-plan-icon-close" id="training-plan-distribute-close" type="button" aria-label="Verteilen schließen">✕</button>
                </header>
                <div class="training-plan-picker-body">
                  <p class="settings-note">Bestehende Tagespläne werden nicht überschrieben.</p>
                  <div class="training-plan-distribute-list" id="training-plan-distribute-list"></div>
                  <button class="button button--primary" id="training-plan-distribute-confirm" type="button">Auf Auswahl kopieren</button>
                </div>
              </section>
            </div>

            <div class="training-plan-picker-backdrop" id="training-plan-picker" hidden>
              <section class="training-plan-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="training-plan-picker-title">
                <header class="training-plan-header">
                  <div>
                    <p class="eyebrow">Hinzufügen</p>
                    <h2 id="training-plan-picker-title">Auswählen</h2>
                  </div>
                  <button class="button button--secondary training-plan-icon-close" id="training-plan-picker-close" type="button" aria-label="Auswahl schließen" title="Schließen">✕</button>
                </header>
                <div class="training-plan-picker-body">
                  <div class="training-plan-picker-filters">
                    <label class="training-plan-picker-search">Suchen
                      <input id="training-plan-picker-search" type="search" maxlength="160" placeholder="Name, Kategorie oder Gruppe …" autocomplete="off" />
                    </label>
                    <label id="training-plan-picker-category-wrap" hidden>Kategorie
                      <select id="training-plan-picker-category"></select>
                    </label>
                  </div>
                  <p class="settings-note" id="training-plan-picker-hint"></p>
                  <div class="training-plan-picker-list" id="training-plan-picker-list" aria-live="polite"></div>
                  <button class="button button--secondary" id="training-plan-picker-manual" type="button" hidden>Freie Übung ohne Katalogbezug</button>
                </div>
              </section>
            </div>

            <div class="training-plan-backdrop training-plan-save-template-backdrop" id="training-plan-save-template" hidden>
              <section class="training-plan-dialog training-plan-save-template-dialog" role="dialog" aria-modal="true" aria-labelledby="training-plan-save-template-title">
                <header class="training-plan-header">
                  <div>
                    <p class="eyebrow">Blockvorlage</p>
                    <h2 id="training-plan-save-template-title">Als neue Vorlage speichern</h2>
                  </div>
                  <button class="button button--secondary" id="training-plan-save-template-cancel" type="button">Abbrechen</button>
                </header>
                <div class="training-plan-body">
                  <p class="message message--error" id="training-plan-save-template-message" role="alert" hidden></p>
                  <div class="training-plan-grid">
                    <label>Name
                      <input id="training-plan-save-template-name" type="text" maxlength="120" autocomplete="off">
                    </label>
                    <label>Trainingsgruppe
                      <select id="training-plan-save-template-audience"></select>
                    </label>
                  </div>
                  <p class="settings-note">Es wird immer eine neue Blockvorlage angelegt. Eine bestehende Quellvorlage wird nicht überschrieben.</p>
                  <button class="button" id="training-plan-save-template-confirm" type="button">Neue Vorlage anlegen</button>
                </div>
              </section>
            </div>
          </section>
`;

export const ULC_TRAINING_PLANS_CSS = `
.training-plans-hero { margin-bottom: 12px; }
.training-plan-toolbar {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(150px, .75fr) auto;
  gap: 10px 12px;
  align-items: end;
  padding: 12px;
  margin-bottom: 12px;
}
.training-plan-toolbar > strong {
  grid-column: 1 / -1;
  color: var(--secondary);
  font-size: .86rem;
}
.training-plan-week-nav {
  display: flex;
  align-items: center;
  gap: 6px;
}
.training-plan-week {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(154px, 1fr);
  gap: 10px;
  overflow-x: auto;
  padding: 2px 1px 10px;
  scroll-snap-type: x proximity;
}
.training-plan-day {
  min-height: 164px;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--card);
  scroll-snap-align: start;
}
.training-plan-day__button {
  width: 100%;
  min-height: 164px;
  border: 0;
  padding: 12px;
  background: transparent;
  color: inherit;
  text-align: left;
}
.training-plan-day__button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
.training-plan-day__date {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: baseline;
}
.training-plan-day__date strong { font-size: .95rem; }
.training-plan-day__date span { color: var(--secondary); font-size: .75rem; }
.training-plan-day__attendance {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 12px;
}
.training-plan-attendance-badge {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  border-radius: 999px;
  padding: 2px 8px;
  background: var(--muted);
  color: var(--secondary);
  font-size: .72rem;
  font-weight: 600;
}
.training-plan-attendance-badge[data-status="present"] {
  background: #dcfce7;
  color: #166534;
}
.training-plan-attendance-badge[data-status="excused"] {
  background: #dbeafe;
  color: #1d4ed8;
}
.training-plan-attendance-badge[data-status="absent"] {
  background: var(--danger-surface);
  color: var(--danger);
}
.training-plan-attendance-badge[data-status="open"] {
  background: #fef3c7;
  color: #92400e;
}
.training-plan-attendance-badge[data-status="none"] {
  background: var(--muted);
  color: var(--secondary);
}
.training-plan-day__summary {
  margin-top: 12px;
  color: var(--secondary);
  font-size: .8rem;
  line-height: 1.45;
}
.training-plan-day__summary b {
  display: block;
  margin-bottom: 4px;
  color: var(--text);
  font-size: .9rem;
}
.training-plan-day[data-has-plan="false"] .training-plan-day__summary {
  color: var(--secondary);
}
.training-plan-overview-card {
  margin-top: 14px;
  padding: 14px;
}
.training-plan-overview-card .section-heading {
  align-items: end;
}
.training-plan-overview-card .section-heading label {
  min-width: min(100%, 240px);
}
.training-plan-overview {
  overflow-x: auto;
  margin-top: 10px;
}
.training-plan-overview-grid {
  display: grid;
  grid-template-columns: minmax(150px, 1.25fr) repeat(7, minmax(92px, 1fr));
  min-width: 800px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--card);
}
.training-plan-overview-grid > * {
  min-width: 0;
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}
.training-plan-overview-grid > :nth-child(8n) { border-right: 0; }
.training-plan-overview-head,
.training-plan-overview-athlete {
  padding: 8px 10px;
}
.training-plan-overview-head {
  background: var(--muted);
  color: var(--secondary);
  font-size: .75rem;
  font-weight: 700;
}
.training-plan-overview-athlete {
  display: flex;
  align-items: center;
  font-size: .82rem;
  font-weight: 700;
}
.training-plan-overview-cell {
  min-height: 58px;
  border: 0;
  padding: 7px 8px;
  background: transparent;
  color: inherit;
  text-align: left;
}
.training-plan-overview-cell[data-has-plan="true"] {
  background: color-mix(in srgb, var(--accent) 8%, var(--card));
}
.training-plan-overview-cell strong,
.training-plan-overview-cell span {
  display: block;
}
.training-plan-overview-cell strong { font-size: .78rem; }
.training-plan-overview-cell span {
  margin-top: 2px;
  color: var(--secondary);
  font-size: .7rem;
}
.training-plan-overview-cell:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
.training-plan-backdrop {
  position: fixed;
  inset: 0;
  z-index: 85;
  display: grid;
  place-items: end center;
  background: rgb(15 23 42 / 46%);
}
.training-plan-dialog {
  width: min(100%, 820px);
  max-height: min(94vh, 940px);
  overflow: auto;
  border-radius: 18px 18px 0 0;
  background: var(--page);
  box-shadow: 0 -20px 50px rgb(15 23 42 / 22%);
}
.training-plan-header {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  padding: 14px;
  border-bottom: 1px solid var(--border);
  background: rgb(255 255 255 / 96%);
}
.training-plan-header h2 { margin: 2px 0 4px; }
.training-plan-save-state {
  display: inline-flex;
  border-radius: 999px;
  padding: 3px 8px;
  background: var(--muted);
  color: var(--secondary);
  font-size: .74rem;
}
.training-plan-save-state[data-state="dirty"] { background: #fef3c7; color: #92400e; }
.training-plan-save-state[data-state="saving"] { background: #dbeafe; color: #1d4ed8; }
.training-plan-save-state[data-state="error"],
.training-plan-save-state[data-state="conflict"] { background: var(--danger-surface); color: var(--danger); }
.training-plan-body { display: grid; gap: 12px; padding: 12px; }
.training-plan-note-card,
.training-plan-items-card { padding: 12px; }
.training-plan-note-card textarea { width: 100%; }
.training-plan-recovery { display: flex; gap: 8px; flex-wrap: wrap; }
.training-plan-add-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 10px;
}
.training-plan-add-button { min-height: 42px; }
.training-plan-template-picker {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: end;
  margin-bottom: 12px;
}
.training-plan-template-picker label { min-width: 0; }
.training-plan-template-picker select { width: 100%; }
.training-plan-picker-backdrop {
  position: fixed;
  inset: 0;
  z-index: 110;
  display: grid;
  align-items: end;
  background: rgb(15 23 42 / 48%);
  backdrop-filter: blur(6px);
}
.training-plan-picker-backdrop[hidden] { display: none; }
.training-plan-picker-dialog {
  width: min(760px, 100%);
  max-height: min(88vh, 820px);
  margin: 0 auto;
  overflow: hidden;
  border-radius: 22px 22px 0 0;
  background: var(--page);
  box-shadow: 0 -18px 50px rgb(15 23 42 / 18%);
}
.training-plan-picker-body {
  display: grid;
  gap: 10px;
  max-height: calc(88vh - 76px);
  padding: 12px 12px max(16px, env(safe-area-inset-bottom));
  overflow: auto;
}
.training-plan-picker-list { display: grid; gap: 7px; }
.training-plan-picker-option {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  width: 100%;
  min-height: 52px;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 9px 10px;
  background: var(--card);
  color: inherit;
  text-align: left;
}
.training-plan-picker-option strong,
.training-plan-picker-option span { display: block; }
.training-plan-picker-option span { margin-top: 2px; color: var(--secondary); font-size: .76rem; }
.training-plan-picker-option__icon { color: var(--secondary); font-size: 1rem; }
.training-plan-icon-close { white-space: nowrap; }
body.training-plan-picker-open { overflow: hidden; }
.training-plan-save-template-backdrop { z-index: 95; }
.training-plan-save-template-dialog { width: min(100%, 520px); }
.training-plan-save-template-action {
  margin-top: 10px;
  display: flex;
  justify-content: flex-start;
}
.training-plan-items { display: grid; gap: 10px; }
.training-plan-item {
  display: grid;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: var(--control-radius);
  background: var(--card);
}
.training-plan-item__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.training-plan-item__header strong { font-size: .88rem; }
.training-plan-item__actions { display: flex; gap: 4px; flex-wrap: wrap; }
.training-plan-mini {
  min-width: var(--touch);
  min-height: var(--touch);
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--card);
}
.training-plan-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.training-plan-grid .training-plan-wide { grid-column: 1 / -1; }
.training-plan-exercise-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}
.training-plan-exercise-grid .training-plan-field--name,
.training-plan-exercise-grid .training-plan-field--comment {
  grid-column: 1 / -1;
}
.training-plan-exercise-grid label {
  min-width: 0;
  font-size: .7rem;
}
.training-plan-exercise-grid input,
.training-plan-exercise-grid textarea {
  min-height: 40px;
  padding-inline: 8px;
}
.training-plan-exercise-grid textarea { min-height: 58px; }
.training-plan-child-list {
  display: grid;
  gap: 8px;
  padding-left: 8px;
  border-left: 3px solid var(--border);
}
.training-plan-child {
  display: grid;
  gap: 8px;
  padding: 9px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--page);
}
.training-plan-footer {
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 14px;
  border-top: 1px solid var(--border);
  background: rgb(255 255 255 / 96%);
  color: var(--secondary);
  font-size: .78rem;
}
.training-plan-footer__meta {
  display: grid;
  min-width: 0;
  gap: 2px;
}
.training-plan-footer__meta span:last-child {
  color: var(--secondary);
  font-size: .7rem;
}
.training-plan-footer .button {
  min-width: 104px;
  flex: 0 0 auto;
}
.training-plan-header-actions { display: flex; align-items: center; gap: 6px; }
.training-plan-distribute-list { display: grid; gap: 6px; margin: 8px 0 12px; }
.training-plan-distribute-row {
  display: grid;
  grid-template-columns: auto minmax(0,1fr) auto;
  gap: 8px;
  align-items: center;
  min-height: 42px;
  padding: 7px 8px;
  border: 1px solid var(--border);
  border-radius: 9px;
}
.training-plan-distribute-row small { color: var(--secondary); }
.training-plan-shell {
  display: grid;
  gap: 10px;
  padding: 12px;
}
.training-plan-mode-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 4px;
  border-radius: 12px;
  background: var(--muted);
}
.training-plan-mode-tabs button {
  min-height: 40px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--secondary);
  font-weight: 800;
}
.training-plan-mode-tabs button[aria-selected="true"] {
  background: var(--card);
  color: var(--text);
  box-shadow: 0 1px 4px rgb(15 23 42 / 10%);
}
.training-plan-weekbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.training-plan-weekbar > strong {
  color: var(--secondary);
  font-size: .82rem;
  text-align: right;
}
.training-plan-mode-panel { display: grid; gap: 10px; min-width: 0; }
.training-plan-group-controls {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(150px, .55fr);
  gap: 8px;
  align-items: end;
}
.training-plan-primary-select { max-width: 360px; }
.training-plan-athlete-controls {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(150px, .55fr);
  gap: 8px;
}
.training-plan-day-tabs {
  display: flex;
  gap: 5px;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: none;
}
.training-plan-day-tabs::-webkit-scrollbar { display: none; }
.training-plan-day-tab {
  min-width: 64px;
  min-height: 42px;
  flex: 0 0 auto;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 5px 8px;
  background: var(--card);
  color: var(--secondary);
  text-align: center;
}
.training-plan-day-tab strong,
.training-plan-day-tab span { display: block; }
.training-plan-day-tab strong { font-size: .78rem; }
.training-plan-day-tab span { margin-top: 1px; font-size: .68rem; }
.training-plan-day-tab[aria-selected="true"] {
  border-color: #93c5fd;
  background: #dbeafe;
  color: #1d4ed8;
}
.training-plan-overview {
  display: grid;
  gap: 7px;
  min-width: 0;
  margin-top: 0;
  overflow: visible;
}
.training-plan-group-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  width: 100%;
  min-height: 58px;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: 11px;
  padding: 9px 10px;
  background: var(--card);
  color: inherit;
  text-align: left;
}
.training-plan-group-row[data-has-plan="true"] {
  border-color: color-mix(in srgb, var(--accent) 32%, var(--border));
  background: color-mix(in srgb, var(--accent) 5%, var(--card));
}
.training-plan-group-row__main strong,
.training-plan-group-row__main span { display: block; }
.training-plan-group-row__main strong { font-size: .86rem; }
.training-plan-group-row__main span {
  margin-top: 3px;
  color: var(--secondary);
  font-size: .73rem;
}
.training-plan-group-row__status {
  display: grid;
  min-width: 74px;
  justify-items: end;
  gap: 2px;
}
.training-plan-group-row__status strong { font-size: .78rem; }
.training-plan-group-row__status span { color: var(--secondary); font-size: .68rem; }
.training-plan-picker-filters {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(140px, .45fr);
  gap: 8px;
  align-items: end;
}
.training-plan-picker-filters label { min-width: 0; }
.training-plan-item > summary,
.training-plan-child > summary {
  cursor: pointer;
  list-style: none;
}
.training-plan-item > summary::-webkit-details-marker,
.training-plan-child > summary::-webkit-details-marker { display: none; }
.training-plan-item-summary,
.training-plan-child-summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}
.training-plan-item-summary strong,
.training-plan-item-summary span,
.training-plan-child-summary strong,
.training-plan-child-summary span { display: block; }
.training-plan-item-summary span,
.training-plan-child-summary span {
  margin-top: 2px;
  color: var(--secondary);
  font-size: .72rem;
}
.training-plan-item-editor {
  display: grid;
  gap: 8px;
  padding-top: 9px;
  border-top: 1px solid var(--border);
}
.training-plan-item[open] > summary,
.training-plan-child[open] > summary { margin-bottom: 8px; }
@media (min-width: 900px) {
  .training-plan-week {
    grid-auto-flow: initial;
    grid-auto-columns: initial;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    overflow: visible;
  }
}
@media (max-width: 480px) {
  .training-plan-toolbar {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    padding: 9px;
  }
  .training-plan-toolbar > label:first-child { grid-column: 1 / -1; }
  .training-plan-toolbar > strong { margin-top: -2px; font-size: .78rem; }
  .training-plan-week-nav { justify-content: end; gap: 4px; }
  .training-plan-week-nav .button { min-width: 40px; min-height: 40px; padding: 7px 9px; }
  .training-plan-week { grid-auto-columns: minmax(124px, 42vw); gap: 7px; }
  .training-plan-day,
  .training-plan-day__button { min-height: 128px; }
  .training-plan-day__button { padding: 9px; }
  .training-plan-grid { grid-template-columns: 1fr; }
  .training-plan-exercise-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .training-plan-exercise-grid .training-plan-field--name,
  .training-plan-exercise-grid .training-plan-field--comment { grid-column: 1 / -1; }
  .training-plan-template-picker { grid-template-columns: 1fr; }
  .training-plan-backdrop { place-items: stretch; }
  .training-plan-dialog {
    width: 100vw;
    height: 100dvh;
    max-height: 100dvh;
    border-radius: 0;
  }
  .training-plan-body { gap: 8px; padding: 8px; }
  .training-plan-note-card,
  .training-plan-items-card { padding: 9px; }
  .training-plan-item { gap: 7px; padding: 8px; }
  .training-plan-child { gap: 6px; padding: 7px; }
  .training-plan-child-list { gap: 6px; padding-left: 5px; border-left-width: 2px; }
  .training-plan-mini { min-width: 38px; width: 38px; min-height: 38px; }
  .training-plan-item__actions { flex-wrap: nowrap; }
  .training-plan-close-label { display: none; }
  .training-plan-icon-close { min-width: 40px; width: 40px; padding-inline: 0; }
  .training-plan-shell { padding: 8px; gap: 8px; }
  .training-plan-weekbar { align-items: stretch; flex-direction: column-reverse; }
  .training-plan-weekbar > strong { text-align: left; }
  .training-plan-week-nav { justify-content: space-between; }
  .training-plan-athlete-controls,
  .training-plan-group-controls { grid-template-columns: 1fr; }
  .training-plan-primary-select { max-width: none; }
  .training-plan-picker-filters { grid-template-columns: 1fr; }
  .training-plan-group-row { min-height: 54px; padding: 8px 9px; }
  .training-plan-header { padding: 10px 11px; }
  .training-plan-footer { padding: 8px 10px max(8px, env(safe-area-inset-bottom)); }
  .training-plan-footer__meta span:last-child { display: none; }
  .training-plan-footer .button { min-width: 92px; }
}
@media (max-width: 359px) {
  .training-plan-grid { grid-template-columns: 1fr; }
  .training-plan-grid .training-plan-wide { grid-column: auto; }
}
`;

export const ULC_TRAINING_PLANS_SCRIPT = `
const trainingPlanElements = Object.freeze({
  quickAction: document.querySelector("#training-plan-quick-action"),
  accessLabel: document.querySelector("#training-plan-access-label"),
  message: document.querySelector("#training-plan-message"),
  groupPanel: document.querySelector("#training-plan-group-panel"),
  athletePanel: document.querySelector("#training-plan-athlete-panel"),
  subject: document.querySelector("#training-plan-subject"),
  attendanceFilter: document.querySelector("#training-plan-attendance-filter"),
  weekPrev: document.querySelector("#training-plan-week-prev"),
  weekToday: document.querySelector("#training-plan-week-today"),
  weekNext: document.querySelector("#training-plan-week-next"),
  weekLabel: document.querySelector("#training-plan-week-label"),
  week: document.querySelector("#training-plan-week"),
  overviewGroup: document.querySelector("#training-plan-overview-group"),
  overviewAttendanceFilter: document.querySelector("#training-plan-overview-attendance-filter"),
  overviewDays: document.querySelector("#training-plan-overview-days"),
  overview: document.querySelector("#training-plan-overview"),
  editor: document.querySelector("#training-plan-editor"),
  editorTitle: document.querySelector("#training-plan-editor-title"),
  editorMessage: document.querySelector("#training-plan-editor-message"),
  saveState: document.querySelector("#training-plan-save-state"),
  reload: document.querySelector("#training-plan-reload"),
  retry: document.querySelector("#training-plan-retry"),
  close: document.querySelector("#training-plan-close"),
  save: document.querySelector("#training-plan-save"),
  prevAthlete: document.querySelector("#training-plan-prev-athlete"),
  nextAthlete: document.querySelector("#training-plan-next-athlete"),
  distributeOpen: document.querySelector("#training-plan-distribute-open"),
  distribute: document.querySelector("#training-plan-distribute"),
  distributeClose: document.querySelector("#training-plan-distribute-close"),
  distributeList: document.querySelector("#training-plan-distribute-list"),
  distributeConfirm: document.querySelector("#training-plan-distribute-confirm"),
  note: document.querySelector("#training-plan-note"),
  addExercise: document.querySelector("#training-plan-add-exercise"),
  addBlock: document.querySelector("#training-plan-add-block"),
  picker: document.querySelector("#training-plan-picker"),
  pickerTitle: document.querySelector("#training-plan-picker-title"),
  pickerClose: document.querySelector("#training-plan-picker-close"),
  pickerSearch: document.querySelector("#training-plan-picker-search"),
  pickerCategoryWrap: document.querySelector("#training-plan-picker-category-wrap"),
  pickerCategory: document.querySelector("#training-plan-picker-category"),
  pickerHint: document.querySelector("#training-plan-picker-hint"),
  pickerList: document.querySelector("#training-plan-picker-list"),
  pickerManual: document.querySelector("#training-plan-picker-manual"),
  blockTemplate: document.querySelector("#training-plan-block-template"),
  addTemplate: document.querySelector("#training-plan-add-template"),
  saveTemplate: document.querySelector("#training-plan-save-template"),
  saveTemplateMessage: document.querySelector("#training-plan-save-template-message"),
  saveTemplateName: document.querySelector("#training-plan-save-template-name"),
  saveTemplateAudience: document.querySelector("#training-plan-save-template-audience"),
  saveTemplateConfirm: document.querySelector("#training-plan-save-template-confirm"),
  saveTemplateCancel: document.querySelector("#training-plan-save-template-cancel"),
  itemCount: document.querySelector("#training-plan-item-count"),
  items: document.querySelector("#training-plan-items"),
  meta: document.querySelector("#training-plan-editor-meta"),
});

let trainingPlansReady = false;
let trainingPlansCanEdit = false;
let trainingPlanSubjects = [];
let trainingPlanViewMode = "group";
let trainingPlanOverviewDayIndex = 0;
let trainingPlanOverviewAttendanceFilter = "all";
let trainingPlanOverviewGroups = [];
let trainingPlanSelectedOverviewGroupId = "";
let trainingPlanOverview = null;
let trainingPlanOverviewLoading = false;
let trainingPlanBlockTemplates = [];
let trainingPlanSelectedSubjectId = "";
let trainingPlanWeekStart = trainingPlanMonday(new Date());
let trainingPlanWeekPlans = [];
let trainingPlanWeekAttendance = [];
let trainingPlanAttendanceFilter = "all";
let trainingPlanWeekLoading = false;
let trainingPlanWeekLoaded = false;
let trainingPlanEditorDate = null;
let trainingPlanSelected = null;
let trainingPlanDraft = null;
let trainingPlanDirty = false;
let trainingPlanConflict = false;
let trainingPlanSaveBusy = false;
let trainingPlanTemplateBusy = false;
let trainingPlanSaveBackBusy = false;
let trainingPlanSaveBackItemId = null;
let trainingPlanSaveBackAudiences = [];
let trainingPlanSaveBackOperation = 0;
let trainingPlanChangeVersion = 0;
let trainingPlanPickerMode = null;
let trainingPlanPickerLoading = false;
let trainingPlanDistributeBusy = false;
let trainingPlanWeekRequestId = 0;
let trainingPlanDayRequestId = 0;

function isTrainingPlanSubject(value) {
  return value !== null &&
    typeof value === "object" &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.firstName === "string" &&
    typeof value.lastName === "string" &&
    typeof value.displayName === "string";
}

function isTrainingPlanOverviewGroup(value) {
  return value !== null &&
    typeof value === "object" &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.name === "string" &&
    value.name.length > 0 &&
    (value.shortName === null || typeof value.shortName === "string");
}

function isTrainingPlanOverview(value) {
  return value !== null &&
    typeof value === "object" &&
    isTrainingPlanOverviewGroup(value.group) &&
    typeof value.weekStart === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value.weekStart) &&
    typeof value.weekEnd === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value.weekEnd) &&
    Array.isArray(value.dates) &&
    value.dates.length === 7 &&
    value.dates.every(
      (date) => typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date),
    ) &&
    Array.isArray(value.rows) &&
    value.rows.every(
      (row) =>
        row !== null &&
        typeof row === "object" &&
        isTrainingPlanSubject(row.subject) &&
        Array.isArray(row.cells) &&
        row.cells.length === 7 &&
        row.cells.every(
          (cell) =>
            cell !== null &&
            typeof cell === "object" &&
            typeof cell.planDate === "string" &&
            /^\d{4}-\d{2}-\d{2}$/.test(cell.planDate) &&
            (cell.planId === null || typeof cell.planId === "string") &&
            Number.isSafeInteger(cell.durationMinutes) &&
            cell.durationMinutes >= 0 &&
            Number.isSafeInteger(cell.exerciseCount) &&
            cell.exerciseCount >= 0 &&
            Array.isArray(cell.attendanceStatuses) &&
            cell.attendanceStatuses.every(
              (status) =>
                status === "open" ||
                status === "present" ||
                status === "excused" ||
                status === "absent",
            ) &&
            new Set(cell.attendanceStatuses).size ===
              cell.attendanceStatuses.length,
        ),
    );
}

function isTrainingPlanBlockTemplateSummary(value) {
  return value !== null &&
    typeof value === "object" &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    Number.isSafeInteger(value.currentRevision) &&
    value.currentRevision >= 1 &&
    typeof value.name === "string" &&
    value.name.length > 0 &&
    typeof value.audienceName === "string" &&
    value.audienceName.length > 0 &&
    (value.durationMinutes === null ||
      (Number.isSafeInteger(value.durationMinutes) && value.durationMinutes >= 1)) &&
    Number.isSafeInteger(value.exerciseCount) &&
    value.exerciseCount >= 0;
}

function isTrainingPlanTemplateExercise(value) {
  return value !== null &&
    typeof value === "object" &&
    typeof value.sourceExerciseId === "string" &&
    value.sourceExerciseId.length > 0 &&
    typeof value.name === "string" &&
    value.name.length > 0 &&
    (value.sets === null || typeof value.sets === "string") &&
    (value.repetitions === null || typeof value.repetitions === "string") &&
    (value.amount === null || typeof value.amount === "string") &&
    (value.unit === null || typeof value.unit === "string") &&
    (value.comment === null || typeof value.comment === "string");
}

function isTrainingPlanBlockTemplate(value) {
  const item = value?.item;
  return value !== null &&
    typeof value === "object" &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    Number.isSafeInteger(value.currentRevision) &&
    value.currentRevision >= 1 &&
    item !== null &&
    typeof item === "object" &&
    item.kind === "block" &&
    item.sourceBlockId === value.id &&
    item.sourceBlockRevision === value.currentRevision &&
    typeof item.name === "string" &&
    item.name.length > 0 &&
    (item.durationMinutes === null ||
      (Number.isSafeInteger(item.durationMinutes) && item.durationMinutes >= 1)) &&
    (item.note === null || typeof item.note === "string") &&
    Array.isArray(item.exercises) &&
    item.exercises.every(isTrainingPlanTemplateExercise);
}

function isTrainingPlanBlockTemplateAudience(value) {
  return value !== null &&
    typeof value === "object" &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.name === "string" &&
    value.name.length > 0 &&
    (value.shortName === null || typeof value.shortName === "string");
}

function isTrainingPlanSavedBlockTemplate(value) {
  return value !== null &&
    typeof value === "object" &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    value.currentRevision === 1 &&
    typeof value.name === "string" &&
    value.name.length > 0 &&
    typeof value.audienceId === "string" &&
    value.audienceId.length > 0 &&
    typeof value.audienceName === "string" &&
    value.audienceName.length > 0 &&
    (value.durationMinutes === null ||
      (Number.isSafeInteger(value.durationMinutes) && value.durationMinutes >= 1)) &&
    Number.isSafeInteger(value.exerciseCount) &&
    value.exerciseCount >= 0;
}

function isTrainingPlanExercise(value) {
  return value !== null &&
    typeof value === "object" &&
    value.kind === "exercise" &&
    typeof value.itemId === "string" &&
    value.itemId.length > 0 &&
    (value.sourceExerciseId === null || typeof value.sourceExerciseId === "string") &&
    typeof value.name === "string" &&
    Number.isSafeInteger(value.sortOrder) &&
    value.sortOrder >= 0 &&
    (value.sets === null || typeof value.sets === "string") &&
    (value.repetitions === null || typeof value.repetitions === "string") &&
    (value.amount === null || typeof value.amount === "string") &&
    (value.unit === null || typeof value.unit === "string") &&
    (value.comment === null || typeof value.comment === "string");
}

function isTrainingPlanItem(value) {
  if (isTrainingPlanExercise(value)) return true;
  return value !== null &&
    typeof value === "object" &&
    value.kind === "block" &&
    typeof value.itemId === "string" &&
    value.itemId.length > 0 &&
    (value.sourceBlockId === null || typeof value.sourceBlockId === "string") &&
    (value.sourceBlockRevision === null ||
      (Number.isSafeInteger(value.sourceBlockRevision) && value.sourceBlockRevision >= 1)) &&
    ((value.sourceBlockId === null && value.sourceBlockRevision === null) ||
      (value.sourceBlockId !== null && value.sourceBlockRevision !== null)) &&
    typeof value.name === "string" &&
    (value.durationMinutes === null ||
      (Number.isSafeInteger(value.durationMinutes) && value.durationMinutes >= 1)) &&
    (value.note === null || typeof value.note === "string") &&
    Number.isSafeInteger(value.sortOrder) &&
    value.sortOrder >= 0 &&
    Array.isArray(value.exercises) &&
    value.exercises.every((exercise) => isTrainingPlanExercise(exercise));
}

function isTrainingPlanSnapshot(value) {
  return value !== null &&
    typeof value === "object" &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.subjectId === "string" &&
    typeof value.planDate === "string" &&
    /^\\d{4}-\\d{2}-\\d{2}$/.test(value.planDate) &&
    Number.isSafeInteger(value.currentRevision) &&
    value.currentRevision >= 1 &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    value.revision !== null &&
    typeof value.revision === "object" &&
    value.revision.revision === value.currentRevision &&
    (value.revision.note === null || typeof value.revision.note === "string") &&
    Array.isArray(value.revision.items) &&
    value.revision.items.every(isTrainingPlanItem) &&
    typeof value.revision.createdAt === "string";
}

function isTrainingPlanAttendance(value) {
  return value !== null &&
    typeof value === "object" &&
    typeof value.sessionId === "string" &&
    value.sessionId.length > 0 &&
    typeof value.sessionDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value.sessionDate) &&
    (
      value.status === "open" ||
      value.status === "present" ||
      value.status === "excused" ||
      value.status === "absent"
    );
}

async function bootstrapTrainingPlans() {
  trainingPlansReady = false;
  trainingPlansCanEdit = false;
  trainingPlanSubjects = [];
  trainingPlanViewMode = "group";
  trainingPlanOverviewDayIndex = trainingPlanDefaultOverviewDayIndex();
  trainingPlanOverviewGroups = [];
  trainingPlanSelectedOverviewGroupId = "";
  trainingPlanOverview = null;
  trainingPlanOverviewLoading = false;
  trainingPlanBlockTemplates = [];
  trainingPlanSaveBackBusy = false;
  trainingPlanSaveBackItemId = null;
  trainingPlanSaveBackAudiences = [];
  trainingPlanWeekPlans = [];
  trainingPlanWeekAttendance = [];
  trainingPlanWeekLoaded = false;
  void closeTrainingPlanEditor(true);
  refreshAppAvailability();
  showMessage(trainingPlanElements.message, "");

  try {
    const payload = await requestJson("/api/modules/training-plans");
    const features = payload?.module?.features;
    if (
      payload?.module?.moduleId !== "training_planning" ||
      payload?.module?.capabilities?.view !== "training-plans:view" ||
      payload?.module?.capabilities?.edit !== "training-plans:edit" ||
      features?.weekView !== true ||
      features?.autosave !== false ||
      features?.manualSave !== true ||
      features?.saveOnLeave !== true ||
      features?.planCopy !== true ||
      features?.optimisticConcurrency !== true ||
      features?.attendanceSummary !== true ||
      features?.attendanceFilter !== true ||
      features?.groupWeekOverview !== true ||
      features?.blockTemplateAdoption !== true ||
      features?.blockTemplateSaveBack !== true ||
      payload?.access?.view !== true ||
      typeof payload?.access?.edit !== "boolean" ||
      !Array.isArray(payload?.subjects) ||
      !payload.subjects.every(isTrainingPlanSubject) ||
      !Array.isArray(payload?.overviewGroups) ||
      !payload.overviewGroups.every(isTrainingPlanOverviewGroup) ||
      !Array.isArray(payload?.blockTemplates) ||
      !payload.blockTemplates.every(isTrainingPlanBlockTemplateSummary)
    ) {
      throw new Error("INVALID_TRAINING_PLAN_CONTRACT");
    }

    trainingPlansReady = true;
    trainingPlansCanEdit = payload.access.edit;
    trainingPlanSubjects = payload.subjects.slice();
    trainingPlanOverviewGroups = payload.overviewGroups.slice();
    if (
      !trainingPlanOverviewGroups.some(
        (group) => group.id === trainingPlanSelectedOverviewGroupId,
      )
    ) {
      trainingPlanSelectedOverviewGroupId =
        trainingPlanOverviewGroups[0]?.id || "";
    }
    trainingPlanBlockTemplates = payload.blockTemplates.slice();
    if (
      !trainingPlanSubjects.some(
        (subject) => subject.id === trainingPlanSelectedSubjectId,
      )
    ) {
      trainingPlanSelectedSubjectId = trainingPlanSubjects[0]?.id || "";
    }
    renderTrainingPlanSubjects();
    renderTrainingPlanOverviewGroups();
    renderTrainingPlanBlockTemplates();
    renderTrainingPlanMode();
    await loadTrainingPlanOverview();
  } catch (error) {
    trainingPlansReady = false;
    trainingPlansCanEdit = false;
    trainingPlanOverviewGroups = [];
    trainingPlanSelectedOverviewGroupId = "";
    trainingPlanOverview = null;
    trainingPlanOverviewLoading = false;
    trainingPlanBlockTemplates = [];
    trainingPlanWeekPlans = [];
    trainingPlanWeekAttendance = [];
    trainingPlanWeekLoaded = false;
    renderTrainingPlanSubjects();
    renderTrainingPlanOverviewGroups();
    renderTrainingPlanBlockTemplates();
    renderTrainingPlanMode();
    renderTrainingPlanWeek();
    renderTrainingPlanOverview();
    showMessage(
      trainingPlanElements.message,
      error?.status === 403
        ? "Für die Trainingsplanung fehlt die Berechtigung."
        : "Die Trainingsplanung ist derzeit nicht verfügbar.",
    );
  }
  refreshAppAvailability();
}

function prepareTrainingPlansView() {
  if (!trainingPlansReady) return;
  renderTrainingPlanSubjects();
  renderTrainingPlanOverviewGroups();
  renderTrainingPlanBlockTemplates();
  renderTrainingPlanMode();
  renderTrainingPlanWeek();
  renderTrainingPlanOverview();
  void refreshTrainingPlanDependencies();
  void loadTrainingPlanActiveView();
}

function renderTrainingPlanMode() {
  const groupMode = trainingPlanViewMode === "group";
  if (trainingPlanElements.groupPanel) {
    trainingPlanElements.groupPanel.hidden = !groupMode;
  }
  if (trainingPlanElements.athletePanel) {
    trainingPlanElements.athletePanel.hidden = groupMode;
  }
  for (const control of document.querySelectorAll("[data-training-plan-mode]")) {
    control.setAttribute(
      "aria-selected",
      control.dataset.trainingPlanMode === trainingPlanViewMode
        ? "true"
        : "false",
    );
  }
  trainingPlanUpdateWeekLabel();
}

async function showTrainingPlanMode(mode) {
  const next = mode === "athlete" ? "athlete" : "group";
  if (next === trainingPlanViewMode) return;
  if (!(await closeTrainingPlanEditor(false))) return;
  trainingPlanWeekRequestId += 1;
  trainingPlanViewMode = next;
  renderTrainingPlanMode();
  await loadTrainingPlanActiveView();
}

async function loadTrainingPlanActiveView() {
  if (trainingPlanViewMode === "group") {
    if (
      trainingPlanSelectedOverviewGroupId &&
      trainingPlanOverview === null &&
      !trainingPlanOverviewLoading
    ) {
      return loadTrainingPlanOverview();
    }
    renderTrainingPlanOverview();
    return true;
  }
  if (
    trainingPlanSelectedSubjectId &&
    !trainingPlanWeekLoaded &&
    !trainingPlanWeekLoading
  ) {
    return loadTrainingPlanWeek();
  }
  renderTrainingPlanWeek();
  return true;
}

function trainingPlanUpdateWeekLabel() {
  if (!trainingPlanElements.weekLabel) return;
  const end = trainingPlanAddDays(trainingPlanWeekStart, 6);
  trainingPlanElements.weekLabel.textContent =
    trainingPlanDateLabel(trainingPlanWeekStart) +
    " – " +
    trainingPlanDateLabel(end);
}

async function refreshTrainingPlanDependencies() {
  try {
    const payload = await requestJson("/api/modules/training-plans");
    if (
      payload?.module?.moduleId !== "training_planning" ||
      payload?.access?.view !== true ||
      typeof payload?.access?.edit !== "boolean" ||
      !Array.isArray(payload?.subjects) ||
      !payload.subjects.every(isTrainingPlanSubject) ||
      !Array.isArray(payload?.overviewGroups) ||
      !payload.overviewGroups.every(isTrainingPlanOverviewGroup) ||
      !Array.isArray(payload?.blockTemplates) ||
      !payload.blockTemplates.every(isTrainingPlanBlockTemplateSummary)
    ) {
      throw new Error("INVALID_TRAINING_PLAN_DEPENDENCY_REFRESH");
    }
    trainingPlansCanEdit = payload.access.edit;
    trainingPlanSubjects = payload.subjects.slice();
    trainingPlanOverviewGroups = payload.overviewGroups.slice();
    trainingPlanBlockTemplates = payload.blockTemplates.slice();

    if (
      !trainingPlanSubjects.some(
        (subject) => subject.id === trainingPlanSelectedSubjectId,
      )
    ) {
      trainingPlanSelectedSubjectId = trainingPlanSubjects[0]?.id || "";
      trainingPlanWeekPlans = [];
      trainingPlanWeekAttendance = [];
      trainingPlanWeekLoaded = false;
    }
    if (
      !trainingPlanOverviewGroups.some(
        (group) => group.id === trainingPlanSelectedOverviewGroupId,
      )
    ) {
      trainingPlanSelectedOverviewGroupId =
        trainingPlanOverviewGroups[0]?.id || "";
      trainingPlanOverview = null;
    }
    renderTrainingPlanSubjects();
    renderTrainingPlanOverviewGroups();
    renderTrainingPlanBlockTemplates();
    if (trainingPlanPickerMode === "block") renderTrainingPlanPicker();
  } catch {
    // Keep the last valid dependency snapshot visible.
  }
}

function refreshTrainingPlanControls() {
  if (trainingPlanElements.quickAction) {
    trainingPlanElements.quickAction.disabled = !trainingPlansReady;
  }
  if (trainingPlanElements.accessLabel) {
    trainingPlanElements.accessLabel.textContent = trainingPlansReady
      ? trainingPlansCanEdit
        ? "Lesen und Bearbeiten freigeschaltet."
        : "Nur Lesen freigeschaltet."
      : "Für deinen Benutzer derzeit nicht freigeschaltet.";
  }
  const disabled =
    !trainingPlansReady ||
    trainingPlanSubjects.length === 0 ||
    trainingPlanWeekLoading;
  if (trainingPlanElements.subject) trainingPlanElements.subject.disabled = disabled;
  if (trainingPlanElements.attendanceFilter) {
    trainingPlanElements.attendanceFilter.disabled = disabled;
    trainingPlanElements.attendanceFilter.value = trainingPlanAttendanceFilter;
  }
  if (trainingPlanElements.weekPrev) trainingPlanElements.weekPrev.disabled = disabled;
  if (trainingPlanElements.weekToday) trainingPlanElements.weekToday.disabled = disabled;
  if (trainingPlanElements.weekNext) trainingPlanElements.weekNext.disabled = disabled;
  if (trainingPlanElements.overviewGroup) {
    trainingPlanElements.overviewGroup.disabled =
      !trainingPlansReady ||
      trainingPlanOverviewGroups.length === 0 ||
      trainingPlanOverviewLoading;
  }
  refreshTrainingPlanTemplateControls();
}

function renderTrainingPlanSubjects() {
  const select = trainingPlanElements.subject;
  if (!select) return;
  select.replaceChildren();
  if (trainingPlanSubjects.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Keine aktiven Athleten";
    select.append(option);
    select.value = "";
    return;
  }
  for (const subject of trainingPlanSubjects) {
    const option = document.createElement("option");
    option.value = subject.id;
    option.textContent = subject.displayName;
    select.append(option);
  }
  if (
    trainingPlanSubjects.some(
      (subject) => subject.id === trainingPlanSelectedSubjectId,
    )
  ) {
    select.value = trainingPlanSelectedSubjectId;
  }
}

function renderTrainingPlanOverviewGroups() {
  const select = trainingPlanElements.overviewGroup;
  if (!select) return;
  select.replaceChildren();

  if (trainingPlanOverviewGroups.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Keine aktive Trainingsgruppe";
    select.append(option);
    select.value = "";
    return;
  }

  for (const group of trainingPlanOverviewGroups) {
    const option = document.createElement("option");
    option.value = group.id;
    option.textContent = group.shortName
      ? group.name + " (" + group.shortName + ")"
      : group.name;
    select.append(option);
  }
  select.value = trainingPlanSelectedOverviewGroupId;
}

async function loadTrainingPlanOverview() {
  if (
    !trainingPlansReady ||
    trainingPlanOverviewLoading ||
    !trainingPlanSelectedOverviewGroupId
  ) {
    renderTrainingPlanOverview();
    return false;
  }

  const groupId = trainingPlanSelectedOverviewGroupId;
  const weekStart = trainingPlanWeekStart;
  trainingPlanOverviewLoading = true;
  trainingPlanOverview = null;
  refreshTrainingPlanControls();
  renderTrainingPlanOverview();
  showMessage(trainingPlanElements.message, "");

  try {
    const payload = await requestJson(
      "/api/modules/training-plans/overview?groupId=" +
        encodeURIComponent(groupId) +
        "&weekStart=" +
        encodeURIComponent(weekStart),
    );
    if (
      !isTrainingPlanOverview(payload?.overview) ||
      payload.overview.group.id !== groupId ||
      payload.overview.weekStart !== weekStart
    ) {
      throw new Error("INVALID_TRAINING_PLAN_OVERVIEW");
    }
    if (
      trainingPlanSelectedOverviewGroupId !== groupId ||
      trainingPlanWeekStart !== weekStart
    ) {
      return false;
    }
    trainingPlanOverview = payload.overview;
    return true;
  } catch (error) {
    if (
      trainingPlanSelectedOverviewGroupId !== groupId ||
      trainingPlanWeekStart !== weekStart
    ) {
      return false;
    }
    showMessage(
      trainingPlanElements.message,
      error?.status === 400
        ? "Die Gruppenübersicht ist für diese Woche nicht verfügbar."
        : "Die Gruppenübersicht konnte nicht geladen werden. Bitte Gruppe oder Woche erneut wählen.",
    );
    return false;
  } finally {
    const requestOutdated =
      trainingPlanSelectedOverviewGroupId !== groupId ||
      trainingPlanWeekStart !== weekStart;
    trainingPlanOverviewLoading = false;
    refreshTrainingPlanControls();
    renderTrainingPlanOverview();
    if (
      requestOutdated &&
      trainingPlanViewMode === "group" &&
      trainingPlanOverview === null &&
      trainingPlanSelectedOverviewGroupId
    ) {
      void loadTrainingPlanOverview();
    }
  }
}

function renderTrainingPlanOverview() {
  const container = trainingPlanElements.overview;
  const days = trainingPlanElements.overviewDays;
  if (!container || !days) return;
  container.replaceChildren();
  days.replaceChildren();

  trainingPlanUpdateWeekLabel();

  const dates =
    trainingPlanOverview?.dates ||
    Array.from({ length: 7 }, (_, index) =>
      trainingPlanAddDays(trainingPlanWeekStart, index),
    );
  trainingPlanOverviewDayIndex = Math.max(
    0,
    Math.min(6, trainingPlanOverviewDayIndex),
  );

  dates.forEach((date, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "training-plan-day-tab";
    button.dataset.trainingPlanOverviewDay = String(index);
    button.setAttribute(
      "aria-selected",
      index === trainingPlanOverviewDayIndex ? "true" : "false",
    );
    const day = document.createElement("strong");
    day.textContent = trainingPlanDayLabel(date);
    const shortDate = document.createElement("span");
    shortDate.textContent = trainingPlanShortDate(date);
    button.append(day, shortDate);
    days.append(button);
  });

  if (!trainingPlanSelectedOverviewGroupId) {
    const empty = document.createElement("p");
    empty.className = "settings-note";
    empty.textContent = "Für die Gruppenplanung ist keine aktive Trainingsgruppe verfügbar.";
    container.append(empty);
    return;
  }

  if (trainingPlanOverviewLoading) {
    const loading = document.createElement("p");
    loading.className = "settings-note";
    loading.textContent = "Gruppenplanung wird geladen …";
    container.append(loading);
    return;
  }

  if (!trainingPlanOverview) {
    const empty = document.createElement("div");
    empty.className = "training-plan-group-row";
    const text = document.createElement("div");
    text.className = "training-plan-group-row__main";
    const title = document.createElement("strong");
    title.textContent = "Gruppenplanung derzeit nicht verfügbar";
    const detail = document.createElement("span");
    detail.textContent = "Gruppe oder Woche erneut wählen.";
    text.append(title, detail);
    empty.append(text);
    container.append(empty);
    return;
  }

  const date = trainingPlanOverview.dates[trainingPlanOverviewDayIndex];
  if (!date) return;

  if (trainingPlanOverview.rows.length === 0) {
    const empty = document.createElement("p");
    empty.className = "settings-note";
    empty.textContent = "Keine aktiven Athleten in dieser Gruppe.";
    container.append(empty);
    return;
  }

  const visibleRows = trainingPlanOverview.rows.filter((row) => {
    const cell = row.cells[trainingPlanOverviewDayIndex];
    if (!cell) return false;
    if (trainingPlanOverviewAttendanceFilter === "all") return true;
    if (trainingPlanOverviewAttendanceFilter === "none") {
      return cell.attendanceStatuses.length === 0;
    }
    return cell.attendanceStatuses.includes(
      trainingPlanOverviewAttendanceFilter,
    );
  });

  if (visibleRows.length === 0) {
    const empty = document.createElement("p");
    empty.className = "settings-note";
    empty.textContent = "Für diesen Anwesenheitsfilter gibt es keine Athleten.";
    container.append(empty);
    return;
  }

  for (const row of visibleRows) {
    const cell = row.cells[trainingPlanOverviewDayIndex];
    if (!cell) continue;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "training-plan-group-row";
    button.dataset.trainingPlanOverviewSubject = row.subject.id;
    button.dataset.trainingPlanOverviewDate = cell.planDate;
    button.dataset.hasPlan = cell.planId ? "true" : "false";

    const main = document.createElement("span");
    main.className = "training-plan-group-row__main";
    const name = document.createElement("strong");
    name.textContent = row.subject.displayName;
    const detail = document.createElement("span");
    detail.textContent = cell.planId
      ? [
          cell.durationMinutes > 0
            ? String(cell.durationMinutes) + " Min."
            : null,
          String(cell.exerciseCount) +
            " Übung" +
            (cell.exerciseCount === 1 ? "" : "en"),
        ].filter(Boolean).join(" · ")
      : "Noch kein Trainingsplan";
    main.append(name, detail);

    const status = document.createElement("span");
    status.className = "training-plan-group-row__status";
    const statusTitle = document.createElement("strong");
    statusTitle.textContent = cell.planId ? "Plan" : trainingPlansCanEdit ? "＋ Plan" : "—";
    const statusDetail = document.createElement("span");
    statusDetail.textContent = trainingPlanAttendanceCompactLabel(
      cell.attendanceStatuses,
    );
    status.append(statusTitle, statusDetail);

    button.append(main, status);
    container.append(button);
  }
}

function trainingPlanAttendanceCompactLabel(statuses) {
  if (!Array.isArray(statuses) || statuses.length === 0) return "kein Eintrag";
  return statuses
    .map((status) => {
      if (status === "present") return "✓ anwesend";
      if (status === "excused") return "– entschuldigt";
      if (status === "absent") return "✕ abwesend";
      if (status === "open") return "? offen";
      return "";
    })
    .filter(Boolean)
    .join(" · ");
}

function trainingPlanVisibleOverviewRows() {
  if (!trainingPlanOverview) return [];
  return trainingPlanOverview.rows.filter((row) => {
    const cell = row.cells[trainingPlanOverviewDayIndex];
    if (!cell) return false;
    if (trainingPlanOverviewAttendanceFilter === "all") return true;
    if (trainingPlanOverviewAttendanceFilter === "none") {
      return cell.attendanceStatuses.length === 0;
    }
    return cell.attendanceStatuses.includes(
      trainingPlanOverviewAttendanceFilter,
    );
  });
}

function trainingPlanDefaultOverviewDayIndex() {
  const today = trainingPlanLocalIso(new Date());
  const end = trainingPlanAddDays(trainingPlanWeekStart, 6);
  if (today < trainingPlanWeekStart || today > end) return 0;
  const start = new Date(trainingPlanWeekStart + "T12:00:00");
  const current = new Date(today + "T12:00:00");
  return Math.max(
    0,
    Math.min(6, Math.round((current.getTime() - start.getTime()) / 86400000)),
  );
}

async function openTrainingPlanFromOverview(subjectId, date) {
  if (!(await closeTrainingPlanEditor(false))) return;
  if (!trainingPlanSubjects.some((subject) => subject.id === subjectId)) return;

  const requestId = ++trainingPlanDayRequestId;
  trainingPlanSelectedSubjectId = subjectId;
  if (trainingPlanElements.subject) {
    trainingPlanElements.subject.value = subjectId;
  }
  showMessage(trainingPlanElements.message, "");

  try {
    const payload = await requestJson(
      "/api/modules/training-plans/day?subjectId=" +
        encodeURIComponent(subjectId) +
        "&planDate=" +
        encodeURIComponent(date),
    );
    if (
      payload?.subjectId !== subjectId ||
      payload?.planDate !== date ||
      !(
        payload?.plan === null ||
        (
          isTrainingPlanSnapshot(payload?.plan) &&
          payload.plan.subjectId === subjectId &&
          payload.plan.planDate === date
        )
      )
    ) {
      throw new Error("INVALID_TRAINING_PLAN_DAY");
    }
    if (
      requestId !== trainingPlanDayRequestId ||
      trainingPlanSelectedSubjectId !== subjectId
    ) {
      return;
    }
    openTrainingPlanEditor(date, payload.plan);
  } catch (error) {
    if (
      requestId !== trainingPlanDayRequestId ||
      trainingPlanSelectedSubjectId !== subjectId
    ) {
      return;
    }
    showMessage(
      trainingPlanElements.message,
      error?.status === 400
        ? "Der ausgewählte Tagesplan ist nicht mehr verfügbar."
        : "Der Tagesplan konnte nicht geladen werden.",
    );
  }
}

function renderTrainingPlanBlockTemplates() {
  const select = trainingPlanElements.blockTemplate;
  if (!select) return;
  const selected = select.value;
  select.replaceChildren();

  if (trainingPlanBlockTemplates.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Keine verfügbare Blockvorlage";
    select.append(option);
    select.value = "";
    refreshTrainingPlanTemplateControls();
    return;
  }

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Blockvorlage auswählen";
  select.append(placeholder);

  for (const template of trainingPlanBlockTemplates) {
    const option = document.createElement("option");
    option.value =
      template.id + "::" + String(template.currentRevision);
    option.textContent =
      template.name +
      " · " +
      template.audienceName +
      " · " +
      String(template.exerciseCount) +
      " Übung" +
      (template.exerciseCount === 1 ? "" : "en");
    select.append(option);
  }

  if (
    trainingPlanBlockTemplates.some(
      (template) =>
        template.id + "::" + String(template.currentRevision) === selected,
    )
  ) {
    select.value = selected;
  } else {
    select.value = "";
  }
  refreshTrainingPlanTemplateControls();
}

function selectedTrainingPlanBlockTemplate() {
  const value = trainingPlanElements.blockTemplate?.value || "";
  const separator = value.lastIndexOf("::");
  if (separator <= 0) return null;
  const id = value.slice(0, separator);
  const revision = Number(value.slice(separator + 2));
  return (
    trainingPlanBlockTemplates.find(
      (template) =>
        template.id === id &&
        template.currentRevision === revision,
    ) || null
  );
}

function refreshTrainingPlanTemplateControls() {
  const blocked =
    !trainingPlansCanEdit ||
    trainingPlanConflict ||
    trainingPlanSaveBusy ||
    trainingPlanTemplateBusy ||
    trainingPlanSaveBackBusy;
  if (trainingPlanElements.blockTemplate) {
    trainingPlanElements.blockTemplate.disabled =
      blocked || trainingPlanBlockTemplates.length === 0;
  }
  if (trainingPlanElements.addTemplate) {
    trainingPlanElements.addTemplate.disabled =
      blocked ||
      trainingPlanBlockTemplates.length === 0 ||
      selectedTrainingPlanBlockTemplate() === null;
  }
}

async function loadTrainingPlanWeek() {
  if (
    !trainingPlansReady ||
    trainingPlanWeekLoading ||
    !trainingPlanSelectedSubjectId
  ) return false;

  const requestId = ++trainingPlanWeekRequestId;
  trainingPlanWeekLoading = true;
  trainingPlanWeekLoaded = false;
  refreshTrainingPlanControls();
  renderTrainingPlanWeek();
  showMessage(trainingPlanElements.message, "");
  const subjectId = trainingPlanSelectedSubjectId;
  const weekStart = trainingPlanWeekStart;
  try {
    const payload = await requestJson(
      "/api/modules/training-plans/week?subjectId=" +
        encodeURIComponent(subjectId) +
        "&weekStart=" +
        encodeURIComponent(weekStart),
    );
    if (
      payload?.subjectId !== subjectId ||
      payload?.weekStart !== weekStart ||
      typeof payload?.weekEnd !== "string" ||
      !Array.isArray(payload?.plans) ||
      !payload.plans.every(isTrainingPlanSnapshot) ||
      payload.plans.some(
        (plan) =>
          plan.subjectId !== subjectId ||
          plan.planDate < weekStart ||
          plan.planDate > payload.weekEnd,
      ) ||
      !Array.isArray(payload?.attendance) ||
      !payload.attendance.every(isTrainingPlanAttendance) ||
      payload.attendance.some(
        (entry) =>
          entry.sessionDate < weekStart ||
          entry.sessionDate > payload.weekEnd,
      )
    ) {
      throw new Error("INVALID_TRAINING_PLAN_WEEK");
    }
    if (
      requestId !== trainingPlanWeekRequestId ||
      trainingPlanSelectedSubjectId !== subjectId ||
      trainingPlanWeekStart !== weekStart
    ) {
      return false;
    }
    trainingPlanWeekPlans = payload.plans.slice();
    trainingPlanWeekAttendance = payload.attendance.slice();
    trainingPlanWeekLoaded = true;
    return true;
  } catch (error) {
    if (
      requestId !== trainingPlanWeekRequestId ||
      trainingPlanSelectedSubjectId !== subjectId ||
      trainingPlanWeekStart !== weekStart
    ) {
      return false;
    }
    trainingPlanWeekPlans = [];
    trainingPlanWeekAttendance = [];
    showMessage(
      trainingPlanElements.message,
      error?.status === 400
        ? "Die ausgewählte Woche oder der Athlet ist nicht mehr verfügbar."
        : "Die Trainingswoche konnte nicht geladen werden.",
    );
    return false;
  } finally {
    const requestOutdated =
      requestId !== trainingPlanWeekRequestId ||
      trainingPlanSelectedSubjectId !== subjectId ||
      trainingPlanWeekStart !== weekStart;
    trainingPlanWeekLoading = false;
    refreshTrainingPlanControls();
    renderTrainingPlanWeek();
    if (
      requestOutdated &&
      trainingPlanViewMode === "athlete" &&
      !trainingPlanWeekLoaded &&
      trainingPlanSelectedSubjectId
    ) {
      void loadTrainingPlanWeek();
    }
  }
}

function renderTrainingPlanWeek() {
  const container = trainingPlanElements.week;
  if (!container) return;
  container.replaceChildren();

  trainingPlanUpdateWeekLabel();

  if (!trainingPlanSelectedSubjectId) {
    const empty = document.createElement("div");
    empty.className = "card";
    empty.textContent = "Für die Trainingsplanung ist kein aktiver Athlet verfügbar.";
    container.append(empty);
    return;
  }

  let renderedDays = 0;
  for (let index = 0; index < 7; index += 1) {
    const date = trainingPlanAddDays(trainingPlanWeekStart, index);
    const attendance = trainingPlanAttendanceForDate(date);
    if (
      trainingPlanWeekLoaded &&
      !trainingPlanAttendanceMatchesFilter(attendance)
    ) {
      continue;
    }

    const plan =
      trainingPlanWeekPlans.find((value) => value.planDate === date) || null;
    const card = document.createElement("article");
    card.className = "training-plan-day";
    card.dataset.hasPlan = plan ? "true" : "false";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "training-plan-day__button";
    button.dataset.trainingPlanDay = date;
    button.disabled = trainingPlanWeekLoading || !trainingPlanWeekLoaded;

    const headline = document.createElement("div");
    headline.className = "training-plan-day__date";
    const day = document.createElement("strong");
    day.textContent = trainingPlanDayLabel(date);
    const shortDate = document.createElement("span");
    shortDate.textContent = trainingPlanShortDate(date);
    headline.append(day, shortDate);

    const attendanceSummary = trainingPlanAttendanceSummaryElement(attendance);

    const summary = document.createElement("div");
    summary.className = "training-plan-day__summary";
    const title = document.createElement("b");
    title.textContent = plan ? "Plan vorhanden" : "Noch kein Plan";
    const detail = document.createElement("span");
    detail.textContent = trainingPlanWeekLoading
      ? "Woche wird geladen …"
      : !trainingPlanWeekLoaded
        ? "Woche ist derzeit nicht verfügbar."
        : plan
          ? trainingPlanSummary(plan)
          : trainingPlansCanEdit
            ? "Öffnen und Training anlegen."
            : "Kein Training eingetragen.";
    summary.append(title, detail);

    button.append(headline, attendanceSummary, summary);
    card.append(button);
    container.append(card);
    renderedDays += 1;
  }

  if (
    renderedDays === 0 &&
    trainingPlanWeekLoaded &&
    trainingPlanAttendanceFilter !== "all"
  ) {
    const empty = document.createElement("div");
    empty.className = "card";
    empty.textContent = "Keine Tage entsprechen dem Anwesenheitsfilter.";
    container.append(empty);
  }
}

function trainingPlanAttendanceForDate(date) {
  return trainingPlanWeekAttendance.filter(
    (entry) => entry.sessionDate === date,
  );
}

function trainingPlanAttendanceMatchesFilter(entries) {
  if (trainingPlanAttendanceFilter === "all") return true;
  if (trainingPlanAttendanceFilter === "none") return entries.length === 0;
  return entries.some(
    (entry) => entry.status === trainingPlanAttendanceFilter,
  );
}

function trainingPlanAttendanceSummaryElement(entries) {
  const wrapper = document.createElement("div");
  wrapper.className = "training-plan-day__attendance";

  if (!trainingPlanWeekLoaded || entries.length === 0) {
    const badge = document.createElement("span");
    badge.className = "training-plan-attendance-badge";
    badge.dataset.status = "none";
    badge.textContent = trainingPlanWeekLoading
      ? "Anwesenheit wird geladen"
      : trainingPlanWeekLoaded
        ? "Kein Anwesenheitseintrag"
        : "Anwesenheit nicht verfügbar";
    wrapper.append(badge);
    return wrapper;
  }

  const counts = new Map();
  for (const entry of entries) {
    counts.set(entry.status, (counts.get(entry.status) || 0) + 1);
  }
  for (const status of ["present", "excused", "absent", "open"]) {
    const count = counts.get(status) || 0;
    if (count === 0) continue;
    const badge = document.createElement("span");
    badge.className = "training-plan-attendance-badge";
    badge.dataset.status = status;
    badge.textContent =
      trainingPlanAttendanceLabel(status) +
      (count > 1 ? " ×" + String(count) : "");
    wrapper.append(badge);
  }
  return wrapper;
}

function trainingPlanAttendanceLabel(status) {
  if (status === "present") return "Anwesend";
  if (status === "excused") return "Entschuldigt";
  if (status === "absent") return "Abwesend";
  if (status === "open") return "Offen";
  return "Kein Eintrag";
}

function trainingPlanSummary(plan) {
  const itemCount = plan.revision.items.length;
  const exerciseCount = trainingPlanExerciseCount(plan.revision.items);
  const values = [];
  if (itemCount > 0) {
    values.push(String(itemCount) + " Inhalt(e)");
    values.push(String(exerciseCount) + " Übung(en)");
  }
  if (plan.revision.note) values.push(plan.revision.note);
  values.push("Version " + String(plan.currentRevision));
  return values.join(" · ");
}

function trainingPlanExerciseCount(items) {
  let count = 0;
  for (const item of items) {
    count += item.kind === "exercise" ? 1 : item.exercises.length;
  }
  return count;
}

function openTrainingPlanEditor(date, planOverride) {
  if (!trainingPlansReady || !trainingPlanSelectedSubjectId) return;
  const plan =
    planOverride === undefined
      ? trainingPlanWeekPlans.find((value) => value.planDate === date) || null
      : planOverride;
  trainingPlanEditorDate = date;
  trainingPlanSelected = plan;
  trainingPlanDraft = plan
    ? trainingPlanDraftFromSnapshot(plan)
    : { note: "", items: [] };
  trainingPlanDirty = false;
  trainingPlanConflict = false;
  trainingPlanSaveBusy = false;
  trainingPlanTemplateBusy = false;
  trainingPlanSaveBackBusy = false;
  trainingPlanSaveBackItemId = null;
  trainingPlanSaveBackAudiences = [];
  trainingPlanChangeVersion = 0;
  populateTrainingPlanEditor();
}

function populateTrainingPlanEditor() {
  if (!trainingPlanDraft || !trainingPlanEditorDate) return;
  if (trainingPlanElements.editor) trainingPlanElements.editor.hidden = false;
  if (trainingPlanElements.editorTitle) {
    const subject = trainingPlanSubjects.find(
      (candidate) => candidate.id === trainingPlanSelectedSubjectId,
    );
    trainingPlanElements.editorTitle.textContent =
      (subject?.displayName ? subject.displayName + " · " : "") +
      trainingPlanDayLabel(trainingPlanEditorDate) +
      ", " +
      trainingPlanDateLabel(trainingPlanEditorDate);
  }
  if (trainingPlanElements.note) {
    trainingPlanElements.note.value = trainingPlanDraft.note;
    trainingPlanElements.note.disabled = !trainingPlansCanEdit || trainingPlanConflict;
  }
  showMessage(trainingPlanElements.editorMessage, "");
  if (trainingPlanElements.reload) trainingPlanElements.reload.hidden = true;
  if (trainingPlanElements.retry) trainingPlanElements.retry.hidden = true;
  renderTrainingPlanBlockTemplates();
  renderTrainingPlanItems();
  refreshTrainingPlanEditorState();
}

async function closeTrainingPlanEditor(force) {
  trainingPlanDayRequestId += 1;
  closeTrainingPlanPicker();
  closeTrainingPlanDistribution();
  if (!force) {
    if (
      trainingPlanSaveBusy ||
      trainingPlanTemplateBusy ||
      trainingPlanSaveBackBusy
    ) return false;
    if (trainingPlanConflict) {
      showMessage(
        trainingPlanElements.editorMessage,
        "Der Plan hat einen Konflikt und kann nicht automatisch gespeichert werden. Bitte zuerst neu laden.",
      );
      return false;
    }
    if (!(await saveTrainingPlanUntilClean())) return false;
  }
  closeTrainingPlanSaveTemplate(true);
  trainingPlanEditorDate = null;
  trainingPlanSelected = null;
  trainingPlanDraft = null;
  trainingPlanDirty = false;
  trainingPlanConflict = false;
  trainingPlanSaveBusy = false;
  trainingPlanTemplateBusy = false;
  if (trainingPlanElements.editor) trainingPlanElements.editor.hidden = true;
  showMessage(trainingPlanElements.editorMessage, "");
  return true;
}

function trainingPlanDraftFromSnapshot(plan) {
  return {
    note: plan.revision.note || "",
    items: plan.revision.items.map(trainingPlanCloneItem),
  };
}

function trainingPlanCloneItem(item) {
  if (item.kind === "exercise") {
    return {
      kind: "exercise",
      itemId: item.itemId,
      sourceExerciseId: item.sourceExerciseId,
      name: item.name,
      sets: item.sets || "",
      repetitions: item.repetitions || "",
      amount: item.amount || "",
      unit: item.unit || "",
      comment: item.comment || "",
    };
  }
  return {
    kind: "block",
    itemId: item.itemId,
    sourceBlockId: item.sourceBlockId,
    sourceBlockRevision: item.sourceBlockRevision,
    name: item.name,
    durationMinutes: item.durationMinutes,
    note: item.note || "",
    exercises: item.exercises.map((exercise) => ({
      itemId: exercise.itemId,
      sourceExerciseId: exercise.sourceExerciseId,
      name: exercise.name,
      sets: exercise.sets || "",
      repetitions: exercise.repetitions || "",
      amount: exercise.amount || "",
      unit: exercise.unit || "",
      comment: exercise.comment || "",
    })),
  };
}

function renderTrainingPlanItems() {
  const container = trainingPlanElements.items;
  if (!container || !trainingPlanDraft) return;
  container.replaceChildren();
  const editable = trainingPlansCanEdit && !trainingPlanConflict;
  const structural =
    editable &&
    !trainingPlanSaveBusy &&
    !trainingPlanTemplateBusy &&
    !trainingPlanSaveBackBusy;

  if (trainingPlanElements.itemCount) {
    trainingPlanElements.itemCount.textContent = String(
      trainingPlanDraft.items.length,
    );
  }
  if (trainingPlanElements.addExercise) {
    trainingPlanElements.addExercise.disabled = !structural;
  }
  if (trainingPlanElements.addBlock) {
    trainingPlanElements.addBlock.disabled = !structural;
  }
  refreshTrainingPlanTemplateControls();

  if (trainingPlanDraft.items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "settings-note";
    empty.textContent = editable
      ? "Noch keine Inhalte. Füge eine Übung oder einen Block hinzu."
      : "Keine Inhalte eingetragen.";
    container.append(empty);
    return;
  }

  trainingPlanDraft.items.forEach((item, index) => {
    const card = document.createElement("details");
    card.className = "training-plan-item";
    card.open = item.itemId === null;

    const summary = document.createElement("summary");
    summary.className = "training-plan-item-summary";
    const summaryMain = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = item.name || (item.kind === "block" ? "Block" : "Übung");
    const meta = document.createElement("span");
    meta.textContent = trainingPlanItemCompactSummary(item);
    summaryMain.append(title, meta);
    const chevron = document.createElement("span");
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "▾";
    summary.append(summaryMain, chevron);
    card.append(summary);

    const editor = document.createElement("div");
    editor.className = "training-plan-item-editor";
    const header = document.createElement("div");
    header.className = "training-plan-item__header";
    const kind = document.createElement("strong");
    kind.textContent = item.kind === "block" ? "Block bearbeiten" : "Übung bearbeiten";
    const actions = trainingPlanActionButtons(
      index,
      trainingPlanDraft.items.length,
      structural,
      () => trainingPlanMoveItem(index, -1),
      () => trainingPlanMoveItem(index, 1),
      () => trainingPlanRemoveItem(index),
    );
    header.append(kind, actions);
    editor.append(header);

    if (item.kind === "block") {
      editor.append(trainingPlanBlockFields(item, index, editable, structural));
    } else {
      editor.append(trainingPlanExerciseFields(item, editable));
    }
    card.append(editor);
    container.append(card);
  });
}

function trainingPlanItemCompactSummary(item) {
  if (item.kind === "block") {
    return [
      item.durationMinutes === null
        ? null
        : String(item.durationMinutes) + " Min.",
      String(item.exercises.length) +
        " Übung" +
        (item.exercises.length === 1 ? "" : "en"),
      item.note || null,
    ].filter(Boolean).join(" · ") || "Block";
  }
  const prescription = [
    item.sets && item.repetitions
      ? item.sets + " × " + item.repetitions
      : item.sets
        ? item.sets + " Sätze"
        : item.repetitions
          ? item.repetitions + " Wdh."
          : null,
    item.amount
      ? item.amount + (item.unit ? " " + item.unit : "")
      : null,
  ].filter(Boolean).join(" · ");
  return prescription || item.comment || "Übung";
}

function trainingPlanActionButtons(index, length, enabled, up, down, remove) {
  const actions = document.createElement("div");
  actions.className = "training-plan-item__actions";
  const upButton = trainingPlanMiniButton("↑", "Nach oben", up);
  const downButton = trainingPlanMiniButton("↓", "Nach unten", down);
  const removeButton = trainingPlanMiniButton("×", "Entfernen", remove);
  upButton.disabled = !enabled || index === 0;
  downButton.disabled = !enabled || index === length - 1;
  removeButton.disabled = !enabled;
  actions.append(upButton, downButton, removeButton);
  return actions;
}

function trainingPlanMiniButton(text, label, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "training-plan-mini";
  button.textContent = text;
  button.setAttribute("aria-label", label);
  button.addEventListener("click", handler);
  return button;
}

function trainingPlanBlockFields(item, itemIndex, editable, structural) {
  const wrapper = document.createElement("div");
  const grid = document.createElement("div");
  grid.className = "training-plan-grid";
  grid.append(
    trainingPlanTextField("Name", item.name, 120, editable, (value) => {
      item.name = value;
      markTrainingPlanDirty();
    }, true),
    trainingPlanNumberField("Dauer (Min.)", item.durationMinutes, editable, (value) => {
      item.durationMinutes = value;
      markTrainingPlanDirty();
    }),
    trainingPlanTextField("Notiz", item.note, 3000, editable, (value) => {
      item.note = value;
      markTrainingPlanDirty();
    }, true),
  );
  wrapper.append(grid);

  const add = document.createElement("button");
  add.type = "button";
  add.className = "button button--secondary";
  add.textContent = "Übung im Block hinzufügen";
  add.disabled = !structural;
  add.addEventListener("click", () => {
    if (
      trainingPlanSaveBusy ||
      trainingPlanTemplateBusy ||
      trainingPlanSaveBackBusy
    ) return;
    item.exercises.push(newTrainingPlanExerciseDraft());
    markTrainingPlanDirty(true);
  });
  wrapper.append(add);

  const saveTemplateAction = document.createElement("div");
  saveTemplateAction.className = "training-plan-save-template-action";
  const saveTemplate = document.createElement("button");
  saveTemplate.type = "button";
  saveTemplate.className = "button button--secondary";
  saveTemplate.dataset.trainingPlanSaveTemplate = item.itemId || "";
  saveTemplate.dataset.trainingPlanSaveTemplateIndex = String(itemIndex);
  saveTemplate.textContent = "Als Vorlage speichern";
  saveTemplate.disabled = !trainingPlanCanSaveBlockTemplate(item);
  saveTemplate.addEventListener("click", () => {
    void openTrainingPlanSaveTemplate(item);
  });
  saveTemplateAction.append(saveTemplate);
  wrapper.append(saveTemplateAction);

  const children = document.createElement("div");
  children.className = "training-plan-child-list";
  item.exercises.forEach((exercise, childIndex) => {
    const child = document.createElement("details");
    child.className = "training-plan-child";
    child.open = exercise.itemId === null;

    const summary = document.createElement("summary");
    summary.className = "training-plan-child-summary";
    const main = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = exercise.name || "Übung " + String(childIndex + 1);
    const meta = document.createElement("span");
    meta.textContent = trainingPlanItemCompactSummary(exercise);
    main.append(title, meta);
    const chevron = document.createElement("span");
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "▾";
    summary.append(main, chevron);

    const editor = document.createElement("div");
    editor.className = "training-plan-item-editor";
    const header = document.createElement("div");
    header.className = "training-plan-item__header";
    const label = document.createElement("strong");
    label.textContent = "Übung " + String(childIndex + 1) + " bearbeiten";
    const actions = trainingPlanActionButtons(
      childIndex,
      item.exercises.length,
      structural,
      () => trainingPlanMoveChild(itemIndex, childIndex, -1),
      () => trainingPlanMoveChild(itemIndex, childIndex, 1),
      () => trainingPlanRemoveChild(itemIndex, childIndex),
    );
    header.append(label, actions);
    editor.append(header, trainingPlanExerciseFields(exercise, editable));
    child.append(summary, editor);
    children.append(child);
  });
  if (item.exercises.length > 0) wrapper.append(children);
  return wrapper;
}

function trainingPlanExerciseFields(item, editable) {
  const grid = document.createElement("div");
  grid.className = "training-plan-grid training-plan-exercise-grid";

  const name = trainingPlanTextField("Name", item.name, 160, editable, (value) => {
    item.name = value;
    markTrainingPlanDirty();
  }, true);
  name.classList.add("training-plan-field--name");

  const sets = trainingPlanTextField("Sätze", item.sets, 80, editable, (value) => {
    item.sets = value;
    markTrainingPlanDirty();
  });
  const repetitions = trainingPlanTextField(
    "Wdh.",
    item.repetitions,
    80,
    editable,
    (value) => {
      item.repetitions = value;
      markTrainingPlanDirty();
    },
  );
  const amount = trainingPlanTextField("Menge", item.amount, 80, editable, (value) => {
    item.amount = value;
    markTrainingPlanDirty();
  });
  const unit = trainingPlanTextField("Einheit", item.unit, 80, editable, (value) => {
    item.unit = value;
    markTrainingPlanDirty();
  });
  const comment = trainingPlanTextField(
    "Kommentar",
    item.comment,
    2000,
    editable,
    (value) => {
      item.comment = value;
      markTrainingPlanDirty();
    },
    true,
  );
  comment.classList.add("training-plan-field--comment");

  grid.append(name, sets, repetitions, amount, unit, comment);
  return grid;
}

function trainingPlanTextField(label, value, maxLength, editable, onInput, wide) {
  const wrapper = document.createElement("label");
  if (wide) wrapper.className = "training-plan-wide";
  wrapper.append(document.createTextNode(label));
  const input = document.createElement(maxLength > 160 ? "textarea" : "input");
  if (input.tagName === "TEXTAREA") input.rows = 2;
  input.maxLength = maxLength;
  input.value = value || "";
  input.disabled = !editable;
  input.addEventListener("input", () => onInput(input.value));
  wrapper.append(input);
  return wrapper;
}

function trainingPlanNumberField(label, value, editable, onInput) {
  const wrapper = document.createElement("label");
  wrapper.append(document.createTextNode(label));
  const input = document.createElement("input");
  input.type = "number";
  input.min = "1";
  input.max = "2147483647";
  input.step = "1";
  input.inputMode = "numeric";
  input.value = value === null ? "" : String(value);
  input.disabled = !editable;
  input.addEventListener("input", () => {
    const parsed = input.value === "" ? null : Number(input.value);
    onInput(
      parsed === null || (Number.isSafeInteger(parsed) && parsed >= 1)
        ? parsed
        : null,
    );
  });
  wrapper.append(input);
  return wrapper;
}

function trainingPlanCanSaveBlockTemplate(item) {
  return trainingPlansCanEdit &&
    !trainingPlanDirty &&
    !trainingPlanConflict &&
    !trainingPlanSaveBusy &&
    !trainingPlanTemplateBusy &&
    !trainingPlanSaveBackBusy &&
    trainingPlanSelected !== null &&
    item?.kind === "block" &&
    typeof item.itemId === "string" &&
    item.itemId.length > 0;
}

function refreshTrainingPlanSaveBackButtons() {
  const buttons =
    trainingPlanElements.items?.querySelectorAll?.(
      "[data-training-plan-save-template]",
    ) || [];
  for (const button of buttons) {
    const itemIndex = Number(
      button.dataset.trainingPlanSaveTemplateIndex,
    );
    const item =
      Number.isSafeInteger(itemIndex) && itemIndex >= 0
        ? trainingPlanDraft?.items[itemIndex]
        : undefined;
    if (item?.kind === "block" && item.itemId) {
      button.dataset.trainingPlanSaveTemplate = item.itemId;
    }
    button.disabled = !trainingPlanCanSaveBlockTemplate(item);
  }
}

function renderTrainingPlanSaveBackAudiences() {
  const select = trainingPlanElements.saveTemplateAudience;
  if (!select) return;
  select.replaceChildren();
  if (trainingPlanSaveBackAudiences.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Keine aktive Trainingsgruppe verfügbar";
    select.append(option);
    select.value = "";
    return;
  }
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Trainingsgruppe auswählen";
  select.append(placeholder);
  for (const audience of trainingPlanSaveBackAudiences) {
    const option = document.createElement("option");
    option.value = audience.id;
    option.textContent =
      audience.shortName && audience.shortName !== audience.name
        ? audience.name + " (" + audience.shortName + ")"
        : audience.name;
    select.append(option);
  }
  select.value = "";
}

function closeTrainingPlanSaveTemplate(force) {
  if (!force && trainingPlanSaveBackBusy) return false;
  trainingPlanSaveBackOperation += 1;
  trainingPlanSaveBackBusy = false;
  trainingPlanSaveBackItemId = null;
  trainingPlanSaveBackAudiences = [];
  if (trainingPlanElements.saveTemplate) {
    trainingPlanElements.saveTemplate.hidden = true;
  }
  if (trainingPlanElements.saveTemplateName) {
    trainingPlanElements.saveTemplateName.value = "";
  }
  renderTrainingPlanSaveBackAudiences();
  showMessage(trainingPlanElements.saveTemplateMessage, "");
  refreshTrainingPlanTemplateControls();
  refreshTrainingPlanSaveBackButtons();
  refreshTrainingPlanGroupEditorActions();
  return true;
}

async function openTrainingPlanSaveTemplate(item) {
  if (!trainingPlanCanSaveBlockTemplate(item)) return;
  trainingPlanSaveBackItemId = item.itemId;
  trainingPlanSaveBackBusy = true;
  const operation = ++trainingPlanSaveBackOperation;
  trainingPlanSaveBackAudiences = [];
  refreshTrainingPlanTemplateControls();
  if (trainingPlanElements.saveTemplate) {
    trainingPlanElements.saveTemplate.hidden = false;
  }
  if (trainingPlanElements.saveTemplateName) {
    trainingPlanElements.saveTemplateName.value = item.name;
  }
  renderTrainingPlanSaveBackAudiences();
  showMessage(trainingPlanElements.saveTemplateMessage, "");
  if (trainingPlanElements.saveTemplateConfirm) {
    trainingPlanElements.saveTemplateConfirm.disabled = true;
  }

  try {
    const payload = await requestJson(
      "/api/modules/training-plans/block-template-save-options",
    );
    if (
      !Array.isArray(payload?.audiences) ||
      !payload.audiences.every(isTrainingPlanBlockTemplateAudience)
    ) {
      throw new Error("INVALID_TRAINING_PLAN_TEMPLATE_AUDIENCES");
    }
    if (
      operation !== trainingPlanSaveBackOperation ||
      trainingPlanSaveBackItemId !== item.itemId
    ) return;
    trainingPlanSaveBackAudiences = payload.audiences.slice();
    renderTrainingPlanSaveBackAudiences();
    if (trainingPlanSaveBackAudiences.length === 0) {
      showMessage(
        trainingPlanElements.saveTemplateMessage,
        "Es ist keine aktive Trainingsgruppe für eine Blockvorlage verfügbar.",
      );
    }
  } catch (error) {
    if (operation !== trainingPlanSaveBackOperation) return;
    trainingPlanSaveBackAudiences = [];
    renderTrainingPlanSaveBackAudiences();
    showMessage(
      trainingPlanElements.saveTemplateMessage,
      error?.status === 403
        ? "Du hast keine Berechtigung, Blockvorlagen anzulegen."
        : "Die Trainingsgruppen konnten nicht geladen werden.",
    );
  } finally {
    if (operation === trainingPlanSaveBackOperation) {
      trainingPlanSaveBackBusy = false;
      refreshTrainingPlanTemplateControls();
      refreshTrainingPlanSaveBackControls();
      refreshTrainingPlanSaveBackButtons();
    }
  }
}

function refreshTrainingPlanSaveBackControls() {
  const audienceId =
    trainingPlanElements.saveTemplateAudience?.value || "";
  const name = (trainingPlanElements.saveTemplateName?.value || "").trim();
  const blocked =
    trainingPlanSaveBackBusy ||
    trainingPlanSaveBackItemId === null ||
    audienceId.length === 0 ||
    name.length === 0;
  if (trainingPlanElements.saveTemplateName) {
    trainingPlanElements.saveTemplateName.disabled =
      trainingPlanSaveBackBusy;
  }
  if (trainingPlanElements.saveTemplateAudience) {
    trainingPlanElements.saveTemplateAudience.disabled =
      trainingPlanSaveBackBusy ||
      trainingPlanSaveBackAudiences.length === 0;
  }
  if (trainingPlanElements.saveTemplateConfirm) {
    trainingPlanElements.saveTemplateConfirm.disabled = blocked;
  }
  if (trainingPlanElements.saveTemplateCancel) {
    trainingPlanElements.saveTemplateCancel.disabled =
      trainingPlanSaveBackBusy;
  }
}

async function saveTrainingPlanBlockTemplate() {
  if (
    trainingPlanSaveBackBusy ||
    trainingPlanSaveBackItemId === null ||
    trainingPlanDirty ||
    trainingPlanConflict ||
    trainingPlanSaveBusy ||
    trainingPlanTemplateBusy ||
    trainingPlanSelected === null
  ) return;

  const audienceId =
    trainingPlanElements.saveTemplateAudience?.value || "";
  const name = (trainingPlanElements.saveTemplateName?.value || "").trim();
  if (audienceId.length === 0 || name.length === 0) return;

  const itemId = trainingPlanSaveBackItemId;
  const selectedPlan = trainingPlanSelected;
  const operation = ++trainingPlanSaveBackOperation;
  trainingPlanSaveBackBusy = true;
  refreshTrainingPlanTemplateControls();
  refreshTrainingPlanSaveBackControls();
  refreshTrainingPlanSaveBackButtons();
  showMessage(trainingPlanElements.saveTemplateMessage, "");

  try {
    const payload = await requestJson(
      "/api/modules/training-plans/block-templates",
      {
        method: "POST",
        body: JSON.stringify({
          planId: selectedPlan.id,
          blockItemId: itemId,
          expectedRevision: selectedPlan.currentRevision,
          audienceId,
          name,
        }),
      },
    );
    const template = payload?.template;
    if (!isTrainingPlanSavedBlockTemplate(template)) {
      throw new Error("INVALID_TRAINING_PLAN_SAVED_TEMPLATE");
    }
    if (operation !== trainingPlanSaveBackOperation) return;

    trainingPlanBlockTemplates = trainingPlanBlockTemplates
      .filter((candidate) => candidate.id !== template.id)
      .concat([
        {
          id: template.id,
          currentRevision: template.currentRevision,
          name: template.name,
          audienceName: template.audienceName,
          durationMinutes: template.durationMinutes,
          exerciseCount: template.exerciseCount,
        },
      ])
      .sort(
        (left, right) =>
          left.name.localeCompare(right.name, "de", {
            sensitivity: "base",
          }) || left.id.localeCompare(right.id),
      );
    renderTrainingPlanBlockTemplates();
    closeTrainingPlanSaveTemplate(true);
    trainingPlanSetSaveState("saved", "Vorlage angelegt");
  } catch (error) {
    if (operation !== trainingPlanSaveBackOperation) return;
    let message = "Die Blockvorlage konnte nicht angelegt werden.";
    if (error?.status === 403) {
      message = "Du hast keine Berechtigung, Blockvorlagen anzulegen.";
    } else if (error?.status === 409) {
      message =
        "Der Trainingsplan wurde inzwischen geändert. Bitte zuerst neu laden.";
    } else if (error?.status === 404) {
      message =
        "Der gespeicherte Planblock ist nicht mehr verfügbar. Bitte neu laden.";
    } else if (error?.status === 400) {
      message =
        "Dieser Planblock lässt sich nicht eindeutig als Blockvorlage abbilden. Prüfe Katalogübungen und Planwerte.";
    }
    showMessage(trainingPlanElements.saveTemplateMessage, message);
  } finally {
    if (operation === trainingPlanSaveBackOperation) {
      trainingPlanSaveBackBusy = false;
      refreshTrainingPlanSaveBackControls();
      refreshTrainingPlanSaveBackButtons();
    }
  }
}

function trainingPlanBlockDraftFromTemplate(template) {
  return {
    kind: "block",
    itemId: null,
    sourceBlockId: template.item.sourceBlockId,
    sourceBlockRevision: template.item.sourceBlockRevision,
    name: template.item.name,
    durationMinutes: template.item.durationMinutes,
    note: template.item.note || "",
    exercises: template.item.exercises.map((exercise) => ({
      itemId: null,
      sourceExerciseId: exercise.sourceExerciseId,
      name: exercise.name,
      sets: exercise.sets || "",
      repetitions: exercise.repetitions || "",
      amount: exercise.amount || "",
      unit: exercise.unit || "",
      comment: exercise.comment || "",
    })),
  };
}

async function addTrainingPlanBlockTemplate() {
  if (
    !trainingPlanDraft ||
    !trainingPlanEditorDate ||
    !trainingPlansCanEdit ||
    trainingPlanConflict ||
    trainingPlanSaveBusy ||
    trainingPlanTemplateBusy ||
    trainingPlanSaveBackBusy
  ) return;

  const summary = selectedTrainingPlanBlockTemplate();
  if (summary === null) return;

  const editorDate = trainingPlanEditorDate;
  trainingPlanTemplateBusy = true;
  refreshTrainingPlanTemplateControls();
  renderTrainingPlanItems();
  showMessage(trainingPlanElements.editorMessage, "");

  try {
    const payload = await requestJson(
      "/api/modules/training-plans/block-templates/" +
        encodeURIComponent(summary.id) +
        "?revision=" +
        encodeURIComponent(String(summary.currentRevision)),
    );
    const template = payload?.template;
    if (
      !isTrainingPlanBlockTemplate(template) ||
      template.id !== summary.id ||
      template.currentRevision !== summary.currentRevision
    ) {
      throw new Error("INVALID_TRAINING_PLAN_BLOCK_TEMPLATE");
    }
    if (
      trainingPlanEditorDate !== editorDate ||
      !trainingPlanDraft
    ) {
      return;
    }

    trainingPlanDraft.items.push(
      trainingPlanBlockDraftFromTemplate(template),
    );
    if (trainingPlanElements.blockTemplate) {
      trainingPlanElements.blockTemplate.value = "";
    }
    markTrainingPlanDirty(true);
  } catch (error) {
    if (error?.status === 404) {
      trainingPlanBlockTemplates = trainingPlanBlockTemplates.filter(
        (template) =>
          !(
            template.id === summary.id &&
            template.currentRevision === summary.currentRevision
          ),
      );
      renderTrainingPlanBlockTemplates();
      showMessage(
        trainingPlanElements.editorMessage,
        "Die Blockvorlage wurde geändert oder archiviert. Bitte neu auswählen.",
      );
    } else {
      showMessage(
        trainingPlanElements.editorMessage,
        "Die Blockvorlage konnte nicht geladen werden.",
      );
    }
  } finally {
    trainingPlanTemplateBusy = false;
    renderTrainingPlanItems();
    refreshTrainingPlanEditorState();
  }
}

async function openTrainingPlanPicker(mode) {
  if (
    !trainingPlanDraft ||
    !trainingPlansCanEdit ||
    trainingPlanConflict ||
    trainingPlanSaveBusy ||
    trainingPlanTemplateBusy ||
    trainingPlanSaveBackBusy
  ) return;
  trainingPlanPickerMode = mode;
  if (trainingPlanElements.picker) trainingPlanElements.picker.hidden = false;
  document.body.classList.add("training-plan-picker-open");
  if (trainingPlanElements.pickerSearch) trainingPlanElements.pickerSearch.value = "";
  if (trainingPlanElements.pickerManual) {
    trainingPlanElements.pickerManual.hidden = mode !== "exercise";
  }
  if (trainingPlanElements.pickerCategoryWrap) {
    trainingPlanElements.pickerCategoryWrap.hidden = mode !== "exercise";
  }
  if (trainingPlanElements.pickerCategory) {
    trainingPlanElements.pickerCategory.value = "";
  }
  if (trainingPlanElements.pickerTitle) {
    trainingPlanElements.pickerTitle.textContent =
      mode === "exercise" ? "Übung aus Katalog" : "Trainingsblock auswählen";
  }

  if (mode === "exercise") {
    renderTrainingPlanPickerCategories();
    trainingPlanPickerLoading = true;
    renderTrainingPlanPicker();
    try {
      const payload = await requestJson("/api/modules/exercise-catalog");
      const items = payload?.catalog?.items;
      if (
        payload?.module?.moduleId !== "exercise_catalog" ||
        payload?.access?.view !== true ||
        !Array.isArray(items) ||
        !items.every(isExerciseCatalogItem)
      ) {
        throw new Error("INVALID_TRAINING_PLAN_EXERCISE_PICKER");
      }
      exerciseCatalogItems = items.slice();
      renderTrainingPlanPickerCategories();
    } catch {
      showMessage(
        trainingPlanElements.editorMessage,
        "Der Übungskatalog konnte nicht aktualisiert werden. Der zuletzt geladene Stand bleibt verfügbar.",
      );
    } finally {
      trainingPlanPickerLoading = false;
      renderTrainingPlanPicker();
    }
  } else {
    await refreshTrainingPlanDependencies();
    renderTrainingPlanPicker();
  }
  trainingPlanElements.pickerSearch?.focus();
}

function closeTrainingPlanPicker() {
  trainingPlanPickerMode = null;
  trainingPlanPickerLoading = false;
  if (trainingPlanElements.picker) trainingPlanElements.picker.hidden = true;
  document.body.classList.remove("training-plan-picker-open");
  if (trainingPlanElements.pickerList) trainingPlanElements.pickerList.replaceChildren();
}

function renderTrainingPlanPickerCategories() {
  const select = trainingPlanElements.pickerCategory;
  if (!select) return;
  const selected = select.value;
  select.replaceChildren();
  const all = document.createElement("option");
  all.value = "";
  all.textContent = "Alle Kategorien";
  select.append(all);
  const keys = [...new Set(
    exerciseCatalogItems
      .filter((item) => item.isActive)
      .map((item) => item.categoryKey),
  )].sort((left, right) =>
    categoryLabel(left).localeCompare(categoryLabel(right), "de"),
  );
  for (const key of keys) {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = categoryLabel(key);
    select.append(option);
  }
  select.value = keys.includes(selected) ? selected : "";
}

function renderTrainingPlanPicker() {
  const container = trainingPlanElements.pickerList;
  if (!container || trainingPlanPickerMode === null) return;
  container.replaceChildren();

  const query = (trainingPlanElements.pickerSearch?.value || "")
    .trim()
    .toLocaleLowerCase("de");

  if (trainingPlanPickerLoading) {
    const loading = document.createElement("div");
    loading.className = "card";
    loading.textContent = "Wird geladen …";
    container.append(loading);
    return;
  }

  if (trainingPlanPickerMode === "exercise") {
    const categoryKey = trainingPlanElements.pickerCategory?.value || "";
    const items = exerciseCatalogItems
      .filter((item) => item.isActive)
      .filter((item) => !categoryKey || item.categoryKey === categoryKey)
      .filter((item) => {
        if (!query) return true;
        return [
          item.name,
          categoryLabel(item.categoryKey),
          ...(item.equipment || []),
        ].join(" ").toLocaleLowerCase("de").includes(query);
      })
      .slice()
      .sort((left, right) =>
        left.name.localeCompare(right.name, "de", { sensitivity: "base" }),
      );

    if (trainingPlanElements.pickerHint) {
      trainingPlanElements.pickerHint.textContent =
        "Katalogübung auswählen. Die Auswahl bleibt offen, damit mehrere Übungen nacheinander ergänzt werden können.";
    }
    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "card";
      empty.textContent = "Keine passende Katalogübung gefunden.";
      container.append(empty);
      return;
    }
    for (const item of items) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "training-plan-picker-option";
      button.dataset.trainingPlanPickExercise = item.id;
      const main = document.createElement("span");
      const title = document.createElement("strong");
      title.textContent = item.name;
      const meta = document.createElement("span");
      meta.textContent = [
        categoryLabel(item.categoryKey),
        item.isFavorite ? "★ Favorit" : null,
        item.equipment?.length ? item.equipment.join(", ") : null,
      ].filter(Boolean).join(" · ");
      main.append(title, meta);
      const icon = document.createElement("span");
      icon.className = "training-plan-picker-option__icon";
      icon.textContent = "＋";
      button.append(main, icon);
      container.append(button);
    }
    return;
  }

  const selectedGroup = trainingPlanOverviewGroups.find(
    (group) => group.id === trainingPlanSelectedOverviewGroupId,
  );
  const groupTerms = selectedGroup
    ? [selectedGroup.name, selectedGroup.shortName]
        .filter(Boolean)
        .map((value) => String(value).toLocaleLowerCase("de"))
    : [];
  const matchScore = (template) => {
    const audience = template.audienceName.toLocaleLowerCase("de");
    return groupTerms.some((term) => audience.includes(term)) ? 0 : 1;
  };
  const templates = trainingPlanBlockTemplates
    .filter((template) =>
      !query ||
      (template.name + " " + template.audienceName)
        .toLocaleLowerCase("de")
        .includes(query),
    )
    .slice()
    .sort(
      (left, right) =>
        matchScore(left) - matchScore(right) ||
        left.name.localeCompare(right.name, "de", { sensitivity: "base" }),
    );
  if (trainingPlanElements.pickerHint) {
    trainingPlanElements.pickerHint.textContent =
      "Passende Blöcke der gewählten Gruppe stehen oben. Die Auswahl bleibt für mehrere Blöcke geöffnet.";
  }
  if (templates.length === 0) {
    const empty = document.createElement("div");
    empty.className = "card";
    empty.textContent = "Keine passende Blockvorlage verfügbar.";
    container.append(empty);
    return;
  }
  for (const template of templates) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "training-plan-picker-option";
    button.dataset.trainingPlanPickBlock =
      template.id + "::" + String(template.currentRevision);
    const main = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = template.name;
    const meta = document.createElement("span");
    meta.textContent = [
      template.audienceName,
      template.durationMinutes === null
        ? null
        : String(template.durationMinutes) + " Min.",
      String(template.exerciseCount) + " Übung" +
        (template.exerciseCount === 1 ? "" : "en"),
    ].filter(Boolean).join(" · ");
    main.append(title, meta);
    const icon = document.createElement("span");
    icon.className = "training-plan-picker-option__icon";
    icon.textContent = "＋";
    button.append(main, icon);
    container.append(button);
  }
}

function trainingPlanExerciseDraftFromCatalog(item) {
  const defaults = new Map(
    (item.parameters || [])
      .filter((parameter) => parameter.defaultValue !== null)
      .map((parameter) => [parameter.key, parameter.defaultValue]),
  );
  const sets = defaults.get("sets") || "";
  const repetitions = defaults.get("repetitions") || "";
  const primary = (item.parameters || []).find(
    (parameter) =>
      parameter.key !== "sets" &&
      parameter.key !== "repetitions" &&
      parameter.inputType === "number" &&
      defaults.has(parameter.key),
  );
  const additional = (item.parameters || [])
    .filter(
      (parameter) =>
        parameter.key !== "sets" &&
        parameter.key !== "repetitions" &&
        parameter !== primary &&
        defaults.has(parameter.key),
    )
    .map((parameter) =>
      parameter.label + ": " + defaults.get(parameter.key) +
      (parameter.unit ? " " + parameter.unit : ""),
    )
    .join(" · ");

  return {
    kind: "exercise",
    itemId: null,
    sourceExerciseId: item.id,
    name: item.name,
    sets,
    repetitions,
    amount: primary ? defaults.get(primary.key) || "" : "",
    unit: primary?.unit || "",
    comment: additional ? "Planwerte: " + additional : "",
  };
}

function handleTrainingPlanPickerClick(event) {
  const exerciseButton = event.target.closest("[data-training-plan-pick-exercise]");
  if (exerciseButton) {
    const item = exerciseCatalogItems.find(
      (candidate) =>
        candidate.id === exerciseButton.dataset.trainingPlanPickExercise &&
        candidate.isActive,
    );
    if (!item || !trainingPlanDraft) return;
    trainingPlanDraft.items.push(trainingPlanExerciseDraftFromCatalog(item));
    markTrainingPlanDirty(true);
    trainingPlanSetSaveState("dirty", "Übung hinzugefügt");
    return;
  }

  const blockButton = event.target.closest("[data-training-plan-pick-block]");
  if (blockButton) {
    const value = blockButton.dataset.trainingPlanPickBlock || "";
    if (trainingPlanElements.blockTemplate) {
      trainingPlanElements.blockTemplate.value = value;
    }
    void addTrainingPlanBlockTemplate();
  }
}

function newTrainingPlanExerciseDraft() {
  return {
    kind: "exercise",
    itemId: null,
    sourceExerciseId: null,
    name: "Neue Übung",
    sets: "",
    repetitions: "",
    amount: "",
    unit: "",
    comment: "",
  };
}

function newTrainingPlanBlockDraft() {
  return {
    kind: "block",
    itemId: null,
    sourceBlockId: null,
    sourceBlockRevision: null,
    name: "Neuer Block",
    durationMinutes: null,
    note: "",
    exercises: [],
  };
}

function trainingPlanMoveItem(index, delta) {
  if (
    !trainingPlanDraft ||
    trainingPlanSaveBusy ||
    trainingPlanTemplateBusy ||
    trainingPlanSaveBackBusy
  ) return;
  const target = index + delta;
  if (target < 0 || target >= trainingPlanDraft.items.length) return;
  const values = trainingPlanDraft.items;
  [values[index], values[target]] = [values[target], values[index]];
  markTrainingPlanDirty(true);
}

function trainingPlanRemoveItem(index) {
  if (
    !trainingPlanDraft ||
    trainingPlanSaveBusy ||
    trainingPlanTemplateBusy ||
    trainingPlanSaveBackBusy
  ) return;
  trainingPlanDraft.items.splice(index, 1);
  markTrainingPlanDirty(true);
}

function trainingPlanMoveChild(itemIndex, childIndex, delta) {
  if (
    !trainingPlanDraft ||
    trainingPlanSaveBusy ||
    trainingPlanTemplateBusy ||
    trainingPlanSaveBackBusy
  ) return;
  const block = trainingPlanDraft.items[itemIndex];
  if (block?.kind !== "block") return;
  const target = childIndex + delta;
  if (target < 0 || target >= block.exercises.length) return;
  [block.exercises[childIndex], block.exercises[target]] =
    [block.exercises[target], block.exercises[childIndex]];
  markTrainingPlanDirty(true);
}

function trainingPlanRemoveChild(itemIndex, childIndex) {
  if (
    !trainingPlanDraft ||
    trainingPlanSaveBusy ||
    trainingPlanTemplateBusy ||
    trainingPlanSaveBackBusy
  ) return;
  const block = trainingPlanDraft.items[itemIndex];
  if (block?.kind !== "block") return;
  block.exercises.splice(childIndex, 1);
  markTrainingPlanDirty(true);
}

function markTrainingPlanDirty(render) {
  if (
    !trainingPlanDraft ||
    !trainingPlansCanEdit ||
    trainingPlanConflict
  ) return;
  trainingPlanDirty = true;
  trainingPlanChangeVersion += 1;
  trainingPlanSetSaveState("dirty", "Ungespeichert");
  refreshTrainingPlanSaveBackButtons();
  refreshTrainingPlanEditorState();
  if (render) renderTrainingPlanItems();
}

async function saveTrainingPlanUntilClean() {
  while (trainingPlanDirty) {
    const saved = await saveTrainingPlan();
    if (!saved) return false;
  }
  return true;
}

async function saveTrainingPlan() {
  if (
    !trainingPlanDraft ||
    !trainingPlanEditorDate ||
    !trainingPlansCanEdit ||
    trainingPlanConflict
  ) return false;
  if (!trainingPlanDirty) return true;
  if (
    trainingPlanSaveBusy ||
    trainingPlanTemplateBusy ||
    trainingPlanSaveBackBusy
  ) {
    return false;
  }

  trainingPlanSaveBusy = true;
  refreshTrainingPlanEditorState();
  const version = trainingPlanChangeVersion;
  const existing = trainingPlanSelected;
  const subjectId = trainingPlanSelectedSubjectId;
  const planDate = trainingPlanEditorDate;
  trainingPlanSetSaveState("saving", "Speichert …");

  try {
    const draftPayload = trainingPlanDraftPayload(trainingPlanDraft, existing !== null);
    const payload = existing
      ? await requestJson(
          "/api/modules/training-plans/" +
            encodeURIComponent(existing.id) +
            "/update",
          {
            method: "POST",
            keepalive: true,
            body: JSON.stringify({
              expectedRevision: existing.currentRevision,
              ...draftPayload,
            }),
          },
        )
      : await requestJson("/api/modules/training-plans", {
          method: "POST",
          keepalive: true,
          body: JSON.stringify({
            subjectId,
            planDate,
            ...draftPayload,
          }),
        });

    const saved = payload?.plan;
    if (
      !isTrainingPlanSnapshot(saved) ||
      saved.subjectId !== subjectId ||
      saved.planDate !== planDate
    ) {
      throw new Error("INVALID_TRAINING_PLAN_SAVE");
    }

    trainingPlanApplySavedIds(trainingPlanDraft, saved.revision.items);
    trainingPlanSelected = saved;
    replaceTrainingPlanWeekSnapshot(saved);
    if (trainingPlanChangeVersion === version) {
      trainingPlanDirty = false;
      trainingPlanSetSaveState("saved", "Gespeichert");
    } else {
      trainingPlanDirty = true;
      trainingPlanSetSaveState("dirty", "Weitere Änderungen …");
    }
    showMessage(trainingPlanElements.editorMessage, "");
    if (trainingPlanElements.retry) trainingPlanElements.retry.hidden = true;
    renderTrainingPlanWeek();
    replaceTrainingPlanOverviewSummary(saved);
    if (trainingPlanViewMode === "group") renderTrainingPlanOverview();
    return true;
  } catch (error) {
    if (
      error?.status === 409 &&
      (error?.code === "TRAINING_PLAN_CONFLICT" ||
        error?.code === "TRAINING_PLAN_TARGET_OCCUPIED")
    ) {
      trainingPlanConflict = true;
      trainingPlanDirty = true;
      trainingPlanSetSaveState("conflict", "Konflikt");
      showMessage(
        trainingPlanElements.editorMessage,
        "Der Plan wurde inzwischen geändert. Bitte den aktuellen Stand neu laden.",
      );
      if (trainingPlanElements.reload) trainingPlanElements.reload.hidden = false;
    } else {
      trainingPlanDirty = true;
      trainingPlanSetSaveState("error", "Speichern fehlgeschlagen");
      showMessage(
        trainingPlanElements.editorMessage,
        error?.status === 400
          ? "Bitte Eingaben prüfen. Der Plan wurde nicht gespeichert."
          : "Der Plan konnte nicht gespeichert werden.",
      );
      if (trainingPlanElements.retry) trainingPlanElements.retry.hidden = false;
    }
    return false;
  } finally {
    trainingPlanSaveBusy = false;
    if (trainingPlanConflict) {
      renderTrainingPlanItems();
    }
    refreshTrainingPlanEditorState();
  }
}

function trainingPlanDraftPayload(draft, includeIds) {
  return {
    note: trainingPlanOptionalText(draft.note),
    items: draft.items.map((item) => {
      if (item.kind === "exercise") {
        return trainingPlanExercisePayload(item, includeIds, true);
      }
      return {
        kind: "block",
        ...(includeIds && item.itemId ? { itemId: item.itemId } : {}),
        sourceBlockId: item.sourceBlockId,
        sourceBlockRevision: item.sourceBlockRevision,
        name: item.name,
        durationMinutes: item.durationMinutes,
        note: trainingPlanOptionalText(item.note),
        exercises: item.exercises.map((exercise) =>
          trainingPlanExercisePayload(exercise, includeIds, false),
        ),
      };
    }),
  };
}

function trainingPlanExercisePayload(item, includeIds, includeKind) {
  return {
    ...(includeKind ? { kind: "exercise" } : {}),
    ...(includeIds && item.itemId ? { itemId: item.itemId } : {}),
    sourceExerciseId: item.sourceExerciseId,
    name: item.name,
    sets: trainingPlanOptionalText(item.sets),
    repetitions: trainingPlanOptionalText(item.repetitions),
    amount: trainingPlanOptionalText(item.amount),
    unit: trainingPlanOptionalText(item.unit),
    comment: trainingPlanOptionalText(item.comment),
  };
}

function trainingPlanOptionalText(value) {
  const normalized = (value || "").trim();
  return normalized.length === 0 ? null : normalized;
}

function trainingPlanApplySavedIds(draft, savedItems) {
  if (draft.items.length !== savedItems.length) {
    throw new Error("INVALID_TRAINING_PLAN_SAVE");
  }

  draft.items.forEach((item, index) => {
    const saved = savedItems[index];
    if (!saved || saved.kind !== item.kind) {
      throw new Error("INVALID_TRAINING_PLAN_SAVE");
    }
    if (
      item.kind === "block" &&
      (saved.kind !== "block" ||
        item.exercises.length !== saved.exercises.length)
    ) {
      throw new Error("INVALID_TRAINING_PLAN_SAVE");
    }
  });

  draft.items.forEach((item, index) => {
    const saved = savedItems[index];
    if (!saved || saved.kind !== item.kind) {
      throw new Error("INVALID_TRAINING_PLAN_SAVE");
    }
    item.itemId = saved.itemId;
    if (item.kind === "block" && saved.kind === "block") {
      item.exercises.forEach((exercise, childIndex) => {
        const savedExercise = saved.exercises[childIndex];
        if (!savedExercise) {
          throw new Error("INVALID_TRAINING_PLAN_SAVE");
        }
        exercise.itemId = savedExercise.itemId;
      });
    }
  });
}

function replaceTrainingPlanOverviewSummary(saved) {
  if (!trainingPlanOverview) return;
  const row = trainingPlanOverview.rows.find(
    (candidate) => candidate.subject.id === saved.subjectId,
  );
  const cell = row?.cells.find(
    (candidate) => candidate.planDate === saved.planDate,
  );
  if (!cell) return;
  cell.planId = saved.id;
  cell.durationMinutes = saved.revision.items.reduce(
    (total, item) =>
      total +
      (item.kind === "block" && item.durationMinutes !== null
        ? item.durationMinutes
        : 0),
    0,
  );
  cell.exerciseCount = trainingPlanExerciseCount(saved.revision.items);
}

function replaceTrainingPlanWeekSnapshot(saved) {
  const index = trainingPlanWeekPlans.findIndex(
    (value) => value.planDate === saved.planDate,
  );
  if (index === -1) {
    trainingPlanWeekPlans.push(saved);
  } else {
    trainingPlanWeekPlans[index] = saved;
  }
  trainingPlanWeekPlans.sort((a, b) => a.planDate.localeCompare(b.planDate));
}

async function reloadTrainingPlanEditor() {
  if (!trainingPlanEditorDate || trainingPlanWeekLoading) return;
  const date = trainingPlanEditorDate;
  if (trainingPlanElements.reload) trainingPlanElements.reload.hidden = true;
  const reloaded = await loadTrainingPlanWeek();
  if (!reloaded) {
    trainingPlanConflict = true;
    trainingPlanDirty = true;
    trainingPlanSetSaveState("conflict", "Neu laden fehlgeschlagen");
    showMessage(
      trainingPlanElements.editorMessage,
      "Der aktuelle Stand konnte nicht geladen werden. Deine Änderungen bleiben erhalten.",
    );
    if (trainingPlanElements.reload) trainingPlanElements.reload.hidden = false;
    refreshTrainingPlanEditorState();
    return;
  }
  const plan =
    trainingPlanWeekPlans.find((value) => value.planDate === date) || null;
  trainingPlanSelected = plan;
  trainingPlanDraft = plan
    ? trainingPlanDraftFromSnapshot(plan)
    : { note: "", items: [] };
  trainingPlanConflict = false;
  trainingPlanDirty = false;
  trainingPlanChangeVersion = 0;
  populateTrainingPlanEditor();
}

function refreshTrainingPlanGroupEditorActions() {
  const rows = trainingPlanVisibleOverviewRows();
  const index = rows.findIndex(
    (row) => row.subject.id === trainingPlanSelectedSubjectId,
  );
  const groupMode =
    trainingPlanViewMode === "group" &&
    trainingPlanOverview !== null &&
    trainingPlanEditorDate !== null &&
    index >= 0;

  if (trainingPlanElements.prevAthlete) {
    trainingPlanElements.prevAthlete.hidden = !groupMode;
    trainingPlanElements.prevAthlete.disabled =
      !groupMode || index <= 0 || trainingPlanSaveBusy;
  }
  if (trainingPlanElements.nextAthlete) {
    trainingPlanElements.nextAthlete.hidden = !groupMode;
    trainingPlanElements.nextAthlete.disabled =
      !groupMode || index < 0 || index >= rows.length - 1 || trainingPlanSaveBusy;
  }
  if (trainingPlanElements.distributeOpen) {
    trainingPlanElements.distributeOpen.hidden = !groupMode;
    trainingPlanElements.distributeOpen.disabled =
      !groupMode ||
      !trainingPlansCanEdit ||
      trainingPlanSaveBusy ||
      trainingPlanTemplateBusy ||
      trainingPlanSaveBackBusy ||
      trainingPlanConflict;
  }
}

async function navigateTrainingPlanGroupAthlete(delta) {
  if (!trainingPlanEditorDate || !trainingPlanOverview) return;
  const rows = trainingPlanVisibleOverviewRows();
  const index = rows.findIndex(
    (row) => row.subject.id === trainingPlanSelectedSubjectId,
  );
  const target = rows[index + delta];
  if (!target) return;
  const date = trainingPlanEditorDate;
  if (!(await closeTrainingPlanEditor(false))) return;
  await openTrainingPlanFromOverview(target.subject.id, date);
}

function closeTrainingPlanDistribution() {
  trainingPlanDistributeBusy = false;
  if (trainingPlanElements.distribute) {
    trainingPlanElements.distribute.hidden = true;
  }
}

function renderTrainingPlanDistribution() {
  const container = trainingPlanElements.distributeList;
  if (!container) return;
  container.replaceChildren();
  if (!trainingPlanOverview || !trainingPlanEditorDate) return;
  const dayIndex = trainingPlanOverview.dates.indexOf(trainingPlanEditorDate);
  if (dayIndex < 0) return;

  for (const row of trainingPlanVisibleOverviewRows()) {
    if (row.subject.id === trainingPlanSelectedSubjectId) continue;
    const cell = row.cells[dayIndex];
    if (!cell) continue;
    const label = document.createElement("label");
    label.className = "training-plan-distribute-row";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = row.subject.id;
    checkbox.disabled = Boolean(cell.planId) || trainingPlanDistributeBusy;
    const name = document.createElement("span");
    name.textContent = row.subject.displayName;
    const status = document.createElement("small");
    status.textContent = cell.planId
      ? "Plan vorhanden"
      : trainingPlanAttendanceCompactLabel(cell.attendanceStatuses);
    label.append(checkbox, name, status);
    container.append(label);
  }

  if (container.childElementCount === 0) {
    const empty = document.createElement("p");
    empty.className = "settings-note";
    empty.textContent = "Keine weiteren Athleten für diesen Tag verfügbar.";
    container.append(empty);
  }
}

async function openTrainingPlanDistribution() {
  if (!trainingPlanOverview || !trainingPlanEditorDate || !trainingPlansCanEdit) {
    return;
  }
  if (!(await saveTrainingPlanUntilClean())) return;
  if (!trainingPlanSelected) {
    showMessage(
      trainingPlanElements.editorMessage,
      "Der Plan muss zuerst gespeichert werden, bevor er verteilt werden kann.",
    );
    return;
  }
  renderTrainingPlanDistribution();
  if (trainingPlanElements.distribute) {
    trainingPlanElements.distribute.hidden = false;
  }
}

async function distributeTrainingPlan() {
  if (
    !trainingPlanSelected ||
    !trainingPlanEditorDate ||
    !trainingPlanOverview ||
    trainingPlanDistributeBusy
  ) return;
  const selected = [
    ...(trainingPlanElements.distributeList?.querySelectorAll(
      "input[type='checkbox']:checked:not(:disabled)",
    ) || []),
  ].map((input) => input.value);
  if (selected.length === 0) return;

  trainingPlanDistributeBusy = true;
  if (trainingPlanElements.distributeConfirm) {
    trainingPlanElements.distributeConfirm.disabled = true;
  }
  renderTrainingPlanDistribution();

  let copied = 0;
  let skipped = 0;
  try {
    for (const subjectId of selected) {
      try {
        const payload = await requestJson(
          "/api/modules/training-plans/" +
            encodeURIComponent(trainingPlanSelected.id) +
            "/copy",
          {
            method: "POST",
            body: JSON.stringify({
              targetSubjectId: subjectId,
              targetDate: trainingPlanEditorDate,
            }),
          },
        );
        const plan = payload?.plan;
        if (!isTrainingPlanSnapshot(plan)) {
          throw new Error("INVALID_TRAINING_PLAN_COPY");
        }
        replaceTrainingPlanOverviewSummary(plan);
        copied += 1;
      } catch (error) {
        if (
          error?.status === 409 &&
          error?.code === "TRAINING_PLAN_TARGET_OCCUPIED"
        ) {
          skipped += 1;
          continue;
        }
        throw error;
      }
    }
    renderTrainingPlanOverview();
    closeTrainingPlanDistribution();
    showMessage(
      trainingPlanElements.editorMessage,
      "Plan auf " +
        String(copied) +
        " Athlet" +
        (copied === 1 ? "en" : "en") +
        " kopiert" +
        (skipped > 0 ? "; " + String(skipped) + " bereits belegt." : "."),
      "success",
    );
  } catch {
    showMessage(
      trainingPlanElements.editorMessage,
      "Der Plan konnte nicht vollständig verteilt werden.",
    );
  } finally {
    trainingPlanDistributeBusy = false;
    if (trainingPlanElements.distributeConfirm) {
      trainingPlanElements.distributeConfirm.disabled = false;
    }
    refreshTrainingPlanEditorState();
  }
}

function refreshTrainingPlanEditorState() {
  const readonly = !trainingPlansCanEdit;
  if (trainingPlanElements.editor) {
    trainingPlanElements.editor.inert = trainingPlanSaveBusy;
  }
  if (trainingPlanElements.note) {
    trainingPlanElements.note.disabled =
      readonly || trainingPlanConflict;
  }
  refreshTrainingPlanTemplateControls();
  refreshTrainingPlanSaveBackButtons();
  if (trainingPlanElements.meta) {
    trainingPlanElements.meta.textContent = trainingPlanSelected
      ? "Version " + String(trainingPlanSelected.currentRevision)
      : readonly
        ? "Noch kein gespeicherter Plan."
        : "Neuer Plan";
  }
  if (trainingPlanElements.save) {
    trainingPlanElements.save.disabled =
      readonly ||
      trainingPlanConflict ||
      trainingPlanSaveBusy ||
      trainingPlanTemplateBusy ||
      trainingPlanSaveBackBusy ||
      !trainingPlanDirty;
  }
  if (readonly) {
    trainingPlanSetSaveState("saved", "Nur Lesen");
  } else if (!trainingPlanDirty && !trainingPlanSaveBusy && !trainingPlanConflict) {
    trainingPlanSetSaveState("saved", trainingPlanSelected ? "Gespeichert" : "Noch nicht gespeichert");
  }
}

function persistTrainingPlanOnPageHide() {
  if (
    !trainingPlanDraft ||
    !trainingPlanEditorDate ||
    !trainingPlanDirty ||
    !trainingPlansCanEdit ||
    trainingPlanConflict ||
    trainingPlanSaveBusy ||
    trainingPlanTemplateBusy ||
    trainingPlanSaveBackBusy
  ) return;

  const existing = trainingPlanSelected;
  const draftPayload = trainingPlanDraftPayload(
    trainingPlanDraft,
    existing !== null,
  );
  const url = existing
    ? "/api/modules/training-plans/" +
      encodeURIComponent(existing.id) +
      "/update"
    : "/api/modules/training-plans";
  const body = existing
    ? {
        expectedRevision: existing.currentRevision,
        ...draftPayload,
      }
    : {
        subjectId: trainingPlanSelectedSubjectId,
        planDate: trainingPlanEditorDate,
        ...draftPayload,
      };

  void fetch(url, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    credentials: "same-origin",
    keepalive: true,
    body: JSON.stringify(body),
  });
}

function trainingPlanSetSaveState(state, text) {
  if (!trainingPlanElements.saveState) return;
  trainingPlanElements.saveState.dataset.state = state;
  trainingPlanElements.saveState.textContent = text;
}

function trainingPlanMonday(value) {
  const date = new Date(value);
  const day = date.getDay();
  const delta = day === 0 ? -6 : 1 - day;
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + delta);
  return trainingPlanLocalIso(date);
}

function trainingPlanLocalIso(value) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

function trainingPlanAddDays(value, days) {
  const date = new Date(value + "T12:00:00");
  date.setDate(date.getDate() + days);
  return trainingPlanLocalIso(date);
}

function trainingPlanDayLabel(value) {
  return new Date(value + "T12:00:00").toLocaleDateString("de-AT", {
    weekday: "short",
  });
}

function trainingPlanShortDate(value) {
  return new Date(value + "T12:00:00").toLocaleDateString("de-AT", {
    day: "2-digit",
    month: "2-digit",
  });
}

function trainingPlanDateLabel(value) {
  return new Date(value + "T12:00:00").toLocaleDateString("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

for (const control of document.querySelectorAll("[data-training-plan-mode]")) {
  control.addEventListener("click", () => {
    void showTrainingPlanMode(control.dataset.trainingPlanMode || "group");
  });
}
trainingPlanElements.overviewGroup?.addEventListener("change", () => {
  trainingPlanSelectedOverviewGroupId =
    trainingPlanElements.overviewGroup?.value || "";
  trainingPlanOverview = null;
  void loadTrainingPlanOverview();
});
trainingPlanElements.overviewAttendanceFilter?.addEventListener("change", () => {
  const value = trainingPlanElements.overviewAttendanceFilter?.value || "all";
  trainingPlanOverviewAttendanceFilter =
    value === "present" ||
    value === "excused" ||
    value === "absent" ||
    value === "open" ||
    value === "none"
      ? value
      : "all";
  renderTrainingPlanOverview();
});
trainingPlanElements.overviewDays?.addEventListener("click", (event) => {
  const control = event.target?.closest?.("[data-training-plan-overview-day]");
  if (!control) return;
  const index = Number(control.dataset.trainingPlanOverviewDay);
  if (!Number.isSafeInteger(index) || index < 0 || index > 6) return;
  trainingPlanOverviewDayIndex = index;
  renderTrainingPlanOverview();
});
trainingPlanElements.overview?.addEventListener("click", (event) => {
  const control = event.target?.closest?.(
    "[data-training-plan-overview-subject]",
  );
  if (!control) return;
  void openTrainingPlanFromOverview(
    control.dataset.trainingPlanOverviewSubject || "",
    control.dataset.trainingPlanOverviewDate || "",
  );
});
trainingPlanElements.subject?.addEventListener("change", () => {
  void (async () => {
    const nextSubjectId = trainingPlanElements.subject?.value || "";
    if (!(await closeTrainingPlanEditor(false))) {
      if (trainingPlanElements.subject) {
        trainingPlanElements.subject.value = trainingPlanSelectedSubjectId;
      }
      return;
    }
    trainingPlanSelectedSubjectId = nextSubjectId;
    trainingPlanWeekPlans = [];
    trainingPlanWeekAttendance = [];
    trainingPlanWeekLoaded = false;
    await loadTrainingPlanWeek();
  })();
});
trainingPlanElements.weekPrev?.addEventListener("click", () => {
  void (async () => {
    if (!(await closeTrainingPlanEditor(false))) return;
    trainingPlanWeekStart = trainingPlanAddDays(trainingPlanWeekStart, -7);
    trainingPlanOverviewDayIndex = trainingPlanDefaultOverviewDayIndex();
    trainingPlanWeekPlans = [];
    trainingPlanWeekAttendance = [];
    trainingPlanWeekLoaded = false;
    trainingPlanOverview = null;
    renderTrainingPlanMode();
    await loadTrainingPlanActiveView();
  })();
});
trainingPlanElements.weekToday?.addEventListener("click", () => {
  void (async () => {
    if (!(await closeTrainingPlanEditor(false))) return;
    trainingPlanWeekStart = trainingPlanMonday(new Date());
    trainingPlanOverviewDayIndex = trainingPlanDefaultOverviewDayIndex();
    trainingPlanWeekPlans = [];
    trainingPlanWeekAttendance = [];
    trainingPlanWeekLoaded = false;
    trainingPlanOverview = null;
    renderTrainingPlanMode();
    await loadTrainingPlanActiveView();
  })();
});
trainingPlanElements.weekNext?.addEventListener("click", () => {
  void (async () => {
    if (!(await closeTrainingPlanEditor(false))) return;
    trainingPlanWeekStart = trainingPlanAddDays(trainingPlanWeekStart, 7);
    trainingPlanOverviewDayIndex = trainingPlanDefaultOverviewDayIndex();
    trainingPlanWeekPlans = [];
    trainingPlanWeekAttendance = [];
    trainingPlanWeekLoaded = false;
    trainingPlanOverview = null;
    renderTrainingPlanMode();
    await loadTrainingPlanActiveView();
  })();
});
trainingPlanElements.attendanceFilter?.addEventListener("change", () => {
  const value = trainingPlanElements.attendanceFilter?.value || "all";
  trainingPlanAttendanceFilter =
    value === "present" ||
    value === "excused" ||
    value === "absent" ||
    value === "open" ||
    value === "none"
      ? value
      : "all";
  renderTrainingPlanWeek();
});
trainingPlanElements.week?.addEventListener("click", (event) => {
  if (trainingPlanWeekLoading || !trainingPlanWeekLoaded) return;
  const control = event.target?.closest?.("[data-training-plan-day]");
  if (!control) return;
  openTrainingPlanEditor(control.dataset.trainingPlanDay || "");
});
trainingPlanElements.close?.addEventListener("click", () => {
  void closeTrainingPlanEditor(false);
});
trainingPlanElements.save?.addEventListener("click", () => {
  void saveTrainingPlan();
});
trainingPlanElements.prevAthlete?.addEventListener("click", () => {
  void navigateTrainingPlanGroupAthlete(-1);
});
trainingPlanElements.nextAthlete?.addEventListener("click", () => {
  void navigateTrainingPlanGroupAthlete(1);
});
trainingPlanElements.distributeOpen?.addEventListener("click", () => {
  void openTrainingPlanDistribution();
});
trainingPlanElements.distributeClose?.addEventListener(
  "click",
  closeTrainingPlanDistribution,
);
trainingPlanElements.distributeConfirm?.addEventListener("click", () => {
  void distributeTrainingPlan();
});
trainingPlanElements.reload?.addEventListener("click", () => void reloadTrainingPlanEditor());
trainingPlanElements.retry?.addEventListener("click", () => {
  if (trainingPlanConflict) return;
  trainingPlanDirty = true;
  void saveTrainingPlan();
});
trainingPlanElements.note?.addEventListener("input", () => {
  if (!trainingPlanDraft) return;
  trainingPlanDraft.note = trainingPlanElements.note?.value || "";
  markTrainingPlanDirty();
});
trainingPlanElements.addExercise?.addEventListener("click", () => {
  void openTrainingPlanPicker("exercise");
});
trainingPlanElements.addBlock?.addEventListener("click", () => {
  void openTrainingPlanPicker("block");
});
trainingPlanElements.pickerClose?.addEventListener("click", closeTrainingPlanPicker);
trainingPlanElements.pickerSearch?.addEventListener("input", renderTrainingPlanPicker);
trainingPlanElements.pickerCategory?.addEventListener("change", renderTrainingPlanPicker);
trainingPlanElements.pickerList?.addEventListener("click", handleTrainingPlanPickerClick);
trainingPlanElements.pickerManual?.addEventListener("click", () => {
  if (!trainingPlanDraft) return;
  trainingPlanDraft.items.push(newTrainingPlanExerciseDraft());
  closeTrainingPlanPicker();
  markTrainingPlanDirty(true);
});
trainingPlanElements.blockTemplate?.addEventListener("change", () => {
  refreshTrainingPlanTemplateControls();
});
trainingPlanElements.addTemplate?.addEventListener("click", () => {
  void addTrainingPlanBlockTemplate();
});
trainingPlanElements.saveTemplateName?.addEventListener("input", () => {
  refreshTrainingPlanSaveBackControls();
});
trainingPlanElements.saveTemplateAudience?.addEventListener("change", () => {
  refreshTrainingPlanSaveBackControls();
});
trainingPlanElements.saveTemplateCancel?.addEventListener("click", () => {
  closeTrainingPlanSaveTemplate(false);
});
trainingPlanElements.saveTemplateConfirm?.addEventListener("click", () => {
  void saveTrainingPlanBlockTemplate();
});
window.addEventListener("pagehide", persistTrainingPlanOnPageHide);
document.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    trainingPlanElements.picker &&
    !trainingPlanElements.picker.hidden
  ) {
    closeTrainingPlanPicker();
    return;
  }
  if (
    event.key === "Escape" &&
    trainingPlanElements.saveTemplate &&
    !trainingPlanElements.saveTemplate.hidden
  ) {
    closeTrainingPlanSaveTemplate(false);
  }
});
window.addEventListener("beforeunload", (event) => {
  if (
    !trainingPlanDirty &&
    !trainingPlanSaveBusy &&
    !trainingPlanSaveBackBusy
  ) return;
  event.preventDefault();
  event.returnValue = "";
});
`;
