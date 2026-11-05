-- A02.4 – app-owned scheduling policy, intentionally not in the published
-- ULC database manifest until all authenticated/atomic write gates are proven.
-- This migration must never be applied to Preview or Production from a draft.
CREATE TABLE ulc_linz_registration_group_policy (
  organization_id text NOT NULL
    CONSTRAINT ulc_linz_registration_policy_org_check
      CHECK (char_length(organization_id) BETWEEN 1 AND 200 AND organization_id = btrim(organization_id)),
  group_id text NOT NULL
    CONSTRAINT ulc_linz_registration_policy_group_check
      CHECK (char_length(group_id) BETWEEN 1 AND 200 AND group_id = btrim(group_id)),
  -- Bits 0..6 correspond to Monday..Sunday. 127 enables all days.
  weekdays_mask integer NOT NULL
    CONSTRAINT ulc_linz_registration_policy_weekdays_check
      CHECK (weekdays_mask BETWEEN 1 AND 127),
  weeks_ahead integer NOT NULL
    CONSTRAINT ulc_linz_registration_policy_weeks_check
      CHECK (weeks_ahead BETWEEN 0 AND 26),
  deadline_days_before integer NULL
    CONSTRAINT ulc_linz_registration_policy_days_before_check
      CHECK (deadline_days_before BETWEEN 0 AND 14),
  -- Precise local-wall HH:MM; Europe/Vienna is always the time zone.
  deadline_local_time text NULL
    CONSTRAINT ulc_linz_registration_policy_time_check
      CHECK (deadline_local_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  late_mode text NOT NULL
    CONSTRAINT ulc_linz_registration_policy_late_check
      CHECK (late_mode IN ('allow', 'block')),
  revision integer NOT NULL DEFAULT 1
    CONSTRAINT ulc_linz_registration_policy_revision_check
      CHECK (revision >= 1),
  updated_by_identity_id text NOT NULL
    CONSTRAINT ulc_linz_registration_policy_actor_check
      CHECK (char_length(updated_by_identity_id) BETWEEN 1 AND 200),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ulc_linz_registration_policy_deadline_pair_check
    CHECK ((deadline_days_before IS NULL) = (deadline_local_time IS NULL)),
  CONSTRAINT ulc_linz_registration_policy_pk PRIMARY KEY (organization_id, group_id)
);
--> statement-breakpoint
-- A prior session or registration is not an authorization to bypass weekdays.
-- Only these explicit, organization-scoped approvals qualify as extra days.
CREATE TABLE ulc_linz_registration_extra_day (
  organization_id text NOT NULL,
  group_id text NOT NULL,
  session_date date NOT NULL,
  approved_by_identity_id text NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now(),
  is_approved boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 1
    CONSTRAINT ulc_linz_registration_extra_day_revision_check
      CHECK (revision >= 1),
  updated_by_identity_id text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ulc_linz_registration_extra_day_updated_actor_check
    CHECK (char_length(updated_by_identity_id) BETWEEN 1 AND 200),
  CONSTRAINT ulc_linz_registration_extra_day_pk
    PRIMARY KEY (organization_id, group_id, session_date),
  CONSTRAINT ulc_linz_registration_extra_day_org_check
    CHECK (char_length(organization_id) BETWEEN 1 AND 200 AND organization_id = btrim(organization_id)),
  CONSTRAINT ulc_linz_registration_extra_day_group_check
    CHECK (char_length(group_id) BETWEEN 1 AND 200 AND group_id = btrim(group_id)),
  CONSTRAINT ulc_linz_registration_extra_day_actor_check
    CHECK (char_length(approved_by_identity_id) BETWEEN 1 AND 200)
);

--> statement-breakpoint
-- Append-only, versioned approval/revocation history. No free text is stored.
CREATE TABLE ulc_linz_registration_extra_day_change (
  organization_id text NOT NULL,
  group_id text NOT NULL,
  session_date date NOT NULL,
  revision integer NOT NULL CHECK (revision >= 1),
  is_approved boolean NOT NULL,
  actor_identity_id text NOT NULL CHECK (char_length(actor_identity_id) BETWEEN 1 AND 200),
  changed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ulc_linz_registration_extra_day_change_pk
    PRIMARY KEY (organization_id, group_id, session_date, revision)
);

--> statement-breakpoint
-- Enforce configured policy on both INSERT and UPDATE. Registration writers
-- must not be able to bypass this by issuing an authenticated direct POST.
-- Group row lock is acquired BEFORE reading policy; the authorized admin
-- policy writer must take an incompatible FOR UPDATE on the same row.
CREATE FUNCTION ulc_linz_registration_schedule_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $registration_guard$
DECLARE
  v_group text;
  v_date date;
  v_state text;
  v_policy public.ulc_linz_registration_group_policy%ROWTYPE;
  v_today date;
  v_deadline_local timestamp without time zone;
  v_cutoff timestamp with time zone;
  v_first timestamp with time zone;
  v_local_guess timestamp without time zone;
  v_allowed_day boolean;
  v_extra_approved boolean;
BEGIN
  SELECT session.group_id, session.session_date, session.state
    INTO v_group, v_date, v_state
  FROM public.ulc_linz_training_session AS session
  WHERE session.organization_id = NEW.organization_id
    AND session.id = NEW.session_id;
  IF NOT FOUND OR v_state <> 'scheduled' THEN
    RAISE EXCEPTION 'Registration session is unavailable' USING ERRCODE = 'UL024';
  END IF;

  -- This lock serializes with policy administration and the group's
  -- activation/mode changes. It is not acquired by the browser.
  PERFORM 1
  FROM public.appbasis_training_group AS training_group
  WHERE training_group.organization_id = NEW.organization_id
    AND training_group.id = v_group
    AND training_group.is_active = true
    AND training_group.attendance_mode = 'self_registration'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registration group is unavailable' USING ERRCODE = 'UL024';
  END IF;

  SELECT policy.* INTO v_policy
  FROM public.ulc_linz_registration_group_policy AS policy
  WHERE policy.organization_id = NEW.organization_id
    AND policy.group_id = v_group
  FOR SHARE;
  IF NOT FOUND THEN
    -- Previously accepted registration behavior remains unchanged for
    -- groups that have no explicitly configured schedule.
    RETURN NEW;
  END IF;

  v_today := (clock_timestamp() AT TIME ZONE 'Europe/Vienna')::date;
  v_allowed_day :=
    (v_policy.weekdays_mask &
     (1 << (EXTRACT(ISODOW FROM v_date)::int - 1))) <> 0;
  IF NOT v_allowed_day THEN
    SELECT extra_day.is_approved INTO v_extra_approved
    FROM public.ulc_linz_registration_extra_day AS extra_day
    WHERE extra_day.organization_id = NEW.organization_id
      AND extra_day.group_id = v_group
      AND extra_day.session_date = v_date
    FOR SHARE;
    v_allowed_day := COALESCE(v_extra_approved, false);
  END IF;
  IF NOT v_allowed_day THEN
    RAISE EXCEPTION 'Registration is not open on this training day' USING ERRCODE = 'UL024';
  END IF;

  IF v_date < v_today OR
    date_trunc('week', v_date::timestamp) >
      date_trunc('week', v_today::timestamp) +
      make_interval(weeks => v_policy.weeks_ahead) THEN
    RAISE EXCEPTION 'Registration is outside the permitted weeks' USING ERRCODE = 'UL024';
  END IF;

  IF v_policy.deadline_days_before IS NOT NULL AND v_policy.late_mode = 'block' THEN
    v_deadline_local :=
      (v_date - v_policy.deadline_days_before)::date +
      v_policy.deadline_local_time::time;
    -- PostgreSQL chooses the later occurrence of an ambiguous autumn clock
    -- time. Pick the earlier occurrence so registration never reopens.
    v_cutoff := v_deadline_local AT TIME ZONE 'Europe/Vienna';
    v_first := v_cutoff - interval '1 hour';
    IF (v_first AT TIME ZONE 'Europe/Vienna') = v_deadline_local THEN
      v_cutoff := v_first;
    ELSE
      -- Nonexistent 02:xx time on spring transition: close at the first
      -- existing local minute (03:00), not at the shifted 03:xx time.
      v_local_guess := v_cutoff AT TIME ZONE 'Europe/Vienna';
      IF v_local_guess > v_deadline_local THEN
        v_cutoff := date_trunc('hour', v_local_guess)
          AT TIME ZONE 'Europe/Vienna';
      END IF;
    END IF;
    IF clock_timestamp() > v_cutoff THEN
      RAISE EXCEPTION 'Registration deadline passed' USING ERRCODE = 'UL024';
    END IF;
  END IF;
  RETURN NEW;
END;
$registration_guard$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION ulc_linz_registration_schedule_guard() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER ulc_linz_registration_schedule_guard_trg
BEFORE INSERT OR UPDATE ON ulc_linz_training_registration
FOR EACH ROW EXECUTE FUNCTION ulc_linz_registration_schedule_guard();
