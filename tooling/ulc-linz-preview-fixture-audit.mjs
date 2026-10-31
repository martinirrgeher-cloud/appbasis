import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import { validatePostgresConnectionString } from "./database-migration-executor.mjs";
import { parseGeneratedPreviewDatabaseUrl } from "./generated-preview-hyperdrive.mjs";
import { ULC_LINZ_D4_PREVIEW_APPLICATION_HYPERDRIVE } from "./ulc-linz-d4-preview-hyperdrive.mjs";

const ORGANIZATION = "ulc-linz-preview";
const DATABASE = ULC_LINZ_D4_PREVIEW_APPLICATION_HYPERDRIVE.database;
export class UlcPreviewFixtureAuditError extends Error {
  constructor(message) {
    super(message);
    this.name = "UlcPreviewFixtureAuditError";
  }
}

export function classifyUlcPreviewFixture(kind, value) {
  if (kind === "group") {
    if (value === "Preview Selbstanmeldung") return "protected";
    if (/^E7B9 Preview Group [a-f0-9]{12}$/i.test(value)) return "e7b9";
  }
  if (kind === "athlete") {
    if (/^(Preview Athlet|Athlet Preview)$/i.test(value)) return "protected";
    if (/^E7B9 Preview-[a-f0-9]{12}$/i.test(value)) return "e7b9";
  }
  if (kind === "exercise") {
    if (/^E7B9 Preview Exercise [a-f0-9]{12}$/i.test(value)) return "e7b9";
  }
  if (kind === "block") {
    if (/^E7B9 (Preview Block|Save-back) [a-f0-9]{12}( changed)?$/i.test(value)) return "e7b9";
  }
  if (/preview/i.test(value)) return "review";
  return "ignore";
}

export async function auditUlcPreviewFixtures(
  { connectionString },
  { databaseFactory = createPostgresDatabase } = {},
) {
  let identity;
  try {
    identity = parseGeneratedPreviewDatabaseUrl(
      connectionString, ULC_LINZ_D4_PREVIEW_APPLICATION_HYPERDRIVE,
    );
  } catch {
    throw new UlcPreviewFixtureAuditError("Only the isolated ULC preview application credential is accepted.");
  }
  const validated = validatePostgresConnectionString(connectionString, {
    expectedDatabase: DATABASE,
    ConfigurationError: UlcPreviewFixtureAuditError,
  });
  const database = databaseFactory(validated);
  try {
    return await database.client.begin(async (tx) => {
      await tx.unsafe("SET TRANSACTION READ ONLY");
      const current = await tx.unsafe(
        "SELECT current_database() AS db, current_user AS principal",
      );
      if (current.length !== 1 || current[0].db !== DATABASE ||
        current[0].principal !== identity.user) {
        throw new UlcPreviewFixtureAuditError("Preview database identity mismatch.");
      }
      const groups = await tx.unsafe(
        "SELECT id, name FROM appbasis_training_group WHERE organization_id=$1 ORDER BY name",
        [ORGANIZATION],
      );
      const athletes = await tx.unsafe(
        "SELECT id, first_name, last_name FROM appbasis_athlete WHERE organization_id=$1 ORDER BY first_name,last_name",
        [ORGANIZATION],
      );
      const exercises = await tx.unsafe(
        "SELECT id, name FROM appbasis_exercise_catalog_item WHERE organization_id=$1 ORDER BY name",
        [ORGANIZATION],
      );
      const blockVersions = await tx.unsafe(
        "SELECT block_id AS id, name FROM appbasis_training_block_revision WHERE organization_id=$1 ORDER BY block_id,revision",
        [ORGANIZATION],
      );

      const entities = {
        groups: selectCandidates("group", groups.map(x => ({ id: x.id, name: x.name }))),
        athletes: selectCandidates("athlete", athletes.map(x => ({
          id: x.id, name: x.first_name + " " + x.last_name,
        }))),
        exercises: selectCandidates("exercise", exercises.map(x => ({ id: x.id, name: x.name }))),
        blocks: selectUlcPreviewBlockCandidates(blockVersions.map(x => ({ id: x.id, name: x.name }))),
      };
      const ids = (kind) => entities[kind].filter(x => x.classification === "e7b9").map(x => x.id);
      const groupIds = ids("groups");
      const athleteIds = ids("athletes");
      const exerciseIds = ids("exercises");
      const blockIds = ids("blocks");
      const count = async (table, condition, values) => {
        if (values.length === 0) return 0;
        const rows = await tx.unsafe(
          "SELECT count(*)::int AS total FROM " + table +
          " WHERE organization_id=$1 AND (" + condition + ")",
          [ORGANIZATION, ...values],
        );
        return Number(rows[0].total);
      };
      const dependencies = {
        groupMemberships: await count("appbasis_athlete_group_membership", "group_id = ANY($2::text[])", [groupIds]),
        groupSessions: await count("ulc_linz_training_session", "group_id = ANY($2::text[])", [groupIds]),
        groupExerciseAudience: await count("appbasis_exercise_catalog_audience", "audience_id = ANY($2::text[])", [groupIds]),
        athleteGroupMemberships: await count("appbasis_athlete_group_membership", "athlete_id = ANY($2::text[])", [athleteIds]),
        athleteContacts: await count("appbasis_athlete_contact", "athlete_id = ANY($2::text[])", [athleteIds]),
        athletePlans: await count("appbasis_training_plan", "subject_id = ANY($2::text[])", [athleteIds]),
        athleteDocumentation: await count("appbasis_training_documentation", "subject_id = ANY($2::text[])", [athleteIds]),
        athleteAttendance: await count("ulc_linz_training_attendance", "athlete_id = ANY($2::text[])", [athleteIds]),
        athleteRegistrations: await count("ulc_linz_training_registration", "athlete_id = ANY($2::text[])", [athleteIds]),
        athleteIdentities: await count("ulc_linz_membership", "subject_id = ANY($2::text[])", [athleteIds]),
        exerciseBlockOccurrences: await count("appbasis_training_block_revision_item", "exercise_id = ANY($2::text[])", [exerciseIds]),
        exercisePlanOccurrences: await count("appbasis_training_plan_revision_item", "source_exercise_id = ANY($2::text[])", [exerciseIds]),
        exerciseUsage: await count("appbasis_exercise_catalog_usage", "exercise_id = ANY($2::text[])", [exerciseIds]),
        exercisePrivateMedia: await count("appbasis_exercise_catalog_private_media", "exercise_id = ANY($2::text[])", [exerciseIds]),
        blockPlanReferences: await count("appbasis_training_plan_revision_item", "source_block_id = ANY($2::text[])", [blockIds]),
        blockUsage: await count("appbasis_training_block_usage", "block_id = ANY($2::text[])", [blockIds]),
        blockFavorites: await count("appbasis_training_block_favorite", "block_id = ANY($2::text[])", [blockIds]),
      };
      // These links must be reviewed before *any* future cleanup. In particular,
      // a fixture athlete may belong to a regular training group: deleting the
      // athlete must not delete or silently modify that group's real members.
      const externalReferences = {
        candidateGroupsOtherAthletes: await count(
          "appbasis_athlete_group_membership",
          "group_id = ANY($2::text[]) AND NOT (athlete_id = ANY($3::text[]))",
          [groupIds, athleteIds],
        ),
        candidateAthletesOtherGroups: await count(
          "appbasis_athlete_group_membership",
          "athlete_id = ANY($2::text[]) AND NOT (group_id = ANY($3::text[]))",
          [athleteIds, groupIds],
        ),
        candidateGroupsOtherAttendance: await count(
          "ulc_linz_training_attendance",
          "session_id IN (SELECT id FROM ulc_linz_training_session WHERE organization_id=$1 AND group_id = ANY($2::text[])) AND NOT (athlete_id = ANY($3::text[]))",
          [groupIds, athleteIds],
        ),
        candidateGroupsOtherRegistrations: await count(
          "ulc_linz_training_registration",
          "session_id IN (SELECT id FROM ulc_linz_training_session WHERE organization_id=$1 AND group_id = ANY($2::text[])) AND NOT (athlete_id = ANY($3::text[]))",
          [groupIds, athleteIds],
        ),
        candidateAthletesOtherAttendance: await count(
          "ulc_linz_training_attendance",
          "athlete_id = ANY($2::text[]) AND NOT EXISTS (SELECT 1 FROM ulc_linz_training_session s WHERE s.id=ulc_linz_training_attendance.session_id AND s.organization_id=$1 AND s.group_id = ANY($3::text[]))",
          [athleteIds, groupIds],
        ),
        candidateAthletesOtherRegistrations: await count(
          "ulc_linz_training_registration",
          "athlete_id = ANY($2::text[]) AND NOT EXISTS (SELECT 1 FROM ulc_linz_training_session s WHERE s.id=ulc_linz_training_registration.session_id AND s.organization_id=$1 AND s.group_id = ANY($3::text[]))",
          [athleteIds, groupIds],
        ),
        candidateAthleteContacts: await count(
          "appbasis_athlete_contact", "athlete_id = ANY($2::text[])", [athleteIds],
        ),
        candidateAthleteIdentities: dependencies.athleteIdentities,
        candidateGroupsOtherExercises: await count(
          "appbasis_exercise_catalog_audience",
          "audience_id = ANY($2::text[]) AND NOT (exercise_id = ANY($3::text[]))",
          [groupIds, exerciseIds],
        ),
        candidateGroupsOtherBlocks: await count(
          "appbasis_training_block_revision",
          "block_id <> ALL($3::text[]) AND (audience_id = ANY($2::text[]) OR audience_ids && $2::text[])",
          [groupIds, blockIds],
        ),
        candidateExercisesOtherBlocks: await count(
          "appbasis_training_block_revision_item",
          "exercise_id = ANY($2::text[]) AND NOT (block_id = ANY($3::text[]))",
          [exerciseIds, blockIds],
        ),
        candidateExercisesOtherPlans: await count(
          "appbasis_training_plan_revision_item",
          "source_exercise_id = ANY($2::text[]) AND NOT EXISTS (SELECT 1 FROM appbasis_training_plan p WHERE p.organization_id=$1 AND p.id=appbasis_training_plan_revision_item.plan_id AND p.subject_id = ANY($3::text[]))",
          [exerciseIds, athleteIds],
        ),
        candidateBlocksOtherPlans: await count(
          "appbasis_training_plan_revision_item",
          "source_block_id = ANY($2::text[]) AND NOT EXISTS (SELECT 1 FROM appbasis_training_plan p WHERE p.organization_id=$1 AND p.id=appbasis_training_plan_revision_item.plan_id AND p.subject_id = ANY($3::text[]))",
          [blockIds, athleteIds],
        ),
        candidateExercisesPrivateMedia: dependencies.exercisePrivateMedia,
        candidateBlocksFavorites: dependencies.blockFavorites,
      };
      const activeCandidates = {
        groups: await count("appbasis_training_group", "id = ANY($2::text[]) AND is_active=true", [groupIds]),
        athletes: await count("appbasis_athlete", "id = ANY($2::text[]) AND is_active=true", [athleteIds]),
        exercises: await count("appbasis_exercise_catalog_item", "id = ANY($2::text[]) AND is_active=true", [exerciseIds]),
        blocks: await count("appbasis_training_block", "id = ANY($2::text[]) AND is_active=true", [blockIds]),
      };
      const existingProtectedGroupLinks = await tx.unsafe(
        "SELECT a.id AS athlete_id, a.first_name || ' ' || a.last_name AS athlete_name, g.name AS group_name " +
        "FROM appbasis_athlete_group_membership m " +
        "JOIN appbasis_athlete a ON a.organization_id=m.organization_id AND a.id=m.athlete_id " +
        "JOIN appbasis_training_group g ON g.organization_id=m.organization_id AND g.id=m.group_id " +
        "WHERE m.organization_id=$1 AND a.id = ANY($2::text[]) AND NOT (g.id = ANY($3::text[])) " +
        "ORDER BY a.id, g.id LIMIT 30",
        [ORGANIZATION, athleteIds, groupIds],
      );
      const externalLinkTotal = Object.values(externalReferences).reduce((sum, amount) => sum + amount, 0);
      const activeTotal = Object.values(activeCandidates).reduce((sum, amount) => sum + amount, 0);
      const all = Object.entries(entities).map(([kind, items]) => ({
        kind,
        e7b9: items.filter(x => x.classification === "e7b9").length,
        review: items.filter(x => x.classification === "review").length,
        protected: items.filter(x => x.classification === "protected").length,
        sample: items.filter(x => x.classification === "e7b9").slice(0, 5)
          .map(x => ({ id: x.id, name: x.name })),
      }));
      const digest = createHash("sha256")
        .update(JSON.stringify({ entities, dependencies, externalReferences, activeCandidates, existingProtectedGroupLinks })).digest("hex");
      return Object.freeze({
        status: "review-required",
        mode: "READ_ONLY_DRY_RUN",
        database: DATABASE,
        organization: ORGANIZATION,
        inventory: all,
        dependencies,
        externalReferences,
        activeCandidates,
        existingProtectedGroupLinks,
        cleanupReviewState: externalLinkTotal > 0 || activeTotal > 0
          ? "LINKED_DATA_REVIEW_REQUIRED" : "INACTIVE_CANDIDATES_REVIEW_REQUIRED",
        digest,
        allowedToPermanentlyDelete: false,
        note: "Only exact E7B9 names with fully matching block revision histories are candidates. Cross-links and archived history require explicit review and a separate authorized cleanup. No records modified.",
      });
    });
  } finally {
    await database.close();
  }
}

export function selectUlcPreviewBlockCandidates(entries) {
  // The block id is shared across all its revisions. Never classify the whole
  // block as disposable just because *one* revision has an acceptance-test name.
  const grouped = new Map();
  for (const item of entries) {
    const revisions = grouped.get(item.id) ?? [];
    revisions.push(item);
    grouped.set(item.id, revisions);
  }
  const result = [];
  for (const [id, revisions] of grouped) {
    const classes = revisions.map(item => classifyUlcPreviewFixture("block", item.name));
    const hasTestRevision = classes.includes("e7b9");
    const hasReviewRevision = classes.includes("review");
    if (!hasTestRevision && !hasReviewRevision) continue;
    const classification = hasTestRevision && classes.every(c => c === "e7b9")
      ? "e7b9" : "review";
    result.push({ id, name: revisions[0].name, classification });
  }
  return result.sort((a, b) => a.id.localeCompare(b.id));
}

function selectCandidates(kind, entries) {
  const found = new Map();
  for (const item of entries) {
    const classification = classifyUlcPreviewFixture(kind, item.name);
    if (classification === "ignore") continue;
    if (!found.has(item.id)) found.set(item.id, { ...item, classification });
    else if (classification === "protected" ||
      (classification === "e7b9" && found.get(item.id).classification === "review")) {
      found.set(item.id, { ...item, classification });
    }
  }
  return [...found.values()].sort((a, b) => a.id.localeCompare(b.id));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.slice(2).some(arg => arg !== "dry-run")) {
    console.error("Only dry-run is implemented. Permanent deletion requires a separate approved change.");
    process.exitCode = 1;
  } else {
    auditUlcPreviewFixtures({ connectionString: process.env.APPBASIS_DATABASE_URL })
      .then(result => console.log(JSON.stringify(result, null, 2)))
      .catch(error => { console.error(error?.message || "Preview fixture audit failed."); process.exitCode = 1; });
  }
}
