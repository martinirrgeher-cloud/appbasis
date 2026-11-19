import { describe, expect, it } from "vitest";

import {
  pilotTrainingGuardPreflightCode,
  pilotTrainingWriteGuardActivation,
} from "../worker/pilot-training-write-guard";

const app = "postgresql://appbasis_ulc_linz_preview_application:test@preview-db.example.test:5432/appbasis_ulc_linz_preview";
const log = "postgresql://appbasis_ulc_linz_preview_security_log:test@preview-db.example.test:5432/appbasis_ulc_linz_preview";
const sha = "a".repeat(40);
const approved = Object.freeze({
  APPBASIS_RUNTIME_ENVIRONMENT: "generated-preview-ulc-linz",
  APPBASIS_GENERATED_APP_ID: "ulc-linz",
  APPBASIS_BUILD_SHA: sha,
  APPBASIS_ULC_P03I_ORIGIN_ATTESTATION: `e6h-origin-checked:${sha}`,
  APPBASIS_ULC_PILOT_TRAINING_WRITE_GUARD: "p03i-preview",
});

describe("ULC pilot guard: attested Neon origin, opaque Hyperdrive proxy", () => {
  it("leaves normal and explicit-disabled mode unchanged without an attestation", () => {
    expect(pilotTrainingWriteGuardActivation({}, app, log)).toBe("disabled");
    expect(pilotTrainingWriteGuardActivation({
      ...approved, APPBASIS_ULC_PILOT_TRAINING_WRITE_GUARD: "disabled",
    }, app, log)).toBe("disabled");
    expect(pilotTrainingWriteGuardActivation({
      ...approved, APPBASIS_ULC_PILOT_TRAINING_WRITE_GUARD: undefined,
    }, app, log)).toBe("disabled");
  });

  it("requires the exact preview and a valid origin attestation bound to this build", () => {
    expect(pilotTrainingWriteGuardActivation(approved, app, log)).toBe("enabled");
    for (const wrong of [
      { ...approved, APPBASIS_RUNTIME_ENVIRONMENT: "production" },
      { ...approved, APPBASIS_RUNTIME_ENVIRONMENT: "generated-preview-other" },
      { ...approved, APPBASIS_GENERATED_APP_ID: "not-ulc" },
      { ...approved, APPBASIS_ULC_PILOT_TRAINING_WRITE_GUARD: true },
      { ...approved, APPBASIS_ULC_PILOT_TRAINING_WRITE_GUARD: "enabled" },
      { ...approved, APPBASIS_ULC_PILOT_TRAINING_WRITE_GUARD: "p03i-preview " },
      { ...approved, APPBASIS_ULC_PILOT_TRAINING_WRITE_GUARD: null },
      { ...approved, APPBASIS_ULC_P03I_ORIGIN_ATTESTATION: undefined },
      { ...approved, APPBASIS_ULC_P03I_ORIGIN_ATTESTATION: "e6h-origin-checked:" + "b".repeat(40) },
      { ...approved, APPBASIS_BUILD_SHA: "b".repeat(40) },
      { ...approved, APPBASIS_BUILD_SHA: "not-a-sha" },
    ]) {
      expect(pilotTrainingWriteGuardActivation(wrong, app, log)).toBe("invalid");
    }
  });

  it("accepts Cloudflare's dynamic proxy URLs without treating proxy user/database as Neon origin", () => {
    const proxyApp = "postgresql://dynamic-proxy-user:p1@app-proxy.internal.test:5432/hyperdrive";
    const proxyLog = "postgresql://another-proxy-user:p2@log-proxy.internal.test:5432/hyperdrive";
    expect(pilotTrainingWriteGuardActivation(approved, proxyApp, proxyLog)).toBe("enabled");
    expect(pilotTrainingWriteGuardActivation(approved, app, proxyLog)).toBe("enabled");
    expect(pilotTrainingGuardPreflightCode(
      { ...approved, APPBASIS_ULC_PILOT_TRAINING_WRITE_GUARD: "disabled" },
      proxyApp, proxyLog,
    )).toBe("READY");
  });

  it("still fails closed on malformed/missing or identical Hyperdrive transport bindings", () => {
    for (const [one, two] of [
      ["not a database URL", log],
      [app, "not a database URL"],
      ["https://app-proxy.test/postgres", log],
      [app, "postgresql:///missing-host"],
      ["postgresql://:x@app-proxy.test/test", log],
      [app, "postgresql://x:y@log-proxy.test/"],
      [app, app],
    ] as const) {
      expect(pilotTrainingWriteGuardActivation(approved, one, two)).toBe("invalid");
    }
  });

  it("read-only preflight classifies only safe diagnostic codes and never changes the flag", () => {
    const disabled = { ...approved, APPBASIS_ULC_PILOT_TRAINING_WRITE_GUARD: "disabled" };
    expect(pilotTrainingGuardPreflightCode(disabled, app, log)).toBe("READY");
    expect(pilotTrainingGuardPreflightCode(
      { ...disabled, APPBASIS_RUNTIME_ENVIRONMENT: "production" }, app, log,
    )).toBe("PREVIEW_SCOPE");
    expect(pilotTrainingGuardPreflightCode(
      { ...disabled, APPBASIS_ULC_P03I_ORIGIN_ATTESTATION: undefined }, app, log,
    )).toBe("ORIGIN_NOT_ATTESTED");
    expect(pilotTrainingGuardPreflightCode(disabled, null, log)).toBe("APP_PROXY_FORMAT");
    expect(pilotTrainingGuardPreflightCode(disabled, app, null)).toBe("SECURITY_PROXY_FORMAT");
    expect(pilotTrainingGuardPreflightCode(disabled, app, app)).toBe("PROXY_BINDINGS_IDENTICAL");
    expect(pilotTrainingWriteGuardActivation(disabled, app, log)).toBe("disabled");
  });
});
