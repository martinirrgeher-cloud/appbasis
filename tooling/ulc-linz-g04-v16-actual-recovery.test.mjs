import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  G045_REPOSITORY_ROOT, assertG045PrivateEvidenceDirectory,
  validateG045OperatorInput, validateG045BackupManifest, runG045,
} from "./ulc-linz-g04-v16-actual-recovery.mjs";

const srcHost = "ep-preview-ulc.eu-central-1.aws.neon.tech";
const dstHost = "ep-recovery-ulc.eu-central-1.aws.neon.tech";
const sourceDb = "appbasis_ulc_linz_preview";
const targetDb = "appbasis_ulc_linz_g04_restore_20261108";
const url = (host,db,user,ssl="require") =>
  "postgresql://" + user + ":synthetic-secret@" + host + ":5432/" + db + "?sslmode=" + ssl;
const good = (action="backup") => ({
  APPBASIS_MIGRATION_DATABASE_URL:url(srcHost,sourceDb,"appbasis_ulc_linz_preview_migration"),
  APPBASIS_DATABASE_URL:url(srcHost,sourceDb,"preview_app"),
  APPBASIS_SECURITY_LOG_DATABASE_URL:url(srcHost,sourceDb,"preview_security"),
  APPBASIS_G04_V16_BACKUP_DATABASE_URL:url(srcHost,sourceDb,"preview_backup_ro"),
  APPBASIS_G04_V17_RESTORE_DATABASE_URL:url(dstHost,targetDb,"restore_operator"),
  APPBASIS_G04_V16_EVIDENCE_DIR:"/tmp/g04-operator-evidence",
  APPBASIS_G04_V16_OPERATOR_APPROVED:"g04-v16-" + action,
});
const goodManifest = () => ({
  schemaVersion:1,application:"ulc-linz",sourceDatabase:sourceDb,
  sourceSchemaVersion:16,targetSchemaVersion:17,
  backupFile:"preview-v16.pgdump",backupSha256:"a".repeat(64),
  snapshotId:"0000001A-0000002B-1",createdAt:"2026-11-08T14:00:00.000Z",
  restoreDatabase:targetDb,productionApproved:false,
  sourceFingerprint:{schemaFingerprint:"sha256:" + "b".repeat(64),
    rowCountFingerprint:"sha256:" + "c".repeat(64),tableCount:60},
  sourceContentSha256:"d".repeat(64),
  sourceAcl:{security_definer:true,public_execute:false,cleanup_execute:true,
    public_log_select:false,audit_read_select:true},
});

test("G-04.5 offline operator credential check requires explicit distinct isolated endpoint", () => {
  for (const action of ["backup","restore"]) {
    const result=validateG045OperatorInput(good(action),action);
    assert.equal(result.restoreDb,targetDb);
    assert.equal(result.work,"/tmp/g04-operator-evidence");
    assert.ok(result.backupUrl.includes("synthetic-secret"));
    assert.equal(JSON.stringify({restoreDb:result.restoreDb,work:result.work})
      .includes("synthetic-secret"),false);
  }
});

test("G-04.5 blocks CI, absent approval, source/restore confusion, weak encryption, nonunique roles", () => {
  const changes=[
    e=>{delete e.APPBASIS_G04_V16_OPERATOR_APPROVED;},
    e=>{e.APPBASIS_G04_V16_OPERATOR_APPROVED="g04-v16-restore";},
    e=>{e.CI="true";},
    e=>{e.GITHUB_ACTIONS="true";},
    e=>{e.APPBASIS_G04_V16_BACKUP_DATABASE_URL=url(srcHost,sourceDb,"preview_backup_ro","disable");},
    e=>{e.APPBASIS_G04_V16_BACKUP_DATABASE_URL=url(srcHost,"production","preview_backup_ro");},
    e=>{e.APPBASIS_G04_V16_BACKUP_DATABASE_URL=url(srcHost,sourceDb,"preview_app");},
    e=>{e.APPBASIS_G04_V16_BACKUP_DATABASE_URL=url("ep-preview-ulc-pooler.eu-central-1.aws.neon.tech",sourceDb,"preview_backup_ro");},
    e=>{e.APPBASIS_G04_V17_RESTORE_DATABASE_URL=url(srcHost,targetDb,"restore_operator");},
    e=>{e.APPBASIS_G04_V17_RESTORE_DATABASE_URL=url(dstHost,sourceDb,"restore_operator");},
    e=>{e.APPBASIS_G04_V16_BACKUP_DATABASE_URL+= "&database=production";},
    e=>{e.APPBASIS_G04_V16_EVIDENCE_DIR="./relative";},
    e=>{e.APPBASIS_G04_V16_EVIDENCE_DIR="/tmp/../suspicious";},
    e=>{e.APPBASIS_G04_V16_EVIDENCE_DIR="/";},
  ];
  for(const change of changes) {
    const input=good();change(input);
    assert.throws(()=>validateG045OperatorInput(input,"backup"),/G-04.5 blocked/);
  }
  assert.throws(()=>validateG045OperatorInput(good("backup"),"apply"),/G-04.5 blocked/);
});

test("G-04.5 backup manifest must preserve protected security ACL and backup fingerprint", () => {
  const m=goodManifest();
  assert.equal(validateG045BackupManifest(m,targetDb),m);
  const changes=[
    m=>{m.backupSha256="0";},m=>{m.sourceDatabase="production";},
    m=>{m.sourceSchemaVersion=17;},m=>{m.targetSchemaVersion=16;},
    m=>{m.snapshotId="bad";},m=>{m.restoreDatabase=sourceDb;},
    m=>{m.sourceContentSha256="bad";},m=>{m.sourceAcl.public_execute=true;},
    m=>{m.sourceAcl.cleanup_execute=false;},m=>{m.sourceAcl.public_log_select=true;},
    m=>{m.sourceAcl.audit_read_select=false;},m=>{m.productionApproved=true;},
    m=>{delete m.sourceFingerprint;},m=>{delete m.createdAt;},
  ];
  for(const change of changes) {
    const candidate=goodManifest();change(candidate);
    assert.throws(()=>validateG045BackupManifest(candidate,targetDb),/G-04.5 blocked/);
  }
});

test("G-04.5 backup/restore cannot start with missing operator authorization", async () => {
  await assert.rejects(()=>runG045("backup",{}),/G-04.5 blocked/);
  await assert.rejects(()=>runG045("restore",good()),/G-04.5 blocked/);
  await assert.rejects(()=>runG045("apply",good()),/G-04.5 blocked/);
});

test("G-04.5 rejects worktree folders, symlinks and world-accessible evidence paths", async () => {
  const outsideParent = await mkdtemp(join(tmpdir(), "g045-private-evidence-"));
  const inside = await mkdtemp(join(G045_REPOSITORY_ROOT, ".g045-private-evidence-test-"));
  const external = join(outsideParent, "private");
  const link = join(outsideParent, "linked");
  try {
    await mkdir(external, { mode: 0o700 });
    assert.equal(await assertG045PrivateEvidenceDirectory(external), external);
    await assert.rejects(() => assertG045PrivateEvidenceDirectory(inside),
      /G-04.5 blocked/);
    await assert.rejects(() => assertG045PrivateEvidenceDirectory(G045_REPOSITORY_ROOT),
      /G-04.5 blocked/);
    await symlink(external, link);
    await assert.rejects(() => assertG045PrivateEvidenceDirectory(link),
      /G-04.5 blocked/);
    await chmod(external, 0o755);
    await assert.rejects(() => assertG045PrivateEvidenceDirectory(external),
      /G-04.5 blocked/);
  } finally {
    await rm(outsideParent, { recursive: true, force: true });
    await rm(inside, { recursive: true, force: true });
  }
});
