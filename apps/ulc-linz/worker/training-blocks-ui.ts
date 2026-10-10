export const ULC_TRAINING_BLOCKS_HTML = `
          <section class="app-section" data-app-section="training-blocks" id="training-blocks" hidden>
            <section class="hero training-blocks-hero">
              <div>
                <p class="eyebrow">Training</p>
                <h1>Trainingsblöcke</h1>
                <p class="summary">Wiederverwendbare Trainingsvorlagen mit Übungen, Parametern und Versionen.</p>
              </div>
              <button class="button button--primary" id="training-block-new" type="button" hidden>Neuer Block</button>
            </section>

            <p class="message message--error" id="training-block-message" role="alert" hidden></p>

            <section class="card training-block-commandbar">
              <label>Suche
                <input id="training-block-search" type="search" maxlength="160" placeholder="Block oder Trainingsgruppe …" autocomplete="off" />
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
              <section class="training-block-dialog" role="dialog" aria-modal="true" aria-labelledby="training-block-editor-title">
                <header class="training-block-header">
                  <div>
                    <p class="eyebrow" id="training-block-editor-eyebrow">Trainingsblock</p>
                    <h2 id="training-block-editor-title">Block bearbeiten</h2>
                    <span class="training-block-save-state" id="training-block-save-state" data-state="saved">Gespeichert</span>
                  </div>
                  <button class="button button--secondary" id="training-block-close" type="button">Schließen</button>
                </header>

                <div class="training-block-body">
                  <p class="message message--error" id="training-block-editor-message" role="alert" hidden></p>
                  <button class="button button--secondary training-block-reload" id="training-block-reload" type="button" hidden>Aktuellen Stand neu laden</button>

                  <section class="card training-block-form-card">
                    <div class="training-block-form-grid">
                      <label class="training-block-wide">Name
                        <input id="training-block-name" minlength="2" maxlength="120" />
                      </label>
                      <label>Trainingsgruppe
                        <select id="training-block-audience"></select>
                      </label>
                      <label>Dauer (Min.)
                        <input id="training-block-duration" type="number" min="1" max="1440" step="1" inputmode="numeric" placeholder="Optional" />
                      </label>
                      <label class="training-block-wide">Notiz
                        <textarea id="training-block-note" maxlength="10000" rows="3" placeholder="Optional"></textarea>
                      </label>
                    </div>
                  </section>

                  <section class="card training-block-exercises-card">
                    <div class="section-heading">
                      <div><p class="eyebrow">Inhalt</p><h3>Übungen</h3></div>
                      <span id="training-block-exercise-count">0</span>
                    </div>
                    <div class="training-block-add">
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
                  <button class="button button--danger" id="training-block-deactivate" type="button" hidden>Deaktivieren</button>
                  <span>Änderungen werden automatisch gespeichert.</span>
                </footer>
              </section>
            </div>

            <div class="training-block-info-backdrop" id="training-block-exercise-info" hidden>
              <section class="training-block-info-dialog" role="dialog" aria-modal="true" aria-labelledby="training-block-info-title">
                <header class="training-block-header">
                  <div><p class="eyebrow">Übung</p><h2 id="training-block-info-title">Details</h2></div>
                  <button class="button button--secondary" id="training-block-info-close" type="button">Schließen</button>
                </header>
                <div class="training-block-info-body" id="training-block-info-body"></div>
              </section>
            </div>
          </section>
`;

export const ULC_TRAINING_BLOCKS_CSS = `
.training-blocks-hero {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 12px;
}
.training-block-commandbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(120px, .35fr);
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
.training-block-row__meta { margin-top: 3px; color: var(--secondary); font-size: .8rem; }
.training-block-row__badge {
  border-radius: 999px;
  padding: 3px 8px;
  background: var(--muted);
  color: var(--secondary);
  font-size: .72rem;
}
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
  width: min(100%, 760px);
  max-height: min(94vh, 920px);
  overflow: auto;
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
.training-block-header h2 { margin: 2px 0 4px; }
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
.training-block-body { display: grid; gap: 12px; padding: 12px; }
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
.training-block-exercise__actions { display: flex; flex-wrap: wrap; gap: 5px; }
.training-block-exercise__actions button { min-height: 36px; padding: 6px 9px; }
.training-block-exercise__note { display: block; margin-top: 10px; }
.training-block-parameters { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
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
.training-block-comparison,
.training-block-info-body {
  margin-top: 10px;
  padding: 12px;
  border-radius: var(--control-radius);
  background: var(--muted);
  white-space: pre-wrap;
}
.training-block-info-body { margin: 0; border-radius: 0; background: var(--page); }
.training-block-info-section { margin-bottom: 14px; }
.training-block-info-section h3 { margin-bottom: 4px; }
.training-block-footer {
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px max(12px, env(safe-area-inset-bottom));
  border-top: 1px solid var(--border);
  background: rgb(255 255 255 / 96%);
  color: var(--secondary);
  font-size: .78rem;
}
body.training-block-editor-open { overflow: hidden; }
.training-block-reload { width: 100%; }
@media (max-width: 480px) {
  .training-blocks-hero { align-items: stretch; flex-direction: column; }
  .training-block-commandbar { grid-template-columns: 1fr 120px; }
  .training-block-form-grid,
  .training-block-parameters { grid-template-columns: 1fr; }
  .training-block-wide { grid-column: auto; }
  .training-block-compare-controls { grid-template-columns: 1fr 1fr; }
  .training-block-compare-controls .button { grid-column: 1 / -1; }
}
`;

export const ULC_TRAINING_BLOCKS_SCRIPT = `
const trainingBlockElements = Object.freeze({
  quickAction: document.querySelector("#training-block-quick-action"),
  accessLabel: document.querySelector("#training-block-access-label"),
  message: document.querySelector("#training-block-message"),
  list: document.querySelector("#training-block-list"),
  search: document.querySelector("#training-block-search"),
  statusFilter: document.querySelector("#training-block-status-filter"),
  newButton: document.querySelector("#training-block-new"),
  editor: document.querySelector("#training-block-editor"),
  editorEyebrow: document.querySelector("#training-block-editor-eyebrow"),
  editorTitle: document.querySelector("#training-block-editor-title"),
  editorMessage: document.querySelector("#training-block-editor-message"),
  saveState: document.querySelector("#training-block-save-state"),
  reload: document.querySelector("#training-block-reload"),
  close: document.querySelector("#training-block-close"),
  name: document.querySelector("#training-block-name"),
  audience: document.querySelector("#training-block-audience"),
  duration: document.querySelector("#training-block-duration"),
  note: document.querySelector("#training-block-note"),
  exercisePicker: document.querySelector("#training-block-exercise-picker"),
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
  deactivate: document.querySelector("#training-block-deactivate"),
  info: document.querySelector("#training-block-exercise-info"),
  infoTitle: document.querySelector("#training-block-info-title"),
  infoBody: document.querySelector("#training-block-info-body"),
  infoClose: document.querySelector("#training-block-info-close"),
});

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
    value.name.length < 2 ||
    (value.audienceId !== null && typeof value.audienceId !== "string") ||
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
    isTrainingBlockRevision(value.revision) &&
    value.revision.revision === value.currentRevision;
}

async function bootstrapTrainingBlocks() {
  trainingBlocksReady = false;
  trainingBlocksCanEdit = false;
  trainingBlocks = [];
  trainingBlockAudiences = [];
  closeTrainingBlockEditor(true);
  refreshAppAvailability();
  showMessage(trainingBlockElements.message, "");
  try {
    const payload = await requestJson("/api/modules/training-blocks");
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
    renderTrainingBlocks();
  } catch (error) {
    showMessage(
      trainingBlockElements.message,
      error?.status === 403
        ? "Für Trainingsblöcke fehlt die Berechtigung."
        : "Trainingsblöcke sind derzeit nicht verfügbar.",
    );
  }
  refreshAppAvailability();
}

function prepareTrainingBlocksView() {
  if (!trainingBlocksReady) return;
  renderTrainingBlocks();
  refreshTrainingBlockControls();
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
      !trainingBlocksCanEdit || trainingBlockAudiences.length === 0;
  }
}

function trainingBlockAudienceLabel(id) {
  const audience = trainingBlockAudiences.find((value) => value.id === id);
  if (!audience) return id || "Ohne Gruppe";
  return audience.shortName
    ? audience.name + " (" + audience.shortName + ")"
    : audience.name;
}

function trainingBlockExerciseItem(id) {
  return exerciseCatalogItems.find((item) => item.id === id) || null;
}

function renderTrainingBlocks() {
  const container = trainingBlockElements.list;
  if (!container) return;
  container.replaceChildren();

  const query = (trainingBlockElements.search?.value || "")
    .trim()
    .toLocaleLowerCase("de");
  const status = trainingBlockElements.statusFilter?.value || "active";
  const filtered = trainingBlocks.filter((block) => {
    if (status === "active" && !block.isActive) return false;
    if (status === "archived" && block.isActive) return false;
    if (!query) return true;
    return (
      block.revision.name.toLocaleLowerCase("de").includes(query) ||
      trainingBlockAudienceLabel(block.revision.audienceId)
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

  const grouped = new Map();
  for (const block of filtered) {
    const key = trainingBlockAudienceLabel(block.revision.audienceId);
    const values = grouped.get(key) || [];
    values.push(block);
    grouped.set(key, values);
  }

  const groups = [...grouped.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], "de", { sensitivity: "base" }),
  );
  for (const entry of groups) {
    const details = document.createElement("details");
    details.className = "training-block-group";
    details.open = true;
    const summary = document.createElement("summary");
    const title = document.createElement("span");
    title.textContent = entry[0];
    const count = document.createElement("span");
    count.textContent = String(entry[1].length);
    summary.append(title, count);
    const items = document.createElement("div");
    items.className = "training-block-group__items";

    entry[1]
      .slice()
      .sort((a, b) =>
        a.revision.name.localeCompare(b.revision.name, "de", {
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
        const meta = document.createElement("span");
        meta.className = "training-block-row__meta";
        meta.textContent = [
          block.revision.durationMinutes === null
            ? null
            : String(block.revision.durationMinutes) + " Min.",
          String(block.revision.exercises.length) + " Übung(en)",
          "Version " + String(block.currentRevision),
        ].filter(Boolean).join(" · ");
        main.append(strong, meta);
        const badge = document.createElement("span");
        badge.className = "training-block-row__badge";
        badge.textContent = block.isActive ? "Aktiv" : "Archiv";
        row.append(main, badge);
        items.append(row);
      });

    details.append(summary, items);
    container.append(details);
  }
}

function trainingBlockDraftFromSnapshot(block) {
  return {
    name: block.revision.name,
    audienceId: block.revision.audienceId || "",
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
  if (!trainingBlocksCanEdit || trainingBlockAudiences.length === 0) return;
  trainingBlockSelected = null;
  trainingBlockDraft = {
    name: "",
    audienceId:
      trainingBlockAudiences.length === 1 ? trainingBlockAudiences[0].id : "",
    durationMinutes: null,
    note: "",
    exercises: [],
  };
  trainingBlockDirty = false;
  trainingBlockConflict = false;
  trainingBlockChangeVersion = 0;
  populateTrainingBlockEditor();
  trainingBlockElements.name?.focus();
}

async function openTrainingBlock(id) {
  if (!trainingBlocksReady) return;
  showMessage(trainingBlockElements.message, "");
  try {
    const payload = await requestJson(
      "/api/modules/training-blocks/" + encodeURIComponent(id),
    );
    if (!isTrainingBlockSnapshot(payload?.block)) {
      throw new Error("INVALID_TRAINING_BLOCK_DETAIL");
    }
    trainingBlockSelected = payload.block;
    trainingBlockDraft = trainingBlockDraftFromSnapshot(payload.block);
    trainingBlockDirty = false;
    trainingBlockConflict = false;
    trainingBlockChangeVersion = 0;
    populateTrainingBlockEditor();
  } catch (error) {
    showMessage(
      trainingBlockElements.message,
      error?.status === 404
        ? "Der Trainingsblock wurde nicht gefunden."
        : "Der Trainingsblock konnte nicht geladen werden.",
    );
  }
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
  if (trainingBlockElements.reload) trainingBlockElements.reload.hidden = true;
  if (trainingBlockElements.deactivate) {
    trainingBlockElements.deactivate.hidden =
      !trainingBlocksCanEdit ||
      !trainingBlockSelected ||
      !trainingBlockSelected.isActive;
  }
  showMessage(trainingBlockElements.editorMessage, "");
  renderTrainingBlockExercisePicker();
  renderTrainingBlockExercises();
  resetTrainingBlockHistory();
  setTrainingBlockSaveState(
    trainingBlockSelected ? "saved" : "draft",
    trainingBlockSelected ? "Gespeichert" : "Entwurf",
  );
}

function renderTrainingBlockAudienceOptions() {
  const select = trainingBlockElements.audience;
  if (!select || !trainingBlockDraft) return;
  select.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Trainingsgruppe wählen";
  select.append(placeholder);
  for (const audience of trainingBlockAudiences) {
    const option = document.createElement("option");
    option.value = audience.id;
    option.textContent = trainingBlockAudienceLabel(audience.id);
    select.append(option);
  }
  select.value = trainingBlockDraft.audienceId || "";
  select.disabled =
    !trainingBlocksCanEdit || trainingBlockSelected?.isActive === false;
}

function renderTrainingBlockExercisePicker() {
  const select = trainingBlockElements.exercisePicker;
  if (!select) return;
  select.replaceChildren();
  const activeItems = exerciseCatalogItems
    .filter((item) => item.isActive)
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
    trainingBlocksCanEdit && trainingBlockSelected?.isActive !== false;
  select.disabled = !editable || !exerciseCatalogReady || activeItems.length === 0;
  if (trainingBlockElements.exerciseAdd) {
    trainingBlockElements.exerciseAdd.disabled = select.disabled;
  }
  if (trainingBlockElements.catalogHint) {
    trainingBlockElements.catalogHint.textContent = exerciseCatalogReady
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

function renderTrainingBlockExercises() {
  const container = trainingBlockElements.exercises;
  if (!container || !trainingBlockDraft) return;
  container.replaceChildren();
  if (trainingBlockElements.exerciseCount) {
    trainingBlockElements.exerciseCount.textContent =
      String(trainingBlockDraft.exercises.length);
  }
  const editable =
    trainingBlocksCanEdit && trainingBlockSelected?.isActive !== false;
  trainingBlockDraft.exercises.forEach((draft, index) => {
    const item = trainingBlockExerciseItem(draft.exerciseId);
    const row = document.createElement("article");
    row.className = "training-block-exercise";
    row.dataset.trainingBlockExerciseIndex = String(index);

    const header = document.createElement("div");
    header.className = "training-block-exercise__header";
    const title = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = item?.name || draft.exerciseId;
    const meta = document.createElement("div");
    meta.className = "training-block-exercise__meta";
    meta.textContent = item
      ? [categoryLabel(item.categoryKey), item.subcategory, item.goal]
          .filter(Boolean)
          .join(" · ")
      : "Kataloginformation nicht verfügbar";
    title.append(strong, meta);

    const actions = document.createElement("div");
    actions.className = "training-block-exercise__actions";
    const info = trainingBlockActionButton("Info", "info", index);
    actions.append(info);
    if (editable) {
      const up = trainingBlockActionButton("↑", "up", index);
      const down = trainingBlockActionButton("↓", "down", index);
      const remove = trainingBlockActionButton("Entfernen", "remove", index);
      up.disabled = index === 0;
      down.disabled = index === trainingBlockDraft.exercises.length - 1;
      actions.append(up, down, remove);
    }
    header.append(title, actions);
    row.append(header);

    const note = document.createElement("label");
    note.className = "training-block-exercise__note";
    note.textContent = "Notiz";
    const noteInput = document.createElement("input");
    noteInput.maxLength = 3000;
    noteInput.value = draft.note || "";
    noteInput.disabled = !editable;
    noteInput.dataset.trainingBlockExerciseNote = String(index);
    note.append(noteInput);
    row.append(note);

    if (item && item.parameters.length > 0) {
      const parameters = document.createElement("div");
      parameters.className = "training-block-parameters";
      item.parameters
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .forEach((parameter) => {
          const label = document.createElement("label");
          label.className = "training-block-parameter";
          label.textContent =
            parameter.label + (parameter.unit ? " (" + parameter.unit + ")" : "");
          const input = document.createElement("input");
          input.value = trainingBlockParameterValue(draft, parameter);
          input.disabled = !editable;
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
      row.append(parameters);
    }
    container.append(row);
  });
}

function trainingBlockActionButton(label, action, index) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button button--secondary";
  button.textContent = label;
  button.dataset.trainingBlockExerciseAction = action;
  button.dataset.trainingBlockExerciseIndex = String(index);
  return button;
}

function markTrainingBlockDirty() {
  if (!trainingBlockDraft || !trainingBlocksCanEdit || trainingBlockConflict) return;
  trainingBlockChangeVersion += 1;
  trainingBlockDirty = true;
  setTrainingBlockSaveState("saving", "Änderung vorgemerkt …");
  scheduleTrainingBlockSave();
}

function syncTrainingBlockDraftFromFields() {
  if (!trainingBlockDraft) return;
  trainingBlockDraft.name = (trainingBlockElements.name?.value || "").trim();
  trainingBlockDraft.audienceId = trainingBlockElements.audience?.value || "";
  const duration = trainingBlockElements.duration?.value || "";
  trainingBlockDraft.durationMinutes =
    duration === "" ? null : Number(duration);
  trainingBlockDraft.note = trainingBlockElements.note?.value || "";
  if (trainingBlockElements.editorTitle) {
    trainingBlockElements.editorTitle.textContent =
      trainingBlockDraft.name || "Neuer Trainingsblock";
  }
}

function scheduleTrainingBlockSave() {
  if (trainingBlockSaveTimer !== null) clearTimeout(trainingBlockSaveTimer);
  trainingBlockSaveTimer = setTimeout(() => {
    trainingBlockSaveTimer = null;
    void saveTrainingBlock();
  }, 650);
}

function trainingBlockDraftPayload() {
  if (!trainingBlockDraft) return null;
  return {
    name: trainingBlockDraft.name,
    audienceId: trainingBlockDraft.audienceId || null,
    durationMinutes: trainingBlockDraft.durationMinutes,
    note: trainingBlockDraft.note.trim() || null,
    exercises: trainingBlockDraft.exercises.map((exercise) => ({
      ...(exercise.itemId ? { itemId: exercise.itemId } : {}),
      exerciseId: exercise.exerciseId,
      note: exercise.note.trim() || null,
      parameterOverrides: exercise.parameterOverrides.map((value) => ({
        key: value.key,
        value: value.value,
      })),
    })),
  };
}

function trainingBlockDraftReady(payload) {
  return payload &&
    typeof payload.name === "string" &&
    payload.name.length >= 2 &&
    typeof payload.audienceId === "string" &&
    payload.audienceId.length > 0 &&
    (payload.durationMinutes === null ||
      (Number.isSafeInteger(payload.durationMinutes) &&
        payload.durationMinutes >= 1 &&
        payload.durationMinutes <= 1440));
}

async function saveTrainingBlock() {
  if (!trainingBlockDirty || !trainingBlocksCanEdit || trainingBlockConflict) return;
  if (trainingBlockSaveBusy) {
    trainingBlockSavePending = true;
    return;
  }
  syncTrainingBlockDraftFromFields();
  const payload = trainingBlockDraftPayload();
  if (!trainingBlockDraftReady(payload)) {
    setTrainingBlockSaveState(
      "draft",
      "Entwurf – Name, Gruppe und Dauer prüfen",
    );
    return;
  }

  const saveVersion = trainingBlockChangeVersion;
  trainingBlockSaveBusy = true;
  trainingBlockSavePending = false;
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
    trainingBlockSelected = response.block;
    syncTrainingBlockItemIds(response.block);
    trainingBlockDirty = trainingBlockChangeVersion !== saveVersion;
    replaceTrainingBlockInList(response.block);
    if (trainingBlockDirty) {
      trainingBlockSavePending = true;
      setTrainingBlockSaveState("saving", "Weitere Änderung wartet …");
    } else {
      setTrainingBlockSaveState(
        "saved",
        "Gespeichert · Version " + String(response.block.currentRevision),
      );
    }
    if (trainingBlockElements.deactivate) {
      trainingBlockElements.deactivate.hidden =
        !trainingBlocksCanEdit || !response.block.isActive;
    }
  } catch (error) {
    trainingBlockDirty = true;
    if (error?.status === 409 && error?.code === "TRAINING_BLOCK_CONFLICT") {
      trainingBlockConflict = true;
      setTrainingBlockSaveState("conflict", "Konflikt – neuer Stand vorhanden");
      if (trainingBlockElements.reload) trainingBlockElements.reload.hidden = false;
      showMessage(
        trainingBlockElements.editorMessage,
        "Der Block wurde parallel geändert. Bitte aktuellen Stand neu laden; deine lokale Änderung wird nicht still überschrieben.",
      );
    } else {
      setTrainingBlockSaveState("error", "Speichern fehlgeschlagen");
      showMessage(
        trainingBlockElements.editorMessage,
        error?.status === 400
          ? "Der Block enthält ungültige oder inzwischen nicht verfügbare Werte."
          : "Der Block konnte nicht gespeichert werden.",
      );
    }
  } finally {
    trainingBlockSaveBusy = false;
    if (
      (trainingBlockSavePending || trainingBlockDirty) &&
      !trainingBlockConflict
    ) {
      trainingBlockSavePending = false;
      trainingBlockDirty = true;
      scheduleTrainingBlockSave();
    }
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
  if (!force && trainingBlockDirty && !trainingBlockConflict) {
    if (!window.confirm("Es gibt noch nicht gespeicherte Änderungen. Trotzdem schließen?")) {
      return;
    }
  }
  if (trainingBlockSaveTimer !== null) {
    clearTimeout(trainingBlockSaveTimer);
    trainingBlockSaveTimer = null;
  }
  trainingBlockSavePending = false;
  trainingBlockSelected = null;
  trainingBlockDraft = null;
  trainingBlockDirty = false;
  trainingBlockConflict = false;
  trainingBlockChangeVersion = 0;
  if (trainingBlockElements.editor) trainingBlockElements.editor.hidden = true;
  document.body.classList.remove("training-block-editor-open");
  showMessage(trainingBlockElements.editorMessage, "");
}

async function reloadTrainingBlock() {
  if (!trainingBlockSelected) return;
  const id = trainingBlockSelected.id;
  if (
    trainingBlockDirty &&
    !window.confirm("Lokale Änderungen verwerfen und aktuellen Stand laden?")
  ) return;
  await openTrainingBlock(id);
}

function addTrainingBlockExercise() {
  if (
    !trainingBlockDraft ||
    !trainingBlocksCanEdit ||
    trainingBlockSaveBusy
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
  if (!trainingBlocksCanEdit || trainingBlockSaveBusy) return;
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
  if (!trainingBlockDraft || !trainingBlocksCanEdit) return;
  const noteIndex = event.target?.dataset?.trainingBlockExerciseNote;
  if (noteIndex !== undefined) {
    const index = Number(noteIndex);
    if (trainingBlockDraft.exercises[index]) {
      trainingBlockDraft.exercises[index].note = event.target.value || "";
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
  if (!parameter) return;
  const value = event.target.value;
  const standard = parameter.defaultValue || "";
  draft.parameterOverrides = draft.parameterOverrides.filter(
    (override) => override.key !== key,
  );
  if (value !== standard || (parameter.isRequired && parameter.defaultValue === null)) {
    draft.parameterOverrides.push({ key, value });
  }
  markTrainingBlockDirty();
}

function showTrainingBlockExerciseInfo(id) {
  const item = trainingBlockExerciseItem(id);
  if (!item || !trainingBlockElements.infoBody) return;
  trainingBlockElements.infoBody.replaceChildren();
  if (trainingBlockElements.infoTitle) {
    trainingBlockElements.infoTitle.textContent = item.name;
  }
  const sections = [
    ["Einordnung", [categoryLabel(item.categoryKey), item.subcategory, item.goal]
      .filter(Boolean).join(" · ")],
    ["Beschreibung", item.description],
    ["Trainerhinweise", item.coachingCues],
    ["Typische Fehler", item.commonMistakes],
    ["Material", item.equipment.join(", ")],
  ];
  for (const value of sections) {
    if (!value[1]) continue;
    const section = document.createElement("section");
    section.className = "training-block-info-section";
    const title = document.createElement("h3");
    title.textContent = value[0];
    const text = document.createElement("p");
    text.textContent = value[1];
    section.append(title, text);
    trainingBlockElements.infoBody.append(section);
  }
  if (item.parameters.length > 0) {
    const section = document.createElement("section");
    section.className = "training-block-info-section";
    const title = document.createElement("h3");
    title.textContent = "Planungsparameter";
    section.append(title);
    for (const parameter of item.parameters) {
      const text = document.createElement("p");
      text.textContent =
        parameter.label +
        (parameter.unit ? " (" + parameter.unit + ")" : "") +
        (parameter.defaultValue === null
          ? ""
          : " · Standard " + parameter.defaultValue);
      section.append(text);
    }
    trainingBlockElements.infoBody.append(section);
  }
  if (trainingBlockElements.info) trainingBlockElements.info.hidden = false;
}

function closeTrainingBlockExerciseInfo() {
  if (trainingBlockElements.info) trainingBlockElements.info.hidden = true;
}

async function deactivateTrainingBlock() {
  if (
    !trainingBlockSelected ||
    !trainingBlockSelected.isActive ||
    !trainingBlocksCanEdit ||
    !window.confirm("Diesen Trainingsblock archivieren?")
  ) return;
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
    replaceTrainingBlockInList(payload.block);
    closeTrainingBlockEditor(true);
  } catch (error) {
    if (error?.status === 409) {
      trainingBlockConflict = true;
      setTrainingBlockSaveState("conflict", "Konflikt – neuer Stand vorhanden");
      if (trainingBlockElements.reload) trainingBlockElements.reload.hidden = false;
    }
    showMessage(
      trainingBlockElements.editorMessage,
      "Der Trainingsblock konnte nicht archiviert werden.",
    );
  }
}

function resetTrainingBlockHistory() {
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
  try {
    const payload = await requestJson(
      "/api/modules/training-blocks/" +
        encodeURIComponent(trainingBlockSelected.id) +
        "/revisions",
    );
    if (
      !Array.isArray(payload?.revisions) ||
      !payload.revisions.every(isTrainingBlockRevision)
    ) {
      throw new Error("INVALID_TRAINING_BLOCK_REVISIONS");
    }
    renderTrainingBlockHistory(payload.revisions);
  } catch {
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

async function openTrainingBlockRevision(number) {
  if (!trainingBlockSelected) return;
  try {
    const payload = await requestJson(
      "/api/modules/training-blocks/" +
        encodeURIComponent(trainingBlockSelected.id) +
        "/revisions/" +
        encodeURIComponent(String(number)),
    );
    if (!isTrainingBlockRevision(payload?.revision)) {
      throw new Error("INVALID_TRAINING_BLOCK_REVISION");
    }
    const revision = payload.revision;
    if (trainingBlockElements.revisionPreview) {
      trainingBlockElements.revisionPreview.textContent =
        "Version " +
        String(revision.revision) +
        "\n" +
        revision.name +
        "\nGruppe: " +
        trainingBlockAudienceLabel(revision.audienceId) +
        "\nDauer: " +
        (revision.durationMinutes === null
          ? "—"
          : String(revision.durationMinutes) + " Min.") +
        "\nÜbungen: " +
        String(revision.exercises.length) +
        (revision.note ? "\nNotiz: " + revision.note : "");
      trainingBlockElements.revisionPreview.hidden = false;
    }
  } catch {
    showMessage(
      trainingBlockElements.editorMessage,
      "Die gewählte Version konnte nicht geladen werden.",
    );
  }
}

async function compareTrainingBlockRevisions() {
  if (!trainingBlockSelected) return;
  const from = trainingBlockElements.compareFrom?.value || "";
  const to = trainingBlockElements.compareTo?.value || "";
  if (!from || !to) return;
  try {
    const payload = await requestJson(
      "/api/modules/training-blocks/" +
        encodeURIComponent(trainingBlockSelected.id) +
        "/compare?from=" +
        encodeURIComponent(from) +
        "&to=" +
        encodeURIComponent(to),
    );
    const value = payload?.comparison;
    if (
      value === null ||
      typeof value !== "object" ||
      typeof value.hasChanges !== "boolean" ||
      !Array.isArray(value.changedFields) ||
      !Array.isArray(value.addedItemIds) ||
      !Array.isArray(value.removedItemIds) ||
      !Array.isArray(value.changedItemIds) ||
      !Array.isArray(value.reorderedItemIds)
    ) {
      throw new Error("INVALID_TRAINING_BLOCK_COMPARISON");
    }
    if (trainingBlockElements.comparison) {
      const lines = value.hasChanges
        ? [
            value.changedFields.length
              ? "Felder geändert: " + value.changedFields.join(", ")
              : null,
            value.addedItemIds.length
              ? "Übungen hinzugefügt: " + String(value.addedItemIds.length)
              : null,
            value.removedItemIds.length
              ? "Übungen entfernt: " + String(value.removedItemIds.length)
              : null,
            value.changedItemIds.length
              ? "Übungen geändert: " + String(value.changedItemIds.length)
              : null,
            value.reorderedItemIds.length
              ? "Reihenfolge geändert: " + String(value.reorderedItemIds.length)
              : null,
          ].filter(Boolean)
        : ["Keine fachlichen Änderungen."];
      trainingBlockElements.comparison.textContent = lines.join("\n");
      trainingBlockElements.comparison.hidden = false;
    }
  } catch {
    showMessage(
      trainingBlockElements.editorMessage,
      "Die Versionen konnten nicht verglichen werden.",
    );
  }
}

trainingBlockElements.search?.addEventListener("input", renderTrainingBlocks);
trainingBlockElements.statusFilter?.addEventListener("change", renderTrainingBlocks);
trainingBlockElements.newButton?.addEventListener("click", newTrainingBlock);
trainingBlockElements.close?.addEventListener("click", () => closeTrainingBlockEditor());
trainingBlockElements.reload?.addEventListener("click", () => void reloadTrainingBlock());
trainingBlockElements.exerciseAdd?.addEventListener("click", addTrainingBlockExercise);
trainingBlockElements.exercises?.addEventListener("click", handleTrainingBlockExerciseClick);
trainingBlockElements.exercises?.addEventListener("input", handleTrainingBlockExerciseInput);
trainingBlockElements.deactivate?.addEventListener("click", () => void deactivateTrainingBlock());
trainingBlockElements.historyLoad?.addEventListener("click", () => void loadTrainingBlockHistory());
trainingBlockElements.compare?.addEventListener("click", () => void compareTrainingBlockRevisions());
trainingBlockElements.infoClose?.addEventListener("click", closeTrainingBlockExerciseInfo);
for (const control of [
  trainingBlockElements.name,
  trainingBlockElements.duration,
  trainingBlockElements.note,
]) {
  control?.addEventListener("input", () => {
    syncTrainingBlockDraftFromFields();
    markTrainingBlockDirty();
  });
}
trainingBlockElements.audience?.addEventListener("change", () => {
  syncTrainingBlockDraftFromFields();
  markTrainingBlockDirty();
});
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
`;
