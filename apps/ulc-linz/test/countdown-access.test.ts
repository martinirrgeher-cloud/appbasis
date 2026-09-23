import { describe, expect, it } from "vitest";

import { COUNTDOWN_CAPABILITIES } from "@appbasis/countdown";
import {
  capabilityId,
  InMemoryPermissionStore,
  principalId,
  roleId,
} from "@appbasis/permissions";

import {
  assertUlcLinzCountdownAccess,
  UlcLinzCountdownAccessDeniedError,
  type UlcLinzCountdownAccessDependencies,
} from "../worker/countdown-access";
import type { UlcLinzCurrentIdentity } from "../worker/authorization";

const IDENTITY_ID = "identity-countdown-1";
const ORGANIZATION_ID = "verein-1";
const COUNTDOWN_RUNTIME_CAPABILITY = capabilityId(
  `ulc-linz:module:${COUNTDOWN_CAPABILITIES.view}`,
);

function currentIdentity(
  access: UlcLinzCurrentIdentity["access"] = "full",
): UlcLinzCurrentIdentity {
  return {
    identity: {
      identityId: IDENTITY_ID,
      username: "countdown.user",
      displayName: "Countdown User",
      contactEmail: null,
      personId: null,
      mustChangePassword: access === "password-change-required",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      passwordChangedAt: new Date("2026-01-01T00:00:00.000Z"),
      disabledAt: null,
      accountStatus: "active",
    },
    sessionToken: "appbasis.session=countdown-test-token",
    access,
  };
}

function dependencies(input: {
  sourceRole?: "admin" | "trainer" | "athlete" | "parent";
  active?: boolean;
  roleIds?: string[];
  grants?: ReturnType<typeof capabilityId>[];
  revokes?: ReturnType<typeof capabilityId>[];
  adminCapability?: boolean;
  membership?: boolean;
  events?: Array<Record<string, unknown>>;
} = {}): UlcLinzCountdownAccessDependencies {
  const sourceRole = input.sourceRole ?? "trainer";
  const runtimeRole = roleId(`ulc-linz:${sourceRole}`);
  return {
    permissions: new InMemoryPermissionStore({
      knownCapabilities: [COUNTDOWN_RUNTIME_CAPABILITY],
      roles: (["admin", "trainer", "athlete", "parent"] as const).map(
        (role) => ({
          roleId: roleId(`ulc-linz:${role}`),
          capabilities:
            role === "admin" && input.adminCapability !== false
              ? [COUNTDOWN_RUNTIME_CAPABILITY]
              : [],
        }),
      ),
      principals: [
        {
          principalId: principalId(IDENTITY_ID),
          roleIds: (input.roleIds ?? [runtimeRole]).map(roleId),
          grants:
            input.grants ??
            (sourceRole === "admin" ? [] : [COUNTDOWN_RUNTIME_CAPABILITY]),
          revokes: input.revokes ?? [],
        },
      ],
    }),
    memberships: {
      async resolveMembershipForIdentity(identityId) {
        expect(identityId).toBe(IDENTITY_ID);
        if (input.membership === false) return null;
        return {
          organizationId: ORGANIZATION_ID,
          sourceRole,
          active: input.active ?? true,
        };
      },
    },
    ...(input.events === undefined
      ? {}
      : {
          securityEvents: {
            record(event: unknown) {
              input.events?.push(event as Record<string, unknown>);
            },
          },
        }),
  };
}

describe("ULC Linz countdown runtime access", () => {
  it("maps the public countdown capability into the ULC permission namespace", async () => {
    expect(COUNTDOWN_CAPABILITIES.view).toBe("countdown:view");
    await expect(
      assertUlcLinzCountdownAccess(currentIdentity(), dependencies()),
    ).resolves.toBeUndefined();
  });

  it.each(["trainer", "athlete", "parent"] as const)(
    "allows an active %s only with the persisted countdown view grant",
    async (sourceRole) => {
      await expect(
        assertUlcLinzCountdownAccess(
          currentIdentity(),
          dependencies({ sourceRole }),
        ),
      ).resolves.toBeUndefined();

      await expect(
        assertUlcLinzCountdownAccess(
          currentIdentity(),
          dependencies({ sourceRole, grants: [] }),
        ),
      ).rejects.toBeInstanceOf(UlcLinzCountdownAccessDeniedError);
    },
  );

  it("allows admin through the canonical role capability", async () => {
    await expect(
      assertUlcLinzCountdownAccess(
        currentIdentity(),
        dependencies({ sourceRole: "admin" }),
      ),
    ).resolves.toBeUndefined();
  });

  it("denies missing or inactive membership before capability access", async () => {
    await expect(
      assertUlcLinzCountdownAccess(
        currentIdentity(),
        dependencies({ membership: false }),
      ),
    ).rejects.toBeInstanceOf(UlcLinzCountdownAccessDeniedError);

    await expect(
      assertUlcLinzCountdownAccess(
        currentIdentity(),
        dependencies({ active: false }),
      ),
    ).rejects.toBeInstanceOf(UlcLinzCountdownAccessDeniedError);
  });

  it("requires the principal role to match the membership role exactly", async () => {
    await expect(
      assertUlcLinzCountdownAccess(
        currentIdentity(),
        dependencies({
          sourceRole: "trainer",
          roleIds: ["ulc-linz:athlete"],
        }),
      ),
    ).rejects.toBeInstanceOf(UlcLinzCountdownAccessDeniedError);

    await expect(
      assertUlcLinzCountdownAccess(
        currentIdentity(),
        dependencies({
          sourceRole: "trainer",
          roleIds: ["ulc-linz:trainer", "ulc-linz:admin"],
        }),
      ),
    ).rejects.toBeInstanceOf(UlcLinzCountdownAccessDeniedError);
  });

  it("keeps explicit revokes deny-by-default", async () => {
    await expect(
      assertUlcLinzCountdownAccess(
        currentIdentity(),
        dependencies({
          revokes: [COUNTDOWN_RUNTIME_CAPABILITY],
        }),
      ),
    ).rejects.toBeInstanceOf(UlcLinzCountdownAccessDeniedError);
  });

  it("records a normalized module denial without subject data", async () => {
    const events: Array<Record<string, unknown>> = [];
    await expect(
      assertUlcLinzCountdownAccess(
        currentIdentity(),
        dependencies({ grants: [], events }),
      ),
    ).rejects.toBeInstanceOf(UlcLinzCountdownAccessDeniedError);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "authorization.denied",
      actorPrincipalId: IDENTITY_ID,
      organizationId: ORGANIZATION_ID,
      action: "view",
      targetType: "module",
      targetId: "countdown",
      reasonCode: "capability-denied",
    });
    expect(JSON.stringify(events[0])).not.toContain("subject");
  });

  it("blocks countdown access while a required password change is pending", async () => {
    await expect(
      assertUlcLinzCountdownAccess(
        currentIdentity("password-change-required"),
        dependencies(),
      ),
    ).rejects.toMatchObject({ code: "PASSWORD_CHANGE_REQUIRED" });
  });
});
