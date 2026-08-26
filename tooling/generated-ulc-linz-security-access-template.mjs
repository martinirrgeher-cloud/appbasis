const ULC_APP_ID = "ulc-linz";
const SECURITY_EVENT_POSTGRES_PATH = "worker/security-events-postgres.ts";
const SECURITY_EVENT_ACCESS_MIGRATION_PATH =
  "migrations/0003_ulc_linz_security_event_access.sql";

export function extendUlcLinzSecurityAccessTemplate(input, generated) {
  if (input?.appId !== ULC_APP_ID) return generated;

  if (generated.files.some((entry) => entry.path === SECURITY_EVENT_ACCESS_MIGRATION_PATH)) {
    throw new Error("ULC Linz security access migration path is already generated.");
  }

  let sourceFound = false;
  const files = generated.files.map((entry) => {
    if (entry.path !== SECURITY_EVENT_POSTGRES_PATH) return entry;
    sourceFound = true;
    assertLeastPrivilegeCleanupRuntime(entry.content);
    return entry;
  });

  if (!sourceFound) {
    throw new Error(
      "ULC Linz security access requires the canonical security-event PostgreSQL source.",
    );
  }

  files.push(
    Object.freeze({
      path: SECURITY_EVENT_ACCESS_MIGRATION_PATH,
      content: securityEventAccessMigration(),
    }),
  );

  return Object.freeze({
    ...generated,
    files: Object.freeze(files),
  });
}

function assertLeastPrivilegeCleanupRuntime(content) {
  const protectedInterface = `export interface UlcLinzSecurityEventPurgeResult {
  cutoff: string;
  deletedRows: bigint;
}`;
  const protectedCleanup = `const PURGE_SECURITY_EVENT_SQL = \`
SELECT
  statement_timestamp() AS cutoff,
  public.appbasis_ulc_linz_purge_expired_security_events()::text AS deleted_rows
\`;`;
  const protectedComment = `/**
 * Invokes the database-owned cleanup function and returns the exact database
 * statement clock used by that purge. The cleanup principal cannot supply or
 * override the cutoff; PostgreSQL owns the twelve-calendar-month boundary.
 */`;
  const protectedFunction = `export async function purgeExpiredUlcLinzSecurityEvents(
  client: UlcLinzSecurityEventSqlClient,
): Promise<UlcLinzSecurityEventPurgeResult> {
  const rows = await client.unsafe(PURGE_SECURITY_EVENT_SQL);
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error("ULC Linz security-event purge result is invalid.");
  }
  const row = rows[0];
  if (row === null || typeof row !== "object") {
    throw new Error("ULC Linz security-event purge result is invalid.");
  }
  const cutoff = new Date((row as { cutoff?: unknown }).cutoff as string);
  if (!Number.isFinite(cutoff.getTime())) {
    throw new Error("ULC Linz security-event purge cutoff is invalid.");
  }
  let deletedRows: bigint;
  try {
    deletedRows = BigInt((row as { deleted_rows?: unknown }).deleted_rows as string);
  } catch {
    throw new Error("ULC Linz security-event purge count is invalid.");
  }
  if (deletedRows < 0n) {
    throw new Error("ULC Linz security-event purge count is invalid.");
  }
  return Object.freeze({ cutoff: cutoff.toISOString(), deletedRows });
}`;

  if (
    !content.includes(protectedInterface) ||
    !content.includes(protectedCleanup) ||
    !content.includes(protectedComment) ||
    !content.includes(protectedFunction)
  ) {
    throw new Error(
      "Generated ULC security cleanup runtime drifted before least-privilege access binding.",
    );
  }
}

function securityEventAccessMigration() {
  return `DO $appbasis$\nBEGIN\n  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'ulc_linz_security_event_ingest') THEN\n    BEGIN\n      CREATE ROLE ulc_linz_security_event_ingest NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;\n    EXCEPTION\n      WHEN duplicate_object OR unique_violation THEN\n        IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'ulc_linz_security_event_ingest') THEN\n          RAISE;\n        END IF;\n    END;\n  END IF;\n  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'ulc_linz_security_event_cleanup') THEN\n    BEGIN\n      CREATE ROLE ulc_linz_security_event_cleanup NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;\n    EXCEPTION\n      WHEN duplicate_object OR unique_violation THEN\n        IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'ulc_linz_security_event_cleanup') THEN\n          RAISE;\n        END IF;\n    END;\n  END IF;\n  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'ulc_linz_security_event_read') THEN\n    BEGIN\n      CREATE ROLE ulc_linz_security_event_read NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;\n    EXCEPTION\n      WHEN duplicate_object OR unique_violation THEN\n        IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'ulc_linz_security_event_read') THEN\n          RAISE;\n        END IF;\n    END;\n  END IF;\nEND\n$appbasis$;\n--> statement-breakpoint\nDO $appbasis$\nBEGIN\n  IF EXISTS (\n    SELECT 1\n    FROM pg_catalog.pg_roles\n    WHERE rolname IN (\n      'ulc_linz_security_event_ingest',\n      'ulc_linz_security_event_cleanup',\n      'ulc_linz_security_event_read'\n    )\n      AND (\n        rolcanlogin OR\n        rolsuper OR\n        rolcreatedb OR\n        rolcreaterole OR\n        rolreplication OR\n        rolbypassrls\n      )\n  ) THEN\n    RAISE EXCEPTION 'ULC Linz protected security-event role is privileged.';\n  END IF;\n\n  IF (\n    SELECT count(*)\n    FROM pg_catalog.pg_roles\n    WHERE rolname IN (\n      'ulc_linz_security_event_ingest',\n      'ulc_linz_security_event_cleanup',\n      'ulc_linz_security_event_read'\n    )\n  ) <> 3 THEN\n    RAISE EXCEPTION 'ULC Linz protected security-event role is unavailable.';\n  END IF;\nEND\n$appbasis$;\n--> statement-breakpoint\nREVOKE ALL ON TABLE public.ulc_linz_security_event_log FROM PUBLIC;\n--> statement-breakpoint\nREVOKE ALL ON SEQUENCE public.ulc_linz_security_event_log_id_seq FROM PUBLIC;\n--> statement-breakpoint\nREVOKE ALL ON TABLE public.ulc_linz_security_event_log FROM ulc_linz_security_event_ingest, ulc_linz_security_event_cleanup, ulc_linz_security_event_read;\n--> statement-breakpoint\nREVOKE ALL ON SEQUENCE public.ulc_linz_security_event_log_id_seq FROM ulc_linz_security_event_ingest, ulc_linz_security_event_cleanup, ulc_linz_security_event_read;\n--> statement-breakpoint\nGRANT INSERT (\n  schema_version, app_id, category, event_type, occurred_at, actor_principal_id,\n  organization_id, action, target_type, target_id, operation, http_status,\n  error_code, reason_code, retained_until\n) ON TABLE public.ulc_linz_security_event_log TO ulc_linz_security_event_ingest;\n--> statement-breakpoint\nGRANT USAGE ON SEQUENCE public.ulc_linz_security_event_log_id_seq TO ulc_linz_security_event_ingest;\n--> statement-breakpoint\nGRANT SELECT ON TABLE public.ulc_linz_security_event_log TO ulc_linz_security_event_read;\n--> statement-breakpoint\nCREATE OR REPLACE FUNCTION public.appbasis_ulc_linz_purge_expired_security_events()\nRETURNS bigint\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path = pg_catalog\nAS $appbasis$\nDECLARE\n  deleted_rows bigint;\nBEGIN\n  DELETE FROM public.ulc_linz_security_event_log\n  WHERE retained_until < statement_timestamp();\n  GET DIAGNOSTICS deleted_rows = ROW_COUNT;\n  RETURN deleted_rows;\nEND\n$appbasis$;\n--> statement-breakpoint\nREVOKE ALL ON FUNCTION public.appbasis_ulc_linz_purge_expired_security_events() FROM PUBLIC;\n--> statement-breakpoint\nGRANT EXECUTE ON FUNCTION public.appbasis_ulc_linz_purge_expired_security_events() TO ulc_linz_security_event_cleanup;\n--> statement-breakpoint\nGRANT SELECT (retained_until) ON TABLE public.ulc_linz_security_event_log TO ulc_linz_security_event_cleanup;\n`;
}
