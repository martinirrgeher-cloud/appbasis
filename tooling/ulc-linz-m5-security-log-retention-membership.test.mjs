import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("./ulc-linz-m5-security-log-retention-run.mjs", import.meta.url);

test("retention preflight accepts only operational memberships plus the canonical creator back-reference and no parent role", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /protected_group_membership AS \(/);
  assert.match(source, /protected_group_parent_membership AS \(/);
  assert.match(source, /operational_member_count/);
  assert.match(source, /creator_back_reference_count/);
  assert.match(source, /unexpected_member_count/);
  assert.match(source, /grantor\.rolsuper = true/);
  assert.match(source, /membership\.admin_option = true/);
  assert.match(source, /membership\.inherit_option = false/);
  assert.match(source, /membership\.set_option = false/);

  for (const group of [
    "ingest_group.rolname",
    "cleanup_group.rolname",
    "read_group.rolname",
  ]) {
    assert.ok(
      source.includes(`SELECT operational_member_count\n    FROM protected_group_membership\n    WHERE group_role = ${group}\n  ), 0) = 1`),
      `missing exact operational membership boundary for ${group}`,
    );
    assert.ok(
      source.includes(`SELECT creator_back_reference_count\n    FROM protected_group_membership\n    WHERE group_role = ${group}\n  ), 0) <= 1`),
      `missing bounded creator back-reference boundary for ${group}`,
    );
    assert.ok(
      source.includes(`SELECT unexpected_member_count\n    FROM protected_group_membership\n    WHERE group_role = ${group}\n  ), 0) = 0`),
      `missing fail-closed unexpected membership boundary for ${group}`,
    );
    assert.ok(
      source.includes(`SELECT parent_membership_count\n    FROM protected_group_parent_membership\n    WHERE group_role = ${group}\n  ), 0) = 0`),
      `missing fail-closed parent membership boundary for ${group}`,
    );
  }

  assert.match(source, /member\.rolname IN \([\s\S]*ulc_linz_security_event_ingest[\s\S]*ulc_linz_security_event_cleanup[\s\S]*ulc_linz_security_event_read/);
});
