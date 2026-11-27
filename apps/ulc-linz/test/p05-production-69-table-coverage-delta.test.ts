import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

type HistoricalDecision = {
  readonly documentType: string;
  readonly status: string;
  readonly runtimeActive: boolean;
  readonly legalApproval: boolean;
  readonly baseline: {
    readonly tableCount: number;
    readonly originalSourceMarkerRetentionDays: number;
    readonly postExpiryRetry: string;
    readonly productionPrivacyGate: string;
  };
  readonly tableGroups: readonly {
    readonly id: string;
    readonly tables: readonly string[];
  }[];
};

type ProductionDelta = {
  readonly schemaVersion: number;
  readonly application: string;
  readonly documentType: string;
  readonly status: string;
  readonly baseline: {
    readonly historicalDecisionFile: string;
    readonly historicalDecisionStatus: string;
    readonly historicalPreviewTableCount: number;
    readonly currentProductionTableCount: number;
    readonly historicalPreviewTablesPresentInProduction: number;
    readonly additionalProductionTableCount: number;
  };
  readonly additions: readonly {
    readonly table: string;
    readonly proposedExistingPurposeGroup: string;
    readonly basis: string;
  }[];
  readonly safeguards: {
    readonly historicalP01DocumentUnchanged: boolean;
    readonly operatorApprovedTargetDurationsUnchanged: boolean;
    readonly legalApproval: boolean;
    readonly runtimeActive: boolean;
    readonly productionPrivacyGate: string;
    readonly mustNotExtendOriginal35DayAuthority: boolean;
    readonly mustNotActivateMedia: boolean;
    readonly noRuntimeOrSqlMigrationChanges: boolean;
  };
  readonly remainingReview: readonly string[];
};

async function read<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(new URL(path, import.meta.url), "utf8")) as T;
}

describe("P05 69-table production privacy delta is a proposal only", () => {
  it("reconciles precisely the three missing live tables without revising the confirmed historical 66-table decision", async () => {
    const historical = await read<HistoricalDecision>("../privacy/p01-operator-retention-candidate.json");
    const delta = await read<ProductionDelta>("../privacy/p05-production-69-table-coverage-delta.json");
    const known = historical.tableGroups.flatMap((group) => group.tables);
    const groups = new Set(historical.tableGroups.map((group) => group.id));
    const added = delta.additions.map((row) => row.table);

    expect(historical.documentType).toBe("operator-confirmed-target-guideline-not-runtime-policy");
    expect(historical.status).toBe("FACHLICHE_ZIELVORGABE_BESTAETIGT");
    expect(known).toHaveLength(66);
    expect(new Set(known).size).toBe(66);
    expect(historical.baseline.tableCount).toBe(66);
    expect(historical.tableGroups).toHaveLength(13);
    expect(delta.schemaVersion).toBe(1);
    expect(delta.application).toBe("ulc-linz");
    expect(delta.documentType).toBe("p05-technical-production-schema-coverage-delta-not-runtime-or-legal-approval");
    expect(delta.status).toBe("TECHNICAL_COVERAGE_PROPOSAL_ONLY");
    expect(delta.baseline).toEqual({
      historicalDecisionFile: "apps/ulc-linz/privacy/p01-operator-retention-candidate.json",
      historicalDecisionStatus: "FACHLICHE_ZIELVORGABE_BESTAETIGT",
      historicalPreviewTableCount: 66,
      currentProductionTableCount: 69,
      historicalPreviewTablesPresentInProduction: 66,
      additionalProductionTableCount: 3,
    });
    expect(added.sort()).toEqual([
      "appbasis_exercise_catalog_favorite_deletion",
      "appbasis_exercise_catalog_usage_subject",
      "ulc_linz_training_subject_deletion",
    ]);
    expect(new Set(added).size).toBe(3);
    expect(added.every((table) => !known.includes(table))).toBe(true);
    expect(known.length + added.length).toBe(69);
    for (const row of delta.additions) {
      expect(groups.has(row.proposedExistingPurposeGroup)).toBe(true);
      expect(row.basis.length).toBeGreaterThan(30);
    }
    expect(delta.additions.find((row) => row.table === "appbasis_exercise_catalog_favorite_deletion")?.proposedExistingPurposeGroup)
      .toBe("deletion_markers");
    expect(delta.additions.find((row) => row.table === "appbasis_exercise_catalog_usage_subject")?.proposedExistingPurposeGroup)
      .toBe("usage_events");
    expect(delta.additions.find((row) => row.table === "ulc_linz_training_subject_deletion")?.proposedExistingPurposeGroup)
      .toBe("deletion_markers");
  });

  it("remains fail-closed for actual production activation and restores the existing 35-day authority", async () => {
    const historical = await read<HistoricalDecision>("../privacy/p01-operator-retention-candidate.json");
    const delta = await read<ProductionDelta>("../privacy/p05-production-69-table-coverage-delta.json");
    const production = await read<{
      readonly status: string;
      readonly crossCutting: { readonly privacy: string; readonly applicationLifecycle: string };
    }>("../appbasis.production.json");

    expect(historical.runtimeActive).toBe(false);
    expect(historical.legalApproval).toBe(false);
    expect(historical.baseline.originalSourceMarkerRetentionDays).toBe(35);
    expect(historical.baseline.postExpiryRetry).toBe("deny");
    expect(historical.baseline.productionPrivacyGate).toBe("blocked");

    expect(delta.safeguards).toEqual({
      historicalP01DocumentUnchanged: true,
      operatorApprovedTargetDurationsUnchanged: true,
      legalApproval: false,
      runtimeActive: false,
      productionPrivacyGate: "blocked",
      mustNotExtendOriginal35DayAuthority: true,
      mustNotActivateMedia: true,
      noRuntimeOrSqlMigrationChanges: true,
    });
    expect(delta.remainingReview.length).toBeGreaterThanOrEqual(3);
    expect(["blocked", "ready"]).toContain(production.status);
    if (production.status === "ready") {
      expect(production.crossCutting.privacy).toBe("verified");
      expect(production.crossCutting.applicationLifecycle).toBe("verified");
    }
    // Historical P01/P05 remain unapproved even after a separate current
    // 69-table T10 controller decision; do not backfill legalApproval here.
  });
});
