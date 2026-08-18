import { describe, expect, it } from "vitest";

import dataInventory from "../privacy/m5-data-inventory.json";
import exportContract from "../privacy/m5-export-contract.json";

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function tableKey(input: { owner: string; table: string }): string {
  return `${input.owner}:${input.table}`;
}

describe("ULC Linz M5-E export contract", () => {
  it("pins the canonical export format and fail-closed dataset behavior", () => {
    expect(exportContract).toMatchObject({
      schemaVersion: 1,
      appId: "ulc-linz",
      canonicalFormat: "json",
      supplementaryFormats: ["csv"],
      unknownDataset: "deny",
    });
  });

  it("stays bound to the real runtime-module and storage inventory", () => {
    expect(exportContract.runtimeModules).toEqual(dataInventory.runtimeModules);
    expect(dataInventory.objectStorage.status).toBe("not-configured");
  });

  it("classifies every currently inventoried persistent table exactly once", () => {
    const inventoriedTables = dataInventory.persistentTables.map((table) => ({
      owner: table.owner,
      table: table.id,
      privacyClass: table.privacyClass,
    }));
    const exportedTables = exportContract.datasets.flatMap(
      (dataset) => dataset.sourceTables,
    );
    const classifiedTables = [...exportedTables, ...exportContract.excludedTables];

    expect(inventoriedTables).toHaveLength(19);
    expect(sortedUnique(classifiedTables.map(tableKey))).toEqual(
      sortedUnique(inventoriedTables.map(tableKey)),
    );
    expect(sortedUnique(classifiedTables.map(tableKey))).toHaveLength(
      classifiedTables.length,
    );

    for (const classification of classifiedTables) {
      expect(inventoriedTables).toContainEqual(classification);
    }
  });

  it("keeps table and privacy-class decisions mutually consistent", () => {
    const exportedPrivacyClasses = exportContract.datasets.flatMap(
      (dataset) => dataset.privacyClasses,
    );
    const excludedPrivacyClasses = exportContract.excludedPrivacyClasses;

    expect(
      exportedPrivacyClasses.filter((privacyClass) =>
        excludedPrivacyClasses.includes(privacyClass),
      ),
    ).toEqual([]);

    for (const dataset of exportContract.datasets) {
      expect(
        sortedUnique(dataset.sourceTables.map((table) => table.privacyClass)),
      ).toEqual(sortedUnique(dataset.privacyClasses));
    }
    expect(
      sortedUnique(exportContract.excludedTables.map((table) => table.privacyClass)),
    ).toEqual(sortedUnique(excludedPrivacyClasses));
  });

  it("exports only current member/contact master data as a normal user dataset", () => {
    expect(exportContract.datasets).toHaveLength(1);
    expect(exportContract.datasets[0]).toEqual({
      id: "member-contact",
      privacyClasses: ["member-contact-master-data"],
      sourceTables: [
        {
          owner: "identity",
          table: "appbasis_person",
          privacyClass: "member-contact-master-data",
        },
        {
          owner: "identity",
          table: "user",
          privacyClass: "member-contact-master-data",
        },
      ],
      scopes: ["self", "managed", "organization"],
      allowedFields: [
        "username",
        "displayName",
        "contactEmail",
        "createdAt",
        "updatedAt",
      ],
      csvEligible: true,
      csvColumns: [
        "username",
        "displayName",
        "contactEmail",
        "createdAt",
        "updatedAt",
      ],
    });
  });

  it("keeps lifecycle, credential, authorization and security tables outside normal export", () => {
    const excludedTableKeys = exportContract.excludedTables.map(tableKey);
    expect(excludedTableKeys).toEqual(
      expect.arrayContaining([
        "identity:account",
        "identity:session",
        "identity:verification",
        "identity:appbasis_identity_security_state",
        "identity:appbasis_identity_operation",
        "permissions:appbasis_permission_principal",
        "permissions:appbasis_permission_administration_audit",
        "ulc-linz-lifecycle:ulc_linz_membership",
        "ulc-linz-lifecycle:ulc_linz_subject_scope",
        "ulc-linz-lifecycle:ulc_linz_lifecycle_deletion",
        "ulc-linz-lifecycle:ulc_linz_lifecycle_audit",
      ]),
    );

    const allowedFields = exportContract.datasets.flatMap(
      (dataset) => dataset.allowedFields,
    );
    expect(
      allowedFields.filter((field) =>
        exportContract.credentialFieldNames.includes(field),
      ),
    ).toEqual([]);
  });

  it("keeps dataset ids, scopes, source tables and fields unique", () => {
    const datasetIds = exportContract.datasets.map((dataset) => dataset.id);
    expect(sortedUnique(datasetIds)).toEqual([...datasetIds].sort());

    for (const dataset of exportContract.datasets) {
      expect(sortedUnique(dataset.scopes)).toEqual([...dataset.scopes].sort());
      expect(sortedUnique(dataset.sourceTables.map(tableKey))).toHaveLength(
        dataset.sourceTables.length,
      );
      expect(sortedUnique(dataset.allowedFields)).toEqual(
        [...dataset.allowedFields].sort(),
      );
      expect(dataset.csvColumns).toEqual(dataset.allowedFields);
    }
  });
});
