DO $appbasis$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = 'appbasis_ulc_linz_preview_security_ingest'
  ) THEN
    RAISE EXCEPTION 'ULC D4 preview security ingest role already exists.';
  END IF;

  CREATE ROLE appbasis_ulc_linz_preview_security_ingest
    NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
END
$appbasis$;
--> statement-breakpoint
REVOKE ALL ON TABLE public.ulc_linz_security_event_log
  FROM ulc_linz_security_event_ingest, ulc_linz_security_event_cleanup, ulc_linz_security_event_read;
--> statement-breakpoint
REVOKE INSERT (
  schema_version, app_id, category, event_type, occurred_at, actor_principal_id,
  organization_id, action, target_type, target_id, operation, http_status,
  error_code, reason_code, retained_until
) ON TABLE public.ulc_linz_security_event_log
  FROM ulc_linz_security_event_ingest;
--> statement-breakpoint
REVOKE SELECT (retained_until) ON TABLE public.ulc_linz_security_event_log
  FROM ulc_linz_security_event_cleanup;
--> statement-breakpoint
REVOKE ALL ON SEQUENCE public.ulc_linz_security_event_log_id_seq
  FROM ulc_linz_security_event_ingest, ulc_linz_security_event_cleanup, ulc_linz_security_event_read;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.appbasis_ulc_linz_purge_expired_security_events()
  FROM ulc_linz_security_event_ingest, ulc_linz_security_event_cleanup, ulc_linz_security_event_read;
--> statement-breakpoint
GRANT INSERT (
  schema_version, app_id, category, event_type, occurred_at, actor_principal_id,
  organization_id, action, target_type, target_id, operation, http_status,
  error_code, reason_code, retained_until
) ON TABLE public.ulc_linz_security_event_log
  TO appbasis_ulc_linz_preview_security_ingest;
--> statement-breakpoint
GRANT USAGE ON SEQUENCE public.ulc_linz_security_event_log_id_seq
  TO appbasis_ulc_linz_preview_security_ingest;
