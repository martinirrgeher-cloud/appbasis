import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

async function workflow(): Promise<string> {
  return readFile(
    new URL("../../../.github/workflows/ulc-drive-oauth-readonly-preflight.yml", import.meta.url),
    "utf8",
  );
}

describe("P04-D manual Google OAuth workflow security contract", () => {
  it("runs only by operator-dispatched main-branch first attempt", async () => {
    const text = await workflow();
    expect(text).toContain("workflow_dispatch:");
    expect(text).toContain("approve_readonly:");
    expect(text).toContain("default: false");
    expect(text).toContain("github.ref == 'refs/heads/main'");
    expect(text).toContain("github.run_attempt == 1");
    expect(text).toContain("inputs.approve_readonly == true");
    expect(text).not.toMatch(/^\s+schedule:/m);
    expect(text).not.toMatch(/^\s+push:/m);
    expect(text).not.toMatch(/^\s+pull_request:/m);
    expect(text).not.toContain("cron:");
  });

  it("has read-only GitHub permissions and never runs a backup writer", async () => {
    const text = await workflow();
    expect(text).toContain("contents: read");
    expect(text).toContain("persist-credentials: false");
    expect(text).toContain("ULC_BACKUP_OAUTH_READONLY_APPROVED: '1'");
    expect(text).toContain("node ./apps/ulc-linz/tooling/google-drive-oauth-probe.mjs");
    expect(text).not.toContain("pg_dump ");
    expect(text).not.toContain("drive/v3/files?uploadType");
    expect(text).not.toContain("post-deploy");
    expect(text).not.toContain("ULC_BACKUP_DATABASE_URL");
    expect(text).not.toContain("ULC_BACKUP_AGE_PRIVATE_KEY");
  });

  it("reads only references to three Actions secrets, never their values", async () => {
    const text = await workflow();
    for (const name of [
      "ULC_BACKUP_GOOGLE_CLIENT_ID",
      "ULC_BACKUP_GOOGLE_CLIENT_SECRET",
      "ULC_BACKUP_GOOGLE_REFRESH_TOKEN",
    ]) {
      expect(text).toContain("secrets." + name);
    }
    expect(text).not.toContain("github.event.pull_request");
  });
});
