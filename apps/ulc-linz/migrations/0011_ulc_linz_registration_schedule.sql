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
  CONSTRAINT ulc_linz_registration_extra_day_pk
    PRIMARY KEY (organization_id, group_id, session_date),
  CONSTRAINT ulc_linz_registration_extra_day_org_check
    CHECK (char_length(organization_id) BETWEEN 1 AND 200 AND organization_id = btrim(organization_id)),
  CONSTRAINT ulc_linz_registration_extra_day_group_check
    CHECK (char_length(group_id) BETWEEN 1 AND 200 AND group_id = btrim(group_id)),
  CONSTRAINT ulc_linz_registration_extra_day_actor_check
    CHECK (char_length(approved_by_identity_id) BETWEEN 1 AND 200)
);
