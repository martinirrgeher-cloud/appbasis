-- K2-A04: exact read-only future-object defaults and owner role gate.
-- Query must be run against explicit source and K2 restore database separately.
-- This collects no user data, table rows, credentials or connection strings.
-- DO NOT infer a safe migration strategy from a matching count.
WITH defaults AS (
  SELECT d.defaclrole, d.defaclobjtype, n.nspname, a.grantee,
         a.privilege_type, a.is_grantable
  FROM pg_catalog.pg_default_acl d
  JOIN pg_catalog.pg_namespace n ON n.oid=d.defaclnamespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) a
  WHERE n.nspname='public'
), role_flags AS (
  SELECT
    COUNT(*) FILTER (WHERE rolname='ulc_linz_k2_restore_owner'
      AND rolcanlogin AND rolcreatedb AND rolcreaterole AND rolbypassrls)::integer AS elevated_restore_owner,
    COUNT(*) FILTER (WHERE rolname='ulc_linz_k2_object_owner')::integer AS neutral_owner_exists,
    COUNT(*) FILTER (WHERE rolname='appbasis_ulc_linz_preview_migration'
      AND rolcanlogin AND NOT rolsuper AND NOT rolcreatedb
      AND NOT rolcreaterole AND NOT rolbypassrls)::integer AS restricted_migration_owner
  FROM pg_catalog.pg_roles
)
SELECT current_database() AS database_name,
  (SELECT COUNT(*)::integer FROM pg_catalog.pg_default_acl d
   JOIN pg_catalog.pg_namespace n ON n.oid=d.defaclnamespace
   WHERE n.nspname='public') AS public_default_acl_configs,
  (SELECT COUNT(*)::integer FROM defaults x
   WHERE x.defaclrole = (SELECT oid FROM pg_catalog.pg_roles
      WHERE rolname='appbasis_ulc_linz_preview_migration')
     AND x.grantee = (SELECT oid FROM pg_catalog.pg_roles
      WHERE rolname='ulc_linz_k2_preview_backup')
     AND x.privilege_type='SELECT' AND x.defaclobjtype IN ('r','S')
     AND NOT x.is_grantable) AS migration_backup_default_select_entries,
  (SELECT COUNT(*)::integer FROM defaults x
   WHERE x.grantee=0 AND x.privilege_type='EXECUTE') AS explicit_public_function_default_exec,
  (SELECT COUNT(*)::integer FROM pg_catalog.pg_auth_members m
   JOIN pg_catalog.pg_roles parent ON parent.oid=m.roleid
   JOIN pg_catalog.pg_roles member ON member.oid=m.member
   WHERE parent.rolname='ulc_linz_k2_object_owner'
     AND member.rolname IN (
       'appbasis_ulc_linz_preview_application',
       'appbasis_ulc_linz_preview_security_log',
       'appbasis_ulc_linz_preview_security_ingest',
       'ulc_linz_k2_preview_backup'
     )) AS unsafe_runtime_owner_memberships,
  (SELECT COUNT(*)::integer
   FROM pg_catalog.pg_roles current_owner
   JOIN pg_catalog.pg_roles runtime_role ON runtime_role.rolname IN (
     'appbasis_ulc_linz_preview_application',
     'appbasis_ulc_linz_preview_security_log',
     'appbasis_ulc_linz_preview_security_ingest',
     'ulc_linz_k2_preview_backup'
   )
   WHERE current_owner.rolname='ulc_linz_k2_restore_owner'
     AND pg_catalog.pg_has_role(runtime_role.oid,current_owner.oid,'MEMBER')
  ) AS runtime_member_of_existing_owner,
  (SELECT COUNT(*)::integer
   FROM pg_catalog.pg_roles current_owner
   JOIN pg_catalog.pg_roles runtime_role ON runtime_role.rolname IN (
     'appbasis_ulc_linz_preview_application',
     'appbasis_ulc_linz_preview_security_log',
     'appbasis_ulc_linz_preview_security_ingest',
     'ulc_linz_k2_preview_backup'
   )
   WHERE current_owner.rolname='ulc_linz_k2_restore_owner'
     AND pg_catalog.pg_has_role(runtime_role.oid,current_owner.oid,'USAGE')
  ) AS runtime_inherits_existing_owner,
  (SELECT COUNT(*)::integer
   FROM pg_catalog.pg_roles current_owner
   JOIN pg_catalog.pg_roles runtime_role ON runtime_role.rolname IN (
     'appbasis_ulc_linz_preview_application',
     'appbasis_ulc_linz_preview_security_log',
     'appbasis_ulc_linz_preview_security_ingest',
     'ulc_linz_k2_preview_backup'
   )
   WHERE current_owner.rolname='ulc_linz_k2_restore_owner'
     AND pg_catalog.pg_has_role(runtime_role.oid,current_owner.oid,'SET')
  ) AS runtime_can_set_existing_owner,
  (SELECT elevated_restore_owner FROM role_flags) AS elevated_restore_owner,
  (SELECT neutral_owner_exists FROM role_flags) AS neutral_owner_exists,
  (SELECT restricted_migration_owner FROM role_flags) AS restricted_migration_owner;
