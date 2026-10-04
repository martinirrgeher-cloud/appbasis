CREATE TABLE appbasis_exercise_catalog_item (
  id text PRIMARY KEY NOT NULL,
  organization_id text NOT NULL,
  name text NOT NULL,
  category_key text NOT NULL,
  subcategory text,
  goal text,
  description text,
  coaching_cues text,
  common_mistakes text,
  equipment text[] DEFAULT '{}'::text[] NOT NULL,
  video_url text,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT appbasis_exercise_catalog_item_id_check
    CHECK (char_length(id) BETWEEN 1 AND 200 AND id = btrim(id)),
  CONSTRAINT appbasis_exercise_catalog_item_org_check
    CHECK (char_length(organization_id) BETWEEN 1 AND 200 AND organization_id = btrim(organization_id)),
  CONSTRAINT appbasis_exercise_catalog_item_name_check
    CHECK (char_length(name) BETWEEN 2 AND 120 AND name = btrim(name)),
  CONSTRAINT appbasis_exercise_catalog_item_category_check
    CHECK (category_key ~ '^[a-z][a-z0-9_-]{0,79}$'),
  CONSTRAINT appbasis_exercise_catalog_item_subcategory_check
    CHECK (subcategory IS NULL OR (char_length(subcategory) BETWEEN 1 AND 100 AND subcategory = btrim(subcategory))),
  CONSTRAINT appbasis_exercise_catalog_item_goal_check
    CHECK (goal IS NULL OR (char_length(goal) BETWEEN 1 AND 240 AND goal = btrim(goal))),
  CONSTRAINT appbasis_exercise_catalog_item_description_check
    CHECK (description IS NULL OR (char_length(description) BETWEEN 1 AND 10000 AND description = btrim(description))),
  CONSTRAINT appbasis_exercise_catalog_item_coaching_check
    CHECK (coaching_cues IS NULL OR (char_length(coaching_cues) BETWEEN 1 AND 10000 AND coaching_cues = btrim(coaching_cues))),
  CONSTRAINT appbasis_exercise_catalog_item_mistakes_check
    CHECK (common_mistakes IS NULL OR (char_length(common_mistakes) BETWEEN 1 AND 10000 AND common_mistakes = btrim(common_mistakes))),
  CONSTRAINT appbasis_exercise_catalog_item_equipment_check
    CHECK (cardinality(equipment) <= 100 AND array_position(equipment, NULL) IS NULL),
  CONSTRAINT appbasis_exercise_catalog_item_video_check
    CHECK (video_url IS NULL OR (char_length(video_url) BETWEEN 1 AND 2000 AND (video_url LIKE 'https://%' OR video_url LIKE 'http://%')))
);
--> statement-breakpoint
CREATE UNIQUE INDEX appbasis_exercise_catalog_item_org_name_unique
  ON appbasis_exercise_catalog_item (organization_id, lower(name));
--> statement-breakpoint
CREATE INDEX appbasis_exercise_catalog_item_org_category_idx
  ON appbasis_exercise_catalog_item (organization_id, category_key, is_active);
--> statement-breakpoint
CREATE TABLE appbasis_exercise_catalog_parameter (
  organization_id text NOT NULL,
  exercise_id text NOT NULL,
  parameter_key text NOT NULL,
  label text NOT NULL,
  unit text DEFAULT '' NOT NULL,
  input_type text NOT NULL,
  default_value text,
  min_value numeric,
  max_value numeric,
  step_value numeric,
  is_required boolean DEFAULT false NOT NULL,
  sort_order integer DEFAULT 100 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT appbasis_exercise_catalog_parameter_pk
    PRIMARY KEY (organization_id, exercise_id, parameter_key),
  CONSTRAINT appbasis_exercise_catalog_parameter_org_check
    CHECK (char_length(organization_id) BETWEEN 1 AND 200 AND organization_id = btrim(organization_id)),
  CONSTRAINT appbasis_exercise_catalog_parameter_exercise_check
    CHECK (char_length(exercise_id) BETWEEN 1 AND 200 AND exercise_id = btrim(exercise_id)),
  CONSTRAINT appbasis_exercise_catalog_parameter_key_check
    CHECK (parameter_key ~ '^[a-z][a-z0-9_-]{0,79}$'),
  CONSTRAINT appbasis_exercise_catalog_parameter_label_check
    CHECK (char_length(label) BETWEEN 1 AND 80 AND label = btrim(label)),
  CONSTRAINT appbasis_exercise_catalog_parameter_unit_check
    CHECK (char_length(unit) <= 20 AND unit = btrim(unit)),
  CONSTRAINT appbasis_exercise_catalog_parameter_type_check
    CHECK (input_type IN ('number', 'text')),
  CONSTRAINT appbasis_exercise_catalog_parameter_default_check
    CHECK (default_value IS NULL OR char_length(default_value) <= 200),
  CONSTRAINT appbasis_exercise_catalog_parameter_range_check
    CHECK (min_value IS NULL OR max_value IS NULL OR min_value <= max_value),
  CONSTRAINT appbasis_exercise_catalog_parameter_step_check
    CHECK (step_value IS NULL OR step_value > 0),
  CONSTRAINT appbasis_exercise_catalog_parameter_sort_check
    CHECK (sort_order BETWEEN 0 AND 100000)
);
--> statement-breakpoint
CREATE INDEX appbasis_exercise_catalog_parameter_exercise_idx
  ON appbasis_exercise_catalog_parameter (organization_id, exercise_id, sort_order, parameter_key);
--> statement-breakpoint
CREATE TABLE appbasis_exercise_catalog_audience (
  organization_id text NOT NULL,
  exercise_id text NOT NULL,
  audience_id text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT appbasis_exercise_catalog_audience_pk
    PRIMARY KEY (organization_id, exercise_id, audience_id),
  CONSTRAINT appbasis_exercise_catalog_audience_org_check
    CHECK (char_length(organization_id) BETWEEN 1 AND 200 AND organization_id = btrim(organization_id)),
  CONSTRAINT appbasis_exercise_catalog_audience_exercise_check
    CHECK (char_length(exercise_id) BETWEEN 1 AND 200 AND exercise_id = btrim(exercise_id)),
  CONSTRAINT appbasis_exercise_catalog_audience_id_check
    CHECK (char_length(audience_id) BETWEEN 1 AND 200 AND audience_id = btrim(audience_id))
);
--> statement-breakpoint
CREATE INDEX appbasis_exercise_catalog_audience_lookup_idx
  ON appbasis_exercise_catalog_audience (organization_id, audience_id, exercise_id);
--> statement-breakpoint
CREATE TABLE appbasis_exercise_catalog_favorite (
  organization_id text NOT NULL,
  principal_id text NOT NULL,
  exercise_id text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT appbasis_exercise_catalog_favorite_pk
    PRIMARY KEY (organization_id, principal_id, exercise_id),
  CONSTRAINT appbasis_exercise_catalog_favorite_org_check
    CHECK (char_length(organization_id) BETWEEN 1 AND 200 AND organization_id = btrim(organization_id)),
  CONSTRAINT appbasis_exercise_catalog_favorite_principal_check
    CHECK (char_length(principal_id) BETWEEN 1 AND 200 AND principal_id = btrim(principal_id)),
  CONSTRAINT appbasis_exercise_catalog_favorite_exercise_check
    CHECK (char_length(exercise_id) BETWEEN 1 AND 200 AND exercise_id = btrim(exercise_id))
);
--> statement-breakpoint
CREATE INDEX appbasis_exercise_catalog_favorite_principal_idx
  ON appbasis_exercise_catalog_favorite (organization_id, principal_id, exercise_id);
