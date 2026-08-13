import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function readWorkflow(relativePath: string) {
  return readFileSync(
    fileURLToPath(new URL(`../../../.github/workflows/${relativePath}`, import.meta.url)),
    "utf8",
  );
}

const smokeWorkflow = readWorkflow("reference-preview-smoke.yml");
const deployWorkflow = readWorkflow("reference-preview-deploy.yml");

describe("Reference preview smoke workflows", () => {
  it("keeps deploy and automated acceptance smoke in one serialized chain", () => {
    expect(deployWorkflow).toContain("group: reference-preview-deploy");
    expect(deployWorkflow).toContain("cancel-in-progress: false");
    expect(deployWorkflow).toContain("Run automated Demo v0.1 acceptance smoke");
    expect(deployWorkflow).toContain("APPBASIS_SMOKE_USERNAME: demo.user");
    expect(deployWorkflow).toContain("APPBASIS_SMOKE_MUTATE: '1'");

    const deployIndex = deployWorkflow.indexOf("Deploy Reference preview without provisioning");
    const acceptanceIndex = deployWorkflow.indexOf("Run automated Demo v0.1 acceptance smoke");
    expect(deployIndex).toBeGreaterThanOrEqual(0);
    expect(acceptanceIndex).toBeGreaterThan(deployIndex);
  });

  it("does not detach deploy acceptance into a workflow_run", () => {
    expect(smokeWorkflow).not.toContain("workflow_run:");
  });

  it("preserves the configurable identity for manual smoke", () => {
    expect(smokeWorkflow).toMatch(
      /APPBASIS_SMOKE_USERNAME:\s+\$\{\{\s*secrets\.APPBASIS_SMOKE_USERNAME\s*\}\}/,
    );
    expect(smokeWorkflow).toContain("inputs.mutate && '1' || '0'");
  });

  it("fails closed unless automated smoke uses demo.user", () => {
    const automatedValidationIndex = smokeWorkflow.indexOf(
      "Validate automated Demo v0.1 smoke identity",
    );
    expect(automatedValidationIndex).toBeGreaterThanOrEqual(0);
    expect(smokeWorkflow.slice(automatedValidationIndex)).toContain(
      `test "$APPBASIS_SMOKE_USERNAME" = 'demo.user'`,
    );
    expect(smokeWorkflow).toContain("APPBASIS_SMOKE_MUTATE: '1'");
  });

  it("self-validates smoke-contract changes on main", () => {
    expect(smokeWorkflow).toContain("workflow_dispatch:");
    expect(smokeWorkflow).toMatch(/push:\n\s+branches:\n\s+- main\n\s+paths:/);
    expect(smokeWorkflow).toContain(".github/workflows/reference-preview-smoke.yml");
    expect(smokeWorkflow).toContain(".github/workflows/reference-preview-deploy.yml");
    expect(smokeWorkflow).toContain("tooling/reference-preview-smoke.mjs");
  });

  it("serializes standalone smoke with preview deploys", () => {
    expect(smokeWorkflow).toContain("group: reference-preview-deploy");
    expect(smokeWorkflow).toContain("cancel-in-progress: false");
  });
});
