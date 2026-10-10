CREATE TABLE appbasis_training_block (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  current_revision integer NOT NULL DEFAULT 1
    CHECK (current_revision >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id)
);

CREATE INDEX appbasis_training_block_org_active_idx
  ON appbasis_training_block (organization_id, is_active, id);

CREATE TABLE appbasis_training_block_revision (
  organization_id text NOT NULL,
  block_id text NOT NULL,
  revision integer NOT NULL CHECK (revision >= 1),
  name text NOT NULL
    CHECK (
      char_length(name) BETWEEN 1 AND 120
      AND btrim(name) = name
    ),
  audience_id text
    CHECK (
      audience_id IS NULL
      OR (
        char_length(audience_id) BETWEEN 1 AND 200
        AND btrim(audience_id) = audience_id
      )
    ),
  duration_minutes integer
    CHECK (duration_minutes IS NULL OR duration_minutes >= 1),
  note text
    CHECK (
      note IS NULL
      OR (
        char_length(note) BETWEEN 1 AND 3000
        AND btrim(note) = note
      )
    ),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, block_id, revision),
  CONSTRAINT appbasis_training_block_revision_block_fk
    FOREIGN KEY (organization_id, block_id)
    REFERENCES appbasis_training_block (organization_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX appbasis_training_block_revision_name_idx
  ON appbasis_training_block_revision (
    organization_id,
    name,
    block_id,
    revision DESC
  );

CREATE TABLE appbasis_training_block_revision_item (
  organization_id text NOT NULL,
  block_id text NOT NULL,
  revision integer NOT NULL,
  item_id text NOT NULL,
  exercise_id text NOT NULL
    CHECK (
      char_length(exercise_id) BETWEEN 1 AND 200
      AND btrim(exercise_id) = exercise_id
    ),
  sort_order integer NOT NULL CHECK (sort_order BETWEEN 0 AND 199),
  note text
    CHECK (
      note IS NULL
      OR (
        char_length(note) BETWEEN 1 AND 2000
        AND btrim(note) = note
      )
    ),
  PRIMARY KEY (organization_id, block_id, revision, item_id),
  UNIQUE (organization_id, block_id, revision, sort_order),
  CONSTRAINT appbasis_training_block_revision_item_revision_fk
    FOREIGN KEY (organization_id, block_id, revision)
    REFERENCES appbasis_training_block_revision (
      organization_id,
      block_id,
      revision
    )
    ON DELETE RESTRICT
);

CREATE INDEX appbasis_training_block_revision_item_exercise_idx
  ON appbasis_training_block_revision_item (
    organization_id,
    exercise_id,
    block_id,
    revision
  );

CREATE TABLE appbasis_training_block_revision_item_parameter (
  organization_id text NOT NULL,
  block_id text NOT NULL,
  revision integer NOT NULL,
  item_id text NOT NULL,
  parameter_key text NOT NULL
    CHECK (
      char_length(parameter_key) BETWEEN 1 AND 80
      AND btrim(parameter_key) = parameter_key
    ),
  parameter_value text NOT NULL
    CHECK (
      char_length(parameter_value) BETWEEN 1 AND 500
      AND btrim(parameter_value) = parameter_value
    ),
  sort_order integer NOT NULL CHECK (sort_order BETWEEN 0 AND 49),
  PRIMARY KEY (
    organization_id,
    block_id,
    revision,
    item_id,
    parameter_key
  ),
  UNIQUE (
    organization_id,
    block_id,
    revision,
    item_id,
    sort_order
  ),
  CONSTRAINT appbasis_training_block_revision_item_parameter_item_fk
    FOREIGN KEY (organization_id, block_id, revision, item_id)
    REFERENCES appbasis_training_block_revision_item (
      organization_id,
      block_id,
      revision,
      item_id
    )
    ON DELETE RESTRICT
);
