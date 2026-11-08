import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const EVIDENCE_PATH =
  "apps/ulc-linz/privacy/g04-v17-preview-activation-evidence.json";
const V16_INVENTORY = "apps/ulc-linz/privacy/m5-data-inventory.json";
const V16_EXPORT = "apps/ulc-linz/privacy/m5-export-contract.json";
const V17_INVENTORY = "apps/ulc-linz/privacy/m5-data-inventory.v17-proposed.json";
const V17_EXPORT = "apps/ulc-linz/privacy/m5-export-contract.v17-proposed.json";
const V17_PROPOSAL = "apps/ulc-linz/privacy/g04-v17-calendar-inventory-proposal.json";
const SHA256 = /^[a-f0-9]{64}$/;
const URL_PROOF = /^https:\/\/[a-z0-9][a-z0-9.-]+\/[a-zA-Z0-9_./#?=-]{8,700}$/;

export class G04V17ReadinessError extends Error {
  constructor(message) {
    super(message);
    this.name = "G04V17ReadinessError";
  }
}

function deny(message) {
  throw new G04V17ReadinessError(message);
}

function same(expected, actual) {
  return JSON.stringify(expected) === JSON.stringify(actual);
}

function canonicalDay(dateValue, label, now, limitMs) {
  if (typeof dateValue !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(dateValue)) {
    deny(label + " must be UTC RFC3339 seconds.");
  }
  const ms = Date.parse(dateValue);
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !==
      dateValue.replace("Z", ".000Z")) {
    deny(label + " is not a valid timestamp.");
  }
  if (ms > now || now - ms > limitMs) {
    deny(label + " is stale or in the future.");
  }
  return ms;
}

function evidenceUrl(value, label) {
  if (typeof value !== "string" || !URL_PROOF.test(value)) {
    deny(label + " must reference independently retrievable evidence.");
  }
  return value;
}

function uniqueRecords(rows, selector) {
  if (!Array.isArray(rows)) deny("Expected array in proposed v17 contract.");
  const keys = rows.map(selector);
  if (new Set(keys).size !== keys.length) deny("Duplicate v17 inventory table.");
  return [...keys].sort();
}

export function validateG04V17StagedPrivacyContracts({
  v16Inventory, v16Export, v17Inventory, v17Export, proposal, canonicalOwner,
}) {
  if (v16Inventory?.persistentTables?.length !== 64 ||
      v16Export?.excludedTables?.length !== 62 ||
      v16Export?.datasets?.length !== 1 ||
      proposal?.newTables?.length !== 2 ||
      proposal?.owner !== "ulc-linz-lifecycle" ||
      proposal?.targetSchemaVersion !== 17 ||
      proposal?.proposedPrivacyClass !== "training-calendar-configuration" ||
      canonicalOwner?.schemaVersion !== 16 ||
      canonicalOwner?.migrations?.length !== 16 ||
      v17Inventory?.staging?.activation !== "blocked" ||
      v17Inventory?.staging?.sourceSchemaVersion !== 16 ||
      v17Inventory?.staging?.targetSchemaVersion !== 17 ||
      v17Inventory?.staging?.controllerApproval !== "pending" ||
      v17Inventory?.scope !== "staged-v17-preview-only-not-active" ||
      v17Export?.staging?.activation !== "blocked" ||
      v17Export?.staging?.controllerApproval !== "pending") {
    deny("G-04 v17 privacy contract prerequisites are not satisfied.");
  }
  const path = "apps/ulc-linz/migrations/0016_ulc_linz_registration_calendar.sql";
  if (v17Inventory.staging.migrationPath !== path ||
      canonicalOwner.migrations.includes(path)) {
    deny("Proposed v17 migration already changed canonical v16.");
  }

  const sourceTables = v16Inventory.persistentTables;
  const stagedTables = v17Inventory.persistentTables;
  const proposedNewTables = proposal.newTables.map(({ id }) => id);
  const newTables = [...proposedNewTables].sort();
  const sourceIds = uniqueRecords(sourceTables, (t) => t.owner + ":" + t.id);
  const stagedIds = uniqueRecords(stagedTables, (t) => t.owner + ":" + t.id);
  const expectedIds = [...sourceIds,
    ...newTables.map((id) => proposal.owner + ":" + id)].sort();
  if (!same(stagedIds, expectedIds) || stagedIds.length !== 66 ||
      !same(stagedTables.slice(0, sourceTables.length), sourceTables)) {
    deny("Staged v17 inventory does not extend the exact 64-table v16 inventory.");
  }

  const sourceOwner = v16Inventory.persistentOwners.find((o) =>
    o.id === "ulc-linz-lifecycle");
  const stagedOwner = v17Inventory.persistentOwners.find((o) =>
    o.id === "ulc-linz-lifecycle");
  if (!sourceOwner || !stagedOwner ||
      stagedOwner.schemaVersion !== 17 ||
      !same(stagedOwner.migrations, [...canonicalOwner.migrations, path]) ||
      v17Inventory.persistentOwners.length !== v16Inventory.persistentOwners.length) {
    deny("Staged v17 owner and migrations differ from canonical v16 extension.");
  }

  const stagedExcluded = v17Export.excludedTables;
  const expectedExcluded = [...v16Export.excludedTables,
    ...proposedNewTables.map((table) => ({
      owner: proposal.owner, table,
      privacyClass: proposal.proposedPrivacyClass,
    }))];
  if (!same(stagedExcluded, expectedExcluded) ||
      !same(v17Export.datasets, v16Export.datasets) ||
      !same(v17Export.runtimeModules, v16Export.runtimeModules) ||
      !same(v17Export.credentialFieldNames, v16Export.credentialFieldNames) ||
      !same(v17Export.excludedPrivacyClasses,
        [...v16Export.excludedPrivacyClasses, proposal.proposedPrivacyClass])) {
    deny("v17 export contract changed personal datasets or excludes the wrong tables.");
  }
  const classified = [
    ...stagedExcluded.map((r) => r.owner + ":" + r.table),
    ...v17Export.datasets.flatMap((d) =>
      d.sourceTables.map((r) => r.owner + ":" + r.table)),
  ];
  if (!same([...classified].sort(),stagedIds) ||
      classified.length !== new Set(classified).size) {
    deny("Every proposed v17 persistent table must be classified exactly once.");
  }
  for (const entry of stagedTables.slice(sourceTables.length)) {
    if (!newTables.includes(entry.id) ||
        entry.owner !== proposal.owner ||
        entry.privacyClass !== proposal.proposedPrivacyClass ||
        !entry.retentionPolicy.startsWith("pending-") ||
        !entry.deletionEvidence.startsWith("fail-closed-") ||
        !entry.retentionEvidence.startsWith("fail-closed-")) {
      deny("v17 calendar privacy-retention decision is falsely marked completed.");
    }
  }
  return Object.freeze({
    schemaVersion: 17, persistentTables: 66,
    excludedCalendarTables: 2, classification: "staged-not-active",
    controllerApprovalRequired: true,
  });
}

export function validateG04V17MigrationEvidence(value, { now = new Date() } = {}) {
  if (!(now instanceof Date) || !Number.isFinite(now.valueOf())) {
    deny("Evidence verification time is invalid.");
  }
  if (value?.schemaVersion !== 1 || value?.application !== "ulc-linz" ||
      value?.environment !== "generated-preview-ulc-linz" ||
      value?.sourceDatabase !== "appbasis_ulc_linz_preview" ||
      value?.sourceSchemaVersion !== 16 || value?.targetSchemaVersion !== 17 ||
      value?.status !== "approved-for-isolated-preview-v17" ||
      value?.productionApproved !== false) {
    deny("Preview migration evidence is pending or targets the wrong environment.");
  }
  const privacy = value.privacyDecision;
  const backup = value.preMigrationBackup;
  const restore = value.isolatedRestore;
  const approval = value.migrationAuthorization;
  if (privacy?.status !== "approved" || backup?.status !== "verified" ||
      restore?.status !== "verified" || approval?.status !== "approved" ||
      backup.sourceDatabase !== "appbasis_ulc_linz_preview" ||
      restore.restoreDatabase === "appbasis_ulc_linz_preview" ||
      !/^appbasis_ulc_linz_[a-z0-9_]*restore[a-z0-9_]*$/.test(restore.restoreDatabase || "") ||
      !SHA256.test(backup.backupSha256 || "") ||
      restore.verifiedBackupSha256 !== backup.backupSha256) {
    deny("Privacy, isolated backup or restore metadata are incomplete.");
  }
  evidenceUrl(privacy.controllerDecisionRef, "Controller privacy decision");
  evidenceUrl(privacy.retentionDecisionRef, "Retention decision");
  evidenceUrl(privacy.exportDecisionRef, "Export classification decision");
  const backupRef = evidenceUrl(backup.evidenceRef, "Backup");
  const restoreRef = evidenceUrl(restore.evidenceRef, "Restore rehearsal");
  evidenceUrl(approval.approvalRef, "Operator migration authorization");
  if (backupRef === restoreRef) {
    deny("Backup and restore require independent evidence references.");
  }
  const ageMs = 24 * 60 * 60 * 1000;
  const backupAt = canonicalDay(backup.completedAt, "Backup timestamp", now.valueOf(), ageMs);
  const restoreAt = canonicalDay(restore.completedAt, "Restore timestamp", now.valueOf(), ageMs);
  if (restoreAt < backupAt) {
    deny("Restore rehearsal predates the backup.");
  }
  return Object.freeze({
    status: "metadata-ready-requires-independent-source-verification",
    environment: value.environment, schemaVersion: 17,
    productionApproved: false,
  });
}

export async function verifyG04V17ActivationReadiness({
  repositoryRoot = process.cwd(), now = new Date(),
} = {}) {
  const paths = [
    V16_INVENTORY,V16_EXPORT,V17_INVENTORY,V17_EXPORT,
    V17_PROPOSAL,EVIDENCE_PATH,
  ];
  const raw = await Promise.all(paths.map((p) =>
    readFile(resolve(repositoryRoot,p),"utf8")));
  const [v16Inventory,v16Export,v17Inventory,v17Export,proposal,evidence] =
    raw.map((x) => JSON.parse(x));
  const { ULC_LINZ_LIFECYCLE_DATABASE_OWNER } =
    await import("./ulc-linz-database-contract.mjs");
  const contract = validateG04V17StagedPrivacyContracts({
    v16Inventory,v16Export,v17Inventory,v17Export,proposal,
    canonicalOwner:ULC_LINZ_LIFECYCLE_DATABASE_OWNER,
  });
  const approval = validateG04V17MigrationEvidence(evidence,{now});
  return Object.freeze({ ...contract,approval:approval.status });
}

const isMainModule = typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMainModule) {
  verifyG04V17ActivationReadiness().then((r) => {
    process.stdout.write(JSON.stringify(r)+"\n");
  }).catch((err) => {
    console.error(err instanceof G04V17ReadinessError
      ? err.message : "G-04 v17 readiness failed.");
    process.exitCode = 1;
  });
}
