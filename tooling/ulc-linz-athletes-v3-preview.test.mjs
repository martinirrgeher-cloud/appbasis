import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import {
  classifyUlcAthletesV3PreviewShape,
  loadUlcAthletesV3PreviewPlan,
  UlcAthletesV3PreviewConfigurationError,
  UlcAthletesV3PreviewExecutionError,
} from "./ulc-linz-athletes-v3-preview.mjs";

const repositoryRoot = resolve(
  fileURLToPath(new URL("../", import.meta.url)),
);

test("athletes v3 preview pins only the contact migration", async () => {
  const plan = await loadUlcAthletesV3PreviewPlan({ repositoryRoot });
  assert.equal(plan.application, "ulc-linz");
  assert.equal(plan.moduleId, "athletes");
  assert.equal(plan.target.schemaVersion, 3);
  assert.equal(
    plan.target.migrationPath,
    "modules/athletes/migrations/0002_appbasis_athlete_contacts.sql",
  );
  assert.equal(plan.migration.relativePath, plan.target.migrationPath);
  assert.equal(plan.migration.statements.length, 3);
  assert.ok(
    plan.deltaCatalogContract.some(
      (marker) =>
        marker.kind === "table" &&
        marker.name === "appbasis_athlete_contact" &&
        marker.present === true,
    ),
  );
  assert.equal(plan.productionChanged, false);
});

test("athletes v3 preview distinguishes absent, complete and partial delta", () => {
  assert.equal(
    classifyUlcAthletesV3PreviewShape({
      athleteOrganizationConstraint: false,
      contactTable: false,
      contactIndex: false,
    }),
    "migration-required",
  );
  assert.equal(
    classifyUlcAthletesV3PreviewShape({
      athleteOrganizationConstraint: true,
      contactTable: true,
      contactIndex: true,
    }),
    "current",
  );
  assert.throws(
    () =>
      classifyUlcAthletesV3PreviewShape({
        athleteOrganizationConstraint: true,
        contactTable: true,
        contactIndex: false,
      }),
    UlcAthletesV3PreviewExecutionError,
  );
  assert.throws(
    () => classifyUlcAthletesV3PreviewShape({}),
    UlcAthletesV3PreviewConfigurationError,
  );
});
