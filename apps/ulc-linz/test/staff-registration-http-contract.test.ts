import { describe, expect, it } from "vitest";

import { UlcLinzAuthorizationDeniedError } from "../worker/authorization";
import { parseUnwiredUlcStaffRegistrationRequest } from "../worker/staff-registration-http-contract";
import type { UlcLinzCurrentIdentity } from "../worker/authorization";

const current = {
  identity: { identityId: "trusted-actor" },
  sessionId: "trusted-session",
  access: "full",
} as unknown as UlcLinzCurrentIdentity;

const body = {
  groupId: "group-1",
  targetAthleteId: "athlete-1",
  sessionDate: "2026-11-17",
  intention: "attending",
  expectedRevision: 0,
};

describe("N16 unwired HTTP staff boundary", () => {
  it("does not derive actor or session from the request body", () => {
    const parsed = parseUnwiredUlcStaffRegistrationRequest(current, body);
    expect(parsed.actorIdentityId).toBe("trusted-actor");
    expect(parsed.trustedSessionId).toBe("trusted-session");
    expect(parsed.expectedRevision).toBe(0);
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it.each([
    { actorIdentityId: "forged" },
    { trustedSessionId: "forged" },
    { sessionId: "forged" },
    { organizationId: "foreign" },
    { role: "admin" },
    { sourceRole: "admin" },
    { moduleId: "performance_registration" },
    { updatedByIdentityId: "forged" },
    { note: "unexpected" },
  ])("rejects client-controlled authority or unknown fields: %j", (extra) => {
    expect(() => parseUnwiredUlcStaffRegistrationRequest(current, { ...body, ...extra }))
      .toThrow(UlcLinzAuthorizationDeniedError);
  });

  it("denies missing and invalid target/CAS/date/operation values", () => {
    for (const invalid of [
      { ...body, groupId: "" },
      { ...body, targetAthleteId: " athlete-1" },
      { ...body, sessionDate: "2026-02-30" },
      { ...body, sessionDate: "2025-02-29" },
      { ...body, sessionDate: "2026-13-01" },
      { ...body, sessionDate: "2026-11-17 " },
      { ...body, sessionDate: "2026-11-17T00:00:00Z" },
      { ...body, intention: "unknown" },
      { ...body, expectedRevision: -1 },
      { ...body, expectedRevision: 0.5 },
      { ...body, expectedRevision: "0" },
      { ...body, expectedRevision: Number.MAX_SAFE_INTEGER + 1 },
      { groupId: "group-1", targetAthleteId: "athlete-1" },
      null,
      [],
      "body",
    ]) {
      expect(() => parseUnwiredUlcStaffRegistrationRequest(current, invalid))
        .toThrow(UlcLinzAuthorizationDeniedError);
    }
  });

  it("rejects non-plain JSON objects and inherited authority", () => {
    const inherited = Object.create({ groupId: "group-1" }) as Record<string, unknown>;
    Object.assign(inherited, body);
    expect(() => parseUnwiredUlcStaffRegistrationRequest(current, inherited))
      .toThrow(UlcLinzAuthorizationDeniedError);
    expect(() => parseUnwiredUlcStaffRegistrationRequest(current, new Date()))
      .toThrow(UlcLinzAuthorizationDeniedError);
  });

  it("accepts leap-day dates but never silently normalizes dates", () => {
    expect(parseUnwiredUlcStaffRegistrationRequest(current, {
      ...body, sessionDate: "2028-02-29", expectedRevision: 1,
    }).sessionDate).toBe("2028-02-29");
  });

  it("denies password-change-required identities before any staff request", () => {
    const restricted = { ...current, access: "password-change-required" } as UlcLinzCurrentIdentity;
    expect(() => parseUnwiredUlcStaffRegistrationRequest(restricted, body))
      .toThrow(UlcLinzAuthorizationDeniedError);
  });

  it("denies absent or client-substituted server session", () => {
    const noSession = { ...current, sessionId: undefined } as unknown as UlcLinzCurrentIdentity;
    expect(() => parseUnwiredUlcStaffRegistrationRequest(noSession, body))
      .toThrow(UlcLinzAuthorizationDeniedError);
    expect(() => parseUnwiredUlcStaffRegistrationRequest(noSession, {
      ...body, sessionId: "client-forgery",
    })).toThrow(UlcLinzAuthorizationDeniedError);
  });
});
