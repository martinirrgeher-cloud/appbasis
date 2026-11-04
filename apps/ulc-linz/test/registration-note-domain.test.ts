import { describe, expect, it } from "vitest";
import {
  createUlcTrainingRegistration,
  normalizeUlcRegistrationNote,
  UlcTrainingValidationError,
} from "../worker/training-session-domain";

const data = {
  organizationId: "verein-1",
  sessionId: "session-1",
  athleteId: "athlete-1",
  intention: "attending" as const,
  revision: 2,
  updatedByIdentityId: "identity-1",
};

describe("A02.3 optional registration note", () => {
  it("normalizes short text, empty text and explicit removal", () => {
    expect(normalizeUlcRegistrationNote("  Komme 15 Minuten später  ")).toBe(
      "Komme 15 Minuten später",
    );
    expect(normalizeUlcRegistrationNote("  ")).toBeNull();
    expect(normalizeUlcRegistrationNote(null)).toBeNull();
    expect(createUlcTrainingRegistration({ ...data, note: " Hallo " }))
      .toMatchObject({ note: "Hallo" });
    expect(createUlcTrainingRegistration({ ...data, note: null }))
      .toHaveProperty("note", null);
  });

  it("keeps the existing status-only contract when the note field is absent", () => {
    const saved = createUlcTrainingRegistration(data);
    expect(saved).toEqual(data);
    expect("note" in saved).toBe(false);
  });

  it("rejects oversized, control-character and nontext note content", () => {
    for (const value of [
      "x".repeat(161),
      "Zeile eins\nZeile zwei",
      "Zeile eins\rZeile zwei",
      "NUL\u0000Inhalt",
      42, {}, [], true,
    ]) {
      expect(() => normalizeUlcRegistrationNote(value))
        .toThrow(UlcTrainingValidationError);
    }
  });
});
