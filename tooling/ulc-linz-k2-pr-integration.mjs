// Fail-closed offline integration gate for six independently prepared K2 draft PRs.
// JSON is operator-curated: compare it with actual GitHub API results; this tool
// NEVER establishes authenticity of a self-reported inventory or CI status.
// No network, credentials, provider operations, merges or production activation.
import { readFileSync } from "node:fs";

export const EXPECTED = Object.freeze([633,634,635,636,637,638]);
export const EXPECTED_BASE_SHA = "d1b8de78eb536698fce8f4374f2543f499dd86c5";
export const EXPECTED_HEADS = Object.freeze({
  633:"4622f97ae335a12de815bb4e960512d7dbcb9c97",
  634:"e08f9619a37ef2b9d418a70e0fcbbc4483db7286",
  635:"363cdc28768e9292d0ed83d979dbb09c5bb691f3",
  636:"8c773866fb4a1308dccf0b461ee7b9f6c807467f",
  637:"662f44093d8dd8b8872f41486ac407c627aa560b",
  638:"4a3304a4248100a2d7558566d85eea943c40cb87",
});
export const EXPECTED_FILES = Object.freeze({
  633:Object.freeze([
    "docs/ULC-LINZ-K2-R2-RETENTION-CANDIDATE.md",
    "tooling/ulc-linz-k2-retention-plan.mjs",
    "tooling/ulc-linz-k2-retention-plan.test.mjs",
  ]),
  634:Object.freeze([
    "apps/ulc-linz/PRODUCTION-READINESS-K2-M01-MEDIA-INVENTORY.md",
    "tooling/ulc-linz-k2-media-inventory.mjs",
    "tooling/ulc-linz-k2-media-inventory.test.mjs",
  ]),
  635:Object.freeze([
    "apps/ulc-linz/docs/K2-Q01-RESTORE-QUARANTINE-SECURITY-GATES.md",
    "tooling/ulc-linz-k2-restore-boundary.test.mjs",
  ]),
  636:Object.freeze([
    ".github/workflows/ulc-linz-k2-restore-evidence-regression.yml",
    "apps/ulc-linz/docs/K2-E01-RESTORE-E2E-ACCEPTANCE.md",
    "tooling/ulc-linz-k2-restore-evidence.mjs",
    "tooling/ulc-linz-k2-restore-evidence.test.mjs",
  ]),
  637:Object.freeze([
    ".github/workflows/ulc-linz-k2-operator-release-gates.yml",
    "apps/ulc-linz/docs/K2-P01-OPERATOR-RELEASE-GATES.md",
    "tooling/ulc-linz-k2-operator-release-gates.test.mjs",
  ]),
  638:Object.freeze([
    ".github/workflows/ulc-linz-k2-recovery-objectives-regression.yml",
    "apps/ulc-linz/docs/K2-R02-RECOVERY-OBJECTIVES.md",
    "tooling/ulc-linz-k2-recovery-objectives.mjs",
    "tooling/ulc-linz-k2-recovery-objectives.test.mjs",
  ]),
});
const VALID_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9_./-]+$/;
function validSha(value) { return typeof value === "string" && /^[a-f0-9]{40}$/.test(value); }

export function checkIntegrationInventory(input) {
  const errors=[];
  if (!input || !Array.isArray(input.pullRequests)) {
    return { status:"BLOCK", errors:["missing pullRequests array"] };
  }
  const seen=new Set(), paths=new Map();
  for (const p of input.pullRequests) {
    if (!p || !Number.isInteger(p.number) || !EXPECTED.includes(p.number) || seen.has(p.number)) {
      errors.push("unknown or duplicate PR number"); continue;
    }
    const n=p.number;
    seen.add(n);
    if (p.base!=="main" || p.baseSha!==EXPECTED_BASE_SHA ||
        p.draft!==true || p.merged!==false || p.mergeable!==true) {
      errors.push("PR #"+n+": unsafe state or base");
    }
    if (!validSha(p.sha) || p.sha!==EXPECTED_HEADS[n]) {
      errors.push("PR #"+n+": unreviewed or changed HEAD");
    }
    if (!Array.isArray(p.files) || !p.files.length) {
      errors.push("PR #"+n+": missing changed-file inventory");
    } else {
      const own=new Set();
      for (const file of p.files) {
        if (typeof file!=="string" || !VALID_PATH.test(file) || file.includes("\\")) {
          errors.push("PR #"+n+": unsafe file path"); continue;
        }
        if (own.has(file)) errors.push("PR #"+n+": duplicate changed-file path");
        own.add(file);
        if (paths.has(file)) errors.push("overlap: "+file+" in #"+paths.get(file)+" and #"+n);
        else paths.set(file,n);
      }
      const expected=EXPECTED_FILES[n];
      if (own.size!==expected.length || expected.some(file=>!own.has(file))) {
        errors.push("PR #"+n+": file list differs from reviewed manifest");
      }
    }
    if (!Array.isArray(p.checks) || !p.checks.length ||
        p.checks.some(c=>!c || c.status!=="completed" ||
          c.conclusion!=="success" || c.headSha!==p.sha)) {
      errors.push("PR #"+n+": CI incomplete, failed or for a different HEAD");
    }
  }
  for (const n of EXPECTED) if (!seen.has(n)) errors.push("missing PR #"+n);
  return { status:errors.length?"BLOCK":"READY_FOR_HUMAN_REVIEW", errors };
}
if (process.argv[1] && import.meta.url===new URL("file://"+process.argv[1]).href) {
  try {
    const result=checkIntegrationInventory(JSON.parse(readFileSync(process.argv[2],"utf8")));
    console.log(JSON.stringify(result));
    if (result.status!=="READY_FOR_HUMAN_REVIEW") process.exitCode=1;
  } catch {
    console.error("BLOCK: invalid or missing inventory");
    process.exitCode=1;
  }
}
