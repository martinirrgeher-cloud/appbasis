-- HISTORICAL K2-A03 proposal: the two PUBLIC EXECUTE REVOKEs were
-- separately approved, applied to the isolated K2 DB, and verified
-- on 2026-11-15. DO NOT RE-RUN this historical snippet as a new step.
-- K2-A03 proposal ONLY: isolated quarantine defensive function ACL correction.
-- NOT AUTHORIZED FOR EXECUTION. No workflow or CI invokes this file.
-- Requires separate, explicit operator approval of a Neon DB WRITE, exact
-- quarantine branch/compute and database, reviewed rollback and read-back.
-- This deliberately does NOT restore any application or backup GRANT.
-- This script is NOT proof that Cloudflare account-wide routing is isolated.
-- WARNING: DB name alone cannot distinguish branches; check Neon endpoint
-- metadata immediately before manual execution by an authorized operator.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
SET LOCAL search_path = pg_catalog;

DO $k2_guard$
DECLARE
  table_count integer;
  routine_count integer;
BEGIN
  IF current_database() <> 'ulc_linz_k2_restore_quarantine' THEN
    RAISE EXCEPTION 'K2 ACL repair blocked: incorrect target database.';
  END IF;

  SELECT COUNT(*)::integer INTO table_count
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r','p');
  IF table_count <> 62 THEN
    RAISE EXCEPTION 'K2 ACL repair blocked: unexpected schema inventory.';
  END IF;

  SELECT COUNT(*)::integer INTO routine_count
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public';
  IF routine_count <> 2 THEN
    RAISE EXCEPTION 'K2 ACL repair blocked: unexpected public function inventory.';
  END IF;

  SELECT COUNT(*)::integer INTO routine_count
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.pronargs = 0
    AND p.proname IN (
      'appbasis_ulc_linz_purge_expired_security_events',
      'ulc_linz_registration_calendar_guard'
    );
  IF routine_count <> 2 THEN
    RAISE EXCEPTION 'K2 ACL repair blocked: expected functions missing.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'appbasis_ulc_linz_purge_expired_security_events'
      AND p.pronargs = 0 AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'K2 ACL repair blocked: protected function changed.';
  END IF;

  -- The known restore has no direct EXECUTE grants other than owner/PUBLIC.
  -- If a specific role acquired EXECUTE, STOP instead of silently masking it.
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) acl
    WHERE n.nspname = 'public' AND p.pronargs = 0
      AND p.proname IN (
        'appbasis_ulc_linz_purge_expired_security_events',
        'ulc_linz_registration_calendar_guard'
      )
      AND acl.privilege_type = 'EXECUTE'
      AND acl.grantee <> 0 AND acl.grantee <> p.proowner
  ) THEN
    RAISE EXCEPTION 'K2 ACL repair blocked: unreviewed function grants.';
  END IF;
END
$k2_guard$;

REVOKE EXECUTE ON FUNCTION public.appbasis_ulc_linz_purge_expired_security_events() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ulc_linz_registration_calendar_guard() FROM PUBLIC;

DO $k2_verify$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) acl
    WHERE n.nspname = 'public' AND p.pronargs = 0
      AND p.proname IN (
        'appbasis_ulc_linz_purge_expired_security_events',
        'ulc_linz_registration_calendar_guard'
      )
      AND acl.privilege_type = 'EXECUTE' AND acl.grantee = 0
  ) THEN
    RAISE EXCEPTION 'K2 ACL repair blocked: PUBLIC still has function EXECUTE.';
  END IF;
END
$k2_verify$;

COMMIT;
