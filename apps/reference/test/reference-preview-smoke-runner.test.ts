import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const runner = readFileSync(
  fileURLToPath(new URL("../../../tooling/reference-preview-smoke.mjs", import.meta.url)),
  "utf8",
);

describe("Reference preview smoke runner", () => {
  it("preserves configured credentials without normalization", () => {
    const helperStart = runner.indexOf("function optionalCredential(value)");
    expect(helperStart).toBeGreaterThanOrEqual(0);
    const helper = runner.slice(helperStart);
    expect(helper).toContain("return value;");
    expect(helper).not.toContain("return value.trim();");
  });

  it("keeps failure diagnostics non-sensitive but actionable", () => {
    expect(runner).toContain("safeErrorCode(payload)");
    expect(runner).toContain("returned HTTP ${response.status}");
    expect(runner).not.toContain("payload.error.message");
  });
});
