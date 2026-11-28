import { describe, expect, it, vi } from "vitest";
import { createUlcClubAdminRecoveryGuard } from "../worker/club-admin-recovery-guard";
import type { CurrentIdentity } from "@appbasis/identity";

function current(username: string, mustChangePassword: boolean): CurrentIdentity {
  return {
    sessionToken: "test-session-token",
    access: mustChangePassword ? "password-change-required" : "full",
    identity: {
      identityId: username, username, displayName: username,
      contactEmail: null, personId: null, mustChangePassword,
      accountStatus: "active", createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"), passwordChangedAt: null, disabledAt: null,
    },
  };
}

describe("ULC club admin expiring recovery", () => {
  const now = () => new Date("2026-11-28T15:00:00Z");
  it("does not inspect trainers or already-changed admin credentials", async () => {
    const unsafe = vi.fn();
    const trainer = current("trainer.one", true);
    const done = current("ulc.admin", false);
    const base = {
      signInWithUsername: vi.fn().mockResolvedValue(trainer),
      getCurrentIdentity: vi.fn().mockResolvedValue(done),
      changeRequiredPassword: vi.fn(), endSession: vi.fn(),
    };
    const s = createUlcClubAdminRecoveryGuard(base, { unsafe }, now);
    await expect(s.signInWithUsername({ username: "trainer.one", password: "x" })).resolves.toEqual(trainer);
    await expect(s.getCurrentIdentity("token")).resolves.toEqual(done);
    expect(unsafe).not.toHaveBeenCalled();
  });
  it("accepts initial provisioning and allows a valid two-hour window", async () => {
    const admin = current("ulc.admin", true);
    const base = {
      signInWithUsername: vi.fn().mockResolvedValue(admin),
      getCurrentIdentity: vi.fn().mockResolvedValue(admin),
      changeRequiredPassword: vi.fn().mockResolvedValue(current("ulc.admin", false)),
      endSession: vi.fn(),
    };
    const unsafe = vi.fn().mockResolvedValue([]);
    const s = createUlcClubAdminRecoveryGuard(base, { unsafe }, now);
    await expect(s.signInWithUsername({ username: "ulc.admin", password: "x" })).resolves.toEqual(admin);
    unsafe.mockResolvedValue([{ expires_at: "2026-11-28T16:00:00Z" }]);
    await expect(s.changeRequiredPassword({
      sessionToken: "test-session-token", currentPassword: "x",
      newPassword: "new-pass", idempotencyKey: "id",
    })).resolves.toMatchObject({ access: "full" });
  });
  it("denies expired recovery at login, existing session and password change", async () => {
    const admin = current("ulc.admin", true);
    const base = {
      signInWithUsername: vi.fn().mockResolvedValue(admin),
      getCurrentIdentity: vi.fn().mockResolvedValue(admin),
      changeRequiredPassword: vi.fn(), endSession: vi.fn(),
    };
    const s = createUlcClubAdminRecoveryGuard(base, {
      unsafe: vi.fn().mockResolvedValue([{ expires_at: "2026-11-28T15:00:00Z" }]),
    }, now);
    await expect(s.signInWithUsername({ username: "ulc.admin", password: "x" }))
      .rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
    await expect(s.getCurrentIdentity("test-session-token"))
      .rejects.toMatchObject({ code: "SESSION_INVALID" });
    await expect(s.changeRequiredPassword({
      sessionToken: "test-session-token", currentPassword: "x",
      newPassword: "new", idempotencyKey: "id",
    })).rejects.toMatchObject({ code: "SESSION_INVALID" });
    expect(base.endSession).toHaveBeenCalled();
    expect(base.changeRequiredPassword).not.toHaveBeenCalled();
  });
  it("fails closed on unreadable deadline", async () => {
    const admin = current("ulc.admin", true);
    const base = {
      signInWithUsername: vi.fn().mockResolvedValue(admin),
      getCurrentIdentity: vi.fn().mockResolvedValue(admin),
      changeRequiredPassword: vi.fn(), endSession: vi.fn(),
    };
    const s = createUlcClubAdminRecoveryGuard(base, {
      unsafe: vi.fn().mockResolvedValue([{ expires_at: "invalid" }]),
    }, now);
    await expect(s.getCurrentIdentity("token")).rejects.toMatchObject({ code: "SESSION_INVALID" });
  });
});
