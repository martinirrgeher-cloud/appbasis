import { describe, expect, it } from "vitest";

import type { IdentityService, IdentityState } from "@appbasis/identity";
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

function disabledIdentity(identityId: string): IdentityState {
  const timestamp = new Date("2026-08-17T00:00:00.000Z");
  return {
    identityId,
    username: "ulc.user",
    displayName: "ULC User",
    contactEmail: null,
    personId: null,
    mustChangePassword: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    passwordChangedAt: timestamp,
    disabledAt: timestamp,
    accountStatus: "disabled",
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

  const identity: Pick<IdentityService, "disableIdentity"> = {
    async disableIdentity(identityId) {
      events.push("disable-identity");
      if (options.identityError !== undefined) throw options.identityError;
      return disabledIdentity(identityId);
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
      return { actorPrincipalId: ACTOR_PRINCIPAL_ID };
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
    const state = harness({ principal: current });

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

  it("blocks ULC administrators before any owner write while membership scope is unbound", async () => {
    const state = harness({
      principal: principal({ roleIds: ["ulc-linz:admin"], grants: [] }),
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

  it("fails closed on unknown roles or capability namespaces", async () => {
    for (const current of [
      principal({ roleIds: ["ulc-linz:future-role"], grants: [] }),
      principal({ roleIds: ["ulc-linz:trainer"], grants: ["other-app:member:edit"] }),
    ]) {
      const state = harness({ principal: current });
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
    }
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

  it("treats an absent or already-empty permission principal as already permission-quarantined", async () => {
    for (const current of [
      null,
      principal({ roleIds: [], grants: [], revokes: [] }),
    ]) {
      const state = harness({ principal: current });
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
