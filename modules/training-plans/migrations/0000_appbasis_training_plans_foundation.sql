CREATE TABLE appbasis_training_plan (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  subject_id text NOT NULL
    CHECK (
      char_length(subject_id) BETWEEN 1 AND 200
      AND btrim(subject_id) = subject_id
    ),
  plan_date date NOT NULL,
  current_revision integer NOT NULL DEFAULT 1
    CHECK (current_revision >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, subject_id, plan_date)
);

CREATE INDEX appbasis_training_plan_subject_date_idx
  ON appbasis_training_plan (organization_id, subject_id, plan_date);

CREATE TABLE appbasis_training_plan_revision (
  organization_id text NOT NULL,
  plan_id text NOT NULL,
  revision integer NOT NULL CHECK (revision >= 1),
  note text
    CHECK (
      note IS NULL
      OR (
        char_length(note) BETWEEN 1 AND 3000
        AND btrim(note) = note
      )
    ),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, plan_id, revision),
  CONSTRAINT appbasis_training_plan_revision_plan_fk
    FOREIGN KEY (organization_id, plan_id)
    REFERENCES appbasis_training_plan (organization_id, id)
    ON DELETE RESTRICT
);

ALTER TABLE appbasis_training_plan
  ADD CONSTRAINT appbasis_training_plan_current_revision_fk
  FOREIGN KEY (organization_id, id, current_revision)
  REFERENCES appbasis_training_plan_revision (
    organization_id,
    plan_id,
    revision
  )
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE appbasis_training_plan_revision_item (
  organization_id text NOT NULL,
  plan_id text NOT NULL,
  revision integer NOT NULL,
  item_id text NOT NULL,
  item_kind text NOT NULL
    CHECK (item_kind IN ('block', 'exercise')),
  parent_block_item_id text,
  sort_order integer NOT NULL CHECK (sort_order BETWEEN 0 AND 199),
  name text NOT NULL
    CHECK (
      char_length(name) BETWEEN 1 AND 160
      AND btrim(name) = name
    ),
  source_block_id text,
  source_block_revision integer,
  source_exercise_id text,
  duration_minutes integer,
  note text,
  sets_value text,
  repetitions_value text,
  amount_value text,
  unit_value text,
  comment text,
  PRIMARY KEY (organization_id, plan_id, revision, item_id),
  CONSTRAINT appbasis_training_plan_revision_item_revision_fk
    FOREIGN KEY (organization_id, plan_id, revision)
    REFERENCES appbasis_training_plan_revision (
      organization_id,
      plan_id,
      revision
    )
    ON DELETE RESTRICT,
  CONSTRAINT appbasis_training_plan_revision_item_parent_fk
    FOREIGN KEY (
      organization_id,
      plan_id,
      revision,
      parent_block_item_id
    )
    REFERENCES appbasis_training_plan_revision_item (
      organization_id,
      plan_id,
      revision,
      item_id
    )
    DEFERRABLE INITIALLY DEFERRED,
  CHECK (
    source_block_id IS NULL
    OR (
      char_length(source_block_id) BETWEEN 1 AND 200
      AND btrim(source_block_id) = source_block_id
    )
  ),
  CHECK (
    source_exercise_id IS NULL
    OR (
      char_length(source_exercise_id) BETWEEN 1 AND 200
      AND btrim(source_exercise_id) = source_exercise_id
    )
  ),
  CHECK (
    duration_minutes IS NULL OR duration_minutes >= 1
  ),
  CHECK (
    note IS NULL
    OR (
      char_length(note) BETWEEN 1 AND 3000
      AND btrim(note) = note
    )
  ),
  CHECK (
    sets_value IS NULL
    OR (
      char_length(sets_value) BETWEEN 1 AND 80
      AND btrim(sets_value) = sets_value
    )
  ),
  CHECK (
    repetitions_value IS NULL
    OR (
      char_length(repetitions_value) BETWEEN 1 AND 80
      AND btrim(repetitions_value) = repetitions_value
    )
  ),
  CHECK (
    amount_value IS NULL
    OR (
      char_length(amount_value) BETWEEN 1 AND 80
      AND btrim(amount_value) = amount_value
    )
  ),
  CHECK (
    unit_value IS NULL
    OR (
      char_length(unit_value) BETWEEN 1 AND 80
      AND btrim(unit_value) = unit_value
    )
  ),
  CHECK (
    comment IS NULL
    OR (
      char_length(comment) BETWEEN 1 AND 2000
      AND btrim(comment) = comment
    )
  ),
  CHECK (
    (
      item_kind = 'block'
      AND parent_block_item_id IS NULL
      AND source_exercise_id IS NULL
      AND sets_value IS NULL
      AND repetitions_value IS NULL
      AND amount_value IS NULL
      AND unit_value IS NULL
      AND comment IS NULL
      AND (
        (source_block_id IS NULL AND source_block_revision IS NULL)
        OR (
          source_block_id IS NOT NULL
          AND source_block_revision IS NOT NULL
          AND source_block_revision >= 1
        )
      )
    )
    OR
    (
      item_kind = 'exercise'
      AND source_block_id IS NULL
      AND source_block_revision IS NULL
      AND duration_minutes IS NULL
      AND note IS NULL
    )
  )
);

CREATE UNIQUE INDEX appbasis_training_plan_revision_top_level_sort_idx
  ON appbasis_training_plan_revision_item (
    organization_id,
    plan_id,
    revision,
    sort_order
  )
  WHERE parent_block_item_id IS NULL;

CREATE UNIQUE INDEX appbasis_training_plan_revision_child_sort_idx
  ON appbasis_training_plan_revision_item (
    organization_id,
    plan_id,
    revision,
    parent_block_item_id,
    sort_order
  )
  WHERE parent_block_item_id IS NOT NULL;

CREATE INDEX appbasis_training_plan_revision_source_block_idx
  ON appbasis_training_plan_revision_item (
    organization_id,
    source_block_id,
    source_block_revision,
    plan_id,
    revision
  )
  WHERE source_block_id IS NOT NULL;

CREATE INDEX appbasis_training_plan_revision_source_exercise_idx
  ON appbasis_training_plan_revision_item (
    organization_id,
    source_exercise_id,
    plan_id,
    revision
  )
  WHERE source_exercise_id IS NOT NULL;
