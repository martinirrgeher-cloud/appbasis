-- Privileged, module-owned personal favorite tombstone.
-- A separate controlled retention job must later purge expired markers.
-- NO foreign key into identity or other module owners.
CREATE TABLE appbasis_training_block_favorite_deletion (
  organization_id text NOT NULL,
  principal_id text NOT NULL,
  completed_at timestamptz NOT NULL,
  purge_after timestamptz NOT NULL,
  PRIMARY KEY (organization_id, principal_id),
  CONSTRAINT appbasis_training_block_favorite_deletion_org_check
    CHECK (char_length(organization_id) BETWEEN 1 AND 200 AND btrim(organization_id) = organization_id),
  CONSTRAINT appbasis_training_block_favorite_deletion_principal_check
    CHECK (char_length(principal_id) BETWEEN 1 AND 200 AND btrim(principal_id) = principal_id),
  CONSTRAINT appbasis_training_block_favorite_deletion_retention_check
    CHECK (purge_after = completed_at + interval '840 hours')
);

--> statement-breakpoint
-- Trigger-level protection is backward-compatible with existing runtime code:
-- before this migration the old favorite write path behaves as before; after it
-- the database itself serializes writes with authorized subject deletion.
CREATE FUNCTION appbasis_training_block_guard_deleted_favorite()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      jsonb_build_array(NEW.organization_id, NEW.principal_id)::text, 0
    )
  );
  IF EXISTS (
    SELECT 1 FROM appbasis_training_block_favorite_deletion
    WHERE organization_id = NEW.organization_id AND principal_id = NEW.principal_id
  ) THEN
    RAISE EXCEPTION 'Training block favorite is blocked by a subject deletion marker.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER appbasis_training_block_guard_deleted_favorite_trigger
BEFORE INSERT OR UPDATE OF organization_id, principal_id
ON appbasis_training_block_favorite
FOR EACH ROW
EXECUTE FUNCTION appbasis_training_block_guard_deleted_favorite();
