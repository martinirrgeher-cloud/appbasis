import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const workflow = readFileSync(
  fileURLToPath(new URL(
    "../../../.github/workflows/ulc-linz-e6h-preview-runtime-refresh.yml",
    import.meta.url,
  )), "utf8",
);

describe("ULC current UI preview refresh: no historical schema rollback", () => {
  it("explicitly updates only the existing isolated preview from main", () => {
    expect(workflow).toContain("name: ULC Linz Preview – Aktuelle App aktualisieren");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("default: false");
    expect(workflow).toContain("if: ${{ inputs.apply == true }}");
    expect(workflow).toContain("test \"$APPBASIS_REF\" = 'refs/heads/main'");
    expect(workflow).toContain("name: generated-preview-ulc-linz");
    expect(workflow).toContain("Require existing standard-module preview runtime");
    expect(workflow).toContain('Require compatible Preview registration-note schema');
    expect(workflow).toContain('validateUlcLinzD4PreviewDatabaseCredentials');
    expect(workflow).toContain("pilotTrainingOriginAttested: true");
    expect(workflow.indexOf('validateUlcLinzD4PreviewDatabaseCredentials')).toBeLessThan(
      workflow.indexOf("pilotTrainingOriginAttested: true"),
    );
    expect(workflow.indexOf("Resolve isolated ULC preview Hyperdrives")).toBeLessThan(
      workflow.indexOf("pilotTrainingOriginAttested: true"),
    );
    expect(workflow).toContain('ulc_linz_training_registration_change_note_check');
    expect(workflow).toContain('STOP before Worker update; migration requires separate operator approval.');
    expect(workflow.indexOf('Require compatible Preview registration-note schema')).toBeLessThan(
      workflow.indexOf('Synchronize preview identity secret'),
    );
    expect(workflow).toContain('entrypoint: "./worker/preview-exercise-catalog-standard.ts"');
    expect(workflow).toContain("--experimental-provision=false");
    expect(workflow).toContain("--experimental-auto-create=false");
    expect(workflow).not.toMatch(/\boperation:\s*\n\s*description:[^\n]*migration/i);
  });

  it("pins the exact current commit and proves the A10 role-aware UI after deploy", () => {
    expect(workflow).toContain("buildSha: process.env.GITHUB_SHA");
    expect(workflow).toContain("APPBASIS_EXPECTED_GIT_SHA: ${{ github.sha }}");
    expect(workflow).toContain('"$APPBASIS_GENERATED_PREVIEW_URL/api/health/build"');
    expect(workflow).toContain('.gitSha == $sha');
    expect(workflow).toContain('data-dashboard-view="registration" hidden');
    expect(workflow).toContain('data-dashboard-view="users"');
    expect(workflow).toContain('data-dashboard-view="attendance" hidden');
    expect(workflow).toContain('data-nav-view="attendance"');
    expect(workflow).toContain('id="u12-content-card"');
    expect(workflow).not.toContain('data-dashboard-view="kindertraining" hidden');
    expect(workflow).toContain('! grep -F \'<span class="app-badge">AppBasis</span>\'');
    expect(workflow).toContain('401|403) ;;');
    expect(workflow).toContain("Verify preview application database binding");
    expect(workflow).toContain("Verify preview UI and protected audit path");
  });

  it("parses the exact E6H embedded JS config renderer before a provider deploy", () => {
    const stepStart = workflow.indexOf(
      "      - name: Render standard-module preview config",
    );
    expect(stepStart).toBeGreaterThanOrEqual(0);
    const marker = "node --input-type=module <<'NODE'";
    const start = workflow.indexOf(marker, stepStart);
    expect(start).toBeGreaterThan(stepStart);
    const end = workflow.indexOf("\n          NODE", start);
    expect(end).toBeGreaterThan(start);

    // The GitHub runner dedents the run: block before feeding it to Node.
    // Check the exact embedded source: TypeScript typecheck alone never sees it.
    const inlineSource = workflow
      .slice(start + marker.length, end)
      .replace(/^ {10}/gm, "");
    expect(inlineSource).toContain("pilotTrainingOriginAttested: true");
    const check = spawnSync(
      process.execPath, ["--input-type=module", "--check"],
      { input: inlineSource, encoding: "utf8", timeout: 5000 },
    );
    expect(check.error).toBeUndefined();
    expect(check.status, check.stderr).toBe(0);
  });

  it("does not execute migrations or provider resource provisioning", () => {
    expect(workflow).not.toContain("ulc-linz-training-blocks-v4-preview.mjs");
    expect(workflow).not.toContain("ulc-linz-training-plans-preview.mjs");
    expect(workflow).not.toContain("ulc-linz-attendance-preview.mjs");
    expect(workflow).not.toContain("wrangler r2 bucket create");
    expect(workflow).not.toContain("/r2/buckets");
    expect(workflow).not.toContain("APPBASIS_APPLY_MIGRATIONS");
    expect(workflow).not.toContain("operation: migrate");
    expect(workflow).not.toContain("m6-ulc");
  });
});
