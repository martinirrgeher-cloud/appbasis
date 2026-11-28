import { describe, expect, it } from "vitest";

import {
  standardExerciseCatalogProductionRuntimeOptions,
} from "../worker/production-exercise-catalog-standard";

describe("ULC exercise catalog production standard-module entrypoint", () => {
  it("uses guarded production writers and excludes personal private media without losing DB bindings", () => {
    const mediaStore = {
      put() {
        return Promise.resolve();
      },
      get() {
        return Promise.resolve(null);
      },
      delete() {
        return Promise.resolve();
      },
    };

    const options = standardExerciseCatalogProductionRuntimeOptions({
      connectionString: "postgresql://app@example.test/app",
      securityLogConnectionString:
        "postgresql://security@example.test/security",
      baseURL: "https://appbasis-ulc-linz-production.example.test",
      secret: "a".repeat(32),
      exerciseCatalogRuntimeMode: "legacy",
      trainingBlockUsageMode: "isolated-preview-verified-subject",
      trainingDocumentationRuntimeMode: undefined,
      exerciseCatalogMediaStore: mediaStore,
    });

    expect(options.exerciseCatalogRuntimeMode).toBe("standard-module-protected-production");
    expect(options.trainingBlockUsageMode).toBe("protected-production-verified-subject");
    expect(options.trainingDocumentationRuntimeMode).toBe("protected-production");
    // Private identifiable athlete images/videos stay unavailable even if an
    // object store was inadvertently provided by the Worker environment.
    expect(options.exerciseCatalogMediaStore).toBeNull();
    expect(options.connectionString).toBe(
      "postgresql://app@example.test/app",
    );
    expect(options.securityLogConnectionString).toBe(
      "postgresql://security@example.test/security",
    );
    expect(options.baseURL).toBe(
      "https://appbasis-ulc-linz-production.example.test",
    );
    expect(options.secret).toBe("a".repeat(32));
    expect(Object.isFrozen(options)).toBe(true);
  });

  it("never upgrades a caller's supplied preview or legacy mode in-place", () => {
    const supplied = Object.freeze({
      connectionString: "postgresql://pilot@example.test/neondb",
      securityLogConnectionString: "postgresql://security@example.test/neondb",
      baseURL: "https://ulc.example.test",
      secret: "b".repeat(32),
      exerciseCatalogRuntimeMode: "legacy-read-writes-blocked" as const,
      trainingBlockUsageMode: "isolated-preview-verified-subject" as const,
    });
    const opts = standardExerciseCatalogProductionRuntimeOptions(supplied);
    expect(supplied.exerciseCatalogRuntimeMode).toBe("legacy-read-writes-blocked");
    expect(supplied.trainingBlockUsageMode).toBe("isolated-preview-verified-subject");
    expect(opts.exerciseCatalogRuntimeMode).toBe("standard-module-protected-production");
    expect(opts.trainingBlockUsageMode).toBe("protected-production-verified-subject");
    expect(opts.trainingDocumentationRuntimeMode).toBe("protected-production");
    expect(opts.exerciseCatalogMediaStore).toBeNull();
    expect(opts.connectionString).toBe(supplied.connectionString);
    expect(Object.isFrozen(opts)).toBe(true);
  });
});
