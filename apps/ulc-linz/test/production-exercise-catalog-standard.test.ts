import { describe, expect, it } from "vitest";

import {
  standardExerciseCatalogProductionRuntimeOptions,
} from "../worker/production-exercise-catalog-standard";

describe("ULC exercise catalog production standard-module entrypoint", () => {
  it("forces the standard-module runtime without dropping production bindings", () => {
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
      exerciseCatalogMediaStore: mediaStore,
    });

    expect(options.exerciseCatalogRuntimeMode).toBe("standard-module");
    expect(options.exerciseCatalogMediaStore).toBe(mediaStore);
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
});
