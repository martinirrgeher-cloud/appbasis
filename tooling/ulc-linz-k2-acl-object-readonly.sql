-- K2-A03: READ-ONLY per-object effective-privilege inventory.
-- Run separately, with explicit database selection, against:
-- (1) original preview-main / appbasis_ulc_linz_preview and
-- (2) isolated K2 branch / ulc_linz_k2_restore_quarantine.
-- WARNING: K2 branch also contains a different cloned preview database.
-- Never publish raw inventory values in Actions logs, PRs or Issues.
-- No SQL writes, credential access, row-data reads or changes of roles.
WITH
role_scope(role_name) AS (
  VALUES
    ('PUBLIC'),
    ('appbasis_ulc_linz_preview_application'),
    ('appbasis_ulc_linz_preview_security_ingest'),
    ('ulc_linz_k2_preview_backup'),
    ('ulc_linz_security_event_ingest'),
    ('ulc_linz_security_event_cleanup'),
    ('ulc_linz_security_event_read')
),
relations AS (
  SELECT c.oid, c.relname, c.relowner, c.relacl, c.relkind,
         c.relrowsecurity, c.relforcerowsecurity
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'S')
),
table_permissions(privilege) AS (
  VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
         ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
),
column_permissions(privilege) AS (
  VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES')
),
sequence_permissions(privilege) AS (
  VALUES ('USAGE'), ('SELECT'), ('UPDATE')
),
inventory AS (
  SELECT
    'table'::text AS kind, 'public.' || t.relname AS object,
    r.role_name AS role, p.privilege,
    CASE WHEN r.role_name = 'PUBLIC'
      THEN EXISTS (
        SELECT 1 FROM pg_catalog.aclexplode(
          COALESCE(t.relacl, pg_catalog.acldefault('r', t.relowner))
        ) acl
        WHERE acl.grantee = 0 AND acl.privilege_type = p.privilege
      )
      ELSE pg_catalog.has_table_privilege(r.role_name, t.oid, p.privilege)
    END AS allowed,
    pg_catalog.pg_get_userbyid(t.relowner) AS owner,
    false AS "securityDefiner",
    t.relrowsecurity AS "rlsEnabled",
    t.relforcerowsecurity AS "rlsForced",
    (SELECT COUNT(*)::int FROM pg_catalog.pg_policy pol
     WHERE pol.polrelid = t.oid) AS "policyCount"
  FROM relations t
  CROSS JOIN role_scope r
  CROSS JOIN table_permissions p
  WHERE t.relkind IN ('r', 'p')

  UNION ALL
  SELECT
    'column', 'public.' || t.relname || '.' || a.attname,
    r.role_name, p.privilege,
    CASE WHEN r.role_name = 'PUBLIC'
      THEN
        EXISTS (
          SELECT 1 FROM pg_catalog.aclexplode(
            COALESCE(t.relacl, pg_catalog.acldefault('r', t.relowner))
          ) acl
          WHERE acl.grantee = 0 AND acl.privilege_type = p.privilege
        )
        OR EXISTS (
          SELECT 1 FROM pg_catalog.aclexplode(
            COALESCE(a.attacl, ARRAY[]::aclitem[])
          ) acl
          WHERE acl.grantee = 0 AND acl.privilege_type = p.privilege
        )
      ELSE pg_catalog.has_column_privilege(
        r.role_name, t.oid, a.attnum, p.privilege
      )
    END,
    pg_catalog.pg_get_userbyid(t.relowner),
    false, false, false, 0
  FROM relations t
  JOIN pg_catalog.pg_attribute a ON a.attrelid = t.oid
  CROSS JOIN role_scope r
  CROSS JOIN column_permissions p
  WHERE t.relkind IN ('r','p')
    AND t.relname IN ('ulc_linz_security_event_log', 'ulc_linz_trainer_identity_audit')
    AND a.attnum > 0 AND NOT a.attisdropped

  UNION ALL
  SELECT
    'sequence', 'public.' || s.relname,
    r.role_name, p.privilege,
    CASE WHEN r.role_name = 'PUBLIC'
      THEN EXISTS (
        SELECT 1 FROM pg_catalog.aclexplode(
          COALESCE(s.relacl, pg_catalog.acldefault('S', s.relowner))
        ) acl
        WHERE acl.grantee = 0 AND acl.privilege_type = p.privilege
      )
      ELSE pg_catalog.has_sequence_privilege(r.role_name, s.oid, p.privilege)
    END,
    pg_catalog.pg_get_userbyid(s.relowner),
    false, false, false, 0
  FROM relations s
  CROSS JOIN role_scope r
  CROSS JOIN sequence_permissions p
  WHERE s.relkind = 'S'

  UNION ALL
  SELECT
    'routine',
    'public.' || fn.proname || '(' ||
      pg_catalog.pg_get_function_identity_arguments(fn.oid) || ')',
    r.role_name, 'EXECUTE',
    CASE WHEN r.role_name = 'PUBLIC'
      THEN EXISTS (
        SELECT 1 FROM pg_catalog.aclexplode(
          COALESCE(fn.proacl, pg_catalog.acldefault('f', fn.proowner))
        ) acl
        WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
      )
      ELSE pg_catalog.has_function_privilege(r.role_name, fn.oid, 'EXECUTE')
    END,
    pg_catalog.pg_get_userbyid(fn.proowner),
    fn.prosecdef, false, false, 0
  FROM pg_catalog.pg_proc fn
  JOIN pg_catalog.pg_namespace n ON n.oid = fn.pronamespace
  CROSS JOIN role_scope r
  WHERE n.nspname = 'public'
)
SELECT kind, object, role, privilege, allowed, owner,
       "securityDefiner", "rlsEnabled", "rlsForced", "policyCount"
FROM inventory
ORDER BY kind, object, role, privilege;
