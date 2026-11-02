-- Module-owned, opt-in subject attribution. Existing usage records are NOT backfilled.
-- No foreign key to another module: app verifies the authoritative subject.
CREATE TABLE appbasis_training_block_usage_subject (
  organization_id text NOT NULL,
  usage_id text NOT NULL,
  subject_id text NOT NULL,
  source_plan_id text NOT NULL,
  source_item_id text NOT NULL,
  PRIMARY KEY (organization_id, usage_id),
  CONSTRAINT appbasis_training_block_usage_subject_usage_fk
    FOREIGN KEY (organization_id, usage_id)
    REFERENCES appbasis_training_block_usage (organization_id, id)
    ON DELETE CASCADE,
  CONSTRAINT appbasis_training_block_usage_subject_subject_check
    CHECK (char_length(subject_id) BETWEEN 1 AND 200 AND btrim(subject_id) = subject_id),
  CONSTRAINT appbasis_training_block_usage_subject_plan_check
    CHECK (char_length(source_plan_id) BETWEEN 1 AND 200 AND btrim(source_plan_id) = source_plan_id),
  CONSTRAINT appbasis_training_block_usage_subject_item_check
    CHECK (char_length(source_item_id) BETWEEN 1 AND 200 AND btrim(source_item_id) = source_item_id)
);
--> statement-breakpoint
CREATE INDEX appbasis_training_block_usage_subject_owner_idx
  ON appbasis_training_block_usage_subject (organization_id, subject_id, usage_id);
--> statement-breakpoint
-- The marker is intentionally never purged by this slice. An expired marker
-- remains write-blocking until a separately proven backup/restore policy exists.
CREATE TABLE appbasis_training_block_usage_subject_deletion (
  organization_id text NOT NULL,
  subject_id text NOT NULL,
  completed_at timestamptz NOT NULL,
  purge_after timestamptz NOT NULL,
  PRIMARY KEY (organization_id, subject_id),
  CONSTRAINT appbasis_training_block_usage_subject_deletion_org_check
    CHECK (char_length(organization_id) BETWEEN 1 AND 200 AND btrim(organization_id) = organization_id),
  CONSTRAINT appbasis_training_block_usage_subject_deletion_subject_check
    CHECK (char_length(subject_id) BETWEEN 1 AND 200 AND btrim(subject_id) = subject_id),
  CONSTRAINT appbasis_training_block_usage_subject_deletion_retention_check
    CHECK (purge_after = completed_at + interval '840 hours')
);
