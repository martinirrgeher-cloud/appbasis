import { describe, expect, it } from "vitest";

import {
  capabilityId,
  principalId,
  roleId,
  type PermissionStore,
  type PrincipalPermissions,
} from "@appbasis/permissions";

import {
  deleteUlcLinzIdentity,
  UlcLinzLifecycleBlockedError,
  type UlcLinzDeletionDependencies,
} from "../worker/lifecycle";

const TARGET_IDENTITY_ID = "identity-delete-target";
const ACTOR_PRINCIPAL_ID = principalId("identity-delete-admin");

function activePrincipal(): PrincipalPermissions {
  return {
    principalId: principalId(TARGET_IDENTITY_ID),
    roleIds: [roleId("ulc-linz:trainer")],
    grants: [capabilityId("ulc-linz:module:kindertraining:view")],
    revokes: [capabilityId("ulc-linz:module:kindertraining:edit")],
  };
}

function emptyPrincipal(): PrincipalPermissions {
  return {
    principalId: principalId(TARGET_IDENTITY_ID),
    roleIds: [],
    grants: [],
    revokes: [],
  };
}

type DeleteHarnessOptions = {
  authorizationError?: Error;
  completed?: boolean;
  targetSourceRole?: string;
  identityDeleteErrorOnce?: Error;
  principalDeleteErrorOnce?: Error;
  remainingPrincipalOnCompletedReplay?: boolean;
  initialPrincipalAbsent?: boolean;
  initialPrincipalEmpty?: boolean;
};

function deleteHarness(options: DeleteHarnessOptions = {}) {
  const events: string[] = [];
  let currentPrincipal: PrincipalPermissions | null =
    options.initialPrincipalAbsent === true
      ? null
      : options.initialPrincipalEmpty === true
        ? emptyPrincipal()
        : activePrincipal();
  let identityDisabled = false;
  let principalDeleted = false;
  let identityDeletionCompleted = options.completed === true;
  let identityDeleteFailed = false;
  let principalDeleteFailed = false;
  const initiallyCompleted = options.completed === true;

  const permissions: PermissionStore = {
    async findPrincipal() {
      events.push("find-principal");
      return currentPrincipal;
    },
    async findRole() {
      return null;
    },
    async isKnownCapability() {
      return false;
    },
  };

  const dependencies: UlcLinzDeletionDependencies = {
    permissions,
    accessAdministration: {
      async replacePrincipalAccess(requestedPrincipalId) {
        events.push("replace-access");
        currentPrincipal = {
          principalId: requestedPrincipalId,
          roleIds: [],
          grants: [],
          revokes: [],
        };
        return Object.freeze({ roleIds: [], grants: [], revokes: [] });
      },
    },
    identity: {
      async disableIdentity() {
        events.push("disable-identity");
        identityDisabled = true;
        return { accountStatus: "disabled" };
      },
    },
    identityDeletion: {
      async isDeletionCompleted() {
        events.push("deletion-completed");
        if (
          initiallyCompleted &&
          !options.remainingPrincipalOnCompletedReplay
        ) {
          currentPrincipal = null;
        }
        return identityDeletionCompleted;
      },
      async deleteDisabledIdentity(identityId) {
        events.push("delete-identity");
        if (
          options.identityDeleteErrorOnce !== undefined &&
          !identityDeleteFailed
        ) {
          identityDeleteFailed = true;
          throw options.identityDeleteErrorOnce;
        }
        if (!identityDisabled) throw new Error("identity must be disabled first");
        identityDeletionCompleted = true;
        return { identityId, alreadyDeleted: false };
      },
    },
    principalLifecycle: {
      async deleteQuarantinedPrincipal() {
        events.push("delete-principal");
        if (
          options.principalDeleteErrorOnce !== undefined &&
          !principalDeleteFailed
        ) {
          principalDeleteFailed = true;
          throw options.principalDeleteErrorOnce;
        }
        if (currentPrincipal !== null) {
          if (
            currentPrincipal.roleIds.length !== 0 ||
            currentPrincipal.grants.length !== 0 ||
            currentPrincipal.revokes.length !== 0
          ) {
            throw new Error("principal not quarantined");
          }
          currentPrincipal = null;
          principalDeleted = true;
          return true;
        }
        return false;
      },
    },
    async authorizeLifecycleWrite({ targetIdentityId }) {
      events.push(`authorize:${targetIdentityId}`);
      if (options.authorizationError !== undefined) throw options.authorizationError;
      return {
        actorPrincipalId: ACTOR_PRINCIPAL_ID,
        targetSourceRole: options.targetSourceRole ?? "trainer",
      };
    },
  };

  return {
    dependencies,
    events,
    get identityDisabled() {
      return identityDisabled;
    },
    get identityDeletionCompleted() {
      return identityDeletionCompleted;
    },
    get principalDeleted() {
      return principalDeleted;
    },
    get currentPrincipal() {
      return currentPrincipal;
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

describe("ULC Linz M5-C destructive deletion orchestration", () => {
  it("authorizes before owner reads and cleans the principal only after identity deletion", async () => {
    const state = deleteHarness();

    await expect(
      deleteUlcLinzIdentity(state.dependencies, TARGET_IDENTITY_ID),
    ).resolves.toEqual({
      identityId: TARGET_IDENTITY_ID,
      permissionsChanged: true,
      permissionPrincipalDeleted: true,
      identityDeleted: true,
      alreadyDeleted: false,
    });

    expect(state.events).toEqual([
      `authorize:${TARGET_IDENTITY_ID}`,
      "deletion-completed",
      "find-principal",
      "replace-access",
      "disable-identity",
      "delete-identity",
      "delete-principal",
    ]);
    expect(state.identityDisabled).toBe(true);
    expect(state.identityDeletionCompleted).toBe(true);
    expect(state.principalDeleted).toBe(true);
  });

  it("forces the audited access replacement even when the permission principal is already empty", async () => {
    const state = deleteHarness({ initialPrincipalEmpty: true });

    await expect(
      deleteUlcLinzIdentity(state.dependencies, TARGET_IDENTITY_ID),
    ).resolves.toEqual({
      identityId: TARGET_IDENTITY_ID,
      permissionsChanged: false,
      permissionPrincipalDeleted: true,
      identityDeleted: true,
      alreadyDeleted: false,
    });
    expect(state.events).toEqual([
      `authorize:${TARGET_IDENTITY_ID}`,
      "deletion-completed",
      "find-principal",
      "replace-access",
      "disable-identity",
      "delete-identity",
      "delete-principal",
    ]);
  });

  it("does not inspect or mutate owner state when lifecycle authorization fails", async () => {
    const state = deleteHarness({ authorizationError: new Error("denied") });

    await expect(
      deleteUlcLinzIdentity(state.dependencies, TARGET_IDENTITY_ID),
    ).rejects.toThrow("denied");
    expect(state.events).toEqual([`authorize:${TARGET_IDENTITY_ID}`]);
  });

  it("blocks admin targets before destructive owner reads", async () => {
    const state = deleteHarness({ targetSourceRole: "admin" });

    await expectBlocked(
      () => deleteUlcLinzIdentity(state.dependencies, TARGET_IDENTITY_ID),
      "ADMIN_LIFECYCLE_SCOPE_UNBOUND",
    );
    expect(state.events).toEqual([`authorize:${TARGET_IDENTITY_ID}`]);
  });

  it("blocks a first delete when no exact permission principal exists to produce the audited quarantine", async () => {
    const state = deleteHarness({ initialPrincipalAbsent: true });

    await expectBlocked(
      () => deleteUlcLinzIdentity(state.dependencies, TARGET_IDENTITY_ID),
      "UNKNOWN_PERMISSION_STATE",
    );
    expect(state.events).toEqual([
      `authorize:${TARGET_IDENTITY_ID}`,
      "deletion-completed",
      "find-principal",
    ]);
    expect(state.identityDisabled).toBe(false);
  });

  it("returns an idempotent completed result without repeating destructive writes", async () => {
    const state = deleteHarness({ completed: true });

    await expect(
      deleteUlcLinzIdentity(state.dependencies, TARGET_IDENTITY_ID),
    ).resolves.toEqual({
      identityId: TARGET_IDENTITY_ID,
      permissionsChanged: false,
      permissionPrincipalDeleted: false,
      identityDeleted: true,
      alreadyDeleted: true,
    });
    expect(state.events).toEqual([
      `authorize:${TARGET_IDENTITY_ID}`,
      "deletion-completed",
      "find-principal",
    ]);
  });

  it("fails closed when a completed identity unexpectedly retains application access", async () => {
    const state = deleteHarness({
      completed: true,
      remainingPrincipalOnCompletedReplay: true,
    });

    await expectBlocked(
      () => deleteUlcLinzIdentity(state.dependencies, TARGET_IDENTITY_ID),
      "UNKNOWN_PERMISSION_STATE",
    );
    expect(state.events).toEqual([
      `authorize:${TARGET_IDENTITY_ID}`,
      "deletion-completed",
      "find-principal",
    ]);
  });

  it("keeps an empty permission principal after an identity-owner failure and completes on retry", async () => {
    const state = deleteHarness({
      identityDeleteErrorOnce: new Error("identity delete unavailable"),
    });

    await expect(
      deleteUlcLinzIdentity(state.dependencies, TARGET_IDENTITY_ID),
    ).rejects.toThrow("identity delete unavailable");
    expect(state.identityDisabled).toBe(true);
    expect(state.identityDeletionCompleted).toBe(false);
    expect(state.principalDeleted).toBe(false);
    expect(state.currentPrincipal).toEqual(emptyPrincipal());
    expect(state.events).toEqual([
      `authorize:${TARGET_IDENTITY_ID}`,
      "deletion-completed",
      "find-principal",
      "replace-access",
      "disable-identity",
      "delete-identity",
    ]);

    state.events.length = 0;
    await expect(
      deleteUlcLinzIdentity(state.dependencies, TARGET_IDENTITY_ID),
    ).resolves.toEqual({
      identityId: TARGET_IDENTITY_ID,
      permissionsChanged: false,
      permissionPrincipalDeleted: true,
      identityDeleted: true,
      alreadyDeleted: false,
    });
    expect(state.events).toEqual([
      `authorize:${TARGET_IDENTITY_ID}`,
      "deletion-completed",
      "find-principal",
      "replace-access",
      "disable-identity",
      "delete-identity",
      "delete-principal",
    ]);
  });

  it("finishes empty-principal cleanup on retry after identity deletion already completed", async () => {
    const state = deleteHarness({
      principalDeleteErrorOnce: new Error("principal cleanup unavailable"),
    });

    await expect(
      deleteUlcLinzIdentity(state.dependencies, TARGET_IDENTITY_ID),
    ).rejects.toThrow("principal cleanup unavailable");
    expect(state.identityDeletionCompleted).toBe(true);
    expect(state.principalDeleted).toBe(false);
    expect(state.currentPrincipal).toEqual(emptyPrincipal());

    state.events.length = 0;
    await expect(
      deleteUlcLinzIdentity(state.dependencies, TARGET_IDENTITY_ID),
    ).resolves.toEqual({
      identityId: TARGET_IDENTITY_ID,
      permissionsChanged: false,
      permissionPrincipalDeleted: true,
      identityDeleted: true,
      alreadyDeleted: true,
    });
    expect(state.events).toEqual([
      `authorize:${TARGET_IDENTITY_ID}`,
      "deletion-completed",
      "find-principal",
      "delete-principal",
    ]);
  });
});
