import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const workflowPath = fileURLToPath(
  new URL("../../../.github/workflows/reference-preview-smoke.yml", import.meta.url),
);
const workflow = readFileSync(workflowPath, "utf8");

describe("Reference preview smoke workflow", () => {
  it("automates the full demo.user smoke after successful main preview deploys", () => {
    expect(workflow).toMatch(/workflow_run:\n\s+workflows:\n\s+- Reference Preview Deploy/);
    expect(workflow).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(workflow).toContain("github.event.workflow_run.head_branch == 'main'");
    expect(workflow).toContain("APPBASIS_SMOKE_USERNAME: demo.user");
    expect(workflow).toContain("Run automated Demo v0.1 acceptance smoke");
    expect(workflow).toContain("APPBASIS_SMOKE_MUTATE: '1'");
  });

  it("self-validates smoke changes on main and preserves manual dispatch", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toMatch(/push:\n\s+branches:\n\s+- main\n\s+paths:/);
    expect(workflow).toContain(".github/workflows/reference-preview-smoke.yml");
    expect(workflow).toContain("tooling/reference-preview-smoke.mjs");
    expect(workflow).toContain("inputs.mutate && '1' || '0'");
  });

  it("serializes mutating preview smoke runs", () => {
    expect(workflow).toContain("group: reference-preview-smoke");
    expect(workflow).toContain("cancel-in-progress: false");
  });
});
