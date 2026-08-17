import { describe, expect, it } from "vitest";

import {
  capabilityId,
  InMemoryPermissionStore,
  principalId,
  roleId,
} from "@appbasis/permissions";

import {
  assertUlcLinzModuleAccess,
  UlcLinzAuthorizationDeniedError,
  type UlcLinzAuthorizationDependencies,
  type UlcLinzCurrentIdentity,
} from "../worker/authorization";

const ORGANIZATION_ID = "verein-1";
const IDENTITY_ID = "identity-1";

function currentIdentity(
  access: UlcLinzCurrentIdentity["access"] = "full",
): UlcLinzCurrentIdentity {
  return {
    identity: {
      identityId: IDENTITY_ID,
      username: "ulc.user",
      displayName: "ULC User",
      contactEmail: null,
      personId: null,
      mustChangePassword: access === "password-change-required",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      passwordChangedAt: new Date("2026-01-01T00:00:00.000Z"),
      disabledAt: null,
      accountStatus: "active",
    },
    sessionToken: "appbasis.session=test-token",
    access,
  };
}

function capability(moduleKey: string, action: "view" | "edit") {
  return capabilityId(`ulc-linz:module:${moduleKey}:${action}`);
}

function dependencies(input: {
  sourceRole: "admin" | "trainer" | "athlete" | "parent" | "unknown";
  runtimeRoleIds?: string[];
  grants?: ReturnType<typeof capability>[];
  revokes?: ReturnType<typeof capability>[];
  roleCapabilities?: ReturnType<typeof capability>[];
  active?: boolean;
  membershipOrganizationId?: string;
  relation?: boolean;
}): UlcLinzAuthorizationDependencies {
  const runtimeRoleId =
    input.sourceRole === "unknown"
      ? "ulc-linz:unknown"
      : `ulc-linz:${input.sourceRole}`;
  const roleIds = input.runtimeRoleIds ?? [runtimeRoleId];
  const knownCapabilities = [
    capability("kindertraining", "view"),
    capability("kindertraining", "edit"),
    capability("training_overview", "view"),
    capability("training_overview", "edit"),
  ];

  return {
    permissions: new InMemoryPermissionStore({
      knownCapabilities,
      roles: [
        {
          roleId: roleId(runtimeRoleId),
          capabilities: input.roleCapabilities ?? [],
        },
      ],
      principals: [
        {
          principalId: principalId(IDENTITY_ID),
          roleIds: roleIds.map(roleId),
          grants: input.grants ?? [],
          revokes: input.revokes ?? [],
        },
      ],
    }),
    memberships: {
      async resolveMembership() {
        return {
          organizationId: input.membershipOrganizationId ?? ORGANIZATION_ID,
          sourceRole: input.sourceRole,
          active: input.active ?? true,
        };
      },
    },
    subjectScopes: {
      async hasRelation() {
        return input.relation ?? false;
      },
    },
  };
}

async function expectDenied(run: () => Promise<void>) {
  await expect(run()).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
}

describe("ULC Linz M5-B runtime authorization", () => {
  it("allows an own-organization trainer only with the persisted module capability", async () => {
    await expect(
      assertUlcLinzModuleAccess(
        currentIdentity(),
        dependencies({
          sourceRole: "trainer",
          grants: [capability("kindertraining", "edit")],
        }),
        {
          organizationId: ORGANIZATION_ID,
          moduleKey: "kindertraining",
          action: "edit",
          scope: "organization",
        },
      ),
    ).resolves.toBeUndefined();
  });

  it("denies cross-organization and inactive memberships", async () => {
    await expectDenied(() =>
      assertUlcLinzModuleAccess(
        currentIdentity(),
        dependencies({
          sourceRole: "trainer",
          grants: [capability("kindertraining", "view")],
          membershipOrganizationId: "verein-2",
        }),
        {
          organizationId: ORGANIZATION_ID,
          moduleKey: "kindertraining",
          action: "view",
          scope: "organization",
        },
      ),
    );

    await expectDenied(() =>
      assertUlcLinzModuleAccess(
        currentIdentity(),
        dependencies({
          sourceRole: "trainer",
          grants: [capability("kindertraining", "view")],
          active: false,
        }),
        {
          organizationId: ORGANIZATION_ID,
          moduleKey: "kindertraining",
          action: "view",
          scope: "organization",
        },
      ),
    );
  });

  it("requires the principal role to match the active ULC source role exactly", async () => {
    await expectDenied(() =>
      assertUlcLinzModuleAccess(
        currentIdentity(),
        dependencies({
          sourceRole: "trainer",
          runtimeRoleIds: ["ulc-linz:trainer", "ulc-linz:admin"],
          grants: [capability("kindertraining", "view")],
        }),
        {
          organizationId: ORGANIZATION_ID,
          moduleKey: "kindertraining",
          action: "view",
          scope: "organization",
        },
      ),
    );

    await expectDenied(() =>
      assertUlcLinzModuleAccess(
        currentIdentity(),
        dependencies({
          sourceRole: "unknown",
          grants: [capability("kindertraining", "view")],
        }),
        {
          organizationId: ORGANIZATION_ID,
          moduleKey: "kindertraining",
          action: "view",
          scope: "organization",
        },
      ),
    );
  });

  it("keeps unknown capabilities and explicit revokes deny-by-default", async () => {
    await expectDenied(() =>
      assertUlcLinzModuleAccess(
        currentIdentity(),
        dependencies({ sourceRole: "trainer" }),
        {
          organizationId: ORGANIZATION_ID,
          moduleKey: "unknown-module",
          action: "view",
          scope: "organization",
        },
      ),
    );

    await expectDenied(() =>
      assertUlcLinzModuleAccess(
        currentIdentity(),
        dependencies({
          sourceRole: "trainer",
          grants: [capability("kindertraining", "view")],
          revokes: [capability("kindertraining", "view")],
        }),
        {
          organizationId: ORGANIZATION_ID,
          moduleKey: "kindertraining",
          action: "view",
          scope: "organization",
        },
      ),
    );
  });

  it("requires athlete access to use an explicit self relation", async () => {
    const request = {
      organizationId: ORGANIZATION_ID,
      moduleKey: "training_overview",
      action: "view" as const,
      scope: "subject" as const,
      subjectId: "athlete-1",
    };

    await expect(
      assertUlcLinzModuleAccess(
        currentIdentity(),
        dependencies({
          sourceRole: "athlete",
          grants: [capability("training_overview", "view")],
          relation: true,
        }),
        request,
      ),
    ).resolves.toBeUndefined();

    await expectDenied(() =>
      assertUlcLinzModuleAccess(
        currentIdentity(),
        dependencies({
          sourceRole: "athlete",
          grants: [capability("training_overview", "view")],
          relation: false,
        }),
        request,
      ),
    );

    await expectDenied(() =>
      assertUlcLinzModuleAccess(
        currentIdentity(),
        dependencies({
          sourceRole: "athlete",
          grants: [capability("training_overview", "view")],
        }),
        {
          organizationId: ORGANIZATION_ID,
          moduleKey: "training_overview",
          action: "view",
          scope: "organization",
        },
      ),
    );
  });

  it("requires parent access to use an explicit managed relation", async () => {
    const request = {
      organizationId: ORGANIZATION_ID,
      moduleKey: "kindertraining",
      action: "view" as const,
      scope: "subject" as const,
      subjectId: "child-1",
    };

    await expect(
      assertUlcLinzModuleAccess(
        currentIdentity(),
        dependencies({
          sourceRole: "parent",
          grants: [capability("kindertraining", "view")],
          relation: true,
        }),
        request,
      ),
    ).resolves.toBeUndefined();

    await expectDenied(() =>
      assertUlcLinzModuleAccess(
        currentIdentity(),
        dependencies({
          sourceRole: "parent",
          grants: [capability("kindertraining", "view")],
          relation: false,
        }),
        request,
      ),
    );
  });

  it("allows admin capabilities from the canonical role but still requires own organization", async () => {
    await expect(
      assertUlcLinzModuleAccess(
        currentIdentity(),
        dependencies({
          sourceRole: "admin",
          roleCapabilities: [capability("kindertraining", "edit")],
        }),
        {
          organizationId: ORGANIZATION_ID,
          moduleKey: "kindertraining",
          action: "edit",
          scope: "organization",
        },
      ),
    ).resolves.toBeUndefined();

    await expectDenied(() =>
      assertUlcLinzModuleAccess(
        currentIdentity(),
        dependencies({
          sourceRole: "admin",
          roleCapabilities: [capability("kindertraining", "edit")],
          membershipOrganizationId: "verein-2",
        }),
        {
          organizationId: ORGANIZATION_ID,
          moduleKey: "kindertraining",
          action: "edit",
          scope: "organization",
        },
      ),
    );
  });

  it("blocks application access while a required password change is pending", async () => {
    await expect(
      assertUlcLinzModuleAccess(
        currentIdentity("password-change-required"),
        dependencies({
          sourceRole: "trainer",
          grants: [capability("kindertraining", "view")],
        }),
        {
          organizationId: ORGANIZATION_ID,
          moduleKey: "kindertraining",
          action: "view",
          scope: "organization",
        },
      ),
    ).rejects.toMatchObject({ code: "PASSWORD_CHANGE_REQUIRED" });
  });
});
