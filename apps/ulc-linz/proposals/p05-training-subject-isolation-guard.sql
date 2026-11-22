-- P05 SECURITY CANDIDATE / REVIEW ONLY.
-- Explicitly NOT referenced by apps/ulc-linz/appbasis.database.json.
-- NOT an automatic production/Preview migration or authority to perform a
-- subject deletion. Only run in disposable, operator-approved test databases.
--
-- Source: published migration 0017, same complete SECURITY DEFINER body.
-- Minimal delta: refuse REPEATABLE READ/SERIALIZABLE snapshots, which can
-- retain a pre-deletion view after waiting for the advisory lock.
-- This preserves all three existing trigger bindings and 35-day marker
-- policy. No DELETE, GRANT, new table, role, Worker route or scheduled job.
-- Application/erasure data flow and multi-owner restore remain separate
-- go-live blockers and are not activated by this proposal.
CREATE OR REPLACE FUNCTION ulc_linz_training_subject_write_fence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fence$
BEGIN
  -- A transaction-level snapshot may have been acquired before the
  -- erasure coordinator commits. An advisory lock only serializes execution;
  -- it does NOT refresh a REPEATABLE READ or SERIALIZABLE snapshot.
  -- Match the existing protected training-block usage guard: refuse stale
  -- isolation modes before any subject write, including direct SQL.
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'ULC training subject writes require READ COMMITTED isolation.'
      USING ERRCODE = '25001';
  END IF;

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
