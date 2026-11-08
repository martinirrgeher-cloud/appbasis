-- G-04: clean, non-personal app-owned registration calendar.
-- REVIEW ONLY until registered as schema-v17 in appbasis.database.json under
-- a separate approved migration gate. This file is NOT part of active runtime.
-- Existing registration/attendance records are not modified or dropped.
-- A missing group policy retains unrestricted legacy 7-day registration.
CREATE TABLE ulc_linz_registration_calendar_rule (
  organization_id text NOT NULL CHECK (
    char_length(organization_id) BETWEEN 1 AND 200
    AND organization_id = btrim(organization_id)
  ),
  group_id text NOT NULL REFERENCES appbasis_training_group(id),
  weekdays_mask smallint NOT NULL CHECK (weekdays_mask BETWEEN 1 AND 127),
  weeks_ahead smallint NOT NULL CHECK (weeks_ahead BETWEEN 0 AND 26),
  deadline_days_before smallint NULL CHECK (deadline_days_before BETWEEN 0 AND 14),
  deadline_local_time text NULL CHECK (
    deadline_local_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  ),
  late_mode text NOT NULL CHECK (late_mode IN ('allow', 'block')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, group_id),
  CONSTRAINT ulc_linz_calendar_deadline_pair CHECK (
    (deadline_days_before IS NULL) = (deadline_local_time IS NULL)
  )
);
--> statement-breakpoint
-- An explicit per-date exception. "extra" opens an unscheduled day;
-- "cancelled" closes a regular or exceptional day; "none" resets it\n-- without reusing a stale CAS revision. No identity, note or
-- free-text field: calendar state is separated from member registrations.
CREATE TABLE ulc_linz_registration_calendar_exception (
  organization_id text NOT NULL CHECK (
    char_length(organization_id) BETWEEN 1 AND 200
    AND organization_id = btrim(organization_id)
  ),
  group_id text NOT NULL REFERENCES appbasis_training_group(id),
  session_date date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('extra', 'cancelled', 'none')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, group_id, session_date)
);
--> statement-breakpoint
CREATE INDEX ulc_linz_registration_calendar_exception_group_date_idx
  ON ulc_linz_registration_calendar_exception (organization_id, group_id, session_date);
