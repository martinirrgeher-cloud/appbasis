ALTER TABLE appbasis_training_block_revision
  ADD COLUMN audience_ids text[];
--> statement-breakpoint
ALTER TABLE appbasis_training_block_revision
  ADD CONSTRAINT appbasis_training_block_revision_audience_ids_count_check
  CHECK (
    audience_ids IS NULL OR
    cardinality(audience_ids) BETWEEN 0 AND 100
  ),
  ADD CONSTRAINT appbasis_training_block_revision_audience_compatibility_check
  CHECK (
    audience_ids IS NULL OR
    audience_id IS NOT DISTINCT FROM audience_ids[1]
  );
