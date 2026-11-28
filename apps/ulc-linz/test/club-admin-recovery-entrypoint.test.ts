import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("Protected ULC admin recovery Node entrypoints", () => {
  it("serializes on the target without forbidden UPDATE locks on append-only audit", () => {
    const source = readFileSync(
      new URL("../tooling/recover-production-club-admin-password.mjs", import.meta.url),
      "utf8",
    );
    expect(source).toContain("FOR UPDATE OF u,s,m,a");
    expect(source).toContain("FROM ulc_linz_operations.club_admin_recovery_audit");
    expect(source).toContain("ORDER BY created_at DESC, operation_id DESC LIMIT 1");
    expect(source).not.toContain("ORDER BY created_at DESC, operation_id DESC LIMIT 1 FOR UPDATE");
  });

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
