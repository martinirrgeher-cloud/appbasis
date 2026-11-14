import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

/**
 * P01: read-only schema inventory regression guard.
 *
 * These tests compare the CURRENT REPOSITORY manifest with the privacy
 * inventory; they do NOT assert a deployed schema, legal retention approval,
 * effective personal-data deletion, or a production-ready contract.
 */
interface ManifestOwner {
  readonly id: string;
  readonly schemaVersion: number;
  readonly migrations: readonly string[];
}
interface DatabaseManifest {
  readonly owners: readonly ManifestOwner[];
}
interface InventoryTable {
  readonly id: string;
  readonly owner: string;
  readonly retentionPolicy: string;
  readonly deletionEvidence: string;
  readonly retentionEvidence: string;
}
interface MigrationRisk {
  readonly migration: string;
  readonly tables: readonly string[];
  readonly columns: readonly string[];
  readonly dataRisk: string;
}
interface PrivacyInventory {
  readonly scope: string;
  readonly persistentOwners: readonly ManifestOwner[];
  readonly persistentTables: readonly InventoryTable[];
  readonly repositorySchemaReview: {
    readonly sourceManifest: string;
    readonly declaredMigrationCount: number;
    readonly declaredTableCount: number;
    readonly expectedLifecycleSchemaVersion: number;
    readonly previousRecordedMigrations: number;
    readonly newlyRecordedMigrations: readonly string[];
    readonly migrationChanges: readonly MigrationRisk[];
    readonly readiness: string;
  };
  readonly m5: {
    readonly deletionPolicy: string;
    readonly retentionPolicy: string;
    readonly restoreReconciliation: string;
    readonly unknownPersistentTable: string;
  };
}

async function json<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(new URL(path, import.meta.url), "utf8")) as T;
}

describe("ULC P01 declared-schema privacy inventory coverage (no DB writes)", () => {
  it("matches all 41 manifest-owned migration paths and owner schema versions exactly", async () => {
    const manifest = await json<DatabaseManifest>("../appbasis.database.json");
    const inventory = await json<PrivacyInventory>(
      "../privacy/m5-data-inventory.json",
    );
    const declared = manifest.owners.flatMap((owner) => owner.migrations);
    const recorded = inventory.persistentOwners.flatMap((owner) => owner.migrations);

    expect(declared).toHaveLength(41);
    expect(new Set(declared).size).toBe(41);
    expect(recorded).toEqual(declared);
    expect(inventory.persistentOwners).toEqual(manifest.owners);
    expect(inventory.scope).toContain("not-runtime-evidence");
    expect(inventory.repositorySchemaReview).toMatchObject({
      sourceManifest: "apps/ulc-linz/appbasis.database.json",
      declaredMigrationCount: 41,
      declaredTableCount: 64,
      expectedLifecycleSchemaVersion: 16,
      previousRecordedMigrations: 34,
      readiness: "blocked-do-not-interpret-as-operator-approval",
    });
  });

  it("enumerates the exact 64 static CREATE TABLE declarations without missing or invented tables", async () => {
    const manifest = await json<DatabaseManifest>("../appbasis.database.json");
    const inventory = await json<PrivacyInventory>(
      "../privacy/m5-data-inventory.json",
    );
    const declarations: { id: string; owner: string }[] = [];

    for (const owner of manifest.owners) {
      for (const migration of owner.migrations) {
        const source = await readFile(
          new URL("../../../" + migration, import.meta.url),
          "utf8",
        );
        // Exclude full-line SQL comments, but keep multiline DDL.
        const sql = source.split("\n")
          .filter((line) => !line.trimStart().startsWith("--"))
          .join("\n");
        const tablePattern = /\bCREATE\s+(?:UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:[A-Za-z_][\w]*\.)?["]?([A-Za-z_][\w]*)["]?/gi;
        for (const match of sql.matchAll(tablePattern)) {
          declarations.push({ id: match[1]!, owner: owner.id });
        }
      }
    }

    const sort = (rows: readonly { id: string; owner: string }[]) =>
      rows.map((row) => row.owner + "/" + row.id).sort();
    expect(declarations).toHaveLength(64);
    expect(new Set(sort(declarations)).size).toBe(64);
    expect(sort(inventory.persistentTables)).toEqual(sort(declarations));
  });

  it("records every v10–v16 migration, its changed fields and unresolved personal-data treatment", async () => {
    const inventory = await json<PrivacyInventory>(
      "../privacy/m5-data-inventory.json",
    );
    const review = inventory.repositorySchemaReview;
    expect(review.newlyRecordedMigrations).toHaveLength(7);
    expect(review.migrationChanges).toHaveLength(7);

    for (const risk of review.migrationChanges) {
      const path = "apps/ulc-linz/migrations/" + risk.migration;
      expect(review.newlyRecordedMigrations).toContain(path);
      const sql = await readFile(
        new URL("../../../" + path, import.meta.url),
        "utf8",
      );
      expect(risk.dataRisk.length).toBeGreaterThan(12);
      for (const table of risk.tables) {
        expect(sql).toContain(table);
        expect(inventory.persistentTables.some((entry) => entry.id === table))
          .toBe(true);
      }
      for (const column of risk.columns) expect(sql).toContain(column);
    }

    const byName = new Map(inventory.persistentTables.map((entry) => [
      entry.id, entry,
    ]));
    for (const table of [
      "ulc_linz_training_session",
      "ulc_linz_training_attendance",
      "ulc_linz_training_registration",
      "ulc_linz_training_registration_change",
      "ulc_linz_training_trainer_attendance",
    ]) {
      expect(byName.get(table)?.retentionPolicy).toContain("pending");
      expect(byName.get(table)?.deletionEvidence).toContain("pending");
    }
  });

  it("keeps the 35-day source expiry and every unapproved production privacy gate blocked", async () => {
    const inventory = await json<PrivacyInventory>(
      "../privacy/m5-data-inventory.json",
    );
    const policy = await json<{
      currentSourceAuthority: {
        markerRetentionDays: number;
        postExpiryRetry: string;
      };
      futureDurableDecisionRequirements: { privacyReview: string };
      deployment: { productionGate: boolean; runtimeWiring: boolean };
    }>("../privacy/athlete-deletion-recovery-policy.json");
    const assessment = await json<{ decision: string }>(
      "../privacy/m5-high-privacy-assessment.json",
    );

    expect(policy.currentSourceAuthority).toMatchObject({
      markerRetentionDays: 35,
      postExpiryRetry: "deny",
    });
    expect(policy.futureDurableDecisionRequirements.privacyReview)
      .toBe("not-approved");
    expect(policy.deployment.productionGate).toBe(false);
    expect(policy.deployment.runtimeWiring).toBe(false);
    expect(assessment.decision).toBe("high-privacy-required");
    expect(inventory.m5.deletionPolicy).toContain("fail-closed");
    expect(inventory.m5.retentionPolicy).toContain("fail-closed");
    expect(inventory.m5.restoreReconciliation).toContain("fail-closed");
    expect(inventory.m5.unknownPersistentTable).toBe("fail-closed");
  });
});
