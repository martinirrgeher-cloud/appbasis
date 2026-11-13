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

  const invalidCases: readonly {
    readonly name: string;
    readonly rows: readonly Record<string, unknown>[];
  }[] = [
    { name: "absent", rows: [] },
    { name: "U12", rows: [{ module_id: "u12" }] },
    { name: "U14", rows: [{ module_id: "u14" }] },
    { name: "IRG without canonical mapping", rows: [{ module_id: "performance_registration" }] },
    { name: "null", rows: [{ module_id: null }] },
    { name: "duplicated", rows: [{ module_id: "kindertraining" }, { module_id: "kindertraining" }] },
  ];

  it.each(invalidCases)("denies missing, ambiguous or non-Kindertraining mapping: $name", async ({ rows }) => {
    const unsafe = vi.fn(async (_query: string, _params?: (string | number | boolean | null)[]) => rows);
    await expect(assertUlcStaffRegistrationModuleAuthority(
      { unsafe }, "org-1", "group-1",
    )).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
  });
});
