-- ULC v12: short youth-training content titles belong to the training date;
-- per-athlete slot assignments belong to existing attendance rows so the
-- established athlete-retention/delete path removes them with attendance.
-- Expand-only: all existing sessions/attendance retain their previous meaning.
ALTER TABLE ulc_linz_training_session
  ADD COLUMN training_content_titles text[] NOT NULL DEFAULT ARRAY[]::text[];
--> statement-breakpoint
ALTER TABLE ulc_linz_training_session
  ADD CONSTRAINT ulc_linz_training_content_titles_check
  CHECK (
    cardinality(training_content_titles) <= 5
    AND array_position(training_content_titles, NULL) IS NULL
    AND char_length(array_to_string(training_content_titles, '')) <= 600
  );
--> statement-breakpoint
ALTER TABLE ulc_linz_training_attendance
  ADD COLUMN training_content_slots smallint[] NOT NULL DEFAULT ARRAY[]::smallint[];
--> statement-breakpoint
ALTER TABLE ulc_linz_training_attendance
  ADD CONSTRAINT ulc_linz_training_content_slots_check
  CHECK (
    cardinality(training_content_slots) <= 5
    AND array_position(training_content_slots, NULL) IS NULL
    AND training_content_slots <@ ARRAY[1, 2, 3, 4, 5]::smallint[]
    AND (status = 'present' OR cardinality(training_content_slots) = 0)
  );
