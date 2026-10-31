import { describe, expect, it } from "vitest";
import {
  capabilityId,
  InMemoryPermissionStore,
  roleId,
  principalId,
} from "@appbasis/permissions";
import {
  UlcLinzTrainerUserAccessService,
  UlcUserAccessError,
  ULC_TRAINER_ACCESS_MODULES,
} from "../worker/user-admin-access";

const USER = "trainer-user";
const ORG = "ulc-linz-preview";
const ROLE = "ulc-linz:trainer";
const known = ULC_TRAINER_ACCESS_MODULES.flatMap(module => [
  capabilityId("ulc-linz:module:" + module.key + ":view"),
  capabilityId("ulc-linz:module:" + module.key + ":edit"),
]);

function setup(
  sourceRole = "trainer",
  grants: string[] = [],
  revokes: string[] = [],
) {
  let changed: unknown = null;
  let sqlCalls = 0;
  const sql = {
    async unsafe(query: string, parameters?: (string | number | boolean | null)[]) {
      sqlCalls++;
      expect(query).toContain("membership.organization_id = $1");
      expect(parameters).toEqual([ORG, USER]);
      return [{
        identity_id: USER,
        username: "test.trainer",
        source_role: sourceRole,
        active: true,
        blocked: false,
      }];
    },
  };
  const permissions = new InMemoryPermissionStore({
    knownCapabilities: known,
    roles: [{
      roleId: roleId(ROLE),
      capabilities: [capabilityId("ulc-linz:module:kindertraining:view"),
        capabilityId("ulc-linz:module:kindertraining:edit")],
    }],
    principals: [{
      principalId: principalId(USER),
      roleIds: [roleId(ROLE)],
      grants: grants.map(capabilityId),
      revokes: revokes.map(capabilityId),
    }],
  });
  const service = new UlcLinzTrainerUserAccessService(
    sql,
    permissions,
    {
      async replacePrincipalAccess(targetPrincipal, roleIds, overrides, audit, constraints) {
        changed = { targetPrincipal, roleIds, overrides, audit, constraints };
        return { roleIds, grants: overrides.grants, revokes: overrides.revokes };
      },
    },
  );
  return { service, getChanged: () => changed, getSqlCalls: () => sqlCalls };
}
function choices(defaultLevel: "none" | "view" | "edit" = "none") {
  return ULC_TRAINER_ACCESS_MODULES.map(module => ({
    key: module.key,
    level: module.key === "countdown" ? "edit" as const : defaultLevel,
  }));
}

describe("ULC trainer module access", () => {
  it("lists effective trainer permissions and never elevates role", async () => {
    const { service } = setup();
    const snapshot = await service.read(ORG, USER);
    expect(snapshot.modules.find(module => module.key === "kindertraining")?.level).toBe("edit");
    expect(snapshot.modules.find(module => module.key === "countdown")?.level).toBe("none");
    expect(snapshot.expectedGrants).toEqual([]);
  });

  it("replaces only known module overrides, preserves trainer role and audits the actor", async () => {
    const { service, getChanged } = setup();
    const current = await service.read(ORG, USER);
    await service.update(ORG, "actor-admin", USER, {
      modules: choices(),
      expectedGrants: current.expectedGrants,
      expectedRevokes: current.expectedRevokes,
    });
    const change = getChanged() as {
      roleIds: readonly string[];
      overrides: { grants: readonly string[]; revokes: readonly string[] };
      audit: { actorPrincipalId: string };
      constraints: { expectedRoleIds: readonly string[] };
    };
    expect(change.roleIds).toEqual([ROLE]);
    expect(change.constraints.expectedRoleIds).toEqual([ROLE]);
    expect(change.audit.actorPrincipalId).toBe("actor-admin");
    expect(change.overrides.grants).toContain("ulc-linz:module:countdown:view");
    expect(change.overrides.grants).toContain("ulc-linz:module:countdown:edit");
    expect(change.overrides.revokes).toContain("ulc-linz:module:kindertraining:view");
    expect(change.overrides.revokes).toContain("ulc-linz:module:kindertraining:edit");
  });

  it("blocks role escalation and cross-org identifiers", async () => {
    const { service, getChanged } = setup("admin");
    await expect(service.read(ORG, USER)).rejects.toMatchObject({ code: "DENIED" });
    await expect(service.read("bad organization ", USER)).rejects.toMatchObject({ code: "INVALID" });
    expect(getChanged()).toBeNull();
  });

  it("rejects incomplete or invented module rights before any writes", async () => {
    const { service, getChanged } = setup();
    const current = await service.read(ORG, USER);
    await expect(service.update(ORG, "actor-admin", USER, {
      modules: [{ key: "user_management", level: "edit" }],
      expectedGrants: current.expectedGrants,
      expectedRevokes: current.expectedRevokes,
    })).rejects.toBeInstanceOf(UlcUserAccessError);
    expect(getChanged()).toBeNull();
  });

  it("rejects stale edits before mutating the principal", async () => {
    const { service, getChanged } = setup();
    await expect(service.update(ORG, "actor-admin", USER, {
      modules: choices(),
      expectedGrants: ["ulc-linz:module:countdown:edit"],
      expectedRevokes: [],
    })).rejects.toMatchObject({ code: "STALE" });
    expect(getChanged()).toBeNull();
  });
});
