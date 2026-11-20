-- Published ULC owner migration. The SQL DDL below is identical to
-- the CI-tested, operator-approved isolated Preview candidate.
-- This file is for fresh installations only. Existing Preview has already
-- applied this DDL; use an explicit read-only schema reconciliation instead.
-- No automatic retention, purge, production upgrade, or global GRANT.
CREATE TABLE appbasis_exercise_catalog_favorite_deletion (
  organization_id text NOT NULL,
  principal_id text NOT NULL,
  completed_at timestamptz NOT NULL,
  purge_after timestamptz NOT NULL,
  PRIMARY KEY (organization_id, principal_id),
  CONSTRAINT appbasis_exercise_catalog_favorite_deletion_org_check
    CHECK (
      char_length(organization_id) BETWEEN 1 AND 200
      AND btrim(organization_id) = organization_id
    ),
  CONSTRAINT appbasis_exercise_catalog_favorite_deletion_principal_check
    CHECK (
      char_length(principal_id) BETWEEN 1 AND 200
      AND btrim(principal_id) = principal_id
    ),
  CONSTRAINT appbasis_exercise_catalog_favorite_deletion_retention_check
    CHECK (purge_after = completed_at + interval '840 hours')
);
--> statement-breakpoint
-- Explicit usage attribution. Historical usage is NOT attributed from notes.
CREATE TABLE appbasis_exercise_catalog_usage_subject (
  organization_id text NOT NULL,
  usage_id text NOT NULL,
  principal_id text NOT NULL,
  verified_by text NOT NULL,
  PRIMARY KEY (organization_id, usage_id),
  CONSTRAINT appbasis_exercise_catalog_usage_subject_usage_fk
    FOREIGN KEY (organization_id, usage_id)
    REFERENCES appbasis_exercise_catalog_usage (organization_id, id)
    ON DELETE CASCADE,
  CONSTRAINT appbasis_exercise_catalog_usage_subject_principal_check
    CHECK (char_length(principal_id) BETWEEN 1 AND 200
      AND btrim(principal_id) = principal_id),
  CONSTRAINT appbasis_exercise_catalog_usage_subject_verified_check
    CHECK (verified_by IN ('identity', 'athletes'))
);
--> statement-breakpoint
CREATE INDEX appbasis_exercise_catalog_usage_subject_principal_idx
  ON appbasis_exercise_catalog_usage_subject
    (organization_id, principal_id, usage_id);
