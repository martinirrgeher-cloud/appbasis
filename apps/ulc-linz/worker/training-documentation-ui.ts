export const ULC_TRAINING_DOCUMENTATION_HTML = `
          <section class="app-section" data-app-section="training-documentation" id="training-documentation" hidden>
            <section class="hero training-documentation-hero">
              <div>
                <p class="eyebrow">Training</p>
                <h1>Trainingsdokumentation</h1>
                <p class="summary">Geplantes Training übernehmen, tatsächliche Durchführung dokumentieren und abschließen.</p>
              </div>
              <button class="button button--secondary" type="button" data-open-view="training-plans">← Planung</button>
            </section>

            <p class="message message--error" id="training-documentation-message" role="alert" hidden></p>
            <p class="message message--success" id="training-documentation-success" role="status" hidden></p>

            <section class="card training-documentation-toolbar">
              <label>Athlet
                <select id="training-documentation-subject">
                  <option value="">Athlet wählen</option>
                </select>
              </label>
              <label>Trainingstag
                <input id="training-documentation-date" type="date" />
              </label>
              <button class="button button--primary" id="training-documentation-load" type="button">Training laden</button>
            </section>

            <section class="training-documentation-day" id="training-documentation-day" hidden>
              <section class="card training-documentation-summary">
                <div>
                  <p class="eyebrow">Ist-Dokumentation</p>
                  <h2 id="training-documentation-title">Training</h2>
                  <p class="settings-note" id="training-documentation-meta"></p>
                </div>
                <div class="training-documentation-status-row">
                  <span class="training-documentation-status" id="training-documentation-status">Noch nicht begonnen</span>
                  <span class="training-documentation-attendance" id="training-documentation-attendance">Anwesenheit: offen</span>
                </div>
                <div class="training-documentation-actions">
                  <button class="button button--primary" id="training-documentation-start" type="button">Dokumentation starten</button>
                  <button class="button button--secondary" id="training-documentation-refresh-attendance" type="button" hidden>Anwesenheit übernehmen</button>
                  <button class="button button--secondary" id="training-documentation-reopen" type="button" hidden>Wieder öffnen</button>
                </div>
              </section>

              <section class="card training-documentation-note-card" id="training-documentation-editor" hidden>
                <label>Notiz zur tatsächlichen Durchführung
                  <textarea id="training-documentation-note" maxlength="3000" rows="3" placeholder="Abweichungen, Beobachtungen, Hinweise …"></textarea>
                </label>
              </section>

              <section class="training-documentation-items" id="training-documentation-items"></section>

              <section class="card training-documentation-savebar" id="training-documentation-savebar" hidden>
                <div>
                  <strong id="training-documentation-save-state">Gespeichert</strong>
                  <small>Änderungen werden bewusst gespeichert.</small>
                </div>
                <div class="training-documentation-save-actions">
                  <button class="button button--secondary" id="training-documentation-complete" type="button">Abschließen</button>
                  <button class="button button--primary" id="training-documentation-save" type="button">💾 Speichern</button>
                </div>
              </section>
            </section>

            <div class="training-documentation-leave-backdrop" id="training-documentation-leave-dialog" hidden>
              <section class="card training-documentation-leave-dialog" role="dialog" aria-modal="true" aria-labelledby="training-documentation-leave-title">
                <p class="eyebrow">Ungespeicherte Änderungen</p>
                <h2 id="training-documentation-leave-title">Dokumentation verlassen?</h2>
                <p class="settings-note">Du hast Änderungen, die noch nicht gespeichert wurden.</p>
                <div class="training-documentation-leave-actions">
                  <button class="button button--primary" id="training-documentation-leave-save" type="button">Speichern &amp; verlassen</button>
                  <button class="button button--danger" id="training-documentation-leave-discard" type="button">Änderungen verwerfen</button>
                  <button class="button button--secondary" id="training-documentation-leave-stay" type="button">Zurück</button>
                </div>
              </section>
            </div>
          </section>
`;

export const ULC_TRAINING_DOCUMENTATION_CSS = `
.training-documentation-hero {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.training-documentation-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(150px, .6fr) auto;
  gap: 10px;
  align-items: end;
  margin-bottom: 12px;
  padding: 14px;
}

.training-documentation-toolbar label,
.training-documentation-note-card label,
.training-documentation-field {
  display: grid;
  gap: 5px;
  font-size: .76rem;
  font-weight: 700;
  color: var(--secondary);
}

.training-documentation-toolbar select,
.training-documentation-toolbar input,
.training-documentation-note-card textarea,
.training-documentation-field input,
.training-documentation-field textarea {
  width: 100%;
}

.training-documentation-day,
.training-documentation-items {
  display: grid;
  gap: 10px;
}

.training-documentation-summary,
.training-documentation-note-card,
.training-documentation-item {
  padding: 14px;
}

.training-documentation-summary {
  display: grid;
  gap: 10px;
}

.training-documentation-summary h2 {
  margin: 2px 0 0;
}

.training-documentation-status-row,
.training-documentation-actions,
.training-documentation-save-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.training-documentation-status,
.training-documentation-attendance {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  border-radius: 999px;
  border: 1px solid var(--border);
  padding: 4px 10px;
  font-size: .72rem;
  font-weight: 800;
}

.training-documentation-item {
  display: grid;
  gap: 10px;
}

.training-documentation-item__head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.training-documentation-item__head h3,
.training-documentation-item__head h4 {
  margin: 0;
}

.training-documentation-item__head small {
  color: var(--secondary);
}

.training-documentation-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.training-documentation-actual-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.training-documentation-planned {
  padding: 9px 10px;
  border-radius: 10px;
  background: var(--surface-muted, #f6f7f8);
  color: var(--secondary);
  font-size: .75rem;
  line-height: 1.45;
}

.training-documentation-block-exercises {
  display: grid;
  gap: 8px;
  padding-left: 12px;
  border-left: 3px solid var(--border);
}

.training-documentation-exercise {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
}

.training-documentation-performed {
  display: inline-flex;
  gap: 7px;
  align-items: center;
  color: inherit;
  font-size: .78rem;
  font-weight: 800;
}

.training-documentation-savebar {
  position: sticky;
  bottom: 8px;
  z-index: 9;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  padding: 12px 14px;
}

.training-documentation-savebar strong,
.training-documentation-savebar small {
  display: block;
}

.training-documentation-savebar small {
  color: var(--secondary);
  margin-top: 2px;
}

.training-documentation-leave-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgb(15 23 42 / .45);
}

.training-documentation-leave-backdrop[hidden] {
  display: none;
}

.training-documentation-leave-dialog {
  width: min(520px, 100%);
  padding: 18px;
}

.training-documentation-leave-actions {
  display: grid;
  gap: 8px;
  margin-top: 14px;
}

@media (max-width: 640px) {
  .training-documentation-hero {
    display: grid;
  }

  .training-documentation-toolbar,
  .training-documentation-grid,
  .training-documentation-actual-grid {
    grid-template-columns: 1fr;
  }

  .training-documentation-savebar {
    align-items: stretch;
  }

  .training-documentation-save-actions {
    justify-content: flex-end;
  }
}
`;

export const ULC_TRAINING_DOCUMENTATION_SCRIPT = `
const trainingDocumentationElements = Object.freeze({
  quickAction: document.querySelector("#training-documentation-quick-action"),
  accessLabel: document.querySelector("#training-documentation-access-label"),
  message: document.querySelector("#training-documentation-message"),
  success: document.querySelector("#training-documentation-success"),
  subject: document.querySelector("#training-documentation-subject"),
  date: document.querySelector("#training-documentation-date"),
  load: document.querySelector("#training-documentation-load"),
  day: document.querySelector("#training-documentation-day"),
  title: document.querySelector("#training-documentation-title"),
  meta: document.querySelector("#training-documentation-meta"),
  status: document.querySelector("#training-documentation-status"),
  attendance: document.querySelector("#training-documentation-attendance"),
  start: document.querySelector("#training-documentation-start"),
  refreshAttendance: document.querySelector("#training-documentation-refresh-attendance"),
  reopen: document.querySelector("#training-documentation-reopen"),
  editor: document.querySelector("#training-documentation-editor"),
  note: document.querySelector("#training-documentation-note"),
  items: document.querySelector("#training-documentation-items"),
  savebar: document.querySelector("#training-documentation-savebar"),
  saveState: document.querySelector("#training-documentation-save-state"),
  save: document.querySelector("#training-documentation-save"),
  complete: document.querySelector("#training-documentation-complete"),
  leaveDialog: document.querySelector("#training-documentation-leave-dialog"),
  leaveSave: document.querySelector("#training-documentation-leave-save"),
  leaveDiscard: document.querySelector("#training-documentation-leave-discard"),
  leaveStay: document.querySelector("#training-documentation-leave-stay"),
});

let trainingDocumentationSessionGeneration = 0;
let trainingDocumentationReady = false;
let trainingDocumentationCanEdit = false;
let trainingDocumentationSubjects = [];
let trainingDocumentationDay = null;
let trainingDocumentationDraft = null;
let trainingDocumentationDirty = false;
let trainingDocumentationBusy = false;
let trainingDocumentationLeaveResolver = null;

function isTrainingDocumentationSubject(value) {
  return value !== null &&
    typeof value === "object" &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.displayName === "string" &&
    value.displayName.length > 0;
}

function isTrainingDocumentationPlan(value) {
  return value === null ||
    (
      value !== null &&
      typeof value === "object" &&
      typeof value.id === "string" &&
      typeof value.subjectId === "string" &&
      typeof value.planDate === "string" &&
      Number.isSafeInteger(value.currentRevision) &&
      value.currentRevision >= 1 &&
      value.revision !== null &&
      typeof value.revision === "object" &&
      Array.isArray(value.revision.items)
    );
}

function isTrainingDocumentationSnapshot(value) {
  return value === null ||
    (
      value !== null &&
      typeof value === "object" &&
      typeof value.id === "string" &&
      value.id.length > 0 &&
      typeof value.subjectId === "string" &&
      /^\\d{4}-\\d{2}-\\d{2}$/.test(value.sessionDate || "") &&
      typeof value.sourcePlanId === "string" &&
      Number.isSafeInteger(value.sourcePlanRevision) &&
      Number.isSafeInteger(value.currentRevision) &&
      ["draft", "completed"].includes(value.status) &&
      value.revision !== null &&
      typeof value.revision === "object" &&
      value.revision.revision === value.currentRevision &&
      Array.isArray(value.revision.items) &&
      Array.isArray(value.revision.attendance)
    );
}

function trainingDocumentationClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function trainingDocumentationDraftFromSnapshot(snapshot) {
  return {
    note: snapshot?.revision?.note || "",
    items: trainingDocumentationClone(snapshot?.revision?.items || []),
  };
}

function resetTrainingDocumentationSessionState() {
  trainingDocumentationSessionGeneration += 1;
  trainingDocumentationReady = false;
  trainingDocumentationCanEdit = false;
  trainingDocumentationSubjects = [];
  trainingDocumentationDay = null;
  trainingDocumentationDraft = null;
  trainingDocumentationDirty = false;
  trainingDocumentationBusy = false;
  resolveTrainingDocumentationLeaveDecision("stay");
  renderTrainingDocumentationSubjects();
  renderTrainingDocumentationDay();
  refreshTrainingDocumentationControls();
}

async function bootstrapTrainingDocumentation() {
  const generation = ++trainingDocumentationSessionGeneration;
  trainingDocumentationReady = false;
  trainingDocumentationCanEdit = false;
  trainingDocumentationSubjects = [];
  trainingDocumentationDay = null;
  trainingDocumentationDraft = null;
  trainingDocumentationDirty = false;
  trainingDocumentationBusy = false;
  renderTrainingDocumentationSubjects();
  renderTrainingDocumentationDay();
  refreshTrainingDocumentationControls();
  showMessage(trainingDocumentationElements.message, "");

  try {
    const payload = await requestJson("/api/modules/training-documentation");
    if (generation !== trainingDocumentationSessionGeneration) return;
    if (
      payload?.module?.moduleId !== "training_documentation" ||
      payload?.module?.features?.planSnapshot !== true ||
      payload?.module?.features?.manualSave !== true ||
      payload?.module?.features?.optimisticConcurrency !== true ||
      payload?.access?.view !== true ||
      typeof payload?.access?.edit !== "boolean" ||
      !Array.isArray(payload?.subjects) ||
      !payload.subjects.every(isTrainingDocumentationSubject)
    ) {
      throw new Error("INVALID_TRAINING_DOCUMENTATION_CONTRACT");
    }
    trainingDocumentationReady = true;
    trainingDocumentationCanEdit = payload.access.edit;
    trainingDocumentationSubjects = payload.subjects.slice();
    renderTrainingDocumentationSubjects();
  } catch (error) {
    if (generation !== trainingDocumentationSessionGeneration) return;
    trainingDocumentationReady = false;
    trainingDocumentationCanEdit = false;
    trainingDocumentationSubjects = [];
    if (error?.status !== 403) {
      showMessage(
        trainingDocumentationElements.message,
        "Die Trainingsdokumentation ist derzeit nicht verfügbar.",
      );
    }
  } finally {
    if (generation === trainingDocumentationSessionGeneration) {
      refreshTrainingDocumentationControls();
      refreshAppAvailability();
    }
  }
}

function prepareTrainingDocumentationView() {
  if (!trainingDocumentationReady) return;
  renderTrainingDocumentationSubjects();
  if (
    trainingDocumentationElements.date &&
    !trainingDocumentationElements.date.value
  ) {
    trainingDocumentationElements.date.value = localIsoDate(new Date());
  }
  if (
    trainingDocumentationElements.subject &&
    !trainingDocumentationElements.subject.value &&
    trainingDocumentationSubjects.length === 1
  ) {
    trainingDocumentationElements.subject.value =
      trainingDocumentationSubjects[0].id;
  }
  refreshTrainingDocumentationControls();
}

async function openTrainingDocumentationForDay(subjectId, sessionDate) {
  if (!trainingDocumentationReady) return false;
  if (
    trainingDocumentationDirty &&
    !(await prepareTrainingDocumentationForLeave())
  ) {
    return false;
  }
  if (trainingDocumentationElements.subject) {
    trainingDocumentationElements.subject.value = subjectId;
  }
  if (trainingDocumentationElements.date) {
    trainingDocumentationElements.date.value = sessionDate;
  }
  showAppSection("training-documentation");
  await loadTrainingDocumentationDay(true);
  return true;
}

function renderTrainingDocumentationSubjects() {
  const select = trainingDocumentationElements.subject;
  if (!select) return;
  const selected = select.value;
  select.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Athlet wählen";
  select.append(placeholder);
  for (const subject of trainingDocumentationSubjects) {
    const option = document.createElement("option");
    option.value = subject.id;
    option.textContent = subject.displayName;
    select.append(option);
  }
  if (trainingDocumentationSubjects.some((entry) => entry.id === selected)) {
    select.value = selected;
  } else if (trainingDocumentationSubjects.length === 1) {
    select.value = trainingDocumentationSubjects[0].id;
  }
}

async function loadTrainingDocumentationDay(force = false) {
  if (!trainingDocumentationReady || trainingDocumentationBusy) return false;
  if (!force && trainingDocumentationDirty) {
    if (!(await prepareTrainingDocumentationForLeave())) return false;
  }
  const subjectId = trainingDocumentationElements.subject?.value || "";
  const sessionDate = trainingDocumentationElements.date?.value || "";
  if (!subjectId || !/^\\d{4}-\\d{2}-\\d{2}$/.test(sessionDate)) {
    showMessage(
      trainingDocumentationElements.message,
      "Bitte Athlet und Trainingstag auswählen.",
    );
    return false;
  }

  const generation = trainingDocumentationSessionGeneration;
  setTrainingDocumentationBusy(true);
  showMessage(trainingDocumentationElements.message, "");
  showMessage(trainingDocumentationElements.success, "");
  try {
    const payload = await requestJson(
      "/api/modules/training-documentation/day?subjectId=" +
        encodeURIComponent(subjectId) +
        "&sessionDate=" +
        encodeURIComponent(sessionDate),
    );
    if (generation !== trainingDocumentationSessionGeneration) return false;
    if (
      !isTrainingDocumentationSubject(payload?.subject) ||
      payload.subject.id !== subjectId ||
      !isTrainingDocumentationPlan(payload?.plan) ||
      !isTrainingDocumentationSnapshot(payload?.documentation) ||
      !["present", "excused", "absent", "open"].includes(payload?.attendanceStatus)
    ) {
      throw new Error("INVALID_TRAINING_DOCUMENTATION_DAY");
    }
    if (
      payload.plan !== null &&
      (payload.plan.subjectId !== subjectId ||
        payload.plan.planDate !== sessionDate)
    ) {
      throw new Error("INVALID_TRAINING_DOCUMENTATION_PLAN_SCOPE");
    }
    if (
      payload.documentation !== null &&
      (payload.documentation.subjectId !== subjectId ||
        payload.documentation.sessionDate !== sessionDate)
    ) {
      throw new Error("INVALID_TRAINING_DOCUMENTATION_SCOPE");
    }
    trainingDocumentationDay = {
      subject: payload.subject,
      plan: payload.plan,
      documentation: payload.documentation,
      attendanceStatus: payload.attendanceStatus,
    };
    trainingDocumentationDraft = payload.documentation
      ? trainingDocumentationDraftFromSnapshot(payload.documentation)
      : null;
    trainingDocumentationDirty = false;
    renderTrainingDocumentationDay();
    return true;
  } catch (error) {
    if (generation !== trainingDocumentationSessionGeneration) return false;
    trainingDocumentationDay = null;
    trainingDocumentationDraft = null;
    trainingDocumentationDirty = false;
    renderTrainingDocumentationDay();
    showMessage(
      trainingDocumentationElements.message,
      error?.status === 403
        ? "Für die Trainingsdokumentation fehlt die Berechtigung."
        : "Das Training konnte nicht geladen werden.",
    );
    return false;
  } finally {
    if (generation === trainingDocumentationSessionGeneration) {
      setTrainingDocumentationBusy(false);
    }
  }
}

function renderTrainingDocumentationDay() {
  const day = trainingDocumentationDay;
  if (trainingDocumentationElements.day) {
    trainingDocumentationElements.day.hidden = day === null;
  }
  if (!day) {
    trainingDocumentationElements.items?.replaceChildren();
    if (trainingDocumentationElements.editor) {
      trainingDocumentationElements.editor.hidden = true;
    }
    if (trainingDocumentationElements.savebar) {
      trainingDocumentationElements.savebar.hidden = true;
    }
    return;
  }

  const subjectLabel = day.subject.displayName;
  const dateLabel =
    typeof trainingPlanDateLabel === "function"
      ? trainingPlanDateLabel(day.plan?.planDate || day.documentation?.sessionDate || "")
      : (day.plan?.planDate || day.documentation?.sessionDate || "");
  if (trainingDocumentationElements.title) {
    trainingDocumentationElements.title.textContent =
      subjectLabel + " · " + dateLabel;
  }
  if (trainingDocumentationElements.meta) {
    trainingDocumentationElements.meta.textContent = day.plan
      ? "Planrevision " + String(day.plan.currentRevision) +
        (day.documentation
          ? " · Dokumentation basiert auf Planrevision " +
            String(day.documentation.sourcePlanRevision)
          : "")
      : "Für diesen Tag ist kein Trainingsplan vorhanden.";
  }
  if (trainingDocumentationElements.attendance) {
    trainingDocumentationElements.attendance.textContent =
      "Anwesenheit: " + trainingDocumentationAttendanceLabel(
        day.documentation?.revision?.attendance?.[0]?.status ||
          day.attendanceStatus,
      );
  }

  const documentation = day.documentation;
  const completed = documentation?.status === "completed";
  if (trainingDocumentationElements.status) {
    trainingDocumentationElements.status.textContent = documentation
      ? completed
        ? "Abgeschlossen"
        : trainingDocumentationDirty
          ? "Ungespeichert"
          : "Entwurf"
      : "Noch nicht begonnen";
  }
  if (trainingDocumentationElements.start) {
    trainingDocumentationElements.start.hidden = documentation !== null;
    trainingDocumentationElements.start.disabled =
      !trainingDocumentationCanEdit || !day.plan || trainingDocumentationBusy;
  }
  if (trainingDocumentationElements.refreshAttendance) {
    trainingDocumentationElements.refreshAttendance.hidden =
      documentation === null || completed;
  }
  if (trainingDocumentationElements.reopen) {
    trainingDocumentationElements.reopen.hidden = !completed;
  }
  if (trainingDocumentationElements.editor) {
    trainingDocumentationElements.editor.hidden = documentation === null;
  }
  if (trainingDocumentationElements.note) {
    trainingDocumentationElements.note.value =
      trainingDocumentationDraft?.note || "";
    trainingDocumentationElements.note.disabled =
      completed || !trainingDocumentationCanEdit || trainingDocumentationBusy;
  }
  if (trainingDocumentationElements.savebar) {
    trainingDocumentationElements.savebar.hidden =
      documentation === null || completed;
  }
  renderTrainingDocumentationItems();
  refreshTrainingDocumentationControls();
}

function renderTrainingDocumentationItems() {
  const container = trainingDocumentationElements.items;
  if (!container) return;
  container.replaceChildren();
  const items = trainingDocumentationDraft?.items || [];
  const completed =
    trainingDocumentationDay?.documentation?.status === "completed";
  if (items.length === 0) {
    const empty = document.createElement("section");
    empty.className = "card training-documentation-item";
    empty.textContent = "Der übernommene Trainingsplan enthält keine Inhalte.";
    container.append(empty);
    return;
  }

  items.forEach((item, index) => {
    if (item.kind === "block") {
      container.append(
        trainingDocumentationBlockElement(item, index, completed),
      );
    } else {
      container.append(
        trainingDocumentationExerciseElement(item, index, null, completed),
      );
    }
  });
}

function trainingDocumentationBlockElement(item, itemIndex, completed) {
  const card = document.createElement("section");
  card.className = "card training-documentation-item";

  const head = document.createElement("div");
  head.className = "training-documentation-item__head";
  const copy = document.createElement("div");
  const eyebrow = document.createElement("small");
  eyebrow.textContent = "Block";
  const title = document.createElement("h3");
  title.textContent = item.name;
  copy.append(eyebrow, title);
  head.append(copy, trainingDocumentationPerformedControl(
    item,
    completed,
    () => markTrainingDocumentationDirty(),
  ));
  card.append(head);

  const planned = document.createElement("div");
  planned.className = "training-documentation-planned";
  planned.textContent =
    "Geplant: " +
    (item.plannedDurationMinutes
      ? String(item.plannedDurationMinutes) + " min"
      : "ohne Dauer") +
    (item.plannedNote ? " · " + item.plannedNote : "");
  card.append(planned);

  const grid = document.createElement("div");
  grid.className = "training-documentation-grid";
  grid.append(
    trainingDocumentationInputField(
      "Tatsächliche Dauer (min)",
      item.actualDurationMinutes,
      "number",
      completed,
      (value) => {
        item.actualDurationMinutes =
          value === "" ? null : Math.max(1, Number(value) || 1);
        markTrainingDocumentationDirty();
      },
    ),
    trainingDocumentationInputField(
      "Notiz zum Block",
      item.actualNote,
      "textarea",
      completed,
      (value) => {
        item.actualNote = value || null;
        markTrainingDocumentationDirty();
      },
    ),
  );
  card.append(grid);

  if (Array.isArray(item.exercises) && item.exercises.length > 0) {
    const exercises = document.createElement("div");
    exercises.className = "training-documentation-block-exercises";
    item.exercises.forEach((exercise, childIndex) => {
      exercises.append(
        trainingDocumentationExerciseElement(
          exercise,
          itemIndex,
          childIndex,
          completed,
        ),
      );
    });
    card.append(exercises);
  }
  return card;
}

function trainingDocumentationExerciseElement(
  item,
  itemIndex,
  childIndex,
  completed,
) {
  const card = document.createElement("section");
  card.className =
    childIndex === null
      ? "card training-documentation-item"
      : "training-documentation-exercise";

  const head = document.createElement("div");
  head.className = "training-documentation-item__head";
  const copy = document.createElement("div");
  const eyebrow = document.createElement("small");
  eyebrow.textContent = childIndex === null ? "Übung" : "Übung im Block";
  const title = document.createElement(childIndex === null ? "h3" : "h4");
  title.textContent = item.name;
  copy.append(eyebrow, title);
  head.append(copy, trainingDocumentationPerformedControl(
    item,
    completed,
    () => markTrainingDocumentationDirty(),
  ));
  card.append(head);

  const planned = document.createElement("div");
  planned.className = "training-documentation-planned";
  planned.textContent = trainingDocumentationPlannedExerciseLabel(item);
  card.append(planned);

  const grid = document.createElement("div");
  grid.className = "training-documentation-actual-grid";
  const fields = [
    ["Sätze", "actualSets"],
    ["Wiederholungen", "actualRepetitions"],
    ["Menge", "actualAmount"],
    ["Einheit", "actualUnit"],
  ];
  for (const [label, key] of fields) {
    grid.append(
      trainingDocumentationInputField(
        label,
        item[key],
        "text",
        completed,
        (value) => {
          item[key] = value || null;
          markTrainingDocumentationDirty();
        },
      ),
    );
  }
  card.append(grid);
  card.append(
    trainingDocumentationInputField(
      "Kommentar",
      item.actualComment,
      "textarea",
      completed,
      (value) => {
        item.actualComment = value || null;
        markTrainingDocumentationDirty();
      },
    ),
  );
  return card;
}

function trainingDocumentationPerformedControl(item, completed, onChange) {
  const label = document.createElement("label");
  label.className = "training-documentation-performed";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = item.performed !== false;
  checkbox.disabled =
    completed || !trainingDocumentationCanEdit || trainingDocumentationBusy;
  checkbox.addEventListener("change", () => {
    item.performed = checkbox.checked;
    onChange();
  });
  const text = document.createElement("span");
  text.textContent = "Durchgeführt";
  label.append(checkbox, text);
  return label;
}

function trainingDocumentationInputField(
  labelText,
  value,
  kind,
  completed,
  onInput,
) {
  const label = document.createElement("label");
  label.className = "training-documentation-field";
  const caption = document.createElement("span");
  caption.textContent = labelText;
  const input =
    kind === "textarea"
      ? document.createElement("textarea")
      : document.createElement("input");
  if (kind !== "textarea") input.type = kind;
  if (kind === "number") {
    input.min = "1";
    input.step = "1";
  }
  if (kind === "textarea") input.rows = 2;
  input.value = value ?? "";
  input.disabled =
    completed || !trainingDocumentationCanEdit || trainingDocumentationBusy;
  input.addEventListener("input", () => onInput(input.value));
  label.append(caption, input);
  return label;
}

function trainingDocumentationPlannedExerciseLabel(item) {
  const parts = [];
  if (item.plannedSets) parts.push("Sätze " + item.plannedSets);
  if (item.plannedRepetitions) {
    parts.push("Wdh. " + item.plannedRepetitions);
  }
  if (item.plannedAmount) {
    parts.push(
      "Menge " +
        item.plannedAmount +
        (item.plannedUnit ? " " + item.plannedUnit : ""),
    );
  } else if (item.plannedUnit) {
    parts.push("Einheit " + item.plannedUnit);
  }
  if (item.plannedComment) parts.push(item.plannedComment);
  return "Geplant: " + (parts.length > 0 ? parts.join(" · ") : "keine Detailwerte");
}

function trainingDocumentationAttendanceLabel(status) {
  if (status === "present") return "Anwesend";
  if (status === "excused") return "Entschuldigt";
  if (status === "absent") return "Abwesend";
  return "Offen";
}

function markTrainingDocumentationDirty() {
  if (
    !trainingDocumentationDay?.documentation ||
    trainingDocumentationDay.documentation.status === "completed"
  ) {
    return;
  }
  trainingDocumentationDirty = true;
  if (trainingDocumentationElements.saveState) {
    trainingDocumentationElements.saveState.textContent =
      "Ungespeicherte Änderungen";
  }
  renderTrainingDocumentationStatusOnly();
  refreshTrainingDocumentationControls();
}

function renderTrainingDocumentationStatusOnly() {
  if (!trainingDocumentationElements.status) return;
  const documentation = trainingDocumentationDay?.documentation;
  trainingDocumentationElements.status.textContent = documentation
    ? documentation.status === "completed"
      ? "Abgeschlossen"
      : trainingDocumentationDirty
        ? "Ungespeichert"
        : "Entwurf"
    : "Noch nicht begonnen";
}

async function startTrainingDocumentation() {
  const day = trainingDocumentationDay;
  if (
    !day ||
    !day.plan ||
    !trainingDocumentationCanEdit ||
    trainingDocumentationBusy
  ) return;
  setTrainingDocumentationBusy(true);
  showMessage(trainingDocumentationElements.message, "");
  showMessage(trainingDocumentationElements.success, "");
  try {
    const payload = await requestJson(
      "/api/modules/training-documentation/start",
      {
        method: "POST",
        body: JSON.stringify({
          subjectId: day.subject.id,
          sessionDate: day.plan.planDate,
        }),
      },
    );
    if (!isTrainingDocumentationSnapshot(payload?.documentation)) {
      throw new Error("INVALID_TRAINING_DOCUMENTATION_START");
    }
    day.documentation = payload.documentation;
    trainingDocumentationDraft =
      trainingDocumentationDraftFromSnapshot(payload.documentation);
    trainingDocumentationDirty = false;
    showMessage(
      trainingDocumentationElements.success,
      "Plan wurde als Dokumentationsgrundlage übernommen.",
    );
    renderTrainingDocumentationDay();
  } catch (error) {
    showMessage(
      trainingDocumentationElements.message,
      error?.status === 404
        ? "Für diesen Tag gibt es keinen gespeicherten Trainingsplan."
        : "Die Dokumentation konnte nicht gestartet werden.",
    );
  } finally {
    setTrainingDocumentationBusy(false);
  }
}

async function saveTrainingDocumentation() {
  const documentation = trainingDocumentationDay?.documentation;
  if (
    !documentation ||
    !trainingDocumentationDraft ||
    documentation.status !== "draft" ||
    !trainingDocumentationCanEdit ||
    trainingDocumentationBusy
  ) return false;
  if (!trainingDocumentationDirty) return true;

  setTrainingDocumentationBusy(true);
  showMessage(trainingDocumentationElements.message, "");
  showMessage(trainingDocumentationElements.success, "");
  try {
    const payload = await requestJson(
      "/api/modules/training-documentation/" +
        encodeURIComponent(documentation.id) +
        "/update",
      {
        method: "POST",
        body: JSON.stringify({
          expectedRevision: documentation.currentRevision,
          note: trainingDocumentationDraft.note || null,
          items: trainingDocumentationDraft.items,
        }),
      },
    );
    if (!isTrainingDocumentationSnapshot(payload?.documentation)) {
      throw new Error("INVALID_TRAINING_DOCUMENTATION_SAVE");
    }
    trainingDocumentationDay.documentation = payload.documentation;
    trainingDocumentationDraft =
      trainingDocumentationDraftFromSnapshot(payload.documentation);
    trainingDocumentationDirty = false;
    if (trainingDocumentationElements.saveState) {
      trainingDocumentationElements.saveState.textContent = "Gespeichert";
    }
    showMessage(
      trainingDocumentationElements.success,
      "Trainingsdokumentation gespeichert.",
    );
    renderTrainingDocumentationDay();
    return true;
  } catch (error) {
    showMessage(
      trainingDocumentationElements.message,
      error?.payload?.error?.code === "TRAINING_DOCUMENTATION_CONFLICT"
        ? "Die Dokumentation wurde zwischenzeitlich geändert. Bitte den Tag neu laden."
        : "Die Trainingsdokumentation konnte nicht gespeichert werden.",
    );
    return false;
  } finally {
    setTrainingDocumentationBusy(false);
  }
}

async function refreshTrainingDocumentationAttendance() {
  const documentation = trainingDocumentationDay?.documentation;
  if (
    !documentation ||
    documentation.status !== "draft" ||
    !trainingDocumentationCanEdit ||
    trainingDocumentationBusy
  ) return;
  if (trainingDocumentationDirty && !(await saveTrainingDocumentation())) {
    return;
  }
  setTrainingDocumentationBusy(true);
  showMessage(trainingDocumentationElements.message, "");
  try {
    const current = trainingDocumentationDay.documentation;
    const payload = await requestJson(
      "/api/modules/training-documentation/" +
        encodeURIComponent(current.id) +
        "/refresh-attendance",
      {
        method: "POST",
        body: JSON.stringify({
          expectedRevision: current.currentRevision,
        }),
      },
    );
    if (!isTrainingDocumentationSnapshot(payload?.documentation)) {
      throw new Error("INVALID_TRAINING_DOCUMENTATION_ATTENDANCE");
    }
    trainingDocumentationDay.documentation = payload.documentation;
    trainingDocumentationDraft =
      trainingDocumentationDraftFromSnapshot(payload.documentation);
    trainingDocumentationDirty = false;
    showMessage(
      trainingDocumentationElements.success,
      "Aktuelle Anwesenheit wurde übernommen.",
    );
    renderTrainingDocumentationDay();
  } catch {
    showMessage(
      trainingDocumentationElements.message,
      "Die Anwesenheit konnte nicht übernommen werden.",
    );
  } finally {
    setTrainingDocumentationBusy(false);
  }
}

async function completeTrainingDocumentation() {
  const documentation = trainingDocumentationDay?.documentation;
  if (
    !documentation ||
    documentation.status !== "draft" ||
    !trainingDocumentationCanEdit ||
    trainingDocumentationBusy
  ) return;
  if (trainingDocumentationDirty && !(await saveTrainingDocumentation())) {
    return;
  }
  if (!window.confirm("Trainingsdokumentation wirklich abschließen?")) return;

  setTrainingDocumentationBusy(true);
  showMessage(trainingDocumentationElements.message, "");
  try {
    const current = trainingDocumentationDay.documentation;
    const payload = await requestJson(
      "/api/modules/training-documentation/" +
        encodeURIComponent(current.id) +
        "/complete",
      {
        method: "POST",
        body: JSON.stringify({
          expectedRevision: current.currentRevision,
        }),
      },
    );
    if (!isTrainingDocumentationSnapshot(payload?.documentation)) {
      throw new Error("INVALID_TRAINING_DOCUMENTATION_COMPLETE");
    }
    trainingDocumentationDay.documentation = payload.documentation;
    trainingDocumentationDraft =
      trainingDocumentationDraftFromSnapshot(payload.documentation);
    trainingDocumentationDirty = false;
    showMessage(
      trainingDocumentationElements.success,
      "Trainingsdokumentation abgeschlossen.",
    );
    renderTrainingDocumentationDay();
  } catch {
    showMessage(
      trainingDocumentationElements.message,
      "Die Trainingsdokumentation konnte nicht abgeschlossen werden.",
    );
  } finally {
    setTrainingDocumentationBusy(false);
  }
}

async function reopenTrainingDocumentation() {
  const documentation = trainingDocumentationDay?.documentation;
  if (
    !documentation ||
    documentation.status !== "completed" ||
    !trainingDocumentationCanEdit ||
    trainingDocumentationBusy
  ) return;
  setTrainingDocumentationBusy(true);
  showMessage(trainingDocumentationElements.message, "");
  try {
    const payload = await requestJson(
      "/api/modules/training-documentation/" +
        encodeURIComponent(documentation.id) +
        "/reopen",
      {
        method: "POST",
        body: JSON.stringify({
          expectedRevision: documentation.currentRevision,
        }),
      },
    );
    if (!isTrainingDocumentationSnapshot(payload?.documentation)) {
      throw new Error("INVALID_TRAINING_DOCUMENTATION_REOPEN");
    }
    trainingDocumentationDay.documentation = payload.documentation;
    trainingDocumentationDraft =
      trainingDocumentationDraftFromSnapshot(payload.documentation);
    trainingDocumentationDirty = false;
    showMessage(
      trainingDocumentationElements.success,
      "Dokumentation ist wieder als Entwurf geöffnet.",
    );
    renderTrainingDocumentationDay();
  } catch {
    showMessage(
      trainingDocumentationElements.message,
      "Die Dokumentation konnte nicht wieder geöffnet werden.",
    );
  } finally {
    setTrainingDocumentationBusy(false);
  }
}

function setTrainingDocumentationBusy(value) {
  trainingDocumentationBusy = Boolean(value);
  refreshTrainingDocumentationControls();
  renderTrainingDocumentationItems();
}

function refreshTrainingDocumentationControls() {
  const documentation = trainingDocumentationDay?.documentation;
  const completed = documentation?.status === "completed";
  if (trainingDocumentationElements.quickAction) {
    trainingDocumentationElements.quickAction.disabled =
      !trainingDocumentationReady;
  }
  if (trainingDocumentationElements.accessLabel) {
    trainingDocumentationElements.accessLabel.textContent =
      trainingDocumentationReady
        ? trainingDocumentationCanEdit
          ? "Lesen und Bearbeiten freigeschaltet."
          : "Nur Lesen freigeschaltet."
        : "Für deinen Benutzer derzeit nicht freigeschaltet.";
  }
  if (trainingDocumentationElements.subject) {
    trainingDocumentationElements.subject.disabled =
      !trainingDocumentationReady || trainingDocumentationBusy;
  }
  if (trainingDocumentationElements.date) {
    trainingDocumentationElements.date.disabled =
      !trainingDocumentationReady || trainingDocumentationBusy;
  }
  if (trainingDocumentationElements.load) {
    trainingDocumentationElements.load.disabled =
      !trainingDocumentationReady || trainingDocumentationBusy;
  }
  if (trainingDocumentationElements.start) {
    trainingDocumentationElements.start.disabled =
      !trainingDocumentationCanEdit ||
      trainingDocumentationBusy ||
      !trainingDocumentationDay?.plan;
  }
  if (trainingDocumentationElements.refreshAttendance) {
    trainingDocumentationElements.refreshAttendance.disabled =
      !trainingDocumentationCanEdit ||
      trainingDocumentationBusy ||
      !documentation ||
      completed;
  }
  if (trainingDocumentationElements.save) {
    trainingDocumentationElements.save.disabled =
      !trainingDocumentationCanEdit ||
      trainingDocumentationBusy ||
      !documentation ||
      completed ||
      !trainingDocumentationDirty;
  }
  if (trainingDocumentationElements.complete) {
    trainingDocumentationElements.complete.disabled =
      !trainingDocumentationCanEdit ||
      trainingDocumentationBusy ||
      !documentation ||
      completed;
  }
  if (trainingDocumentationElements.reopen) {
    trainingDocumentationElements.reopen.disabled =
      !trainingDocumentationCanEdit ||
      trainingDocumentationBusy ||
      !completed;
  }
}

function requestTrainingDocumentationLeaveDecision() {
  if (!trainingDocumentationDirty) return Promise.resolve("discard");
  if (trainingDocumentationLeaveResolver !== null) {
    return Promise.resolve("stay");
  }
  if (trainingDocumentationElements.leaveDialog) {
    trainingDocumentationElements.leaveDialog.hidden = false;
  }
  return new Promise((resolve) => {
    trainingDocumentationLeaveResolver = resolve;
    queueMicrotask(() => trainingDocumentationElements.leaveSave?.focus());
  });
}

function resolveTrainingDocumentationLeaveDecision(decision) {
  if (trainingDocumentationElements.leaveDialog) {
    trainingDocumentationElements.leaveDialog.hidden = true;
  }
  const resolve = trainingDocumentationLeaveResolver;
  trainingDocumentationLeaveResolver = null;
  if (resolve) resolve(decision);
}

async function prepareTrainingDocumentationForLeave() {
  if (trainingDocumentationBusy) return false;
  if (!trainingDocumentationDirty) return true;
  const decision = await requestTrainingDocumentationLeaveDecision();
  if (decision === "stay") return false;
  if (decision === "save") return saveTrainingDocumentation();
  trainingDocumentationDirty = false;
  const documentation = trainingDocumentationDay?.documentation;
  trainingDocumentationDraft = documentation
    ? trainingDocumentationDraftFromSnapshot(documentation)
    : null;
  renderTrainingDocumentationDay();
  return true;
}

trainingDocumentationElements.load?.addEventListener("click", () => {
  void loadTrainingDocumentationDay();
});
trainingDocumentationElements.start?.addEventListener("click", () => {
  void startTrainingDocumentation();
});
trainingDocumentationElements.save?.addEventListener("click", () => {
  void saveTrainingDocumentation();
});
trainingDocumentationElements.refreshAttendance?.addEventListener(
  "click",
  () => void refreshTrainingDocumentationAttendance(),
);
trainingDocumentationElements.complete?.addEventListener("click", () => {
  void completeTrainingDocumentation();
});
trainingDocumentationElements.reopen?.addEventListener("click", () => {
  void reopenTrainingDocumentation();
});
trainingDocumentationElements.note?.addEventListener("input", () => {
  if (!trainingDocumentationDraft) return;
  trainingDocumentationDraft.note =
    trainingDocumentationElements.note?.value || "";
  markTrainingDocumentationDirty();
});
trainingDocumentationElements.leaveSave?.addEventListener("click", () => {
  resolveTrainingDocumentationLeaveDecision("save");
});
trainingDocumentationElements.leaveDiscard?.addEventListener("click", () => {
  resolveTrainingDocumentationLeaveDecision("discard");
});
trainingDocumentationElements.leaveStay?.addEventListener("click", () => {
  resolveTrainingDocumentationLeaveDecision("stay");
});
window.addEventListener("beforeunload", (event) => {
  if (!trainingDocumentationDirty && !trainingDocumentationBusy) return;
  event.preventDefault();
  event.returnValue = "";
});
`;
