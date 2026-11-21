-- P2–P4 REVIEW CANDIDATE ONLY; never run against Preview or Production.
-- This REPLACES the body of an already-installed 0017 function in a
-- disposable local PostgreSQL test; it is NOT a versioned migration.
-- Require a separate migration, live-role analysis, source-owner writer lock
-- review, production release and privacy approval before any real deployment.
--
-- Lock order matters: the authoritative athlete row is locked FOR SHARE
-- BEFORE the app-owned subject advisory lock. The canonical athlete eraser
-- first locks the athlete row FOR UPDATE. This avoids the opposite-order
-- deadlock while serializing ordinary writes against canonical deletions.
CREATE OR REPLACE FUNCTION public.ulc_linz_training_subject_write_fence()
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

  -- The canonical source-owner row must still exist, be active and belong to
  -- the same organization. Otherwise no new personal training writes.
  PERFORM 1 FROM public.appbasis_athlete
   WHERE id = NEW.athlete_id AND organization_id = NEW.organization_id
     AND is_active = true
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Training subject is no longer an active canonical athlete.'
      USING ERRCODE = '23514';
  END IF;

  PERFORM 1 FROM public.ulc_linz_training_session
   WHERE id = NEW.session_id AND organization_id = NEW.organization_id
   FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Training session ownership scope invalid.'
      USING ERRCODE = '23514';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      NEW.organization_id || pg_catalog.chr(31) || NEW.athlete_id, 0
    )
  );
  -- Both sources are checked. 0017 checks only the app-owned marker,
  -- which can lag the authoritative athlete deletion.
  IF EXISTS (
    SELECT 1 FROM public.appbasis_athletes_deletion
    WHERE entity_type = 'athlete'
      AND entity_id = NEW.athlete_id
      AND organization_id = NEW.organization_id
  ) OR EXISTS (
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
REVOKE ALL ON FUNCTION public.ulc_linz_training_subject_write_fence() FROM PUBLIC;
