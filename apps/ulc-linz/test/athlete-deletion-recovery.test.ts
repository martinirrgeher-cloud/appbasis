import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import {
  assessUlcAthleteDeletionRecovery,
  ULC_ATHLETE_DELETION_MARKER_DAYS,
  ULC_ATHLETE_DELETION_URGENT_REVIEW_DAYS,
} from "../worker/athlete-subject-deletion-recovery";
import type { UlcLinzAthleteSubjectDeletionPreflight } from "../worker/lifecycle-service";

const NOW = new Date("2026-11-03T12:00:00.000Z");
const COMPLETED = new Date("2026-11-01T12:00:00.000Z");

function preflight(
  changes: Partial<UlcLinzAthleteSubjectDeletionPreflight> = {},
): UlcLinzAthleteSubjectDeletionPreflight {
  return {
    organizationId: "ulc-organization-private",
    subjectId: "sensitive-athlete-id",
    status: "follow-up-pending",
    completedAt: new Date(COMPLETED),
    planMarkerPresent: true,
    usageMarkerPresent: false,
    remainingPlans: 0,
    remainingAttributedUsageEvents: 1,
    ...changes,
  };
}

describe("ULC athlete dependent deletion recovery review (unwired)", () => {
  it("reports a pending follow-up without enabling any automatic action", () => {
    const result = assessUlcAthleteDeletionRecovery(preflight(), NOW);
    expect(result).toEqual({
      state: "pending",
      sourceAuthorityExpiresAt: new Date("2026-12-06T12:00:00.000Z"),
      remainingAuthorityDays: 33,
      authorizesPostExpiryRetry: false,
      automaticActionAllowed: false,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(JSON.stringify(result)).not.toContain("sensitive-athlete-id");
    expect(JSON.stringify(result)).not.toContain("ulc-organization-private");
  });

  it("escalates open work within seven days without extending retention", () => {
    const nearExpiry = preflight({
      completedAt: new Date("2026-10-01T12:00:00.000Z"),
    });
    expect(assessUlcAthleteDeletionRecovery(nearExpiry, NOW)).toMatchObject({
      state: "urgent-manual-review",
      remainingAuthorityDays: 2,
      authorizesPostExpiryRetry: false,
      automaticActionAllowed: false,
    });
    const exact = new Date("2026-11-05T12:00:00.000Z");
    expect(assessUlcAthleteDeletionRecovery(nearExpiry, exact)).toMatchObject({
      state: "urgent-manual-review", remainingAuthorityDays: 0,
    });
    expect(assessUlcAthleteDeletionRecovery(
      nearExpiry, new Date(exact.getTime() + 1),
    )).toMatchObject({
      state: "source-expired", remainingAuthorityDays: 0,
      authorizesPostExpiryRetry: false,
    });
  });

  it("never infers a post-expiry authorization from a previously complete snapshot", () => {
    const completed = preflight({
      status: "owner-markers-match",
      planMarkerPresent: true, usageMarkerPresent: true,
      remainingPlans: 0, remainingAttributedUsageEvents: 0,
      completedAt: new Date("2026-09-01T12:00:00.000Z"),
    });
    expect(assessUlcAthleteDeletionRecovery(completed, NOW)).toMatchObject({
      state: "source-expired",
      authorizesPostExpiryRetry: false,
      automaticActionAllowed: false,
    });
  });

  it("distinguishes a current consistent snapshot from approved full deletion", () => {
    expect(assessUlcAthleteDeletionRecovery(preflight({
      status: "owner-markers-match",
      planMarkerPresent: true, usageMarkerPresent: true,
      remainingPlans: 0, remainingAttributedUsageEvents: 0,
    }), NOW)).toMatchObject({
      state: "owner-markers-consistent",
      authorizesPostExpiryRetry: false, automaticActionAllowed: false,
    });
  });

  it("prioritizes mismatched markers as an immediate manual conflict", () => {
    expect(assessUlcAthleteDeletionRecovery(preflight({
      status: "owner-marker-conflict",
      planMarkerPresent: true, usageMarkerPresent: true,
    }), NOW)).toMatchObject({
      state: "owner-conflict",
      authorizesPostExpiryRetry: false,
      automaticActionAllowed: false,
    });
  });

  it("does not consult or expose owner state when the source marker is missing", () => {
    const result = assessUlcAthleteDeletionRecovery(preflight({
      status: "source-unverifiable",
      completedAt: null,
      planMarkerPresent: null,
      usageMarkerPresent: null,
      remainingPlans: null,
      remainingAttributedUsageEvents: null,
    }), NOW);
    expect(result).toEqual({
      state: "source-unverifiable",
      sourceAuthorityExpiresAt: null, remainingAuthorityDays: null,
      authorizesPostExpiryRetry: false, automaticActionAllowed: false,
    });
  });

  it("rejects forged, inconsistent or malformed input instead of masking source drift", () => {
    const invalid = [
      preflight({ organizationId: " other-org " }),
      preflight({ subjectId: "sensitive\u0000athlete" }),
      preflight({ completedAt: new Date(NaN) }),
      preflight({ completedAt: new Date("2026-11-04T12:00:00.000Z") }),
      preflight({ remainingPlans: -1 }),
      preflight({ remainingAttributedUsageEvents: Number.NaN }),
      preflight({
        status: "owner-markers-match", usageMarkerPresent: false,
      }),
      preflight({
        status: "owner-markers-match", usageMarkerPresent: true,
        remainingAttributedUsageEvents: 1,
      }),
      preflight({
        status: "follow-up-pending", usageMarkerPresent: true,
        remainingAttributedUsageEvents: 0,
      }),
      preflight({
        status: "owner-marker-conflict",
        planMarkerPresent: false, usageMarkerPresent: false,
      }),
      preflight({ status: "unknown" as never }),
      preflight({
        status: "source-unverifiable",
        completedAt: null,
      }),
    ];
    for (const entry of invalid) {
      expect(() => assessUlcAthleteDeletionRecovery(entry, NOW)).toThrow();
    }
    expect(() => assessUlcAthleteDeletionRecovery(
      preflight(), new Date(NaN),
    )).toThrow();
  });

  it("keeps the reviewed durable-storage gate blocked and does not invent post-expiry authority", async () => {
    const policy = JSON.parse(await readFile(
      new URL("../privacy/athlete-deletion-recovery-policy.json", import.meta.url),
      "utf8",
    )) as Record<string, any>;
    expect(policy.status).toBe("blocked-pending-operator-privacy-policy");
    expect(policy.currentSourceAuthority.markerRetentionDays)
      .toBe(ULC_ATHLETE_DELETION_MARKER_DAYS);
    expect(policy.urgentReview.daysBeforeExpiry)
      .toBe(ULC_ATHLETE_DELETION_URGENT_REVIEW_DAYS);
    expect(policy.currentSourceAuthority.postExpiryRetry).toBe("deny");
    for (const value of Object.values(
      policy.futureDurableDecisionRequirements as Record<string, string>,
    )) {
      expect(value).not.toBe("approved");
      expect(value).not.toBe("verified");
    }
    expect(Object.values(policy.deployment)).toEqual([
      false, false, false, false, false,
    ]);
    expect(policy.forbiddenAssumptions).toContain(
      "no-subject-id-storage-beyond-35-days-without-reviewed-policy",
    );
    const runtime = await readFile(
      new URL("../worker/postgres.ts", import.meta.url), "utf8",
    );
    expect(runtime).not.toContain("assessUlcAthleteDeletionRecovery");
    expect(runtime).not.toContain("athlete-deletion-recovery-policy");
  });
});
