import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceMigrationUrl = new URL(
  "../apps/ulc-linz/migrations/0003_ulc_linz_security_event_access.sql",
  import.meta.url,
);
const generatorUrl = new URL(
  "./generated-ulc-linz-security-access-template.mjs",
  import.meta.url,
);

const protectedRoles = [
  "ulc_linz_security_event_ingest",
  "ulc_linz_security_event_cleanup",
  "ulc_linz_security_event_read",
];

test("security access role creation tolerates only a concurrently-created identical role", async () => {
  const [migration, generator] = await Promise.all([
    readFile(sourceMigrationUrl, "utf8"),
    readFile(generatorUrl, "utf8"),
  ]);

  for (const source of [migration, generator]) {
    assert.match(source, /WHEN duplicate_object OR unique_violation THEN/);
    for (const role of protectedRoles) {
      assert.match(
        source,
        new RegExp(`IF NOT EXISTS \\(SELECT 1 FROM pg_catalog\\.pg_roles WHERE rolname = '${role}'\\) THEN`),
      );
      assert.match(
        source,
        new RegExp(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`),
      );
    }
  }

  assert.equal((migration.match(/WHEN duplicate_object OR unique_violation THEN/g) ?? []).length, 3);
  assert.equal((generator.match(/WHEN duplicate_object OR unique_violation THEN/g) ?? []).length, 3);
});
