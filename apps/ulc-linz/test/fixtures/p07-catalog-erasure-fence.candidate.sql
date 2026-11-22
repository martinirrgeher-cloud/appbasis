-- P07 candidate only. Run exclusively in a disposable isolated CI database.
-- Do not register as a deployed migration or apply to Preview/production
-- without a separate migration/release/privacy decision.
--
-- Protects personal favorites AND explicit usage-subject associations from a
-- stale legacy SQL writer that bypasses the guarded repository.
-- Does NOT solve legacy unattributed usage notes, external media deletion,
-- all-owner erasure, restore authority, or retention expiry.
CREATE FUNCTION appbasis_exercise_catalog_subject_deletion_write_fence()
RETURNS trigger
LANGUAGE plpgsql
AS $fence$
BEGIN
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
