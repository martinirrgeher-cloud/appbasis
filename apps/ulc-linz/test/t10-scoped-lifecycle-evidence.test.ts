import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { protectedUlcProductionRuntimeOptions } from "../worker/production-protected";

const root = new URL("../../../", import.meta.url);
const pilotModules = Object.freeze([
  "countdown", "athletes", "exercise-catalog",
  "training-blocks", "training-plans", "training-documentation",
]);

type Contract = {
  status: "ready" | "blocked";
  requirements?: Record<string, "verified" | "blocked" | "not-applicable">;
  crossCutting?: Record<string, "verified" | "blocked" | "not-applicable">;
  evidence: Record<string, readonly { path: string; gitBlobSha: string }[]>;
};
async function file(path: string) {
  return readFile(new URL(path, root), "utf8");
}
async function json<T>(path: string): Promise<T> {
  return JSON.parse(await file(path)) as T;
}
async function matchesExactBlob(entry: { path: string; gitBlobSha: string }) {
  const value = await file(entry.path);
  return createHash("sha1").update("blob " + Buffer.byteLength(value) + "\0")
    .update(value).digest("hex") === entry.gitBlobSha;
}

describe("T10 protected six-module pilot – lifecycle and privacy boundaries", () => {
  it("pins all six lifecycle evidence sources to exact file contents", async () => {
    for (const module of pilotModules) {
      const contract = await json<Contract>(`modules/${module}/appbasis.production.json`);
      expect(contract.status, module).toBe("ready");
      expect(["verified", "not-applicable"]).toContain(contract.requirements?.lifecycle);
      if (contract.requirements?.lifecycle === "verified") {
        expect(contract.evidence.lifecycle?.length ?? 0, module).toBeGreaterThan(0);
      } else {
        // Countdown is intentionally stateless and has no lifecycle owner.
        expect(module).toBe("countdown");
        expect(contract.evidence.lifecycle).toEqual([]);
      }
      for (const item of contract.evidence.lifecycle) {
        expect(item.path.startsWith(`modules/${module}/`), item.path).toBe(true);
        expect(await matchesExactBlob(item), item.path).toBe(true);
      }
    }
  });

  it("requires protected production writers, no media store and no preview flags", async () => {
    const runtime = protectedUlcProductionRuntimeOptions({
      connectionString: "postgresql://application@example.test/neondb",
      securityLogConnectionString: "postgresql://security@example.test/neondb",
      baseURL: "https://pilot.example.test",
      secret: "s".repeat(32),
      exerciseCatalogRuntimeMode: "legacy",
      registrationCalendarActivation: "isolated-preview-v17",
      trainingSessionWriteGuardMode: "require-live-athlete-transaction",
      trainingBlockUsageMode: "isolated-preview-verified-subject",
      exerciseCatalogMediaStore: {
        put: async () => undefined,
        get: async () => null,
        delete: async () => undefined,
      },
    });
    expect(runtime.exerciseCatalogRuntimeMode).toBe("standard-module-protected-production");
    expect(runtime.trainingBlockUsageMode).toBe("protected-production-verified-subject");
    expect(runtime.trainingDocumentationRuntimeMode).toBe("protected-production");
    expect(runtime.trainingSessionWriteGuardMode).toBe("require-live-training-actor-transaction");
    expect(runtime.exerciseCatalogMediaStore).toBeNull();
    expect(runtime.registrationCalendarActivation).toBeUndefined();
  });

  it("never converts lifecycle evidence into a legal, provider or deployment GO", async () => {
    const app = await json<Contract>("apps/ulc-linz/appbasis.production.json");
    const legal = await json<{legalApproval: boolean}>(
      "apps/ulc-linz/privacy/t10-current-production-legal-decision.json",
    );
    expect(app.crossCutting?.applicationLifecycle).toBe("verified");
    for (const entry of app.evidence.applicationLifecycle) {
      expect(await matchesExactBlob(entry), entry.path).toBe(true);
    }
    if (app.status === "ready") {
      expect(app.crossCutting?.privacy).toBe("verified");
      expect(legal.legalApproval).toBe(true);
    }
  });
});
