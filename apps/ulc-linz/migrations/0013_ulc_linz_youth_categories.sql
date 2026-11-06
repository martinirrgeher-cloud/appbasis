-- ULC schema v14. Shared club-wide categories for U12, U14 and Kindertraining.
-- Never mutate historical training_content_titles/content_slots or session JSON.
CREATE TABLE ulc_linz_youth_content_category (
  organization_id text NOT NULL,
  code text NOT NULL,
  label text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ulc_linz_youth_category_pk PRIMARY KEY (organization_id, code),
  CONSTRAINT ulc_linz_youth_category_code_check
    CHECK (code ~ '^[a-z][a-z0-9_]{0,79}$'),
  CONSTRAINT ulc_linz_youth_category_label_check
    CHECK (char_length(label) BETWEEN 1 AND 120 AND label = btrim(label)
           AND label !~ '[[:cntrl:]]'),
  CONSTRAINT ulc_linz_youth_category_revision_check CHECK (revision > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX ulc_linz_youth_category_name_unique
  ON ulc_linz_youth_content_category (organization_id, lower(label));
--> statement-breakpoint
CREATE INDEX ulc_linz_youth_category_active_idx
  ON ulc_linz_youth_content_category (organization_id, is_active, label);
--> statement-breakpoint
-- Initial default categories are seeded idempotently per organization by
-- the shared repository on first access, not as an unreviewed data write
-- inside the schema migration.
