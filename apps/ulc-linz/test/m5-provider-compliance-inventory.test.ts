import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

type ProviderEvidenceStatus = "open";

type ProviderInventory = {
  schemaVersion: number;
  application: string;
  providerScope: Array<{
    id: string;
    responsibilities: string[];
    productionDatabaseRegionTarget?: string;
    appSpecificProductionEvidence: ProviderEvidenceStatus;
  }>;
  dataFlows: Array<{
    from: string;
    to: string;
    purpose: string;
    evidenceStatus: ProviderEvidenceStatus;
  }>;
  freshnessPolicy: {
    observedAtRequired: boolean;
    documentOrConfigurationReferenceRequired: boolean;
    appEnvironmentBindingRequired: boolean;
    validUntilOrReviewAtRequired: boolean;
    staleEvidence: "fail-closed";
  };
  m5: {
    dataRegion: "open";
    dpa: "open";
    encryption: "open";
    subprocessors: "open";
    providerScope: "cloudflare-and-neon-postgresql-only";
    unknownProvider: "fail-closed";
    missingEvidence: "fail-closed";
    foreignEnvironmentEvidence: "fail-closed";
    baselineIsProductionEvidence: false;
  };
};

type AppManifest = {
  appId: string;
};

const inventoryUrl = new URL(
  "../privacy/m5-provider-compliance-inventory.json",
  import.meta.url,
);
const appManifestUrl = new URL("../appbasis.app.json", import.meta.url);
const targetPolicyUrl = new URL(
  "../../../tooling/ulc-linz-m5-target-policy.mjs",
  import.meta.url,
);

async function readJson<T>(url: URL): Promise<T> {
  return JSON.parse(await readFile(url, "utf8")) as T;
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

describe("ULC Linz M5 G provider/compliance inventory", () => {
  it("binds the inventory to ULC and exactly the approved v0.1 provider scope", async () => {
    const [inventory, manifest] = await Promise.all([
      readJson<ProviderInventory>(inventoryUrl),
      readJson<AppManifest>(appManifestUrl),
    ]);

    expect(inventory.schemaVersion).toBe(1);
    expect(inventory.application).toBe("ulc-linz");
    expect(manifest.appId).toBe(inventory.application);
    expect(sorted(inventory.providerScope.map((provider) => provider.id))).toEqual([
      "cloudflare",
      "neon-postgresql",
    ]);

    const cloudflare = inventory.providerScope.find(
      (provider) => provider.id === "cloudflare",
    );
    const neon = inventory.providerScope.find(
      (provider) => provider.id === "neon-postgresql",
    );
    expect(cloudflare?.responsibilities).toEqual([
      "edge-runtime",
      "tls-termination",
      "worker-execution",
    ]);
    expect(neon?.responsibilities).toEqual(["primary-postgresql"]);

    expect(inventory.m5.providerScope).toBe("cloudflare-and-neon-postgresql-only");
    expect(inventory.m5.unknownProvider).toBe("fail-closed");
  });

  it("keeps provider baseline information separate from production readiness evidence", async () => {
    const inventory = await readJson<ProviderInventory>(inventoryUrl);

    expect(
      inventory.providerScope.every(
        (provider) => provider.appSpecificProductionEvidence === "open",
      ),
    ).toBe(true);
    expect(inventory.dataFlows.every((flow) => flow.evidenceStatus === "open")).toBe(true);
    expect(inventory.m5).toMatchObject({
      dataRegion: "open",
      dpa: "open",
      encryption: "open",
      subprocessors: "open",
      missingEvidence: "fail-closed",
      foreignEnvironmentEvidence: "fail-closed",
      baselineIsProductionEvidence: false,
    });
  });

  it("tracks the approved production database region target without claiming region verification", async () => {
    const [inventory, targetPolicySource] = await Promise.all([
      readJson<ProviderInventory>(inventoryUrl),
      readFile(targetPolicyUrl, "utf8"),
    ]);
    const neon = inventory.providerScope.find(
      (provider) => provider.id === "neon-postgresql",
    );

    expect(neon?.productionDatabaseRegionTarget).toBe("EU / Frankfurt");
    expect(targetPolicySource).toContain(
      'productionDatabaseRegionTarget: "EU / Frankfurt"',
    );
    expect(inventory.m5.dataRegion).toBe("open");
  });

  it("defines the minimal current data-flow inventory and the planned freshness fields", async () => {
    const inventory = await readJson<ProviderInventory>(inventoryUrl);

    expect(inventory.dataFlows).toEqual([
      {
        from: "ulc-linz-user",
        to: "cloudflare",
        purpose: "application-request-processing",
        evidenceStatus: "open",
      },
      {
        from: "cloudflare",
        to: "neon-postgresql",
        purpose: "application-persistence",
        evidenceStatus: "open",
      },
    ]);
    expect(inventory.freshnessPolicy).toEqual({
      observedAtRequired: true,
      documentOrConfigurationReferenceRequired: true,
      appEnvironmentBindingRequired: true,
      validUntilOrReviewAtRequired: true,
      staleEvidence: "fail-closed",
    });
  });
});
