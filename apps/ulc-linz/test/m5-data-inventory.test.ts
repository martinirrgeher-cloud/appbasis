import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

type AppManifest = {
  appId: string;
  modules: string[];
  platformServices: string[];
};

type PersistentOwnerContract = {
  id: string;
  schemaVersion: number;
  migrations: string[];
};

type DatabaseManifest = {
  application: string;
  owners: PersistentOwnerContract[];
};

type PersistentTableInventory = {
  id: string;
  owner: string;
  privacyClass: string;
  retentionPolicy: string;
  deletionEvidence: string;
  retentionEvidence: string;
};

type DataInventory = {
  schemaVersion: number;
  application: string;
  scope: string;
  persistentOwners: Array<
    PersistentOwnerContract & {
      lifecycleStatus: string;
      notes: string[];
    }
  >;
  persistentTables: PersistentTableInventory[];
  runtimeModules: string[];
  backingStores: {
    memberships: {
      status: string;
      sourceContract: string;
      owner: string;
      table: string;
    };
    subjectScopes: {
      status: string;
      sourceContract: string;
      owner: string;
      table: string;
    };
  };
  objectStorage: {
    status: string;
    futureIntroduction: string;
  };
  m5: Record<string, string>;
};

const inventoryUrl = new URL("../privacy/m5-data-inventory.json", import.meta.url);
const appManifestUrl = new URL("../appbasis.app.json", import.meta.url);
const databaseManifestUrl = new URL("../appbasis.database.json", import.meta.url);
const authorizationUrl = new URL("../worker/authorization.ts", import.meta.url);
const scopePersistenceUrl = new URL("../worker/scope-persistence.ts", import.meta.url);
const lifecycleServiceUrl = new URL("../worker/lifecycle-service.ts", import.meta.url);
const retentionUrl = new URL("../worker/retention.ts", import.meta.url);
const athleteRepositoryUrl = new URL(
  "../../../modules/athletes/src/postgres-masterdata-repository.ts",
  import.meta.url,
);
const protectedLifecycleUrl = new URL(
  "../worker/protected-lifecycle-operations.ts",
  import.meta.url,
);
const restoreUrl = new URL("../worker/restore-reconciliation.ts", import.meta.url);
const repoRootUrl = new URL("../../../", import.meta.url);

async function readJson<T>(url: URL): Promise<T> {
  return JSON.parse(await readFile(url, "utf8")) as T;
}

function sorted(values: string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function sortedOwnerContracts(
  owners: readonly PersistentOwnerContract[],
): PersistentOwnerContract[] {
  return owners
    .map((owner) => ({
      id: owner.id,
      schemaVersion: owner.schemaVersion,
      migrations: [...owner.migrations],
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function createdTableNames(sql: string): string[] {
  const names: string[] = [];
  const pattern = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([A-Za-z0-9_]+)"?/gi;
  for (const match of sql.matchAll(pattern)) {
    const name = match[1];
    if (name !== undefined) names.push(name);
  }
  return names;
}

async function persistentTablesFromMigrations(
  databaseManifest: DatabaseManifest,
): Promise<Array<{ owner: string; id: string }>> {
  const tables: Array<{ owner: string; id: string }> = [];
  for (const owner of databaseManifest.owners) {
    for (const migration of owner.migrations) {
      const sql = await readFile(new URL(migration, repoRootUrl), "utf8");
      for (const id of createdTableNames(sql)) tables.push({ owner: owner.id, id });
    }
  }
  return tables;
}

function sortedTableKeys(tables: readonly { owner: string; id: string }[]): string[] {
  return sorted(tables.map((table) => `${table.owner}:${table.id}`));
}

describe("ULC Linz M5 C/D data inventory", () => {
  it("tracks the exact current persistent owners and invalidates future persistence by default", async () => {
    const [inventory, appManifest, databaseManifest] = await Promise.all([
      readJson<DataInventory>(inventoryUrl),
      readJson<AppManifest>(appManifestUrl),
      readJson<DatabaseManifest>(databaseManifestUrl),
    ]);

    expect(inventory.schemaVersion).toBe(2);
    expect(inventory.application).toBe("ulc-linz");
    expect(inventory.scope).toBe("current-materialized-v0.3");
    expect(databaseManifest.application).toBe(inventory.application);
    expect(appManifest.appId).toBe(inventory.application);
    expect(appManifest.modules).toEqual(["countdown", "athletes"]);
    expect(inventory.runtimeModules).toEqual(["countdown", "athletes"]);
    expect(inventory.runtimeModules).toEqual(appManifest.modules);
    expect(inventory.m5.unknownRuntimeModule).toBe("fail-closed");

    expect(sortedOwnerContracts(inventory.persistentOwners)).toEqual(
      sortedOwnerContracts(databaseManifest.owners),
    );
    expect(databaseManifest.owners.map((owner) => owner.id)).toEqual([
      "identity",
      "permissions",
      "athletes",
      "ulc-linz-lifecycle",
    ]);
    expect(appManifest.platformServices).toEqual(["identity", "permissions"]);
    expect(
      inventory.persistentOwners
        .filter(
          (owner) =>
            owner.id !== "athletes" && owner.id !== "ulc-linz-lifecycle",
        )
        .every((owner) => owner.lifecycleStatus === "verified-current-scope"),
    ).toBe(true);
    expect(
      inventory.persistentOwners.find(
        (owner) => owner.id === "ulc-linz-lifecycle",
      ),
    ).toMatchObject({
      schemaVersion: 6,
      lifecycleStatus: "training-data-lifecycle-pending",
      notes: expect.arrayContaining([
        "app-owned-training-session-and-attendance-lifecycle-pending",
      ]),
    });
    expect(
      inventory.persistentOwners.find((owner) => owner.id === "athletes"),
    ).toMatchObject({
      lifecycleStatus:
        "deletion-retention-restore-repository-verified-production-activation-pending",
      notes: expect.arrayContaining([
        "repository-retention-deletes-personal-masterdata-and-group-memberships-after-12-calendar-months",
        "production-retention-activation-pending-athletes-schema-deploy",
        "restore-reconciliation-repository-verified-production-activation-pending",
      ]),
    });

    expect(inventory.objectStorage).toEqual({
      status: "not-configured",
      futureIntroduction: "invalidates-current-evidence",
    });
    expect(inventory.m5).toEqual({
      deletionPolicy: "fail-closed-pending-training-data-lifecycle",
      retentionPolicy: "fail-closed-pending-training-data-lifecycle",
      restoreReconciliation: "fail-closed-pending-training-data-lifecycle",
      unknownPersistentOwner: "fail-closed",
      unknownPersistentTable: "fail-closed",
      unknownRuntimeModule: "fail-closed",
      unknownBackingStore: "fail-closed",
      futureObjectStorage: "fail-closed",
    });
  });

  it("classifies every currently created PostgreSQL table with no open or unmapped lifecycle", async () => {
    const [inventory, databaseManifest] = await Promise.all([
      readJson<DataInventory>(inventoryUrl),
      readJson<DatabaseManifest>(databaseManifestUrl),
    ]);
    const migrationTables = await persistentTablesFromMigrations(databaseManifest);

    expect(sortedTableKeys(inventory.persistentTables)).toEqual(
      sortedTableKeys(migrationTables),
    );
    expect(inventory.persistentTables).toHaveLength(29);
    for (const table of inventory.persistentTables) {
      expect(table.privacyClass.length).toBeGreaterThan(0);
      expect(table.retentionPolicy.length).toBeGreaterThan(0);
      expect(table.retentionPolicy).not.toBe("unmapped");
      expect(table.deletionEvidence).not.toBe("open");
      expect(table.retentionEvidence).not.toBe("open");
    }

    expect(
      inventory.persistentTables.find((table) => table.id === "appbasis_athlete"),
    ).toMatchObject({
      privacyClass: "athlete-master-data",
      retentionPolicy: "12-months-after-deactivation",
      deletionEvidence: "verified",
      retentionEvidence: "verified",
    });
    expect(
      inventory.persistentTables.find((table) => table.id === "appbasis_trainer"),
    ).toMatchObject({
      privacyClass: "trainer-master-data",
      retentionPolicy: "12-months-after-deactivation",
      deletionEvidence: "verified",
      retentionEvidence: "verified",
    });
    expect(
      inventory.persistentTables.find(
        (table) => table.id === "appbasis_athlete_group_membership",
      ),
    ).toMatchObject({
      privacyClass: "athlete-training-membership",
      retentionPolicy: "delete-with-athlete-after-12-months-deactivation",
      deletionEvidence: "verified",
      retentionEvidence: "verified",
    });
    expect(
      inventory.persistentTables.find(
        (table) => table.id === "appbasis_trainer_group_membership",
      ),
    ).toMatchObject({
      privacyClass: "trainer-training-membership",
      retentionPolicy: "delete-with-trainer-after-12-months-deactivation",
      deletionEvidence: "verified",
      retentionEvidence: "verified",
    });
    expect(
      inventory.persistentTables.find((table) => table.id === "appbasis_training_group"),
    ).toMatchObject({
      privacyClass: "training-group-configuration",
      deletionEvidence: "not-personal",
      retentionEvidence: "not-personal",
    });
    expect(
      inventory.persistentTables.find(
        (table) => table.id === "appbasis_athletes_deletion",
      ),
    ).toMatchObject({
      privacyClass: "minimal-delete-reconciliation-state",
      retentionPolicy: "35-days",
      deletionEvidence: "retained-by-policy",
      retentionEvidence: "verified",
    });

    expect(
      inventory.persistentTables.find((table) => table.id === "appbasis_person"),
    ).toMatchObject({
      retentionPolicy: "12-months-after-exit-or-purpose-end",
      deletionEvidence: "verified",
      retentionEvidence: "verified",
    });
    expect(
      inventory.persistentTables.find(
        (table) => table.id === "appbasis_permission_administration_audit",
      ),
    ).toMatchObject({
      retentionPolicy: "12-months",
      deletionEvidence: "retained-by-policy",
      retentionEvidence: "verified",
    });
    expect(
      inventory.persistentTables.find(
        (table) => table.id === "ulc_linz_lifecycle_deletion",
      ),
    ).toMatchObject({
      retentionPolicy: "35-days",
      deletionEvidence: "retained-by-policy",
      retentionEvidence: "verified",
    });
    expect(
      inventory.persistentTables.find(
        (table) => table.id === "ulc_linz_lifecycle_audit",
      ),
    ).toMatchObject({
      privacyClass: "audit-security-data",
      retentionPolicy: "12-months",
      deletionEvidence: "retained-by-policy",
      retentionEvidence: "verified",
    });
    expect(
      inventory.persistentTables.find(
        (table) => table.id === "ulc_linz_security_event_log",
      ),
    ).toMatchObject({
      privacyClass: "audit-security-data",
      retentionPolicy: "12-months",
      deletionEvidence: "retained-by-policy",
      retentionEvidence: "verified",
    });
    expect(
      inventory.persistentTables.find(
        (table) => table.id === "ulc_linz_trainer_identity_audit",
      ),
    ).toMatchObject({
      privacyClass: "audit-security-data",
      retentionPolicy: "12-months",
      deletionEvidence: "retained-by-policy",
      retentionEvidence: "fail-closed-pending-purge-activation",
    });
    expect(
      inventory.persistentTables.find(
        (table) => table.id === "ulc_linz_training_session",
      ),
    ).toMatchObject({
      privacyClass: "training-session-data",
      retentionPolicy: "pending-training-data-lifecycle-contract",
      deletionEvidence: "fail-closed-pending-lifecycle",
      retentionEvidence: "fail-closed-pending-lifecycle",
    });
    expect(
      inventory.persistentTables.find(
        (table) => table.id === "ulc_linz_training_attendance",
      ),
    ).toMatchObject({
      privacyClass: "athlete-training-attendance",
      retentionPolicy: "pending-training-data-lifecycle-contract",
      deletionEvidence: "fail-closed-pending-lifecycle",
      retentionEvidence: "fail-closed-pending-lifecycle",
    });
    expect(
      inventory.persistentTables.find((table) => table.id === "verification"),
    ).toMatchObject({
      deletionEvidence: "fail-closed-unused",
      retentionEvidence: "fail-closed-unused",
    });
  });

  it("binds membership and subject-scope resolver ports to the ULC app-owned PostgreSQL owner", async () => {
    const [
      inventory,
      authorizationSource,
      scopePersistenceSource,
      lifecycleServiceSource,
    ] = await Promise.all([
      readJson<DataInventory>(inventoryUrl),
      readFile(authorizationUrl, "utf8"),
      readFile(scopePersistenceUrl, "utf8"),
      readFile(lifecycleServiceUrl, "utf8"),
    ]);

    expect(inventory.backingStores.memberships).toEqual({
      status: "bound",
      sourceContract: "UlcLinzMembershipResolver",
      owner: "ulc-linz-lifecycle",
      table: "ulc_linz_membership",
    });
    expect(inventory.backingStores.subjectScopes).toEqual({
      status: "bound",
      sourceContract: "UlcLinzSubjectScopeResolver",
      owner: "ulc-linz-lifecycle",
      table: "ulc_linz_subject_scope",
    });
    expect(authorizationSource).toContain("export interface UlcLinzMembershipResolver");
    expect(authorizationSource).toContain("export interface UlcLinzSubjectScopeResolver");
    expect(scopePersistenceSource).toContain("implements UlcLinzMembershipResolver, UlcLinzSubjectScopeResolver");
    expect(lifecycleServiceSource).toContain("actorMembership.sourceRole !== \"admin\"");
    expect(lifecycleServiceSource).toContain("target.sourceRole === \"admin\"");
  });

  it("pins deletion/retention while keeping athletes restore reconciliation fail-closed", async () => {
    const [
      scopePersistenceSource,
      retentionSource,
      athleteRepositorySource,
      protectedLifecycleSource,
      restoreSource,
    ] = await Promise.all([
      readFile(scopePersistenceUrl, "utf8"),
      readFile(retentionUrl, "utf8"),
      readFile(athleteRepositoryUrl, "utf8"),
      readFile(protectedLifecycleUrl, "utf8"),
      readFile(restoreUrl, "utf8"),
    ]);

    expect(scopePersistenceSource).toContain("addCalendarMonthsClamped(target.endedAt, 12)");
    expect(scopePersistenceSource).toContain("interval '35 days'");
    expect(scopePersistenceSource).toContain("WHERE purge_after < $1");
    expect(scopePersistenceSource).toContain("retention.exception.set");
    expect(scopePersistenceSource).toContain("identity.delete.completed");
    expect(scopePersistenceSource).toContain("interval '12 months'");
    expect(retentionSource).toContain("status === \"exception\"");
    expect(retentionSource).toContain("deleteUlcLinzIdentity(");
    expect(retentionSource).toContain("purgeExpiredLifecycleAuditEvents");
    expect(retentionSource).not.toContain("purgeDeactivatedPersonalData");
    expect(athleteRepositorySource).toContain("is_active = false");
    expect(athleteRepositorySource).toContain("updated_at + interval '12 months'");
    expect(athleteRepositorySource).toContain(
      "DELETE FROM appbasis_athlete_group_membership",
    );
    expect(athleteRepositorySource).toContain(
      "DELETE FROM appbasis_trainer_group_membership",
    );
    expect(athleteRepositorySource).toContain(
      "INSERT INTO appbasis_athletes_deletion",
    );
    expect(athleteRepositorySource).toContain(
      "listCurrentDeletionMarkers",
    );
    expect(athleteRepositorySource).toContain(
      "reconcileDeletionMarker",
    );
    expect(protectedLifecycleSource).not.toContain(
      "PostgresAthleteMasterdataRepository",
    );
    expect(restoreSource).toContain("WHERE purge_after >= $1");
    expect(restoreSource).toContain("reconcileUlcLinzRestoredDatabase");
    expect(restoreSource).toContain("restoredMembership.sourceRole !== marker.sourceRole");
    expect(restoreSource).not.toContain("appbasis_athlete");
    expect(restoreSource).not.toContain("appbasis_trainer");
  });
});
