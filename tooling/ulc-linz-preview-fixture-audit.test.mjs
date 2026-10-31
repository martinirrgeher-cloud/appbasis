import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyUlcPreviewFixture, selectUlcPreviewBlockCandidates } from "./ulc-linz-preview-fixture-audit.mjs";

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
