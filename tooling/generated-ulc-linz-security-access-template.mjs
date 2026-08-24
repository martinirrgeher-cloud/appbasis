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
    return Object.freeze({
      ...entry,
      content: withLeastPrivilegeCleanup(entry.content),
    });
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

function withLeastPrivilegeCleanup(content) {
  const directCleanup = `const PURGE_SECURITY_EVENT_SQL = \`
DELETE FROM ulc_linz_security_event_log
WHERE retained_until < statement_timestamp()
\`;`;
  const protectedCleanup = `const PURGE_SECURITY_EVENT_SQL = \`
SELECT public.appbasis_ulc_linz_purge_expired_security_events() AS deleted_rows
\`;`;
  const directComment = `/**
 * Deletes only events whose database-enforced twelve-calendar-month boundary is
 * strictly older than the PostgreSQL server's statement timestamp. There is no
 * caller-supplied clock or cutoff, so an HTTP/request/operator value cannot
 * shorten the retention period.
 */`;
  const protectedComment = `/**
 * Invokes the database-owned cleanup function. The cleanup principal needs no
 * table DELETE privilege and cannot supply a clock or cutoff; PostgreSQL owns
 * the exact twelve-calendar-month boundary.
 */`;

  if (!content.includes(directCleanup) || !content.includes(directComment)) {
    throw new Error(
      "Generated ULC security cleanup source drifted before least-privilege hardening.",
    );
  }
  return content
    .replace(directCleanup, protectedCleanup)
    .replace(directComment, protectedComment);
}

function securityEventAccessMigration() {
  return `DO $appbasis$\nBEGIN\n  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'ulc_linz_security_event_ingest') THEN\n    BEGIN\n      CREATE ROLE ulc_linz_security_event_ingest NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;\n    EXCEPTION\n      WHEN duplicate_object OR unique_violation THEN\n        IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'ulc_linz_security_event_ingest') THEN\n          RAISE;\n        END IF;\n    END;\n  END IF;\n  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'ulc_linz_security_event_cleanup') THEN\n    BEGIN\n      CREATE ROLE ulc_linz_security_event_cleanup NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;\n    EXCEPTION\n      WHEN duplicate_object OR unique_violation THEN\n        IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'ulc_linz_security_event_cleanup') THEN\n          RAISE;\n        END IF;\n    END;\n  END IF;\n  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'ulc_linz_security_event_read') THEN\n    BEGIN\n      CREATE ROLE ulc_linz_security_event_read NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;\n    EXCEPTION\n      WHEN duplicate_object OR unique_violation THEN\n        IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'ulc_linz_security_event_read') THEN\n          RAISE;\n        END IF;\n    END;\n  END IF;\nEND\n$appbasis$;\n--> statement-breakpoint\nALTER ROLE ulc_linz_security_event_ingest NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;\n--> statement-breakpoint\nALTER ROLE ulc_linz_security_event_cleanup NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;\n--> statement-breakpoint\nALTER ROLE ulc_linz_security_event_read NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;\n--> statement-breakpoint\nREVOKE ALL ON TABLE public.ulc_linz_security_event_log FROM PUBLIC;\n--> statement-breakpoint\nREVOKE ALL ON SEQUENCE public.ulc_linz_security_event_log_id_seq FROM PUBLIC;\n--> statement-breakpoint\nREVOKE ALL ON TABLE public.ulc_linz_security_event_log FROM ulc_linz_security_event_ingest, ulc_linz_security_event_cleanup, ulc_linz_security_event_read;\n--> statement-breakpoint\nREVOKE ALL ON SEQUENCE public.ulc_linz_security_event_log_id_seq FROM ulc_linz_security_event_ingest, ulc_linz_security_event_cleanup, ulc_linz_security_event_read;\n--> statement-breakpoint\nGRANT INSERT (\n  schema_version, app_id, category, event_type, occurred_at, actor_principal_id,\n  organization_id, action, target_type, target_id, operation, http_status,\n  error_code, reason_code, retained_until\n) ON TABLE public.ulc_linz_security_event_log TO ulc_linz_security_event_ingest;\n--> statement-breakpoint\nGRANT USAGE ON SEQUENCE public.ulc_linz_security_event_log_id_seq TO ulc_linz_security_event_ingest;\n--> statement-breakpoint\nGRANT SELECT ON TABLE public.ulc_linz_security_event_log TO ulc_linz_security_event_read;\n--> statement-breakpoint\nCREATE OR REPLACE FUNCTION public.appbasis_ulc_linz_purge_expired_security_events()\nRETURNS bigint\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path = pg_catalog\nAS $appbasis$\nDECLARE\n  deleted_rows bigint;\nBEGIN\n  DELETE FROM public.ulc_linz_security_event_log\n  WHERE retained_until < statement_timestamp();\n  GET DIAGNOSTICS deleted_rows = ROW_COUNT;\n  RETURN deleted_rows;\nEND\n$appbasis$;\n--> statement-breakpoint\nREVOKE ALL ON FUNCTION public.appbasis_ulc_linz_purge_expired_security_events() FROM PUBLIC;\n--> statement-breakpoint\nGRANT EXECUTE ON FUNCTION public.appbasis_ulc_linz_purge_expired_security_events() TO ulc_linz_security_event_cleanup;\n--> statement-breakpoint\nGRANT SELECT (retained_until) ON TABLE public.ulc_linz_security_event_log TO ulc_linz_security_event_cleanup;\n`;
}
