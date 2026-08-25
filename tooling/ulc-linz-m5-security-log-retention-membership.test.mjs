import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("./ulc-linz-m5-security-log-retention-run.mjs", import.meta.url);

test("retention preflight fails closed unless every protected audit group has exactly one non-admin member and no parent role", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /protected_group_membership AS \(/);
  assert.match(source, /protected_group_parent_membership AS \(/);
  assert.match(source, /count\(\*\) FILTER \(WHERE membership\.admin_option\)/);

  for (const group of [
    "ingest_group.rolname",
    "cleanup_group.rolname",
    "read_group.rolname",
  ]) {
    assert.ok(
      source.includes(`WHERE group_role = ${group}\n  ), 0) = 1`),
      `missing exact one-member boundary for ${group}`,
    );
    assert.ok(
      source.includes(`WHERE group_role = ${group}\n  ), 0) = 0`),
      `missing fail-closed zero boundary for ${group}`,
    );
  }

  assert.match(source, /member\.rolname IN \([\s\S]*ulc_linz_security_event_ingest[\s\S]*ulc_linz_security_event_cleanup[\s\S]*ulc_linz_security_event_read/);
});
