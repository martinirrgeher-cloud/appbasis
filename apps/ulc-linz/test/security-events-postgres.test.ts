import { describe, expect, it } from "vitest";

import {
  createPostgresUlcLinzSecurityEventLogger,
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
    await logger.flush();

    expect(calls).toHaveLength(1);
    expect(calls[0].query).toContain("INSERT INTO ulc_linz_security_event_log");
    expect(calls[0].query).toContain("interval '12 months'");
    expect(calls[0].parameters).toEqual([
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
    expect(calls[0].parameters).not.toContain("password");
    expect(calls[0].parameters).not.toContain("cookie");
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
    await logger.flush();

    expect(calls).toHaveLength(1);
    expect(calls[0].query).not.toContain("payload");
    expect(calls[0].parameters).toEqual([
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
    const logger = createPostgresUlcLinzSecurityEventLogger({
      async unsafe() {
        throw new Error("postgresql://secret-host/private");
      },
    });

    expect(() => logger.record(identityDeniedEvent)).not.toThrow();
    await expect(logger.flush()).rejects.toThrow(
      "ULC Linz security-event persistence failed.",
    );
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
});
