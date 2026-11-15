-- K2-A03: direct (not inherited/effective) ACL counts, read-only.
-- Run against separately confirmed preview SOURCE and isolated K2 RESTORE DBs.
-- No application table rows, credentials or network settings are accessed.
-- This is diagnostic evidence, NOT an executable grant/revoke plan.
WITH direct_acl AS (
  SELECT 'table'::text AS kind, acl.grantee, acl.is_grantable
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) acl
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  UNION ALL
  SELECT 'sequence', acl.grantee, acl.is_grantable
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) acl
  WHERE n.nspname = 'public' AND c.relkind = 'S'
  UNION ALL
  SELECT 'column', acl.grantee, acl.is_grantable
  FROM pg_catalog.pg_attribute a
  JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) acl
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    AND a.attnum > 0 AND NOT a.attisdropped
  UNION ALL
  SELECT 'function', acl.grantee, acl.is_grantable
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(p.proacl) acl
  WHERE n.nspname = 'public'
)
SELECT
  kind,
  CASE WHEN grantee = 0 THEN 'PUBLIC'
       ELSE pg_catalog.pg_get_userbyid(grantee) END AS grantee,
  COUNT(*)::integer AS direct_entries,
  COUNT(*) FILTER (WHERE is_grantable)::integer AS entries_with_grant_option
FROM direct_acl
GROUP BY kind, grantee
ORDER BY kind, grantee;
