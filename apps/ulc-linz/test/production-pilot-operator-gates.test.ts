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
      }
    }
    const app = await json<Contract>("apps/ulc-linz/appbasis.production.json");
    if (app.status === "ready") expect(ready).toBe(modules.length);
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
