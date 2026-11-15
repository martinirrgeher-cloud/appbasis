-- K2-A04: READ-ONLY effective runtime rights acceptance matrix.
-- Execute separately against the explicitly selected Preview SOURCE database
-- and the K2 restore database, NEVER via an application-Worker connection.
-- The query reads pg_catalog metadata ONLY; no user or training rows.
-- Equality of counts is necessary but NOT sufficient for effective safety:
-- still require per-object, role membership, API authorization and media tests.
WITH t AS (
 SELECT c.oid,c.relname FROM pg_catalog.pg_class c
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p')
), s AS (
 SELECT c.oid FROM pg_catalog.pg_class c
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind='S'
), f AS (
 SELECT p.oid,p.proacl,p.proowner FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public'
), cols AS (
 SELECT a.attnum,c.oid FROM pg_catalog.pg_attribute a
 JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname='ulc_linz_security_event_log'
   AND a.attnum>0 AND NOT a.attisdropped
)
SELECT
 current_database() AS database_name,
 (SELECT COUNT(*)::integer FROM t) AS tables,
 (SELECT COUNT(*)::integer FROM t
   WHERE pg_catalog.has_table_privilege('appbasis_ulc_linz_preview_application',oid,'SELECT')) AS app_select,
 (SELECT COUNT(*)::integer FROM t
   WHERE pg_catalog.has_table_privilege('appbasis_ulc_linz_preview_application',oid,'INSERT')) AS app_insert,
 (SELECT COUNT(*)::integer FROM t
   WHERE pg_catalog.has_table_privilege('appbasis_ulc_linz_preview_application',oid,'UPDATE')) AS app_update,
 (SELECT COUNT(*)::integer FROM t
   WHERE pg_catalog.has_table_privilege('appbasis_ulc_linz_preview_application',oid,'DELETE')) AS app_delete,
 (SELECT COUNT(*)::integer FROM t
   WHERE pg_catalog.has_table_privilege('ulc_linz_k2_preview_backup',oid,'SELECT')) AS backup_select,
 (SELECT COUNT(*)::integer FROM t
   WHERE pg_catalog.has_table_privilege('ulc_linz_k2_preview_backup',oid,'INSERT')) AS backup_insert,
 (SELECT COUNT(*)::integer FROM t
   WHERE pg_catalog.has_table_privilege('ulc_linz_k2_preview_backup',oid,'UPDATE')) AS backup_update,
 (SELECT COUNT(*)::integer FROM t
   WHERE pg_catalog.has_table_privilege('ulc_linz_k2_preview_backup',oid,'DELETE')) AS backup_delete,
 (SELECT COUNT(*)::integer FROM cols
   WHERE pg_catalog.has_column_privilege(
    'appbasis_ulc_linz_preview_security_ingest',oid,attnum,'INSERT')) AS security_ingest_insert_columns,
 (SELECT COUNT(*)::integer FROM cols
   WHERE pg_catalog.has_column_privilege(
    'appbasis_ulc_linz_preview_application',oid,attnum,'INSERT')) AS app_security_insert_columns,
 (SELECT COUNT(*)::integer FROM cols
   WHERE pg_catalog.has_column_privilege(
    'appbasis_ulc_linz_preview_application',oid,attnum,'SELECT')) AS app_security_select_columns,
 (SELECT COUNT(*)::integer FROM s
   WHERE pg_catalog.has_sequence_privilege(
    'appbasis_ulc_linz_preview_application',oid,'USAGE')) AS app_sequence_usage,
 (SELECT COUNT(*)::integer FROM s
   WHERE pg_catalog.has_sequence_privilege(
    'appbasis_ulc_linz_preview_application',oid,'SELECT')) AS app_sequence_select,
 (SELECT COUNT(*)::integer FROM s
   WHERE pg_catalog.has_sequence_privilege(
    'ulc_linz_k2_preview_backup',oid,'SELECT')) AS backup_sequence_select,
 (SELECT COUNT(*)::integer FROM f
   WHERE pg_catalog.has_function_privilege(
    'appbasis_ulc_linz_preview_application',oid,'EXECUTE')) AS app_function_execute,
 (SELECT COUNT(*)::integer FROM f
   WHERE EXISTS (
    SELECT 1 FROM pg_catalog.aclexplode(
      COALESCE(proacl,pg_catalog.acldefault('f',proowner))) acl
    WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE'
   )) AS public_function_execute;
