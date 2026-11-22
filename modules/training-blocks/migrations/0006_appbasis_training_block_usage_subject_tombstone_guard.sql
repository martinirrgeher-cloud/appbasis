-- P02 SQL-level defense against replay of erased subject attribution.
-- No existing personal rows are rewritten; the marker remains authoritative.
-- Serialize with the module's lockSubjectUsage advisory namespace.
CREATE FUNCTION public.appbasis_training_block_usage_subject_tombstone_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $guard$
BEGIN
  -- REPEATABLE READ/SERIALIZABLE may use a pre-deletion snapshot even after
  -- the advisory lock is obtained. Deny these write modes outright.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Training-block attribution requires READ COMMITTED isolation'
      USING ERRCODE = '25001';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      jsonb_build_array(
        'training-block-usage-subject', NEW.organization_id::text, NEW.subject_id::text
      )::text, 0
    )
  );
  IF EXISTS (
    SELECT 1 FROM public.appbasis_training_block_usage_subject_deletion AS marker
    WHERE marker.organization_id = NEW.organization_id
      AND marker.subject_id = NEW.subject_id
  ) THEN
    RAISE EXCEPTION 'Training-block subject attribution is blocked by a deletion marker'
      USING ERRCODE = '23514',
            CONSTRAINT = 'appbasis_training_block_usage_subject_tombstone_guard';
  END IF;
  RETURN NEW;
END;
$guard$;
--> statement-breakpoint
CREATE TRIGGER appbasis_training_block_usage_subject_tombstone_guard
BEFORE INSERT OR UPDATE
ON public.appbasis_training_block_usage_subject
FOR EACH ROW
EXECUTE FUNCTION public.appbasis_training_block_usage_subject_tombstone_check();
