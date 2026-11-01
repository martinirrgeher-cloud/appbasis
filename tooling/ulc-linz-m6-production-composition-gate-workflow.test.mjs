import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const WORKFLOW = new URL(
  "../.github/workflows/m6-ulc-production-composition-gate.yml",
  import.meta.url,
);

test("M6 composition gate binds live platform checks to the selected app composition", async () => {
  const source = await readFile(WORKFLOW, "utf8");

  for (const marker of [
    "VERIFY-ULC-M6-COMPOSITION",
    "Composition-gate reruns cannot reuse an earlier production approval.",
    "security_smoke_run_id",
    "lifecycle_preflight_run_id",
    ".github/workflows/m5-ulc-private-security-smoke.yml",
    ".github/workflows/m5-ulc-protected-lifecycle-operations.yml",
    ".head_sha == $sha",
    ".run_attempt == 1",
    "max_age_seconds=2700",
    ".updated_at",
    "45-minute platform-prerequisite freshness window",
    '.display_title == "preflight"',
    "m6-chain-[1-9][0-9]*-1-lifecycle_preflight",
    "Protected lifecycle prerequisite did not execute the non-destructive preflight operation.",
    "node ./tooling/production-contract.mjs ulc-linz --require-ready",
    "ulc-linz-production-composition-gate",
    "production-composition-gate.json",
    "selectedModules",
    "compositionReady: true",
    "validUntilOrReviewAt",
    "15 minutes",
    "unselected modules: not part of this gate",
    "productionReleaseAuthorized: false",
  ]) {
    assert.equal(source.includes(marker), true, `missing composition guard: ${marker}`);
  }

  assert.equal(
    source.includes(".github/workflows/m5-ulc-production-evidence.yml"),
    false,
  );
  assert.equal(source.includes("securityPrivacyReady"), false);
  assert.equal(source.includes("verifiedCount == 12"), false);
});

test("M6 production gates accept real chain-dispatched lifecycle runs by path, not displayed workflow name", async () => {
  // GitHub Actions run-name changes both .name and .display_title.
  // Sample below reproduces the successful real M6 lifecycle run that was falsely rejected.
  const { spawnSync } = await import("node:child_process");
  const chainSource = await readFile(
    new URL("../.github/workflows/m6-ulc-production-refresh-chain.yml", import.meta.url),
    "utf8",
  );
  const gateSource = await readFile(WORKFLOW, "utf8");
  const workflowPath = ".github/workflows/m5-ulc-protected-lifecycle-operations.yml";
  const head = "86e5429bfc3acea4a2f7640d059816010d434d8c";
  const matchedRun = {
    id: 41336723018,
    name: "m6-chain-41336709809-1-lifecycle_preflight",
    display_title: "m6-chain-41336709809-1-lifecycle_preflight",
    path: workflowPath,
    head_sha: head,
    head_branch: "main",
    event: "workflow_dispatch",
    run_attempt: 1,
    status: "completed",
    conclusion: "success",
    updated_at: "2026-11-01T18:29:18Z",
  };
  const jq = (args, input) => {
    const result = spawnSync("jq", args, {
      input: JSON.stringify(input),
      encoding: "utf8",
    });
    if (result.error) throw result.error;
    return result;
  };

  const chainStart = chainSource.indexOf("'[.workflow_runs[] | select(");
  const chainEnd = chainSource.indexOf("' \"$file\")\"", chainStart);
  assert.ok(chainStart > 0 && chainEnd > chainStart, "canonical chain jq filter must be found");
  const chainFilter = chainSource.slice(chainStart + 1, chainEnd);
  const chainArgs = [
    "-r", "--argjson", "heads", JSON.stringify([head]),
    "--arg", "approved_before", "2026-11-01T19:14:58Z",
    "--arg", "prerequisite_kind", "lifecycle-preflight",
    chainFilter,
  ];
  const selected = jq(chainArgs, { workflow_runs: [matchedRun] });
  assert.equal(selected.status, 0, selected.stderr);
  assert.equal(selected.stdout.trim(), String(matchedRun.id));
  for (const bad of [
    { ...matchedRun, path: ".github/workflows/other.yml" },
    { ...matchedRun, display_title: "retention" },
    { ...matchedRun, run_attempt: 2 },
    { ...matchedRun, head_sha: "f".repeat(40) },
  ]) {
    const rejected = jq(chainArgs, { workflow_runs: [bad] });
    assert.equal(rejected.status, 0, rejected.stderr);
    assert.equal(rejected.stdout.trim(), "", "a nonmatching prerequisite must not be accepted");
  }

  const gateStart = gateSource.indexOf("lifecycle_file=");
  const jqStart = gateSource.indexOf("jq -e '\n", gateStart);
  const jqEnd = gateSource.indexOf("' \"$lifecycle_file\"", jqStart);
  assert.ok(gateStart > 0 && jqStart > gateStart && jqEnd > jqStart);
  const gateFilter = gateSource.slice(jqStart + "jq -e '\n".length, jqEnd);
  const gateValid = jq(["-e", gateFilter], matchedRun);
  assert.equal(gateValid.status, 0, gateValid.stderr);
  const gateStandalone = jq(["-e", gateFilter], {
    ...matchedRun, name: "preflight", display_title: "preflight",
  });
  assert.equal(gateStandalone.status, 0, gateStandalone.stderr);
  for (const bad of [
    { ...matchedRun, path: ".github/workflows/other.yml" },
    { ...matchedRun, display_title: "retention" },
    { ...matchedRun, display_title: "m6-chain-41336709809-2-lifecycle_preflight" },
  ]) {
    const rejected = jq(["-e", gateFilter], bad);
    assert.equal(rejected.status, 1, "a wrong workflow or non-preflight operation must fail closed");
  }
});
