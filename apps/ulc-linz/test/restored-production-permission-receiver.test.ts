import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const restoredProductionTestUrl = new URL(
  "./restored-production.postgres.e2e.test.ts",
  import.meta.url,
);

describe("ULC M5 restored production permission receiver", () => {
  it("keeps the optional permission evaluator bound to its runtime store", async () => {
    const source = await readFile(restoredProductionTestUrl, "utf8");

    expect(source).toContain(
      "const permissionAllowed = await evaluatePermission.call(runtime.permissions, {",
    );
    expect(source).not.toMatch(
      /const permissionAllowed = await evaluatePermission\(\{/,
    );
  });
});
