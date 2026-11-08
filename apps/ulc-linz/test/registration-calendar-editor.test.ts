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
    expect(ULC_LINZ_APP_CSS).toContain("@media(max-width: 430px)");
    expect(ULC_LINZ_APP_CSS).toContain(".registration-calendar-weekdays");
  });

  it("does not enable the calendar on schema v16 or silently ignore CAS", () => {
    expect(ULC_REGISTRATION_CALENDAR_SCRIPT).toContain("masterdataCalendarAvailable && masterdataCanEdit");
    expect(ULC_REGISTRATION_CALENDAR_SCRIPT).toContain("expectedRevision: state.revision");
    expect(ULC_REGISTRATION_CALENDAR_SCRIPT).toContain("expectedRevision: state.exceptionRevision");
    expect(ULC_REGISTRATION_CALENDAR_SCRIPT).toContain("error?.status === 409");
    expect(ULC_REGISTRATION_CALENDAR_SCRIPT).toContain("groupCalendarState?.saving");
  });
});
