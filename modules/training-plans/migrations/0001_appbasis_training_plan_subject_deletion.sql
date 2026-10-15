CREATE TABLE appbasis_training_plan_subject_deletion (
  organization_id text NOT NULL
    CHECK (
      char_length(organization_id) BETWEEN 1 AND 200
      AND btrim(organization_id) = organization_id
    ),
  subject_id text NOT NULL
    CHECK (
      char_length(subject_id) BETWEEN 1 AND 200
      AND btrim(subject_id) = subject_id
    ),
  completed_at timestamptz NOT NULL,
  purge_after timestamptz NOT NULL,
  PRIMARY KEY (organization_id, subject_id),
  CHECK (purge_after = completed_at + interval '840 hours')
);
