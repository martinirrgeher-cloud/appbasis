-- K2-A07: one read-only, explicitly targeted operator admission report.
-- Query ONLY the isolated K2 restore DB; NEVER the Preview source or Worker.
-- No DDL/DML. This report never authorizes a write or a K2 app connection.
WITH objects AS (
 SELECT c.oid,c.relkind,c.relowner,c.relacl
 FROM pg_catalog.pg_class c
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p','S')
),
routines AS (
 SELECT p.oid,p.proname,p.proowner,p.proacl,p.prosecdef,p.proconfig
 FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public'
),
actual_identity AS (
 SELECT s.relname AS seq, t.relname AS tbl, a.attname AS col,d.deptype
 FROM pg_catalog.pg_class s
 JOIN pg_catalog.pg_namespace sn ON sn.oid=s.relnamespace
 JOIN pg_catalog.pg_depend d ON d.classid='pg_class'::regclass AND d.objid=s.oid
   AND d.refclassid='pg_class'::regclass AND d.deptype IN ('a','i')
 JOIN pg_catalog.pg_class t ON t.oid=d.refobjid
 JOIN pg_catalog.pg_namespace tn ON tn.oid=t.relnamespace
 JOIN pg_catalog.pg_attribute a ON a.attrelid=t.oid AND a.attnum=d.refobjsubid
 WHERE sn.nspname='public' AND tn.nspname='public' AND s.relkind='S'
),
expected_identity(seq,tbl,col) AS (
 VALUES
 ('appbasis_permission_administration_audit_event_id_seq','appbasis_permission_administration_audit','event_id'),
 ('ulc_linz_lifecycle_audit_event_id_seq','ulc_linz_lifecycle_audit','event_id'),
 ('ulc_linz_security_event_log_id_seq','ulc_linz_security_event_log','id'),
 ('ulc_linz_trainer_identity_audit_event_id_seq','ulc_linz_trainer_identity_audit','event_id')
)
SELECT
 current_database() AS database_name,
 current_user AS executed_as,
 current_setting('server_version_num')::integer AS pg_version,
 (SELECT count(*)::integer FROM objects WHERE relkind IN ('r','p')) AS table_count,
 (SELECT count(*)::integer FROM objects WHERE relkind='S') AS sequence_count,
 (SELECT count(*)::integer FROM routines) AS function_count,
 (SELECT count(*)::integer FROM objects
   WHERE pg_catalog.pg_get_userbyid(relowner)='ulc_linz_k2_restore_owner') AS old_owner_relations,
 (SELECT count(*)::integer FROM routines
   WHERE pg_catalog.pg_get_userbyid(proowner)='ulc_linz_k2_restore_owner') AS old_owner_functions,
 (SELECT count(*)::integer FROM objects WHERE relacl IS NOT NULL) AS explicit_relation_acl_count,
 (SELECT count(*)::integer FROM actual_identity) AS identity_link_count,
 (SELECT count(*)::integer FROM actual_identity a JOIN expected_identity e USING (seq,tbl,col)
   WHERE a.deptype='i') AS reviewed_identity_link_count,
 (SELECT md5(string_agg(proname||'='||pg_catalog.pg_get_functiondef(oid),
   '|' ORDER BY proname)) FROM routines) AS function_definition_digest,
 (SELECT count(*)::integer FROM routines WHERE prosecdef) AS security_definer_count,
 (SELECT count(*)::integer FROM routines WHERE prosecdef
   AND proconfig @> ARRAY['search_path=pg_catalog']::text[]) AS secured_definer_searchpath_count,
 (SELECT count(*)::integer FROM routines p CROSS JOIN LATERAL pg_catalog.aclexplode(
   COALESCE(p.proacl, pg_catalog.acldefault('f',p.proowner))) a
   WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_function_execute_count,
 (SELECT count(*)::integer FROM routines p
   WHERE pg_catalog.has_function_privilege('appbasis_ulc_linz_preview_application',p.oid,'EXECUTE'))
   AS app_function_execute_count,
 (SELECT count(*)::integer FROM pg_catalog.pg_roles
   WHERE rolname='ulc_linz_k2_object_owner') AS neutral_owner_exists,
 (SELECT count(*)::integer FROM pg_catalog.pg_roles
   WHERE rolname='ulc_linz_k2_restore_owner' AND rolcanlogin AND rolcreatedb
     AND rolcreaterole AND rolbypassrls) AS elevated_restore_owner,
 (SELECT count(*)::integer FROM pg_catalog.pg_roles
   WHERE rolname IN ('ulc_linz_k2_restore_owner','appbasis_ulc_linz_preview_application',
    'appbasis_ulc_linz_preview_security_ingest','ulc_linz_k2_preview_backup',
    'appbasis_ulc_linz_preview_migration')) AS required_roles_found,
 (SELECT count(*)::integer FROM pg_catalog.pg_namespace n
   WHERE n.nspname='public' AND pg_catalog.pg_get_userbyid(n.nspowner)='pg_database_owner')
   AS database_owned_public_schema,
 (SELECT count(*)::integer FROM pg_catalog.pg_namespace n WHERE n.nspname='public'
   AND pg_catalog.has_schema_privilege('ulc_linz_k2_restore_owner',n.oid,'CREATE'))
   AS old_owner_schema_create,
 (SELECT count(*)::integer FROM pg_catalog.pg_class c
   JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind IN ('r','p')
     AND pg_catalog.has_table_privilege('appbasis_ulc_linz_preview_application',c.oid,'SELECT'))
   AS current_app_select_tables,
 (SELECT count(*)::integer FROM pg_catalog.pg_class c
   JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind IN ('r','p')
     AND pg_catalog.has_table_privilege('ulc_linz_k2_preview_backup',c.oid,'SELECT'))
   AS current_backup_select_tables,
 (SELECT count(*)::integer FROM pg_catalog.pg_auth_members m
   JOIN pg_catalog.pg_roles member ON member.oid=m.member
   JOIN pg_catalog.pg_roles parent ON parent.oid=m.roleid
   WHERE member.rolname='ulc_linz_k2_restore_owner'
     AND parent.rolname='neon_superuser') AS restore_owner_neon_admin_memberships,
 (SELECT count(*)::integer FROM pg_catalog.pg_auth_members m
   JOIN pg_catalog.pg_roles member ON member.oid=m.member
   JOIN pg_catalog.pg_roles parent ON parent.oid=m.roleid
   WHERE member.rolname IN ('appbasis_ulc_linz_preview_application',
      'appbasis_ulc_linz_preview_security_ingest','ulc_linz_k2_preview_backup')
     AND parent.rolname IN ('ulc_linz_k2_restore_owner','ulc_linz_k2_object_owner'))
   AS unsafe_runtime_owner_memberships,
 (SELECT count(*)::integer FROM pg_catalog.pg_stat_activity
   WHERE datname=current_database() AND pid<>pg_catalog.pg_backend_pid()) AS other_database_sessions
;
