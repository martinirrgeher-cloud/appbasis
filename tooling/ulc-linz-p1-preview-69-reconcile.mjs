import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import { validateUlcLinzD4PreviewDatabaseCredentials } from "./ulc-linz-d4-preview-hyperdrive.mjs";
import {
  ULC69_CATALOG_SQL,
  classifyUlc69ManifestState,
} from "./ulc-linz-p02-j-manifest-reconciliation.mjs";

/**
 * P1 release gate for the PREVIOUSLY upgraded Preview. READ ONLY.
 *
 * A canonical 44-migration manifest is NOT an instruction to rerun the
 * empty-schema migration installer on the populated Preview database.
 * Only the exact role/DB/69-table state can pass. Production cannot pass.
 */
export class UlcPreview69ReconcileError extends Error {
  constructor() {
    super("ULC P1 Preview release blocked: wrong DB/role or incomplete 69-table schema.");
    this.name = "UlcPreview69ReconcileError";
  }
}
export function verifyUlcPreview69ReconcileCredentials(input) {
  let roles;
  try {
    roles = validateUlcLinzD4PreviewDatabaseCredentials(input);
  } catch {
    throw new UlcPreview69ReconcileError();
  }
  if (roles.migration.user !== "appbasis_ulc_linz_preview_migration" ||
      roles.application.user !== "appbasis_ulc_linz_preview_application" ||
      roles.securityLog.user !== "appbasis_ulc_linz_preview_security_log" ||
      roles.application.database !== "appbasis_ulc_linz_preview") {
    throw new UlcPreview69ReconcileError();
  }
  return Object.freeze({ ...roles, readOnly: true, migrationSqlAllowed: false });
}
export function assertUlcPreview69ReconcileRows(principalRows, stateRows) {
  if (!Array.isArray(principalRows) || principalRows.length !== 1 ||
      principalRows[0]?.database_name !== "appbasis_ulc_linz_preview" ||
      principalRows[0]?.principal_name !== "appbasis_ulc_linz_preview_application") {
    throw new UlcPreview69ReconcileError();
  }
  if (!Array.isArray(stateRows) || stateRows.length !== 1) {
    throw new UlcPreview69ReconcileError();
  }
  try {
    const state = classifyUlc69ManifestState(stateRows[0]);
    if (state.state !== "preview-69-already-installed" ||
        state.productionReady !== false ||
        state.automaticSqlReplayAllowed !== false) {
      throw new Error("Unexpected upgrade state");
    }
  } catch {
    throw new UlcPreview69ReconcileError();
  }
  return Object.freeze({
    status: "preview-69-already-installed",
    schemaTables: 69,
    migrationSqlApplied: false,
    workerDeploymentApproved: false,
    productionApproved: false,
  });
}
export async function verifyUlcPreview69Release(input, {
  databaseFactory = createPostgresDatabase,
} = {}) {
  verifyUlcPreview69ReconcileCredentials(input);
  const db = databaseFactory(input.applicationDatabaseUrl);
  try {
    const principal = await db.client.unsafe(
      "SELECT current_database() AS database_name,current_user AS principal_name",
    );
    const state = await db.client.unsafe(ULC69_CATALOG_SQL);
    return assertUlcPreview69ReconcileRows(principal, state);
  } catch {
    throw new UlcPreview69ReconcileError();
  } finally {
    await db.client.end().catch(() => {});
  }
}
const invoked = typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invoked) {
  const input = {
    migrationDatabaseUrl: process.env.APPBASIS_MIGRATION_DATABASE_URL,
    applicationDatabaseUrl: process.env.APPBASIS_DATABASE_URL,
    securityLogDatabaseUrl: process.env.APPBASIS_SECURITY_LOG_DATABASE_URL,
  };
  verifyUlcPreview69Release(input)
    .then(result => process.stdout.write(JSON.stringify(result) + "\n"))
    .catch(() => { console.error("ULC P1 Preview 69 reconciliation blocked."); process.exitCode = 1; });
}
