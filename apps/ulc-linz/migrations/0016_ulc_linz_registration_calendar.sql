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
-- "cancelled" closes a regular or exceptional day; "none" resets it
-- without reusing a stale CAS revision. No identity, note or
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
-- Defence in depth: enforce date, exception and deadline inside each registration
-- INSERT/UPDATE, not only in the UI or API. Locks serialize against rule and
-- exception CAS writes, which acquire FOR UPDATE on the same training group.
-- This is still an UNPUBLISHED migration candidate; no Preview/Production DDL.
CREATE FUNCTION ulc_linz_registration_calendar_guard()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $calendar_guard$
DECLARE
  v_group text;
  v_date date;
  v_state text;
  v_module text;
  v_policy public.ulc_linz_registration_calendar_rule%ROWTYPE;
  v_kind text;
  v_allowed boolean;
  v_today date;
  v_deadline_local timestamp without time zone;
  v_cutoff timestamptz;
  v_first timestamptz;
  v_local_guess timestamp without time zone;
BEGIN
  SELECT session.group_id, session.session_date, session.state, session.module_id
    INTO v_group, v_date, v_state, v_module
    FROM public.ulc_linz_training_session AS session
   WHERE session.id = NEW.session_id
     AND session.organization_id = NEW.organization_id;
  IF NOT FOUND OR v_state <> 'scheduled' THEN
    RAISE EXCEPTION 'Registration session unavailable' USING ERRCODE = 'UL024';
  END IF;
  IF v_module <> 'kindertraining' THEN
    RETURN NEW;
  END IF;

  PERFORM 1 FROM public.appbasis_training_group AS training_group
   WHERE training_group.id = v_group
     AND training_group.organization_id = NEW.organization_id
     AND training_group.is_active = true
     AND training_group.attendance_mode = 'self_registration'
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registration group unavailable' USING ERRCODE = 'UL024';
  END IF;

  SELECT * INTO v_policy FROM public.ulc_linz_registration_calendar_rule
   WHERE organization_id = NEW.organization_id AND group_id = v_group
   FOR SHARE;
  -- Even when no weekly rule exists, an explicit cancellation still blocks.
  SELECT kind INTO v_kind FROM public.ulc_linz_registration_calendar_exception
   WHERE organization_id = NEW.organization_id
     AND group_id = v_group AND session_date = v_date
   FOR SHARE;
  IF v_kind = 'cancelled' THEN
    RAISE EXCEPTION 'Training day cancelled' USING ERRCODE = 'UL024';
  END IF;
  IF v_policy.group_id IS NULL THEN
    RETURN NEW; -- Legacy unconfigured groups keep their seven-day behavior.
  END IF;

  v_allowed := (v_policy.weekdays_mask &
    (1 << (EXTRACT(ISODOW FROM v_date)::int - 1))) <> 0;
  IF NOT v_allowed AND v_kind IS DISTINCT FROM 'extra' THEN
    RAISE EXCEPTION 'Not an approved training day' USING ERRCODE = 'UL024';
  END IF;
  v_today := (clock_timestamp() AT TIME ZONE 'Europe/Vienna')::date;
  IF v_date < v_today OR
     date_trunc('week', v_date::timestamp) >
     date_trunc('week', v_today::timestamp) +
       make_interval(weeks => v_policy.weeks_ahead) THEN
    RAISE EXCEPTION 'Registration outside allowed date window' USING ERRCODE = 'UL024';
  END IF;
  IF v_policy.deadline_days_before IS NOT NULL AND v_policy.late_mode = 'block' THEN
    v_deadline_local :=
      (v_date - v_policy.deadline_days_before)::date +
      v_policy.deadline_local_time::time;
    -- On Vienna autumn DST overlap choose the EARLIER occurrence. Never reopen.
    v_cutoff := v_deadline_local AT TIME ZONE 'Europe/Vienna';
    v_first := v_cutoff - interval '1 hour';
    IF (v_first AT TIME ZONE 'Europe/Vienna') = v_deadline_local THEN
      v_cutoff := v_first;
    ELSE
      -- Nonexistent spring-clock local times close at the first valid minute.
      v_local_guess := v_cutoff AT TIME ZONE 'Europe/Vienna';
      IF v_local_guess > v_deadline_local THEN
        v_cutoff := date_trunc('hour', v_local_guess) AT TIME ZONE 'Europe/Vienna';
      END IF;
    END IF;
    IF clock_timestamp() > v_cutoff THEN
      RAISE EXCEPTION 'Registration deadline passed' USING ERRCODE = 'UL024';
    END IF;
  END IF;
  RETURN NEW;
END;
$calendar_guard$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION ulc_linz_registration_calendar_guard() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER ulc_linz_registration_calendar_guard_trg
BEFORE INSERT OR UPDATE ON ulc_linz_training_registration
FOR EACH ROW EXECUTE FUNCTION ulc_linz_registration_calendar_guard();
