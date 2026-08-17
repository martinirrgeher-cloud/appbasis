import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import type { IdentityHttpService } from "@appbasis/identity/http";
import {
  capabilityId,
  InMemoryPermissionStore,
  principalId,
  roleId,
} from "@appbasis/permissions";

import {
  createGeneratedApp,
  type UlcLinzSecurityEvent,
} from "../worker/app";
import {
  assertUlcLinzModuleAccess,
  UlcLinzAuthorizationDeniedError,
  type UlcLinzAuthorizationDependencies,
  type UlcLinzCurrentIdentity,
} from "../worker/authorization";

const ORGANIZATION_ID = "verein-1";
const IDENTITY_ID = "identity-1";

function currentIdentity(): UlcLinzCurrentIdentity {
  return {
    identity: {
      identityId: IDENTITY_ID,
      username: "ulc.user",
      displayName: "ULC User",
      contactEmail: null,
      personId: null,
      mustChangePassword: false,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      passwordChangedAt: new Date("2026-01-01T00:00:00.000Z"),
      disabledAt: null,
      accountStatus: "active",
    },
    sessionToken: "appbasis.session=test-token",
    access: "full",
  };
}

function eventCollector(events: UlcLinzSecurityEvent[]) {
  return {
    record(event: UlcLinzSecurityEvent) {
      events.push(event);
    },
  };
}

describe("ULC Linz M5-F audit and security logging", () => {
  it("records a sanitized structured event for a failed sign-in request", async () => {
    const events: UlcLinzSecurityEvent[] = [];
    const identity: IdentityHttpService = {
      async signInWithUsername() {
        throw new Error("Backend details must not reach the security event.");
      },
      async getCurrentIdentity() {
        return null;
      },
      async changeRequiredPassword() {
        throw new Error("Backend details must not reach the security event.");
      },
    };

    const response = await createGeneratedApp({
      identity,
      secureCookies: false,
      securityEvents: eventCollector(events),
    }).request("/api/auth/sign-in", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "sensitive.user",
        password: "super-secret-password",
      }),
    });

    expect(response.status).toBe(500);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      schemaVersion: 1,
      appId: "ulc-linz",
      category: "security",
      eventType: "identity.request.denied",
      operation: "sign-in",
      httpStatus: 500,
      errorCode: "AUTHENTICATION_FAILED",
    });
    expect(events[0]?.occurredAt).toEqual(expect.any(String));

    const serialized = JSON.stringify(events[0]);
    expect(serialized).not.toContain("sensitive.user");
    expect(serialized).not.toContain("super-secret-password");
    expect(serialized).not.toContain("Backend details");
    expect(serialized).not.toContain("appbasis.session");
  });

  it("records a sanitized denial reason from the real ULC authorization guard", async () => {
    const events: UlcLinzSecurityEvent[] = [];
    const capability = capabilityId("ulc-linz:module:kindertraining:view");
    const dependencies: UlcLinzAuthorizationDependencies = {
      permissions: new InMemoryPermissionStore({
        knownCapabilities: [capability],
        roles: [
          {
            roleId: roleId("ulc-linz:trainer"),
            capabilities: [],
          },
        ],
        principals: [
          {
            principalId: principalId(IDENTITY_ID),
            roleIds: [roleId("ulc-linz:trainer")],
            grants: [],
            revokes: [],
          },
        ],
      }),
      memberships: {
        async resolveMembership() {
          return {
            organizationId: ORGANIZATION_ID,
            sourceRole: "trainer",
            active: true,
          };
        },
      },
      subjectScopes: {
        async hasRelation() {
          return false;
        },
      },
      securityEvents: eventCollector(events),
    };

    await expect(
      assertUlcLinzModuleAccess(currentIdentity(), dependencies, {
        organizationId: ORGANIZATION_ID,
        moduleKey: "kindertraining",
        action: "view",
        scope: "organization",
      }),
    ).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      schemaVersion: 1,
      appId: "ulc-linz",
      category: "security",
      eventType: "authorization.denied",
      actorPrincipalId: IDENTITY_ID,
      reasonCode: "capability-denied",
    });
    expect(events[0]?.occurredAt).toEqual(expect.any(String));

    const serialized = JSON.stringify(events[0]);
    expect(serialized).not.toContain(ORGANIZATION_ID);
    expect(serialized).not.toContain("kindertraining");
    expect(serialized).not.toContain("appbasis.session");
  });

  it("keeps ULC role and permission administration on the existing persistent audit migrations", async () => {
    const manifest = JSON.parse(
      await readFile(new URL("../appbasis.database.json", import.meta.url), "utf8"),
    ) as {
      owners: Array<{ id: string; migrations: string[] }>;
    };
    const permissions = manifest.owners.find((owner) => owner.id === "permissions");

    expect(permissions?.migrations).toContain(
      "packages/permissions/migrations/0002_appbasis_permission_administration_audit.sql",
    );
    expect(permissions?.migrations).toContain(
      "packages/permissions/migrations/0003_appbasis_principal_permission_administration_audit.sql",
    );
  });
});
