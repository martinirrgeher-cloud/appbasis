import { describe, expect, it } from "vitest";
import {
  ULC_LINZ_APP_HTML, ULC_LINZ_APP_CSS, ULC_LINZ_APP_SCRIPT,
} from "../worker/ui";
import {
  ULC_REGISTRATION_CALENDAR_SCRIPT,
} from "../worker/registration-calendar-ui";

describe("G-04.2b gated mobile group calendar editor", () => {
  it("only exposes calendar editor within existing group overlay", () => {
    const overlay = ULC_LINZ_APP_HTML.slice(
      ULC_LINZ_APP_HTML.indexOf('id="group-overlay"'),
      ULC_LINZ_APP_HTML.indexOf('id="masterdata-import-preview"'),
    );
    expect(overlay).toContain('id="group-calendar-open" type="button" hidden');
    expect(overlay).toContain('id="group-calendar-panel" hidden');
    expect(overlay).toContain('id="group-calendar-form"');
    expect(overlay).toContain('id="group-calendar-exception"');
    expect(overlay.match(/data-calendar-weekday/g)).toHaveLength(7);
    expect(overlay).toContain('id="group-calendar-deadline-time" type="time"');
    expect(overlay).toContain('value="cancelled"');
    expect(overlay).toContain('value="extra"');
    expect(overlay).toContain('value="none"');
  });

  it("emits valid JS and keeps mobile/touch geometry", () => {
    expect(() => new Function(ULC_REGISTRATION_CALENDAR_SCRIPT)).not.toThrow();
    expect(ULC_LINZ_APP_SCRIPT).toContain("refreshGroupCalendarAvailability()");
    expect(ULC_LINZ_APP_SCRIPT).toContain("resetGroupCalendar()");
    expect(ULC_LINZ_APP_SCRIPT).toContain("masterdataCalendarAvailable");
    expect(ULC_LINZ_APP_SCRIPT).toContain("groupCalendarRequestId");
    expect(ULC_LINZ_APP_CSS).toContain("min-height: 42px;");
    expect(ULC_LINZ_APP_CSS).toContain("@media(max-width:430px)");
    expect(ULC_LINZ_APP_CSS).toContain("grid-template-columns:repeat(7,minmax(0,1fr))");
    expect(ULC_LINZ_APP_CSS).toContain(".registration-calendar-weekdays");
  });

  it("allows interactive dismissal only after save, but always tears down a signed-out session", () => {
    const begin = ULC_LINZ_APP_SCRIPT.indexOf("function closeMasterdataGroupOverlay(");
    const end = ULC_LINZ_APP_SCRIPT.indexOf(
      "\n}\n\nfunction showMasterdataGroupOverlayMode(", begin,
    );
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(begin);
    const implementation = ULC_LINZ_APP_SCRIPT.slice(begin, end + 2);
    // Execute the emitted close function under the same mutable state contract
    // as the browser, with a pending calendar save and stubbed UI controls.
    const harness = new Function(`
      let groupCalendarState = { saving: true };
      const calendarUi = { message: {} };
      const messages = [];
      let resetCount = 0;
      function showMessage(_element, message) { messages.push(message); }
      function resetGroupCalendar() { resetCount += 1; groupCalendarState = null; }
      let masterdataGroupOverlayMode = "calendar";
      let masterdataGroupOverlayId = "group-1";
      let masterdataEdit = { type: "group" };
      const elements = {
        groupForm: { reset() {} },
        groupAttendanceMode: { value: "" },
        groupSortOrder: { value: "" },
        groupOverlay: { hidden: false },
      };
      const document = { body: { classList: { remove() {} } } };
      function refreshMasterdataEditMode() {}
      ${implementation}
      return {
        close: closeMasterdataGroupOverlay,
        status: () => ({
          resetCount, mode: masterdataGroupOverlayMode,
          groupId: masterdataGroupOverlayId,
          saving: groupCalendarState?.saving,
          hidden: elements.groupOverlay.hidden,
          messages,
        }),
      };
    `)() as {
      close: (options?: { force?: boolean }) => void;
      status: () => {
        resetCount: number; mode: string; groupId: string | null;
        saving?: boolean; hidden: boolean; messages: string[];
      };
    };
    harness.close();
    expect(harness.status()).toMatchObject({
      resetCount: 0, mode: "calendar", groupId: "group-1",
      saving: true, hidden: false,
    });
    expect(harness.status().messages).toEqual(["Speichervorgang läuft noch."]);
    harness.close({ force: true });
    expect(harness.status()).toMatchObject({
      resetCount: 1, mode: "closed", groupId: null, hidden: true,
    });
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "closeMasterdataGroupOverlay({ force: true });",
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "masterdataExchangeBusy || trainerIdentityLoading || groupCalendarState?.saving",
    );
  });

  it("does not enable the calendar on schema v16 or silently ignore CAS", () => {
    expect(ULC_REGISTRATION_CALENDAR_SCRIPT).toContain("masterdataCalendarAvailable && masterdataCanEdit");
    expect(ULC_REGISTRATION_CALENDAR_SCRIPT).toContain("expectedRevision: state.revision");
    expect(ULC_REGISTRATION_CALENDAR_SCRIPT).toContain("expectedRevision: state.exceptionRevision");
    expect(ULC_REGISTRATION_CALENDAR_SCRIPT).toContain("error?.status === 409");
    expect(ULC_REGISTRATION_CALENDAR_SCRIPT).toContain("groupCalendarState?.saving");
  });
});
