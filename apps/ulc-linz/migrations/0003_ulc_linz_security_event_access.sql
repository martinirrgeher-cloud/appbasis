DO $appbasis$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'ulc_linz_security_event_ingest') THEN
    CREATE ROLE ulc_linz_security_event_ingest NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'ulc_linz_security_event_cleanup') THEN
    CREATE ROLE ulc_linz_security_event_cleanup NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'ulc_linz_security_event_read') THEN
    CREATE ROLE ulc_linz_security_event_read NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END
$appbasis$;
--> statement-breakpoint
ALTER ROLE ulc_linz_security_event_ingest NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
--> statement-breakpoint
ALTER ROLE ulc_linz_security_event_cleanup NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
--> statement-breakpoint
ALTER ROLE ulc_linz_security_event_read NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
--> statement-breakpoint
REVOKE ALL ON TABLE public.ulc_linz_security_event_log FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON SEQUENCE public.ulc_linz_security_event_log_id_seq FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON TABLE public.ulc_linz_security_event_log FROM ulc_linz_security_event_ingest, ulc_linz_security_event_cleanup, ulc_linz_security_event_read;
--> statement-breakpoint
REVOKE ALL ON SEQUENCE public.ulc_linz_security_event_log_id_seq FROM ulc_linz_security_event_ingest, ulc_linz_security_event_cleanup, ulc_linz_security_event_read;
--> statement-breakpoint
GRANT INSERT (
  schema_version, app_id, category, event_type, occurred_at, actor_principal_id,
  organization_id, action, target_type, target_id, operation, http_status,
  error_code, reason_code, retained_until
) ON TABLE public.ulc_linz_security_event_log TO ulc_linz_security_event_ingest;
--> statement-breakpoint
GRANT USAGE ON SEQUENCE public.ulc_linz_security_event_log_id_seq TO ulc_linz_security_event_ingest;
--> statement-breakpoint
GRANT SELECT ON TABLE public.ulc_linz_security_event_log TO ulc_linz_security_event_read;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.appbasis_ulc_linz_purge_expired_security_events()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $appbasis$
DECLARE
  deleted_rows bigint;
BEGIN
  DELETE FROM public.ulc_linz_security_event_log
  WHERE retained_until < statement_timestamp();
  GET DIAGNOSTICS deleted_rows = ROW_COUNT;
  RETURN deleted_rows;
END
$appbasis$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.appbasis_ulc_linz_purge_expired_security_events() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.appbasis_ulc_linz_purge_expired_security_events() TO ulc_linz_security_event_cleanup;
--> statement-breakpoint
GRANT SELECT (retained_until) ON TABLE public.ulc_linz_security_event_log TO ulc_linz_security_event_cleanup;
