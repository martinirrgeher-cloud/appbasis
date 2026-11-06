export const ULC_U12_HTML = `
          <section class="app-section" data-app-section="u12" id="u12" hidden>
            <section class="hero">
              <p class="eyebrow">Training</p>
              <h1>U12 – Anwesenheit</h1>
              <p class="summary">Wochenweise erfassen, ohne die Kindertraining-Anwesenheit zu verändern.</p>
            </section>
            <p id="u12-message" class="message message--error" role="alert" hidden></p>
            <p id="u12-success" class="message message--success" role="status" hidden></p>
            <section class="card u12-toolbar">
              <label for="u12-group">Trainingsgruppe</label>
              <select id="u12-group" aria-label="U12 Trainingsgruppe"><option value="">Gruppe wählen</option></select>
              <div class="u12-week-nav">
                <button class="button button--secondary" type="button" id="u12-prev" aria-label="Vorherige U12-Woche">‹</button>
                <strong id="u12-week-label">Aktuelle Woche</strong>
                <button class="button button--secondary" type="button" id="u12-next" aria-label="Nächste U12-Woche">›</button>
              </div>
              <div class="u12-week-actions">
                <button class="button button--secondary" type="button" id="u12-today">Aktuelle Woche</button>
                <button class="button button--secondary" type="button" id="u12-reload">↻ Neu laden</button>
              </div>
            </section>
            <section id="u12-week" class="u12-week" hidden>
              <div class="card u12-savebar">
                <span id="u12-save-state" role="status">Gespeichert</span>
                <button class="button button--secondary" id="u12-save" type="button" disabled>💾 Jetzt speichern</button>
              </div>
              <div id="u12-days" class="u12-days" aria-live="polite"></div>
            </section>
          </section>
`;

export const ULC_U12_CSS = `
/* U12: independent responsive surface; fixed Start/Anwesenheit/Doku stay unchanged. */
.u12-toolbar, .u12-week, .u12-days { display: grid; gap: 10px; min-width: 0; max-width: 100%; }
.u12-toolbar label { font-weight: 700; font-size: .8rem; }
.u12-toolbar select { width: 100%; min-width: 0; }
.u12-week-nav { display: grid; grid-template-columns: 42px minmax(0, 1fr) 42px; align-items: center; gap: 8px; }
.u12-week-nav strong { font-size: .85rem; text-align: center; overflow-wrap: anywhere; }
.u12-week-nav button { min-height: 42px; padding: 0; }
.u12-week-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.u12-week-actions button { flex: 1 1 135px; min-width: 0; }
.u12-savebar { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.u12-savebar span { min-width: 0; font-size: .82rem; overflow-wrap: anywhere; }
.u12-day { display: grid; gap: 10px; min-width: 0; }
.u12-day-toggle { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; padding: 4px 0; background: none; border: none; text-align: left; color: inherit; cursor: pointer; }
.u12-day-toggle strong { font-size: .95rem; }
.u12-day-toggle small { font-size: .75rem; color: var(--secondary); }
.u12-day-toggle span:first-child { display: grid; gap: 2px; min-width: 0; }
.u12-day-details { display: grid; gap: 12px; min-width: 0; }
.u12-day-fields { display: grid; gap: 8px; min-width: 0; }
.u12-day-fields label { display: grid; gap: 4px; font-size: .8rem; }
.u12-day-fields select, .u12-day-fields textarea { width: 100%; min-width: 0; max-width: 100%; }
.u12-day-fields textarea { min-height: 64px; resize: vertical; }
.u12-bulk { display: flex; flex-wrap: wrap; gap: 8px; }
.u12-bulk button { flex: 1 1 120px; }
.u12-person { padding: 10px 0; border-top: 1px solid var(--border); display: grid; gap: 8px; }
.u12-person strong { overflow-wrap: anywhere; font-size: .88rem; }
.u12-person small { color: var(--secondary); }
.u12-statuses { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 5px; }
.u12-statuses button { padding: 7px 2px; min-width: 0; min-height: 42px; font-size: .72rem; white-space: normal; overflow-wrap: anywhere; }
.u12-statuses button[aria-pressed="true"] { border-color: var(--accent); background: var(--muted); font-weight: 750; }
.u12-day--unavailable { opacity: .75; }
@media (min-width: 540px) {
  .u12-day-fields { grid-template-columns: minmax(140px, 1fr) minmax(0, 2fr); }
  .u12-day-fields label { align-self: start; }
}
`;

export const ULC_U12_SCRIPT = `
/* A03 U12: groups, attendance and CAS remain server-owned. No private offline cache. */
const u12Ui = {
  group: document.querySelector("#u12-group"),
  week: document.querySelector("#u12-week"),
  days: document.querySelector("#u12-days"),
  label: document.querySelector("#u12-week-label"),
  prev: document.querySelector("#u12-prev"),
  next: document.querySelector("#u12-next"),
  today: document.querySelector("#u12-today"),
  reload: document.querySelector("#u12-reload"),
  save: document.querySelector("#u12-save"),
  saveState: document.querySelector("#u12-save-state"),
  message: document.querySelector("#u12-message"),
  success: document.querySelector("#u12-success"),
};
const U12_STATUSES = Object.freeze([
  ["open", "Offen"], ["present", "Da"], ["excused", "Entschuldigt"], ["absent", "Fehlt"],
]);
let u12Ready = false;
let u12WriteAllowed = true;
let u12Groups = [];
let u12WeekStart = "";
let u12LoadedGroupId = "";
let u12Days = [];
let u12DirtyDates = new Set();
let u12ExpandedDates = new Set();
let u12FailedDates = new Set();
let u12Loading = false;
let u12Saving = false;
let u12Conflict = false;
let u12LoadId = 0;
let u12AutoTimer = null;

function u12ClearAutosave() {
  if (u12AutoTimer !== null) window.clearTimeout(u12AutoTimer);
  u12AutoTimer = null;
}

function resetU12SessionState() {
  u12LoadId += 1;
  u12ClearAutosave();
  u12Ready = false;
  u12WriteAllowed = true;
  u12Groups = [];
  u12WeekStart = "";
  u12LoadedGroupId = "";
  u12Days = [];
  u12DirtyDates = new Set();
  u12ExpandedDates = new Set();
  u12FailedDates = new Set();
  u12Loading = false;
  u12Saving = false;
  u12Conflict = false;
  if (u12Ui.group) {
    u12Ui.group.replaceChildren();
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Gruppe wählen";
    u12Ui.group.append(option);
  }
  showMessage(u12Ui.message, "");
  showMessage(u12Ui.success, "");
  renderU12Week();
}

function u12ValidGroup(group) {
  return group !== null && typeof group === "object" &&
    typeof group.id === "string" && group.id.length > 0 &&
    typeof group.name === "string" && group.name.length > 0 &&
    (group.shortName === null || typeof group.shortName === "string");
}

function u12ValidSnapshot(snapshot, date, groupId) {
  if (!snapshot || typeof snapshot !== "object" ||
      snapshot.sessionDate !== date || !u12ValidGroup(snapshot.group) ||
      snapshot.group.id !== groupId || !Array.isArray(snapshot.participants)) return false;
  if (snapshot.session !== null && (
      typeof snapshot.session !== "object" ||
      typeof snapshot.session.revision !== "string" ||
      !["scheduled", "cancelled"].includes(snapshot.session.state) ||
      (snapshot.session.note !== null && typeof snapshot.session.note !== "string"))) return false;
  const ids = new Set();
  for (const person of snapshot.participants) {
    if (!person || typeof person.athleteId !== "string" || !person.athleteId ||
        typeof person.firstName !== "string" || typeof person.lastName !== "string" ||
        !U12_STATUSES.some(([status]) => status === person.status) ||
        ids.has(person.athleteId)) return false;
    ids.add(person.athleteId);
  }
  return true;
}

function u12Draft(snapshot) {
  return {
    state: snapshot.session?.state || "scheduled",
    note: snapshot.session?.note || "",
    participants: snapshot.participants.map((person) => ({ ...person })),
  };
}

function u12GroupOptions() {
  const selected = u12Ui.group?.value || "";
  if (!u12Ui.group) return;
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
  const matched = u12Groups.some((group) => group.id === selected);
  u12Ui.group.value = matched ? selected : (u12Groups.length === 1 ? u12Groups[0].id : "");
  u12LoadedGroupId = u12Ui.group.value;
}

async function bootstrapU12() {
  const generation = attendanceSessionGeneration;
  resetU12SessionState();
  u12WeekStart = localWeekStart(new Date());
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
      await loadU12Week();
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

function u12StatusText(status) {
  return (U12_STATUSES.find(([key]) => key === status) || U12_STATUSES[0])[1];
}

function u12MakeButton(label, action, value, disabled) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button button--secondary";
  button.dataset[action] = value;
  button.textContent = label;
  button.disabled = disabled;
  return button;
}

// Refresh controls in place while saving. Rebuilding the textarea would close
// the mobile keyboard and silently discard edits made during the request.
function refreshU12Controls() {
  const busy = u12Loading || u12Saving;
  for (const button of [u12Ui.prev, u12Ui.next, u12Ui.today, u12Ui.reload]) {
    if (button) button.disabled = busy || !u12Ready;
  }
  if (u12Ui.group) u12Ui.group.disabled = busy || !u12Ready;
  if (u12Ui.saveState) {
    u12Ui.saveState.textContent = u12Saving ? "Wird gespeichert …" :
      u12Conflict ? "Konflikt – zuerst neu laden" :
      u12DirtyDates.size > 0 ? u12DirtyDates.size + " Tag(e) ungespeichert" : "Gespeichert";
  }
  if (u12Ui.save) u12Ui.save.disabled = busy || !u12WriteAllowed ||
    u12Conflict || u12DirtyDates.size === 0;
  for (const toggle of u12Ui.days?.querySelectorAll("[data-u12-toggle-date]") ?? []) {
    toggle.disabled = busy;
  }
  for (const control of u12Ui.days?.querySelectorAll("[data-u12-status], [data-u12-state-date]") ?? []) {
    control.disabled = busy || !u12WriteAllowed || u12Conflict;
  }
  // Notes remain editable while an autosave request is in flight.
  for (const note of u12Ui.days?.querySelectorAll("[data-u12-note-date]") ?? []) {
    note.disabled = !u12WriteAllowed || u12Conflict;
  }
  for (const summary of u12Ui.days?.querySelectorAll("[data-u12-summary-date]") ?? []) {
    const date = summary.dataset.u12SummaryDate;
    const entry = u12Days.find((item) => item.snapshot.sessionDate === date);
    if (entry) {
      const present = entry.draft.participants.filter((p) => p.status === "present").length;
      summary.textContent = present + "/" + entry.draft.participants.length +
        " da · " + (entry.draft.state === "cancelled" ? "Abgesagt" : "Geplant") +
        (u12DirtyDates.has(date) ? " · Ungespeichert" : "") +
        (u12ExpandedDates.has(date) ? " ▴" : " ▾");
    }
  }
}

function renderU12Week() {
  if (!u12Ui.days || !u12Ui.week) return;
  u12Ui.days.replaceChildren();
  const groupId = u12Ui.group?.value || "";
  u12Ui.week.hidden = !u12Ready || !groupId;
  if (u12Ui.label) {
    const start = u12WeekStart || localWeekStart(new Date());
    u12Ui.label.textContent = germanDate(start) + " – " + germanDate(shiftIsoDate(start, 6));
  }
  refreshU12Controls();
  const busy = u12Loading || u12Saving;
  if (!u12Ready || !groupId) return;
  if (u12Loading) {
    const loading = document.createElement("div");
    loading.className = "card";
    loading.textContent = "U12-Woche wird geladen …";
    u12Ui.days.append(loading);
    return;
  }
  for (const date of registrationWeekDates(u12WeekStart)) {
    const entry = u12Days.find((item) => item.snapshot.sessionDate === date);
    const day = document.createElement("section");
    day.className = "card u12-day" + (!entry ? " u12-day--unavailable" : "");
    if (!entry) {
      const title = document.createElement("strong");
      title.textContent = germanWeekday(date) + " · " + germanDate(date);
      const hint = document.createElement("small");
      hint.textContent = u12FailedDates.has(date)
        ? "Nicht geladen – bitte neu laden." : "Noch keine Daten verfügbar.";
      day.append(title, hint);
      u12Ui.days.append(day);
      continue;
    }
    const expanded = u12ExpandedDates.has(date);
    const toggle = u12MakeButton("", "u12ToggleDate", date, busy);
    toggle.className = "u12-day-toggle";
    toggle.setAttribute("aria-expanded", String(expanded));
    const title = document.createElement("span");
    const name = document.createElement("strong");
    name.textContent = germanWeekday(date);
    const d = document.createElement("small");
    d.textContent = germanDate(date);
    title.append(name, d);
    const summary = document.createElement("small");
    summary.dataset.u12SummaryDate = date;
    const present = entry.draft.participants.filter((p) => p.status === "present").length;
    summary.textContent = present + "/" + entry.draft.participants.length +
      " da · " + (entry.draft.state === "cancelled" ? "Abgesagt" : "Geplant") +
      (u12DirtyDates.has(date) ? " · Ungespeichert" : "") +
      (expanded ? " ▴" : " ▾");
    toggle.append(title, summary);
    day.append(toggle);
    if (!expanded) {
      u12Ui.days.append(day);
      continue;
    }
    const editable = !busy && u12WriteAllowed && !u12Conflict;
    const details = document.createElement("div");
    details.className = "u12-day-details";
    const fields = document.createElement("div");
    fields.className = "u12-day-fields";
    const stateLabel = document.createElement("label");
    stateLabel.textContent = "Trainingstag";
    const stateSelect = document.createElement("select");
    stateSelect.dataset.u12StateDate = date;
    for (const [value, label] of [["scheduled", "Geplant"], ["cancelled", "Abgesagt"]]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      stateSelect.append(option);
    }
    stateSelect.value = entry.draft.state;
    stateSelect.disabled = !editable;
    stateLabel.append(stateSelect);
    const noteLabel = document.createElement("label");
    noteLabel.textContent = "Tagesnotiz (max. 3000 Zeichen)";
    const note = document.createElement("textarea");
    note.dataset.u12NoteDate = date;
    note.maxLength = 3000;
    note.value = entry.draft.note;
    note.disabled = !editable;
    noteLabel.append(note);
    fields.append(stateLabel, noteLabel);
    details.append(fields);
    const bulk = document.createElement("div");
    bulk.className = "u12-bulk";
    for (const [status, label] of [["present", "Alle da"], ["open", "Alle offen"]]) {
      const btn = u12MakeButton(label, "u12BulkDate", date, !editable);
      btn.dataset.u12Status = status;
      bulk.append(btn);
    }
    details.append(bulk);
    if (entry.draft.participants.length === 0) {
      const empty = document.createElement("small");
      empty.textContent = "Keine Athleten für diesen Trainingstag zugeordnet.";
      details.append(empty);
    }
    for (const person of entry.draft.participants) {
      const box = document.createElement("div");
      box.className = "u12-person";
      const label = document.createElement("strong");
      label.textContent = person.lastName + " " + person.firstName;
      const statuses = document.createElement("div");
      statuses.className = "u12-statuses";
      for (const [status, caption] of U12_STATUSES) {
        const btn = u12MakeButton(caption, "u12PersonDate", date, !editable);
        btn.dataset.u12AthleteId = person.athleteId;
        btn.dataset.u12Status = status;
        btn.setAttribute("aria-pressed", String(person.status === status));
        statuses.append(btn);
      }
      box.append(label, statuses);
      details.append(box);
    }
    day.append(details);
    u12Ui.days.append(day);
  }
}

async function loadU12Week() {
  const groupId = u12Ui.group?.value || "";
  if (!u12Ready || u12Loading || u12Saving || !groupId) return;
  const generation = attendanceSessionGeneration;
  const loadId = ++u12LoadId;
  const weekStart = u12WeekStart;
  u12LoadedGroupId = groupId;
  u12Loading = true;
  u12Days = [];
  u12FailedDates = new Set();
  u12ExpandedDates = new Set();
  showMessage(u12Ui.message, "");
  showMessage(u12Ui.success, "");
  renderU12Week();
  const dates = registrationWeekDates(weekStart);
  try {
    const responses = await Promise.allSettled(dates.map((date) =>
      requestJson("/api/modules/u12/session?groupId=" +
        encodeURIComponent(groupId) + "&sessionDate=" + encodeURIComponent(date))));
    if (generation !== attendanceSessionGeneration || loadId !== u12LoadId) return;
    const days = [];
    const failed = new Set();
    for (let i = 0; i < dates.length; i += 1) {
      const response = responses[i];
      const date = dates[i];
      if (response.status === "fulfilled" &&
          u12ValidSnapshot(response.value?.snapshot, date, groupId)) {
        const snapshot = response.value.snapshot;
        days.push({ snapshot, draft: u12Draft(snapshot) });
      } else {
        failed.add(date);
        if (response.status === "rejected" &&
            (response.reason?.status === 403 || response.reason?.status === 401)) {
          u12Ready = false;
          u12Days = [];
          showMessage(u12Ui.message, "U12-Zugriff ist nicht mehr freigeschaltet.");
          refreshAppAvailability();
          return;
        }
      }
    }
    u12Days = days;
    u12FailedDates = failed;
    if (failed.size > 0) {
      showMessage(u12Ui.message, "Einige U12-Tage konnten nicht geladen werden. Diese Tage bleiben gesperrt.");
    }
  } finally {
    if (generation === attendanceSessionGeneration && loadId === u12LoadId) {
      u12Loading = false;
      renderU12Week();
    }
  }
}

function u12MarkDirty(date) {
  u12DirtyDates.add(date);
  u12Conflict = false;
  showMessage(u12Ui.success, "");
  u12ClearAutosave();
  if (u12WriteAllowed) {
    u12AutoTimer = window.setTimeout(() => { void saveU12Week(); }, 1100);
  }
  renderU12Week();
}

async function saveU12Week() {
  if (u12Saving || u12Loading || !u12Ready || !u12WriteAllowed || u12Conflict) return false;
  u12ClearAutosave();
  if (u12DirtyDates.size === 0) return true;
  const generation = attendanceSessionGeneration;
  const groupId = u12LoadedGroupId;
  u12Saving = true;
  refreshU12Controls();
  let savedAll = true;
  try {
    for (const date of [...u12DirtyDates]) {
      const entry = u12Days.find((day) => day.snapshot.sessionDate === date);
      if (!entry) {
        savedAll = false;
        break;
      }
      try {
        const outgoingDraft = JSON.stringify(entry.draft);
        const payload = await requestJson("/api/modules/u12/session", {
          method: "POST",
          body: JSON.stringify({
            groupId,
            sessionDate: date,
            expectedRevision: entry.snapshot.session?.revision ?? null,
            state: entry.draft.state,
            note: entry.draft.note.trim() || null,
            attendance: entry.draft.participants.map((person) => ({
              athleteId: person.athleteId,
              status: person.status,
            })),
          }),
        });
        if (generation !== attendanceSessionGeneration) return false;
        if (!u12ValidSnapshot(payload?.snapshot, date, groupId)) {
          throw new Error("U12_SAVED_INVALID");
        }
        entry.snapshot = payload.snapshot;
        if (JSON.stringify(entry.draft) === outgoingDraft) {
          // Only clear saved fields if the trainer did not continue typing.
          entry.draft = u12Draft(payload.snapshot);
          u12DirtyDates.delete(date);
        } else {
          // New edits will be retried against the just-returned revision.
          u12DirtyDates.add(date);
        }
      } catch (error) {
        if (generation !== attendanceSessionGeneration) return false;
        savedAll = false;
        if (error?.status === 409) {
          u12Conflict = true;
          showMessage(u12Ui.message,
            "Eine U12-Anwesenheit wurde zwischenzeitlich geändert. Bitte neu laden; ungespeicherte Änderungen werden nur mit Bestätigung verworfen.");
        } else if (error?.status === 403 || error?.status === 401) {
          u12WriteAllowed = false;
          for (const day of u12Days) day.draft = u12Draft(day.snapshot);
          u12DirtyDates.clear();
          showMessage(u12Ui.message, "Keine U12-Schreibberechtigung. Änderungen wurden nicht übernommen.");
          // Revert visible fields to the last server snapshot after access revocation.
          renderU12Week();
        } else {
          showMessage(u12Ui.message, "U12 konnte nicht vollständig speichern. Ungespeicherte Tage bleiben erhalten.");
        }
        break;
      }
    }
    if (savedAll && u12DirtyDates.size === 0) {
      showMessage(u12Ui.success, "U12-Anwesenheit gespeichert.");
    }
    return savedAll && u12DirtyDates.size === 0;
  } finally {
    if (generation === attendanceSessionGeneration) {
      u12Saving = false;
      refreshU12Controls();
      if (u12DirtyDates.size > 0 && u12WriteAllowed && !u12Conflict) {
        u12ClearAutosave();
        u12AutoTimer = window.setTimeout(() => { void saveU12Week(); }, 1200);
      }
    }
  }
}

async function u12FlushChanges() {
  u12ClearAutosave();
  if (u12Saving || u12Loading) return false;
  if (u12DirtyDates.size === 0) return true;
  return saveU12Week();
}

async function u12DiscardAndReload() {
  if (u12Saving || u12Loading) return;
  if (u12DirtyDates.size > 0 &&
      !window.confirm("Ungespeicherte U12-Änderungen verwerfen und neu laden?")) return;
  u12ClearAutosave();
  u12DirtyDates.clear();
  u12Conflict = false;
  await loadU12Week();
}

async function u12MoveWeek(offset) {
  if (!(await u12FlushChanges())) return;
  u12WeekStart = offset === 0 ? localWeekStart(new Date()) :
    shiftIsoDate(u12WeekStart || localWeekStart(new Date()), offset * 7);
  u12DirtyDates.clear();
  u12Conflict = false;
  await loadU12Week();
}

async function u12ChangeGroup() {
  if (u12Loading || u12Saving) return;
  const nextGroupId = u12Ui.group?.value || "";
  if (nextGroupId === u12LoadedGroupId) return;
  if (!(await u12FlushChanges())) {
    if (u12Ui.group) u12Ui.group.value = u12LoadedGroupId;
    return;
  }
  u12LoadedGroupId = nextGroupId;
  u12Days = [];
  u12DirtyDates.clear();
  u12Conflict = false;
  renderU12Week();
  if (nextGroupId) await loadU12Week();
}

function prepareU12View() {
  if (u12Ready && u12Ui.group?.value && u12Days.length === 0 && !u12Loading) {
    void loadU12Week();
  }
}

u12Ui.prev?.addEventListener("click", () => void u12MoveWeek(-1));
u12Ui.next?.addEventListener("click", () => void u12MoveWeek(1));
u12Ui.today?.addEventListener("click", () => void u12MoveWeek(0));
u12Ui.reload?.addEventListener("click", () => void u12DiscardAndReload());
u12Ui.save?.addEventListener("click", () => void saveU12Week());
u12Ui.group?.addEventListener("change", () => void u12ChangeGroup());
u12Ui.days?.addEventListener("click", (event) => {
  const target = event.target?.closest?.("button");
  if (!target || !u12Ui.days.contains(target) || u12Loading || u12Saving) return;
  const toggleDate = target.dataset.u12ToggleDate;
  if (toggleDate) {
    if (u12ExpandedDates.has(toggleDate)) u12ExpandedDates.delete(toggleDate);
    else u12ExpandedDates.add(toggleDate);
    renderU12Week();
    return;
  }
  if (!u12WriteAllowed || u12Conflict) return;
  const date = target.dataset.u12PersonDate || target.dataset.u12BulkDate;
  const status = target.dataset.u12Status;
  if (!date || !U12_STATUSES.some(([key]) => key === status)) return;
  const entry = u12Days.find((day) => day.snapshot.sessionDate === date);
  if (!entry) return;
  if (target.dataset.u12BulkDate) {
    entry.draft.participants = entry.draft.participants.map((p) => ({ ...p, status }));
  } else {
    const athleteId = target.dataset.u12AthleteId;
    if (!entry.draft.participants.some((p) => p.athleteId === athleteId)) return;
    entry.draft.participants = entry.draft.participants.map((p) =>
      p.athleteId === athleteId ? { ...p, status } : p);
  }
  u12MarkDirty(date);
});
u12Ui.days?.addEventListener("change", (event) => {
  const input = event.target;
  const date = input?.dataset?.u12StateDate;
  if (!date || !u12WriteAllowed || u12Saving || u12Conflict) return;
  const entry = u12Days.find((day) => day.snapshot.sessionDate === date);
  if (!entry || !["scheduled", "cancelled"].includes(input.value)) return;
  entry.draft.state = input.value;
  u12MarkDirty(date);
});
u12Ui.days?.addEventListener("input", (event) => {
  const input = event.target;
  const date = input?.dataset?.u12NoteDate;
  if (!date || !u12WriteAllowed || u12Conflict) return;
  const entry = u12Days.find((day) => day.snapshot.sessionDate === date);
  if (!entry) return;
  entry.draft.note = input.value.slice(0, 3000);
  // Do not re-render on every keystroke; preserve textarea focus and selection.
  u12DirtyDates.add(date);
  showMessage(u12Ui.success, "");
  u12ClearAutosave();
  u12AutoTimer = window.setTimeout(() => { void saveU12Week(); }, 1200);
  if (u12Ui.save) u12Ui.save.disabled = false;
  if (u12Ui.saveState) u12Ui.saveState.textContent = u12DirtyDates.size + " Tag(e) ungespeichert";
});
`;
