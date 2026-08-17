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

type DataInventory = {
  schemaVersion: number;
  application: string;
  persistentOwners: Array<
    PersistentOwnerContract & {
      lifecycleStatus: "open";
      notes: string[];
    }
  >;
  runtimeModules: string[];
  backingStores: {
    memberships: {
      status: "unbound";
      sourceContract: "UlcLinzMembershipResolver";
    };
    subjectScopes: {
      status: "unbound";
      sourceContract: "UlcLinzSubjectScopeResolver";
    };
  };
  objectStorage: {
    status: "not-configured";
  };
  m5: {
    deletionPolicy: "open";
    retentionPolicy: "open";
    unknownPersistentOwner: "fail-closed";
    unknownRuntimeModule: "fail-closed";
    unknownBackingStore: "fail-closed";
  };
};

const inventoryUrl = new URL("../privacy/m5-data-inventory.json", import.meta.url);
const appManifestUrl = new URL("../appbasis.app.json", import.meta.url);
const databaseManifestUrl = new URL("../appbasis.database.json", import.meta.url);
const authorizationUrl = new URL("../worker/authorization.ts", import.meta.url);

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

describe("ULC Linz M5 C/D data inventory", () => {
  it("tracks every current persistent owner revision and runtime module fail closed", async () => {
    const [inventory, appManifest, databaseManifest] = await Promise.all([
      readJson<DataInventory>(inventoryUrl),
      readJson<AppManifest>(appManifestUrl),
      readJson<DatabaseManifest>(databaseManifestUrl),
    ]);

    expect(inventory.schemaVersion).toBe(1);
    expect(inventory.application).toBe("ulc-linz");
    expect(databaseManifest.application).toBe(inventory.application);
    expect(appManifest.appId).toBe(inventory.application);

    expect(sortedOwnerContracts(inventory.persistentOwners)).toEqual(
      sortedOwnerContracts(databaseManifest.owners),
    );
    expect(inventory.runtimeModules).toEqual(appManifest.modules);

    const databaseOwnerIds = databaseManifest.owners.map((owner) => owner.id);
    expect(
      databaseOwnerIds.every((ownerId) => appManifest.platformServices.includes(ownerId)),
    ).toBe(true);

    expect(
      inventory.persistentOwners.every((owner) => owner.lifecycleStatus === "open"),
    ).toBe(true);
    expect(inventory.m5).toEqual({
      deletionPolicy: "open",
      retentionPolicy: "open",
      unknownPersistentOwner: "fail-closed",
      unknownRuntimeModule: "fail-closed",
      unknownBackingStore: "fail-closed",
    });
  });

  it("keeps resolver-only membership and subject-scope persistence unverified", async () => {
    const [inventory, databaseManifest, authorizationSource] = await Promise.all([
      readJson<DataInventory>(inventoryUrl),
      readJson<DatabaseManifest>(databaseManifestUrl),
      readFile(authorizationUrl, "utf8"),
    ]);

    expect(inventory.backingStores.memberships).toEqual({
      status: "unbound",
      sourceContract: "UlcLinzMembershipResolver",
    });
    expect(inventory.backingStores.subjectScopes).toEqual({
      status: "unbound",
      sourceContract: "UlcLinzSubjectScopeResolver",
    });
    expect(authorizationSource).toContain("export interface UlcLinzMembershipResolver");
    expect(authorizationSource).toContain("export interface UlcLinzSubjectScopeResolver");

    const ownerIds = databaseManifest.owners.map((owner) => owner.id);
    expect(ownerIds).not.toContain("memberships");
    expect(ownerIds).not.toContain("subject-scopes");
    expect(inventory.objectStorage.status).toBe("not-configured");
  });

  it("does not mistake identity disablement for M5 deletion evidence", async () => {
    const inventory = await readJson<DataInventory>(inventoryUrl);
    const identity = inventory.persistentOwners.find((owner) => owner.id === "identity");

    expect(identity).toBeDefined();
    expect(identity?.notes).toContain("disable-identity-is-not-deletion");
    expect(inventory.m5.deletionPolicy).toBe("open");
    expect(inventory.m5.retentionPolicy).toBe("open");
  });
});
