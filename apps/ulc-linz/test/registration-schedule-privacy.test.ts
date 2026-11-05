import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

type PendingPrivacyTable = Readonly<{
  id: string;
  actorColumns: readonly string[];
  timestampColumns: readonly string[];
  subjectColumns: readonly string[];
  freeTextColumns: readonly string[];
  deletionEvidence: string;
  exportEvidence: string;
  retentionEvidence: string;
  restoreEvidence: string;
}>;

type PendingPrivacyInventory = Readonly<{
  application: string;
  schemaVersion: number;
  scope: string;
  owner: string;
  proposedOwnerSchemaVersion: number;
  migration: string;
  publication: string;
  activation: string;
  tables: readonly PendingPrivacyTable[];
  blockers: readonly string[];
  noPrivacyPreflightRuntimeEndpoint: boolean;
  noPersonalDataExport: boolean;
}>;

async function readJson<T>(relative: string): Promise<T> {
  return JSON.parse(await readFile(new URL(relative, import.meta.url), "utf8")) as T;
}

describe("A02.4 unpublished privacy/data-lifecycle inventory drift gate", () => {
  it("covers exactly every proposed app-owned table and direct actor reference", async () => {
    const inventory = await readJson<PendingPrivacyInventory>(
      "../privacy/a02-registration-schedule-inventory.json",
    );
    const migration = await readFile(
      new URL("../migrations/0011_ulc_linz_registration_schedule.sql", import.meta.url),
      "utf8",
    );
    expect(inventory.application).toBe("ulc-linz");
    expect(inventory.schemaVersion).toBe(1);
    expect(inventory.scope).toBe("a02-registration-schedule-proposed-v12-unpublished");
    expect(inventory.owner).toBe("ulc-linz-lifecycle");
    expect(inventory.proposedOwnerSchemaVersion).toBe(12);
    expect(inventory.migration).toBe(
      "apps/ulc-linz/migrations/0011_ulc_linz_registration_schedule.sql",
    );
    expect(inventory.publication).toBe("blocked-not-in-database-manifest");
    expect(inventory.activation).toBe("blocked-no-preview-or-production");
    expect(inventory.noPrivacyPreflightRuntimeEndpoint).toBe(true);
    expect(inventory.noPersonalDataExport).toBe(true);

    const actualTables = [...migration.matchAll(
      /CREATE TABLE\s+(?:public\.)?(ulc_linz_registration_[a-z_]+)\s*\(/g,
    )].map((match) => match[1]).sort();
    const expected = [...inventory.tables.map((table) => table.id)].sort();
    expect(expected).toEqual([
      "ulc_linz_registration_extra_day",
      "ulc_linz_registration_extra_day_change",
      "ulc_linz_registration_group_policy",
    ]);
    expect(actualTables).toEqual(expected);
    for (const table of inventory.tables) {
      const start = migration.indexOf("CREATE TABLE " + table.id + " (");
      expect(start).toBeGreaterThanOrEqual(0);
      const ddl = migration.slice(start,
        migration.indexOf(");", start) + 2);
      const declared = [...ddl.matchAll(/^\s*([a-z_]+)\s+(?:text|timestamptz)\b/gm)]
        .map((match) => match[1]);
      for (const column of [
        ...table.actorColumns, ...table.timestampColumns,
        ...table.subjectColumns, ...table.freeTextColumns,
      ]) {
        expect(declared).toContain(column);
      }
      expect(table.actorColumns.length).toBeGreaterThan(0);
      expect(table.freeTextColumns).toEqual([]);
      expect(table.deletionEvidence).toBe("privileged-offline-redaction-staged-not-integrated");
      expect(table.retentionEvidence).toBe("not-implemented");
      expect(table.exportEvidence).toBe("offline-actor-subject-access-staged-not-approved");
      expect(table.restoreEvidence).toBe("not-verified");
    }
    const actorFields = [...new Set(inventory.tables.flatMap((t) => t.actorColumns))];
    expect(actorFields.sort()).toEqual([
      "actor_identity_id",
      "approved_by_identity_id",
      "updated_by_identity_id",
    ]);
    expect(inventory.blockers).toContain(
      "optional-lifecycle-redaction-hooks-not-injected-or-activated",
    );
    expect(inventory.blockers).toContain(
      "existing-registration-note-history-privacy-gate-remains-open",
    );
  });

  it("keeps proposed subject access separate from historical M5 and requires audit", async () => {
    const contract = await readJson<{
      state: string;
      resultLimit: number;
      personalReferenceFields: readonly {
        table: string; field: string; kind: string;
      }[];
      authorization: {
        self: string;
        organizationAdmin: string;
        parentOrDelegated: string;
        audit: string;
        noHttpRoute: boolean;
      };
      permittedResultFields: readonly string[];
      excludedFromCanonicalExportUntilPrivacySignoff: boolean;
      retention: string;
    }>("../privacy/a02-subject-access-contract.json");
    const inv = await readJson<PendingPrivacyInventory>(
      "../privacy/a02-registration-schedule-inventory.json",
    );
    const previous = await readJson<{
      datasets: readonly { id: string }[];
      excludedPrivacyClasses: readonly string[];
    }>("../privacy/m5-export-contract.json");
    const retention = await readJson<{
      status: string; defaultsToNoPurge: boolean; purgingEnabled: boolean;
      decisions: readonly { table: string; retentionDuration: string }[];
      releaseGate: string;
    }>("../privacy/a02-retention-decision.json");

    const defined = contract.personalReferenceFields.map((r) =>
      r.table + "." + r.field,
    ).sort();
    const expected = inv.tables.flatMap((t) => t.actorColumns.map((f) =>
      t.id + "." + f,
    )).sort();
    expect(defined).toEqual(expected);
    expect(contract.state).toBe("staged-read-only-not-approved-not-runtime-injected");
    expect(contract.resultLimit).toBe(500);
    expect(contract.authorization.parentOrDelegated).toBe("denied");
    expect(contract.authorization.noHttpRoute).toBe(true);
    expect(contract.authorization.audit).toBe("mandatory-before-returning-data");
    expect(contract.excludedFromCanonicalExportUntilPrivacySignoff).toBe(true);
    expect(contract.retention).toBe("decision-pending");
    expect(contract.permittedResultFields).toEqual([
      "referenceKind", "groupId", "sessionDate",
      "revision", "approved", "occurredAt",
    ]);
    expect(previous.datasets.map((d) => d.id)).toEqual(["member-contact"]);
    expect(previous.excludedPrivacyClasses).toContain("audit-security-data");

    // No accidental public endpoint, user-facing menu, or active lifecycle
    // export injection while controller sign-off remains pending.
    const [worker, runtime, legacyExport] = await Promise.all([
      readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
      readFile(new URL("../worker/postgres.ts", import.meta.url), "utf8"),
      readFile(new URL("../worker/data-export.ts", import.meta.url), "utf8"),
    ]);
    for (const file of [worker, runtime, legacyExport]) {
      expect(file).not.toContain("registration-schedule-subject-access");
      expect(file).not.toContain("registration-schedule-actor-access-postgres");
      expect(file).not.toContain("registration-schedule-actor-erasure");
    }

    expect(retention.status).toBe("pending-privacy-controller-review");
    expect(retention.defaultsToNoPurge).toBe(true);
    expect(retention.purgingEnabled).toBe(false);
    expect(retention.releaseGate).toBe("blocked-no-v12-promotion");
    expect(retention.decisions.map((d) => d.table).sort()).toEqual(
      inv.tables.map((t) => t.id).sort(),
    );
    expect(retention.decisions.every((d) => d.retentionDuration === "undecided"))
      .toBe(true);
  });

  it("does not claim that v12 or the historical v0.5 privacy inventory is deployed", async () => {
    const manifest = await readJson<{
      owners: readonly { id: string; schemaVersion: number; migrations: readonly string[] }[];
    }>("../appbasis.database.json");
    const oldInventory = await readJson<{
      scope: string;
      persistentOwners: readonly { id: string; schemaVersion: number }[];
    }>("../privacy/m5-data-inventory.json");
    const owner = manifest.owners.find((record) => record.id === "ulc-linz-lifecycle");
    expect(owner).toBeDefined();
    expect(owner?.schemaVersion).toBe(11);
    expect(owner?.migrations).not.toContain(
      "apps/ulc-linz/migrations/0011_ulc_linz_registration_schedule.sql",
    );
    expect(oldInventory.scope).toBe("current-materialized-v0.5");
    expect(oldInventory.persistentOwners.find((r) => r.id === "ulc-linz-lifecycle")
      ?.schemaVersion).toBe(9);
  });
});
