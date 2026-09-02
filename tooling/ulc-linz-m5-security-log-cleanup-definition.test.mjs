import assert from "node:assert/strict";
import test from "node:test";

import { isExactCleanupFunctionDefinition } from "./ulc-linz-m5-security-log-access-evidence.mjs";

const exactDefinition = `CREATE OR REPLACE FUNCTION public.appbasis_ulc_linz_purge_expired_security_events()
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  deleted_rows bigint;
BEGIN
  DELETE FROM public.ulc_linz_security_event_log
  WHERE retained_until < statement_timestamp();
  GET DIAGNOSTICS deleted_rows = ROW_COUNT;
  RETURN deleted_rows;
END
$function$
`;

test("accepts the exact canonical cleanup body", () => {
  assert.equal(isExactCleanupFunctionDefinition(exactDefinition), true);
});

test("rejects cleanup bodies that can delete non-expired rows", () => {
  for (const replacement of [
    "WHERE retained_until < statement_timestamp() OR true;",
    "WHERE retained_until <= statement_timestamp();",
    "WHERE true;",
  ]) {
    const drifted = exactDefinition.replace(
      "WHERE retained_until < statement_timestamp();",
      replacement,
    );
    assert.equal(isExactCleanupFunctionDefinition(drifted), false);
  }
});

test("rejects cleanup bodies with additional mutation paths", () => {
  const extraDelete = exactDefinition.replace(
    "GET DIAGNOSTICS deleted_rows = ROW_COUNT;",
    "DELETE FROM public.ulc_linz_security_event_log;\n  GET DIAGNOSTICS deleted_rows = ROW_COUNT;",
  );
  assert.equal(isExactCleanupFunctionDefinition(extraDelete), false);
});

test("rejects malformed or non-string definitions", () => {
  assert.equal(isExactCleanupFunctionDefinition(""), false);
  assert.equal(isExactCleanupFunctionDefinition(null), false);
});
