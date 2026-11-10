import { describe, expect, it } from "vitest";
import {
  capabilityId, InMemoryPermissionStore, principalId, roleId,
} from "@appbasis/permissions";
import { UlcLinzTrainerUserAccessService, ULC_TRAINER_ACCESS_MODULES } from "../worker/user-admin-access";
import {
  ULC_PERMISSION_EDITABLE_BY_ROLE, permissionPresetsForRole,
  type UlcUserSourceRole,
} from "../worker/user-admin-permission-profiles";

const ORG = "ulc-linz-preview";
const USER = "fixture-identity";
const moduleCaps = ULC_TRAINER_ACCESS_MODULES.flatMap(module => [
  capabilityId("ulc-linz:module:" + module.key + ":view"),
  capabilityId("ulc-linz:module:" + module.key + ":edit"),
]);
type Scenario = {
  sourceRole?: string;
  principalRole?: string;
  accountRole?: string;
  active?: boolean;
  blocked?: boolean;
  membershipCount?: number;
  principalPresent?: boolean;
  rolePresent?: boolean;
};
function scenario(options: Scenario = {}) {
  const sourceRole = options.sourceRole ?? "trainer";
  const principalRole = options.principalRole ?? sourceRole;
  const runtimeRole = "ulc-linz:" + principalRole;
  let writes = 0;
  let sqlReads = 0;
  const sql = {
    async unsafe(query: string, parameters?: (string | number | boolean | null)[]) {
      sqlReads++;
      expect(query).toContain("membership.organization_id = $1");
      expect(query).toContain("membership.identity_id = $2");
      expect(parameters).toEqual([ORG, USER]);
      return Array.from({ length: options.membershipCount ?? 1 }, () => ({
        identity_id: USER, source_role: sourceRole,
        username: "fixture.user", role: options.accountRole ?? "user",
        active: options.active ?? true, blocked: options.blocked ?? false,
      }));
    },
  };
  const permissions = new InMemoryPermissionStore({
    knownCapabilities: moduleCaps,
    roles: options.rolePresent === false ? [] : [{
      roleId: roleId(runtimeRole), capabilities: [],
    }],
    principals: options.principalPresent === false ? [] : [{
      principalId: principalId(USER), roleIds: [roleId(runtimeRole)],
      grants: [], revokes: [],
    }],
  });
  const service = new UlcLinzTrainerUserAccessService(sql, permissions, {
    async replacePrincipalAccess() {
      writes++;
      throw new Error("unexpected write");
    },
  });
  return { service, writes: () => writes, sqlReads: () => sqlReads };
}

describe("ULC N03 membership and principal readiness (no DB writes)", () => {
  it.each(["admin", "trainer", "athlete", "parent", "functionary"] as UlcUserSourceRole[])(
    "reads matching %s role, bounded modules and matching presets", async sourceRole => {
      const { service, writes, sqlReads } = scenario({ sourceRole });
      const snapshot = await service.read(ORG, USER);
      expect(snapshot.sourceRole).toBe(sourceRole);
      expect(snapshot.modules.map(m => m.key)).toEqual(ULC_TRAINER_ACCESS_MODULES.map(m => m.key));
      expect(snapshot.profiles).toEqual(permissionPresetsForRole(sourceRole));
      expect(snapshot.modules.filter(m => m.editable).map(m => m.key))
        .toEqual(ULC_TRAINER_ACCESS_MODULES.filter(m =>
          ULC_PERMISSION_EDITABLE_BY_ROLE[sourceRole].includes(m.key)).map(m => m.key));
      expect(snapshot.expectedGrants).toEqual([]);
      expect(snapshot.expectedRevokes).toEqual([]);
      expect(sqlReads()).toBe(1);
      expect(writes()).toBe(0);
    },
  );

  it.each(["admin", "trainer", "athlete", "parent", "functionary"] as UlcUserSourceRole[])(
    "keeps inactive/blocked %s visible but read-only", async sourceRole => {
      for (const options of [{ active: false }, { blocked: true }]) {
        const { service, writes } = scenario({ sourceRole, ...options });
        const snapshot = await service.read(ORG, USER);
        expect(snapshot.editable).toBe(false);
        expect(snapshot.modules.every(m => !m.editable)).toBe(true);
        expect(writes()).toBe(0);
      }
    },
  );

  it.each([
    [{ membershipCount: 0 }, "NOT_FOUND"],
    [{ membershipCount: 2 }, "NOT_FOUND"],
    [{ sourceRole: "unknown" }, "DENIED"],
    [{ sourceRole: "trainer", principalRole: "functionary" }, "DENIED"],
    [{ sourceRole: "functionary", principalRole: "admin" }, "DENIED"],
    [{ sourceRole: "functionary", accountRole: "admin" }, "DENIED"],
    [{ sourceRole: "trainer", accountRole: "superadmin" }, "DENIED"],
    [{ principalPresent: false }, "DENIED"],
    [{ rolePresent: false }, "DENIED"],
  ] as const)("fails closed for inconsistent identity %j (%s)", async (options, code) => {
    const { service, writes } = scenario(options);
    await expect(service.read(ORG, USER)).rejects.toMatchObject({ code });
    expect(writes()).toBe(0);
  });

  it("never silently provisions a missing principal during a permission update", async () => {
    const { service, writes } = scenario({ sourceRole: "functionary", principalPresent: false });
    await expect(service.update(ORG, "actor-admin", USER, {
      modules: ULC_TRAINER_ACCESS_MODULES.map(m => ({ key: m.key, level: "none" as const })),
      expectedGrants: [], expectedRevokes: [],
    })).rejects.toMatchObject({ code: "DENIED" });
    expect(writes()).toBe(0);
  });

  it.each(["admin", "trainer", "athlete", "parent", "functionary"] as UlcUserSourceRole[])(
    "rejects permission writes to inactive and blocked %s accounts", async sourceRole => {
      for (const state of [{ active: false }, { blocked: true }]) {
        const { service, writes } = scenario({ sourceRole, ...state });
        const snapshot = await service.read(ORG, USER);
        await expect(service.update(ORG, "actor-admin", USER, {
          modules: snapshot.modules.map(module => ({ key: module.key, level: module.level })),
          expectedGrants: snapshot.expectedGrants,
          expectedRevokes: snapshot.expectedRevokes,
        })).rejects.toMatchObject({ code: "DENIED" });
        expect(writes()).toBe(0);
      }
    },
  );

  it.each(["trainer", "athlete", "parent", "functionary"] as UlcUserSourceRole[])(
    "rejects non-admin %s self-elevation even with unchanged module rights", async sourceRole => {
      const { service, writes } = scenario({ sourceRole });
      const snapshot = await service.read(ORG, USER);
      await expect(service.update(ORG, USER, USER, {
        modules: snapshot.modules.map(module => ({ key: module.key, level: module.level })),
        expectedGrants: snapshot.expectedGrants,
        expectedRevokes: snapshot.expectedRevokes,
      })).rejects.toMatchObject({ code: "DENIED" });
      expect(writes()).toBe(0);
    },
  );

  it.each(["trainer", "athlete", "parent", "functionary"] as UlcUserSourceRole[])(
    "rejects changes to modules outside the %s authorization boundary", async sourceRole => {
      const { service, writes } = scenario({ sourceRole });
      const snapshot = await service.read(ORG, USER);
      const locked = snapshot.modules.find(module => !module.editable);
      if (!locked) {
        expect(sourceRole).toBe("trainer");
        return;
      }
      await expect(service.update(ORG, "actor-admin", USER, {
        modules: snapshot.modules.map(module => ({
          key: module.key,
          level: module.key === locked.key ? "edit" as const : module.level,
        })),
        expectedGrants: snapshot.expectedGrants,
        expectedRevokes: snapshot.expectedRevokes,
      })).rejects.toMatchObject({ code: "DENIED" });
      expect(writes()).toBe(0);
    },
  );
});
