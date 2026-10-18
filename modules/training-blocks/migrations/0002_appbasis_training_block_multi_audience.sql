ALTER TABLE appbasis_training_block_revision
  ADD COLUMN audience_ids text[] NOT NULL DEFAULT ARRAY[]::text[];
--> statement-breakpoint
UPDATE appbasis_training_block_revision
SET audience_ids =
  CASE
    WHEN audience_id IS NULL THEN ARRAY[]::text[]
    ELSE ARRAY[audience_id]
  END;
--> statement-breakpoint
ALTER TABLE appbasis_training_block_revision
  ADD CONSTRAINT appbasis_training_block_revision_audience_ids_count_check
  CHECK (cardinality(audience_ids) BETWEEN 0 AND 100),
  ADD CONSTRAINT appbasis_training_block_revision_audience_compatibility_check
  CHECK (audience_id IS NOT DISTINCT FROM audience_ids[1]);
