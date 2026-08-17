import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL(
  "../.github/workflows/m4-r2-backup-evidence.yml",
  import.meta.url,
);
const evaluatorUrl = new URL("./m4-r2-backup-evidence.mjs", import.meta.url);

async function workflowSource() {
  return readFile(workflowUrl, "utf8");
}

async function evaluatorSource() {
  return readFile(evaluatorUrl, "utf8");
}

test("M4 R2 evidence is main-only, protected and strictly read-only", async () => {
  const source = await workflowSource();

  assert.match(source, /schedule:\s*\n\s*- cron: "47 3 \* \* \*"/);
  assert.match(source, /workflow_dispatch:/);
  assert.match(source, /permissions:\s*\n\s*contents: read/);
  assert.match(source, /environment: m4-dr/);
  assert.match(source, /if: github\.ref == 'refs\/heads\/main'/);
  assert.match(source, /APPBASIS_M4_FREE_BACKUP_ENABLED/);
  assert.match(source, /APPBASIS_M4_R2_EVIDENCE_ACCESS_KEY_ID/);
  assert.match(source, /APPBASIS_M4_R2_EVIDENCE_SECRET_ACCESS_KEY/);
  assert.doesNotMatch(source, /APPBASIS_M4_R2_ACCESS_KEY_ID/);
  assert.doesNotMatch(source, /APPBASIS_M4_R2_SECRET_ACCESS_KEY/);

  assert.match(source, /aws s3api head-bucket/);
  assert.match(source, /s3api list-objects-v2/);
  assert.doesNotMatch(source, /s3api put-object/);
  assert.doesNotMatch(source, /s3api delete-object/);
  assert.doesNotMatch(source, /s3api get-object/);
  assert.doesNotMatch(source, /create-bucket/);
  assert.doesNotMatch(source, /wrangler/);
});

test("M4 R2 evidence explicitly paginates the actual daily and weekly inventory fail-closed", async () => {
  const source = await workflowSource();

  assert.match(source, /--max-keys 1000/);
  assert.match(source, /--no-paginate/);
  assert.match(source, /--continuation-token "\$token"/);
  assert.match(source, /\.IsTruncated \| type == "boolean"/);
  assert.match(source, /NextContinuationToken/);
  assert.match(source, /pagination did not advance/);
  assert.match(source, /pagination repeated a continuation token/);
  assert.match(source, /appbasis\/m3-preview\/m4\/daily\//);
  assert.match(source, /appbasis\/m3-preview\/m4\/weekly\//);
  assert.match(source, /m4-r2-backup-evidence\.mjs evaluate/);
});

test("M4 R2 evidence reuses the existing retention contract and requires today's daily key", async () => {
  const source = await evaluatorSource();

  assert.match(source, /import \{ selectExpiredM4BackupKeys \} from "\.\/m4-free-backup-plan\.mjs"/);
  assert.match(source, /selectExpiredM4BackupKeys\(\{ keys, now \}\)/);
  assert.match(source, /expectedDailyKey/);
  assert.match(source, /daily-backup-stale/);
  assert.match(source, /retention-expired-objects/);
});

test("M4 R2 scheduled evidence gates inactive profiles before any secret reference", async () => {
  const source = await workflowSource();
  const gate = source.indexOf("Gate inactive scheduled evidence before secrets");
  const firstSecret = source.indexOf("secrets.");

  assert.ok(gate >= 0 && firstSecret > gate, "evidence activation gate must precede every secret reference");
  assert.match(source, /scheduled evidence is skipped/);
  assert.match(source, /cannot verify an inactive backup profile/);
});
