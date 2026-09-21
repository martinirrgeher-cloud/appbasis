import { describe, expect, it } from "vitest";

import type { IdentityHttpService } from "@appbasis/identity/http";
import {
  capabilityId,
  InMemoryPermissionStore,
  principalId,
  roleId,
} from "@appbasis/permissions";

import { createGeneratedApp } from "../worker/app";
import type { UlcLinzScopeResolver } from "../worker/scope-postgres";

const ORGANIZATION_ID = "verein-1";
const currentIdentity = {
  identity: {
    identityId: "identity-1",
    username: "mini.user",
    displayName: "Mini User",
    contactEmail: null,
    personId: null,
    mustChangePassword: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    passwordChangedAt: new Date("2026-01-01T00:00:00.000Z"),
    disabledAt: null,
    accountStatus: "active" as const,
  },
  sessionToken: "appbasis.session=test-token",
  access: "full" as const,
};

const identity: IdentityHttpService = {
  async signInWithUsername() {
    return currentIdentity;
  },
  async getCurrentIdentity(sessionToken) {
    return sessionToken === currentIdentity.sessionToken ? currentIdentity : null;
  },
  async changeRequiredPassword() {
    return currentIdentity;
  },
};

function dependencies(options: {
  countdownAllowed?: boolean;
  activeMembership?: boolean;
} = {}) {
  const countdownCapability = capabilityId("ulc-linz:module:countdown:view");
  const permissions = new InMemoryPermissionStore({
    knownCapabilities: [countdownCapability],
    roles: [
      {
        roleId: roleId("ulc-linz:trainer"),
        capabilities: [],
      },
    ],
    principals: [
      {
        principalId: principalId(currentIdentity.identity.identityId),
        roleIds: [roleId("ulc-linz:trainer")],
        grants: options.countdownAllowed === false ? [] : [countdownCapability],
        revokes: [],
      },
    ],
  });

  const scope: UlcLinzScopeResolver = {
    async resolveActiveOrganizationId(identityId) {
      if (
        identityId !== currentIdentity.identity.identityId ||
        options.activeMembership === false
      ) {
        return null;
      }
      return ORGANIZATION_ID;
    },
    async resolveMembership({ identityId, organizationId }) {
      if (
        identityId !== currentIdentity.identity.identityId ||
        organizationId !== ORGANIZATION_ID ||
        options.activeMembership === false
      ) {
        return null;
      }
      return {
        organizationId: ORGANIZATION_ID,
        sourceRole: "trainer",
        active: true,
      };
    },
    async hasRelation() {
      return false;
    },
  };

  return { identity, permissions, scope, secureCookies: false };
}

describe("ULC Linz AppBasis runtime", () => {
  it("is runnable and exposes health", async () => {
    const response = await createGeneratedApp(dependencies()).request("/api/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "ok" });
  });

  it("uses the shared identity HTTP contract", async () => {
    const response = await createGeneratedApp(dependencies()).request(
      "/api/auth/sign-in",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "mini.user", password: "secret" }),
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("appbasis.session=test-token");
    expect(await response.json()).toMatchObject({
      identity: { username: "mini.user" },
      access: "full",
    });
  });

  it("allows the countdown only through active membership and its module capability", async () => {
    const allowed = await createGeneratedApp(dependencies()).request(
      "/api/modules/countdown/access",
      { headers: { cookie: currentIdentity.sessionToken } },
    );

    expect(allowed.status).toBe(200);
    await expect(allowed.json()).resolves.toEqual({
      access: "allowed",
      module: "countdown",
    });

    const noCapability = await createGeneratedApp(
      dependencies({ countdownAllowed: false }),
    ).request("/api/modules/countdown/access", {
      headers: { cookie: currentIdentity.sessionToken },
    });
    expect(noCapability.status).toBe(403);

    const noMembership = await createGeneratedApp(
      dependencies({ activeMembership: false }),
    ).request("/api/modules/countdown/access", {
      headers: { cookie: currentIdentity.sessionToken },
    });
    expect(noMembership.status).toBe(403);
  });

  it("does not expose countdown access without a session", async () => {
    const response = await createGeneratedApp(dependencies()).request(
      "/api/modules/countdown/access",
    );

    expect(response.status).toBe(401);
  });
});
