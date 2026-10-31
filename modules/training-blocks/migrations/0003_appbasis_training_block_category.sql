-- Optional, versioned functional category; independent of audience/group membership.
-- Historical revisions remain uncategorized until explicitly edited.
ALTER TABLE appbasis_training_block_revision
  ADD COLUMN category text;
--> statement-breakpoint
ALTER TABLE appbasis_training_block_revision
  ADD CONSTRAINT appbasis_training_block_revision_category_length_check
  CHECK (category IS NULL OR (
    length(btrim(category)) BETWEEN 1 AND 80
    AND category = btrim(category)
  ));
