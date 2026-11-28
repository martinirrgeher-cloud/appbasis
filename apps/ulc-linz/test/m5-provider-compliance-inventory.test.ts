import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

type ProviderEvidenceStatus = "open" | "verified";
type EvidenceReceipt = {
  observedAt: string;
  validUntilOrReviewAt: string;
  appEnvironment: "ulc-linz-production";
  reference: string;
  accountBindingReference: string;
};
function currentUtc(value: unknown): value is string {
  if (typeof value !== "string" || value.length !== 24 || !value.endsWith("Z")) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}
function sourceUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.includes(".") &&
      url.username === "" && url.password === "" && url.pathname.length > 1;
  } catch {
    return false;
  }
}
function hasCurrentEvidence(records: readonly EvidenceReceipt[] | undefined) {
  if (!Array.isArray(records) || records.length === 0) return false;
  const now = Date.now();
  return records.every(record => {
    if (!record || record.appEnvironment !== "ulc-linz-production" ||
        !sourceUrl(record.reference) || !sourceUrl(record.accountBindingReference) ||
        !currentUtc(record.observedAt) || !currentUtc(record.validUntilOrReviewAt)) return false;
    const observed = new Date(record.observedAt).getTime();
    const end = new Date(record.validUntilOrReviewAt).getTime();
    return observed <= now && end > now && end > observed;
  });
}

type ProviderInventory = {
  schemaVersion: number;
  application: string;
  providerScope: Array<{
    id: string;
    responsibilities: string[];
    productionDatabaseRegionTarget?: string;
    appSpecificProductionEvidence: ProviderEvidenceStatus;
    evidence?: EvidenceReceipt[];
  }>;
  dataFlows: Array<{
    from: string;
    to: string;
    purpose: string;
    evidenceStatus: ProviderEvidenceStatus;
    evidence?: EvidenceReceipt[];
    predeployment?: {
      evidenceStatus: ProviderEvidenceStatus;
      operationalDisposition: string;
      scope: string;
      evidence?: EvidenceReceipt[];
    };
  }>;
  productionEvidence?: Partial<Record<"dataRegion" | "dpa" | "encryption" | "subprocessors", EvidenceReceipt[]>>;
  freshnessPolicy: {
    observedAtRequired: boolean;
    documentOrConfigurationReferenceRequired: boolean;
    appEnvironmentBindingRequired: boolean;
    validUntilOrReviewAtRequired: boolean;
    staleEvidence: "fail-closed";
  };
  m5: {
    dataRegion: ProviderEvidenceStatus;
    dpa: ProviderEvidenceStatus;
    encryption: ProviderEvidenceStatus;
    subprocessors: ProviderEvidenceStatus;
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
      "hyperdrive-database-connectivity",
      "tls-termination",
      "worker-execution",
    ]);
    expect(neon?.responsibilities).toEqual(["primary-postgresql"]);

    expect(inventory.m5.providerScope).toBe("cloudflare-and-neon-postgresql-only");
    expect(inventory.m5.unknownProvider).toBe("fail-closed");
  });

  it("permits production verified only with fresh, app-bound private evidence references", async () => {
    const inventory = await readJson<ProviderInventory>(inventoryUrl);

    for (const provider of inventory.providerScope) {
      expect(["open", "verified"]).toContain(provider.appSpecificProductionEvidence);
      if (provider.appSpecificProductionEvidence === "verified") {
        expect(hasCurrentEvidence(provider.evidence), provider.id).toBe(true);
      }
    }
    for (const flow of inventory.dataFlows) {
      expect(["open", "verified"]).toContain(flow.evidenceStatus);
      if (flow.evidenceStatus === "verified") {
        expect(hasCurrentEvidence(flow.evidence), flow.purpose).toBe(true);
      }
    }
    for (const key of ["dataRegion", "dpa", "encryption", "subprocessors"] as const) {
      expect(["open", "verified"]).toContain(inventory.m5[key]);
      if (inventory.m5[key] === "verified") {
        expect(hasCurrentEvidence(inventory.productionEvidence?.[key]), key).toBe(true);
      }
    }
    expect(inventory.m5).toMatchObject({
      missingEvidence: "fail-closed",
      foreignEnvironmentEvidence: "fail-closed",
      baselineIsProductionEvidence: false,
    });
  });

  it("binds standard DPA, encryption and subprocessor evidence to both named production accounts without pretending legal or runtime GO", async () => {
    const inventory = await readJson<ProviderInventory & {
      standardProviderEvidenceLimits: {
        assessedFor: string;
        dpa: string;
        encryption: string;
        subprocessors: string;
        stillOpen: string;
        legalApprovalNotIncluded: boolean;
        reviewedSourceDate: string;
      };
    }>(inventoryUrl);
    const requiredDomains = ["dpa", "encryption", "subprocessors"] as const;
    for (const domain of requiredDomains) {
      expect(inventory.m5[domain], domain).toBe("verified");
      const receipts = inventory.productionEvidence?.[domain] ?? [];
      expect(hasCurrentEvidence(receipts), domain).toBe(true);
      expect(receipts.some((r) => r.accountBindingReference.includes("7220724216")), domain).toBe(true);
      expect(receipts.some((r) => r.accountBindingReference.includes("7220996997")), domain).toBe(true);
    }
    expect(inventory.standardProviderEvidenceLimits.legalApprovalNotIncluded).toBe(true);
    expect(inventory.standardProviderEvidenceLimits.dpa).toContain("NOT an individual legal-operator signoff");
    expect(inventory.standardProviderEvidenceLimits.encryption).toContain("NOT an end-to-end measurement");
    expect(inventory.standardProviderEvidenceLimits.subprocessors).toContain("NOT a claim");
    expect(inventory.standardProviderEvidenceLimits.stillOpen).toContain("remain open");
    // Scope is intentionally not an unproved global EU-only or live data-flow attestation.
    expect(inventory.m5.dataRegion).toBe("open");
    expect(inventory.dataFlows.every((flow) => flow.evidenceStatus === "open")).toBe(true);
  });

  it("classifies six predeployment source/STOP flows without asserting real traffic", async () => {
    const inventory = await readJson<ProviderInventory>(inventoryUrl);
    const dispositions = [
      "t11-first-live", "t11-first-live", "t11-first-live",
      "out-of-app-runtime-read-only-source", "out-of-app-runtime-read-only-source",
      "quarantine-no-promotion",
    ];
    expect(inventory.dataFlows).toHaveLength(dispositions.length);
    for (const [i, flow] of inventory.dataFlows.entries()) {
      // Real HTTP, data writes, log writes and backup recovery are NOT asserted pre-go.
      expect(flow.evidenceStatus, flow.purpose).toBe("open");
      expect(flow.predeployment?.evidenceStatus, flow.purpose).toBe("verified");
      expect(flow.predeployment?.operationalDisposition, flow.purpose).toBe(dispositions[i]);
      expect(flow.predeployment?.scope.length ?? 0, flow.purpose).toBeGreaterThan(20);
      expect(hasCurrentEvidence(flow.predeployment?.evidence), flow.purpose).toBe(true);
    }
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
    expect(["open", "verified"]).toContain(inventory.m5.dataRegion);
  });

  it("defines the complete current M5-G operational data-flow inventory and freshness fields", async () => {
    const inventory = await readJson<ProviderInventory>(inventoryUrl);

    expect(inventory.dataFlows.map(({ from, to, purpose }) => ({ from, to, purpose })))
      .toEqual([
        { from: "ulc-linz-user", to: "cloudflare", purpose: "application-request-processing" },
        { from: "cloudflare", to: "neon-postgresql", purpose: "application-persistence" },
        { from: "cloudflare", to: "neon-postgresql", purpose: "security-log-persistence" },
        { from: "appbasis-control-plane", to: "cloudflare", purpose: "provider-evidence-read" },
        { from: "appbasis-control-plane", to: "neon-postgresql", purpose: "provider-evidence-read" },
        { from: "neon-postgresql", to: "neon-postgresql", purpose: "managed-backup-recovery" },
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
