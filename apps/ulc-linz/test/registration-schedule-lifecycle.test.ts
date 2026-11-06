import { describe, expect, it, vi } from "vitest";

import {
  reconcileDeletedRegistrationScheduleActor,
  replayRegistrationScheduleActorErasureForCurrentMarkers,
  UlcRegistrationScheduleLifecyclePrivacyBlockedError,
} from "../worker/registration-schedule-lifecycle";
import { runUlcLinzRetention } from "../worker/retention";
import { deleteUlcLinzIdentityWithCanonicalAuthorization } from "../worker/lifecycle-service";
import { principalId, roleId } from "@appbasis/permissions";
import { reconcileUlcLinzRestoredDatabase } from "../worker/restore-reconciliation";

const NOW = new Date("2026-11-05T18:30:00.000Z");
const MARKER = Object.freeze({
  identityId: "identity-deleted",
  organizationId: "verein-1",
  subjectId: "trainer-1",
  sourceRole: "trainer" as const,
  completedAt: new Date("2026-11-03T18:30:00.000Z"),
  purgeAfter: new Date("2026-12-08T18:30:00.000Z"),
});
const OK = Object.freeze({
  groupPolicies: 1, extraDays: 2, auditEvents: 3, totalRows: 6,
});
const privacy = (erasure = vi.fn(async () => OK)) => ({
  erasure: { redactAfterCompletedIdentityDeletion: erasure },
  now: () => NOW,
});

describe("A02.4 opt-in canonical deletion/retention/restore privacy coordination", () => {
  it("keeps pre-v12 calls unchanged, and scopes enabled calls to the trusted marker", async () => {
    const erasure = vi.fn(async () => OK);
    expect(await reconcileDeletedRegistrationScheduleActor(undefined, MARKER))
      .toBeNull();
    expect(erasure).not.toHaveBeenCalled();
    expect(await reconcileDeletedRegistrationScheduleActor(
      privacy(erasure), MARKER,
    )).toEqual(OK);
    expect(erasure).toHaveBeenCalledExactlyOnceWith({
      organizationId: MARKER.organizationId,
      identityId: MARKER.identityId,
      now: NOW,
    });
  });

  it("fails closed on invalid clock, incomplete result or failed database erasure", async () => {
    const rejects = (
      erasure: NonNullable<Parameters<
        typeof reconcileDeletedRegistrationScheduleActor
      >[0]>["erasure"]["redactAfterCompletedIdentityDeletion"],
    ) =>
      reconcileDeletedRegistrationScheduleActor({
        erasure: { redactAfterCompletedIdentityDeletion: erasure },
        now: () => NOW,
      }, MARKER);
    await expect(rejects(vi.fn(async () => ({
      groupPolicies: 1, extraDays: 2, auditEvents: 3, totalRows: 5,
    })))).rejects.toBeInstanceOf(
      UlcRegistrationScheduleLifecyclePrivacyBlockedError,
    );
    await expect(reconcileDeletedRegistrationScheduleActor({
      erasure: { redactAfterCompletedIdentityDeletion: vi.fn(async () => OK) },
      now: () => new Date(NaN),
    }, MARKER)).rejects.toBeInstanceOf(
      UlcRegistrationScheduleLifecyclePrivacyBlockedError,
    );
    const error = new Error("forced incomplete privacy cleanup");
    await expect(rejects(vi.fn(async () => { throw error; }))).rejects.toBe(error);
  });

  it("rejects duplicate/invalid authoritative markers before any redaction", async () => {
    const erasure = vi.fn(async () => OK);
    const markers = { listCurrentDeletionMarkers: vi.fn(async () => [
      MARKER, { ...MARKER },
    ]) };
    await expect(replayRegistrationScheduleActorErasureForCurrentMarkers(
      markers, privacy(erasure),
    )).rejects.toBeInstanceOf(
      UlcRegistrationScheduleLifecyclePrivacyBlockedError,
    );
    expect(erasure).not.toHaveBeenCalled();
    markers.listCurrentDeletionMarkers.mockResolvedValueOnce([MARKER]);
    expect(await replayRegistrationScheduleActorErasureForCurrentMarkers(
      markers, privacy(erasure),
    )).toBe(1);
    expect(erasure).toHaveBeenCalledTimes(1);
  });

  it("retention refuses an enabled privacy hook without an authoritative marker source", async () => {
    const evaluate = vi.fn(async () => []);
    const purgeMarkers = vi.fn(async () => 0);
    const base = {
      scopes: {
        evaluateRetention: evaluate,
        purgeExpiredDeletionMarkers: purgeMarkers,
        purgeExpiredLifecycleAuditEvents: vi.fn(async () => 0),
      },
      identityDeletionRetention: {
        purgeExpiredCompletedDeletions: vi.fn(async () => 0),
      },
    };
    await expect(runUlcLinzRetention({
      ...base, registrationSchedulePrivacy: privacy(),
    } as unknown as Parameters<typeof runUlcLinzRetention>[0]))
      .rejects.toBeTruthy();
    expect(evaluate).not.toHaveBeenCalled();
    expect(purgeMarkers).not.toHaveBeenCalled();
  });

  it("retention replays older marker erasures BEFORE querying due members or purging markers", async () => {
    const order: string[] = [];
    const erasure = vi.fn(async () => { order.push("redact"); return OK; });
    const result = await runUlcLinzRetention({
      registrationSchedulePrivacy: privacy(erasure),
      registrationScheduleDeletedMarkers: {
        async listCurrentDeletionMarkers() {
          order.push("list-markers");
          return [MARKER];
        },
      },
      scopes: {
        async evaluateRetention() { order.push("evaluate"); return []; },
        async purgeExpiredDeletionMarkers() { order.push("purge-markers"); return 0; },
        async purgeExpiredLifecycleAuditEvents() { order.push("purge-audit"); return 0; },
      },
      identityDeletionRetention: {
        async purgeExpiredCompletedDeletions() { order.push("purge-identity"); return 0; },
      },
    } as unknown as Parameters<typeof runUlcLinzRetention>[0]);
    expect(result.deletedIdentityIds).toEqual([]);
    expect(order).toEqual([
      "list-markers", "redact", "evaluate", "purge-markers",
      "purge-identity", "purge-audit",
    ]);
  });

  it("manual admin deletion invokes actor redaction only after the canonical app marker", async () => {
    const order: string[] = [];
    const erasure = vi.fn(async () => {
      order.push("redact");
      return OK;
    });
    const admin = principalId("admin-identity");
    const permissions = {
      async findPrincipal(id: string) {
        order.push("find-principal:" + id);
        return id === admin
          ? { principalId: admin, roleIds: [roleId("ulc-linz:admin")],
              grants: [], revokes: [] }
          : null;
      },
    };
    const dependencies = {
      permissions,
      scopes: {
        async resolveMembership() {
          return {
            organizationId: MARKER.organizationId,
            sourceRole: "admin", active: true,
          };
        },
        async findLifecycleTarget() { return null; },
        async findDeletionMarker() { return MARKER; },
        async completeIdentityDeletion() {
          order.push("complete-marker");
          return MARKER;
        },
      },
      identityDeletion: {
        async isDeletionCompleted() {
          order.push("identity-already-deleted");
          return true;
        },
      },
      registrationSchedulePrivacy: privacy(erasure),
    } as unknown as Parameters<typeof deleteUlcLinzIdentityWithCanonicalAuthorization>[1];
    const current = {
      access: "full",
      identity: { identityId: "admin-identity" },
    } as unknown as Parameters<typeof deleteUlcLinzIdentityWithCanonicalAuthorization>[0];
    const request = {
      organizationId: MARKER.organizationId,
      targetIdentityId: MARKER.identityId,
    };

    const result = await deleteUlcLinzIdentityWithCanonicalAuthorization(
      current, dependencies, request,
    );
    expect(result).toMatchObject({ identityDeleted: true, alreadyDeleted: true });
    expect(order.slice(-2)).toEqual(["complete-marker", "redact"]);
    expect(erasure).toHaveBeenCalledExactlyOnceWith({
      organizationId: MARKER.organizationId,
      identityId: MARKER.identityId,
      now: NOW,
    });

    const failure = new Error("crashed after canonical deletion");
    const failedDependencies = {
      ...dependencies,
      registrationSchedulePrivacy: privacy(vi.fn(async () => { throw failure; })),
    };
    await expect(deleteUlcLinzIdentityWithCanonicalAuthorization(
      current, failedDependencies, request,
    )).rejects.toBe(failure);
    // Canonical tombstone permits the entire authorized operation to be
    // retried; no special bypass or manual actor identity is accepted.
    await expect(deleteUlcLinzIdentityWithCanonicalAuthorization(
      current, dependencies, request,
    )).resolves.toMatchObject({ identityDeleted: true });
  });

  it("restore reconciliation re-erases only after canonical owner and target marker reconciliation", async () => {
    const order: string[] = [];
    const erasure = vi.fn(async () => { order.push("redact"); return OK; });
    const target = {
      identity: {},
      identityDeletion: {
        async isDeletionCompleted() { order.push("identity-already-deleted"); return true; },
      },
      permissions: {
        async findPrincipal() { order.push("find-principal"); return null; },
      },
      scopes: {
        async findLifecycleTarget() { return null; },
        async findDeletionMarker() { return MARKER; },
        async completeIdentityDeletion() {
          order.push("complete-marker");
          return MARKER;
        },
      },
      registrationSchedulePrivacy: privacy(erasure),
    } as unknown as Parameters<typeof reconcileUlcLinzRestoredDatabase>[1];
    const source = { async listCurrentDeletionMarkers() { return [MARKER]; } };
    const result = await reconcileUlcLinzRestoredDatabase(source, target);
    expect(result).toEqual({
      requiredDeletionCount: 1,
      reconciledIdentityIds: [MARKER.identityId],
    });
    expect(order).toEqual([
      "identity-already-deleted", "find-principal",
      "complete-marker", "redact",
    ]);
    expect(erasure).toHaveBeenCalledExactlyOnceWith({
      organizationId: MARKER.organizationId,
      identityId: MARKER.identityId,
      now: NOW,
    });
  });

  it("restores functionary deletion markers that the published app schema permits", async () => {
    const functionaryMarker = { ...MARKER,
      identityId: "functionary-deleted", subjectId: "functionary-1",
      sourceRole: "functionary" as const,
    };
    const erasure = vi.fn(async () => OK);
    const target = {
      identityDeletion: { async isDeletionCompleted() { return true; } },
      permissions: { async findPrincipal() { return null; } },
      scopes: {
        async findLifecycleTarget() { return null; },
        async findDeletionMarker() { return functionaryMarker; },
        async completeIdentityDeletion() { return functionaryMarker; },
      },
      registrationSchedulePrivacy: privacy(erasure),
    } as unknown as Parameters<typeof reconcileUlcLinzRestoredDatabase>[1];
    await expect(reconcileUlcLinzRestoredDatabase({
      async listCurrentDeletionMarkers() { return [functionaryMarker]; },
    }, target)).resolves.toEqual({
      requiredDeletionCount: 1,
      reconciledIdentityIds: ["functionary-deleted"],
    });
    expect(erasure).toHaveBeenCalledExactlyOnceWith({
      organizationId: MARKER.organizationId,
      identityId: "functionary-deleted",
      now: NOW,
    });
  });

  it("restore replay fails rather than promoting a partially redacted target", async () => {
    const error = new Error("failed to redact restored actor references");
    const target = {
      identity: {},
      identityDeletion: {
        async isDeletionCompleted() { return true; },
      },
      permissions: { async findPrincipal() { return null; } },
      scopes: {
        async findLifecycleTarget() { return null; },
        async findDeletionMarker() { return MARKER; },
        async completeIdentityDeletion() { return MARKER; },
      },
      registrationSchedulePrivacy: privacy(vi.fn(async () => { throw error; })),
    } as unknown as Parameters<typeof reconcileUlcLinzRestoredDatabase>[1];
    await expect(reconcileUlcLinzRestoredDatabase(
      { async listCurrentDeletionMarkers() { return [MARKER]; } }, target,
    )).rejects.toBe(error);
  });
});
