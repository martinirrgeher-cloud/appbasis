DO $appbasis$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'ulc_linz_security_event_ingest') THEN
    BEGIN
      CREATE ROLE ulc_linz_security_event_ingest NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    EXCEPTION
      WHEN duplicate_object OR unique_violation THEN
        IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'ulc_linz_security_event_ingest') THEN
          RAISE;
        END IF;
    END;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'ulc_linz_security_event_cleanup') THEN
    BEGIN
      CREATE ROLE ulc_linz_security_event_cleanup NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    EXCEPTION
      WHEN duplicate_object OR unique_violation THEN
        IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'ulc_linz_security_event_cleanup') THEN
          RAISE;
        END IF;
    END;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'ulc_linz_security_event_read') THEN
    BEGIN
      CREATE ROLE ulc_linz_security_event_read NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    EXCEPTION
      WHEN duplicate_object OR unique_violation THEN
        IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'ulc_linz_security_event_read') THEN
          RAISE;
        END IF;
    END;
  END IF;
END
$appbasis$;
--> statement-breakpoint
DO $appbasis$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname IN (
      'ulc_linz_security_event_ingest',
      'ulc_linz_security_event_cleanup',
      'ulc_linz_security_event_read'
    )
      AND (
        rolcanlogin OR
        rolsuper OR
        rolcreatedb OR
        rolcreaterole OR
        rolreplication OR
        rolbypassrls
      )
  ) THEN
    RAISE EXCEPTION 'ULC Linz protected security-event role is privileged.';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_roles
    WHERE rolname IN (
      'ulc_linz_security_event_ingest',
      'ulc_linz_security_event_cleanup',
      'ulc_linz_security_event_read'
    )
  ) <> 3 THEN
    RAISE EXCEPTION 'ULC Linz protected security-event role is unavailable.';
  END IF;
END
$appbasis$;
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
