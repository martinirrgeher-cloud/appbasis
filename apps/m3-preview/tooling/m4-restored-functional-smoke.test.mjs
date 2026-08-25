import assert from "node:assert/strict";
import test from "node:test";

import { safeRestoreSmokeError } from "./m4-restored-functional-smoke-error.mjs";

test("safeRestoreSmokeError preserves structured diagnostics and redacts sensitive values", () => {
  const root = Object.assign(
    new Error(
      "Failed query: select * from user where email = $1\nparams: super-secret-password\npostgresql://user:password@example.invalid/appbasis_m3_preview?sslmode=require&token=abc123",
    ),
    { code: "DRIZZLE_QUERY_ERROR" },
  );
  root.cause = Object.assign(new Error("permission denied for relation user"), {
    code: "42501",
    severity: "ERROR",
    routine: "aclcheck_error",
  });

  const output = safeRestoreSmokeError(root);

  assert.match(output, /code=DRIZZLE_QUERY_ERROR/);
  assert.match(output, /code=42501/);
  assert.match(output, /severity=ERROR/);
  assert.match(output, /routine=aclcheck_error/);
  assert.match(output, /params: \[REDACTED\]/);
  assert.match(output, /\[REDACTED_DATABASE_URL\]/);
  assert.doesNotMatch(output, /super-secret-password/);
  assert.doesNotMatch(output, /password@example\.invalid/);
  assert.doesNotMatch(output, /abc123/);
});

test("safeRestoreSmokeError terminates cyclic cause chains", () => {
  const error = new Error("outer");
  error.cause = error;
  assert.equal(safeRestoreSmokeError(error), "Error | outer");
});
