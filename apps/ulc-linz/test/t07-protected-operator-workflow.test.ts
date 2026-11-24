import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const workflow = new URL(
  "../../../.github/workflows/ulc-linz-t07-protected-athlete-erasure.yml",
  import.meta.url,
);
const harness = new URL("../worker/t07-protected-operator-harness.ts", import.meta.url);
const publicWorker = new URL("../worker/index.ts", import.meta.url);

describe("T07 execution workflow protects the real ULC Worker", () => {
  it("is manual, exact-HEAD, existing-environment gated, never cron/automatic", async () => {
    const source = await readFile(workflow, "utf8");
    for (const anchor of [
      "on:\n  workflow_dispatch:",
      "github.ref == 'refs/heads/main'",
      "environment: m4-dr",
      "GITHUB_RUN_ATTEMPT",
      "EXPECTED_HEAD_SHA",
      "test \"$GITHUB_SHA\" = \"$EXPECTED_HEAD_SHA\"",
      "ERASE-ULC-T07-FOUR-STRUCTURED-OWNERS",
      "INSPECT-ULC-T07-STRUCTURED-OWNERS",
      "x-appbasis-t07-token",
      "x-appbasis-t07-subject-id",
      "x-appbasis-t07-source-completed-at",
      "CLOUDFLARE_API_WRITE_TOKEN",
      "ULC_LINZ_PRODUCTION_ADMIN_PASSWORD",
      "LIFECYCLE_WRANGLER_CONFIG",
      "m6-ulc-production-runtime-config",
      "ULC_T07_ERASURE_ENABLED",
      'test "$T07_DESTRUCTIVE_ENABLED" = 1',
    ].filter(x => x !== "LIFECYCLE_WRANGLER_CONFIG")) {
      expect(source).toContain(anchor);
    }
    expect(source).not.toContain("schedule:");
    expect(source).not.toMatch(/\n  push:/);
    expect(source).not.toContain("wrangler deploy");
    expect(source).not.toContain("cancel-in-progress: true");
    expect(source).not.toContain("runUlcLinzRetention(");
    expect(source).not.toMatch(/echo\s.*\$SUBJECT_ID\s*>>\s*\$GITHUB_STEP_SUMMARY/);
  });

  it("never imports the temporary T07 operation from the real Worker", async () => {
    const [operator, publicCode] = await Promise.all([
      readFile(harness, "utf8"),
      readFile(publicWorker, "utf8"),
    ]);
    expect(operator).toContain("T07_OPERATION_TOKEN");
    expect(operator).toContain("runProtectedUlcLinzAthleteErasureWithCredentials");
    expect(operator).toContain("Cache-Control");
    expect(operator).toContain("new Response(null, { status: 503 })");
    expect(publicCode).not.toContain("t07-protected-operator-harness");
    expect(publicCode).not.toContain("protected-athlete-erasure-credential-operation");
  });
});
