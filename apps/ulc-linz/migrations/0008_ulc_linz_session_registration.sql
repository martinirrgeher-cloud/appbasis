-- Athlete intentions are independent of trainer-confirmed attendance.
-- The application must authorize actor-to-athlete mapping and group eligibility.
CREATE TABLE ulc_linz_training_registration (
  organization_id text NOT NULL,
  session_id text NOT NULL,
  athlete_id text NOT NULL,
  intention text NOT NULL DEFAULT 'unknown'
    CONSTRAINT ulc_linz_training_registration_intention_check
    CHECK (intention IN ('unknown', 'attending', 'not_attending', 'maybe')),
  revision integer NOT NULL DEFAULT 1
    CONSTRAINT ulc_linz_training_registration_revision_check CHECK (revision >= 1),
  updated_by_identity_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, athlete_id)
);
--> statement-breakpoint
CREATE INDEX ulc_linz_training_registration_org_athlete_idx
  ON ulc_linz_training_registration (organization_id, athlete_id, session_id);
--> statement-breakpoint
CREATE TABLE ulc_linz_training_registration_change (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  session_id text NOT NULL,
  athlete_id text NOT NULL,
  intention text NOT NULL
    CONSTRAINT ulc_linz_training_registration_change_intention_check
    CHECK (intention IN ('unknown', 'attending', 'not_attending', 'maybe')),
  revision integer NOT NULL CHECK (revision >= 1),
  actor_identity_id text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, athlete_id, revision)
);
--> statement-breakpoint
CREATE INDEX ulc_linz_training_registration_change_org_idx
  ON ulc_linz_training_registration_change (organization_id, session_id, athlete_id);
