import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

/** P04-A: read-only baseline and manual-production-gate checks.
 * No workflow dispatch, no network access, no production change.
 */
const root = new URL("../../../", import.meta.url);

async function file(path: string): Promise<string> {
  return readFile(new URL(path, root), "utf8");
}
async function json<T>(path: string): Promise<T> {
  return JSON.parse(await file(path)) as T;
}

type Contract = {
  status: string;
  modules?: readonly string[];
  platformServices?: readonly string[];
  crossCutting?: {
    dataExport: string;
    applicationLifecycle: string;
    privacy: string;
  };
  requirements?: Record<string, "verified" | "not-applicable" | "blocked">;
  evidence?: Record<string, readonly {path: string; gitBlobSha: string}[]>;
};

function hasBlobEvidence(entries: readonly {path: string; gitBlobSha: string}[] | undefined) {
  return Array.isArray(entries) && entries.length > 0 &&
    entries.every(entry => typeof entry.path === "string" && entry.path.length > 3 &&
      /^[a-f0-9]{40}$/.test(entry.gitBlobSha));
}

describe("ULC P04-A closed pilot – no production actions", () => {
  it("preserves all six modules and requires provenance for eventually verified app gates", async () => {
    const contract = await json<Contract>("apps/ulc-linz/appbasis.production.json");
    expect(contract.modules).toEqual([
      "countdown", "athletes", "exercise-catalog",
      "training-blocks", "training-plans", "training-documentation",
    ]);
    expect(contract.platformServices).toEqual(["identity", "permissions"]);
    expect(["ready", "blocked"]).toContain(contract.status);
    expect(contract.crossCutting?.dataExport).toBe("verified");
    expect(hasBlobEvidence(contract.evidence?.dataExport)).toBe(true);
    for (const gate of ["applicationLifecycle", "privacy"] as const) {
      const status = contract.crossCutting?.[gate];
      expect(["verified", "blocked"]).toContain(status);
      if (status === "verified") {
        expect(hasBlobEvidence(contract.evidence?.[gate])).toBe(true);
      }
    }
    if (contract.status === "ready") {
      expect(contract.crossCutting?.applicationLifecycle).toBe("verified");
      expect(contract.crossCutting?.privacy).toBe("verified");
    }
  });

  it("allows module lifecycle transition only with explicit real evidence bindings", async () => {
    const modules = [
      "countdown", "athletes", "exercise-catalog", "training-blocks",
      "training-plans", "training-documentation",
    ];
    let ready = 0;
    const globallyBlocked: string[] = [];
    for (const moduleId of modules) {
      const contract = await json<Contract>(
        "modules/" + moduleId + "/appbasis.production.json",
      );
      expect(["ready", "blocked"]).toContain(contract.status);
      const requirements = contract.requirements ?? {};
      expect(["verified", "not-applicable", "blocked"]).toContain(requirements.lifecycle);
      if (requirements.lifecycle === "verified") {
        expect(hasBlobEvidence(contract.evidence?.lifecycle), moduleId).toBe(true);
      }
      if (contract.status === "ready") {
        ready++;
        expect(Object.values(requirements).every(value =>
          value === "verified" || value === "not-applicable"), moduleId).toBe(true);
      } else {
        globallyBlocked.push(moduleId);
        // Global standard modules remain unsafe for unprotected other apps.
        expect(requirements.authorization, moduleId).toBe("verified");
        expect(requirements.database, moduleId).toBe("verified");
        expect(requirements.lifecycle, moduleId).toBe("blocked");
      }
    }
    const app = await json<Contract>("apps/ulc-linz/appbasis.production.json");
    if (app.status === "ready") {
      const restricted = [
        "exercise-catalog", "training-blocks", "training-documentation",
      ];
      expect(ready).toBe(modules.length - restricted.length);
      expect(globallyBlocked).toEqual(restricted);
      const scoped = await json<{
        appId: string;
        scope: string;
        scopeLimitations: {
          privateMedia: string;
          unverifiedHistoricalRestore: string;
          ambiguousFreeText: string;
          actorAndAudit: string;
        };
        productionEntrypoint: { path: string; gitBlobSha: string };
        moduleLifecycle: readonly {
          moduleId: string;
          evidence: readonly { path: string; gitBlobSha: string }[];
        }[];
      }>("apps/ulc-linz/production-scoped-module-lifecycle.json");
      expect(scoped.appId).toBe("ulc-linz");
      expect(scoped.scope).toBe("private-members-only-six-module-pilot-no-private-minor-media");
      expect(scoped.scopeLimitations).toEqual({
        privateMedia: "disabled",
        unverifiedHistoricalRestore: "promotion-denied",
        ambiguousFreeText: "manual-stop",
        actorAndAudit: "manual-stop",
      });
      expect(scoped.productionEntrypoint.path)
        .toBe("apps/ulc-linz/worker/production-protected.ts");
      expect(hasBlobEvidence([scoped.productionEntrypoint])).toBe(true);
      expect(scoped.moduleLifecycle.map(entry => entry.moduleId)).toEqual(restricted);
      for (const entry of scoped.moduleLifecycle) {
        expect(hasBlobEvidence(entry.evidence), entry.moduleId).toBe(true);
      }
    }
  });

  it("keeps app-provider evidence open and all unknown providers fail-closed", async () => {
    const provider = await json<{
      providerScope: readonly { id: string; appSpecificProductionEvidence: string }[];
      dataFlows: readonly { evidenceStatus: string }[];
      m5: Record<string, string | boolean>;
    }>("apps/ulc-linz/privacy/m5-provider-compliance-inventory.json");
    expect(provider.providerScope.map((entry) => entry.id))
      .toEqual(["cloudflare", "neon-postgresql"]);
    for (const entry of provider.providerScope) {
      expect(["open", "verified"]).toContain(entry.appSpecificProductionEvidence);
    }
    for (const flow of provider.dataFlows) {
      expect(["open", "verified"]).toContain(flow.evidenceStatus);
    }
    for (const gate of ["dataRegion", "dpa", "encryption", "subprocessors"]) {
      expect(["open", "verified"]).toContain(provider.m5[gate]);
    }
    expect(provider.m5.unknownProvider).toBe("fail-closed");
    expect(provider.m5.baselineIsProductionEvidence).toBe(false);
  });

  it("requires current T10 legal and provider readiness before short-lived M6 composition", async () => {
    const workflow = await file(".github/workflows/m6-ulc-production-composition-gate.yml");
    const composition = workflow.indexOf("- name: Evaluate selected module composition");
    const t10 = workflow.indexOf("- name: Require real T10 legal and provider evidence");
    const gate = workflow.indexOf("- name: Create authoritative short-lived composition gate");
    expect(composition).toBeGreaterThan(0);
    expect(t10).toBeGreaterThan(composition);
    expect(gate).toBeGreaterThan(t10);
    expect(workflow).toContain("ulc-linz-t10-pilot-decision.mjs --require-repository-ready");
    expect(workflow).toContain('result?.openChecks?.length !== 0');
    expect(workflow).toContain("result?.operatorApproved !== false");
    expect(workflow).toContain("result?.deploymentAuthorized !== false");
    expect(workflow).toContain("result?.historicalRestorePromotionAuthorized !== false");
  });

  it("requires a fresh, manual, main-only production approval for each of the eight steps", async () => {
    const workflow = await file(".github/workflows/m6-ulc-production-refresh-chain.yml");
    const head = workflow.slice(0, workflow.indexOf("\npermissions:"));
    const expected = [
      "runtime_refresh", "private_deploy", "security_smoke",
      "lifecycle_preflight", "composition_gate", "pilot_ingress",
      "smoke_principal", "post_deploy_smoke",
    ];
    const options = [...head.matchAll(/^          - ([a-z_]+)$/gm)].map((match) => match[1]);
    expect(options).toEqual(expected);
    expect(head).toContain("workflow_dispatch:");
    expect(head).toContain("approve_step:");
    expect(head).toContain("default: false");
    expect(workflow).toContain("if: github.ref == 'refs/heads/main'");
    expect(workflow).toContain('test "$APPROVE_STEP" = true');
    expect(workflow).toContain('test "$GITHUB_RUN_ATTEMPT" = 1');
    expect(workflow).toContain("run_attempt == 1");
    expect(workflow).toContain("assert_main_head");
    expect(workflow).toContain("latest_success_run");
    expect(workflow).toContain("No automatic retry will be attempted");
  });
});
