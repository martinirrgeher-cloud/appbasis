import { describe, expect, it, vi } from "vitest";
import { PostgresUlcLinzUserAdminOverview } from "../worker/user-admin-overview";

const rows = [{
  identity_id: "identity-1",
  username: "test.trainer",
  display_name: "Test Trainer",
  source_role: "trainer",
  subject_id: "trainer-1",
  active: true,
  blocked: false,
}];

describe("ULC admin user directory", () => {
  it("lists only tenant-scoped accounts without credentials", async () => {
    const unsafe = vi.fn(async () => rows);
    const directory = new PostgresUlcLinzUserAdminOverview({ unsafe });
    const result = await directory.listUsers("ulc-linz-preview");
    expect(unsafe).toHaveBeenCalledOnce();
    const [sql, parameters] = unsafe.mock.calls[0]!;
    expect(sql).toContain("membership.organization_id = $1");
    expect(sql).toContain('JOIN "user" AS account');
    expect(sql).not.toContain("account.password");
    expect(sql).not.toContain("session.token");
    expect(parameters).toEqual(["ulc-linz-preview"]);
    expect(result).toEqual([{
      identityId: "identity-1",
      username: "test.trainer",
      displayName: "Test Trainer",
      sourceRole: "trainer",
      subjectId: "trainer-1",
      active: true,
      blocked: false,
    }]);
  });

  it("rejects invalid organization scoping", async () => {
    const unsafe = vi.fn(async () => rows);
    const directory = new PostgresUlcLinzUserAdminOverview({ unsafe });
    await expect(directory.listUsers("")).rejects.toThrow();
    await expect(directory.listUsers("other ")).rejects.toThrow();
    expect(unsafe).not.toHaveBeenCalled();
  });

  it("rejects unknown or conflicting membership results", async () => {
    const duplicates = new PostgresUlcLinzUserAdminOverview({
      async unsafe() { return [...rows, ...rows]; },
    });
    await expect(duplicates.listUsers("ulc-linz-preview")).rejects.toThrow();
    const unknown = new PostgresUlcLinzUserAdminOverview({
      async unsafe() { return [{ ...rows[0], source_role: "outsider" }]; },
    });
    await expect(unknown.listUsers("ulc-linz-preview")).rejects.toThrow();
  });
});
