-- Training documentation v2: privileged, module-local athlete subject erasure.
-- The caller must independently prove the canonical athletes-owner tombstone.
-- This schema does not install a retention job, purge, app callback or endpoint.

CREATE TABLE appbasis_training_documentation_subject_deletion (
  organization_id text NOT NULL
    CHECK (char_length(organization_id) BETWEEN 1 AND 200
      AND btrim(organization_id) = organization_id),
  subject_id text NOT NULL
    CHECK (char_length(subject_id) BETWEEN 1 AND 200
      AND btrim(subject_id) = subject_id),
  completed_at timestamptz NOT NULL,
  purge_after timestamptz NOT NULL,
  PRIMARY KEY (organization_id, subject_id),
  CHECK (purge_after = completed_at + interval '840 hours')
);

-- Subject-specific transaction locks serialize old and new module writers
-- with authorized privacy erasure. Hash collisions can only over-serialize.
CREATE FUNCTION appbasis_training_documentation_guard_subject(
  p_organization_id text,
  p_subject_id text
) RETURNS void LANGUAGE plpgsql AS $guard$
BEGIN
  IF p_subject_id IS NULL OR p_subject_id = '' THEN
    RAISE EXCEPTION 'Training documentation participant id missing.'
      USING ERRCODE = '23514';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_organization_id || chr(31) || p_subject_id, 0)
  );
  IF EXISTS (
    SELECT 1 FROM public.appbasis_training_documentation_subject_deletion
    WHERE organization_id = p_organization_id AND subject_id = p_subject_id
  ) THEN
    RAISE EXCEPTION 'Training documentation subject has a deletion marker.'
      USING ERRCODE = '23514';
  END IF;
END;
$guard$;

CREATE FUNCTION appbasis_training_documentation_guard_root_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $root$
BEGIN
  -- Even a no-op direct UPDATE locks the root tuple before a BEFORE ROW
  -- trigger. Reject every ownership-column UPDATE *before* seeking the
  -- organization lock, so such callers cannot deadlock with the owner writer.
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Training documentation root ownership is immutable.'
      USING ERRCODE = '23514';
  END IF;
  -- Serialize allowed INSERT writers before per-subject locking.
  -- The two-int advisory key space is distinct from subject bigint locks.
  PERFORM pg_advisory_xact_lock(202611031, hashtext(NEW.organization_id));
  PERFORM public.appbasis_training_documentation_guard_subject(
    NEW.organization_id, NEW.subject_id
  );
  RETURN NEW;
END;
$root$;

CREATE FUNCTION appbasis_training_documentation_guard_revision_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $revision$
DECLARE
  owner_subject text;
  scoped_subject text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id OR
       NEW.documentation_id IS DISTINCT FROM OLD.documentation_id THEN
      RAISE EXCEPTION 'Training documentation revision ownership is immutable.'
        USING ERRCODE = '23514';
    END IF;
    -- A direct runtime UPDATE gets its tuple lock BEFORE this row trigger.
    -- It must fail immediately instead of waiting for the organization lock
    -- held by concurrent privacy erasure. Only the trusted migration-owner
    -- session carrying the transaction-local erasure flag can redact history.
    IF session_user <> current_user OR
       current_setting('appbasis.training_documentation_privileged_revision_update', true)
         IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'Training documentation revision updates require privileged erasure.'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(202611031, hashtext(NEW.organization_id));
  SELECT subject_id INTO owner_subject
  FROM public.appbasis_training_documentation
  WHERE organization_id = NEW.organization_id
    AND id = NEW.documentation_id;

  IF owner_subject IS NULL THEN
    RAISE EXCEPTION 'Training documentation revision owner is missing.'
      USING ERRCODE = '23503';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(NEW.attendance_json) AS entry(item)
    WHERE jsonb_typeof(entry.item) <> 'object'
      OR jsonb_typeof(entry.item->'participantId') <> 'string'
      OR nullif(entry.item->>'participantId', '') IS NULL
  ) THEN
    RAISE EXCEPTION 'Training documentation participant reference is invalid.'
      USING ERRCODE = '23514';
  END IF;

  -- Deterministic order avoids a participant-lock cycle between writers.
  FOR scoped_subject IN
    SELECT DISTINCT identity_key
    FROM (
      SELECT owner_subject AS identity_key
      UNION ALL
      SELECT item->>'participantId'
      FROM jsonb_array_elements(NEW.attendance_json) AS entry(item)
    ) AS keys
    ORDER BY identity_key
  LOOP
    PERFORM public.appbasis_training_documentation_guard_subject(
      NEW.organization_id, scoped_subject
    );
  END LOOP;
  RETURN NEW;
END;
$revision$;

-- Functions are executable by PUBLIC by default in PostgreSQL.
-- A least-privilege backup reader must not inherit executable guard routines.
-- Trigger routines run as the migration owner with a hardened search path;
-- application writers do not require EXECUTE on the private helper.
-- Direct revision attendance UPDATE is explicitly unsupported for runtime
-- principals; only the transaction-scoped module-owner erasure path may
-- change historical attendance. Root ownership-column UPDATE is forbidden.
REVOKE EXECUTE ON FUNCTION appbasis_training_documentation_guard_subject(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION appbasis_training_documentation_guard_root_insert() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION appbasis_training_documentation_guard_revision_write() FROM PUBLIC;

CREATE TRIGGER appbasis_training_documentation_guard_root
  BEFORE INSERT OR UPDATE OF subject_id, organization_id
  ON appbasis_training_documentation
  FOR EACH ROW EXECUTE FUNCTION
    appbasis_training_documentation_guard_root_insert();

CREATE TRIGGER appbasis_training_documentation_guard_revision
  BEFORE INSERT OR UPDATE OF attendance_json, organization_id, documentation_id
  ON appbasis_training_documentation_revision
  FOR EACH ROW EXECUTE FUNCTION
    appbasis_training_documentation_guard_revision_write();
