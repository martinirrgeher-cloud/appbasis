import { describe, expect, it } from "vitest";

import {
  assessUlcAthleteDeletionRecovery,
  ULC_ATHLETE_DELETION_MARKER_DAYS,
} from "../worker/athlete-subject-deletion-recovery";
import type { UlcLinzAthleteSubjectDeletionPreflight } from "../worker/lifecycle-service";

/**
 * P03-F: recovery decision tests, NO writes.
 *
 * This assessment is only diagnostic. None of these results grants an erase,
 * retry, restore or promotion, even inside a valid 35-day source window.
 * A durable post-expiry authority requires the separate operator P01 decision.
 */
const NOW = new Date("2026-11-14T09:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function source(overrides: Partial<UlcLinzAthleteSubjectDeletionPreflight> = {}):
  UlcLinzAthleteSubjectDeletionPreflight {
  return {
    organizationId: "p03f-organization",
    subjectId: "p03f-subject",
    status: "owner-markers-match",
    completedAt: new Date(NOW.getTime() - 2 * DAY),
    planMarkerPresent: true,
    usageMarkerPresent: true,
    remainingPlans: 0,
    remainingAttributedUsageEvents: 0,
    ...overrides,
  };
}

describe("ULC P03-F fail-closed recovery authority boundaries", () => {
  it("treats a complete pair of owner markers as diagnostics, NEVER automatic erasure or restore authority", () => {
    const result = assessUlcAthleteDeletionRecovery(source(), NOW);
    expect(result).toMatchObject({
      state: "owner-markers-consistent",
      remainingAuthorityDays: 33,
      authorizesPostExpiryRetry: false,
      automaticActionAllowed: false,
    });
    expect(result.sourceAuthorityExpiresAt?.getTime()).toBe(
      NOW.getTime() + (ULC_ATHLETE_DELETION_MARKER_DAYS - 2) * DAY,
    );
    expect(JSON.stringify(result)).not.toContain("p03f-subject");
  });

  it("rejects even fully consistent owner snapshots one millisecond AFTER the 35-day source window", () => {
    const ended = new Date(NOW.getTime() - 35 * DAY - 1);
    const result = assessUlcAthleteDeletionRecovery(
      source({ completedAt: ended }), NOW,
    );
    expect(result).toMatchObject({
      state: "source-expired",
      remainingAuthorityDays: 0,
      automaticActionAllowed: false,
      authorizesPostExpiryRetry: false,
    });
  });

  it("never silently extends the 35-day window at the exact boundary", () => {
    const ended = new Date(NOW.getTime() - 35 * DAY);
    const boundary = assessUlcAthleteDeletionRecovery(
      source({ completedAt: ended }), NOW,
    );
    expect(boundary).toMatchObject({
      state: "owner-markers-consistent",
      remainingAuthorityDays: 0,
      automaticActionAllowed: false,
      authorizesPostExpiryRetry: false,
    });
    const past = assessUlcAthleteDeletionRecovery(
      source({ completedAt: ended }), new Date(NOW.getTime() + 1),
    );
    expect(past.state).toBe("source-expired");
  });

  it("requires urgent manual review of incomplete owners during the last seven days", () => {
    const result = assessUlcAthleteDeletionRecovery(source({
      status: "follow-up-pending",
      completedAt: new Date(NOW.getTime() - 30 * DAY),
      planMarkerPresent: false,
      usageMarkerPresent: true,
      remainingPlans: 1,
      remainingAttributedUsageEvents: 0,
    }), NOW);
    expect(result).toMatchObject({
      state: "urgent-manual-review",
      remainingAuthorityDays: 5,
      automaticActionAllowed: false,
    });
  });

  it("rejects an owner marker conflict rather than synthesizing global completion", () => {
    const result = assessUlcAthleteDeletionRecovery(source({
      status: "owner-marker-conflict",
      planMarkerPresent: true,
      usageMarkerPresent: false,
    }), NOW);
    expect(result).toMatchObject({
      state: "owner-conflict",
      automaticActionAllowed: false,
      authorizesPostExpiryRetry: false,
    });
  });

  it("treats a missing canonical source as unverifiable even when a previous snapshot appeared complete", () => {
    const result = assessUlcAthleteDeletionRecovery(source({
      status: "source-unverifiable",
      completedAt: null,
      planMarkerPresent: null,
      usageMarkerPresent: null,
      remainingPlans: null,
      remainingAttributedUsageEvents: null,
    }), NOW);
    expect(result).toMatchObject({
      state: "source-unverifiable",
      sourceAuthorityExpiresAt: null,
      remainingAuthorityDays: null,
      automaticActionAllowed: false,
      authorizesPostExpiryRetry: false,
    });
  });

  it("denies contradictory, future-dated or scope-invalid snapshots", () => {
    expect(() => assessUlcAthleteDeletionRecovery(source({
      status: "source-unverifiable",
      completedAt: null,
    }), NOW)).toThrow(/contradictory/);
    expect(() => assessUlcAthleteDeletionRecovery(source({
      completedAt: new Date(NOW.getTime() + DAY),
    }), NOW)).toThrow(/invalid/);
    expect(() => assessUlcAthleteDeletionRecovery(source({
      organizationId: "other ",
    }), NOW)).toThrow();
    expect(() => assessUlcAthleteDeletionRecovery(source({
      status: "owner-markers-match",
      remainingPlans: 1,
    }), NOW)).toThrow(/contradicted/);
  });
});
