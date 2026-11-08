import { describe, expect, it, vi } from "vitest";
import {
  assertUlcG04PreviewCalendarReadiness,
  UlcRegistrationCalendarActivationError,
  verifyUlcG04PreviewCalendarReadiness,
} from "../worker/registration-calendar-activation";
import type { UlcRegistrationCalendarSqlClient } from "../worker/registration-calendar-postgres";

const ready = {
  database_name: "appbasis_ulc_linz_preview",
  principal_name: "appbasis_ulc_linz_preview_application",
  rule_table: true,
  exception_table: true,
  guard_function: true,
  guard_trigger: true,
  rule_read: true,
  rule_insert: true,
  rule_update: true,
  exception_read: true,
  exception_insert: true,
  exception_update: true,
};

describe("G-04.2c isolated Preview calendar runtime attestation", () => {
  it("recognizes only a fully privileged v17 Preview schema and enabled trigger", () => {
    expect(() => assertUlcG04PreviewCalendarReadiness(ready)).not.toThrow();
    const rejected = [
      { ...ready, database_name: "production" },
      { ...ready, principal_name: "appbasis_ulc_linz_preview_migration" },
      { ...ready, rule_table: false },
      { ...ready, exception_table: false },
      { ...ready, guard_function: false },
      { ...ready, guard_trigger: false },
      { ...ready, rule_read: false },
      { ...ready, rule_insert: false },
      { ...ready, rule_update: false },
      { ...ready, exception_read: false },
      { ...ready, exception_insert: false },
      { ...ready, exception_update: false },
    ];
    for (const state of rejected) {
      expect(() => assertUlcG04PreviewCalendarReadiness(state))
        .toThrow(UlcRegistrationCalendarActivationError);
    }
    for (const invalid of [null, {}, [], true]) {
      expect(() => assertUlcG04PreviewCalendarReadiness(invalid))
        .toThrow(UlcRegistrationCalendarActivationError);
    }
  });

  it("interrogates the live SQL connection, not caller-provided UI flags", async () => {
    const unsafe = vi.fn(async (sql: string) => {
      expect(sql).toContain("current_database()");
      expect(sql).toContain("current_user");
      expect(sql).toContain("ulc_linz_registration_calendar_guard_trg");
      expect(sql).toContain("has_table_privilege");
      return [ready];
    });
    await expect(verifyUlcG04PreviewCalendarReadiness({
      unsafe,
    } as UlcRegistrationCalendarSqlClient)).resolves.toBeUndefined();
    expect(unsafe).toHaveBeenCalledTimes(1);
    unsafe.mockResolvedValueOnce([{ ...ready, guard_trigger: false }]);
    await expect(verifyUlcG04PreviewCalendarReadiness({
      unsafe,
    } as UlcRegistrationCalendarSqlClient))
      .rejects.toBeInstanceOf(UlcRegistrationCalendarActivationError);
    unsafe.mockResolvedValueOnce([]);
    await expect(verifyUlcG04PreviewCalendarReadiness({
      unsafe,
    } as UlcRegistrationCalendarSqlClient))
      .rejects.toBeInstanceOf(UlcRegistrationCalendarActivationError);
  });
});
