CREATE TABLE appbasis_athletes_deletion (
  entity_type text NOT NULL CHECK (entity_type IN ('athlete', 'trainer')),
  entity_id text NOT NULL CHECK (length(btrim(entity_id)) BETWEEN 1 AND 200),
  organization_id text NOT NULL CHECK (length(btrim(organization_id)) BETWEEN 1 AND 200),
  completed_at timestamptz NOT NULL,
  purge_after timestamptz NOT NULL,
  PRIMARY KEY (entity_type, entity_id),
  CHECK (purge_after = completed_at + interval '35 days')
);
