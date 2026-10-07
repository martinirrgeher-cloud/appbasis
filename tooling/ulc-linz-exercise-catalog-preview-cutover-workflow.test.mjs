import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const WORKFLOW =
  ".github/workflows/ulc-linz-e6g-c3c-preview-cutover.yml";

test("C3C workflow keeps quiescence and standard cutover as separately approved preview mutations", async () => {
  const yaml = await readFile(WORKFLOW, "utf8");

  assert.match(yaml, /workflow_dispatch:/);
  assert.match(yaml, /default: inspect/);
  assert.match(yaml, /- inspect\n\s+- quiesce\n\s+- cutover/);
  assert.match(yaml, /apply:[\s\S]*default: false/);
  assert.match(
    yaml,
    /if: \$\{\{ inputs\.operation != 'inspect' && inputs\.apply == true \}\}/,
  );
  assert.match(yaml, /environment:\n\s+name: generated-preview-ulc-linz/);
  assert.match(yaml, /group: generated-preview-ulc-linz/);
  assert.match(yaml, /test "\$APPBASIS_REF" = 'refs\/heads\/main'/);

  assert.match(
    yaml,
    /\.\/worker\/preview-exercise-catalog-quiesced\.ts/,
  );
  assert.match(
    yaml,
    /\.\/worker\/preview-exercise-catalog-standard\.ts/,
  );
  assert.match(
    yaml,
    /APPBASIS_APPLY_EXERCISE_CATALOG_QUIESCENCE: "1"/,
  );
  assert.doesNotMatch(yaml, /APPBASIS_APPLY_MIGRATIONS/);
});

test("C3C quiesce persists the database guard before deploying the read-only runtime and checking equality", async () => {
  const yaml = await readFile(WORKFLOW, "utf8");

  const acl = yaml.indexOf(
    "Persist database-level source-write quiescence and target runtime access",
  );
  const deploy = yaml.indexOf("Deploy quiesced preview runtime");
  const live = yaml.indexOf("Verify quiesced runtime is live");
  const equality = yaml.indexOf(
    "Verify final equality under source-write quiescence",
  );

  assert.ok(acl >= 0);
  assert.ok(acl < deploy);
  assert.ok(deploy < live);
  assert.ok(live < equality);
});

test("C3C standard cutover proves live quiescence, database guard and final equality before deployment", async () => {
  const yaml = await readFile(WORKFLOW, "utf8");

  const liveGuard = yaml.indexOf(
    "Require current runtime to be quiesced before cutover",
  );
  const persistedGuard = yaml.indexOf(
    "Verify persisted source-write quiescence before cutover",
  );
  const equality = yaml.indexOf(
    "Verify final Source to Target equality before cutover",
  );
  const standardDeploy = yaml.indexOf(
    "Deploy standard-module preview runtime",
  );

  assert.ok(liveGuard >= 0);
  assert.ok(liveGuard < persistedGuard);
  assert.ok(persistedGuard < equality);
  assert.ok(equality < standardDeploy);
  assert.match(
    yaml,
    /exerciseCatalogRuntimeMode' <<<"\$HEALTH"\)" = 'legacy-read-writes-blocked'/,
  );
});
