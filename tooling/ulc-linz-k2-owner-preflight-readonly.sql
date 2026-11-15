-- K2-A04 read-only preflight BEFORE any proposed owner/grant repair.
-- This deliberately does NOT authorize changes.
-- External Neon branch/compute fingerprint and Cloudflare all-routes exclusion
-- MUST be verified separately. A database NAME alone is insufficient.
WITH objects AS (
  SELECT c.oid, c.relkind, c.relowner, c.relacl
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON c.relnamespace=n.oid
  WHERE n.nspname='public' AND c.relkind IN ('r','p','S')
), routines AS (
  SELECT p.oid,p.proowner,p.proacl,p.proname,p.prosecdef
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON p.pronamespace=n.oid
  WHERE n.nspname='public'
)
SELECT
  current_database()='ulc_linz_k2_restore_quarantine' AS exact_database_name,
  COUNT(*) FILTER (WHERE relkind IN ('r','p'))::integer AS table_count,
  COUNT(*) FILTER (WHERE relkind='S')::integer AS sequence_count,
  COUNT(*) FILTER (WHERE pg_catalog.pg_get_userbyid(relowner)='ulc_linz_k2_restore_owner')::integer AS old_owner_object_count,
  COUNT(*) FILTER (WHERE relacl IS NOT NULL)::integer AS relation_acl_count,
  (SELECT COUNT(*)::integer FROM routines) AS routine_count,
  (SELECT COUNT(*)::integer FROM routines
    WHERE pg_catalog.pg_get_userbyid(proowner)='ulc_linz_k2_restore_owner') AS routine_old_owner_count,
  (SELECT COUNT(*)::integer FROM routines
    WHERE proname='appbasis_ulc_linz_purge_expired_security_events' AND prosecdef) AS protected_definer_count,
  (SELECT COUNT(*)::integer FROM routines p
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl
    WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE') AS public_routine_execute_count,
  (SELECT COUNT(*)::integer FROM routines p
    WHERE pg_catalog.has_function_privilege('appbasis_ulc_linz_preview_application',p.oid,'EXECUTE')) AS app_routine_execute_count,
  (SELECT COUNT(*)::integer FROM pg_catalog.pg_roles
    WHERE rolname='ulc_linz_k2_object_owner') AS proposed_owner_exists_count,
  (SELECT COUNT(*)::integer FROM pg_catalog.pg_roles
    WHERE rolname='ulc_linz_k2_restore_owner' AND rolcanlogin AND rolcreatedb
      AND rolcreaterole AND rolbypassrls) AS privileged_current_owner_count,
  (SELECT COUNT(*)::integer FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON c.relnamespace=n.oid
    WHERE n.nspname='public' AND c.relkind IN ('r','p')
      AND pg_catalog.has_table_privilege(
        'appbasis_ulc_linz_preview_application',c.oid,'SELECT')) AS app_select_tables
FROM objects
GROUP BY exact_database_name;
