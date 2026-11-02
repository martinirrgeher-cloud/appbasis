-- Privileged, module-owned personal favorite tombstone.
-- A separate controlled retention job must later purge expired markers.
-- NO foreign key into identity or other module owners.
CREATE TABLE appbasis_training_block_favorite_deletion (
  organization_id text NOT NULL,
  principal_id text NOT NULL,
  completed_at timestamptz NOT NULL,
  purge_after timestamptz NOT NULL,
  PRIMARY KEY (organization_id, principal_id),
  CONSTRAINT appbasis_training_block_favorite_deletion_org_check
    CHECK (char_length(organization_id) BETWEEN 1 AND 200 AND btrim(organization_id) = organization_id),
  CONSTRAINT appbasis_training_block_favorite_deletion_principal_check
    CHECK (char_length(principal_id) BETWEEN 1 AND 200 AND btrim(principal_id) = principal_id),
  CONSTRAINT appbasis_training_block_favorite_deletion_retention_check
    CHECK (purge_after = completed_at + interval '840 hours')
);
