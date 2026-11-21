import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SCRIPT = fileURLToPath(new URL(
  "../tooling/google-drive-oauth-probe.mjs",
  import.meta.url,
));

describe("P04-D Node CLI entrypoint must fail closed without manual OAuth grant", () => {
  it("runs the genuine CLI and returns only an unpersonalized approval-required result", () => {
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (!key.startsWith("ULC_BACKUP_") && value !== undefined) {
        env[key] = value;
      }
    }
    const run = spawnSync(process.execPath, [SCRIPT], {
      env,
      encoding: "utf8",
      timeout: 5_000,
      maxBuffer: 1_000_000,
    });
    expect(run.error).toBeUndefined();
    expect(run.status).toBe(1);
    expect(run.stderr.trim()).toBe("");
    expect(run.stdout.trim()).toBe(JSON.stringify({
      status: "blocked",
      reason: "operator-approval-required",
      backupEnabled: false,
      uploadEnabled: false,
    }));
  });
});
