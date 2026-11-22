-- Published module-owner v6 additive security migration.
-- Exact trigger/function body comes from T07 PR #718 candidate and its
-- race-tested PostgreSQL 18 disposable DB proof. The only allowed effects:
-- one function, its EXECUTE ACL, and two owner-table write triggers.
-- No table/row changes, no GRANT to application, no media enablement,
-- no retention/purge and no restore-promotion authorization.
-- DO NOT apply to a production database without a separate explicitly
-- approved migration/role/rollback check. Existing installations must
-- reconcile current schema before executing this versioned migration.
--
-- Legacy direct SQL favorites and usage-subject associations must never
-- reappear after principal deletion. The guarded repository already uses
-- the identical principal advisory key, so regular INSERT remains valid.
--
CREATE FUNCTION appbasis_exercise_catalog_subject_deletion_write_fence()
RETURNS trigger
LANGUAGE plpgsql
AS $fence$
BEGIN
  -- Favorites and verified owner links are insert/delete-only: the current
  -- repositories NEVER update these rows. PostgreSQL locks an existing tuple
  -- *before* a BEFORE UPDATE row trigger. Taking our advisory lock during an
  -- UPDATE would invert the mark-and-delete lock order and deadlock with the
  -- erasure writer (40P01). Reject ALL legacy ownership UPDATEs immediately,
  -- without attempting any advisory lock, even for unmarked principals.
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Exercise catalog personal ownership rows are immutable'
      USING ERRCODE = '23514',
        CONSTRAINT = 'appbasis_exercise_catalog_subject_owner_immutable';
  END IF;

  -- A transaction with an older stable snapshot could acquire the lock
  -- after a deletion but still miss the committed marker. Deny such writers.
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Exercise catalog personal writes require READ COMMITTED isolation'
      USING ERRCODE = '25001';
  END IF;

  -- Exact advisory key used by PostgresExerciseCatalogRepository:
  -- lockFavoritePrincipal(organizationId, principalId).
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.jsonb_build_array(
        NEW.organization_id::text, NEW.principal_id::text
      )::text, 0
    )
  );

  IF EXISTS (
    SELECT 1 FROM public.appbasis_exercise_catalog_favorite_deletion AS marker
    WHERE marker.organization_id = NEW.organization_id
      AND marker.principal_id = NEW.principal_id
  ) THEN
    RAISE EXCEPTION 'Exercise catalog personal write blocked by deletion marker'
      USING ERRCODE = '23514',
        CONSTRAINT = 'appbasis_exercise_catalog_subject_deletion_write_fence';
  END IF;
  RETURN NEW;
END;
$fence$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION appbasis_exercise_catalog_subject_deletion_write_fence() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER appbasis_exercise_catalog_favorite_deletion_write_fence
BEFORE INSERT OR UPDATE
ON appbasis_exercise_catalog_favorite
FOR EACH ROW
EXECUTE FUNCTION appbasis_exercise_catalog_subject_deletion_write_fence();
--> statement-breakpoint
CREATE TRIGGER appbasis_exercise_catalog_usage_subject_deletion_write_fence
BEFORE INSERT OR UPDATE
ON appbasis_exercise_catalog_usage_subject
FOR EACH ROW
EXECUTE FUNCTION appbasis_exercise_catalog_subject_deletion_write_fence();
