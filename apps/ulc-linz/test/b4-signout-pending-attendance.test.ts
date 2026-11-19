import { describe, expect, it, vi } from "vitest";
import { ULC_LINZ_APP_SCRIPT } from "../worker/ui";

type Section = "u12" | "u14" | "kids";

function signoutPreflight({
  pending = [] as Section[],
  dirty = [] as Section[],
  failed = [] as Section[],
  conflict = [] as Section[],
  previousBackgroundFailure = [] as Section[],
  flushResult = true,
}: {
  pending?: Section[];
  dirty?: Section[];
  failed?: Section[];
  conflict?: Section[];
  previousBackgroundFailure?: Section[];
  flushResult?: boolean;
} = {}) {
  const start = ULC_LINZ_APP_SCRIPT.indexOf("async function handleSignOut() {");
  const end = ULC_LINZ_APP_SCRIPT.indexOf(
    "  if (masterdataExchangeBusy || trainerIdentityLoading || groupCalendarState?.saving)",
    start,
  );
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  // Execute the original sign-out code from the first guard through all
  // three CAS flushes. Never mock the production conditions themselves.
  const snippet = ULC_LINZ_APP_SCRIPT.slice(start, end);
  const vars = [
    "busy", "backgroundAttendanceSaves", "failedBackgroundAttendanceSaves",
    "elements", "showMessage", "selfRegistrationSavingKeys",
    "selfRegistrationProxy",
    "u12Saving", "u12Loading", "u12DirtyDates", "u12AutoSaveFailed",
    "u12Conflict", "u12FlushChanges",
    "u14Saving", "u14Loading", "u14DirtyDates", "u14AutoSaveFailed",
    "u14Conflict", "u14FlushChanges",
    "kidsSaving", "kidsLoading", "kidsDirtyDates", "kidsAutoSaveFailed",
    "kidsConflict", "kidsFlushChanges",
  ] as const;
  const make = new Function(
    ...vars,
    snippet + "  return 'safe-to-continue';\n}\nreturn handleSignOut;",
  ) as (...args: unknown[]) => () => Promise<string | undefined>;
  const message = { textContent: "", hidden: true };
  const showMessage = vi.fn((host: typeof message, value: string) => {
    host.textContent = value;
    host.hidden = value.length === 0;
  });
  const flushes = {
    u12: vi.fn(async () => flushResult),
    u14: vi.fn(async () => flushResult),
    kids: vi.fn(async () => flushResult),
  };
  const isDirty = (section: Section) => new Set(
    dirty.includes(section) ? ["2026-11-16"] : [],
  );
  const enabled = (list: readonly Section[], section: Section) => list.includes(section);
  const run = make(
    false,
    new Map(pending.map((section): [Section, Promise<void>] => [section, Promise.resolve()])),
    new Set(previousBackgroundFailure),
    { appSessionMessage: message },
    showMessage,
    new Set(), null,
    false, false, isDirty("u12"), enabled(failed, "u12"),
    enabled(conflict, "u12"), flushes.u12,
    false, false, isDirty("u14"), enabled(failed, "u14"),
    enabled(conflict, "u14"), flushes.u14,
    false, false, isDirty("kids"), enabled(failed, "kids"),
    enabled(conflict, "kids"), flushes.kids,
  );
  return { run, flushes, message, showMessage };
}

describe("B4: safely end a session when a youth attendance CAS may be unresolved", () => {
  it("blocks sign-out while an attendance flush has been queued but has not started", async () => {
    const test = signoutPreflight({ pending: ["u12"], dirty: ["u12"] });
    expect(await test.run()).toBeUndefined();
    expect(test.message.textContent).toContain("im Hintergrund");
    expect(test.flushes.u12).not.toHaveBeenCalled();
  });

  it.each(["u12", "u14", "kids"] as const)(
    "does not silently retry %s after an uncertain previous POST",
    async section => {
      const test = signoutPreflight({ dirty: [section], failed: [section] });
      expect(await test.run()).toBeUndefined();
      expect(test.message.textContent).toContain("Nicht gespeicherte Änderungen");
      expect(test.message.textContent).toContain(
        section === "kids" ? "Kindertraining" : section.toUpperCase(),
      );
      for (const flush of Object.values(test.flushes)) {
        expect(flush).not.toHaveBeenCalled();
      }
    },
  );

  it("also blocks a conflict or unresolved background failure, without dropping either draft", async () => {
    const test = signoutPreflight({
      dirty: ["u12", "u14", "kids"],
      conflict: ["u12"],
      previousBackgroundFailure: ["u14", "kids"],
    });
    expect(await test.run()).toBeUndefined();
    expect(test.message.textContent).toContain("U12, U14, Kindertraining");
    for (const flush of Object.values(test.flushes)) {
      expect(flush).not.toHaveBeenCalled();
    }
  });

  it("retains ordinary sign-out's automatic flush for a not-yet-sent, healthy draft", async () => {
    const test = signoutPreflight({ dirty: ["u12", "kids"] });
    expect(await test.run()).toBe("safe-to-continue");
    expect(test.flushes.u12).toHaveBeenCalledOnce();
    expect(test.flushes.kids).toHaveBeenCalledOnce();
    expect(test.flushes.u14).not.toHaveBeenCalled();
    expect(test.message.hidden).toBe(true);
  });

  it("preserves fail-closed sign-out when a safe flush fails", async () => {
    const test = signoutPreflight({ dirty: ["u14"], flushResult: false });
    expect(await test.run()).toBeUndefined();
    expect(test.message.textContent).toContain("U14-Änderungen konnten nicht gespeichert werden.");
    expect(test.flushes.u14).toHaveBeenCalledOnce();
  });

  it("does not block a clean logout because an old failed state has no outstanding draft", async () => {
    const test = signoutPreflight({ failed: ["u12", "kids"] });
    expect(await test.run()).toBe("safe-to-continue");
    for (const flush of Object.values(test.flushes)) {
      expect(flush).not.toHaveBeenCalled();
    }
  });
});
