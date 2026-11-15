-- P02-H ISOLATED TEST FIXTURE ONLY. NOT part of any app/module SQL migration.
-- New usage is linked by explicit trusted caller context, not inferred from
-- source_ref or note. Existing ambiguous legacy rows are NOT backfilled.
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
