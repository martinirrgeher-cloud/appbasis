-- ULC lifecycle schema v15: independent U14 and Kindertraining category catalogs.
-- Existing v14 table and historical U12 training data remain untouched.
CREATE TABLE ulc_linz_youth_group_category (
  organization_id text NOT NULL,
  training_area text NOT NULL,
  code text NOT NULL,
  label text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ulc_linz_youth_group_category_pk
    PRIMARY KEY (organization_id, training_area, code),
  CONSTRAINT ulc_linz_youth_group_category_area_check
    CHECK (training_area IN ('u14', 'kindertraining')),
  CONSTRAINT ulc_linz_youth_group_category_code_check
    CHECK (code ~ '^[a-z][a-z0-9_]{0,79}$'),
  CONSTRAINT ulc_linz_youth_group_category_label_check
    CHECK (char_length(label) BETWEEN 1 AND 120 AND label = btrim(label)
           AND label !~ '[[:cntrl:]]'),
  CONSTRAINT ulc_linz_youth_group_category_revision_check CHECK (revision > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX ulc_linz_youth_group_category_name_unique
  ON ulc_linz_youth_group_category (organization_id, training_area, lower(label));
--> statement-breakpoint
CREATE INDEX ulc_linz_youth_group_category_active_idx
  ON ulc_linz_youth_group_category (organization_id, training_area, is_active, label);
