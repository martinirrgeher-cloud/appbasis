ALTER TABLE appbasis_permission_role
  ADD COLUMN display_name text,
  ADD COLUMN description text,
  ADD COLUMN state text NOT NULL DEFAULT 'active',
  ADD COLUMN kind text NOT NULL DEFAULT 'system';

ALTER TABLE appbasis_permission_role
  ADD CONSTRAINT appbasis_permission_role_display_name_check
    CHECK (
      display_name IS NULL
      OR (
        length(btrim(display_name)) BETWEEN 1 AND 120
        AND display_name = btrim(display_name)
      )
    ),
  ADD CONSTRAINT appbasis_permission_role_description_check
    CHECK (
      description IS NULL
      OR length(description) <= 500
    ),
  ADD CONSTRAINT appbasis_permission_role_state_check
    CHECK (state IN ('active', 'inactive')),
  ADD CONSTRAINT appbasis_permission_role_kind_check
    CHECK (kind IN ('system', 'managed'));

CREATE INDEX appbasis_permission_role_state_idx
  ON appbasis_permission_role (state);

CREATE INDEX appbasis_permission_role_kind_idx
  ON appbasis_permission_role (kind);
