import { describe, expect, it } from "vitest";

import { pilotTrainingGuardPreflightCode, pilotTrainingWriteGuardActivation } from "../worker/pilot-training-write-guard";

const app = "postgresql://appbasis_ulc_linz_preview_application:test@preview-db.example.test:5432/appbasis_ulc_linz_preview";
const log = "postgresql://appbasis_ulc_linz_preview_security_log:test@preview-db.example.test:5432/appbasis_ulc_linz_preview";
const approved = Object.freeze({
  APPBASIS_RUNTIME_ENVIRONMENT: "generated-preview-ulc-linz",
  APPBASIS_GENERATED_APP_ID: "ulc-linz",
  APPBASIS_ULC_PILOT_TRAINING_WRITE_GUARD: "p03i-preview",
});

describe("ULC pilot write guard: exact Preview operator switch", () => {
  it("remains disabled by default and with the explicit disabled value", () => {
    expect(pilotTrainingWriteGuardActivation({}, app, log)).toBe("disabled");
    expect(pilotTrainingWriteGuardActivation({
      ...approved, APPBASIS_ULC_PILOT_TRAINING_WRITE_GUARD: "disabled",
    }, app, log)).toBe("disabled");
  });

  it("accepts only the matching Preview runtime, application and distinct log roles", () => {
    expect(pilotTrainingWriteGuardActivation(approved, app, log)).toBe("enabled");
    for (const wrong of [
      { ...approved, APPBASIS_RUNTIME_ENVIRONMENT: "production" },
      { ...approved, APPBASIS_RUNTIME_ENVIRONMENT: "generated-preview-other" },
      { ...approved, APPBASIS_GENERATED_APP_ID: "not-ulc" },
      { ...approved, APPBASIS_ULC_PILOT_TRAINING_WRITE_GUARD: true },
      { ...approved, APPBASIS_ULC_PILOT_TRAINING_WRITE_GUARD: "enabled" },
      { ...approved, APPBASIS_ULC_PILOT_TRAINING_WRITE_GUARD: "p03i-preview " },
      { ...approved, APPBASIS_ULC_PILOT_TRAINING_WRITE_GUARD: null },
    ]) {
      expect(pilotTrainingWriteGuardActivation(wrong, app, log)).toBe("invalid");
    }
  });

  it("blocks wrong database, privileged role and port instead of legacy fallback", () => {
    const unsafeConnections = [
      ["postgresql://appbasis_ulc_linz_preview_application:test@preview-db.example.test/neondb",log],
      [app,"postgresql://appbasis_ulc_linz_preview_security_log:test@preview-db.example.test/ulc_linz_k2_restore_quarantine"],
      ["postgresql://ulc_linz_k2_restore_owner:test@preview-db.example.test/appbasis_ulc_linz_preview",log],
      [app,"postgresql://appbasis_ulc_linz_preview_application:test@preview-db.example.test/appbasis_ulc_linz_preview"],
      ["postgresql://appbasis_ulc_linz_preview_application:test@preview-db.example.test:5433/appbasis_ulc_linz_preview",log],
      [app,"postgresql://appbasis_ulc_linz_preview_security_log:test@preview-db.example.test:5434/appbasis_ulc_linz_preview"],
    ] as const;
    for(const [one,two] of unsafeConnections)
      expect(pilotTrainingWriteGuardActivation(approved,one,two)).toBe("invalid");
  });

  it("accepts distinct Hyperdrive proxy hosts after separately attested origin pairing", () => {
    const separateProxy = "postgresql://appbasis_ulc_linz_preview_security_log:test@security-log-proxy.example.test:5432/appbasis_ulc_linz_preview";
    // The deploy preflight attests origin endpoint equality using the Neon
    // source URLs. These are runtime Hyperdrive proxy addresses, not origins.
    expect(pilotTrainingWriteGuardActivation(approved, app, separateProxy)).toBe("enabled");
    expect(pilotTrainingWriteGuardActivation(
      approved,
      "postgresql://appbasis_ulc_linz_preview_application:test@app-proxy.example.test/appbasis_ulc_linz_preview",
      separateProxy,
    )).toBe("enabled");
    expect(pilotTrainingWriteGuardActivation(
      { ...approved, APPBASIS_GENERATED_APP_ID: "other-app" }, app, separateProxy,
    )).toBe("invalid");
  });

  it("rejects malformed connection identities and accepts URL-encoded valid identities", () => {
    expect(pilotTrainingWriteGuardActivation(approved, "not a database URL", log)).toBe("invalid");
    expect(pilotTrainingWriteGuardActivation(approved, app, "not a database URL")).toBe("invalid");
    expect(pilotTrainingWriteGuardActivation(
      approved,
      "postgresql://appbasis_ulc_linz_preview_application:test@preview-db.example.test/appbasis_ulc_linz_preview",
      "postgresql://appbasis_ulc_linz_preview_security_log:test@preview-db.example.test/appbasis_ulc_linz_preview",
    )).toBe("enabled");
  });
  it("read-only preflight predicts enablement and redacts actual binding identities", () => {
    const activePreview = { ...approved, APPBASIS_ULC_PILOT_TRAINING_WRITE_GUARD: "disabled" };
    expect(pilotTrainingGuardPreflightCode(activePreview, app, log)).toBe("READY");
    expect(pilotTrainingGuardPreflightCode(
      { ...activePreview, APPBASIS_RUNTIME_ENVIRONMENT: "production" }, app, log,
    )).toBe("PREVIEW_SCOPE");
    expect(pilotTrainingGuardPreflightCode(activePreview, null, log)).toBe("APP_PROXY_FORMAT");
    expect(pilotTrainingGuardPreflightCode(activePreview, app, null)).toBe("SECURITY_PROXY_FORMAT");
    expect(pilotTrainingGuardPreflightCode(
      activePreview, app.replace("/appbasis_ulc_linz_preview", "/neondb"), log,
    )).toBe("PROXY_DATABASE");
    expect(pilotTrainingGuardPreflightCode(
      activePreview, app.replace("preview_application", "preview_migration"), log,
    )).toBe("PROXY_ROLE");
    expect(pilotTrainingWriteGuardActivation(activePreview, app, log)).toBe("disabled");
  });

});
