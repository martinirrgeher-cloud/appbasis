-- A02.3: An optional athlete/day registration note is distinct from the
-- session-wide trainer note. Keep historical actor and athlete attribution.
-- Privacy: bounded text, no new public reader or independently retained table.
ALTER TABLE ulc_linz_training_registration
  ADD COLUMN note text NULL
    CONSTRAINT ulc_linz_training_registration_note_check
    CHECK (note IS NULL OR (char_length(note) <= 160 AND note !~ '[[:cntrl:]]'));
--> statement-breakpoint
ALTER TABLE ulc_linz_training_registration_change
  ADD COLUMN note text NULL
    CONSTRAINT ulc_linz_training_registration_change_note_check
    CHECK (note IS NULL OR (char_length(note) <= 160 AND note !~ '[[:cntrl:]]'));
