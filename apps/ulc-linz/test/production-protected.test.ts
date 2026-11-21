import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { protectedUlcProductionRuntimeOptions } from "../worker/production-protected";

describe("ULC production private protected entrypoint", () => {
  it("forces all three production guards, retains credentials and stays immutable", () => {
    const mediaStore = {
      put: () => Promise.resolve(),
      get: () => Promise.resolve(null),
      delete: () => Promise.resolve(),
    };
    const input = {
      connectionString: "postgresql://app@example.test/neondb",
      securityLogConnectionString: "postgresql://log@example.test/neondb",
      baseURL: "https://private-ulc.example.test",
      secret: "S".repeat(32),
      exerciseCatalogMediaStore: mediaStore,
      exerciseCatalogRuntimeMode: "legacy" as const,
      trainingSessionWriteGuardMode: "require-live-training-actor-transaction" as const,
      registrationCalendarActivation: "isolated-preview-v17" as const,
    };
    const options = protectedUlcProductionRuntimeOptions(input);
    expect(options).toMatchObject({
      connectionString: input.connectionString,
      securityLogConnectionString: input.securityLogConnectionString,
      baseURL: input.baseURL,
      secret: input.secret,
      exerciseCatalogRuntimeMode: "standard-module-protected-production",
      trainingBlockUsageMode: "protected-production-verified-subject",
      trainingDocumentationRuntimeMode: "protected-production",
    });
    // Explicit production policy: never expose a private media store, even
    // when the source environment has a valid Cloudflare object binding.
    expect(options.exerciseCatalogMediaStore).toBeNull();
    expect(options).not.toHaveProperty("trainingSessionWriteGuardMode");
    expect(options).not.toHaveProperty("registrationCalendarActivation");
    expect(Object.isFrozen(options)).toBe(true);
    expect(input.exerciseCatalogRuntimeMode).toBe("legacy");
    expect(input.exerciseCatalogMediaStore).toBe(mediaStore);
    expect(input.registrationCalendarActivation).toBe("isolated-preview-v17");
    expect(input.trainingSessionWriteGuardMode).toBe("require-live-training-actor-transaction");
  });

  it("uses the protected entrypoint only for the existing private production refresh", () => {
    const workflow = readFileSync(
      new URL(
        "../../../.github/workflows/m6-ulc-production-runtime-refresh-config.yml",
        import.meta.url,
      ),
      "utf8",
    );
    expect(workflow).toContain(
      "entrypoint: './worker/production-protected.ts'",
    );
    expect(workflow).not.toContain(
      "entrypoint: './worker/index.ts'",
    );
    expect(workflow).toContain('test "$GITHUB_REF" = "refs/heads/main"');
    expect(workflow).toContain("REFRESH-CONFIGURE-ULC-PRODUCTION-RUNTIME");
  });
});
