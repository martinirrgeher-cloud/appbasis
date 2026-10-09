ALTER TABLE appbasis_exercise_catalog_private_media
  ADD COLUMN deletion_requested_at timestamptz;
--> statement-breakpoint
CREATE INDEX appbasis_exercise_catalog_private_media_deletion_idx
  ON appbasis_exercise_catalog_private_media (
    organization_id,
    deletion_requested_at,
    id
  )
  WHERE deletion_requested_at IS NOT NULL;
