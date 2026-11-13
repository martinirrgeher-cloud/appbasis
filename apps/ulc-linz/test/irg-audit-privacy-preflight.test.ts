import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { UlcLinzAuthorizationDeniedError } from "../worker/authorization";
import { inspectUlcIrgAuditRetention } from "../worker/irg-audit-privacy-preflight";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("N16 unexposed IRG audit privacy/retention/export contract", () => {
  it("is review-only and never registers migrations or releases raw audit in M5-E", () => {
    const contract = JSON.parse(read("../privacy/n16-irg-audit-contract.json"));
    const manifest = JSON.parse(read("../appbasis.database.json"));
    const exportContract = JSON.parse(read("../privacy/m5-export-contract.json"));
    const sql = read("../migrations/0017_ulc_linz_performance_registration_module.sql");
    const admin = read("../worker/irg-module-administration.ts");
    const router = read("../worker/index.ts");
    const owner = manifest.owners.find((candidate: { id: string }) =>
      candidate.id === "ulc-linz-lifecycle",
    );
    expect(owner?.schemaVersion).toBe(16);
    expect(owner.migrations).not.toContain("apps/ulc-linz/migrations/0016_ulc_linz_registration_calendar.sql");
    expect(owner.migrations).not.toContain("apps/ulc-linz/migrations/0017_ulc_linz_performance_registration_module.sql");
    expect(contract.personalAudit.retention.period).toBe("P12M");
    expect(contract.personalAudit.export.dataRelease).toBe("blocked");
    expect(contract.activation).toMatchObject({
      migrationManifestRegistration: false, providerWrites: false,
      staffRoute: false, exportRoute: false, purgeRoute: false,
    });
    expect(exportContract.datasets).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "irg-audit" }),
    ]));
    expect(router).not.toContain('from "./irg-audit-privacy-preflight"');
    expect(sql).toContain("CREATE TABLE ulc_linz_irg_module_assignment_once_marker");
    expect(sql).toContain("CONSTRAINT ulc_linz_irg_module_assignment_once");
    expect(sql).not.toContain("CREATE TABLE ulc_linz_irg_module_assignment_once (");
    expect(sql).toContain("REVOKE ALL ON TABLE public.ulc_linz_irg_module_assignment_audit FROM PUBLIC");
    expect(admin).toContain("INSERT INTO ulc_linz_irg_module_assignment_once_marker");
    // Keep the aggregate timestamp's transport type stable across drivers.
    const preflight = read("../worker/irg-audit-privacy-preflight.ts");
    expect(preflight).toContain(
      "extract(epoch FROM min(retained_until))::double precision AS first_due_epoch",
    );
    expect(preflight).not.toContain("firstDue instanceof Date");
  });

  it("denies raw/nontransactional requests before issuing a SQL query", async () => {
    const unsafe = vi.fn(async (_query: string, _params?: (string|number|boolean|null)[]) =>
      [] as readonly Record<string, unknown>[],
    );
    const input = {
      actorIdentityId: "admin", trustedSessionId: "session", organizationId: "org",
    };
    await expect(inspectUlcIrgAuditRetention({ unsafe }, input))
      .rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
    await expect(inspectUlcIrgAuditRetention({ unsafe }, {
      ...input, organizationId: " org",
    })).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
    expect(unsafe).not.toHaveBeenCalled();
  });
});
