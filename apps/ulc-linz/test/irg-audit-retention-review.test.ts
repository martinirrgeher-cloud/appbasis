import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { UlcLinzAuthorizationDeniedError } from "../worker/authorization";
import { reviewUlcIrgAuditRetentionWithoutDeleting } from "../worker/irg-audit-retention-review";

const read = (path:string) => readFileSync(new URL(path,import.meta.url),"utf8");
const request = {
  actorIdentityId:"operator-admin",
  trustedSessionId:"server-session",
  organizationId:"org-a",
};
describe("N16 fail-closed IRG retention read-only review contract", () => {
  it("has no authorized controller evidence, runnable purge or live router", () => {
    const ledger=JSON.parse(read("../privacy/n16-irg-retention-controller-decision.json"));
    const privacy=JSON.parse(read("../privacy/n16-irg-audit-contract.json"));
    const router=read("../worker/index.ts");
    const plan=read("../worker/irg-audit-retention-review.ts");
    const runtime=read("../worker/retention.ts");
    expect(ledger).toMatchObject({
      schemaVersion:1,application:"ulc-linz",
      status:"blocked-pending-controller-privacy-and-recovery-approval",
      execution:{
        enabled:false,purgeRoute:false,scheduler:false,providerWrites:false,
        remoteDatabaseAccess:false,eligibleForPreviewMigration:false,
      },
    });
    expect(ledger.decision).toEqual(expect.objectContaining({
      controllerIdentity:null,legalBasis:null,
      legalHoldAssessment:null,restoreReconciliationProcedure:null,
      accessAuditAndPurgeActorRole:null,
    }));
    expect(privacy.personalAudit.retention).toMatchObject({
      automaticPurgeEnabled:false,dryRunOnly:true,
      purgeImplementationApproved:false,
    });
    expect(router).not.toContain('from "./irg-audit-retention-review"');
    expect(runtime).not.toContain("reviewUlcIrgAuditRetentionWithoutDeleting");
    expect(plan).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(plan).not.toMatch(/\bTRUNCATE\s+TABLE\b/i);
    expect(plan).not.toMatch(/\bUPDATE\s+\w+\s+SET\b/i);
  });

  it("rejects missing transaction and malformed organization before query", async () => {
    const unsafe=vi.fn(async (_query:string,_params?:readonly (string|number|boolean|null)[]) =>
      [] as readonly Record<string,unknown>[],
    );
    await expect(reviewUlcIrgAuditRetentionWithoutDeleting({unsafe},request))
      .rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
    await expect(reviewUlcIrgAuditRetentionWithoutDeleting({unsafe},{
      ...request,organizationId:" org-a",
    })).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
    expect(unsafe).not.toHaveBeenCalled();
  });
});
