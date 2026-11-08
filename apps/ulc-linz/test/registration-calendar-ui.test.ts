import { describe, expect, it } from "vitest";
import { ULC_LINZ_APP_SCRIPT } from "../worker/ui";

/**
 * Check the actual JavaScript template emitted by the Worker, rather than
 * TypeScript template text. This catches lost regexp backslashes that can
 * silently invalidate deadline display in the browser.
 */
function emittedFunction(name: string): (...args: unknown[]) => unknown {
  const signature = "function " + name + "(";
  const begin = ULC_LINZ_APP_SCRIPT.indexOf(signature);
  if (begin < 0) throw new Error("Missing emitted calendar function " + name);
  const end = ULC_LINZ_APP_SCRIPT.indexOf("\n}\n", begin);
  if (end < 0) throw new Error("Missing emitted calendar boundary " + name);
  const actual = ULC_LINZ_APP_SCRIPT.slice(begin, end + 2);
  return new Function("germanDate", actual + "\nreturn " + name + ";")(
    (day: string) => day,
  ) as (...args: unknown[]) => unknown;
}

const valid = {
  visible: true,
  scheduledWeekday: true,
  exceptionalTrainingDay: false,
  isLate: false,
  mayEdit: true,
  reason: "open",
  deadlineLocal: "2026-11-20T18:30",
};

describe("G-04.2 emitted registration-calendar UI contract", () => {
  it("accepts the genuine Vienna deadline and rejects malformed or injected fields", () => {
    const check = emittedFunction("isRegistrationWindowContract");
    expect(check(valid)).toBe(true);
    expect(check({ ...valid, deadlineLocal: "2026-11-20T18:30<script>" })).toBe(false);
    expect(check({ ...valid, deadlineLocal: "yyyy-11-20T18:30" })).toBe(false);
    expect(check({ ...valid, deadlineLocal: 99 })).toBe(false);
    expect(check({ ...valid, reason: "unknown" })).toBe(false);
    expect(check({ ...valid, mayEdit: "yes" })).toBe(false);
    expect(check({ ...valid, deadlineLocal: null })).toBe(true);
  });

  it("emits a readable deadline, cancellation and late-registration explanation", () => {
    const explain = emittedFunction("registrationWindowExplanation");
    expect(explain(valid)).toContain("18:30 Uhr");
    expect(explain({ ...valid, reason: "cancelled", mayEdit: false }))
      .toContain("abgesagt");
    expect(explain({ ...valid, isLate: true })).toContain("Nachmeldung möglich");
    expect(explain({ ...valid, reason: "deadline-passed", mayEdit: false }))
      .toContain("Anmeldeschluss ist abgelaufen");
  });

  it("protects existing own/proxy controls and draft state in production source", () => {
    expect(ULC_LINZ_APP_SCRIPT).toContain("registrationWindow?.mayEdit === false");
    expect(ULC_LINZ_APP_SCRIPT).toContain("!canEditRegistration");
    expect(ULC_LINZ_APP_SCRIPT).toContain("const policyLocked =");
    expect(ULC_LINZ_APP_SCRIPT).toContain("registrationWindowExplanation");
  });
});
