import { describe, expect, it, vi } from "vitest";

import { UlcLinzAuthorizationDeniedError } from "../worker/authorization";
import { assertUlcStaffRegistrationModuleAuthority } from "../worker/staff-registration-module-authority";

describe("N16 inactive canonical staff module authority", () => {
  it("pins the youth mapping row under FOR SHARE and derives the only permitted capability", async () => {
    const unsafe = vi.fn(async () => [{ module_id: "kindertraining" }]);
    const authority = await assertUlcStaffRegistrationModuleAuthority(
      { unsafe }, "org-1", "group-1",
    );
    expect(authority).toEqual({
      moduleId: "kindertraining",
      capability: "ulc-linz:module:kindertraining:edit",
    });
    expect(Object.isFrozen(authority)).toBe(true);
    expect(unsafe).toHaveBeenCalledWith(
      expect.stringContaining("FOR SHARE"), ["org-1", "group-1"],
    );
    expect(unsafe.mock.calls).toHaveLength(1);
  });

  it.each([
    [],
    [{ module_id: "u12" }],
    [{ module_id: "u14" }],
    [{ module_id: "performance_registration" }],
    [{ module_id: null }],
    [{ module_id: "kindertraining" }, { module_id: "kindertraining" }],
  ])("denies any missing, ambiguous or non-Kindertraining mapping: %j", async rows => {
    const unsafe = vi.fn(async () => rows);
    await expect(assertUlcStaffRegistrationModuleAuthority(
      { unsafe }, "org-1", "group-1",
    )).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
  });
});
