ALTER TABLE appbasis_athlete
  ADD CONSTRAINT appbasis_athlete_org_id_unique
  UNIQUE (organization_id, id);
--> statement-breakpoint
CREATE TABLE appbasis_athlete_contact (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  athlete_id text NOT NULL,
  contact_name text NOT NULL
    CHECK (length(btrim(contact_name)) BETWEEN 1 AND 120),
  relationship text
    CHECK (relationship IS NULL OR length(btrim(relationship)) BETWEEN 1 AND 80),
  phone text NOT NULL
    CHECK (length(btrim(phone)) BETWEEN 3 AND 80),
  is_emergency boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 1
    CHECK (priority BETWEEN 1 AND 1000),
  notes text
    CHECK (notes IS NULL OR length(notes) <= 3000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT appbasis_athlete_contact_athlete_fk
    FOREIGN KEY (organization_id, athlete_id)
    REFERENCES appbasis_athlete (organization_id, id)
    ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX appbasis_athlete_contact_athlete_idx
  ON appbasis_athlete_contact (
    organization_id,
    athlete_id,
    priority,
    contact_name,
    id
  );
