import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

/**
 * P1/P2 release evidence is deliberately fail-closed. A classified table or
 * a successful Preview database migration is not proof of privacy compliance
 * or production safety for catalog, blocks and documentation.
 *
 * This is an audit regression, NOT a runtime deletion or security gate.
 */
async function json<T>(relativePath: string): Promise<T> {
  return JSON.parse(
    await readFile(new URL(relativePath, import.meta.url), "utf8"),
  ) as T;
}

type ProductionContract = {
  readonly status: string;
  readonly blockers: readonly string[];
  readonly requirements?: Readonly<Record<string, string>>;
  readonly crossCutting?: Readonly<Record<string, string>>;
  readonly evidence?: Readonly<Record<string, readonly unknown[]>>;
};

describe("ULC P1/P2 consolidated production blockers", () => {
  it("preserves the three genuinely ready modules, without inventing missing evidence", async () => {
    for (const moduleId of ["countdown", "athletes", "training-plans"]) {
      const contract = await json<ProductionContract>(
        `../../../modules/${moduleId}/appbasis.production.json`,
      );
      expect(contract.status, moduleId).toBe("ready");
      expect(contract.blockers, moduleId).toEqual([]);
    }
  });

  it("does not silently promote catalog, blocks or documentation before verified lifecycle", async () => {
    for (const moduleId of [
      "exercise-catalog",
      "training-blocks",
      "training-documentation",
    ]) {
      const contract = await json<ProductionContract>(
        `../../../modules/${moduleId}/appbasis.production.json`,
      );
      expect(contract.status, moduleId).toBe("blocked");
      expect(contract.blockers.length, moduleId).toBeGreaterThan(0);
      expect(contract.requirements?.lifecycle, moduleId).toBe("blocked");
      expect(contract.evidence?.lifecycle, moduleId).toEqual([]);
    }
  });

  it("keeps P1 approval separate from an actual legal/privacy/production release", async () => {
    const app = await json<ProductionContract>("../appbasis.production.json");
    const candidate = await json<{
      readonly runtimeActive: boolean;
      readonly legalApproval: boolean;
      readonly baseline: {
        readonly manifestMigrationCount: number;
        readonly declaredManifestTableCount: number;
        readonly previewVerifiedTableCount: number;
        readonly tableCount: number;
        readonly postExpiryRetry: string;
      };
    }>("../privacy/p01-operator-retention-candidate.json");
    const erasure = await json<{
      readonly currentSourceAuthority: {
        readonly markerRetentionDays: number;
        readonly postExpiryRetry: string;
      };
    }>("../privacy/athlete-deletion-recovery-policy.json");

    expect(app.status).toBe("blocked");
    expect(app.crossCutting).toMatchObject({
      privacy: "blocked",
      applicationLifecycle: "blocked",
      dataExport: "verified",
    });
    expect(candidate.runtimeActive).toBe(false);
    expect(candidate.legalApproval).toBe(false);
    expect(candidate.baseline).toMatchObject({
      manifestMigrationCount: 41,
      declaredManifestTableCount: 64,
      previewVerifiedTableCount: 66,
      tableCount: 66,
      postExpiryRetry: "deny",
    });
    expect(erasure.currentSourceAuthority).toMatchObject({
      markerRetentionDays: 35,
      postExpiryRetry: "deny",
    });
  });

  it("requires P02 code's guarded writer to remain explicitly opt-in until integrated", async () => {
    const code = await readFile(new URL(
      "../../../modules/exercise-catalog/src/postgres-repository.ts",
      import.meta.url,
    ), "utf8");
    const worker = await readFile(new URL(
      "../worker/index.ts", import.meta.url,
    ), "utf8");
    const helper = await readFile(new URL(
      "../worker/exercise-catalog-media-delete-confirmed.ts",
      import.meta.url,
    ), "utf8");

    // We do not claim the opt-in identity/subject gate is a runtime guarantee.
    expect(code).toContain('options.favoriteFenceMode ?? "legacy-unprotected"');
    expect(code).toContain('options.usageWriteMode ?? "legacy-unprotected"');
    expect(code).toContain("recordUsageForVerifiedSubject");
    expect(code).toContain("markPrincipalDeletedAndDeletePersonalCatalogData");
    // Already fixed in main: avoid duplicating the provider-confirmed DELETE.
    expect(worker).toContain("deleteUlcPrivateExerciseMediaWithConfirmation({");
    expect(helper).toContain("stillPresent = await store.get(exactKey");
    expect(helper).toContain('completed === true ? "deleted" : "unconfirmed"');
  });
});
