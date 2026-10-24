import { describe, expect, it } from "vitest";

import {
  capabilityId,
  InMemoryPermissionStore,
  principalId,
  roleId,
} from "@appbasis/permissions";

import {
  createUlcLinzSelfRegistrationAccessService,
  type UlcLinzSelfRegistrationAccessSqlClient,
} from "../worker/self-registration-access";
import {
  UlcLinzAuthorizationDeniedError,
  type UlcLinzCurrentIdentity,
} from "../worker/authorization";

const IDENTITY_ID = "identity-athlete-1";
const ORGANIZATION_ID = "verein-1";
const ATHLETE_ID = "athlete-1";

function currentIdentity(): UlcLinzCurrentIdentity {
  return {
    identity: {
      identityId: IDENTITY_ID,
      username: "athlete.user",
      displayName: "Athlete User",
      contactEmail: null,
      personId: null,
      mustChangePassword: false,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      passwordChangedAt: new Date("2026-01-01T00:00:00.000Z"),
      disabledAt: null,
      accountStatus: "active",
    },
    sessionToken: "appbasis.session=self-registration-test",
    access: "full",
  };
}

function accessService(input: {
  sourceRole?: "athlete" | "trainer";
  active?: boolean;
  athleteActive?: boolean;
  rowCount?: number;
  relation?: boolean;
  grants?: Array<ReturnType<typeof capabilityId>>;
}) {
  const sourceRole = input.sourceRole ?? "athlete";
  const view = capabilityId("ulc-linz:module:kindertraining:view");
  const edit = capabilityId("ulc-linz:module:kindertraining:edit");
  const sql: UlcLinzSelfRegistrationAccessSqlClient = {
    async unsafe(query, parameters) {
      expect(query).toContain("membership.subject_id AS athlete_id");
      expect(query).toContain("INNER JOIN appbasis_athlete AS athlete");
      expect(parameters).toEqual([IDENTITY_ID]);
      const row = {
        organization_id: ORGANIZATION_ID,
        athlete_id: ATHLETE_ID,
        source_role: sourceRole,
        active: input.active ?? true,
        athlete_active: input.athleteActive ?? true,
      };
      return Array.from({ length: input.rowCount ?? 1 }, () => ({ ...row }));
    },
  };

  return createUlcLinzSelfRegistrationAccessService({
    sql,
    permissions: new InMemoryPermissionStore({
      knownCapabilities: [view, edit],
      roles: [
        {
          roleId: roleId("ulc-linz:athlete"),
          capabilities: [],
        },
      ],
      principals: [
        {
          principalId: principalId(IDENTITY_ID),
          roleIds: [roleId("ulc-linz:athlete")],
          grants: input.grants ?? [],
          revokes: [],
        },
      ],
    }),
    memberships: {
      async resolveMembership({ identityId, organizationId }) {
        expect(identityId).toBe(IDENTITY_ID);
        expect(organizationId).toBe(ORGANIZATION_ID);
        return {
          organizationId,
          sourceRole,
          active: input.active ?? true,
        };
      },
    },
    subjectScopes: {
      async hasRelation({ identityId, organizationId, subjectId, relationType }) {
        expect(identityId).toBe(IDENTITY_ID);
        expect(organizationId).toBe(ORGANIZATION_ID);
        expect(subjectId).toBe(ATHLETE_ID);
        expect(relationType).toBe("self");
        return input.relation ?? true;
      },
    },
  });
}

describe("ULC athlete self-registration access", () => {
  it("derives the athlete exclusively from the authenticated membership", async () => {
    const edit = capabilityId("ulc-linz:module:kindertraining:edit");
    const access = accessService({ grants: [edit] });

    await expect(access.assertEditAccess(currentIdentity())).resolves.toEqual({
      organizationId: ORGANIZATION_ID,
      actorPrincipalId: IDENTITY_ID,
      athleteId: ATHLETE_ID,
    });
  });

  it("requires the canonical self subject relation", async () => {
    const view = capabilityId("ulc-linz:module:kindertraining:view");
    await expect(
      accessService({ grants: [view], relation: false }).assertViewAccess(
        currentIdentity(),
      ),
    ).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
  });

  it("fails closed for non-athlete, inactive, ambiguous and inactive-athlete rows", async () => {
    const view = capabilityId("ulc-linz:module:kindertraining:view");
    for (const input of [
      { sourceRole: "trainer" as const },
      { active: false },
      { rowCount: 2 },
      { athleteActive: false },
    ]) {
      await expect(
        accessService({ grants: [view], ...input }).assertViewAccess(
          currentIdentity(),
        ),
      ).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
    }
  });
});
