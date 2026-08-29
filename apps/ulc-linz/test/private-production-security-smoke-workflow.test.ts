import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

const workflowUrl = new URL(
  "../../../.github/workflows/m5-ulc-private-security-smoke.yml",
  import.meta.url,
);

function workflowText(): string {
  return readFileSync(workflowUrl, "utf8");
}

describe("M5 private production security smoke workflow", () => {
  test("keeps the guarded main-only production boundary", () => {
    const workflow = workflowText();
    expect(workflow).toContain("RUN-ULC-M5-PRIVATE-SECURITY-SMOKE");
    expect(workflow).toContain("if: github.ref == 'refs/heads/main'");
    expect(workflow).toContain("environment: m4-dr");
    expect(workflow).toContain("group: m6-ulc-production-runtime-config");
    expect(workflow).toContain("Require existing workers.dev account subdomain");
    expect(workflow).toContain("Verify workers.dev account subdomain remained unchanged");
  });

  test("binds both deployed Hyperdrives to canonical production contracts", () => {
    const workflow = workflowText();
    expect(workflow).toContain("ulc-linz-m6-production-hyperdrive.mjs resolve");
    expect(workflow).toContain("ulc-linz-m6-production-hyperdrive.mjs resolve-security-log");
    expect(workflow).toContain("ulc-linz-m6-private-runtime-refresh.mjs bindings");
    expect(workflow).toContain("binding: 'HYPERDRIVE', id: process.env.APP_HYPERDRIVE_ID");
    expect(workflow).toContain(
      "binding: 'SECURITY_LOG_HYPERDRIVE', id: process.env.SECURITY_HYPERDRIVE_ID",
    );
  });

  test("proves application credential usability before accepting sink evidence", () => {
    const workflow = workflowText();
    const probe = workflow.indexOf("SELECT current_database() AS database_name");
    const baseline = workflow.indexOf("baseline_count=\"$(node --input-type=module");
    const deniedRequest = workflow.indexOf(
      "http://127.0.0.1:8787/api/auth/session)",
    );
    expect(probe).toBeGreaterThan(-1);
    expect(baseline).toBeGreaterThan(probe);
    expect(deniedRequest).toBeGreaterThan(baseline);
    expect(workflow).toContain("Remote application-database Hyperdrive probe did not succeed.");
  });

  test("correlates the denied event by exact baseline delta and response contract", () => {
    const workflow = workflowText();
    expect(workflow).toContain("AND http_status = 401");
    expect(workflow).toContain("AND error_code = 'SESSION_INVALID'");
    expect(workflow).toContain("ULC_LINZ_SECURITY_SMOKE_BASELINE_COUNT");
    expect(workflow).toContain("ULC_LINZ_SECURITY_SMOKE_STARTED_AT");
    expect(workflow).toContain("payload?.error?.code !== 'SESSION_INVALID'");
    expect(workflow).toContain("grep -qi '^set-cookie:'");
  });

  test("does not persist a probe route in the production Worker", () => {
    const workflow = workflowText();
    expect(workflow).toContain(
      'HARNESS="$GITHUB_WORKSPACE/apps/ulc-linz/m5-security-smoke.generated.ts"',
    );
    expect(workflow).toContain("/__appbasis/m5/application-database-probe");
    expect(workflow).toContain("return productionWorker.fetch(request, env);");
    expect(workflow).toContain("M5_SMOKE_PROBE_TOKEN");
  });
});
