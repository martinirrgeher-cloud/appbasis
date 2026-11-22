import { readFile } from "node:fs/promises";

/**
 * P02-J: review-only 44-migration v18/v5 proposal for existing 69-table
 * Preview. The ordinary AppBasis installer needs an EMPTY public schema;
 * never replay the proposed migration files on an existing installation.
 * This module contains NO connection, SQL mutations, or provider actions.
 */
export const NEW_MIGRATIONS = Object.freeze({
  catalog: "modules/exercise-catalog/migrations/0004_appbasis_exercise_catalog_subject_lifecycle.sql",
  calendar: "apps/ulc-linz/migrations/0016_ulc_linz_registration_calendar.sql",
  fence: "apps/ulc-linz/migrations/0017_ulc_linz_training_subject_write_fence.sql",
});
export const SOURCE_CANDIDATES = Object.freeze({
  catalog: "modules/exercise-catalog/test/fixtures/0004_appbasis_exercise_catalog_subject_lifecycle.candidate.sql",
  calendar: NEW_MIGRATIONS.calendar,
  fence: "apps/ulc-linz/test/fixtures/p03-d-training-subject-write-fence.candidate.sql",
});
const OWNERS = Object.freeze([
  "identity","permissions","athletes","exercise-catalog",
  "training-blocks","training-documentation","training-plans",
  "ulc-linz-lifecycle",
]);
function block(reason) { throw new Error("ULC P02-J schema reconcile BLOCKED: " + reason); }

function owner(manifest,id,version,count) {
  const match=manifest.owners?.filter(x=>x?.id===id);
  if(match?.length!==1||match[0].schemaVersion!==version||
    match[0].migrations?.length!==count) block("canonical "+id+" version drift");
  return match[0];
}

export function buildUlc69ManifestProposal(appManifest,catalogModule) {
  // The canonical ULC manifest now contains an additional catalog-v6 guard.
  // To evaluate the historical v18/v5 44-file proposal, project only that
  // exact, last module-owner migration out first; never modify caller inputs
  // or silently accept an unknown catalog migration.
  if (appManifest?.application==="ulc-linz" &&
      appManifest.manifestVersion===1 &&
      appManifest.owners?.flatMap(x=>x.migrations??[]).length===47) {
    const currentCatalog=appManifest.owners.filter(x=>x.id==="exercise-catalog");
    const currentModule=catalogModule?.database;
    const guard="modules/exercise-catalog/migrations/0005_appbasis_exercise_catalog_subject_deletion_write_fence.sql";
    if (currentCatalog.length!==1 ||
        currentCatalog[0].schemaVersion!==6 ||
        currentCatalog[0].migrations.length!==6 ||
        currentCatalog[0].migrations.at(-1)!==guard ||
        catalogModule?.moduleId!=="exercise-catalog" ||
        currentModule?.schemaVersion!==6 ||
        currentModule.migrations?.length!==6 ||
        currentModule.migrations.at(-1)!==guard ||
        JSON.stringify(currentCatalog[0].migrations)!==
          JSON.stringify(currentModule.migrations)) {
      block("canonical catalog v6 forward migration drift");
    }
    const olderApp=structuredClone(appManifest);
    const olderModule=structuredClone(catalogModule);
    const ownerCatalog=olderApp.owners.find(x=>x.id==="exercise-catalog");
    ownerCatalog.schemaVersion=5;
    ownerCatalog.migrations.pop();
    olderModule.database.schemaVersion=5;
    olderModule.database.migrations.pop();
    appManifest=olderApp;
    catalogModule=olderModule;
  }
  // P1 historical publication: preserve the original 41→44 proposal,
  // even after the 45th P02 tombstone-guard migration is registered.
  // Pin the single additional owner migration explicitly, then project
  // the exact former 44-file publication without rewriting historical DDL.
  // NO existing populated schema may replay these SQL files.
  // Preserve the previously published 41/44/45-migration historical
  // proposals. The current v19 owner appends a forward-only replacement
  // function; project it back to the verified v18 45-file inventory ONLY
  // for reviewing historical P02-J plans, never for execution.
  if (appManifest?.application==="ulc-linz" &&
      appManifest.manifestVersion===1 &&
      appManifest?.owners?.flatMap(x=>x.migrations??[]).length===46) {
    const review=structuredClone(appManifest);
    const lifecycle=review.owners?.find(x=>x.id==="ulc-linz-lifecycle");
    const next="apps/ulc-linz/migrations/0018_ulc_linz_training_subject_isolation_reconciliation.sql";
    if (!lifecycle || lifecycle.schemaVersion!==19 ||
        lifecycle.migrations.length!==19 || lifecycle.migrations.at(-1)!==next)
      block("current v19 forward migration drift");
    lifecycle.schemaVersion=18;
    lifecycle.migrations.pop();
    appManifest=review;
  }
  if (appManifest?.application==="ulc-linz" &&
      appManifest.manifestVersion===1 &&
      appManifest.dialect==="postgresql" &&
      JSON.stringify(appManifest.owners?.map(x=>x.id))===JSON.stringify(OWNERS) &&
      appManifest.owners.flatMap(x=>x.migrations??[]).length===45 &&
      catalogModule?.moduleId==="exercise-catalog" &&
      catalogModule.database?.schemaVersion===5) {
    const catalog=owner(appManifest,"exercise-catalog",5,5);
    const blocks=owner(appManifest,"training-blocks",7,7);
    const lifecycle=owner(appManifest,"ulc-linz-lifecycle",18,18);
    const all=appManifest.owners.flatMap(x=>x.migrations);
    const newGuard="modules/training-blocks/migrations/0006_appbasis_training_block_usage_subject_tombstone_guard.sql";
    if (all.length!==45 || new Set(all).size!==45 ||
        blocks.migrations.at(-1)!==newGuard ||
        catalog.migrations.at(-1)!==NEW_MIGRATIONS.catalog ||
        lifecycle.migrations.at(-2)!==NEW_MIGRATIONS.calendar ||
        lifecycle.migrations.at(-1)!==NEW_MIGRATIONS.fence ||
        JSON.stringify(catalog.migrations)!==
          JSON.stringify(catalogModule.database.migrations) ||
        appManifest.owners.some(x=>
          x.migrations.some(path=>!path.startsWith(x.root+"/")))) {
      block("published v18/v5 manifest owner paths drifted");
    }
    const historical=structuredClone(appManifest);
    const olderBlocks=historical.owners.find(x=>x.id==="training-blocks");
    olderBlocks.schemaVersion=6;
    olderBlocks.migrations.pop();
    if (historical.owners.flatMap(x=>x.migrations).length!==44 ||
        historical.owners.some(x=>x.migrations.includes(newGuard))) {
      block("historical owner projection failed");
    }
    return Object.freeze({
      app:Object.freeze(historical),
      module:Object.freeze(structuredClone(catalogModule)),
      expectedTables:69,proposedMigrations:44,
      candidateOnly:false,published:true,
      mayApplyToExistingPreview:false,productionReady:false,
      providerWritesAllowed:false,
    });
  }
  if(appManifest?.application!=="ulc-linz"||
    appManifest.manifestVersion!==1||appManifest.dialect!=="postgresql"||
    JSON.stringify(appManifest.owners?.map(x=>x.id))!==JSON.stringify(OWNERS)||
    appManifest.owners.flatMap(x=>x.migrations??[]).length!==41||
    catalogModule?.moduleId!=="exercise-catalog"||
    catalogModule.database?.schemaVersion!==4) {
    block("expected eight-owner, 41-migration v16 baseline absent");
  }
  const catalog=owner(appManifest,"exercise-catalog",4,4);
  const lifecycle=owner(appManifest,"ulc-linz-lifecycle",16,16);
  if(JSON.stringify(catalog.migrations)!==
    JSON.stringify(catalogModule.database.migrations)||
    catalog.migrations.includes(NEW_MIGRATIONS.catalog)||
    lifecycle.migrations.includes(NEW_MIGRATIONS.calendar)||
    lifecycle.migrations.includes(NEW_MIGRATIONS.fence)){
    block("migration paths already published or inconsistent");
  }

  const app=structuredClone(appManifest);
  const module=structuredClone(catalogModule);
  module.database.schemaVersion=5;
  module.database.migrations.push(NEW_MIGRATIONS.catalog);
  const appCatalog=app.owners.find(x=>x.id==="exercise-catalog");
  appCatalog.schemaVersion=5;
  appCatalog.migrations.push(NEW_MIGRATIONS.catalog);
  const appLifecycle=app.owners.find(x=>x.id==="ulc-linz-lifecycle");
  appLifecycle.schemaVersion=18;
  appLifecycle.migrations.push(NEW_MIGRATIONS.calendar,NEW_MIGRATIONS.fence);
  const paths=app.owners.flatMap(x=>x.migrations);
  if(paths.length!==44||new Set(paths).size!==44||
    app.owners.some(x=>x.migrations.some(p=>!p.startsWith(x.root+"/")))) {
    block("candidate migration cardinality or owner path drift");
  }
  return Object.freeze({
    app:Object.freeze(app),module:Object.freeze(module),
    expectedTables:69,proposedMigrations:44,
    candidateOnly:true,mayApplyToExistingPreview:false,
    productionReady:false,providerWritesAllowed:false,
  });
}

/**
 * Read-only query is executed with the ordinary app ROLE; its negative
 * marker-privilege check is part of the 69-table state proof.
 */
export const ULC69_CATALOG_SQL = String.raw`
SELECT
 (SELECT count(*)::int FROM pg_catalog.pg_tables
   WHERE schemaname='public') AS public_tables,
 to_regclass('public.ulc_linz_registration_calendar_rule') IS NOT NULL
   AS calendar_rule_exists,
 to_regclass('public.ulc_linz_registration_calendar_exception') IS NOT NULL
   AS calendar_exception_exists,
 to_regclass('public.appbasis_exercise_catalog_favorite_deletion') IS NOT NULL
   AS catalog_marker_exists,
 to_regclass('public.appbasis_exercise_catalog_usage_subject') IS NOT NULL
   AS catalog_attribution_exists,
 to_regclass('public.appbasis_exercise_catalog_usage_subject_principal_idx') IS NOT NULL
   AS catalog_attribution_index_exists,
 to_regclass('public.ulc_linz_training_subject_deletion') IS NOT NULL
   AS training_marker_exists,
 to_regprocedure('public.ulc_linz_training_subject_write_fence()') IS NOT NULL
   AS training_fence_function_exists,
 (SELECT count(*)::int FROM pg_catalog.pg_trigger t
   JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
   JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND NOT t.tgisinternal
    AND (c.relname,t.tgname) IN (
      ('ulc_linz_training_attendance','ulc_linz_training_attendance_subject_fence'),
      ('ulc_linz_training_registration','ulc_linz_training_registration_subject_fence'),
      ('ulc_linz_training_registration_change','ulc_linz_training_registration_change_subject_fence')
    )) AS installed_fence_triggers,
 (SELECT count(*)::int FROM pg_catalog.pg_trigger t
   JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
   JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND NOT t.tgisinternal
     AND t.tgenabled IN ('O','A')
     AND (t.tgtype::integer & 23)=23
     AND t.tgfoid=to_regprocedure('public.ulc_linz_training_subject_write_fence()')
     AND (c.relname,t.tgname) IN (
       ('ulc_linz_training_attendance','ulc_linz_training_attendance_subject_fence'),
       ('ulc_linz_training_registration','ulc_linz_training_registration_subject_fence'),
       ('ulc_linz_training_registration_change','ulc_linz_training_registration_change_subject_fence')
     )) AS active_fence_triggers,
 CASE WHEN to_regclass('public.ulc_linz_training_subject_deletion') IS NULL
   THEN false ELSE has_table_privilege(current_user,
     'public.ulc_linz_training_subject_deletion',
     'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
 END AS app_can_access_training_marker
`;

const BOOLS=Object.freeze([
  "calendar_rule_exists","calendar_exception_exists",
  "catalog_marker_exists","catalog_attribution_exists",
  "catalog_attribution_index_exists","training_marker_exists",
  "training_fence_function_exists","app_can_access_training_marker",
]);
export function classifyUlc69ManifestState(row) {
  if(!row||!Number.isInteger(row.public_tables)||
    !Number.isInteger(row.installed_fence_triggers)||
    !Number.isInteger(row.active_fence_triggers)||
    BOOLS.some(key=>typeof row[key]!=="boolean")){
    block("incomplete SQL metadata or privileges");
  }
  const calendar=row.calendar_rule_exists&&row.calendar_exception_exists;
  const catalog=row.catalog_marker_exists&&row.catalog_attribution_exists&&
    row.catalog_attribution_index_exists;
  const noGuards=!row.catalog_marker_exists&&!row.catalog_attribution_exists&&
    !row.catalog_attribution_index_exists&&!row.training_marker_exists&&
    !row.training_fence_function_exists&&row.installed_fence_triggers===0&&
    row.active_fence_triggers===0&&!row.app_can_access_training_marker;
  if(row.public_tables===66&&calendar&&noGuards){
    return Object.freeze({
      state:"preview-66-requires-reviewed-upgrade",
      alreadyInstalled:false,automaticSqlReplayAllowed:false,
      productionReady:false,
    });
  }
  if(row.public_tables===69&&calendar&&catalog&&
    row.training_marker_exists&&row.training_fence_function_exists&&
    row.installed_fence_triggers===3&&row.active_fence_triggers===3&&
    !row.app_can_access_training_marker){
    return Object.freeze({
      state:"preview-69-already-installed",
      alreadyInstalled:true,automaticSqlReplayAllowed:false,
      productionReady:false,
    });
  }
  block("partial or drifted DDL: never replay without independent review");
}

export async function loadUlc69ManifestProposal(){
  const app=JSON.parse(await readFile(
    new URL("../apps/ulc-linz/appbasis.database.json",import.meta.url),"utf8"));
  const module=JSON.parse(await readFile(
    new URL("../modules/exercise-catalog/appbasis.module.json",import.meta.url),"utf8"));
  return buildUlc69ManifestProposal(app,module);
}
