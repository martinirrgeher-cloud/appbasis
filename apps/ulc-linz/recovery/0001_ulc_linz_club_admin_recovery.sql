-- ULC owner-authorized first-login recovery, outside the 69-table public
-- application manifest. Versioned one-off, applied only by a main-only
-- protected workflow after explicit scope and DB/worker checks.
-- A retry requires an exact all-or-none schema/trigger postcondition.
CREATE SCHEMA ulc_linz_operations;
--> statement-breakpoint
REVOKE ALL ON SCHEMA ulc_linz_operations FROM PUBLIC;
--> statement-breakpoint
CREATE TABLE ulc_linz_operations.club_admin_recovery_audit (
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
  CONSTRAINT club_admin_recovery_expiry_exact
    CHECK (expires_at = created_at + interval '2 hours'),
  CONSTRAINT club_admin_recovery_retention_exact
    CHECK (retained_until = created_at + interval '1 year')
);
--> statement-breakpoint
CREATE INDEX club_admin_recovery_target_latest_idx
  ON ulc_linz_operations.club_admin_recovery_audit
  (target_identity_id, created_at DESC, operation_id DESC);
--> statement-breakpoint
REVOKE ALL ON ulc_linz_operations.club_admin_recovery_audit FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION ulc_linz_operations.club_admin_credential_expiry_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $guard$
DECLARE deadline timestamptz;
BEGIN
  IF NEW.provider_id = 'credential'
     AND NEW.password IS DISTINCT FROM OLD.password
     AND EXISTS (
       SELECT 1 FROM public."user" u
       JOIN public.appbasis_identity_security_state s ON s.identity_id=u.id
       WHERE u.id=NEW.user_id AND u.username='ulc.admin'
         AND s.must_change_password
     ) THEN
    SELECT expires_at INTO deadline
    FROM ulc_linz_operations.club_admin_recovery_audit
    WHERE target_identity_id=NEW.user_id AND organization_id='ulc-linz'
    ORDER BY created_at DESC, operation_id DESC LIMIT 1;
    IF deadline IS NOT NULL AND statement_timestamp() >= deadline THEN
      RAISE EXCEPTION 'ULC club admin one-time recovery credential expired.'
        USING ERRCODE='28000';
    END IF;
  END IF;
  RETURN NEW;
END
$guard$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION ulc_linz_operations.club_admin_credential_expiry_guard() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER ulc_linz_club_admin_credential_expiry
BEFORE UPDATE OF password ON public.account
FOR EACH ROW EXECUTE FUNCTION ulc_linz_operations.club_admin_credential_expiry_guard();
--> statement-breakpoint
-- After expiry Better Auth cannot create a new session, even if a stolen
-- one-time password is still hashed in the provider account row.
CREATE FUNCTION ulc_linz_operations.club_admin_session_expiry_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $guard$
DECLARE deadline timestamptz;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public."user" u
    JOIN public.appbasis_identity_security_state s ON s.identity_id=u.id
    WHERE u.id=NEW.user_id AND u.username='ulc.admin'
      AND s.must_change_password
  ) THEN
    SELECT expires_at INTO deadline
    FROM ulc_linz_operations.club_admin_recovery_audit
    WHERE target_identity_id=NEW.user_id AND organization_id='ulc-linz'
    ORDER BY created_at DESC, operation_id DESC LIMIT 1;
    IF deadline IS NOT NULL AND statement_timestamp() >= deadline THEN
      RAISE EXCEPTION 'ULC club admin one-time recovery credential expired.'
        USING ERRCODE='28000';
    END IF;
  END IF;
  RETURN NEW;
END
$guard$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION ulc_linz_operations.club_admin_session_expiry_guard() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER ulc_linz_club_admin_session_expiry
BEFORE INSERT ON public.session
FOR EACH ROW EXECUTE FUNCTION ulc_linz_operations.club_admin_session_expiry_guard();
