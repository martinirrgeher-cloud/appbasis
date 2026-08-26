import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./ulc-linz-m5-exported-snapshot.mjs", import.meta.url), "utf8");

test("M5 sequence privilege checks operate only on a materialized sequence inventory", () => {
  assert.match(source, /user_sequences AS MATERIALIZED \([\s\S]*WHERE relation\.relkind = 'S'[\s\S]*\)/);
  assert.match(source, /FROM user_sequences AS sequence_record[\s\S]*has_sequence_privilege\(role\.rolname, sequence_record\.oid, 'SELECT'\)/);
  assert.match(source, /FROM user_sequences AS sequence_record[\s\S]*has_sequence_privilege\(role\.rolname, sequence_record\.oid, 'USAGE'\)[\s\S]*has_sequence_privilege\(role\.rolname, sequence_record\.oid, 'UPDATE'\)/);
  assert.doesNotMatch(source, /FROM user_relations AS relation[\s\S]{0,200}has_sequence_privilege\(role\.rolname, relation\.oid/);
});
