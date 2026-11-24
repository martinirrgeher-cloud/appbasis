import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  requireUniqueUlcT07AthleteIdentity,
  requireMatchingUlcT07BlockFavoriteMarker,
  ULC_T07_LINKED_IDENTITY_SQL,
  ULC_T07_BLOCK_FAVORITE_MARKER_SQL,
} from "../worker/t07-identity-owner-follow-up";

const source = new Date("2026-11-22T12:00:00.000Z");
const now = new Date("2026-11-24T12:00:00.000Z");
const identity = "deleted-athlete-principal";
const expiry = new Date(source.getTime() + 35 * 86400_000);
const membership = { identity_id: identity, source_role: "athlete",
  record_source: "live", completed_at: null, purge_after: null };
const deleted = { ...membership, record_source: "deleted",
  completed_at: new Date("2026-11-23T12:00:00.000Z"),
  purge_after: new Date("2026-12-28T12:00:00.000Z") };
const sql = vi.fn(async (statement: string): Promise<readonly Record<string, unknown>[]> =>
  statement === ULC_T07_LINKED_IDENTITY_SQL ? [membership] : []);

describe("T07 canonical identity discovery and strict block favorite marker", () => {
  beforeEach(() => vi.clearAllMocks());

  it("accepts exactly one current same-org live athlete identity, no names or notes", async () => {
    const result = await requireUniqueUlcT07AthleteIdentity(
      { unsafe: sql }, "ulc-linz", "athlete-1", source, now,
    );
    expect(result).toEqual({ identityId: identity, wasAlreadyDeleted: false });
    expect(sql).toHaveBeenCalledWith(
      ULC_T07_LINKED_IDENTITY_SQL, ["ulc-linz", "athlete-1"],
    );
    expect(ULC_T07_LINKED_IDENTITY_SQL).toContain("source_role='athlete'");
  });

  it("accepts one previous same-org deletion marker only inside original 35-day window", async () => {
    sql.mockResolvedValueOnce([deleted]);
    const result = await requireUniqueUlcT07AthleteIdentity(
      { unsafe: sql }, "ulc-linz", "athlete-1", source, now,
    );
    expect(result.wasAlreadyDeleted).toBe(true);
    expect(result.identityId).toBe(identity);
  });

  it("fails closed on none, duplicate, expired, foreign role, malformed marker or future source", async () => {
    const inspector = () => requireUniqueUlcT07AthleteIdentity(
      { unsafe: sql }, "ulc-linz", "athlete-1", source, now,
    );
    for (const rows of [
      [], [membership, deleted],
      [{ ...membership, source_role: "admin" }],
      [{ ...deleted, purge_after: new Date("2026-11-23T20:00:00.000Z") }],
      [{ ...deleted, completed_at: new Date("2026-11-27T20:00:00.000Z") }],
      [{ ...membership, completed_at: source }],
      [{ ...membership, record_source: "unknown" }],
      [{ ...membership, identity_id: " " }],
    ]) {
      sql.mockResolvedValueOnce(rows as never);
      await expect(inspector()).rejects.toThrow();
    }
    await expect(requireUniqueUlcT07AthleteIdentity(
      { unsafe: sql }, "ulc-linz", "athlete-1", new Date("invalid"), now,
    )).rejects.toThrow(/authority/);
  });

  it("blocks stale/conflicting favorite markers and confirms an exact physical post-marker", async () => {
    const target = () => requireMatchingUlcT07BlockFavoriteMarker(
      { unsafe: sql }, "ulc-linz", identity, source, now,
    );
    sql.mockResolvedValueOnce([]);
    expect(await target()).toBe(false);
    sql.mockResolvedValueOnce([{ completed_at: source, purge_after: expiry }]);
    expect(await target()).toBe(true);
    expect(sql).toHaveBeenCalledWith(ULC_T07_BLOCK_FAVORITE_MARKER_SQL, [
      "ulc-linz", identity,
    ]);
    for (const rows of [
      [{ completed_at: new Date("2026-11-21T12:00:00.000Z"), purge_after: expiry }],
      [{ completed_at: source, purge_after: source }],
      [{ completed_at: source, purge_after: new Date("invalid") }],
      [{ completed_at: source, purge_after: expiry }, { completed_at: source, purge_after: expiry }],
    ]) {
      sql.mockResolvedValueOnce(rows as never);
      await expect(target()).rejects.toThrow();
    }
  });
});
