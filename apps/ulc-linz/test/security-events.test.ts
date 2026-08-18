import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { IdentityHttpService } from "@appbasis/identity/http";
import {
  capabilityId,
  InMemoryPermissionStore,
  PERMISSION_ADMINISTRATION_AUDIT_RETENTION_MONTHS,
  principalId,
  roleId,
} from "@appbasis/permissions";

import {
  createGeneratedApp,
  type UlcLinzSecurityEvent,
  type UlcLinzSecurityEventLogger,
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

function eventCollector(events: UlcLinzSecurityEvent[]): UlcLinzSecurityEventLogger {
  return {
    record(event) {
      events.push(event);
    },
  };
}

function authorizationDependencies(input: {
  events?: UlcLinzSecurityEvent[];
  logger?: UlcLinzSecurityEventLogger;
  sourceRole?: "admin" | "trainer" | "athlete" | "parent";
  grants?: ReturnType<typeof capabilityId>[];
  relation?: boolean;
  membershipOrganizationId?: string;
}): UlcLinzAuthorizationDependencies {
  const sourceRole = input.sourceRole ?? "trainer";
  const role = roleId(`ulc-linz:${sourceRole}`);
  const view = capabilityId("ulc-linz:module:kindertraining:view");

  return {
    permissions: new InMemoryPermissionStore({
      knownCapabilities: [view],
      roles: [{ roleId: role, capabilities: [] }],
      principals: [
        {
          principalId: principalId(IDENTITY_ID),
          roleIds: [role],
          grants: input.grants ?? [],
          revokes: [],
        },
      ],
    }),
    memberships: {
      async resolveMembership(request) {
        return {
          organizationId: input.membershipOrganizationId ?? request.organizationId,
          sourceRole,
          active: true,
        };
      },
    },
    subjectScopes: {
      async hasRelation() {
        return input.relation ?? false;
      },
    },
    securityEvents:
      input.logger ??
      (input.events === undefined ? undefined : eventCollector(input.events)),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

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
      actorPrincipalId: null,
      organizationId: null,
      action: "sign-in",
      targetType: "identity-endpoint",
      targetId: "sign-in",
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

  it("records actor, action, module target and organization for an authorization denial", async () => {
    const events: UlcLinzSecurityEvent[] = [];
    const dependencies = authorizationDependencies({ events });

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
      organizationId: ORGANIZATION_ID,
      action: "view",
      targetType: "module",
      targetId: "kindertraining",
      reasonCode: "capability-denied",
    });
    expect(events[0]?.occurredAt).toEqual(expect.any(String));
    expect(JSON.stringify(events[0])).not.toContain("appbasis.session");
  });

  it("never copies a subject id into a denied managed-access event", async () => {
    const events: UlcLinzSecurityEvent[] = [];
    const view = capabilityId("ulc-linz:module:kindertraining:view");
    const dependencies = authorizationDependencies({
      events,
      sourceRole: "parent",
      grants: [view],
      relation: false,
    });

    await expect(
      assertUlcLinzModuleAccess(currentIdentity(), dependencies, {
        organizationId: ORGANIZATION_ID,
        moduleKey: "kindertraining",
        action: "view",
        scope: "subject",
        subjectId: "sensitive-child-id",
      }),
    ).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "authorization.denied",
      organizationId: ORGANIZATION_ID,
      targetId: "kindertraining",
      reasonCode: "subject-relation-denied",
    });
    expect(JSON.stringify(events[0])).not.toContain("sensitive-child-id");
  });

  it("sanitizes control-character context instead of copying it into logs", async () => {
    const events: UlcLinzSecurityEvent[] = [];
    const unsafeOrganizationId = "verein-1\nforged-log-line";
    const dependencies = authorizationDependencies({ events });

    await expect(
      assertUlcLinzModuleAccess(currentIdentity(), dependencies, {
        organizationId: unsafeOrganizationId,
        moduleKey: "kindertraining",
        action: "view",
        scope: "organization",
      }),
    ).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "authorization.denied",
      organizationId: null,
      targetId: "kindertraining",
    });
    expect(JSON.stringify(events[0])).not.toContain("forged-log-line");
  });

  it("keeps authorization fail-closed when the security-event sink throws", async () => {
    const fallback = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const dependencies = authorizationDependencies({
      logger: {
        record() {
          throw new Error("provider logger leaked secret=must-not-escape");
        },
      },
    });

    await expect(
      assertUlcLinzModuleAccess(currentIdentity(), dependencies, {
        organizationId: ORGANIZATION_ID,
        moduleKey: "kindertraining",
        action: "view",
        scope: "organization",
      }),
    ).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);

    expect(fallback).toHaveBeenCalledWith(
      "[ulc-linz-security] security event sink failed",
    );
    expect(JSON.stringify(fallback.mock.calls)).not.toContain("must-not-escape");
  });

  it("preserves the original denied identity response when the sink throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const identity: IdentityHttpService = {
      async signInWithUsername() {
        throw new Error("authentication backend unavailable");
      },
      async getCurrentIdentity() {
        return null;
      },
      async changeRequiredPassword() {
        throw new Error("password backend unavailable");
      },
    };

    const response = await createGeneratedApp({
      identity,
      secureCookies: false,
      securityEvents: {
        record() {
          throw new Error("sink unavailable");
        },
      },
    }).request("/api/auth/sign-in", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "user", password: "secret" }),
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "AUTHENTICATION_FAILED" },
    });
  });

  it("does not expose audit or security logs through the public ULC app", async () => {
    const identity: IdentityHttpService = {
      async signInWithUsername() {
        return currentIdentity().identity;
      },
      async getCurrentIdentity() {
        return null;
      },
      async changeRequiredPassword() {
        return currentIdentity().identity;
      },
    };
    const app = createGeneratedApp({ identity, secureCookies: false });

    expect((await app.request("/api/security-events")).status).toBe(404);
    expect((await app.request("/api/admin/audit")).status).toBe(404);
  });

  it("keeps role and permission administration on the persistent 12-month audit owner", async () => {
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
    expect(PERMISSION_ADMINISTRATION_AUDIT_RETENTION_MONTHS).toBe(12);
  });
});
