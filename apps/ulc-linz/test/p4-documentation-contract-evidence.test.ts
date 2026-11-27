import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

type Evidence = { readonly path: string; readonly gitBlobSha: string };
type Module = {
  readonly moduleId: string;
  readonly status: string;
  readonly requirements: Record<"authorization" | "database" | "lifecycle", string>;
  readonly evidence: Record<"authorization" | "database" | "lifecycle", Evidence[]>;
  readonly blockers: string[];
};

const root = new URL("../../../", import.meta.url);
const load = async (path: string) => readFile(new URL(path, root));

describe("ULC P4 technical documentation evidence versus still blocked personal-data release", () => {
  it("pins real remote auth and PostgreSQL evidence while lifecycle/release remain blocked", async () => {
    const module = JSON.parse((await load(
      "modules/training-documentation/appbasis.production.json",
    )).toString()) as Module;

    expect(module.moduleId).toBe("training-documentation");
    expect(["blocked", "ready"]).toContain(module.status);
    expect(module.requirements.authorization).toBe("verified");
    expect(module.requirements.database).toBe("verified");
    expect(["blocked", "verified"]).toContain(module.requirements.lifecycle);
    if (module.status === "ready") expect(module.requirements.lifecycle).toBe("verified");
    expect(module.evidence.authorization.map(x => x.path)).toEqual([
      "modules/training-documentation/production-auth-evidence-20261123.md",
    ]);
    const authEvidence = (await load(module.evidence.authorization[0]!.path)).toString();
    expect(authEvidence).toContain("45260339171");
    expect(authEvidence).toContain("persistentDocWriteVerified=false");
    expect(authEvidence).toContain("does not");
    if (module.requirements.lifecycle === "verified") {
      expect(module.evidence.lifecycle.length).toBeGreaterThan(0);
    }
    expect(module.evidence.database.map(x => x.path)).toEqual([
      "modules/training-documentation/migrations/0000_appbasis_training_documentation_foundation.sql",
      "modules/training-documentation/migrations/0001_appbasis_training_documentation_subject_deletion.sql",
      "modules/training-documentation/test/postgres-repository.postgres.e2e.ts",
    ]);
    if (module.status === "blocked") expect(module.blockers.length).toBeGreaterThan(0);
    else expect(module.blockers).toEqual([]);
    for (const evidence of [...module.evidence.authorization, ...module.evidence.database,
      ...module.evidence.lifecycle]) {
      const data = await load(evidence.path);
      expect(createHash("sha1").update(`blob ${data.length}\0`).update(data).digest("hex"))
        .toBe(evidence.gitBlobSha);
    }
  });

  it("does not use the documented database result to approve app lifecycle, privacy or other modules", async () => {
    const app = JSON.parse((await load(
      "apps/ulc-linz/appbasis.production.json",
    )).toString()) as {
      status: string; crossCutting: Record<string, string>;
    };
    expect(["blocked", "ready"]).toContain(app.status);
    if (app.status === "ready") {
      expect(app.crossCutting.applicationLifecycle).toBe("verified");
      expect(app.crossCutting.privacy).toBe("verified");
    }
    for (const moduleId of ["exercise-catalog", "training-blocks"]) {
      const module = JSON.parse((await load(
        `modules/${moduleId}/appbasis.production.json`,
      )).toString()) as Module;
      expect(["blocked", "ready"]).toContain(module.status);
      if (module.status === "ready") {
        expect(module.requirements.lifecycle).toBe("verified");
        expect(module.evidence.lifecycle.length).toBeGreaterThan(0);
      } else {
        expect(module.requirements.lifecycle).toBe("blocked");
      }
    }
  });

  it("keeps protected M6 composition verification (not a CI flag) as the only complete production claim", async () => {
    const workflow = (await load(
      ".github/workflows/m6-ulc-production-composition-gate.yml",
    )).toString();
    expect(workflow).toContain(
      "node ./tooling/production-contract.mjs ulc-linz --require-ready",
    );
    expect(workflow).toContain("compositionReady !== true");
  });
});
