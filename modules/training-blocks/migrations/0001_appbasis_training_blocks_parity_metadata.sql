CREATE TABLE appbasis_training_block_favorite (
  organization_id text NOT NULL,
  principal_id text NOT NULL,
  block_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, principal_id, block_id),
  CONSTRAINT appbasis_training_block_favorite_block_fk
    FOREIGN KEY (organization_id, block_id)
    REFERENCES appbasis_training_block (organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT appbasis_training_block_favorite_org_check
    CHECK (
      char_length(organization_id) BETWEEN 1 AND 200
      AND btrim(organization_id) = organization_id
    ),
  CONSTRAINT appbasis_training_block_favorite_principal_check
    CHECK (
      char_length(principal_id) BETWEEN 1 AND 200
      AND btrim(principal_id) = principal_id
    ),
  CONSTRAINT appbasis_training_block_favorite_block_check
    CHECK (
      char_length(block_id) BETWEEN 1 AND 200
      AND btrim(block_id) = block_id
    )
);

CREATE INDEX appbasis_training_block_favorite_principal_idx
  ON appbasis_training_block_favorite (
    organization_id,
    principal_id,
    block_id
  );

CREATE TABLE appbasis_training_block_usage (
  organization_id text NOT NULL,
  id text NOT NULL,
  block_id text NOT NULL,
  occurred_at timestamptz NOT NULL,
  source_kind text NOT NULL,
  source_ref text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id),
  CONSTRAINT appbasis_training_block_usage_block_fk
    FOREIGN KEY (organization_id, block_id)
    REFERENCES appbasis_training_block (organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT appbasis_training_block_usage_org_check
    CHECK (
      char_length(organization_id) BETWEEN 1 AND 200
      AND btrim(organization_id) = organization_id
    ),
  CONSTRAINT appbasis_training_block_usage_id_check
    CHECK (
      char_length(id) BETWEEN 1 AND 200
      AND btrim(id) = id
    ),
  CONSTRAINT appbasis_training_block_usage_block_check
    CHECK (
      char_length(block_id) BETWEEN 1 AND 200
      AND btrim(block_id) = block_id
    ),
  CONSTRAINT appbasis_training_block_usage_source_kind_check
    CHECK (source_kind ~ '^[a-z][a-z0-9_-]{0,79}$'),
  CONSTRAINT appbasis_training_block_usage_source_ref_check
    CHECK (
      source_ref IS NULL
      OR (
        char_length(source_ref) BETWEEN 1 AND 500
        AND btrim(source_ref) = source_ref
      )
    ),
  CONSTRAINT appbasis_training_block_usage_note_check
    CHECK (
      note IS NULL
      OR (
        char_length(note) BETWEEN 1 AND 2000
        AND btrim(note) = note
      )
    )
);

CREATE INDEX appbasis_training_block_usage_block_idx
  ON appbasis_training_block_usage (
    organization_id,
    block_id,
    occurred_at DESC,
    id DESC
  );
