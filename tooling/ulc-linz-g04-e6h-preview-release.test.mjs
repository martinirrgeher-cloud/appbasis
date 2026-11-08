import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL(
  "../.github/workflows/ulc-linz-e6h-preview-runtime-refresh.yml",
  import.meta.url,
);

test("G-04 v17 is deployed using the existing E6H Preview Worker, never a sandbox", async () => {
  const content = await readFile(workflowUrl, "utf8");
  assert.match(content, /^name: ULC Linz Preview – Aktuelle App aktualisieren$/m);
  assert.match(content, /^on:\n  workflow_dispatch:/m);
  assert.match(content, /if: \$\{\{ inputs\.apply == true \}\}/);
  assert.match(content, /test "\$APPBASIS_REF" = 'refs\/heads\/main'/);
  assert.match(content, /environment:\n\s+name: generated-preview-ulc-linz/);
  assert.match(content, /entrypoint: "\.\/worker\/preview-exercise-catalog-standard\.ts"/);
  assert.match(content, /registrationCalendarV17: true/);
  assert.match(content, /name: Resolve isolated ULC preview Hyperdrives/);
  assert.match(content, /name: Require existing standard-module preview runtime/);
  assert.match(content, /appId: "ulc-linz"/);
  assert.doesNotMatch(content, /appbasis-ulc-linz-g04-sandbox/);
  assert.doesNotMatch(content, /wrangler\.g04-sandbox\.generated\.json/);
});

test("G-04 pre-deploy checks cannot be bypassed by an old Training Blocks v4 manifest check", async () => {
  const content = await readFile(workflowUrl, "utf8");
  const preflight = content.indexOf("Require existing Preview v17 calendar and protected app role");
  const sourceCheck = content.indexOf("node ./tooling/ulc-linz-g04-calendar-v17-preview.mjs verify",preflight);
  const appAclCheck = content.indexOf("node ./tooling/ulc-linz-g04-direct-preview-preflight.mjs",preflight);
  const oldV4 = content.indexOf("ulc-linz-training-blocks-v4-preview.mjs");
  const renderFlag = content.indexOf("registrationCalendarV17: true");
  const writeSecret = content.indexOf("Synchronize preview identity secret");
  const deploy = content.indexOf("Deploy standard-module ULC preview runtime");
  assert.ok(preflight > 0 && sourceCheck > preflight && appAclCheck > sourceCheck);
  assert.equal(oldV4,-1);
  assert.ok(renderFlag > appAclCheck);
  assert.ok(writeSecret > renderFlag && deploy > writeSecret);
  assert.match(content, /--experimental-provision=false/);
  assert.match(content, /--experimental-auto-create=false/);
  assert.doesNotMatch(content, /APPBASIS_APPLY_MIGRATIONS/);
});

test("G-04 E6H release checks expected SHA, ULC calendar UI and protected calendar API", async () => {
  const content = await readFile(workflowUrl, "utf8");
  assert.match(content, /Verify exact deployed ULC app build/);
  assert.match(content, /\.gitSha == \$sha/);
  assert.match(content, /id=\\"group-calendar-open\\"/);
  assert.match(content, /id=\\"group-calendar-weekdays\\"/);
  assert.match(content, /\/api\/modules\/athletes\/registration-calendar\?groupId=anonymous/);
  assert.match(content, /401\|403/);
  assert.match(content, /Verify preview application database binding/);
});
