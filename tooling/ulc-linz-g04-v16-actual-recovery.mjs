import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import { holdUlcLinzM5ExportedSnapshot } from "./ulc-linz-m5-exported-snapshot.mjs";
import { readUlcLinzRestoreFingerprint } from "./ulc-linz-m5-restore-fingerprint.mjs";
import { validateG04V17PreviewRecoveryPreflight } from "./ulc-linz-g04-v17-recovery-preflight.mjs";

const PG_IMAGE = "postgres:18-alpine@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15";
const SOURCE_DB = "appbasis_ulc_linz_preview";
// Resolve from this module, never from the operator caller\'s working directory.
export const G045_REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DUMP = "preview-v16.pgdump";
const MANIFEST = "preview-v16.manifest.json";
const REPORT = "preview-v16.restore-report.json";
const SHA = /^[0-9a-f]{64}$/;
const SNAPSHOT = /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{8}-[1-9][0-9]*$/;

function deny() {
  throw new Error("G-04.5 blocked: authorization, database isolation or evidence invalid.");
}

export function validateG045OperatorInput(env, action) {
  if (!["backup", "restore"].includes(action) ||
      env.APPBASIS_G04_V16_OPERATOR_APPROVED !== "g04-v16-" + action ||
      env.CI === "true" || env.GITHUB_ACTIONS === "true") deny();
  const urls = {
    migrationDatabaseUrl: env.APPBASIS_MIGRATION_DATABASE_URL,
    applicationDatabaseUrl: env.APPBASIS_DATABASE_URL,
    securityLogDatabaseUrl: env.APPBASIS_SECURITY_LOG_DATABASE_URL,
    restoreDatabaseUrl: env.APPBASIS_G04_V17_RESTORE_DATABASE_URL,
  };
  try { validateG04V17PreviewRecoveryPreflight(urls); }
  catch { deny(); }

  const backupUrl = env.APPBASIS_G04_V16_BACKUP_DATABASE_URL;
  let migration, backup, application, security, restore;
  try {
    migration = new URL(urls.migrationDatabaseUrl);
    backup = new URL(backupUrl);
    application = new URL(urls.applicationDatabaseUrl);
    security = new URL(urls.securityLogDatabaseUrl);
    restore = new URL(urls.restoreDatabaseUrl);
  } catch { deny(); }
  if (!["postgres:", "postgresql:"].includes(backup.protocol) ||
      backup.hostname.toLowerCase() !== migration.hostname.toLowerCase() ||
      (backup.port || "5432") !== (migration.port || "5432") ||
      backup.pathname !== "/" + SOURCE_DB ||
      backup.searchParams.size !== 1 ||
      !["require", "verify-ca", "verify-full"].includes(backup.searchParams.get("sslmode")) ||
      backup.hash || !backup.username || !backup.password ||
      new Set([backup.username, migration.username, application.username,
        security.username, restore.username]).size !== 5) deny();

  const work = env.APPBASIS_G04_V16_EVIDENCE_DIR;
  if (typeof work !== "string" || !work.startsWith("/") || work === "/" ||
      work.includes("..") || !/^\/[a-zA-Z0-9_./-]+$/.test(work)) deny();
  return Object.freeze({
    backupUrl, restoreUrl: urls.restoreDatabaseUrl, work,
    restoreDb: decodeURIComponent(restore.pathname.slice(1)),
  });
}

function validAcl(row) {
  return row?.security_definer === true && row?.public_execute === false &&
    row?.cleanup_execute === true && row?.public_log_select === false &&
    row?.audit_read_select === true;
}

export function validateG045BackupManifest(manifest, restoreDb) {
  if (manifest?.schemaVersion !== 1 || manifest?.application !== "ulc-linz" ||
      manifest?.sourceDatabase !== SOURCE_DB || manifest?.sourceSchemaVersion !== 16 ||
      manifest?.targetSchemaVersion !== 17 || manifest?.backupFile !== DUMP ||
      !SHA.test(manifest?.backupSha256 ?? "") || !SNAPSHOT.test(manifest?.snapshotId ?? "") ||
      manifest?.restoreDatabase !== restoreDb || manifest?.productionApproved !== false ||
      typeof manifest?.createdAt !== "string" ||
      !Number.isFinite(Date.parse(manifest.createdAt)) ||
      !SHA.test(manifest?.sourceContentSha256 ?? "") ||
      typeof manifest?.sourceFingerprint?.schemaFingerprint !== "string" ||
      typeof manifest?.sourceFingerprint?.rowCountFingerprint !== "string" ||
      !validAcl(manifest?.sourceAcl)) deny();
  return manifest;
}

export async function readProtectedAcl(url, snapshotId) {
  const db = createPostgresDatabase(url);
  try {
    return await db.client.begin(async sql => {
      await sql.unsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
      if (snapshotId) await sql.unsafe("SET TRANSACTION SNAPSHOT '" + snapshotId + "'");
      const rows = await sql.unsafe(
        "SELECT p.prosecdef AS security_definer," +
        " EXISTS (SELECT 1 FROM pg_catalog.aclexplode(COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute," +
        " EXISTS (SELECT 1 FROM pg_catalog.aclexplode(COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) a JOIN pg_catalog.pg_roles r ON r.oid=a.grantee WHERE r.rolname='ulc_linz_security_event_cleanup' AND a.privilege_type='EXECUTE') AS cleanup_execute," +
        " EXISTS (SELECT 1 FROM pg_catalog.aclexplode(COALESCE(l.relacl,pg_catalog.acldefault('r',l.relowner))) a WHERE a.grantee=0 AND a.privilege_type='SELECT') AS public_log_select," +
        " EXISTS (SELECT 1 FROM pg_catalog.aclexplode(COALESCE(l.relacl,pg_catalog.acldefault('r',l.relowner))) a JOIN pg_catalog.pg_roles r ON r.oid=a.grantee WHERE r.rolname='ulc_linz_security_event_read' AND a.privilege_type='SELECT') AS audit_read_select" +
        " FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace" +
        " JOIN pg_catalog.pg_class l ON l.relname='ulc_linz_security_event_log'" +
        " JOIN pg_catalog.pg_namespace ln ON ln.oid=l.relnamespace" +
        " WHERE ns.nspname='public' AND ln.nspname='public'" +
        " AND p.proname='appbasis_ulc_linz_purge_expired_security_events'" +
        " AND pg_catalog.pg_get_function_identity_arguments(p.oid)=''");
      if (rows.length !== 1 || !validAcl(rows[0])) deny();
      return { ...rows[0] };
    });
  } finally { await db.client.end().catch(() => {}); }
}

export async function readDataDigest(url, snapshotId) {
  const db = createPostgresDatabase(url);
  try {
    return await db.client.begin(async sql => {
      await sql.unsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
      if (snapshotId) await sql.unsafe("SET TRANSACTION SNAPSHOT '" + snapshotId + "'");
      // Canonical JSON serialization for identical timestamptz/date/interval/float values.
      await sql.unsafe("SET LOCAL TIME ZONE 'UTC'");
      await sql.unsafe("SET LOCAL DateStyle TO 'ISO, YMD'");
      await sql.unsafe("SET LOCAL IntervalStyle TO 'iso_8601'");
      await sql.unsafe("SET LOCAL extra_float_digits TO 3");
      const tables = await sql.unsafe(
        "SELECT c.relname FROM pg_catalog.pg_class c" +
        " JOIN pg_catalog.pg_namespace ns ON ns.oid=c.relnamespace" +
        " WHERE ns.nspname='public' AND c.relkind='r' ORDER BY c.relname");
      if (tables.length === 0 || tables.some(t => !/^[a-z][a-z0-9_]*$/.test(t.relname))) deny();
      const h = createHash("sha256");
      for (const { relname } of tables) {
        const q = "SELECT encode(sha256(convert_to(" +
          "coalesce(string_agg(encode(sha256(convert_to(row_to_json(t)::text,'UTF8')),'hex'), '|' ORDER BY " +
          "encode(sha256(convert_to(row_to_json(t)::text,'UTF8')),'hex')),'')," +
          "'UTF8')),'hex') AS digest FROM public." + relname + " t";
        const rows = await sql.unsafe(q);
        if (rows.length !== 1 || !SHA.test(rows[0].digest)) deny();
        h.update(relname + ":" + rows[0].digest + "\n");
      }
      return h.digest("hex");
    });
  } finally { await db.client.end().catch(() => {}); }
}

async function verifySourceV16(url) {
  const db = createPostgresDatabase(url);
  try {
    const rows = await db.client.unsafe(
      "SELECT current_database() AS db," +
      " to_regclass('public.ulc_linz_registration_calendar_rule') IS NULL AS no_rule," +
      " to_regclass('public.ulc_linz_registration_calendar_exception') IS NULL AS no_exception," +
      " to_regclass('public.ulc_linz_training_trainer_attendance') IS NOT NULL AS v16_present");
    if (rows.length !== 1 || rows[0].db !== SOURCE_DB ||
        !rows[0].no_rule || !rows[0].no_exception || !rows[0].v16_present) deny();
  } finally { await db.client.end().catch(() => {}); }
}

export async function verifyTargetEmpty(url, expectedDb) {
  const db = createPostgresDatabase(url);
  try {
    const rows = await db.client.unsafe(
      "SELECT current_database() AS db," +
      " (SELECT count(*)::int FROM pg_catalog.pg_class c" +
      " JOIN pg_catalog.pg_namespace ns ON c.relnamespace=ns.oid" +
      " WHERE ns.nspname='public' AND c.relkind IN ('r','p','v','m','S','f')) AS objects," +
      " (SELECT count(*)::int FROM pg_catalog.pg_proc p" +
      " JOIN pg_catalog.pg_namespace ns ON p.pronamespace=ns.oid" +
      " WHERE ns.nspname='public') AS functions," +
      " (SELECT count(*)::int FROM pg_catalog.pg_namespace ns" +
      " WHERE ns.nspname NOT IN ('public','information_schema')" +
      " AND ns.nspname NOT LIKE 'pg_%') AS extra_schemas");
    if (rows.length !== 1 || rows[0].db !== expectedDb ||
        rows[0].objects !== 0 || rows[0].functions !== 0 ||
        rows[0].extra_schemas !== 0) deny();
  } finally { await db.client.end().catch(() => {}); }
}

async function runPg(action, url, work, snapshotId) {
  const command = action === "backup"
    ? 'umask 077; pg_dump --format=custom --no-owner --snapshot="$DATABASE_SNAPSHOT" --dbname="$DATABASE_URL" --file=/evidence/' + DUMP
    : 'umask 077; pg_restore --single-transaction --no-owner --exit-on-error --dbname="$DATABASE_URL" /evidence/' + DUMP;
  const uid=process.getuid?.(), gid=process.getgid?.();
  if (!Number.isInteger(uid) || !Number.isInteger(gid)) deny();
  await new Promise((done, fail) => {
    const child = spawn("docker", ["run","--rm","--network","host",
      "--user",String(uid)+":"+String(gid),
      "--env","DATABASE_URL","--env","DATABASE_SNAPSHOT",
      "--volume",work + ":/evidence",PG_IMAGE,"sh","-ceu",command],
    {env:{...process.env,DATABASE_URL:url,DATABASE_SNAPSHOT:snapshotId || ""},
      stdio:["ignore","ignore","pipe"]});
    child.stderr.on("data", () => {}); // Hide secrets even if the client prints its URL.
    child.once("error", () => fail(new Error("G-04.5 PostgreSQL client unavailable.")));
    child.once("close", code => code === 0 ? done() :
      fail(new Error("G-04.5 PostgreSQL " + action + " failed (exit " + code + ").")));
  });
}

async function fileSha256(path) {
  const h = createHash("sha256");
  for await (const part of createReadStream(path)) h.update(part);
  return h.digest("hex");
}
async function waitSnapshot(path) {
  for (let i=0;i<300;i++) {
    try {
      const id=(await readFile(path,"utf8")).trim();
      if (!SNAPSHOT.test(id)) deny();
      return id;
    } catch(e) { if(e?.code!=="ENOENT") throw e; }
    await new Promise(done=>setTimeout(done,100));
  }
  deny();
}

export async function runG045(action,env=process.env) {
  const {backupUrl,restoreUrl,work,restoreDb}=validateG045OperatorInput(env,action);
  const dir=await lstat(work);
  const canonical=await realpath(work);
  const repoRoot=await realpath(G045_REPOSITORY_ROOT);
  if (!dir.isDirectory() || dir.isSymbolicLink() ||
      canonical!==resolve(work) || canonical===repoRoot ||
      canonical.startsWith(repoRoot + "/") || (dir.mode & 0o077)!==0) deny();
  const dumpPath=join(work,DUMP);
  if(action==="backup") {
    if ((await readdir(work)).length !== 0) deny();
    await verifySourceV16(backupUrl);
    const snapshotPath=join(work,"source.snapshot");
    const releasePath=join(work,"source.snapshot.release");
    let hold;
    try {
      hold=holdUlcLinzM5ExportedSnapshot({databaseUrl:backupUrl,snapshotPath,releasePath});
      hold.catch(()=>{}); // Consumed below, avoid unhandled rejection before snapshot release.
      const snapshotId=await waitSnapshot(snapshotPath);
      const [fingerprint,content,acl]=await Promise.all([
        readUlcLinzRestoreFingerprint(backupUrl,{snapshotId}),
        readDataDigest(backupUrl,snapshotId),
        readProtectedAcl(backupUrl,snapshotId),
      ]);
      await runPg("backup",backupUrl,work,snapshotId);
      const fs=await stat(dumpPath);
      if (!fs.isFile() || fs.size===0) deny();
      const sha=await fileSha256(dumpPath);
      const manifest={
        schemaVersion:1,application:"ulc-linz",sourceDatabase:SOURCE_DB,
        sourceSchemaVersion:16,targetSchemaVersion:17,
        backupFile:DUMP,backupSha256:sha,snapshotId,
        createdAt:new Date().toISOString(),restoreDatabase:restoreDb,
        sourceFingerprint:fingerprint,sourceContentSha256:content,
        sourceAcl:acl,productionApproved:false,
      };
      validateG045BackupManifest(manifest,restoreDb);
      await writeFile(join(work,MANIFEST),JSON.stringify(manifest,null,2)+"\n",
        {encoding:"utf8",mode:0o600,flag:"wx"});
      return {status:"backup-created-not-authorized-for-migration",
        backupSha256:sha,restoreDatabase:restoreDb};
    } finally {
      await writeFile(releasePath,"released\n",{mode:0o600,flag:"wx"}).catch(()=>{});
      await hold?.catch(()=>{});
    }
  }
  if ((await readdir(work)).includes(REPORT)) deny();
  const manifest=validateG045BackupManifest(
    JSON.parse(await readFile(join(work,MANIFEST),"utf8")),restoreDb);
  if(await fileSha256(dumpPath)!==manifest.backupSha256) deny();
  await verifyTargetEmpty(restoreUrl,restoreDb);
  await runPg("restore",restoreUrl,work);
  const [fingerprint,content,acl]=await Promise.all([
    readUlcLinzRestoreFingerprint(restoreUrl),
    readDataDigest(restoreUrl),
    readProtectedAcl(restoreUrl),
  ]);
  if(JSON.stringify(fingerprint)!==JSON.stringify(manifest.sourceFingerprint) ||
      content!==manifest.sourceContentSha256 ||
      JSON.stringify(acl)!==JSON.stringify(manifest.sourceAcl)) deny();
  const report={
    schemaVersion:1,status:"isolated-v16-restore-verified-not-migration-authorized",
    restoredAt:new Date().toISOString(),backupSha256:manifest.backupSha256,
    restoreDatabase:restoreDb,fingerprint,contentSha256:content,
    aclVerified:true,productionApproved:false,
  };
  await writeFile(join(work,REPORT),JSON.stringify(report,null,2)+"\n",
    {encoding:"utf8",mode:0o600,flag:"wx"});
  return {status:report.status,restoreDatabase:restoreDb,
    verifiedBackupSha256:manifest.backupSha256,productionApproved:false};
}

if(typeof process.argv[1]==="string" &&
   import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  runG045(process.argv[2]).then(result=>
    process.stdout.write(JSON.stringify(result)+"\n"))
  .catch(()=>{console.error("G-04.5 blocked or failed. See private operator evidence.");process.exitCode=1;});
}
