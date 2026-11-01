import { describe, expect, it } from "vitest";
import { capabilityId, InMemoryPermissionStore, principalId, roleId } from "@appbasis/permissions";
import {
  UlcLinzTrainerUserAccessService,
  ULC_TRAINER_ACCESS_MODULES,
} from "../worker/user-admin-access";
import {
  permissionPresetsForRole,
  ULC_PERMISSION_EDITABLE_BY_ROLE,
} from "../worker/user-admin-permission-profiles";

const ORG = "ulc-linz-preview";
const USER = "subject-user";
const ACTOR = "admin-actor";
const known = ULC_TRAINER_ACCESS_MODULES.flatMap(m => [
  capabilityId("ulc-linz:module:" + m.key + ":view"),
  capabilityId("ulc-linz:module:" + m.key + ":edit"),
]);
type SourceRole = "admin" | "trainer" | "athlete" | "parent";

function fixture(role: SourceRole, opts: {
  active?: boolean; blocked?: boolean; accountRole?: string; extraGrants?: string[];
} = {}) {
  const changes: unknown[] = [];
  const grants = (opts.extraGrants ?? []).map(capabilityId);
  const r = roleId("ulc-linz:" + role);
  const permissions = new InMemoryPermissionStore({
    knownCapabilities: known,
    roles: [{ roleId: r, capabilities: role === "admin" ? known : role === "trainer" ? [
      capabilityId("ulc-linz:module:kindertraining:view"),
      capabilityId("ulc-linz:module:kindertraining:edit"),
    ] : [capabilityId("ulc-linz:module:countdown:view")] }],
    principals: [{ principalId: principalId(USER), roleIds: [r], grants, revokes: [] }],
  });
  const queries: string[] = [];
  const service = new UlcLinzTrainerUserAccessService(
    { async unsafe(query, params) {
      queries.push(query);
      expect(params).toEqual([ORG, USER]);
      return [{
        identity_id: USER, username: "test.person", source_role: role,
        active: opts.active ?? true, blocked: opts.blocked ?? false,
        role: opts.accountRole ?? (role === "admin" ? "admin" : "user"),
      }];
    } },
    permissions,
    {
      async replacePrincipalAccess(target, roleIds, access, audit, constraints) {
        changes.push({ target, roleIds, access, audit, constraints });
        return { roleIds, grants: access.grants, revokes: access.revokes };
      },
    },
  );
  return { service, changes, queries };
}

describe("ULC org-scoped role permissions and functionary presets", () => {
  it("allows administrators to tailor modules without modifying their technical administrator role", async () => {
    const { service, changes } = fixture("admin");
    const access = await service.read(ORG, USER);
    expect(access.sourceRole).toBe("admin");
    expect(access.editable).toBe(true);
    expect(access.modules.every(m => m.editable)).toBe(true);
    expect(access.profiles.map(p => p.name)).toEqual(["Administrator"]);
    await service.update(ORG, USER, USER, {
      modules: access.modules.map(m => ({ key: m.key, level: "none" as const })),
      expectedGrants: access.expectedGrants,
      expectedRevokes: access.expectedRevokes,
    });
    expect(changes).toHaveLength(1);
    const change = changes[0] as { roleIds: readonly string[]; access: { revokes: readonly string[] } };
    expect(change.roleIds).toEqual(["ulc-linz:admin"]);
    expect(change.access.revokes).toContain("ulc-linz:module:kindertraining:view");
  });

  it("exposes individual athlete module rights but rejects organization-wide capability grants", async () => {
    const { service, changes } = fixture("athlete");
    const snapshot = await service.read(ORG, USER);
    expect(snapshot.editable).toBe(true);
    expect(snapshot.sourceRole).toBe("athlete");
    expect(snapshot.modules.find(m => m.key === "athletes")?.editable).toBe(false);
    expect(snapshot.modules.find(m => m.key === "training_planning")?.editable).toBe(false);
    expect(snapshot.modules.find(m => m.key === "countdown")?.editable).toBe(true);
    const denied = snapshot.modules.map(m => ({
      key: m.key, level: m.key === "athletes" ? "edit" as const : m.level,
    }));
    await expect(service.update(ORG, ACTOR, USER, {
      modules: denied, expectedGrants: snapshot.expectedGrants,
      expectedRevokes: snapshot.expectedRevokes,
    })).rejects.toMatchObject({ code: "DENIED" });
    expect(changes).toHaveLength(0);
    const allowed = snapshot.modules.map(m => ({
      key: m.key, level: m.key === "countdown" ? "edit" as const : m.level,
    }));
    await service.update(ORG, ACTOR, USER, {
      modules: allowed, expectedGrants: snapshot.expectedGrants,
      expectedRevokes: snapshot.expectedRevokes,
    });
    expect(JSON.stringify(changes)).toContain("ulc-linz:module:countdown:edit");
    expect(JSON.stringify(changes)).not.toContain("ulc-linz:module:athletes:edit");
    expect(JSON.stringify(changes)).not.toContain("ulc-linz:admin");
  });

  it("parent permissions remain subject scoped and hidden organization grants survive edits", async () => {
    const extraGrants = ["ulc-linz:module:athletes:view"];
    const { service, changes } = fixture("parent", { extraGrants });
    const snapshot = await service.read(ORG, USER);
    expect(snapshot.modules.find(m => m.key === "athletes")?.level).toBe("view");
    expect(snapshot.modules.find(m => m.key === "athletes")?.editable).toBe(false);
    expect(snapshot.profiles.map(p => p.name)).toEqual(["Eltern"]);
    await service.update(ORG, ACTOR, USER, {
      modules: snapshot.modules.map(m => ({
        key: m.key, level: m.key === "countdown" ? "edit" as const : m.level,
      })),
      expectedGrants: snapshot.expectedGrants, expectedRevokes: snapshot.expectedRevokes,
    });
    expect(JSON.stringify(changes)).toContain("ulc-linz:module:athletes:view");
    expect(JSON.stringify(changes)).not.toContain("ulc-linz:module:athletes:edit");
  });

  it("inactive and blocked users can inspect rights but cannot change them", async () => {
    for (const status of [{ active: false }, { blocked: true }]) {
      const { service, changes } = fixture("trainer", status);
      const snapshot = await service.read(ORG, USER);
      expect(snapshot.editable).toBe(false);
      expect(snapshot.modules.every(m => !m.editable)).toBe(true);
      await expect(service.update(ORG, ACTOR, USER, {
        modules: snapshot.modules.map(m => ({ key: m.key, level: m.level })),
        expectedGrants: snapshot.expectedGrants, expectedRevokes: snapshot.expectedRevokes,
      })).rejects.toMatchObject({ code: "DENIED" });
      expect(changes).toHaveLength(0);
    }
  });

  it("functionary is a reusable bounded profile without technical admin elevation", async () => {
    const profiles = permissionPresetsForRole("trainer");
    expect(profiles.map(p => p.name)).toEqual(["Kindertrainer", "Leistungstrainer", "Funktionär"]);
    const functionary = profiles.find(p => p.id === "funktionaer")!;
    expect(functionary.sourceRole).toBe("trainer");
    expect(functionary.modules.every(m => m.level !== "edit")).toBe(true);
    expect(functionary.modules.find(m => m.key === "athletes")?.level).toBe("view");
    expect(ULC_PERMISSION_EDITABLE_BY_ROLE.admin).toContain("athletes");
    expect(permissionPresetsForRole("admin").map(p => p.id)).toEqual(["administrator"]);
    const { service, changes } = fixture("trainer");
    const snapshot = await service.read(ORG, USER);
    await service.update(ORG, ACTOR, USER, {
      modules: functionary.modules,
      expectedGrants: snapshot.expectedGrants, expectedRevokes: snapshot.expectedRevokes,
    });
    const audit = JSON.stringify(changes);
    expect(audit).not.toContain("ulc-linz:admin");
    expect(audit).toContain("ULC Linz administrator changed bounded user module permissions");
  });

  it("non-admin technical role mismatch is rejected even for an active athlete", async () => {
    const { service, changes } = fixture("athlete", { accountRole: "user,admin" });
    await expect(service.read(ORG, USER)).rejects.toMatchObject({ code: "DENIED" });
    expect(changes).toHaveLength(0);
  });
});
