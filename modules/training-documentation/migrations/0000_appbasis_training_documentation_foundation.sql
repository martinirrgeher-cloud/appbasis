CREATE TABLE appbasis_training_documentation (
  id text PRIMARY KEY,
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
  session_date date NOT NULL,
  source_plan_id text NOT NULL
    CHECK (
      char_length(source_plan_id) BETWEEN 1 AND 200
      AND btrim(source_plan_id) = source_plan_id
    ),
  source_plan_revision integer NOT NULL
    CHECK (source_plan_revision >= 1),
  current_revision integer NOT NULL DEFAULT 1
    CHECK (current_revision >= 1),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'completed')),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, subject_id, session_date),
  CHECK (
    (status = 'draft' AND completed_at IS NULL)
    OR
    (status = 'completed' AND completed_at IS NOT NULL)
  )
);

CREATE TABLE appbasis_training_documentation_revision (
  organization_id text NOT NULL,
  documentation_id text NOT NULL,
  revision integer NOT NULL CHECK (revision >= 1),
  status text NOT NULL
    CHECK (status IN ('draft', 'completed')),
  note text
    CHECK (
      note IS NULL
      OR (
        char_length(note) BETWEEN 1 AND 3000
        AND btrim(note) = note
      )
    ),
  items_json jsonb NOT NULL
    CHECK (jsonb_typeof(items_json) = 'array'),
  attendance_json jsonb NOT NULL
    CHECK (jsonb_typeof(attendance_json) = 'array'),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, documentation_id, revision),
  CONSTRAINT appbasis_training_documentation_revision_document_fk
    FOREIGN KEY (organization_id, documentation_id)
    REFERENCES appbasis_training_documentation (organization_id, id)
    ON DELETE RESTRICT,
  CHECK (
    (status = 'draft' AND completed_at IS NULL)
    OR
    (status = 'completed' AND completed_at IS NOT NULL)
  )
);

ALTER TABLE appbasis_training_documentation
  ADD CONSTRAINT appbasis_training_documentation_current_revision_fk
  FOREIGN KEY (organization_id, id, current_revision)
  REFERENCES appbasis_training_documentation_revision (
    organization_id,
    documentation_id,
    revision
  )
  DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX appbasis_training_documentation_subject_date_idx
  ON appbasis_training_documentation (
    organization_id,
    subject_id,
    session_date DESC
  );

CREATE INDEX appbasis_training_documentation_source_plan_idx
  ON appbasis_training_documentation (
    organization_id,
    source_plan_id,
    source_plan_revision
  );
