import assert from "node:assert/strict";
import test from "node:test";

import {
  applyUlcLinzD4PreviewAthletesUpgrade,
  assertUlcLinzD4PreviewAthletesUpgradeEnvironment,
} from "./ulc-linz-d4-preview-athletes-upgrade.mjs";

test("binds the incremental preview upgrade to the published athletes target", async () => {
  let received;
  const result = await applyUlcLinzD4PreviewAthletesUpgrade(
    { connectionString: "postgresql://example.test" },
    {
      applyMigrations: async (input) => {
        received = input;
        return {
          state: "applied",
          application: "ulc-linz",
          moduleId: "athletes",
          repositoryState: "published-target",
          migrationCount: 2,
        };
      },
    },
  );
  assert.deepEqual(received, {
    appId: "ulc-linz",
    moduleId: "athletes",
    connectionString: "postgresql://example.test",
    expectedDatabase: "appbasis_ulc_linz_preview",
    expectedPrincipal: "appbasis_ulc_linz_preview_migration",
  });
  assert.equal(result.migrationCount, 2);
});

test("requires exact preview migration environment and explicit approval", () => {
  assert.doesNotThrow(() =>
    assertUlcLinzD4PreviewAthletesUpgradeEnvironment({
      APPBASIS_GENERATED_APP_ID: "ulc-linz",
      APPBASIS_MIGRATION_TARGET: "appbasis_ulc_linz_preview",
      APPBASIS_APPLY_MIGRATIONS: "1",
    }),
  );
  assert.throws(
    () =>
      assertUlcLinzD4PreviewAthletesUpgradeEnvironment({
        APPBASIS_GENERATED_APP_ID: "ulc-linz",
        APPBASIS_MIGRATION_TARGET: "appbasis_ulc_linz_preview",
        APPBASIS_APPLY_MIGRATIONS: "0",
      }),
    /explicit migration approval/,
  );
});
