import { describe, expect, it } from "vitest";

import {
  createPostgresUlcLinzSecurityEventLogger,
  purgeExpiredUlcLinzSecurityEvents,
  type UlcLinzSecurityEventSqlClient,
} from "../worker/security-events-postgres";
import type { UlcLinzSecurityEvent } from "../worker/security-events";

const identityDeniedEvent: UlcLinzSecurityEvent = Object.freeze({
  schemaVersion: 1,
  appId: "ulc-linz",
  category: "security",
  eventType: "identity.request.denied",
  occurredAt: "2026-08-23T05:15:00.000Z",
  actorPrincipalId: null,
  organizationId: null,
  action: "sign-in",
  targetType: "identity-endpoint",
  targetId: "sign-in",
  operation: "sign-in",
  httpStatus: 401,
  errorCode: "INVALID_CREDENTIALS",
});

const authorizationDeniedEvent: UlcLinzSecurityEvent = Object.freeze({
  schemaVersion: 1,
  appId: "ulc-linz",
  category: "security",
  eventType: "authorization.denied",
  occurredAt: "2026-08-23T05:16:00.000Z",
  actorPrincipalId: "identity-1",
  organizationId: "organization-1",
  action: "edit",
  targetType: "module",
  targetId: "training",
  reasonCode: "capability-denied",
});

describe("ULC Linz PostgreSQL security-event sink", () => {
  it("persists only the normalized identity-denial envelope with exact twelve-month retention", async () => {
    const calls: Array<{ query: string; parameters: readonly unknown[] }> = [];
    const client: UlcLinzSecurityEventSqlClient = {
      async unsafe(query, parameters = []) {
        calls.push({ query, parameters });
        return [];
      },
    };
    const logger = createPostgresUlcLinzSecurityEventLogger(client);

    logger.record(identityDeniedEvent);
    expect(calls).toHaveLength(0);
    await logger.flush();

    expect(calls).toHaveLength(1);
    const call = calls[0];
    if (call === undefined) throw new Error("Expected one persisted security event.");
    expect(call.query).toContain("INSERT INTO ulc_linz_security_event_log");
    expect(call.query).toContain("interval '12 months'");
    expect(call.parameters).toEqual([
      1,
      "ulc-linz",
      "security",
      "identity.request.denied",
      identityDeniedEvent.occurredAt,
      null,
      null,
      "sign-in",
      "identity-endpoint",
      "sign-in",
      "sign-in",
      401,
      "INVALID_CREDENTIALS",
      null,
    ]);
    expect(call.parameters).not.toContain("password");
    expect(call.parameters).not.toContain("cookie");
  });

  it("maps authorization denials without a raw payload column", async () => {
    const calls: Array<{ query: string; parameters: readonly unknown[] }> = [];
    const logger = createPostgresUlcLinzSecurityEventLogger({
      async unsafe(query, parameters = []) {
        calls.push({ query, parameters });
        return [];
      },
    });

    logger.record(authorizationDeniedEvent);
    expect(calls).toHaveLength(0);
    await logger.flush();

    expect(calls).toHaveLength(1);
    const call = calls[0];
    if (call === undefined) throw new Error("Expected one persisted security event.");
    expect(call.query).not.toContain("payload");
    expect(call.parameters).toEqual([
      1,
      "ulc-linz",
      "security",
      "authorization.denied",
      authorizationDeniedEvent.occurredAt,
      "identity-1",
      "organization-1",
      "edit",
      "module",
      "training",
      null,
      null,
      null,
      "capability-denied",
    ]);
  });

  it("buffers sink failures until flush without throwing from record", async () => {
    let calls = 0;
    const logger = createPostgresUlcLinzSecurityEventLogger({
      async unsafe() {
        calls += 1;
        throw new Error("postgresql://secret-host/private");
      },
    });

    expect(() => logger.record(identityDeniedEvent)).not.toThrow();
    expect(calls).toBe(0);
    await expect(logger.flush()).rejects.toThrow(
      "ULC Linz security-event persistence failed.",
    );
    expect(calls).toBe(1);
  });

  it("flushes an empty buffer without touching PostgreSQL", async () => {
    let calls = 0;
    const logger = createPostgresUlcLinzSecurityEventLogger({
      async unsafe() {
        calls += 1;
        return [];
      },
    });

    await logger.flush();
    expect(calls).toBe(0);
  });

  it("delegates retention to the fixed database-owned cleanup function without a caller cutoff", async () => {
    const calls: Array<{ query: string; parameters: readonly unknown[] | undefined }> = [];
    const client: UlcLinzSecurityEventSqlClient = {
      async unsafe(query, parameters) {
        calls.push({ query, parameters });
        return [];
      },
    };

    await purgeExpiredUlcLinzSecurityEvents(client);

    expect(calls).toHaveLength(1);
    const call = calls[0];
    if (call === undefined) throw new Error("Expected one retention cleanup statement.");
    expect(call.parameters).toBeUndefined();
    expect(call.query).toContain("public.appbasis_ulc_linz_purge_expired_security_events()");
    expect(call.query).not.toContain("DELETE");
    expect(call.query).not.toContain("$1");
  });
});
