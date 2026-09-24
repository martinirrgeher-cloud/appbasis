import { describe, expect, it } from "vitest";

import {
  capabilityId,
  InMemoryPermissionStore,
  principalId,
  roleId,
} from "@appbasis/permissions";

import {
  createUlcLinzCountdownAccessService,
  UlcLinzCountdownAccessDeniedError,
  type UlcLinzCountdownSqlClient,
} from "../worker/countdown-access";
import type { UlcLinzSecurityEvent } from "../worker/security-events";

const IDENTITY_ID = "identity-countdown-1";
const ORGANIZATION_ID = "verein-1";
const COUNTDOWN_VIEW = capabilityId("ulc-linz:module:countdown:view");
type CountdownCurrentIdentity = Parameters<
  ReturnType<typeof createUlcLinzCountdownAccessService>["assertViewAccess"]
>[0];

function currentIdentity(
  access: CountdownCurrentIdentity["access"] = "full",
): CountdownCurrentIdentity {
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
    sessionToken: "appbasis.session=countdown",
    access,
  };
}

function sqlMembership(input: {
  sourceRole?: "admin" | "trainer" | "athlete" | "parent";
  active?: boolean;
  rows?: readonly Record<string, unknown>[];
} = {}): UlcLinzCountdownSqlClient {
  return {
    async unsafe(query, parameters) {
      expect(query).toContain("FROM ulc_linz_membership");
      expect(query).toContain("WHERE identity_id = $1");
      expect(parameters).toEqual([IDENTITY_ID]);
      return input.rows ?? [
        {
          organization_id: ORGANIZATION_ID,
          source_role: input.sourceRole ?? "trainer",
          active: input.active ?? true,
        },
      ];
    },
  };
}

function permissions(input: {
  sourceRole?: "admin" | "trainer" | "athlete" | "parent";
  grant?: boolean;
  revoke?: boolean;
  extraRole?: boolean;
} = {}) {
  const sourceRole = input.sourceRole ?? "trainer";
  const runtimeRole = roleId(`ulc-linz:${sourceRole}`);
  return new InMemoryPermissionStore({
    knownCapabilities: [COUNTDOWN_VIEW],
    roles: [
      {
        roleId: runtimeRole,
        capabilities: sourceRole === "admin" ? [COUNTDOWN_VIEW] : [],
      },
    ],
    principals: [
      {
        principalId: principalId(IDENTITY_ID),
        roleIds: input.extraRole
          ? [runtimeRole, roleId("ulc-linz:admin")]
          : [runtimeRole],
        grants:
          sourceRole !== "admin" && input.grant !== false
            ? [COUNTDOWN_VIEW]
            : [],
        revokes: input.revoke ? [COUNTDOWN_VIEW] : [],
      },
    ],
  });
}

function service(input: {
  sourceRole?: "admin" | "trainer" | "athlete" | "parent";
  active?: boolean;
  grant?: boolean;
  revoke?: boolean;
  extraRole?: boolean;
  rows?: readonly Record<string, unknown>[];
  events?: UlcLinzSecurityEvent[];
} = {}) {
  return createUlcLinzCountdownAccessService({
    sql: sqlMembership(input),
    permissions: permissions(input),
    ...(input.events === undefined
      ? {}
      : {
          securityEvents: {
            record(event) {
              input.events?.push(event);
            },
          },
        }),
  });
}

describe("ULC Linz countdown access", () => {
  it("allows an active trainer with the persisted countdown view capability", async () => {
    await expect(service().assertViewAccess(currentIdentity())).resolves.toEqual({
      organizationId: ORGANIZATION_ID,
    });
  });

  it("allows an athlete without requiring a subject relation", async () => {
    await expect(
      service({ sourceRole: "athlete" }).assertViewAccess(currentIdentity()),
    ).resolves.toEqual({ organizationId: ORGANIZATION_ID });
  });

  it("allows the canonical admin role through role-derived countdown access", async () => {
    await expect(
      service({ sourceRole: "admin", grant: false }).assertViewAccess(
        currentIdentity(),
      ),
    ).resolves.toEqual({ organizationId: ORGANIZATION_ID });
  });

  it("denies missing, inactive or malformed membership state", async () => {
    await expect(
      service({ rows: [] }).assertViewAccess(currentIdentity()),
    ).rejects.toBeInstanceOf(UlcLinzCountdownAccessDeniedError);
    await expect(
      service({ active: false }).assertViewAccess(currentIdentity()),
    ).rejects.toBeInstanceOf(UlcLinzCountdownAccessDeniedError);
    await expect(
      service({
        rows: [
          {
            organization_id: ORGANIZATION_ID,
            source_role: "unknown",
            active: true,
          },
        ],
      }).assertViewAccess(currentIdentity()),
    ).rejects.toBeInstanceOf(UlcLinzCountdownAccessDeniedError);
  });

  it("denies role drift, missing grants and explicit revokes", async () => {
    await expect(
      service({ extraRole: true }).assertViewAccess(currentIdentity()),
    ).rejects.toBeInstanceOf(UlcLinzCountdownAccessDeniedError);
    await expect(
      service({ grant: false }).assertViewAccess(currentIdentity()),
    ).rejects.toBeInstanceOf(UlcLinzCountdownAccessDeniedError);
    await expect(
      service({ revoke: true }).assertViewAccess(currentIdentity()),
    ).rejects.toBeInstanceOf(UlcLinzCountdownAccessDeniedError);
  });

  it("blocks application access while a required password change is pending", async () => {
    await expect(
      service().assertViewAccess(currentIdentity("password-change-required")),
    ).rejects.toMatchObject({ code: "PASSWORD_CHANGE_REQUIRED" });
  });

  it("logs sanitized countdown authorization denials", async () => {
    const events: UlcLinzSecurityEvent[] = [];
    await expect(
      service({ grant: false, events }).assertViewAccess(currentIdentity()),
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
  });
});
