import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("Protected ULC admin recovery Node entrypoints", () => {
  it("loads the actual recovery script and installer through the pnpm Node 24 runtime", () => {
    // This would have caught the original Codex P1: better-auth is NOT
    // a direct dependency of apps/ulc-linz. Do not run the CLI actions.
    const cwd = fileURLToPath(new URL("../", import.meta.url));
    const script = [
      "import('./tooling/recover-production-club-admin-password.mjs')",
      "  .then(m => { if(typeof m.recoverProductionClubAdminPassword!=='function') throw Error('missing recovery') })",
      "  .then(() => import('./tooling/install-production-club-admin-recovery.mjs'))",
      "  .then(m => { if(typeof m.installUlcClubAdminRecovery!=='function') throw Error('missing installer') })",
    ].join("\n");
    const output = execFileSync(
      process.execPath,
      [
        "--experimental-transform-types",
        "--import", "./tooling/register-native-typescript-resolution.mjs",
        "--input-type=module",
        "--eval", script,
      ],
      {
        cwd,
        timeout: 30_000,
        encoding: "utf8",
        env: { ...process.env, ULC_LINZ_PRODUCTION_DATABASE_URL: "" },
      },
    );
    expect(output.trim()).toBe("");
  });
});
