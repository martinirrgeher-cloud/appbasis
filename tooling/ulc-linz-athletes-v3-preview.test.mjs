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

test("athletes v3 historical preview plan fails closed after the repository advances beyond schema v3", async () => {
  await assert.rejects(
    loadUlcAthletesV3PreviewPlan({ repositoryRoot }),
    (error) =>
      error instanceof UlcAthletesV3PreviewConfigurationError &&
      /canonical published schema-v3 repository contract/.test(error.message),
  );
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
