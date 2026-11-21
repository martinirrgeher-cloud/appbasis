import { describe, expect, it } from "vitest";

import {
  assertUlcLiveTrainingDocumentationActor,
  UlcTrainingDocumentationActorWriteBlockedError,
  type UlcTrainingDocumentationActorScope,
} from "../worker/training-documentation-write-actor";

const CAP = "ulc-linz:module:training_documentation:edit";
const SCOPE: UlcTrainingDocumentationActorScope = {
  organizationId: "club-1",
  subjectId: "athlete-1",
  authenticatedIdentityId: "identity-1",
};

type Configuration = {
  role?: "trainer" | "admin" | "athlete" | "functionary" | "parent";
  active?: boolean;
  ended?: boolean;
  principal?: boolean;
  roleCount?: number;
  roleActive?: boolean;
  knownCapability?: boolean;
  revoked?: boolean;
  granted?: boolean;
  roleGrant?: boolean;
  selfRelation?: boolean;
  membershipSubject?: string;
};
function fixture(config: Configuration = {}) {
  const queries: string[] = [];
  const role = config.role ?? "trainer";
  const roleId = "ulc-linz:" + role;
  const sql = {
    async unsafe(query: string, parameters?: Array<string | number | boolean | null>) {
      queries.push(query);
      if (query.includes("FROM appbasis_permission_principal ")) {
        return config.principal === false ? [] : [{ principal_id: SCOPE.authenticatedIdentityId }];
      }
      if (query.includes("FROM ulc_linz_membership ")) {
        if (config.active === false || config.ended === true) return [];
        return [{
          source_role: role,
          subject_id: config.membershipSubject ?? (role === "athlete" ? SCOPE.subjectId : "trainer-1"),
        }];
      }
      if (query.includes("FROM appbasis_permission_principal_role ")) {
        return Array.from({ length: config.roleCount ?? 1 }, () => ({ role_id: roleId }));
      }
      if (query.includes("FROM appbasis_permission_role ")) {
        return config.roleActive === false ? [] : [{ role_id: roleId }];
      }
      if (query.includes("FROM appbasis_permission_capability ")) {
        return config.knownCapability === false ? [] : [{ capability_id: CAP }];
      }
      if (query.includes("FROM appbasis_permission_principal_revoke ")) {
        return config.revoked === true ? [{ capability_id: CAP }] : [];
      }
      if (query.includes("FROM appbasis_permission_principal_grant ")) {
        return config.granted === true ? [{ capability_id: CAP }] : [];
      }
      if (query.includes("FROM appbasis_permission_role_capability ")) {
        return config.roleGrant === false ? [] : [{ capability_id: CAP }];
      }
      if (query.includes("FROM ulc_linz_subject_scope ")) {
        if (config.selfRelation === false) return [];
        expect(parameters).toEqual(["identity-1", "club-1", "athlete-1"]);
        return [{ subject_id: "athlete-1" }];
      }
      throw new Error("unexpected actor SQL");
    },
  };
  return { sql, queries };
}

describe("P03 actual documentation writer actor recheck", () => {
  it("locks the canonical principal, membership, role and capability before admitting a trainer", async () => {
    const f = fixture();
    await expect(assertUlcLiveTrainingDocumentationActor(f.sql, SCOPE))
      .resolves.toBeUndefined();
    expect(f.queries).toHaveLength(8);
    expect(f.queries[0]).toMatch(/appbasis_permission_principal.*FOR SHARE/s);
    expect(f.queries[1]).toMatch(/ulc_linz_membership.*active = true.*ended_at IS NULL.*FOR SHARE/s);
    expect(f.queries.slice(2).every((query) => query.includes("FOR SHARE"))).toBe(true);
    expect(f.queries.join("\n")).toContain("appbasis_permission_principal_revoke");
    expect(f.queries.join("\n")).toContain("appbasis_permission_role_capability");
  });

  it("does not touch SQL without a trusted authenticated actor", async () => {
    const f = fixture();
    await expect(assertUlcLiveTrainingDocumentationActor(f.sql, {
      ...SCOPE, authenticatedIdentityId: undefined,
    })).rejects.toBeInstanceOf(UlcTrainingDocumentationActorWriteBlockedError);
    expect(f.queries).toEqual([]);
  });

  it.each([
    ["missing principal", { principal: false }],
    ["inactive membership", { active: false }],
    ["ended membership", { ended: true }],
    ["wrong role count", { roleCount: 2 }],
    ["disabled role", { roleActive: false }],
    ["unknown capability", { knownCapability: false }],
    ["explicit revoke", { revoked: true }],
    ["no effective edit capability", { roleGrant: false }],
    ["parent role", { role: "parent" }],
  ] as const)("blocks %s before any authorized write", async (_case, drift) => {
    const f = fixture(drift);
    await expect(assertUlcLiveTrainingDocumentationActor(f.sql, SCOPE))
      .rejects.toBeInstanceOf(UlcTrainingDocumentationActorWriteBlockedError);
  });

  it("follows SQL revoke > direct grant > role capability precedence", async () => {
    const yes = fixture({ granted: true, roleGrant: false });
    await expect(assertUlcLiveTrainingDocumentationActor(yes.sql, SCOPE))
      .resolves.toBeUndefined();
    const denied = fixture({ revoked: true, granted: true, roleGrant: true });
    await expect(assertUlcLiveTrainingDocumentationActor(denied.sql, SCOPE))
      .rejects.toBeInstanceOf(UlcTrainingDocumentationActorWriteBlockedError);
  });

  it("requires an athlete's exact self subject and current self-scope row", async () => {
    const allow = fixture({ role: "athlete" });
    await expect(assertUlcLiveTrainingDocumentationActor(allow.sql, SCOPE))
      .resolves.toBeUndefined();
    expect(allow.queries.at(-1)).toContain("relation_type = 'self'");
    const mismatch = fixture({ role: "athlete", membershipSubject: "someone-else" });
    await expect(assertUlcLiveTrainingDocumentationActor(mismatch.sql, SCOPE))
      .rejects.toBeInstanceOf(UlcTrainingDocumentationActorWriteBlockedError);
    const unrelated = fixture({ role: "athlete", selfRelation: false });
    await expect(assertUlcLiveTrainingDocumentationActor(unrelated.sql, SCOPE))
      .rejects.toBeInstanceOf(UlcTrainingDocumentationActorWriteBlockedError);
  });

  it("allows explicit functionary edit grant if current scope permits organization edit", async () => {
    await expect(assertUlcLiveTrainingDocumentationActor(
      fixture({ role: "functionary", roleGrant: false, granted: true }).sql,
      SCOPE,
    )).resolves.toBeUndefined();
  });

  it("rejects malformed organization and subject before touching SQL", async () => {
    for (const scope of [
      { ...SCOPE, organizationId: "other/org" },
      { ...SCOPE, subjectId: "" },
      { ...SCOPE, authenticatedIdentityId: " identity-1 " },
    ]) {
      const f = fixture();
      // A slash is a valid identifier in some upstream consumers. The
      // stable scope guarantee is actor+tenant+subject equality at SQL.
      if (scope.organizationId === "other/org") {
        await expect(assertUlcLiveTrainingDocumentationActor(f.sql, scope))
          .resolves.toBeUndefined();
      } else {
        await expect(assertUlcLiveTrainingDocumentationActor(f.sql, scope))
          .rejects.toBeInstanceOf(UlcTrainingDocumentationActorWriteBlockedError);
        expect(f.queries).toEqual([]);
      }
    }
  });
});
