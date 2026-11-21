/**
 * ULC-Linz first real-data onboarding inventory.
 * One SELECT, aggregates only. No name, email, UUID, personal row or secret
 * is ever emitted. A clean scan is never permission to deploy or enroll people.
 */
import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

export const ULC_PRODUCTION_ONBOARDING_SQL = String.raw`
SELECT jsonb_build_object(
  'tables', (SELECT count(*)::int FROM pg_catalog.pg_tables WHERE schemaname='public'),
  'trainingFences', (
    SELECT count(*)::int FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_class r ON r.oid=t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND NOT t.tgisinternal AND t.tgenabled IN ('O','A')
      AND t.tgfoid=to_regprocedure('public.ulc_linz_training_subject_write_fence()')
      AND r.relname IN ('ulc_linz_training_attendance','ulc_linz_training_registration','ulc_linz_training_registration_change')
  ),
  'documentationFences', (
    SELECT count(*)::int FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_class r ON r.oid=t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND NOT t.tgisinternal AND t.tgenabled IN ('O','A')
      AND t.tgname IN ('appbasis_training_documentation_guard_root','appbasis_training_documentation_guard_revision')
  ),
  'activeGroups', (SELECT count(*)::int FROM public.appbasis_training_group WHERE is_active=true),
  'smokeGroups', (SELECT count(*)::int FROM public.appbasis_training_group WHERE organization_id='ulc-linz-m6-smoke'),
  'nonSmokeMemberships', (SELECT count(*)::int FROM public.ulc_linz_membership WHERE active AND ended_at IS NULL AND organization_id<>'ulc-linz-m6-smoke'),
  'nonSmokeAdminLogins', (SELECT count(*)::int FROM public.ulc_linz_membership WHERE active AND ended_at IS NULL AND source_role='admin' AND organization_id<>'ulc-linz-m6-smoke'),
  'activeTrainers', (SELECT count(*)::int FROM public.appbasis_trainer WHERE is_active=true),
  'activeAthletes', (SELECT count(*)::int FROM public.appbasis_athlete WHERE is_active=true),
  'trainerGroupLinks', (SELECT count(*)::int FROM public.appbasis_trainer_group_membership),
  'activeTrainerLogins', (
    SELECT count(*)::int FROM public.ulc_linz_membership
    WHERE active=true AND ended_at IS NULL AND source_role='trainer'
  ),
  'activeAdminLogins', (
    SELECT count(*)::int FROM public.ulc_linz_membership
    WHERE active=true AND ended_at IS NULL AND source_role='admin'
  ),
  'technicalAdmins', (
    SELECT count(*)::int FROM public."user"
    WHERE username='ulc.production.admin' AND banned IS NOT TRUE
  ),
  'technicalAdminAppIdentityState', (
    SELECT count(*)::int FROM public.appbasis_identity_security_state state
    JOIN public."user" account ON account.id=state.identity_id
    WHERE account.username='ulc.production.admin'
  ),
  'regularClubAdminCandidates', (
    -- Structural prerequisites for normal application login only.
    -- The Better Auth technical root intentionally has no AppBasis state;
    -- its ULC membership and role binding alone do not make it usable.
    -- This is NOT a password/session/HTTP smoke-test.
    SELECT count(*)::int
    FROM public.ulc_linz_membership m
    JOIN public."user" u ON u.id=m.identity_id
    JOIN public.appbasis_identity_security_state state
      ON state.identity_id=m.identity_id
    JOIN public.appbasis_permission_principal principal
      ON principal.principal_id=m.identity_id
    JOIN public.appbasis_permission_principal_role role
      ON role.principal_id=m.identity_id AND role.role_id='ulc-linz:admin'
    WHERE m.organization_id='ulc-linz' AND m.source_role='admin'
      AND m.active AND m.ended_at IS NULL
      AND u.username IS NOT NULL AND u.username<>'ulc.production.admin'
      AND u.banned IS NOT TRUE AND state.disabled_at IS NULL
      AND state.must_change_password IS FALSE
      AND NOT EXISTS (
        SELECT 1 FROM public.appbasis_permission_principal_role other_role
        WHERE other_role.principal_id=m.identity_id
          AND other_role.role_id<>'ulc-linz:admin'
      )
      AND EXISTS (
        SELECT 1 FROM public.appbasis_permission_role_capability capability
        WHERE capability.role_id='ulc-linz:admin'
          AND capability.capability_id='ulc-linz:module:athletes:edit'
          AND NOT EXISTS (
            SELECT 1 FROM public.appbasis_permission_principal_revoke revoke
            WHERE revoke.principal_id=m.identity_id
              AND revoke.capability_id=capability.capability_id
          )
      )
  ),
  'eligibleTrainerCandidates', (
    SELECT count(*)::int FROM public.ulc_linz_membership m
    WHERE m.active=true AND m.ended_at IS NULL AND m.source_role='trainer'
      AND EXISTS (SELECT 1 FROM public.appbasis_trainer t
                  WHERE t.id=m.subject_id AND t.organization_id=m.organization_id
                    AND t.is_active=true)
      AND EXISTS (SELECT 1 FROM public.appbasis_trainer_group_membership gm
                  WHERE gm.organization_id=m.organization_id AND gm.trainer_id=m.subject_id)
      AND EXISTS (SELECT 1 FROM public.appbasis_permission_principal p
                  WHERE p.principal_id=m.identity_id)
      AND EXISTS (SELECT 1 FROM public.appbasis_permission_principal_role pr
                  WHERE pr.principal_id=m.identity_id AND pr.role_id='ulc-linz:trainer')
      AND EXISTS (SELECT 1 FROM public.appbasis_permission_role_capability c
                  WHERE c.role_id='ulc-linz:trainer'
                    AND c.capability_id IN (
                      'ulc-linz:module:u12:edit',
                      'ulc-linz:module:u14:edit',
                      'ulc-linz:module:kindertraining:edit'
                    )
                    AND NOT EXISTS (
                      SELECT 1 FROM public.appbasis_permission_principal_revoke r
                      WHERE r.principal_id=m.identity_id AND r.capability_id=c.capability_id
                    )
      )
  ),
  'sessions', (SELECT count(*)::int FROM public.ulc_linz_training_session),
  'catalogItems', (SELECT count(*)::int FROM public.appbasis_exercise_catalog_item),
  'trainingBlocks', (SELECT count(*)::int FROM public.appbasis_training_block),
  'privateMediaMetadata', (SELECT count(*)::int FROM public.appbasis_exercise_catalog_private_media)
)::text AS inventory
`.trim();
const KEYS = Object.freeze([
  "tables", "trainingFences", "documentationFences", "activeGroups",
  "smokeGroups", "nonSmokeMemberships", "nonSmokeAdminLogins",
  "activeTrainers", "activeAthletes", "trainerGroupLinks",
  "activeTrainerLogins", "activeAdminLogins", "technicalAdmins",
  "technicalAdminAppIdentityState", "regularClubAdminCandidates",
  "eligibleTrainerCandidates", "sessions", "catalogItems", "trainingBlocks",
  "privateMediaMetadata",
]);
function boundedFacts(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).length !== KEYS.length ||
      !KEYS.every(k => Object.hasOwn(value,k) &&
        Number.isSafeInteger(value[k]) && value[k] >= 0 && value[k] <= 10_000_000)) {
    throw new Error("ULC onboarding counters missing, malformed or unexpected.");
  }
  return value;
}
export function evaluateUlcProductionOnboarding(value) {
  const facts = boundedFacts(value);
  const blockers = [];
  if (facts.tables !== 69 || facts.trainingFences !== 3 ||
      facts.documentationFences !== 2) blockers.push("DATABASE_SCHEMA_OR_FENCES");
  if (facts.technicalAdmins !== 1) blockers.push("TECHNICAL_ADMIN_BOOTSTRAP");
  if (facts.smokeGroups > 0) blockers.push("GROUPS_ASSIGNED_TO_SMOKE_ORGANIZATION");
  if (facts.nonSmokeMemberships < 1) blockers.push("NO_REAL_ULC_ORGANIZATION");
  if (facts.nonSmokeAdminLogins !== 1) blockers.push("REAL_ULC_ADMIN_MEMBERSHIP_MISSING");
  if (facts.regularClubAdminCandidates < 1)
    blockers.push("NO_REGULAR_APP_ADMIN_IDENTITY");

  if (facts.activeGroups < 1) blockers.push("GROUPS_NOT_INITIALIZED");
  if (facts.activeTrainers < 1 || facts.trainerGroupLinks < 1)
    blockers.push("TRAINERS_OR_GROUP_ASSIGNMENTS_MISSING");
  if (facts.activeAthletes < 1) blockers.push("ATHLETES_NOT_INITIALIZED");
  if (facts.eligibleTrainerCandidates < 1)
    blockers.push("NO_ELIGIBLE_TRAINER_WRITE_CANDIDATE");
  const warnings = [];
  if (facts.privateMediaMetadata > 0) warnings.push("REAL_PRIVATE_MEDIA_BACKUP_NOT_VERIFIED");
  else warnings.push("PRIVATE_MEDIA_PROVIDER_INVENTORY_NOT_VERIFIED");
  if (facts.catalogItems === 0) warnings.push("CATALOG_CONTENT_EMPTY");
  if (facts.trainingBlocks === 0) warnings.push("TRAINING_BLOCKS_EMPTY");
  return Object.freeze({
    application: "ulc-linz",
    scope: "read-only-counters-from-selected-production-database",
    status: blockers.length ? "ONBOARDING_BLOCKED" : "ONBOARDING_BASELINE_PRESENT_REVIEW_REQUIRED",
    blockers: Object.freeze(blockers),
    warnings: Object.freeze(warnings),
    counts: Object.freeze(Object.fromEntries(KEYS.map(k => [k,facts[k]]))),
    liveWorkerBindingsVerified: false,
    crossOwnerRestoreVerified: false,
    privateMediaBackupVerified: false,
    legalApprovalVerified: false,
    moduleSmokePassed: false,
    productionReleaseAuthorized: false,
    productionWritesAuthorized: false,
  });
}
export function formatUlcProductionOnboardingSummary(result) {
  return [
    "### ULC Linz – tatsächliche Produktionsgrundkonfiguration (nur lesend)",
    "",
    "- Vorbedingungen: **" + result.status + "**",
    "- Sperren: " + (result.blockers.join(", ") || "keine in diesen Grundzählungen"),
    "- Hinweise: " + result.warnings.join(", "),
    "- Tabellen: " + result.counts.tables,
    "- Trainings-/Dokumentations-Trigger: " + result.counts.trainingFences + " / " +
        result.counts.documentationFences,
    "- Technischer Administrator (Anzahl): " + result.counts.technicalAdmins,
    "- Technischer Root mit regulärem AppBasis-Identitätsstatus: " +
        result.counts.technicalAdminAppIdentityState,
    "- Mögliche reguläre ULC-App-Admins (vollständiger Identity-/Rollenstatus): " +
        result.counts.regularClubAdminCandidates,
    "- Testgruppen / Nicht-Test-Mitgliedschaften / echte ULC-Admin-Mitgliedschaften: " +
        [result.counts.smokeGroups, result.counts.nonSmokeMemberships, result.counts.nonSmokeAdminLogins].join(" / "),
    "- Gruppen / Trainer / Athleten: " + [
      result.counts.activeGroups, result.counts.activeTrainers, result.counts.activeAthletes,
    ].join(" / "),
    "- Trainer-Gruppen-Zuordnungen: " + result.counts.trainerGroupLinks,
    "- Aktive Trainer-Logins / mögliche berechtigte Trainings-Writer: " +
        result.counts.activeTrainerLogins + " / " + result.counts.eligibleTrainerCandidates,
    "- Sitzungen / Übungen / Blöcke / private Medien-Metadaten: " +
        [result.counts.sessions, result.counts.catalogItems, result.counts.trainingBlocks,
          result.counts.privateMediaMetadata].join(" / "),
    "- **Wichtig:** Ein technischer Better-Auth-Root mit fehlendem AppBasis-Status " +
      "kann keine normale ULC-Anmeldung nutzen. Die Zähler prüfen nur Identitäts-" +
      " und Rollen-Vorbedingungen, keine echte App-Session-/UI-Anmeldung.",
    "- **Kein Go-live-Nachweis:** Worker-Bindings, komplette Benutzerrechte, Medienprovider, " +
      "Wiederherstellung, Löschrecht und Handy-Smoke bleiben getrennt.",
    "- Keine Datenänderung oder Berechtigungserweiterung. Ein erfolgreicher Workflow-Run " +
      "bedeutet NUR: Lesende Zählprüfung ist technisch durchgelaufen.",
  ].join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const mode = process.argv[2];
  try {
    if (mode === "sql") {
      process.stdout.write(ULC_PRODUCTION_ONBOARDING_SQL.trim() + "\n");
    } else if (mode === "assess") {
      const chunks = [];
      let bytes = 0;
      for await (const chunk of process.stdin) {
        bytes += chunk.length;
        if (bytes > 4096) throw new Error("ULC onboarding input too large.");
        chunks.push(chunk);
      }
      const result = evaluateUlcProductionOnboarding(
        JSON.parse(Buffer.concat(chunks).toString("utf8").trim()),
      );
      const summary = formatUlcProductionOnboardingSummary(result);
      if (process.env.GITHUB_STEP_SUMMARY) {
        await appendFile(process.env.GITHUB_STEP_SUMMARY, summary + "\n");
      }
      process.stdout.write(JSON.stringify({
        status: result.status, blockers: result.blockers, warnings: result.warnings,
        productionReleaseAuthorized: false,
      }) + "\n");
    } else {
      throw new Error("Expected sql or assess.");
    }
  } catch {
    // Fail closed and do not echo received JSON, rows, errors or credentials.
    process.stderr.write("ULC onboarding read-only scan failed; no go-live judgment.\n");
    process.exitCode = 1;
  }
}
