import { describe, expect, it } from "vitest";
import { isG046SandboxRuntimeBound } from "../worker/registration-calendar-sandbox-gate";

const sandboxURL = "https://appbasis-ulc-linz-g04-sandbox.sample-unit.workers.dev";
const url = (host: string, role: string) =>
  "postgresql://" + role + ":synthetic-secret@" + host + ":5432/appbasis_ulc_linz_preview?sslmode=require";
const sandboxHost = "ep-empty-frog-b187iuwz.c-5.eu-central-1.aws.neon.tech";
const sourceHost = "ep-green-resonance-b19c78rm.c-5.eu-central-1.aws.neon.tech";
const good = () => ({
  APPBASIS_BASE_URL: sandboxURL,
  APPBASIS_GENERATED_APP_ID: "ulc-linz",
  APPBASIS_RUNTIME_ENVIRONMENT: "generated-preview-ulc-linz",
  APPBASIS_REGISTRATION_CALENDAR_V17: "enabled",
  APPBASIS_G046_SANDBOX_BRANCH_ID: "br-falling-hat-b1lmifga",
  BETTER_AUTH_SECRET: "synthetic-secret-over-32-characters-long",
  HYPERDRIVE: { connectionString: url(sandboxHost, "appbasis_ulc_g046_application") },
  SECURITY_LOG_HYPERDRIVE: { connectionString: url(sandboxHost, "appbasis_ulc_g046_security_log") },
});
const request = (origin=sandboxURL) => new Request(origin + "/api/health/build");

describe("G-04.6 isolated Worker runtime origin and stage gate", () => {
  it("accepts only separately named sandbox Worker with explicit v17 activation", () => {
    expect(isG046SandboxRuntimeBound(request(), good())).toBe(true);
  });
  it("never activates in existing Preview, production or wrong branch", () => {
    const changes: Array<(x: ReturnType<typeof good>) => void> = [
      e => { e.APPBASIS_BASE_URL = "https://appbasis-ulc-linz-preview.sample-unit.workers.dev"; },
      e => { e.APPBASIS_GENERATED_APP_ID = "tasks"; },
      e => { e.APPBASIS_RUNTIME_ENVIRONMENT = "production"; },
      e => { e.APPBASIS_REGISTRATION_CALENDAR_V17 = "disabled"; },
      e => { e.APPBASIS_G046_SANDBOX_BRANCH_ID = "br-delicate-surf-b1eu6ikn"; },
      e => { e.BETTER_AUTH_SECRET = "short"; },
      e => { e.HYPERDRIVE.connectionString = url(sourceHost, "source"); },
      e => { e.SECURITY_LOG_HYPERDRIVE.connectionString = url(sourceHost, "security"); },
      e => { e.SECURITY_LOG_HYPERDRIVE.connectionString = e.HYPERDRIVE.connectionString; },
      e => { e.HYPERDRIVE.connectionString = "invalid"; },
    ];
    for (const change of changes) {
      const env=good(); change(env);
      expect(isG046SandboxRuntimeBound(request(), env)).toBe(false);
    }
    expect(isG046SandboxRuntimeBound(request("https://fake.test"), good())).toBe(false);
    expect(isG046SandboxRuntimeBound(request(), null)).toBe(false);
  });
});
