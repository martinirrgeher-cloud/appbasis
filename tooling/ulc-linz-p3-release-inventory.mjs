/**
 * Read-only P3 evidence overview. Not a release gate and never authorization
 * to deploy, restore, erase, or process real youth/athlete data.
 *
 * This consolidates the CURRENT 69-table M5 manifest evidence, the historic
 * 66-table P01 operator target and unresolved production contract conditions.
 * No provider access, SQL writes, credentials or personal records.
 */
import { appendFile, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const MODULE_IDS=Object.freeze([
  "countdown","athletes","exercise-catalog","training-blocks",
  "training-plans","training-documentation",
]);
const OWNER_IDS=Object.freeze([
  "identity","permissions","athletes","exercise-catalog","training-blocks",
  "training-documentation","training-plans","ulc-linz-lifecycle",
]);
const REVIEWED_EVIDENCE=new Set(["verified","not-personal","retained-by-policy"]);
const required=(condition,label)=>{if(!condition)throw new Error("P3 release evidence is incomplete: "+label);};
const record=(x)=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const unique=(items)=>new Set(items).size===items.length;

export function evaluateUlcP3ReleaseInventory({
  manifest, inventory, historicalP01, app, modules, provider, recovery,
}){
  required(record(manifest)&&Array.isArray(manifest.owners),"database manifest");
  required(record(inventory)&&Array.isArray(inventory.persistentTables)&&
    Array.isArray(inventory.persistentOwners),"current privacy inventory");
  required(record(historicalP01)&&Array.isArray(historicalP01.tableGroups)&&
    record(historicalP01.baseline),"historical retention guideline");
  required(record(app)&&record(app.crossCutting)&&Array.isArray(app.modules),"app production contract");
  required(record(modules)&&record(provider)&&record(recovery),"module/provider/recovery documents");

  const declaredOwners=manifest.owners.map(x=>x.id);
  const reviewedOwners=inventory.persistentOwners.map(x=>x.id);
  required(declaredOwners.length===8&&unique(declaredOwners)&&
    declaredOwners.every(x=>OWNER_IDS.includes(x))&&
    reviewedOwners.length===8&&unique(reviewedOwners)&&
    reviewedOwners.every(x=>declaredOwners.includes(x)),"all eight canonical data owners");

  const tables=inventory.persistentTables;
  const ids=tables.map(x=>x.id);
  required(ids.length===69&&unique(ids)&&
    inventory.repositorySchemaReview?.declaredTableCount===69&&
    inventory.repositorySchemaReview?.declaredMigrationCount===44 &&
    tables.every(x=>reviewedOwners.includes(x.owner)),"current 69-table/44-migration inventory");

  const past=historicalP01.tableGroups.flatMap(g=>g.tables);
  required(historicalP01.baseline.tableCount===66&&past.length===66&&
    unique(past)&&past.every(x=>ids.includes(x))&&
    historicalP01.runtimeActive===false&&historicalP01.legalApproval===false,
    "66-table P01 snapshot must remain historical and unapproved");
  const additionalSinceP01=ids.filter(x=>!past.includes(x)).sort();
  required(additionalSinceP01.length===3,"historical-to-current schema delta");
  const byOwner=OWNER_IDS.map(owner=>{
    const rows=tables.filter(x=>x.owner===owner);
    const unresolved=rows.filter(x=>!REVIEWED_EVIDENCE.has(x.deletionEvidence)||
      !REVIEWED_EVIDENCE.has(x.retentionEvidence));
    return Object.freeze({
      owner,tableCount:rows.length,unresolvedTableCount:unresolved.length,
      unresolvedTables:Object.freeze(unresolved.map(x=>x.id).sort()),
    });
  });

  const appModuleIds=app.modules;
  required(appModuleIds.length===6&&unique(appModuleIds)&&
    appModuleIds.every(x=>MODULE_IDS.includes(x))&&
    MODULE_IDS.every(x=>record(modules[x])&&modules[x].moduleId===x),
    "all six module production contracts");
  const blockedModules=MODULE_IDS.filter(x=>modules[x].status!=="ready");
  const blockedCrossCutting=Object.entries(app.crossCutting)
    .filter(([,status])=>status!=="verified").map(([key])=>key).sort();

  required(provider.application==="ulc-linz" &&
    Array.isArray(provider.providerScope)&&provider.providerScope.length===2 &&
    new Set(provider.providerScope.map(x=>x.id)).size===2 &&
    provider.providerScope.every(x=>
      ["cloudflare","neon-postgresql"].includes(x.id) &&
      ["open","verified"].includes(x.appSpecificProductionEvidence)),
    "exact provider account/privacy evidence inventory");
  // A provider status must change with its own verified M5 source; a bare
  // one-field edit must never turn this repository summary into legal approval.
  const providerAccountEvidence=provider.providerScope.every(x=>
    x.appSpecificProductionEvidence==="verified") &&
    ["dpa","dataRegion","encryption","subprocessors"].every(key=>
      provider.m5?.[key]==="verified") ? "verified" : "open";
  required(recovery.application==="ulc-linz" &&
    recovery.currentSourceAuthority?.markerRetentionDays===35 &&
    recovery.currentSourceAuthority?.postExpiryRetry==="deny",
    "35-day deletion authority and post-expiry deny policy");
  required(inventory.objectStorage?.status==="not-configured" &&
    inventory.objectStorage?.futureIntroduction==="invalidates-current-evidence",
    "private-media provider currently not configured");
  required(app.status==="blocked" || app.status==="ready","application status");

  return Object.freeze({
    application:"ulc-linz",
    declaredOwners:8,
    declaredMigrations:44,
    currentTables:69,
    historicalP01Tables:66,
    additionalSinceP01:Object.freeze(additionalSinceP01),
    byOwner:Object.freeze(byOwner),
    blockedModules:Object.freeze(blockedModules),
    blockedCrossCutting:Object.freeze(blockedCrossCutting),
    providerAccountEvidence,
    sourceAuthorityDays:35,
    sourceExpiry:"deny",
    objectStorageConfigured:false,
    fullPersonalDataRelease:"BLOCKED",
    isolatedTechnicalPilot:"OPERATOR_APPROVAL_REQUIRED",
    permitsMerge:false,
    permitsDeployment:false,
    permitsProductionData:false,
    permitsRetentionPurge:false,
  });
}

export function formatUlcP3ReleaseInventory(result){
  const table=(x)=>x.unresolvedTables.length?
    x.unresolvedTables.map(n=>"\`"+n+"\`").join(", "):"—";
  return [
    "# ULC Linz P3 — konsolidierter Release-Nachweis (nur lesend)",
    "",
    "Status: **kein automatischer Echtbetriebs-/Deploymententscheid**.",
    "",
    "| Maßnahme | Ergebnis |",
    "|---|---|",
    "| App mit echten Personen-/Kinderdaten | **BLOCKED** |",
    "| Abgeschotteter technischer Test ohne neue Echtdaten | Betreiberfreigabe erforderlich |",
    "| Cloudflare-/Neon-Änderung durch diesen Bericht | Keine |",
    "",
    "Aktuelles Inventar: **"+result.currentTables+" Tabellen / "+result.declaredOwners+
      " Daten-Owner / "+result.declaredMigrations+" Migrationen**.",
    "P01 ist ein historischer "+result.historicalP01Tables+"-Tabellen-Vorschlag, keine aktuelle Inventarlücke.",
    "Damals noch nicht erfasste Tabellen: "+result.additionalSinceP01.map(x=>"\`"+x+"\`").join(", ")+".",
    "",
    "## Verbleibende Tabellen-Nachweise pro Daten-Owner",
    "",
    "| Owner | Tabellen | Mit mindestens einem offenen Lösch-/Aufbewahrungsnachweis |",
    "|---|---:|---:|",
    ...result.byOwner.map(x=>"| "+x.owner+" | "+x.tableCount+" | "+x.unresolvedTableCount+" |"),
    "",
    "## Noch blockierte Modul-/App-Nachweise",
    "",
    "Module: "+(result.blockedModules.join(", ")||"keine")+".",
    "Übergreifend: "+(result.blockedCrossCutting.join(", ")||"keine")+".",
    "Provider-Konto-/AVV-Nachweise: offen. Retention: 35 Tage Marker, danach deny.",
    "Objektspeicher laut Inventar nicht konfiguriert; eine spätere Einführung erfordert neue Belege.",
    "",
    "## Entscheidung für den nächsten Schritt",
    "",
    "1. Bestehenden privaten Worker nur mit synthetischen Testdaten und nach Betreiberfreigabe prüfen; keine neuen Echtdaten oder personenbezogenen Fotos erfassen.",
    "2. Kontospezifische Provider-/AVV-Belege und den tatsächlich wiederherstellbaren Backup-Horizont nachweisen.",
    "3. Lösch-/Freitext- und Restore-Nachweise bei den offenen Ownern priorisieren; nur belegte Kriterien gezielt schließen.",
    "4. Erst nach echter fachlicher Freigabe den vollständigen Production-Composition-Gate für reale Vereinsdaten verwenden.",
    "",
    "Dieser Bericht führt keine Löschung, Migration, Freischaltung oder Provideraktion aus.",
  ].join("\n");
}
async function load(root,path){return JSON.parse(await readFile(join(root,path),"utf8"));}
export async function evaluateUlcP3ReleaseFromRepository(root){
  const paths={
    manifest:"apps/ulc-linz/appbasis.database.json",
    inventory:"apps/ulc-linz/privacy/m5-data-inventory.json",
    historicalP01:"apps/ulc-linz/privacy/p01-operator-retention-candidate.json",
    app:"apps/ulc-linz/appbasis.production.json",
    provider:"apps/ulc-linz/privacy/m5-provider-compliance-inventory.json",
    recovery:"apps/ulc-linz/privacy/athlete-deletion-recovery-policy.json",
  };
  const [manifest,inventory,historicalP01,app,provider,recovery]=await Promise.all(
    Object.values(paths).map(path=>load(root,path)));
  const modules=Object.fromEntries(await Promise.all(MODULE_IDS.map(async id=>[
    id,await load(root,"modules/"+id+"/appbasis.production.json"),
  ])));
  return evaluateUlcP3ReleaseInventory({manifest,inventory,historicalP01,app,modules,provider,recovery});
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    const result=await evaluateUlcP3ReleaseFromRepository(process.cwd());
    const report=formatUlcP3ReleaseInventory(result);
    console.log(report);
    if(process.env.GITHUB_STEP_SUMMARY){
      await appendFile(process.env.GITHUB_STEP_SUMMARY,report+"\n\n");
    }
  }catch(error){
    console.error(error instanceof Error?error.message:"P3 release evidence is incomplete.");
    process.exitCode=1;
  }
}
