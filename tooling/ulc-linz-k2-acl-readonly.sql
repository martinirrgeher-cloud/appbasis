-- K2-A02 PostgreSQL catalog inventory (READ ONLY, no data rows).
-- Run the SAME statement separately against the explicitly selected
-- preview SOURCE database and the separate K2 RESTORE database.
-- Never substitute the cloned preview database on the quarantine branch.
-- This counts rights only; it does not prove per-object parity or
-- provide any permission to grant, deploy or expose the restore.
WITH app_tables AS (
  SELECT c.oid, c.relacl, c.relrowsecurity, c.relforcerowsecurity
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
)
SELECT
  COUNT(*)::integer AS tables_count,
  COUNT(*) FILTER (WHERE relacl IS NOT NULL)::integer AS explicit_acl_count,
  COUNT(*) FILTER (WHERE has_table_privilege(
    'appbasis_ulc_linz_preview_application', oid, 'SELECT'
  ))::integer AS application_select_count,
  COUNT(*) FILTER (WHERE has_table_privilege(
    'appbasis_ulc_linz_preview_application', oid, 'INSERT'
  ))::integer AS application_insert_count,
  COUNT(*) FILTER (WHERE has_table_privilege(
    'appbasis_ulc_linz_preview_application', oid, 'UPDATE'
  ))::integer AS application_update_count,
  COUNT(*) FILTER (WHERE has_table_privilege(
    'appbasis_ulc_linz_preview_application', oid, 'DELETE'
  ))::integer AS application_delete_count,
  COUNT(*) FILTER (WHERE has_table_privilege(
    'ulc_linz_k2_preview_backup', oid, 'SELECT'
  ))::integer AS backup_select_count,
  COUNT(*) FILTER (WHERE relrowsecurity)::integer AS rls_enabled_count,
  COUNT(*) FILTER (WHERE relforcerowsecurity)::integer AS rls_forced_count,
  (SELECT COUNT(*)::integer
     FROM pg_catalog.pg_policy AS p
     JOIN app_tables AS t ON t.oid = p.polrelid
  ) AS rls_policy_count,
  (SELECT COUNT(*)::integer
     FROM pg_catalog.pg_class AS c
     JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'S'
  ) AS sequence_count
FROM app_tables;
