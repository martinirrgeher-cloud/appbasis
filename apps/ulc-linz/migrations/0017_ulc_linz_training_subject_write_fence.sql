-- Published ULC owner migration. The SQL DDL below is identical to
-- the CI-tested, operator-approved isolated Preview candidate.
-- This file is for fresh installations only. Existing Preview has already
-- applied this DDL; use an explicit read-only schema reconciliation instead.
-- No automatic retention, purge, production upgrade, or global GRANT.
CREATE TABLE ulc_linz_training_subject_deletion (
  organization_id text NOT NULL
    CHECK (char_length(organization_id) BETWEEN 1 AND 200
      AND organization_id = btrim(organization_id)),
  athlete_id text NOT NULL
    CHECK (char_length(athlete_id) BETWEEN 1 AND 200
      AND athlete_id = btrim(athlete_id)),
  completed_at timestamptz NOT NULL,
  purge_after timestamptz NOT NULL,
  PRIMARY KEY (organization_id, athlete_id),
  CONSTRAINT ulc_linz_training_subject_deletion_retention_check
    CHECK (purge_after = completed_at + interval '840 hours')
);
--> statement-breakpoint
-- One trigger protects attendance, registration and revision/change history.
-- Serialize stale writers against a trusted marker+delete transaction.
-- Reject UPDATE attempts to switch an existing row to another subject/org.
CREATE FUNCTION ulc_linz_training_subject_write_fence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fence$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.organization_id IS DISTINCT FROM OLD.organization_id OR
    NEW.athlete_id IS DISTINCT FROM OLD.athlete_id
  ) THEN
    RAISE EXCEPTION 'Training row subject ownership is immutable.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.organization_id IS NULL OR NEW.athlete_id IS NULL OR
     char_length(NEW.organization_id) NOT BETWEEN 1 AND 200 OR
     char_length(NEW.athlete_id) NOT BETWEEN 1 AND 200 OR
     NEW.organization_id <> btrim(NEW.organization_id) OR
     NEW.athlete_id <> btrim(NEW.athlete_id) THEN
    RAISE EXCEPTION 'Training subject scope invalid.'
      USING ERRCODE = '23514';
  END IF;

  -- The app-owned child row must belong to this exact session scope.
  -- An arbitrary organization_id on an old direct SQL writer is not
  -- sufficient to bypass another organization's subject deletion marker.
  PERFORM 1 FROM public.ulc_linz_training_session
   WHERE id = NEW.session_id AND organization_id = NEW.organization_id
   FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Training session ownership scope invalid.'
      USING ERRCODE = '23514';
  END IF;

  -- A fixed organization+subject key; collision over-serializes only.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      NEW.organization_id || pg_catalog.chr(31) || NEW.athlete_id, 0
    )
  );
  IF EXISTS (
    SELECT 1 FROM public.ulc_linz_training_subject_deletion
     WHERE organization_id = NEW.organization_id
       AND athlete_id = NEW.athlete_id
  ) THEN
    RAISE EXCEPTION 'Training subject has a deletion marker.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$fence$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION ulc_linz_training_subject_write_fence() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER ulc_linz_training_attendance_subject_fence
  BEFORE INSERT OR UPDATE ON ulc_linz_training_attendance
  FOR EACH ROW EXECUTE FUNCTION ulc_linz_training_subject_write_fence();
--> statement-breakpoint
CREATE TRIGGER ulc_linz_training_registration_subject_fence
  BEFORE INSERT OR UPDATE ON ulc_linz_training_registration
  FOR EACH ROW EXECUTE FUNCTION ulc_linz_training_subject_write_fence();
--> statement-breakpoint
CREATE TRIGGER ulc_linz_training_registration_change_subject_fence
  BEFORE INSERT OR UPDATE ON ulc_linz_training_registration_change
  FOR EACH ROW EXECUTE FUNCTION ulc_linz_training_subject_write_fence();
