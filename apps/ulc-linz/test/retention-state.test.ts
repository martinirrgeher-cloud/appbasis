import { describe, expect, it } from "vitest";

import { PostgresUlcLinzScopePersistence } from "../worker/scope-persistence";

const now = new Date("2026-08-18T10:30:00.000Z");

function fakeSql(rows: readonly Record<string, unknown>[]) {
  return {
    async unsafe() {
      return [...rows];
    },
  } as unknown as ConstructorParameters<typeof PostgresUlcLinzScopePersistence>[0];
}

describe("ULC Linz deterministic retention state", () => {
  it("keeps the exact 12-month boundary, deletes overdue records and re-evaluates expired exceptions", async () => {
    const persistence = new PostgresUlcLinzScopePersistence(
      fakeSql([
        {
          identity_id: "active-member",
          organization_id: "ulc-linz",
          subject_id: "subject-active",
          source_role: "trainer",
          active: true,
          ended_at: null,
          retention_exception_reason: null,
          retention_exception_actor: null,
          retention_review_at: null,
        },
        {
          identity_id: "exact-boundary",
          organization_id: "ulc-linz",
          subject_id: "subject-boundary",
          source_role: "athlete",
          active: false,
          ended_at: "2025-08-18T10:30:00.000Z",
          retention_exception_reason: null,
          retention_exception_actor: null,
          retention_review_at: null,
        },
        {
          identity_id: "overdue",
          organization_id: "ulc-linz",
          subject_id: "subject-overdue",
          source_role: "parent",
          active: false,
          ended_at: "2025-08-17T10:30:00.000Z",
          retention_exception_reason: null,
          retention_exception_actor: null,
          retention_review_at: null,
        },
        {
          identity_id: "future-review",
          organization_id: "ulc-linz",
          subject_id: "subject-future-review",
          source_role: "parent",
          active: false,
          ended_at: "2025-07-18T10:30:00.000Z",
          retention_exception_reason: "legal-hold",
          retention_exception_actor: "ulc-admin",
          retention_review_at: "2026-10-18T10:30:00.000Z",
        },
        {
          identity_id: "expired-review",
          organization_id: "ulc-linz",
          subject_id: "subject-expired-review",
          source_role: "parent",
          active: false,
          ended_at: "2025-07-18T10:30:00.000Z",
          retention_exception_reason: "legal-hold",
          retention_exception_actor: "ulc-admin",
          retention_review_at: "2026-08-18T10:29:59.999Z",
        },
      ]),
      () => now,
    );

    const states = await persistence.evaluateRetention();
    expect(states.map((state) => [state.target.identityId, state.status])).toEqual([
      ["active-member", "active"],
      ["exact-boundary", "active"],
      ["overdue", "due"],
      ["future-review", "exception"],
      ["expired-review", "due"],
    ]);
  });

  it("fails closed on an impossible inactive admin lifecycle row", async () => {
    const persistence = new PostgresUlcLinzScopePersistence(
      fakeSql([
        {
          identity_id: "invalid-admin",
          organization_id: "ulc-linz",
          subject_id: "subject-admin",
          source_role: "admin",
          active: false,
          ended_at: "2025-07-18T10:30:00.000Z",
          retention_exception_reason: null,
          retention_exception_actor: null,
          retention_review_at: null,
        },
      ]),
      () => now,
    );

    await expect(persistence.evaluateRetention()).rejects.toMatchObject({
      code: "ULC_LINZ_SCOPE_PERSISTENCE_BLOCKED",
    });
  });
});
