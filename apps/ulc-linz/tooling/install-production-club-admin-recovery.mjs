import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createPostgresDatabase } from "@appbasis/database/node-runtime";
import { parseUlcLinzProductionDatabaseUrl } from "../../../tooling/ulc-linz-m6-production-hyperdrive.mjs";

const AUDIT = "ulc_linz_operations.club_admin_recovery_audit";
const NAMESPACE = "ulc_linz_operations";
const CREDENTIAL_TRIGGER = "ulc_linz_club_admin_credential_expiry";
const SESSION_TRIGGER = "ulc_linz_club_admin_session_expiry";

async function probe(sql) {
  const [row] = await sql.unsafe(
    "SELECT to_regnamespace($1) AS namespace, to_regclass($2) AS audit_table, " +
    "EXISTS (SELECT 1 FROM pg_catalog.pg_trigger " +
    "WHERE tgrelid='public.account'::regclass AND tgname=$3 AND tgenabled='O') AS credential_guard, " +
    "EXISTS (SELECT 1 FROM pg_catalog.pg_trigger " +
    "WHERE tgrelid='public.session'::regclass AND tgname=$4 AND tgenabled='O') AS session_guard",
    [NAMESPACE, AUDIT, CREDENTIAL_TRIGGER, SESSION_TRIGGER],
  );
  return row;
}

function complete(row) {
  return Boolean(row?.namespace && row?.audit_table &&
    row?.credential_guard === true && row?.session_guard === true);
}

function anyInstalled(row) {
  return Boolean(row?.namespace || row?.audit_table ||
    row?.credential_guard === true || row?.session_guard === true);
}

export async function installUlcClubAdminRecovery(env = process.env) {
  const url = env.ULC_LINZ_PRODUCTION_DATABASE_URL;
  if (typeof url !== "string" || !url) throw new Error("Missing protected production target.");
  parseUlcLinzProductionDatabaseUrl(url);
  const { client } = createPostgresDatabase(url);
  try {
    const migration = await readFile(
      new URL("../recovery/0001_ulc_linz_club_admin_recovery.sql", import.meta.url),
      "utf8",
    );
    const statements = migration.split("--> statement-breakpoint")
      .map(part => part.trim()).filter(Boolean);
    if (statements.length !== 11 ||
        !migration.includes("BEFORE INSERT ON public.session") ||
        !migration.includes("BEFORE UPDATE OF password ON public.account")) {
      throw new Error("Unrecognized one-time ULC recovery migration body.");
    }
    return await client.begin(async (tx) => {
      const before = await probe(tx);
      if (complete(before)) return "already-installed";
      if (anyInstalled(before)) {
        throw new Error("Partial or conflicting ULC recovery guard; refusing changes.");
      }
      for (const statement of statements) await tx.unsafe(statement);
      const after = await probe(tx);
      if (!complete(after)) {
        throw new Error("Recovery audit and two expiry guards were not installed together.");
      }
      return "installed";
    });
  } finally {
    await client.end({ timeout: 5 });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await installUlcClubAdminRecovery();
    console.log("ULC club administrator recovery schema PASS: " + result);
  } catch {
    console.error("ULC club administrator recovery schema FAIL; no credential reset performed.");
    process.exitCode = 1;
  }
}
