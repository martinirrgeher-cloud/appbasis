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
  evidence?: Record<string, readonly unknown[]>;
};

describe("ULC P04-A closed pilot – no production actions", () => {
  it("preserves the full six-module app scope and explicit blocked privacy/lifecycle gates", async () => {
    const contract = await json<Contract>("apps/ulc-linz/appbasis.production.json");
    expect(contract.modules).toEqual([
      "countdown", "athletes", "exercise-catalog",
      "training-blocks", "training-plans", "training-documentation",
    ]);
    expect(contract.platformServices).toEqual(["identity", "permissions"]);
    expect(contract.status).toBe("blocked");
    expect(contract.crossCutting).toEqual({
      dataExport: "verified",
      applicationLifecycle: "blocked",
      privacy: "blocked",
    });
    expect(contract.evidence?.applicationLifecycle).toEqual([]);
    expect(contract.evidence?.privacy).toEqual([]);
  });

  it("does not treat three ready modules as evidence for blocked owners", async () => {
    const expectations = [
      ["countdown", "ready"],
      ["athletes", "ready"],
      ["exercise-catalog", "blocked"],
      ["training-blocks", "blocked"],
      ["training-plans", "ready"],
      ["training-documentation", "blocked"],
    ] as const;
    for (const [moduleId, expectedStatus] of expectations) {
      const contract = await json<Contract>(
        "modules/" + moduleId + "/appbasis.production.json",
      );
      expect(contract.status, moduleId).toBe(expectedStatus);
      if (expectedStatus === "blocked") {
        expect((contract.evidence?.lifecycle ?? [])).toEqual([]);
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
    expect(provider.providerScope.every((entry) =>
      entry.appSpecificProductionEvidence === "open")).toBe(true);
    expect(provider.dataFlows.every((flow) =>
      flow.evidenceStatus === "open")).toBe(true);
    expect(provider.m5.dataRegion).toBe("open");
    expect(provider.m5.dpa).toBe("open");
    expect(provider.m5.encryption).toBe("open");
    expect(provider.m5.subprocessors).toBe("open");
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
    expect(workflow).toContain("Strict");
  });
});
