import { describe, expect, it, vi } from "vitest";
import { ULC_U12_SCRIPT } from "../worker/u12-ui";
import { ULC_U14_SCRIPT, ULC_KIDS_SCRIPT } from "../worker/youth-attendance-ui";
import {
  ULC_LINZ_APP_CSS,
  ULC_LINZ_APP_HTML,
  ULC_LINZ_APP_SCRIPT,
} from "../worker/ui";

type Deferred = {
  promise: Promise<boolean>;
  resolve: (saved: boolean) => void;
};
function deferred(): Deferred {
  let resolve: Deferred["resolve"] = () => {};
  const promise = new Promise<boolean>((done) => { resolve = done; });
  return { promise, resolve };
}

function scriptUnderTest() {
  const start = ULC_LINZ_APP_SCRIPT.indexOf(
    "const backgroundAttendanceSaves = new Map();",
  );
  const end = ULC_LINZ_APP_SCRIPT.indexOf(
    '\nfor (const control of document.querySelectorAll("[data-nav-view]"))',
    start,
  );
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return ULC_LINZ_APP_SCRIPT.slice(start, end);
}

function setup({
  current = "u12",
  dirty = true,
  failed = false,
  flush = vi.fn(async () => true),
}: {
  current?: "u12" | "u14" | "kids" | "home";
  dirty?: boolean;
  failed?: boolean;
  flush?: ReturnType<typeof vi.fn>;
} = {}) {
  const status = {
    hidden: true,
    textContent: "",
    dataset: {} as Record<string, string>,
    removeAttribute: vi.fn(function (this: { dataset: Record<string, string> }, key: string) {
      if (key === "data-state") delete this.dataset.state;
    }),
  };
  const show = vi.fn();
  const doc = {
    querySelector: vi.fn(() => ({ dataset: { appSection: current } })),
  };
  const build = new Function(
    "elements", "document", "showAppSection",
    "u12Saving", "u12DirtyDates", "u12AutoSaveFailed", "u12Conflict", "u12FlushChanges",
    "u14Saving", "u14DirtyDates", "u14AutoSaveFailed", "u14Conflict", "u14FlushChanges",
    "kidsSaving", "kidsDirtyDates", "kidsAutoSaveFailed", "kidsConflict", "kidsFlushChanges",
    "closeTrainingPlanEditor", "prepareTrainingDocumentationForLeave",
    scriptUnderTest() + "\nreturn { navigateAppSection, backgroundAttendanceSaves, failedBackgroundAttendanceSaves, clearBackgroundAttendanceSaveError };",
  );
  const u12 = current === "u12" ? flush : vi.fn(async () => true);
  const u14 = current === "u14" ? flush : vi.fn(async () => true);
  const kids = current === "kids" ? flush : vi.fn(async () => true);
  const result = build(
    { backgroundSaveStatus: status }, doc, show,
    false, new Set(dirty ? ["2026-11-15"] : []), failed, false, u12,
    false, new Set(dirty ? ["2026-11-15"] : []), failed, false, u14,
    false, new Set(dirty ? ["2026-11-15"] : []), failed, false, kids,
    undefined, undefined,
  ) as {
    navigateAppSection: (section: string) => Promise<boolean>;
    backgroundAttendanceSaves: Map<string, Promise<void>>;
    failedBackgroundAttendanceSaves: Set<string>;
    clearBackgroundAttendanceSaveError: (section: string) => void;
  };
  return { ...result, show, status, u12, u14, kids };
}

describe("P07 mobile attendance: nonblocking main navigation", () => {
  it("keeps a single in-flight CAS flush while immediately opening the destination", async () => {
    const delayed = deferred();
    const flush = vi.fn(() => delayed.promise);
    const app = setup({ flush });

    const navigation = app.navigateAppSection("training-plans");
    expect(app.show).toHaveBeenCalledOnce();
    expect(app.show).toHaveBeenCalledWith("training-plans");
    expect(app.status.hidden).toBe(false);
    expect(app.status.textContent).toContain("im Hintergrund");
    expect(await navigation).toBe(true);

    await Promise.resolve();
    expect(flush).toHaveBeenCalledOnce();
    expect(app.backgroundAttendanceSaves.has("u12")).toBe(true);

    delayed.resolve(true);
    await vi.waitFor(() => expect(app.backgroundAttendanceSaves.size).toBe(0));
    expect(app.failedBackgroundAttendanceSaves.size).toBe(0);
    expect(app.status.hidden).toBe(true);
  });

  it.each(["u12", "u14", "kids"] as const)(
    "%s navigates immediately without dropping a failed or slow in-flight save",
    async (current) => {
      const delayed = deferred();
      const flush = vi.fn(() => delayed.promise);
      const app = setup({ current, flush });
      expect(await app.navigateAppSection("home")).toBe(true);
      expect(app.show).toHaveBeenCalledWith("home");
      await Promise.resolve();
      expect(flush).toHaveBeenCalledOnce();
      delayed.resolve(false);
      await vi.waitFor(() => expect(app.status.dataset.state).toBe("failed"));
      expect(app.failedBackgroundAttendanceSaves.has(current)).toBe(true);
      expect(app.status.textContent).toContain("Nicht gespeichert");
      expect(app.status.textContent).toContain(
        current === "kids" ? "Kindertraining" : current.toUpperCase(),
      );
      expect(app.status.hidden).toBe(false);
    },
  );

  it("does not silently replay an uncertain failed POST when leaving the view", async () => {
    const flush = vi.fn(async () => true);
    const app = setup({ current: "u12", failed: true, flush });
    expect(await app.navigateAppSection("registration")).toBe(true);
    expect(app.show).toHaveBeenCalledWith("registration");
    expect(flush).not.toHaveBeenCalled();
    expect(app.status.dataset.state).toBe("failed");
    expect(app.status.textContent).toContain("Zurückwechseln");
  });

  it("clears a stale global failure after confirmed manual retry in any youth view", async () => {
    const app = setup({ current: "u12", failed: true });
    expect(await app.navigateAppSection("registration")).toBe(true);
    expect(app.status.dataset.state).toBe("failed");
    app.clearBackgroundAttendanceSaveError("u12");
    expect(app.status.hidden).toBe(true);
    expect(app.failedBackgroundAttendanceSaves.size).toBe(0);
    expect(ULC_U12_SCRIPT).toContain('clearBackgroundAttendanceSaveError("u12")');
    expect(ULC_U14_SCRIPT).toContain('clearBackgroundAttendanceSaveError("u14")');
    expect(ULC_KIDS_SCRIPT).toContain('clearBackgroundAttendanceSaveError("kids")');
  });

  it("does not create a second flush while the prior one remains pending", async () => {
    const delayed = deferred();
    const flush = vi.fn(() => delayed.promise);
    const app = setup({ flush });
    expect(await app.navigateAppSection("home")).toBe(true);
    expect(await app.navigateAppSection("registration")).toBe(true);
    await Promise.resolve();
    expect(flush).toHaveBeenCalledOnce();
    delayed.resolve(true);
    await vi.waitFor(() => expect(app.backgroundAttendanceSaves.size).toBe(0));
  });

  it("preserves the existing date/CAS and sign-out safeguards", () => {
    expect(ULC_LINZ_APP_SCRIPT).toContain("if (!(await u12FlushChanges())) return;");
    expect(ULC_LINZ_APP_SCRIPT).toContain("if (!(await u14FlushChanges())) return;");
    expect(ULC_LINZ_APP_SCRIPT).toContain("if (!(await kidsFlushChanges())) return;");
    expect(ULC_LINZ_APP_SCRIPT).toContain("if (u12Saving || u12Loading)");
    expect(ULC_LINZ_APP_SCRIPT).toContain("if (u14Saving || u14Loading || kidsSaving || kidsLoading)");
    expect(ULC_LINZ_APP_SCRIPT).toContain("u12Saving || u12DirtyDates.size > 0");
    expect(ULC_LINZ_APP_SCRIPT).toContain("u14Saving || u14DirtyDates.size > 0");
    expect(ULC_LINZ_APP_SCRIPT).toContain("kidsSaving || kidsDirtyDates.size > 0");
  });

  it("shows one compact, accessible and pointer-transparent saving message", () => {
    expect(ULC_LINZ_APP_HTML).toContain('id="app-background-save-status"');
    expect(ULC_LINZ_APP_HTML).toContain('role="status" aria-live="polite" hidden');
    expect(ULC_LINZ_APP_CSS).toContain(".app-background-save-status[hidden]");
    expect(ULC_LINZ_APP_CSS).toContain("pointer-events: none;");
    expect(ULC_LINZ_APP_CSS).toContain('.app-background-save-status[data-state="failed"]');
  });
});
