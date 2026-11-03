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
    SELECT 1 FROM appbasis_training_documentation_subject_deletion
    WHERE organization_id = p_organization_id AND subject_id = p_subject_id
  ) THEN
    RAISE EXCEPTION 'Training documentation subject has a deletion marker.'
      USING ERRCODE = '23514';
  END IF;
END;
$guard$;

CREATE FUNCTION appbasis_training_documentation_guard_root_insert()
RETURNS trigger LANGUAGE plpgsql AS $root$
BEGIN
  PERFORM appbasis_training_documentation_guard_subject(
    NEW.organization_id, NEW.subject_id
  );
  RETURN NEW;
END;
$root$;

CREATE FUNCTION appbasis_training_documentation_guard_revision_write()
RETURNS trigger LANGUAGE plpgsql AS $revision$
DECLARE
  owner_subject text;
  scoped_subject text;
BEGIN
  SELECT subject_id INTO owner_subject
  FROM appbasis_training_documentation
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
    PERFORM appbasis_training_documentation_guard_subject(
      NEW.organization_id, scoped_subject
    );
  END LOOP;
  RETURN NEW;
END;
$revision$;

CREATE TRIGGER appbasis_training_documentation_guard_root
  BEFORE INSERT OR UPDATE OF subject_id ON appbasis_training_documentation
  FOR EACH ROW EXECUTE FUNCTION
    appbasis_training_documentation_guard_root_insert();

CREATE TRIGGER appbasis_training_documentation_guard_revision
  BEFORE INSERT OR UPDATE OF attendance_json
  ON appbasis_training_documentation_revision
  FOR EACH ROW EXECUTE FUNCTION
    appbasis_training_documentation_guard_revision_write();
