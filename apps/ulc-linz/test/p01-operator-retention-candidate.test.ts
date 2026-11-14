import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

/**
 * P01: operator-confirmed target rules only; no legal or runtime approval.
 * Test purpose: catch missing data categories and silent security-policy activation.
 * The target guideline is NOT a runtime policy, legal opinion, or production gate.
 */
type Group = {
  readonly id: string;
  readonly tables: readonly string[];
  readonly duration: string;
  readonly purpose: string;
  readonly condition: string;
};
type Candidate = {
  readonly schemaVersion: number;
  readonly documentType: string;
  readonly status: string;
  readonly runtimeActive: boolean;
  readonly legalApproval: boolean;
  readonly approval: {
    readonly category: string;
    readonly decidedOn: string;
    readonly source: string;
    readonly authorization: string;
    readonly exactScope: readonly string[];
    readonly excludes: readonly string[];
  };
  readonly baseline: {
    readonly manifestMigrationCount: number;
    readonly tableCount: number;
    readonly originalSourceMarkerRetentionDays: number;
    readonly postExpiryRetry: string;
    readonly noAutomaticRetentionPurge: boolean;
    readonly productionPrivacyGate: string;
  };
  readonly recommendedDecisions: Record<string, string>;
  readonly tableGroups: readonly Group[];
  readonly freeTextExceptions: readonly {
    readonly table: string;
    readonly field: string;
    readonly proposal: string;
  }[];
};
type Inventory = {
  readonly persistentTables: readonly { readonly id: string; readonly owner: string }[];
  readonly persistentOwners: readonly {
    readonly migrations: readonly string[];
  }[];
  readonly m5: Record<string, string>;
};

async function data<T>(path: string): Promise<T> {
  return JSON.parse(
    await readFile(new URL(path, import.meta.url), "utf8"),
  ) as T;
}

describe("ULC P01 confirmed target guidance – no legal or runtime approval", () => {
  it("covers each one of the 64 declared inventory tables exactly once", async () => {
    const candidate = await data<Candidate>(
      "../privacy/p01-operator-retention-candidate.json",
    );
    const inventory = await data<Inventory>(
      "../privacy/m5-data-inventory.json",
    );
    const rows = candidate.tableGroups.flatMap((group) => group.tables);
    const declared = inventory.persistentTables.map((table) => table.id);
    expect(declared).toHaveLength(64);
    expect(rows).toHaveLength(64);
    expect(new Set(rows).size).toBe(64);
    expect([...rows].sort()).toEqual([...declared].sort());
    expect(inventory.persistentOwners.flatMap((owner) =>
      owner.migrations)).toHaveLength(41);
    expect(candidate.baseline.manifestMigrationCount).toBe(41);
    expect(candidate.baseline.tableCount).toBe(64);
  });

  it("records scoped operator target confirmation while keeping legal/provider/production gates unapproved", async () => {
    const candidate = await data<Candidate>(
      "../privacy/p01-operator-retention-candidate.json",
    );
    const actual = await data<{
      status: string;
      currentSourceAuthority: {
        markerRetentionDays: number; postExpiryRetry: string;
      };
      deployment: {
        productionGate: boolean;
        runtimeWiring: boolean;
        databaseMigration: boolean;
      };
    }>("../privacy/athlete-deletion-recovery-policy.json");
    const app = await data<{
      status: string;
      crossCutting: { privacy: string; applicationLifecycle: string };
    }>("../appbasis.production.json");

    expect(candidate.documentType).toBe("operator-confirmed-target-guideline-not-runtime-policy");
    expect(candidate.status).toBe("FACHLICHE_ZIELVORGABE_BESTAETIGT");
    expect(candidate.runtimeActive).toBe(false);
    expect(candidate.legalApproval).toBe(false);
    expect(candidate.approval).toMatchObject({
      category: "purpose-and-retention-target-guideline-only",
      decidedOn: "2026-11-14",
      source: "explicit-chat-confirmation-to-listed-purpose-dependent-retention-rules",
      authorization: "user-self-declared-entitled-to-approve-for-ULC-Linz",
    });
    expect(candidate.approval.exactScope).toHaveLength(7);
    expect(candidate.approval.excludes).toEqual(expect.arrayContaining([
      "no-approval-of-specific-longer-post-expiry-ledger-or-provider-backup-duration",
      "no-approval-of-production-retention-enforcement-deployment-database-migrations-or-erasure",
      "no-GitHub-PR-merge-authorization-implied-by-data-policy-approval",
    ]));
    expect(candidate.baseline).toMatchObject({
      originalSourceMarkerRetentionDays: 35,
      postExpiryRetry: "deny",
      noAutomaticRetentionPurge: true,
      productionPrivacyGate: "blocked",
    });
    expect(actual.status).toBe("blocked-pending-operator-privacy-policy");
    expect(actual.currentSourceAuthority).toMatchObject({
      markerRetentionDays: 35, postExpiryRetry: "deny",
    });
    expect(actual.deployment).toMatchObject({
      productionGate: false,
      runtimeWiring: false,
      databaseMigration: false,
    });
    expect(app.status).toBe("blocked");
    expect(app.crossCutting).toMatchObject({
      privacy: "blocked", applicationLifecycle: "blocked",
    });
  });

  it("requires a purpose and an explicit conditional rule for all 13 groups", async () => {
    const candidate = await data<Candidate>(
      "../privacy/p01-operator-retention-candidate.json",
    );
    expect(candidate.tableGroups).toHaveLength(13);
    for (const group of candidate.tableGroups) {
      expect(group.tables.length, group.id).toBeGreaterThan(0);
      expect(group.purpose.length, group.id).toBeGreaterThan(10);
      expect(group.duration.length, group.id).toBeGreaterThan(10);
      expect(group.condition.length, group.id).toBeGreaterThan(10);
    }
    expect(Object.keys(candidate.recommendedDecisions).sort())
      .toEqual(["D1", "D2", "D3", "D4"]);
    expect(candidate.recommendedDecisions.D2).toContain("35-day");
    expect(candidate.recommendedDecisions.D4).toContain("eight owners");
  });

  it("separates historical registration notes, session text, legacy usage and document revisions", async () => {
    const candidate = await data<Candidate>(
      "../privacy/p01-operator-retention-candidate.json",
    );
    const required = [
      ["ulc_linz_training_registration", "note"],
      ["ulc_linz_training_registration_change", "note"],
      ["ulc_linz_training_session", "note"],
      ["ulc_linz_training_session", "training_content_titles/training_content_items"],
      ["appbasis_training_documentation_revision", "free-text-and-participant-links"],
      ["appbasis_training_block_usage", "source_ref/note"],
    ] as const;
    for (const [table, field] of required) {
      expect(candidate.freeTextExceptions).toEqual(
        expect.arrayContaining([expect.objectContaining({
          table, field, proposal: expect.any(String),
        })]),
      );
    }
    const risk = new Map(candidate.tableGroups.map((group) => [
      group.id, group.tables,
    ]));
    expect(risk.get("deletion_markers")).toContain("appbasis_athletes_deletion");
    expect(risk.get("training_person_records")).toContain("ulc_linz_training_trainer_attendance");
    expect(risk.get("private_media")).toContain("appbasis_exercise_catalog_private_media");
  });
});
