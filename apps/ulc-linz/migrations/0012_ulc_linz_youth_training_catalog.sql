-- ULC v13: stable youth-content category IDs and per-training notes.
-- Existing free-text titles and attendance slots remain untouched; legacy
-- records have an empty metadata array and can be categorized later.
-- Session-owned JSONB is covered by the existing session retention/deletion.
ALTER TABLE ulc_linz_training_session
  ADD COLUMN training_content_items jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE ulc_linz_training_session
  ADD CONSTRAINT ulc_linz_training_content_items_check
  CHECK (
    jsonb_typeof(training_content_items) = 'array'
    AND jsonb_array_length(training_content_items) <= 5
    AND (
      jsonb_array_length(training_content_items) = 0
      OR jsonb_array_length(training_content_items) = cardinality(training_content_titles)
    )
  );
