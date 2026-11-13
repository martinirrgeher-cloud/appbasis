import { describe, expect, it, vi } from "vitest";
import { bindUlcStaffRegistrationWriter } from "../worker/staff-registration-transaction";
import { UlcLinzAuthorizationDeniedError } from "../worker/authorization";
import type { PostgresUlcTrainingSessionRepository } from "../worker/training-session-postgres";
import type { UlcTrainingSession } from "../worker/training-session-domain";

const date = "2026-11-17";
const scope = Object.freeze({
  sourceRole: "admin" as const,
  actorIdentityId: "trusted-actor",
  organizationId: "trusted-org",
  groupId: "trusted-group",
  targetAthleteId: "trusted-athlete",
  sessionDate: date,
  moduleId: "kindertraining" as const,
});

function repository(overrides: Record<string, unknown> = {}) {
  const ensureScheduledSession = vi.fn(async () => ({
    session: {
      id: "trusted-session",
      organizationId: scope.organizationId,
      moduleId: "kindertraining" as const,
      groupId: scope.groupId,
      sessionDate: date,
      state: "scheduled" as const,
      note: null,
    },
    revision: "1",
    attendance: [],
    registrations: [],
  }));
  const saveRegistration = vi.fn(async (...args: unknown[]) => ({
    organizationId: args[0] as string,
    sessionId: args[1] as string,
    athleteId: args[2] as string,
    intention: args[3] as "attending",
    revision: 1,
    updatedByIdentityId: args[5] as string,
  }));
  const sessions = { ensureScheduledSession, saveRegistration, ...overrides } as unknown as Pick<
    PostgresUlcTrainingSessionRepository, "ensureScheduledSession" | "saveRegistration"
  >;
  return { sessions, ensureScheduledSession, saveRegistration };
}

describe("N16 inactive staff scope-bound writer", () => {
  it("binds tenant, module, group, date, target and audit actor, including create CAS", async () => {
    const { sessions, ensureScheduledSession, saveRegistration } = repository();
    const writer = bindUlcStaffRegistrationWriter(sessions, scope);
    expect(Object.isFrozen(writer)).toBe(true);
    await writer.save("attending", null, "note");
    expect(ensureScheduledSession).toHaveBeenCalledWith(
      "trusted-org", "kindertraining", "trusted-group", date,
    );
    expect(saveRegistration).toHaveBeenCalledWith(
      "trusted-org", "trusted-session", "trusted-athlete",
      "attending", null, "trusted-actor", undefined, "note",
    );
  });

  it("preserves update CAS and never supplies a proxy-athlete actor", async () => {
    const { sessions, saveRegistration } = repository();
    await bindUlcStaffRegistrationWriter(sessions, scope).save("not_attending", 3);
    expect(saveRegistration).toHaveBeenCalledWith(
      "trusted-org", "trusted-session", "trusted-athlete",
      "not_attending", 3, "trusted-actor", undefined, undefined,
    );
  });

  const invalidSnapshots: readonly Partial<UlcTrainingSession>[] = [
    { organizationId: "other-org" },
    { groupId: "other-group" },
    { moduleId: "u12" },
    { moduleId: "u14" },
    { sessionDate: "2026-11-18" },
    { state: "cancelled" },
  ];

  it.each(invalidSnapshots)("fails closed on mismatched or cancelled session %j", async (difference) => {
    const base = repository();
    const ensureScheduledSession = vi.fn(async () => ({
      session: {
        id: "trusted-session", organizationId: scope.organizationId,
        moduleId: "kindertraining" as const, groupId: scope.groupId,
        sessionDate: date, state: "scheduled" as const, note: null,
        ...difference,
      },
      revision: "1", attendance: [], registrations: [],
    }));
    const sessions = { ...base.sessions, ensureScheduledSession };
    await expect(bindUlcStaffRegistrationWriter(sessions, scope).save(
      "attending", null,
    )).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
    expect(base.saveRegistration).not.toHaveBeenCalled();
  });

  it("propagates database CAS failures without retry or second write", async () => {
    const base = repository();
    const failure = new Error("CAS conflict");
    const saveRegistration = vi.fn(async () => { throw failure; });
    const sessions = { ...base.sessions, saveRegistration };
    await expect(bindUlcStaffRegistrationWriter(sessions, scope).save(
      "attending", 2,
    )).rejects.toBe(failure);
    expect(saveRegistration).toHaveBeenCalledTimes(1);
  });
});
