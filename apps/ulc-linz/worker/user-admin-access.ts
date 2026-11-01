import {
  capabilityId,
  principalId,
  roleId,
  PrincipalPermissionAdministrationError,
  RoleAdministrationError,
  type PermissionStore,
  type PostgresPrincipalAccessAdministration,
} from "@appbasis/permissions";

import roleDataScope from "./role-data-scope.json";
import {
  ULC_USER_ACCESS_MODULES,
  ULC_PERMISSION_EDITABLE_BY_ROLE,
  permissionPresetsForRole,
  type UlcPermissionPreset,
  type UlcUserSourceRole,
  type UlcUserAccessChoice,
} from "./user-admin-permission-profiles";

export type { UlcUserAccessChoice } from "./user-admin-permission-profiles";

type SqlParameter = string | number | boolean | null;

export interface UlcUserAccessSql {
  unsafe(query: string, parameters?: SqlParameter[]): PromiseLike<readonly Record<string, unknown>[]>;
}

// Compatibility export: existing trainer modules remain unchanged.
export const ULC_TRAINER_ACCESS_MODULES = ULC_USER_ACCESS_MODULES;

export interface UlcUserAccessModule {
  readonly key: string;
  readonly label: string;
  readonly level: UlcUserAccessChoice;
  readonly editable: boolean;
}

export interface UlcUserAccessSnapshot {
  readonly userId: string;
  readonly username: string;
  readonly sourceRole: UlcUserSourceRole;
  readonly editable: boolean;
  readonly profiles: readonly UlcPermissionPreset[];
  readonly modules: readonly UlcUserAccessModule[];
  readonly expectedGrants: readonly string[];
  readonly expectedRevokes: readonly string[];
}

export class UlcUserAccessError extends Error {
  constructor(readonly code: "NOT_FOUND" | "DENIED" | "INVALID" | "STALE") {
    super("User module access " + code.toLowerCase() + ".");
    this.name = "UlcUserAccessError";
  }
}

type UserAccessAdministration = Pick<PostgresPrincipalAccessAdministration, "replacePrincipalAccess">;

export class UlcLinzTrainerUserAccessService {
  constructor(
    private readonly sql: UlcUserAccessSql,
    private readonly permissions: PermissionStore,
    private readonly administration: UserAccessAdministration,
  ) {}

  private async target(organizationId: string, userId: string) {
    if (!validIdentifier(organizationId) || !validIdentifier(userId)) {
      throw new UlcUserAccessError("INVALID");
    }
    const rows = await this.sql.unsafe(
      'SELECT membership.identity_id, membership.source_role, membership.active, account.username, account.role, ' +
      'COALESCE(account.banned, false) AS blocked ' +
      'FROM ulc_linz_membership AS membership ' +
      'JOIN "user" AS account ON account.id = membership.identity_id ' +
      'WHERE membership.organization_id = $1 AND membership.identity_id = $2',
      [organizationId, userId],
    );
    if (rows.length !== 1 || rows[0] === undefined) {
      throw new UlcUserAccessError("NOT_FOUND");
    }
    const row = rows[0];
    const sourceRole = row.source_role;
    if (sourceRole !== "admin" && sourceRole !== "trainer" &&
        sourceRole !== "athlete" && sourceRole !== "parent") {
      throw new UlcUserAccessError("DENIED");
    }
    const checkedRole = sourceRole as UlcUserSourceRole;
    if (!validIdentifier(row.username) || typeof row.active !== "boolean" ||
        typeof row.blocked !== "boolean") throw new UlcUserAccessError("INVALID");
    const technicalRoles = typeof row.role === "string" ? row.role.split(",").map(s => s.trim()) : [];
    if (sourceRole !== "admin" && technicalRoles.some(r => r === "admin" || r === "superadmin")) {
      throw new UlcUserAccessError("DENIED");
    }
    const principal = await this.permissions.findPrincipal(principalId(userId));
    const expectedRole = roleId(roleDataScope.runtimeRoleIds[checkedRole]);
    if (principal === null || principal.roleIds.length !== 1 ||
        principal.roleIds[0] !== expectedRole) {
      throw new UlcUserAccessError("DENIED");
    }
    const role = await this.permissions.findRole(expectedRole);
    if (role === null) throw new UlcUserAccessError("DENIED");
    const editable = sourceRole !== "admin" && row.active === true && row.blocked === false;
    return { username: row.username, principal, role, expectedRole, sourceRole: checkedRole, editable };
  }

  async read(organizationId: string, userId: string): Promise<UlcUserAccessSnapshot> {
    const found = await this.target(organizationId, userId);
    const roleCaps = new Set(found.role.capabilities.map(String));
    const grants = new Set(found.principal.grants.map(String));
    const revokes = new Set(found.principal.revokes.map(String));
    const effective = (id: string) => !revokes.has(id) && (grants.has(id) || roleCaps.has(id));
    return Object.freeze({
      userId,
      username: found.username,
      sourceRole: found.sourceRole,
      editable: found.editable,
      profiles: permissionPresetsForRole(found.sourceRole),
      modules: Object.freeze(ULC_TRAINER_ACCESS_MODULES.map((module) => {
        const view = effective(moduleCapability(module.key, "view"));
        const edit = effective(moduleCapability(module.key, "edit"));
        return Object.freeze({
          key: module.key,
          label: module.label,
          level: !view ? "none" : edit ? "edit" : "view",
          editable: found.editable &&
            ULC_PERMISSION_EDITABLE_BY_ROLE[found.sourceRole].includes(module.key),
        });
      })),
      expectedGrants: Object.freeze([...found.principal.grants].map(String).sort()),
      expectedRevokes: Object.freeze([...found.principal.revokes].map(String).sort()),
    });
  }

  async update(
    organizationId: string,
    actorPrincipalId: string,
    userId: string,
    input: {
      readonly modules: readonly { readonly key: string; readonly level: UlcUserAccessChoice }[];
      readonly expectedGrants: readonly string[];
      readonly expectedRevokes: readonly string[];
    },
  ): Promise<UlcUserAccessSnapshot> {
    if (!validIdentifier(actorPrincipalId) || !validModuleInput(input)) {
      throw new UlcUserAccessError("INVALID");
    }
    const found = await this.target(organizationId, userId);
    if (!found.editable || actorPrincipalId === userId) throw new UlcUserAccessError("DENIED");
    const currentGrants = [...found.principal.grants].map(String).sort();
    const currentRevokes = [...found.principal.revokes].map(String).sort();
    if (!equalSorted(currentGrants, input.expectedGrants) ||
        !equalSorted(currentRevokes, input.expectedRevokes)) {
      throw new UlcUserAccessError("STALE");
    }

    const editableModules = ULC_PERMISSION_EDITABLE_BY_ROLE[found.sourceRole];
    const managedCapabilities = new Set(
      ULC_TRAINER_ACCESS_MODULES.filter(module => editableModules.includes(module.key)).flatMap((module) => [
        moduleCapability(module.key, "view"),
        moduleCapability(module.key, "edit"),
      ]),
    );
    const grants = new Set(currentGrants.filter((id) => !managedCapabilities.has(id)));
    const revokes = new Set(currentRevokes.filter((id) => !managedCapabilities.has(id)));
    const defaults = new Set(found.role.capabilities.map(String));
    const existingGrants = new Set(currentGrants);
    const existingRevokes = new Set(currentRevokes);
    for (const choice of input.modules) {
      if (!editableModules.includes(choice.key)) {
        // Locked modules must be preserved; never mutate capabilities outside
        // the current principal's subject/organization authorization boundary.
        const view = moduleCapability(choice.key, "view");
        const edit = moduleCapability(choice.key, "edit");
        const canView = !existingRevokes.has(view) && (existingGrants.has(view) || defaults.has(view));
        const canEdit = !existingRevokes.has(edit) && (existingGrants.has(edit) || defaults.has(edit));
        const level = !canView ? "none" : canEdit ? "edit" : "view";
        if (choice.level !== level) throw new UlcUserAccessError("DENIED");
        continue;
      }
      const wantsView = choice.level !== "none";
      const wantsEdit = choice.level === "edit";
      for (const [action, wanted] of [["view", wantsView], ["edit", wantsEdit]] as const) {
        const key = moduleCapability(choice.key, action);
        if (wanted && !defaults.has(key)) grants.add(key);
        if (!wanted && defaults.has(key)) revokes.add(key);
      }
    }
    try {
      await this.administration.replacePrincipalAccess(
        principalId(userId),
        [found.expectedRole],
        {
          grants: [...grants].sort().map(capabilityId),
          revokes: [...revokes].sort().map(capabilityId),
        },
        {
          actorPrincipalId: principalId(actorPrincipalId),
          reason: "ULC Linz administrator changed bounded user module permissions",
        },
        {
          expectedRoleIds: found.principal.roleIds,
          expectedGrants: found.principal.grants,
          expectedRevokes: found.principal.revokes,
        },
      );
    } catch (error) {
      if ((error instanceof PrincipalPermissionAdministrationError &&
          error.code === "STALE_PRINCIPAL_PERMISSIONS") ||
          (error instanceof RoleAdministrationError &&
          error.code === "STALE_PRINCIPAL_ROLES")) {
        throw new UlcUserAccessError("STALE");
      }
      throw error;
    }
    return this.read(organizationId, userId);
  }
}

function moduleCapability(moduleKey: string, action: "view" | "edit"): string {
  return roleDataScope.principalPermissionMapping.capabilityNamespace +
    ":" + moduleKey + ":" + action;
}

function validIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 &&
    value.length <= 200 && value.trim() === value;
}

function equalSorted(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => b[index] === value);
}

function validModuleInput(value: unknown): value is {
  readonly modules: readonly { readonly key: string; readonly level: UlcUserAccessChoice }[];
  readonly expectedGrants: readonly string[];
  readonly expectedRevokes: readonly string[];
} {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  if (Object.keys(input).sort().join(",") !== "expectedGrants,expectedRevokes,modules") return false;
  const expected = new Set<string>(ULC_TRAINER_ACCESS_MODULES.map((m) => m.key));
  if (!Array.isArray(input.modules) || input.modules.length !== expected.size) return false;
  const seen = new Set<string>();
  for (const module of input.modules) {
    if (module === null || typeof module !== "object" || Array.isArray(module)) return false;
    const candidate = module as Record<string, unknown>;
    if (Object.keys(candidate).sort().join(",") !== "key,level" ||
        typeof candidate.key !== "string" || !expected.has(candidate.key) ||
        seen.has(candidate.key) || !["none", "view", "edit"].includes(String(candidate.level))) return false;
    seen.add(candidate.key);
  }
  for (const field of ["expectedGrants", "expectedRevokes"] as const) {
    const caps = input[field];
    if (!Array.isArray(caps) || caps.length > 100 || caps.some(x => !validIdentifier(x))) return false;
    if (new Set(caps).size !== caps.length || caps.some((x, i) => i > 0 && x < caps[i - 1])) return false;
  }
  return true;
}
