-- v16: additive, app-owned trainer presence per youth training session.
-- Only selected present trainers have a row; absence is represented by no row.
-- Keep historical presence when a trainer leaves a group; service scopes the roster.
CREATE TABLE ulc_linz_training_trainer_attendance (
  organization_id text NOT NULL,
  session_id text NOT NULL REFERENCES ulc_linz_training_session(id) ON DELETE CASCADE,
  trainer_id text NOT NULL REFERENCES appbasis_trainer(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ulc_linz_training_trainer_attendance_pk PRIMARY KEY (session_id, trainer_id)
);
--> statement-breakpoint
CREATE INDEX ulc_linz_training_trainer_attendance_org_session_idx
  ON ulc_linz_training_trainer_attendance (organization_id, session_id);
