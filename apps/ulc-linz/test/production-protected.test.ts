import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { protectedUlcProductionRuntimeOptions } from "../worker/production-protected";

describe("ULC production private protected entrypoint", () => {
  it("forces four production guards, retains credentials and stays immutable", () => {
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
      trainingSessionWriteGuardMode: "require-live-training-actor-transaction",
    });
    // Explicit production policy: never expose a private media store, even
    // when the source environment has a valid Cloudflare object binding.
    expect(options.exerciseCatalogMediaStore).toBeNull();
    expect(options.trainingSessionWriteGuardMode).toBe("require-live-training-actor-transaction");
    expect(options).not.toHaveProperty("registrationCalendarActivation");
    expect(Object.isFrozen(options)).toBe(true);
    expect(input.exerciseCatalogRuntimeMode).toBe("legacy");
    expect(input.exerciseCatalogMediaStore).toBe(mediaStore);
    expect(input.registrationCalendarActivation).toBe("isolated-preview-v17");
    expect(input.trainingSessionWriteGuardMode).toBe("require-live-training-actor-transaction");
  });

  it("does not inherit Preview guard modes or enable preview calendar and private media", () => {
    for (const preview of [
      "require-live-athlete-transaction",
      "require-live-athlete-group-transaction",
      "require-live-training-actor-transaction",
    ] as const) {
      const options = protectedUlcProductionRuntimeOptions({
        connectionString: "postgresql://app@example.test/neondb",
        securityLogConnectionString: "postgresql://log@example.test/neondb",
        baseURL: "https://private-ulc.example.test",
        secret: "S".repeat(32),
        trainingSessionWriteGuardMode: preview,
        registrationCalendarActivation: "isolated-preview-v17",
      });
      expect(options.trainingSessionWriteGuardMode).toBe("require-live-training-actor-transaction");
      expect(options).not.toHaveProperty("registrationCalendarActivation");
      expect(options.exerciseCatalogMediaStore).toBeNull();
    }
    const withoutPilot = protectedUlcProductionRuntimeOptions({
      connectionString: "postgresql://app@example.test/neondb",
      securityLogConnectionString: "postgresql://log@example.test/neondb",
      baseURL: "https://private-ulc.example.test",
      secret: "S".repeat(32),
    });
    expect(withoutPilot.trainingSessionWriteGuardMode).toBe("require-live-training-actor-transaction");
    expect(Object.isFrozen(withoutPilot)).toBe(true);
  });

  it("uses only server-resolved actor identity in all three write routes", () => {
    const http = readFileSync(new URL("../worker/index.ts", import.meta.url), "utf8");
    const session = readFileSync(new URL("../worker/training-session-postgres.ts", import.meta.url), "utf8");
    const mapping = readFileSync(new URL("../worker/training-write-http-error.ts", import.meta.url), "utf8");
    const actor = readFileSync(new URL("../worker/training-session-write-actor.ts", import.meta.url), "utf8");

    for (const target of [
      "runtime.kindertraining.saveSession(",
      "service.saveSession(access.organizationId, {",
      "runtime.u12.saveSession(",
    ]) {
      const start = http.indexOf(target);
      expect(start).toBeGreaterThan(-1);
      // The authenticated access service provides this argument, not
      // untrusted request JSON. The U14 route uses service alias.
      const call = http.slice(start, start + 1750);
      expect(call).toContain("access.actorPrincipalId");
      expect(call).not.toContain("trustedActorIdentityId:");
    }
    expect(session).toContain("authenticatedIdentityId: input.trustedActorIdentityId as string");
    expect(session).toContain("await assertUlcLiveTrainingWriterActor(this.#sql");
    expect(actor).toContain("FOR SHARE");
    expect(mapping).toContain("TRAINING_WRITE_ACCESS_CHANGED");
    expect(mapping).toContain("status: 403");
    expect(mapping).toContain("TRAINING_WRITE_SCOPE_CHANGED");
    expect(mapping).toContain("status: 409");
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
