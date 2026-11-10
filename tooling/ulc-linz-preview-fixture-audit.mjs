import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import { validateG04ExistingPreviewCredentials } from "./ulc-linz-g04-direct-preview-preflight.mjs";

/**
 * Read-only inventory, NOT a cleanup, migration, or proof of fixture origin.
 * Counts possible preview-labelled rows without returning names, usernames,
 * identifiers or other personal data. Explicit preview credential attestation
 * prevents accidental production queries.
 */
export const AUDIT_TABLES = Object.freeze({
  ulc_linz_athlete: ["name", "first_name", "last_name", "display_name"],
  ulc_linz_group: ["name", "display_name"],
  ulc_linz_exercise: ["name", "title"],
  ulc_linz_exercise_catalog: ["name", "title"],
});
const qid = value => '"' + value.replaceAll('"', '""') + '"';
const candidate = value => typeof value === "string" && /^[a-z_]+$/.test(value);

export async function inspectUlcPreviewFixtureLabels({
  migrationDatabaseUrl, applicationDatabaseUrl, securityLogDatabaseUrl,
}, { databaseFactory = createPostgresDatabase } = {}) {
  validateG04ExistingPreviewCredentials({
    migrationDatabaseUrl, applicationDatabaseUrl, securityLogDatabaseUrl,
  });
  const db = databaseFactory(applicationDatabaseUrl);
  try {
    const columns = await db.client.unsafe(
      "SELECT table_name, column_name FROM information_schema.columns " +
      "WHERE table_schema = 'public' AND data_type IN ('text', 'character varying') " +
      "AND table_name = ANY($1::text[]) ORDER BY table_name, column_name",
      [Object.keys(AUDIT_TABLES)],
    );
    if (!Array.isArray(columns)) throw new Error("Preview metadata unavailable");
    const available = new Map();
    for (const row of columns) {
      if (!Object.hasOwn(AUDIT_TABLES, row.table_name) ||
          !AUDIT_TABLES[row.table_name].includes(row.column_name) ||
          !candidate(row.table_name) || !candidate(row.column_name)) continue;
      const names = available.get(row.table_name) || [];
      names.push(row.column_name);
      available.set(row.table_name, names);
    }
    const results = [];
    for (const [table, allowed] of Object.entries(AUDIT_TABLES)) {
      const fields = available.get(table) || [];
      if (fields.length === 0) {
        results.push({ table, status: "not-inspectable", candidateColumns: allowed });
        continue;
      }
      // The exact sentinel is intentionally excluded from suspect counts.
      // Only preview-labelled rows are counted, not exported or modified.
      const predicate = fields.map(column =>
        "COALESCE(" + qid(column) + "::text, '') ILIKE $1"
      ).join(" OR ");
      const exactSentinel = fields.map(column =>
        "lower(COALESCE(" + qid(column) + "::text, '')) = $2"
      ).join(" OR ");
      const rows = await db.client.unsafe(
        "SELECT COUNT(*)::int AS candidate_count FROM public." + qid(table) +
        " WHERE (" + predicate + ") AND NOT (" + exactSentinel + ")",
        ["%preview%", "athlet.preview"],
      );
      if (rows.length !== 1 || !Number.isSafeInteger(Number(rows[0].candidate_count)) ||
          Number(rows[0].candidate_count) < 0) {
        throw new Error("Invalid read-only fixture inventory result");
      }
      results.push({
        table, status: "inspected", columns: fields,
        candidateCount: Number(rows[0].candidate_count),
      });
    }
    return {
      mode: "read-only", scope: "existing-isolated-preview",
      provenanceEstablished: false, cleanupPerformed: false, tables: results,
    };
  } finally {
    await db.client.end().catch(() => {});
  }
}

if (typeof process.argv[1] === "string" &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  inspectUlcPreviewFixtureLabels({
    migrationDatabaseUrl: process.env.APPBASIS_MIGRATION_DATABASE_URL,
    applicationDatabaseUrl: process.env.APPBASIS_DATABASE_URL,
    securityLogDatabaseUrl: process.env.APPBASIS_SECURITY_LOG_DATABASE_URL,
  }).then(result => process.stdout.write(JSON.stringify(result, null, 2) + "\n"))
    .catch(() => {
      console.error("Read-only ULC Preview fixture inventory BLOCKED: invalid target or query.");
      process.exitCode = 1;
    });
}
