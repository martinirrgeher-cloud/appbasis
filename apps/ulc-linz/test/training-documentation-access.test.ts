import { describe, expect, it } from "vitest";

import {
  capabilityId,
  InMemoryPermissionStore,
  principalId,
  roleId,
} from "@appbasis/permissions";

import {
  createUlcLinzTrainingDocumentationAccessService,
  type UlcLinzTrainingDocumentationAccessSqlClient,
} from "../worker/training-documentation-access";
import {
  UlcLinzAuthorizationDeniedError,
  type UlcLinzCurrentIdentity,
} from "../worker/authorization";

const IDENTITY_ID = "identity-documentation-1";
const ORGANIZATION_ID = "verein-1";
const ATHLETE_ID = "athlete-1";

function currentIdentity(): UlcLinzCurrentIdentity {
  return {
    identity: {
      identityId: IDENTITY_ID,
      username: "documentation.user",
      displayName: "Documentation User",
      contactEmail: null,
      personId: null,
      mustChangePassword: false,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      passwordChangedAt: new Date("2026-01-01T00:00:00.000Z"),
      disabledAt: null,
      accountStatus: "active",
    },
    sessionToken: "appbasis.session=documentation-test",
    access: "full",
  };
}

function service(input: {
  sourceRole?: "admin" | "trainer" | "athlete" | "parent";
  grants?: Array<ReturnType<typeof capabilityId>>;
  roleCapabilities?: Array<ReturnType<typeof capabilityId>>;
  active?: boolean;
  related?: boolean;
}) {
  const sourceRole = input.sourceRole ?? "trainer";
  const runtimeRoleId = roleId(`ulc-linz:${sourceRole}`);
  const view = capabilityId("ulc-linz:module:training_documentation:view");
  const edit = capabilityId("ulc-linz:module:training_documentation:edit");
  const sql: UlcLinzTrainingDocumentationAccessSqlClient = {
    async unsafe() {
      return [
        {
          organization_id: ORGANIZATION_ID,
          source_role: sourceRole,
          subject_id: sourceRole === "athlete" ? ATHLETE_ID : null,
          active: input.active ?? true,
        },
      ];
    },
  };

  return createUlcLinzTrainingDocumentationAccessService({
    sql,
    permissions: new InMemoryPermissionStore({
      knownCapabilities: [view, edit],
      roles: [
        {
          roleId: runtimeRoleId,
          capabilities: input.roleCapabilities ?? [],
        },
      ],
      principals: [
        {
          principalId: principalId(IDENTITY_ID),
          roleIds: [runtimeRoleId],
          grants: input.grants ?? [],
          revokes: [],
        },
      ],
    }),
    memberships: {
      async resolveMembership({ organizationId }) {
        return {
          organizationId,
          sourceRole,
          active: input.active ?? true,
        };
      },
    },
    subjectScopes: {
      async hasRelation({ subjectId, relationType }) {
        return (
          (input.related ?? true) &&
          sourceRole === "athlete" &&
          relationType === "self" &&
          subjectId === ATHLETE_ID
        );
      },
    },
  });
}

describe("ULC Linz training documentation access", () => {
  it("uses the dedicated training_documentation permission for trainers", async () => {
    const view = capabilityId("ulc-linz:module:training_documentation:view");
    const edit = capabilityId("ulc-linz:module:training_documentation:edit");

    await expect(
      service({ grants: [view] }).assertViewAccess(currentIdentity()),
    ).resolves.toEqual({
      organizationId: ORGANIZATION_ID,
      actorPrincipalId: IDENTITY_ID,
      subjectId: null,
      canEdit: false,
    });

    await expect(
      service({ grants: [view, edit] }).assertViewAccess(currentIdentity()),
    ).resolves.toMatchObject({ subjectId: null, canEdit: true });
  });

  it("scopes athlete access to the linked own subject", async () => {
    const view = capabilityId("ulc-linz:module:training_documentation:view");
    const edit = capabilityId("ulc-linz:module:training_documentation:edit");

    await expect(
      service({
        sourceRole: "athlete",
        grants: [view, edit],
      }).assertViewAccess(currentIdentity()),
    ).resolves.toEqual({
      organizationId: ORGANIZATION_ID,
      actorPrincipalId: IDENTITY_ID,
      subjectId: ATHLETE_ID,
      canEdit: true,
    });

    await expect(
      service({
        sourceRole: "athlete",
        grants: [view, edit],
        related: false,
      }).assertViewAccess(currentIdentity()),
    ).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
  });

  it("denies parent and inactive memberships", async () => {
    const view = capabilityId("ulc-linz:module:training_documentation:view");

    await expect(
      service({
        sourceRole: "parent",
        grants: [view],
      }).assertViewAccess(currentIdentity()),
    ).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);

    await expect(
      service({
        grants: [view],
        active: false,
      }).assertViewAccess(currentIdentity()),
    ).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
  });
});
