-- ULC P03-E: REVIEW PROPOSAL ONLY. DO NOT APPLY TO PREVIEW OR PRODUCTION.
-- The manifest deliberately does not list this file. A deletion-marker retention
-- decision, least-privilege grants, cross-owner writer synchronization and an
-- approved rollout/rollback are mandatory before activation.
--
-- This DRAFT makes the already-tested P03-D fence reusable as inspectable SQL.
-- The candidate table itself stores subject identifiers and has NO approved
-- lifecycle/retention policy. It is created only in disposable PostgreSQL tests.
CREATE TABLE ulc_linz_p03e_candidate_subject_fence (
  organization_id text NOT NULL
    CHECK (length(btrim(organization_id)) BETWEEN 1 AND 200),
  athlete_id text NOT NULL
    CHECK (length(btrim(athlete_id)) BETWEEN 1 AND 200),
  PRIMARY KEY (organization_id, athlete_id)
);
--> statement-breakpoint
CREATE FUNCTION ulc_linz_p03e_candidate_subject_guard()
RETURNS trigger AS $$
BEGIN
  -- Serialize app-owned writes with the candidate erase/marker writer.
  -- An approved deletion coordinator must take the EXACT same lock BEFORE
  -- committing a marker/cleanup, otherwise this is not a full race guarantee.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      jsonb_build_array(NEW.organization_id, NEW.athlete_id)::text, 0
    )
  );
  IF EXISTS (
    SELECT 1 FROM ulc_linz_p03e_candidate_subject_fence f
    WHERE f.organization_id = NEW.organization_id
      AND f.athlete_id = NEW.athlete_id
  ) OR EXISTS (
    -- Existing 35-day source markers must block writes too, when present.
    -- No marker is generated, extended or purged by this SQL.
    SELECT 1 FROM appbasis_athletes_deletion d
    WHERE d.entity_type = 'athlete'
      AND d.organization_id = NEW.organization_id
      AND d.entity_id = NEW.athlete_id
  ) THEN
    RAISE EXCEPTION 'ULC_P03E_SUBJECT_WRITE_BLOCKED'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER ulc_linz_p03e_candidate_attendance_guard
BEFORE INSERT OR UPDATE ON ulc_linz_training_attendance
FOR EACH ROW EXECUTE FUNCTION ulc_linz_p03e_candidate_subject_guard();
--> statement-breakpoint
CREATE TRIGGER ulc_linz_p03e_candidate_registration_guard
BEFORE INSERT OR UPDATE ON ulc_linz_training_registration
FOR EACH ROW EXECUTE FUNCTION ulc_linz_p03e_candidate_subject_guard();
--> statement-breakpoint
CREATE TRIGGER ulc_linz_p03e_candidate_history_guard
BEFORE INSERT OR UPDATE ON ulc_linz_training_registration_change
FOR EACH ROW EXECUTE FUNCTION ulc_linz_p03e_candidate_subject_guard();
