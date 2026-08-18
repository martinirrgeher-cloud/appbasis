import { describe, expect, it } from "vitest";

import {
  capabilityId,
  principalId,
  roleId,
  type PermissionStore,
  type PrincipalPermissions,
  type PostgresPrincipalAccessAdministration,
} from "@appbasis/permissions";

import {
  quarantineUlcLinzIdentityBeforeDeletion,
  UlcLinzLifecycleBlockedError,
  type UlcLinzIdentityLifecycleOwner,
  type UlcLinzPreDeleteQuarantineDependencies,
} from "../worker/lifecycle";

const TARGET_IDENTITY_ID = "identity-1";
const ACTOR_PRINCIPAL_ID = principalId("identity-admin");

type ReplaceAccessArgs = Parameters<
  PostgresPrincipalAccessAdministration["replacePrincipalAccess"]
>;

type HarnessOptions = {
  principal?: PrincipalPermissions | null;
  authorizationError?: Error;
  permissionError?: Error;
  identityError?: Error;
  targetSourceRole?: string;
};

function principal(input: {
  roleIds?: string[];
  grants?: string[];
  revokes?: string[];
  principalIdValue?: string;
} = {}): PrincipalPermissions {
  return {
    principalId: principalId(input.principalIdValue ?? TARGET_IDENTITY_ID),
    roleIds: (input.roleIds ?? ["ulc-linz:trainer"]).map(roleId),
    grants: (input.grants ?? ["ulc-linz:module:kindertraining:view"]).map(capabilityId),
    revokes: (input.revokes ?? []).map(capabilityId),
  };
}

function harness(options: HarnessOptions = {}) {
  const events: string[] = [];
  let replaceArgs: ReplaceAccessArgs | null = null;
  const permissionStore: PermissionStore = {
    async findPrincipal() {
      events.push("find-principal");
      return options.principal === undefined ? principal() : options.principal;
    },
    async findRole() {
      return null;
    },
    async isKnownCapability() {
      return false;
    },
  };

  const identity: UlcLinzIdentityLifecycleOwner = {
    async disableIdentity(identityId) {
      events.push("disable-identity");
      if (options.identityError !== undefined) throw options.identityError;
      return { identityId, accountStatus: "disabled" };
    },
  };

  const accessAdministration: Pick<
    PostgresPrincipalAccessAdministration,
    "replacePrincipalAccess"
  > = {
    async replacePrincipalAccess(...args: ReplaceAccessArgs) {
      events.push("replace-access");
      replaceArgs = args;
      if (options.permissionError !== undefined) throw options.permissionError;
      return Object.freeze({
        roleIds: Object.freeze([...args[1]]),
        grants: Object.freeze([...args[2].grants]),
        revokes: Object.freeze([...args[2].revokes]),
      });
    },
  };

  const dependencies: UlcLinzPreDeleteQuarantineDependencies = {
    identity,
    permissions: permissionStore,
    accessAdministration,
    async authorizeLifecycleWrite({ targetIdentityId }) {
      events.push(`authorize:${targetIdentityId}`);
      if (options.authorizationError !== undefined) {
        throw options.authorizationError;
      }
      return {
        actorPrincipalId: ACTOR_PRINCIPAL_ID,
        targetSourceRole: options.targetSourceRole ?? "trainer",
      };
    },
  };

  return {
    dependencies,
    events,
    get replaceArgs() {
      return replaceArgs;
    },
  };
}

async function expectBlocked(
  run: () => Promise<unknown>,
  code: UlcLinzLifecycleBlockedError["code"],
) {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(UlcLinzLifecycleBlockedError);
    expect((error as UlcLinzLifecycleBlockedError).code).toBe(code);
    return;
  }
  throw new Error("Expected lifecycle write to be blocked.");
}

describe("ULC Linz M5-C/D pre-delete access quarantine", () => {
  it("removes known non-admin access with optimistic constraints before disabling the identity", async () => {
    const current = principal({
      roleIds: ["ulc-linz:trainer"],
      grants: ["ulc-linz:module:kindertraining:view"],
      revokes: ["ulc-linz:module:kindertraining:edit"],
    });
    const state = harness({ principal: current, targetSourceRole: "trainer" });

    await expect(
      quarantineUlcLinzIdentityBeforeDeletion(
        state.dependencies,
        TARGET_IDENTITY_ID,
      ),
    ).resolves.toEqual({
      identityId: TARGET_IDENTITY_ID,
      permissionsChanged: true,
      identityDisabled: true,
    });

    expect(state.events).toEqual([
      `authorize:${TARGET_IDENTITY_ID}`,
      "find-principal",
      "replace-access",
      "disable-identity",
    ]);
    expect(state.replaceArgs).not.toBeNull();
    const args = state.replaceArgs;
    if (args === null) throw new Error("Expected access replacement.");
    expect(args[0]).toBe(principalId(TARGET_IDENTITY_ID));
    expect(args[1]).toEqual([]);
    expect(args[2]).toEqual({ grants: [], revokes: [] });
    expect(args[3]).toEqual({
      actorPrincipalId: ACTOR_PRINCIPAL_ID,
      reason: "ULC Linz pre-delete access quarantine",
    });
    expect(args[4]).toEqual({
      expectedRoleIds: current.roleIds,
      expectedGrants: current.grants,
      expectedRevokes: current.revokes,
    });
  });

  it("blocks an authoritative admin role before reading or writing owner state", async () => {
    const state = harness({
      principal: null,
      targetSourceRole: "admin",
    });

    await expectBlocked(
      () =>
        quarantineUlcLinzIdentityBeforeDeletion(
          state.dependencies,
          TARGET_IDENTITY_ID,
        ),
      "ADMIN_LIFECYCLE_SCOPE_UNBOUND",
    );
    expect(state.events).toEqual([`authorize:${TARGET_IDENTITY_ID}`]);
  });

  it("blocks an admin permission principal even if lifecycle authorization claims a non-admin role", async () => {
    const state = harness({
      principal: principal({ roleIds: ["ulc-linz:admin"], grants: [] }),
      targetSourceRole: "trainer",
    });

    await expectBlocked(
      () =>
        quarantineUlcLinzIdentityBeforeDeletion(
          state.dependencies,
          TARGET_IDENTITY_ID,
        ),
      "ADMIN_LIFECYCLE_SCOPE_UNBOUND",
    );
    expect(state.events).toEqual([
      `authorize:${TARGET_IDENTITY_ID}`,
      "find-principal",
    ]);
  });

  it("fails closed when permission role and authoritative source role disagree", async () => {
    const state = harness({
      principal: principal({ roleIds: ["ulc-linz:trainer"], grants: [] }),
      targetSourceRole: "athlete",
    });

    await expectBlocked(
      () =>
        quarantineUlcLinzIdentityBeforeDeletion(
          state.dependencies,
          TARGET_IDENTITY_ID,
        ),
      "UNKNOWN_PERMISSION_STATE",
    );
    expect(state.events).toEqual([
      `authorize:${TARGET_IDENTITY_ID}`,
      "find-principal",
    ]);
  });

  it("fails closed when the permission store returns a different principal", async () => {
    const state = harness({
      principal: principal({ principalIdValue: "identity-2" }),
    });

    await expectBlocked(
      () =>
        quarantineUlcLinzIdentityBeforeDeletion(
          state.dependencies,
          TARGET_IDENTITY_ID,
        ),
      "UNKNOWN_PERMISSION_STATE",
    );
    expect(state.events).toEqual([
      `authorize:${TARGET_IDENTITY_ID}`,
      "find-principal",
    ]);
  });

  it("fails closed on unknown source roles or capability namespaces", async () => {
    const unknownRole = harness({ targetSourceRole: "future-role" });
    await expectBlocked(
      () =>
        quarantineUlcLinzIdentityBeforeDeletion(
          unknownRole.dependencies,
          TARGET_IDENTITY_ID,
        ),
      "UNKNOWN_PERMISSION_STATE",
    );
    expect(unknownRole.events).toEqual([`authorize:${TARGET_IDENTITY_ID}`]);

    const unknownCapability = harness({
      principal: principal({
        roleIds: ["ulc-linz:trainer"],
        grants: ["other-app:member:edit"],
      }),
    });
    await expectBlocked(
      () =>
        quarantineUlcLinzIdentityBeforeDeletion(
          unknownCapability.dependencies,
          TARGET_IDENTITY_ID,
        ),
      "UNKNOWN_PERMISSION_STATE",
    );
    expect(unknownCapability.events).toEqual([
      `authorize:${TARGET_IDENTITY_ID}`,
      "find-principal",
    ]);
  });

  it("requires lifecycle authorization before reading or writing owner state", async () => {
    const state = harness({ authorizationError: new Error("denied") });

    await expect(
      quarantineUlcLinzIdentityBeforeDeletion(
        state.dependencies,
        TARGET_IDENTITY_ID,
      ),
    ).rejects.toThrow("denied");
    expect(state.events).toEqual([`authorize:${TARGET_IDENTITY_ID}`]);
  });

  it("does not disable the identity when permission quarantine fails", async () => {
    const state = harness({ permissionError: new Error("stale access") });

    await expect(
      quarantineUlcLinzIdentityBeforeDeletion(
        state.dependencies,
        TARGET_IDENTITY_ID,
      ),
    ).rejects.toThrow("stale access");
    expect(state.events).toEqual([
      `authorize:${TARGET_IDENTITY_ID}`,
      "find-principal",
      "replace-access",
    ]);
  });

  it("leaves permission access removed if the later identity-owner write fails", async () => {
    const state = harness({ identityError: new Error("identity owner unavailable") });

    await expect(
      quarantineUlcLinzIdentityBeforeDeletion(
        state.dependencies,
        TARGET_IDENTITY_ID,
      ),
    ).rejects.toThrow("identity owner unavailable");
    expect(state.events).toEqual([
      `authorize:${TARGET_IDENTITY_ID}`,
      "find-principal",
      "replace-access",
      "disable-identity",
    ]);
    expect(state.replaceArgs).not.toBeNull();
  });

  it("safely retries after permission quarantine only with renewed non-admin role proof", async () => {
    for (const current of [
      null,
      principal({ roleIds: [], grants: [], revokes: [] }),
    ]) {
      const state = harness({
        principal: current,
        targetSourceRole: "trainer",
      });
      await expect(
        quarantineUlcLinzIdentityBeforeDeletion(
          state.dependencies,
          TARGET_IDENTITY_ID,
        ),
      ).resolves.toEqual({
        identityId: TARGET_IDENTITY_ID,
        permissionsChanged: false,
        identityDisabled: true,
      });
      expect(state.events).toEqual([
        `authorize:${TARGET_IDENTITY_ID}`,
        "find-principal",
        "disable-identity",
      ]);
      expect(state.replaceArgs).toBeNull();
    }
  });
});
