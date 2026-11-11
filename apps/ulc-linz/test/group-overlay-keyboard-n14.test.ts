import { describe, expect, it, vi } from "vitest";
import { ULC_LINZ_APP_HTML, ULC_LINZ_APP_SCRIPT } from "../worker/ui";

function emitted(name: string) {
  const signature = "function " + name + "(";
  const start = ULC_LINZ_APP_SCRIPT.indexOf(signature);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = ULC_LINZ_APP_SCRIPT.indexOf("\n}\n", start);
  expect(end).toBeGreaterThan(start);
  return ULC_LINZ_APP_SCRIPT.slice(start, end + 2);
}

function control(document: { activeElement: unknown }, options: {
  disabled?: boolean; hidden?: boolean; excluded?: boolean; noLayout?: boolean;
} = {}) {
  const element = {
    disabled: options.disabled ?? false,
    hidden: options.hidden ?? false,
    closest: () => options.excluded ? {} : null,
    getAttribute: () => options.excluded ? "-1" : null,
    getClientRects: () => options.noLayout ? [] : [{}],
    focus: vi.fn(),
  };
  element.focus.mockImplementation(() => { document.activeElement = element; });
  return element;
}

describe("N14 group modal keyboard contract", () => {
  it("keeps Tab and Shift+Tab within the visible controls, excluding hidden/disabled descendants", () => {
    const document: { activeElement: unknown } = { activeElement: null };
    const first = control(document);
    const hidden = control(document, { hidden: true });
    const disabled = control(document, { disabled: true });
    const nestedHidden = control(document, { excluded: true });
    const last = control(document);
    const controls = [first, hidden, disabled, nestedHidden, last];
    const dialog = { querySelectorAll: () => controls };
    const groupOverlay = {
      hidden: false,
      querySelector: () => dialog,
    };
    const elements = { groupOverlay, groupOverlayClose: first };
    const close = vi.fn();
    const make = new Function(
      "elements", "document", "closeMasterdataGroupOverlay", "masterdataGroupOverlayMode",
      emitted("masterdataGroupFocusableControls") +
      "\n" + emitted("handleMasterdataGroupOverlayKeydown") +
      "\nreturn { find: masterdataGroupFocusableControls, handle: handleMasterdataGroupOverlayKeydown };",
    ) as (...args: unknown[]) => {
      find: () => unknown[];
      handle: (event: { key: string; shiftKey: boolean; preventDefault: () => void }) => void;
    };
    const { find, handle } = make(elements, document, close, "detail");
    expect(find()).toEqual([first, last]);

    const preventDefault = vi.fn();
    document.activeElement = last;
    handle({ key: "Tab", shiftKey: false, preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(first);

    document.activeElement = first;
    handle({ key: "Tab", shiftKey: true, preventDefault });
    expect(document.activeElement).toBe(last);

    document.activeElement = hidden;
    handle({ key: "Tab", shiftKey: false, preventDefault });
    expect(document.activeElement).toBe(first);
    expect(close).not.toHaveBeenCalled();
  });

  it("handles Escape only while the group overlay is active", () => {
    const document = { activeElement: null };
    const first = control(document);
    const groupOverlay = { hidden: false, querySelector: () => ({
      querySelectorAll: () => [first],
    }) };
    const close = vi.fn();
    const make = new Function(
      "elements", "document", "closeMasterdataGroupOverlay", "masterdataGroupOverlayMode",
      emitted("masterdataGroupFocusableControls") +
      "\n" + emitted("handleMasterdataGroupOverlayKeydown") +
      "\nreturn handleMasterdataGroupOverlayKeydown;",
    ) as (...args: unknown[]) => (event: { key: string; preventDefault: () => void }) => void;
    const handler = make({ groupOverlay, groupOverlayClose: first }, document, close, "detail");
    const preventDefault = vi.fn();
    handler({ key: "Escape", preventDefault });
    expect(close).toHaveBeenCalledOnce();
    expect(preventDefault).toHaveBeenCalledOnce();
    groupOverlay.hidden = true;
    handler({ key: "Escape", preventDefault });
    expect(close).toHaveBeenCalledOnce();
  });

  it("restores the opener after detail/calendar navigation, but does not dismiss an in-flight save", () => {
    expect(ULC_LINZ_APP_HTML).toContain(
      'class="masterdata-athlete-dialog" role="dialog" aria-modal="true" aria-labelledby="group-overlay-title"',
    );
    const document: {
      activeElement: unknown;
      body: { classList: { add: () => void; remove: () => void } };
    } = { activeElement: null, body: { classList: { add: vi.fn(), remove: vi.fn() } } };
    const opener = { isConnected: true, closest: () => null,
      focus: vi.fn(() => { document.activeElement = opener; }) };
    document.activeElement = opener;
    const groupOverlay = { hidden: true };
    const closeButton = control(document);
    const calendarOpen = control(document);
    const calendarBack = control(document);
    const message = {};
    const calendarUi = { panel: { hidden: true }, open: calendarOpen, back: calendarBack, message };
    const state = { saving: false };
    const showMessage = vi.fn();

    const make = new Function(
      "elements", "document", "calendarUi", "state", "showMessage",
      `let masterdataGroupReturnFocus = null;
      let masterdataGroupOverlayMode = "closed";
      let masterdataGroupOverlayId = "group-1";
      let masterdataEdit = null;
      const masterdataSnapshot = null;
      const groupCalendarState = state;
      function resetGroupCalendar() {}
      function refreshMasterdataEditMode() {}
      ${emitted("closeMasterdataGroupOverlay")}
      ${emitted("showMasterdataGroupOverlayMode")}
      return { show: showMasterdataGroupOverlayMode, close: closeMasterdataGroupOverlay };`,
    ) as (...args: unknown[]) => {
      show: (mode: string) => void; close: (args?: { force?: boolean }) => void;
    };
    const elements = {
      groupOverlay, groupOverlayClose: closeButton,
      groupDetail: { hidden: false }, groupName: control(document),
    };
    const app = make(elements, document, calendarUi, state, showMessage);
    app.show("detail");
    expect(document.activeElement).toBe(closeButton);
    app.show("calendar");
    expect(document.activeElement).toBe(calendarBack);
    app.show("detail");
    expect(document.activeElement).toBe(calendarOpen);

    state.saving = true;
    app.close();
    expect(groupOverlay.hidden).toBe(false);
    expect(showMessage).toHaveBeenCalledWith(message, "Speichervorgang läuft noch.");

    state.saving = false;
    app.close();
    expect(groupOverlay.hidden).toBe(true);
    expect(document.activeElement).toBe(opener);
    expect(opener.focus).toHaveBeenCalledOnce();
  });
});
