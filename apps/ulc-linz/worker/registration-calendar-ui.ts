/**
 * G-04.2b: calendar administration lives in the existing group overlay.
 * It stays hidden unless the server advertises an active v17 calendar
 * repository. No separate global permissions or implicit trainer edit rights.
 */
export const ULC_REGISTRATION_CALENDAR_CSS = `
#group-calendar-panel {display:grid;gap:12px;max-width:100%;min-width:0;padding:12px}
#group-calendar-panel[hidden],#group-calendar-exception[hidden],#group-calendar-registration-settings[hidden]{display:none}
#group-calendar-panel .section-heading{margin:0}
#group-calendar-form{display:grid;gap:12px;min-width:0}
.registration-calendar-weekdays{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;margin:0;padding:0;min-width:0;min-inline-size:0;border:0}
.registration-calendar-weekdays legend{font-size:.85rem;font-weight:750;padding:0 0 9px;color:var(--text)}
.registration-calendar-day{position:relative;display:block;min-width:0;cursor:pointer}
.registration-calendar-day input{position:absolute;opacity:0;width:1px;height:1px}
.registration-calendar-day span{display:flex;align-items:center;justify-content:center;min-height:46px;min-width:0;padding:4px 1px;border:1px solid var(--border);border-radius:11px;background:var(--muted);color:var(--text);font-size:.8rem;font-weight:750}
.registration-calendar-day input:checked+span{background:var(--accent);color:#fff;border-color:var(--accent)}
.registration-calendar-day input:focus-visible+span{outline:3px solid var(--text);outline-offset:2px}
.registration-calendar-day input:disabled+span{opacity:.5;cursor:not-allowed}
.registration-calendar-summary{font-size:.78rem;color:var(--secondary);margin:0;line-height:1.4}
#group-calendar-panel .settings-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
#group-calendar-panel .settings-grid label{min-width:0}
#group-calendar-panel .settings-grid input,#group-calendar-panel .settings-grid select{min-width:0;max-width:100%}
#group-calendar-panel .masterdata-form-actions{margin:0}
#group-calendar-panel .masterdata-form-actions .button{min-height:42px}
.registration-calendar-details{margin:0;padding:0;min-width:0;border:1px solid var(--border);border-radius:12px;background:var(--surface,#fff)}
.registration-calendar-details>summary{cursor:pointer;padding:12px;font-size:.88rem;font-weight:750}
.registration-calendar-details>summary small{display:block;font-size:.72rem;font-weight:450;color:var(--secondary);margin-top:2px}
.registration-calendar-details>.registration-calendar-details-body{display:grid;gap:10px;padding:0 12px 12px}
#group-calendar-exception{display:grid;gap:9px;min-width:0}
#group-calendar-open{min-height:42px}
@media(max-width:430px){
#group-calendar-panel .settings-grid{grid-template-columns:minmax(0,1fr)}
.registration-calendar-weekdays{gap:3px}
.registration-calendar-day span{min-height:44px;font-size:.76rem}
#group-calendar-panel .masterdata-form-actions .button{width:100%}
}
`;

export const ULC_REGISTRATION_CALENDAR_SCRIPT = `
let groupCalendarState = null;
let groupCalendarRequestId = 0;

const calendarUi = {
  panel: document.querySelector("#group-calendar-panel"),
  open: document.querySelector("#group-calendar-open"),
  back: document.querySelector("#group-calendar-back"),
  form: document.querySelector("#group-calendar-form"),
  weekdays: document.querySelector("#group-calendar-weekdays"),
  registrationSettings: document.querySelector("#group-calendar-registration-settings"),
  weeksAhead: document.querySelector("#group-calendar-weeks-ahead"),
  deadlineEnabled: document.querySelector("#group-calendar-deadline-enabled"),
  deadlineDays: document.querySelector("#group-calendar-deadline-days"),
  deadlineTime: document.querySelector("#group-calendar-deadline-time"),
  lateMode: document.querySelector("#group-calendar-late-mode"),
  status: document.querySelector("#group-calendar-status"),
  message: document.querySelector("#group-calendar-message"),
  success: document.querySelector("#group-calendar-success"),
  submit: document.querySelector("#group-calendar-save"),
  exception: document.querySelector("#group-calendar-exception"),
  exceptionDate: document.querySelector("#group-calendar-exception-date"),
  exceptionKind: document.querySelector("#group-calendar-exception-kind"),
  exceptionMessage: document.querySelector("#group-calendar-exception-message"),
  exceptionSuccess: document.querySelector("#group-calendar-exception-success"),
  exceptionSave: document.querySelector("#group-calendar-exception-save"),
};

function resetGroupCalendar() {
  groupCalendarRequestId += 1;
  groupCalendarState = null;
  showMessage(calendarUi.message, "");
  showMessage(calendarUi.success, "");
  showMessage(calendarUi.exceptionMessage, "");
  showMessage(calendarUi.exceptionSuccess, "");
}

function refreshGroupCalendarAvailability() {
  const group = selectedMasterdataGroup();
  if (calendarUi.open) {
    calendarUi.open.hidden = !(
      masterdataCalendarAvailable && masterdataCanEdit && group &&
      group.isActive === true
    );
  }
}

function refreshGroupCalendarMode() {
  const group = selectedMasterdataGroup();
  if (calendarUi.registrationSettings) {
    calendarUi.registrationSettings.hidden = group?.attendanceMode !== "self_registration";
  }
}

function fillGroupCalendarRule(schedule) {
  const rule = schedule || {
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    weeksAhead: 4, deadline: null, lateMode: "allow",
  };
  for (const checkbox of calendarUi.weekdays?.querySelectorAll("[data-calendar-weekday]") || []) {
    checkbox.checked = rule.weekdays.includes(Number(checkbox.value));
  }
  calendarUi.weeksAhead.value = String(rule.weeksAhead);
  calendarUi.deadlineEnabled.checked = rule.deadline !== null;
  calendarUi.deadlineDays.value = String(rule.deadline?.daysBefore ?? 1);
  calendarUi.deadlineTime.value = rule.deadline?.localTime || "18:00";
  calendarUi.lateMode.value = rule.lateMode;
  refreshGroupCalendarDeadline();
  refreshGroupCalendarDaySummary();
}

function refreshGroupCalendarDaySummary() {
  if (!calendarUi.status || !calendarUi.weekdays) return;
  const names = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  const active = [...calendarUi.weekdays.querySelectorAll("[data-calendar-weekday]:checked")]
    .map((input) => names[Number(input.value) - 1]).join(" · ");
  const status = groupCalendarState?.dirty ? "Nicht gespeichert"
    : groupCalendarState?.revision === null ? "Noch keine Regel gespeichert"
    : "Aktive Trainingstage";
  calendarUi.status.textContent = status + " · " + (active || "Kein Tag ausgewählt");
}

function refreshGroupCalendarDeadline() {
  const enabled = calendarUi.deadlineEnabled.checked;
  calendarUi.deadlineDays.disabled = !enabled;
  calendarUi.deadlineTime.disabled = !enabled;
  calendarUi.lateMode.disabled = !enabled;
}

function refreshGroupCalendarBusy() {
  const state = groupCalendarState;
  const busy = !state || state.loading || state.saving;
  for (const control of calendarUi.form?.querySelectorAll("input, select, button") || []) {
    control.disabled = busy;
  }
  calendarUi.exceptionDate.disabled = busy;
  calendarUi.exceptionKind.disabled = busy || state?.exceptionLoading;
  calendarUi.exceptionSave.disabled = busy || state?.exceptionLoading ||
    state?.exceptionDate !== calendarUi.exceptionDate.value;
  if (!busy) refreshGroupCalendarDeadline();
}

async function openGroupCalendar() {
  const group = selectedMasterdataGroup();
  if (!group || !masterdataCalendarAvailable || !masterdataCanEdit ||
      group.isActive !== true) return;
  resetGroupCalendar();
  const id = groupCalendarRequestId;
  const generation = masterdataSessionGeneration;
  const state = { groupId: group.id, revision: null, loading: true, saving: false,
    exceptionDate: "", exceptionRevision: null, exceptionLoading: false };
  groupCalendarState = state;
  state.dirty = false;
  showMasterdataGroupOverlayMode("calendar");
  showMessage(calendarUi.message, "");
  showMessage(calendarUi.success, "");
  refreshGroupCalendarBusy();
  try {
    const result = await requestJson(
      "/api/modules/athletes/registration-calendar?groupId=" + encodeURIComponent(group.id)
    );
    if (generation !== masterdataSessionGeneration ||
        id !== groupCalendarRequestId || groupCalendarState !== state) return;
    if (result?.groupId !== group.id ||
        !(result.revision === null ||
          (Number.isSafeInteger(result.revision) && result.revision >= 1)) ||
        !(result.schedule === null ||
          (Array.isArray(result.schedule?.weekdays) &&
           typeof result.schedule.weeksAhead === "number" &&
           ["allow", "block"].includes(result.schedule.lateMode)))) {
      throw new Error("INVALID_CALENDAR_RULE_RESPONSE");
    }
    state.revision = result.revision;
    fillGroupCalendarRule(result.schedule);
    refreshGroupCalendarMode();
    refreshGroupCalendarDaySummary();
    calendarUi.exceptionDate.value = localDateValue(new Date());
    state.loading = false;
    await loadGroupCalendarException();
  } catch (error) {
    if (generation !== masterdataSessionGeneration ||
        id !== groupCalendarRequestId || groupCalendarState !== state) return;
    showMessage(calendarUi.message, error?.status === 403
      ? "Keine Berechtigung zur Kalenderverwaltung."
      : "Kalenderregeln konnten nicht geladen werden.");
    state.loading = true; // fail closed: no save using unknown revisions
  } finally {
    if (generation === masterdataSessionGeneration &&
        id === groupCalendarRequestId && groupCalendarState === state) {
      refreshGroupCalendarBusy();
    }
  }
}

async function saveGroupCalendarRule(event) {
  event.preventDefault();
  const state = groupCalendarState;
  if (!state || state.loading || state.saving ||
      selectedMasterdataGroup()?.id !== state.groupId) return;
  const weekdays = [...calendarUi.weekdays.querySelectorAll("[data-calendar-weekday]:checked")]
    .map((input) => Number(input.value)).sort((a, b) => a - b);
  if (!weekdays.length) {
    showMessage(calendarUi.message, "Mindestens einen Trainingstag auswählen.");
    return;
  }
  const weeksAhead = Number(calendarUi.weeksAhead.value);
  const deadline = calendarUi.deadlineEnabled.checked
    ? { daysBefore: Number(calendarUi.deadlineDays.value),
        localTime: calendarUi.deadlineTime.value } : null;
  if (!Number.isInteger(weeksAhead) || weeksAhead < 0 || weeksAhead > 26 ||
      (deadline && (!Number.isInteger(deadline.daysBefore) ||
        deadline.daysBefore < 0 || deadline.daysBefore > 14 || !deadline.localTime))) {
    showMessage(calendarUi.message, "Vorlauf oder Anmeldeschluss ist ungültig.");
    return;
  }
  const schedule = {
    weekdays, weeksAhead, deadline,
    lateMode: calendarUi.lateMode.value,
  };
  const generation = masterdataSessionGeneration, id = groupCalendarRequestId;
  state.saving = true;
  showMessage(calendarUi.message, "");
  showMessage(calendarUi.success, "");
  refreshGroupCalendarBusy();
  try {
    const result = await requestJson("/api/modules/athletes/registration-calendar", {
      method: "POST",
      body: JSON.stringify({
        groupId: state.groupId, expectedRevision: state.revision, schedule,
      }),
    });
    if (generation !== masterdataSessionGeneration || id !== groupCalendarRequestId ||
        groupCalendarState !== state) return;
    if (result?.groupId !== state.groupId ||
        !Number.isSafeInteger(result.revision) || result.revision < 1 ||
        !Array.isArray(result.schedule?.weekdays)) {
      throw new Error("INVALID_CALENDAR_RULE_SAVE");
    }
    state.revision = result.revision;
    state.dirty = false;
    refreshGroupCalendarDaySummary();
    showMessage(calendarUi.success, "Regel für diese Gruppe gespeichert.");
  } catch (error) {
    if (generation !== masterdataSessionGeneration || id !== groupCalendarRequestId ||
        groupCalendarState !== state) return;
    showMessage(calendarUi.message, error?.status === 409
      ? "Regel wurde zwischenzeitlich geändert. Bitte schließen und erneut öffnen."
      : "Regel konnte nicht gespeichert werden.");
  } finally {
    if (generation === masterdataSessionGeneration && id === groupCalendarRequestId &&
        groupCalendarState === state) {
      state.saving = false;
      refreshGroupCalendarBusy();
    }
  }
}

async function loadGroupCalendarException() {
  const state = groupCalendarState;
  if (!state || state.saving || state.loading ||
      selectedMasterdataGroup()?.id !== state.groupId) return;
  const day = calendarUi.exceptionDate.value;
  if (!day) return;
  const id = ++groupCalendarRequestId;
  const generation = masterdataSessionGeneration;
  state.exceptionLoading = true;
  showMessage(calendarUi.exceptionMessage, "");
  showMessage(calendarUi.exceptionSuccess, "");
  refreshGroupCalendarBusy();
  try {
    const result = await requestJson(
      "/api/modules/athletes/registration-calendar/exception?groupId=" +
        encodeURIComponent(state.groupId) + "&sessionDate=" + encodeURIComponent(day)
    );
    if (generation !== masterdataSessionGeneration || id !== groupCalendarRequestId ||
        groupCalendarState !== state || calendarUi.exceptionDate.value !== day) return;
    if (result?.groupId !== state.groupId || result.sessionDate !== day ||
        ![null, "extra", "cancelled"].includes(result.kind) ||
        !(result.revision === null ||
          (Number.isSafeInteger(result.revision) && result.revision >= 1))) {
      throw new Error("INVALID_CALENDAR_EXCEPTION_RESPONSE");
    }
    state.exceptionDate = day;
    state.exceptionRevision = result.revision;
    calendarUi.exceptionKind.value = result.kind || "none";
  } catch (error) {
    if (generation !== masterdataSessionGeneration || id !== groupCalendarRequestId ||
        groupCalendarState !== state) return;
    state.exceptionDate = "";
    showMessage(calendarUi.exceptionMessage, "Sondertermin konnte nicht geladen werden.");
  } finally {
    if (generation === masterdataSessionGeneration &&
        id === groupCalendarRequestId && groupCalendarState === state) {
      state.exceptionLoading = false;
      refreshGroupCalendarBusy();
    }
  }
}

async function saveGroupCalendarException(event) {
  event.preventDefault();
  const state = groupCalendarState;
  if (!state || state.loading || state.saving || state.exceptionLoading ||
      state.exceptionDate !== calendarUi.exceptionDate.value ||
      selectedMasterdataGroup()?.id !== state.groupId) return;
  const kind = calendarUi.exceptionKind.value;
  if (!["none", "extra", "cancelled"].includes(kind)) return;
  const generation = masterdataSessionGeneration, id = groupCalendarRequestId;
  state.saving = true;
  showMessage(calendarUi.exceptionMessage, "");
  showMessage(calendarUi.exceptionSuccess, "");
  refreshGroupCalendarBusy();
  try {
    const result = await requestJson(
      "/api/modules/athletes/registration-calendar/exception", {
        method: "POST",
        body: JSON.stringify({
          groupId: state.groupId, sessionDate: state.exceptionDate,
          kind: kind === "none" ? null : kind, expectedRevision: state.exceptionRevision,
        }),
      }
    );
    if (generation !== masterdataSessionGeneration || id !== groupCalendarRequestId ||
        groupCalendarState !== state) return;
    if (result?.groupId !== state.groupId || result.sessionDate !== state.exceptionDate ||
        result.kind !== (kind === "none" ? null : kind) ||
        !Number.isSafeInteger(result.revision) || result.revision < 1) {
      throw new Error("INVALID_CALENDAR_EXCEPTION_SAVE");
    }
    state.exceptionRevision = result.revision;
    showMessage(calendarUi.exceptionSuccess, "Einzeltermin gespeichert.");
  } catch (error) {
    if (generation !== masterdataSessionGeneration || id !== groupCalendarRequestId ||
        groupCalendarState !== state) return;
    showMessage(calendarUi.exceptionMessage, error?.status === 409
      ? "Einzeltermin wurde verändert. Bitte Datum neu laden."
      : "Einzeltermin konnte nicht gespeichert werden.");
  } finally {
    if (generation === masterdataSessionGeneration && id === groupCalendarRequestId &&
        groupCalendarState === state) {
      state.saving = false;
      refreshGroupCalendarBusy();
    }
  }
}

calendarUi.open?.addEventListener("click", () => void openGroupCalendar());
calendarUi.back?.addEventListener("click", () => {
  if (groupCalendarState?.saving) return;
  resetGroupCalendar();
  showMasterdataGroupOverlayMode("detail");
});
calendarUi.form?.addEventListener("submit", (event) => void saveGroupCalendarRule(event));
calendarUi.exception?.addEventListener("submit", (event) => void saveGroupCalendarException(event));
calendarUi.exceptionDate?.addEventListener("change", () => void loadGroupCalendarException());
calendarUi.deadlineEnabled?.addEventListener("change", refreshGroupCalendarDeadline);
calendarUi.weekdays?.addEventListener("change", () => {
  if (!groupCalendarState || groupCalendarState.loading || groupCalendarState.saving) return;
  groupCalendarState.dirty = true;
  refreshGroupCalendarDaySummary();
});
`;
