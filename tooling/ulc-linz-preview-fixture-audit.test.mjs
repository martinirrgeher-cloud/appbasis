import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyUlcPreviewFixture,
  selectUlcPreviewBlockCandidates,
  countUnexpectedUlcPreviewFixtures,
  assertNoUlcPreviewE7B9Fixtures,
} from "./ulc-linz-preview-fixture-audit.mjs";

const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));

test("fixture classification preserves canonical athlete and self-registration group", () => {
  assert.equal(classifyUlcPreviewFixture("group", "Preview Selbstanmeldung"), "protected");
  assert.equal(classifyUlcPreviewFixture("athlete", "Preview Athlet"), "protected");
  assert.equal(classifyUlcPreviewFixture("athlete", "Athlet Preview"), "protected");
  assert.equal(classifyUlcPreviewFixture("athlete", "preview.athlete"), "review");
});

test("only exact 12-hex E7B9 acceptance names are unambiguous candidates", () => {
  const marker = "2f4ab302910e";
  for (const [kind, name] of [
    ["group", "E7B9 Preview Group " + marker],
    ["athlete", "E7B9 Preview-" + marker],
    ["exercise", "E7B9 Preview Exercise " + marker],
    ["block", "E7B9 Preview Block " + marker + " changed"],
    ["block", "E7B9 Save-back " + marker],
  ]) {
    assert.equal(classifyUlcPreviewFixture(kind, name), "e7b9");
  }
  for (const [kind, name] of [
    ["group", "Preview Hobbygruppe"],
    ["athlete", "Preview Person"],
    ["exercise", "Preview Bewegung"],
    ["block", "Preview Zirkel"],
  ]) {
    assert.equal(classifyUlcPreviewFixture(kind, name), "review");
  }
  assert.equal(classifyUlcPreviewFixture("group", "E7B9 Preview Group arbitrary"), "review");
  assert.equal(classifyUlcPreviewFixture("exercise", "Sprintübung"), "ignore");
});

test("audit uses a read-only transaction and cannot perform deletion", async () => {
  const source = await readFile(resolve(ROOT,"tooling/ulc-linz-preview-fixture-audit.mjs"), "utf8");
  assert.match(source, /SET TRANSACTION READ ONLY/);
  assert.match(source, /READ_ONLY_DRY_RUN/);
  assert.match(source, /allowedToPermanentlyDelete: false/);
  assert.match(source, /Only dry-run is implemented/);
  assert.doesNotMatch(source, /tx\.unsafe\(\s*["`][^"`]*(DELETE FROM|TRUNCATE |UPDATE |INSERT INTO)/i);
  for(const x of ["athletePlans","athleteAttendance","athleteRegistrations","athleteDocumentation","athleteIdentities","groupSessions","exerciseBlockOccurrences","exercisePlanOccurrences","blockPlanReferences"]) {
    assert.match(source,new RegExp(x));
  }
});

test("a block with any non-test revision is never a deletion candidate", () => {
  const exact = "E7B9 Preview Block 2f4ab302910e";
  const records = [
    { id: "block-a", name: exact },
    { id: "block-a", name: exact + " changed" },
    { id: "block-b", name: exact },
    { id: "block-b", name: "Echte Sprintübungen" },
    { id: "block-c", name: "Preview Zirkel" },
    { id: "block-d", name: "Echte Sprintübungen" },
  ];
  assert.deepEqual(selectUlcPreviewBlockCandidates(records), [
    { id: "block-a", name: exact, classification: "e7b9" },
    { id: "block-b", name: exact, classification: "review" },
    { id: "block-c", name: "Preview Zirkel", classification: "review" },
  ]);
});

test("audit explicitly reports cross-links and stays entirely read-only", async () => {
  const source = await readFile(resolve(ROOT, "tooling/ulc-linz-preview-fixture-audit.mjs"), "utf8");
  for (const risk of [
    "candidateGroupsOtherAthletes",
    "candidateAthletesOtherGroups",
    "candidateGroupsOtherAttendance",
    "candidateGroupsOtherRegistrations",
    "candidateAthletesOtherAttendance",
    "candidateAthletesOtherRegistrations",
    "candidateAthleteContacts",
    "candidateAthleteIdentities",
    "candidateGroupsOtherExercises",
    "candidateGroupsOtherBlocks",
    "candidateExercisesOtherBlocks",
    "candidateExercisesOtherPlans",
    "candidateBlocksOtherPlans",
    "candidateExercisesPrivateMedia",
    "candidateBlocksFavorites",
    "existingProtectedGroupLinks",
    "LINKED_DATA_REVIEW_REQUIRED",
  ]) assert.ok(source.includes(risk), risk);
  assert.match(source, /SET TRANSACTION READ ONLY/);
  assert.match(source, /allowedToPermanentlyDelete: false/);
});

test("post-deploy guard tolerates protected canonical records and ordinary preview labels", () => {
  const entries = {
    groups: [{ id: "grp-1", name: "Preview Selbstanmeldung", classification: "protected" }],
    athletes: [{ id: "ath-1", name: "Preview Athlet", classification: "protected" }],
    exercises: [{ id: "ex-1", name: "Preview Warmup", classification: "review" }],
    blocks: [{ id: "b-1", name: "Preview Sprint", classification: "review" }],
  };
  const unexpectedE7B9 = countUnexpectedUlcPreviewFixtures(entries, [
    { id: "b-1", name: "Preview Sprint" },
  ]);
  assert.deepEqual(unexpectedE7B9, {
    groups: 0, athletes: 0, exercises: 0, blocks: 0,
  });
  assert.ok(assertNoUlcPreviewE7B9Fixtures({ unexpectedE7B9 }));
});

test("post-deploy guard refuses one regenerated fixture, including mixed-revision blocks", () => {
  const marker = "2f4ab302910e";
  const entities = {
    groups: [{ id: "new", name: "E7B9 Preview Group " + marker, classification: "e7b9" }],
    athletes: [],
    exercises: [],
    blocks: [{ id: "mixed", name: "Actual interval set", classification: "review" }],
  };
  const unexpectedE7B9 = countUnexpectedUlcPreviewFixtures(entities, [
    { id: "mixed", name: "E7B9 Preview Block " + marker },
    { id: "mixed", name: "Actual interval set" },
    { id: "mixed", name: "E7B9 Save-back " + marker },
  ]);
  assert.deepEqual(unexpectedE7B9, {
    groups: 1, athletes: 0, exercises: 0, blocks: 1,
  });
  assert.throws(
    () => assertNoUlcPreviewE7B9Fixtures({ unexpectedE7B9 }),
    /Unexpected persistent E7B9 acceptance fixtures/,
  );
  assert.throws(
    () => assertNoUlcPreviewE7B9Fixtures({ unexpectedE7B9: { groups: 0 } }),
    /inventory is incomplete/,
  );
});

test("regression guard is read-only and has a single fail-closed workflow gate", async () => {
  const source = await readFile(resolve(ROOT, "tooling/ulc-linz-preview-fixture-audit.mjs"), "utf8");
  const workflow = await readFile(
    resolve(ROOT, ".github/workflows/ulc-linz-e7b9-preview.yml"), "utf8",
  );
  assert.match(source, /SET TRANSACTION READ ONLY/);
  assert.match(source, /if \(mode === "verify-clean"\)/);
  assert.match(source, /Do not auto-delete any data/);
  assert.match(workflow, /- name: Verify no regenerated E7B9 preview fixtures \(read-only\)/);
  assert.match(workflow, /node \.\/tooling\/ulc-linz-preview-fixture-audit\.mjs verify-clean/);
  assert.match(workflow, /if: inputs\.operation == 'accept' \|\| inputs\.operation == 'deploy-accept'/);
  const guard = workflow.indexOf("Verify no regenerated E7B9 preview fixtures (read-only)");
  assert.ok(guard > workflow.indexOf("Run authenticated E7B9 training-planning acceptance"));
  assert.ok(guard < workflow.indexOf("Record E7B9 preview operation"));
  assert.doesNotMatch(workflow, /run: node \.\/tooling\/ulc-linz-training-plans-preview-acceptance\.mjs/);
  assert.match(workflow, /run: node \.\/tooling\/ulc-linz-training-plans-preview-readonly-acceptance\.mjs/);
});
