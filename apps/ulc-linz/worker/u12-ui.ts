export const ULC_U12_HTML = `
          <section class="app-section" data-app-section="u12" id="u12" hidden>
            <section class="hero">
              <p class="eyebrow">Training</p>
              <h1>U12 – Anwesenheit</h1>
              <p class="summary">Ein Trainingstermin, eine Namensliste: anwesend ja oder nein.</p>
            </section>
            <p class="message message--error" id="u12-message" role="alert" hidden></p>
            <p class="message message--success" id="u12-success" role="status" hidden></p>
            <section class="card u12-toolbar">
              <label for="u12-group">Trainingsgruppe</label>
              <select id="u12-group" aria-label="U12 Trainingsgruppe">
                <option value="">Gruppe wählen</option>
              </select>
              <div class="u12-date-nav">
                <button class="button button--secondary" type="button" id="u12-prev" aria-label="Vorheriger Trainingstag">‹</button>
                <label for="u12-date">
                  Training am
                  <input type="date" id="u12-date" required aria-label="Trainingstermin auswählen" />
                </label>
                <button class="button button--secondary" type="button" id="u12-next" aria-label="Nächster Trainingstag">›</button>
              </div>
              <button class="button button--secondary u12-reload" type="button" id="u12-reload">↻ Liste neu laden</button>
            </section>
            <section id="u12-week" class="u12-week" hidden>
              <div class="card u12-savebar">
                <div>
                  <strong id="u12-count">0 von 0 anwesend</strong>
                  <small id="u12-save-state" role="status">Training auswählen</small>
                </div>
                <button class="button button--primary" type="button" id="u12-save" disabled>Liste speichern</button>
              </div>
              <div id="u12-days" class="u12-days" aria-live="polite"></div>
            </section>
          </section>
`;

export const ULC_U12_CSS = `
/* U12: one training date, one mobile roll-call list, no week grid. */
.u12-toolbar, .u12-week, .u12-days { display: grid; gap: 10px; min-width: 0; max-width: 100%; }
.u12-toolbar > label { font-weight: 700; font-size: .82rem; }
.u12-toolbar > select { width: 100%; min-width: 0; }
.u12-reload { justify-self: start; min-height: 44px; }
.u12-date-nav { display: grid; grid-template-columns: 44px minmax(0, 1fr) 44px; gap: 8px; align-items: end; }
.u12-date-nav > button { min-height: 44px; padding: 0; font-size: 1.2rem; }
.u12-date-nav > label { display: grid; gap: 4px; min-width: 0; font-size: .8rem; font-weight: 700; }
.u12-date-nav input { width: 100%; min-width: 0; min-height: 44px; }
.u12-savebar { position: sticky; top: 57px; z-index: 8; display: flex; gap: 10px; align-items: center; justify-content: space-between; }
.u12-savebar > div { display: grid; gap: 3px; min-width: 0; }
.u12-savebar strong { font-size: .9rem; }
.u12-savebar small { font-size: .76rem; color: var(--secondary); line-height: 1.3; }
.u12-savebar button { min-height: 44px; flex: 0 0 auto; }
.u12-roster { min-width: 0; padding-top: 6px; padding-bottom: 6px; }
.u12-roster-hint { display: block; padding: 9px 2px 13px; font-size: .82rem; color: var(--secondary); }
.u12-person { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 58px; padding: 10px 2px; border-bottom: 1px solid var(--border); cursor: pointer; }
.u12-person:last-child { border-bottom: 0; }
.u12-person__name { min-width: 0; font-size: .93rem; font-weight: 650; overflow-wrap: anywhere; }
.u12-person__answer { display: inline-flex; flex: 0 0 auto; align-items: center; justify-content: center; gap: 8px; min-width: 76px; min-height: 44px; border: 1px solid var(--border-strong); border-radius: 10px; padding: 0 9px; font-weight: 750; }
.u12-person__answer input { width: 22px; height: 22px; margin: 0; accent-color: var(--accent); }
.u12-person__answer span { font-size: .88rem; min-width: 30px; text-align: center; }
.u12-person__answer:has(input:checked) { background: var(--muted); border-color: var(--accent); }
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
  date: document.querySelector("#u12-date"),
  prev: document.querySelector("#u12-prev"),
  next: document.querySelector("#u12-next"),
  reload: document.querySelector("#u12-reload"),
  week: document.querySelector("#u12-week"),
  days: document.querySelector("#u12-days"),
  count: document.querySelector("#u12-count"),
  saveState: document.querySelector("#u12-save-state"),
  save: document.querySelector("#u12-save"),
  message: document.querySelector("#u12-message"),
  success: document.querySelector("#u12-success"),
};
const U12_SERVER_STATUSES = Object.freeze(["open", "present", "excused", "absent"]);
let u12Ready = false;
let u12WriteAllowed = true;
let u12Groups = [];
let u12LoadedGroupId = "";
let u12LoadedDate = "";
let u12Snapshot = null;
let u12Present = new Map();
let u12DirtyDates = new Set();
let u12Loading = false;
let u12Saving = false;
let u12Conflict = false;
let u12LoadId = 0;

function resetU12SessionState() {
  u12LoadId += 1;
  u12Ready = false;
  u12WriteAllowed = true;
  u12Groups = [];
  u12LoadedGroupId = "";
  u12LoadedDate = "";
  u12Snapshot = null;
  u12Present = new Map();
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
  if (u12Ui.date) u12Ui.date.value = localIsoDate(new Date());
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
        !U12_SERVER_STATUSES.includes(person.status) ||
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

function refreshU12Controls() {
  const busy = u12Loading || u12Saving;
  for (const control of [u12Ui.group, u12Ui.date, u12Ui.prev, u12Ui.next, u12Ui.reload]) {
    if (control) control.disabled = busy || !u12Ready;
  }
  const cancelled = u12Snapshot?.session?.state === "cancelled";
  const editable = !!u12Snapshot && !busy && !cancelled &&
    u12WriteAllowed && !u12Conflict;
  for (const input of u12Ui.days?.querySelectorAll("[data-u12-athlete-id]") ?? []) {
    input.disabled = !editable;
  }
  if (u12Ui.save) {
    u12Ui.save.disabled = !editable ||
      (u12DirtyDates.size === 0 && u12Snapshot?.session !== null);
  }
  if (u12Ui.count) {
    const total = u12Snapshot?.participants.length ?? 0;
    const present = [...u12Present.values()].filter(Boolean).length;
    u12Ui.count.textContent = present + " von " + total + " anwesend";
  }
  if (u12Ui.saveState) {
    u12Ui.saveState.textContent = u12Saving ? "Wird gespeichert …" :
      u12Conflict ? "Konflikt – Liste bitte neu laden" :
      !u12WriteAllowed ? "Keine Schreibberechtigung" :
      cancelled ? "Training wurde abgesagt" :
      u12Loading ? "Namensliste wird geladen …" :
      !u12Snapshot ? "Training auswählen" :
      u12DirtyDates.size > 0 ? "Änderungen noch nicht gespeichert" :
      u12Snapshot.session === null ? "Noch nicht erfasst – erst Speichern übernimmt Ja/Nein" :
      "Gespeichert";
  }
  for (const mark of u12Ui.days?.querySelectorAll("[data-u12-answer-id]") ?? []) {
    mark.textContent = u12Present.get(mark.dataset.u12AnswerId) ? "Ja" : "Nein";
  }
}

function renderU12Attendance() {
  if (!u12Ui.days || !u12Ui.week) return;
  u12Ui.days.replaceChildren();
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
  const hint = document.createElement("small");
  hint.className = "u12-roster-hint";
  hint.textContent = u12Snapshot.session?.state === "cancelled"
    ? "Dieser Trainingstermin ist abgesagt. Die Anwesenheit kann nicht geändert werden."
    : "Angehakt = Ja (anwesend). Nicht angehakt = Nein (nicht anwesend).";
  roster.append(hint);
  if (u12Snapshot.participants.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "Für diesen Trainingstermin sind keine Athleten zugeordnet.";
    roster.append(empty);
  }
  for (const person of u12Snapshot.participants) {
    const label = document.createElement("label");
    label.className = "u12-person";
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
    status.textContent = input.checked ? "Ja" : "Nein";
    answer.append(input, status);
    label.append(name, answer);
    roster.append(label);
  }
  u12Ui.days.append(roster);
  refreshU12Controls();
}

async function loadU12Attendance() {
  const groupId = u12Ui.group?.value || "";
  const date = u12Ui.date?.value || "";
  if (!u12Ready || u12Loading || u12Saving || !groupId || !date) {
    renderU12Attendance();
    return;
  }
  const generation = attendanceSessionGeneration;
  const loadId = ++u12LoadId;
  u12LoadedGroupId = groupId;
  u12LoadedDate = date;
  u12Snapshot = null;
  u12Present = new Map();
  u12DirtyDates.clear();
  u12Conflict = false;
  u12Loading = true;
  showMessage(u12Ui.message, "");
  showMessage(u12Ui.success, "");
  renderU12Attendance();
  try {
    const payload = await requestJson("/api/modules/u12/session?groupId=" +
      encodeURIComponent(groupId) + "&sessionDate=" + encodeURIComponent(date));
    if (generation !== attendanceSessionGeneration || loadId !== u12LoadId) return;
    if (!u12ValidSnapshot(payload?.snapshot, date, groupId)) {
      throw new Error("U12_SESSION_INVALID");
    }
    u12Snapshot = payload.snapshot;
    u12Present = new Map(u12Snapshot.participants.map((person) =>
      [person.athleteId, person.status === "present"]));
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
  if (!u12Snapshot || u12Loading || u12Saving || !u12Ready ||
      !u12WriteAllowed || u12Conflict ||
      u12Snapshot.session?.state === "cancelled") return false;
  if (u12DirtyDates.size === 0 && u12Snapshot.session !== null) return true;
  const generation = attendanceSessionGeneration;
  const loadId = u12LoadId;
  const groupId = u12LoadedGroupId;
  const date = u12LoadedDate;
  u12Saving = true;
  refreshU12Controls();
  showMessage(u12Ui.message, "");
  showMessage(u12Ui.success, "");
  try {
    const payload = await requestJson("/api/modules/u12/session", {
      method: "POST",
      body: JSON.stringify({
        groupId,
        sessionDate: date,
        expectedRevision: u12Snapshot.session?.revision ?? null,
        // Never reset metadata belonging to an existing training session.
        state: u12Snapshot.session?.state ?? "scheduled",
        note: u12Snapshot.session?.note ?? null,
        attendance: u12Snapshot.participants.map((person) => ({
          athleteId: person.athleteId,
          status: u12Present.get(person.athleteId) === true ? "present" : "absent",
        })),
      }),
    });
    if (generation !== attendanceSessionGeneration || loadId !== u12LoadId) return false;
    if (!u12ValidSnapshot(payload?.snapshot, date, groupId)) {
      throw new Error("U12_SAVED_INVALID");
    }
    u12Snapshot = payload.snapshot;
    u12Present = new Map(u12Snapshot.participants.map((person) =>
      [person.athleteId, person.status === "present"]));
    u12DirtyDates.clear();
    showMessage(u12Ui.success, "Namensliste für " + germanDate(date) + " gespeichert.");
    return true;
  } catch (error) {
    if (generation !== attendanceSessionGeneration || loadId !== u12LoadId) return false;
    if (error?.status === 409) {
      u12Conflict = true;
      showMessage(u12Ui.message,
        "Die Liste wurde zwischenzeitlich geändert. Bitte neu laden, um Daten nicht zu überschreiben.");
    } else if (error?.status === 401 || error?.status === 403) {
      u12WriteAllowed = false;
      showMessage(u12Ui.message, "Keine U12-Schreibberechtigung. Änderungen wurden nicht gespeichert.");
    } else {
      showMessage(u12Ui.message, "Speichern fehlgeschlagen. Die Häkchen bleiben erhalten.");
    }
    return false;
  } finally {
    if (generation === attendanceSessionGeneration && loadId === u12LoadId) {
      u12Saving = false;
      refreshU12Controls();
    }
  }
}

async function u12FlushChanges() {
  if (u12Saving || u12Loading) return false;
  if (u12DirtyDates.size === 0) return true;
  return saveU12Attendance();
}

async function u12MoveDate(offset) {
  if (!(await u12FlushChanges())) return;
  if (!u12Ui.date) return;
  const selected = u12Ui.date.value || localIsoDate(new Date());
  u12Ui.date.value = shiftIsoDate(selected, offset);
  await loadU12Attendance();
}

async function u12ChangeDate() {
  if (u12Saving || u12Loading) return;
  if (u12Ui.date?.value === u12LoadedDate) return;
  if (!(await u12FlushChanges())) {
    if (u12Ui.date) u12Ui.date.value = u12LoadedDate || localIsoDate(new Date());
    return;
  }
  await loadU12Attendance();
}

async function u12ChangeGroup() {
  if (u12Saving || u12Loading) return;
  const next = u12Ui.group?.value || "";
  if (next === u12LoadedGroupId) return;
  if (!(await u12FlushChanges())) {
    if (u12Ui.group) u12Ui.group.value = u12LoadedGroupId;
    return;
  }
  u12Snapshot = null;
  u12Present = new Map();
  u12LoadedGroupId = "";
  u12LoadedDate = "";
  u12DirtyDates.clear();
  u12Conflict = false;
  if (next) await loadU12Attendance();
  else renderU12Attendance();
}

async function u12ReloadAttendance() {
  if (u12Saving || u12Loading) return;
  if (u12DirtyDates.size > 0 &&
      !window.confirm("Ungespeicherte U12-Häkchen verwerfen und Liste neu laden?")) return;
  u12DirtyDates.clear();
  u12Conflict = false;
  await loadU12Attendance();
}

function prepareU12View() {
  if (u12Ready && u12Ui.group?.value && u12Ui.date?.value &&
      !u12Snapshot && !u12Loading) void loadU12Attendance();
}

u12Ui.prev?.addEventListener("click", () => void u12MoveDate(-1));
u12Ui.next?.addEventListener("click", () => void u12MoveDate(1));
u12Ui.date?.addEventListener("change", () => void u12ChangeDate());
u12Ui.group?.addEventListener("change", () => void u12ChangeGroup());
u12Ui.save?.addEventListener("click", () => void saveU12Attendance());
u12Ui.reload?.addEventListener("click", () => void u12ReloadAttendance());
u12Ui.days?.addEventListener("change", (event) => {
  const input = event.target;
  const athleteId = input?.dataset?.u12AthleteId;
  if (!athleteId || !u12Snapshot || u12Saving || u12Loading ||
      !u12WriteAllowed || u12Conflict ||
      u12Snapshot.session?.state === "cancelled" ||
      !u12Snapshot.participants.some((person) => person.athleteId === athleteId)) return;
  u12Present.set(athleteId, input.checked === true);
  u12DirtyDates.add(u12LoadedDate);
  showMessage(u12Ui.success, "");
  // Update just the count/status: no DOM rebuild and no lost checkbox focus.
  refreshU12Controls();
});
`;
