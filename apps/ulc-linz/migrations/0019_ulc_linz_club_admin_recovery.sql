-- ULC-only, forward-only recovery audit and expiring credential guard.
-- Applying to production requires separate authorization and validated DB target.
CREATE TABLE public.ulc_linz_club_admin_recovery_audit (
  operation_id uuid PRIMARY KEY,
  organization_id text NOT NULL DEFAULT 'ulc-linz'
    CHECK (organization_id = 'ulc-linz'),
  actor_principal_id text NOT NULL
    CHECK (char_length(actor_principal_id) BETWEEN 1 AND 200
      AND actor_principal_id = btrim(actor_principal_id)),
  target_identity_id text NOT NULL REFERENCES public."user"(id) ON DELETE RESTRICT,
  action text NOT NULL DEFAULT 'club-admin.first-login-password-recovery'
    CHECK (action = 'club-admin.first-login-password-recovery'),
  reason text NOT NULL
    CHECK (char_length(reason) BETWEEN 1 AND 500 AND reason = btrim(reason)),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  retained_until timestamptz NOT NULL,
  CONSTRAINT ulc_club_admin_recovery_expiry_exact CHECK (
    expires_at = created_at + interval '2 hours'
  ),
  CONSTRAINT ulc_club_admin_recovery_retention_exact CHECK (
    retained_until = created_at + interval '1 year'
  )
);
--> statement-breakpoint
CREATE INDEX ulc_club_admin_recovery_target_latest_idx
  ON public.ulc_linz_club_admin_recovery_audit
  (target_identity_id, created_at DESC, operation_id DESC);
--> statement-breakpoint
REVOKE ALL ON public.ulc_linz_club_admin_recovery_audit FROM PUBLIC;
--> statement-breakpoint
DO $appbasis$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'ulc_linz_application') THEN
    GRANT SELECT (target_identity_id, organization_id, created_at, expires_at, operation_id)
      ON public.ulc_linz_club_admin_recovery_audit TO ulc_linz_application;
  END IF;
END
$appbasis$;
--> statement-breakpoint
-- A login opened before the deadline cannot change its password after expiry.
CREATE FUNCTION public.ulc_linz_club_admin_recovery_expiry_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $appbasis$
DECLARE
  deadline timestamptz;
BEGIN
  IF NEW.provider_id = 'credential'
     AND NEW.password IS DISTINCT FROM OLD.password
     AND EXISTS (
       SELECT 1 FROM public."user" u
       JOIN public.appbasis_identity_security_state s ON s.identity_id = u.id
       WHERE u.id = NEW.user_id AND u.username = 'ulc.admin'
         AND s.must_change_password
     )
  THEN
    SELECT a.expires_at INTO deadline
    FROM public.ulc_linz_club_admin_recovery_audit a
    WHERE a.target_identity_id = NEW.user_id
      AND a.organization_id = 'ulc-linz'
    ORDER BY a.created_at DESC, a.operation_id DESC LIMIT 1;
    IF deadline IS NOT NULL AND statement_timestamp() >= deadline THEN
      RAISE EXCEPTION 'ULC club admin recovery credential expired.'
        USING ERRCODE = '28000';
    END IF;
  END IF;
  RETURN NEW;
END
$appbasis$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.ulc_linz_club_admin_recovery_expiry_guard() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER ulc_linz_club_admin_recovery_expiry
BEFORE UPDATE OF password ON public.account
FOR EACH ROW EXECUTE FUNCTION public.ulc_linz_club_admin_recovery_expiry_guard();
