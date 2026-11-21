-- ULC P2 OPERATOR REVIEW INPUT (NO AUTOMATIC EXECUTION).
-- Source: tested main SHA 7badb82c640fbb4599db32a9127bd8061369f758
-- Production 51 to 64 only; complete transaction uses p2-atomic-51-to-69.sql.
-- DO NOT RUN THIS PARTIAL FILE ON PRODUCTION.

-- BEGIN_VERIFIED_SOURCE modules/athletes/migrations/0002_appbasis_athlete_contacts.sql GIT_BLOB_SHA 5f7014eb1439845d8f3ec967b63c3bb724547e3f
ALTER TABLE appbasis_athlete
  ADD CONSTRAINT appbasis_athlete_org_id_unique
  UNIQUE (organization_id, id);
--> statement-breakpoint
CREATE TABLE appbasis_athlete_contact (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  athlete_id text NOT NULL,
  contact_name text NOT NULL
    CHECK (length(btrim(contact_name)) BETWEEN 1 AND 120),
  relationship text
    CHECK (relationship IS NULL OR length(btrim(relationship)) BETWEEN 1 AND 80),
  phone text NOT NULL
    CHECK (length(btrim(phone)) BETWEEN 3 AND 80),
  is_emergency boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 1
    CHECK (priority BETWEEN 1 AND 1000),
  notes text
    CHECK (notes IS NULL OR length(notes) <= 3000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT appbasis_athlete_contact_athlete_fk
    FOREIGN KEY (organization_id, athlete_id)
    REFERENCES appbasis_athlete (organization_id, id)
    ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX appbasis_athlete_contact_athlete_idx
  ON appbasis_athlete_contact (
    organization_id,
    athlete_id,
    priority,
    contact_name,
    id
  );
-- END_VERIFIED_SOURCE modules/athletes/migrations/0002_appbasis_athlete_contacts.sql

-- BEGIN_VERIFIED_SOURCE modules/athletes/migrations/0003_appbasis_training_group_attendance_mode.sql GIT_BLOB_SHA aba0d953d95daf601ec6600cc5829e0ec3231f60
-- Group-specific attendance behavior; existing groups keep trainer roll call.
ALTER TABLE appbasis_training_group
  ADD COLUMN attendance_mode text NOT NULL DEFAULT 'trainer_roll_call'
  CONSTRAINT appbasis_training_group_attendance_mode_check
  CHECK (attendance_mode IN ('trainer_roll_call', 'self_registration'));
-- END_VERIFIED_SOURCE modules/athletes/migrations/0003_appbasis_training_group_attendance_mode.sql

-- BEGIN_VERIFIED_SOURCE modules/training-blocks/migrations/0002_appbasis_training_block_multi_audience.sql GIT_BLOB_SHA 02d5f59ad7af1156c1fdef22e9b19a13d68a20db
ALTER TABLE appbasis_training_block_revision
  ADD COLUMN audience_ids text[];
--> statement-breakpoint
ALTER TABLE appbasis_training_block_revision
  ADD CONSTRAINT appbasis_training_block_revision_audience_ids_count_check
  CHECK (
    audience_ids IS NULL OR
    cardinality(audience_ids) BETWEEN 0 AND 100
  ),
  ADD CONSTRAINT appbasis_training_block_revision_audience_compatibility_check
  CHECK (
    audience_ids IS NULL OR
    audience_id IS NOT DISTINCT FROM audience_ids[1]
  );
-- END_VERIFIED_SOURCE modules/training-blocks/migrations/0002_appbasis_training_block_multi_audience.sql

-- BEGIN_VERIFIED_SOURCE modules/training-blocks/migrations/0003_appbasis_training_block_category.sql GIT_BLOB_SHA a9210fb12296dcba9178c3742e1cfc7976335516
-- Optional, versioned functional category; independent of audience/group membership.
-- Historical revisions remain uncategorized until explicitly edited.
ALTER TABLE appbasis_training_block_revision
  ADD COLUMN category text;
--> statement-breakpoint
ALTER TABLE appbasis_training_block_revision
  ADD CONSTRAINT appbasis_training_block_revision_category_length_check
  CHECK (category IS NULL OR (
    length(btrim(category)) BETWEEN 1 AND 80
    AND category = btrim(category)
  ));
-- END_VERIFIED_SOURCE modules/training-blocks/migrations/0003_appbasis_training_block_category.sql

-- BEGIN_VERIFIED_SOURCE modules/training-blocks/migrations/0004_appbasis_training_block_favorite_deletion.sql GIT_BLOB_SHA 6216c999ae447063cb4641d758310f0f93351333
-- Privileged, module-owned personal favorite tombstone.
-- A separate controlled retention job must later purge expired markers.
-- NO foreign key into identity or other module owners.
CREATE TABLE appbasis_training_block_favorite_deletion (
  organization_id text NOT NULL,
  principal_id text NOT NULL,
  completed_at timestamptz NOT NULL,
  purge_after timestamptz NOT NULL,
  PRIMARY KEY (organization_id, principal_id),
  CONSTRAINT appbasis_training_block_favorite_deletion_org_check
    CHECK (char_length(organization_id) BETWEEN 1 AND 200 AND btrim(organization_id) = organization_id),
  CONSTRAINT appbasis_training_block_favorite_deletion_principal_check
    CHECK (char_length(principal_id) BETWEEN 1 AND 200 AND btrim(principal_id) = principal_id),
  CONSTRAINT appbasis_training_block_favorite_deletion_retention_check
    CHECK (purge_after = completed_at + interval '840 hours')
);
-- END_VERIFIED_SOURCE modules/training-blocks/migrations/0004_appbasis_training_block_favorite_deletion.sql

-- BEGIN_VERIFIED_SOURCE modules/training-blocks/migrations/0005_appbasis_training_block_usage_subject.sql GIT_BLOB_SHA 629697a68e9959fedecba7e68e1fa7939c636b49
-- Module-owned, opt-in subject attribution. Existing usage records are NOT backfilled.
-- No foreign key to another module: app verifies the authoritative subject.
CREATE TABLE appbasis_training_block_usage_subject (
  organization_id text NOT NULL,
  usage_id text NOT NULL,
  subject_id text NOT NULL,
  source_plan_id text NOT NULL,
  source_item_id text NOT NULL,
  PRIMARY KEY (organization_id, usage_id),
  CONSTRAINT appbasis_training_block_usage_subject_usage_fk
    FOREIGN KEY (organization_id, usage_id)
    REFERENCES appbasis_training_block_usage (organization_id, id)
    ON DELETE CASCADE,
  CONSTRAINT appbasis_training_block_usage_subject_subject_check
    CHECK (char_length(subject_id) BETWEEN 1 AND 200 AND btrim(subject_id) = subject_id),
  CONSTRAINT appbasis_training_block_usage_subject_plan_check
    CHECK (char_length(source_plan_id) BETWEEN 1 AND 200 AND btrim(source_plan_id) = source_plan_id),
  CONSTRAINT appbasis_training_block_usage_subject_item_check
    CHECK (char_length(source_item_id) BETWEEN 1 AND 200 AND btrim(source_item_id) = source_item_id)
);
--> statement-breakpoint
CREATE INDEX appbasis_training_block_usage_subject_owner_idx
  ON appbasis_training_block_usage_subject (organization_id, subject_id, usage_id);
--> statement-breakpoint
-- The marker is intentionally never purged by this slice. An expired marker
-- remains write-blocking until a separately proven backup/restore policy exists.
CREATE TABLE appbasis_training_block_usage_subject_deletion (
  organization_id text NOT NULL,
  subject_id text NOT NULL,
  completed_at timestamptz NOT NULL,
  purge_after timestamptz NOT NULL,
  PRIMARY KEY (organization_id, subject_id),
  CONSTRAINT appbasis_training_block_usage_subject_deletion_org_check
    CHECK (char_length(organization_id) BETWEEN 1 AND 200 AND btrim(organization_id) = organization_id),
  CONSTRAINT appbasis_training_block_usage_subject_deletion_subject_check
    CHECK (char_length(subject_id) BETWEEN 1 AND 200 AND btrim(subject_id) = subject_id),
  CONSTRAINT appbasis_training_block_usage_subject_deletion_retention_check
    CHECK (purge_after = completed_at + interval '840 hours')
);
-- END_VERIFIED_SOURCE modules/training-blocks/migrations/0005_appbasis_training_block_usage_subject.sql

-- BEGIN_VERIFIED_SOURCE modules/training-documentation/migrations/0000_appbasis_training_documentation_foundation.sql GIT_BLOB_SHA 3b7895d5749a32c2824a23a8a6de8c22f50d1b56
CREATE TABLE appbasis_training_documentation (
  id text PRIMARY KEY,
  organization_id text NOT NULL
    CHECK (
      char_length(organization_id) BETWEEN 1 AND 200
      AND btrim(organization_id) = organization_id
    ),
  subject_id text NOT NULL
    CHECK (
      char_length(subject_id) BETWEEN 1 AND 200
      AND btrim(subject_id) = subject_id
    ),
  session_date date NOT NULL,
  source_plan_id text NOT NULL
    CHECK (
      char_length(source_plan_id) BETWEEN 1 AND 200
      AND btrim(source_plan_id) = source_plan_id
    ),
  source_plan_revision integer NOT NULL
    CHECK (source_plan_revision >= 1),
  current_revision integer NOT NULL DEFAULT 1
    CHECK (current_revision >= 1),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'completed')),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, subject_id, session_date),
  CHECK (
    (status = 'draft' AND completed_at IS NULL)
    OR
    (status = 'completed' AND completed_at IS NOT NULL)
  )
);

CREATE TABLE appbasis_training_documentation_revision (
  organization_id text NOT NULL,
  documentation_id text NOT NULL,
  revision integer NOT NULL CHECK (revision >= 1),
  status text NOT NULL
    CHECK (status IN ('draft', 'completed')),
  note text
    CHECK (
      note IS NULL
      OR (
        char_length(note) BETWEEN 1 AND 3000
        AND btrim(note) = note
      )
    ),
  items_json jsonb NOT NULL
    CHECK (jsonb_typeof(items_json) = 'array'),
  attendance_json jsonb NOT NULL
    CHECK (jsonb_typeof(attendance_json) = 'array'),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, documentation_id, revision),
  CONSTRAINT appbasis_training_documentation_revision_document_fk
    FOREIGN KEY (organization_id, documentation_id)
    REFERENCES appbasis_training_documentation (organization_id, id)
    ON DELETE RESTRICT,
  CHECK (
    (status = 'draft' AND completed_at IS NULL)
    OR
    (status = 'completed' AND completed_at IS NOT NULL)
  )
);

ALTER TABLE appbasis_training_documentation
  ADD CONSTRAINT appbasis_training_documentation_current_revision_fk
  FOREIGN KEY (organization_id, id, current_revision)
  REFERENCES appbasis_training_documentation_revision (
    organization_id,
    documentation_id,
    revision
  )
  DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX appbasis_training_documentation_subject_date_idx
  ON appbasis_training_documentation (
    organization_id,
    subject_id,
    session_date DESC
  );

CREATE INDEX appbasis_training_documentation_source_plan_idx
  ON appbasis_training_documentation (
    organization_id,
    source_plan_id,
    source_plan_revision
  );
-- END_VERIFIED_SOURCE modules/training-documentation/migrations/0000_appbasis_training_documentation_foundation.sql

-- BEGIN_VERIFIED_SOURCE modules/training-documentation/migrations/0001_appbasis_training_documentation_subject_deletion.sql GIT_BLOB_SHA de276921a7ae6bd0c3d046429f1520a97c92b573
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
-- END_VERIFIED_SOURCE modules/training-documentation/migrations/0001_appbasis_training_documentation_subject_deletion.sql

-- BEGIN_VERIFIED_SOURCE modules/training-plans/migrations/0001_appbasis_training_plan_subject_deletion.sql GIT_BLOB_SHA 428f70b44462df10adf97030d3737ddc8553dfb4
CREATE TABLE appbasis_training_plan_subject_deletion (
  organization_id text NOT NULL
    CHECK (
      char_length(organization_id) BETWEEN 1 AND 200
      AND btrim(organization_id) = organization_id
    ),
  subject_id text NOT NULL
    CHECK (
      char_length(subject_id) BETWEEN 1 AND 200
      AND btrim(subject_id) = subject_id
    ),
  completed_at timestamptz NOT NULL,
  purge_after timestamptz NOT NULL,
  PRIMARY KEY (organization_id, subject_id),
  CHECK (purge_after = completed_at + interval '840 hours')
);
-- END_VERIFIED_SOURCE modules/training-plans/migrations/0001_appbasis_training_plan_subject_deletion.sql

-- BEGIN_VERIFIED_SOURCE apps/ulc-linz/migrations/0008_ulc_linz_session_registration.sql GIT_BLOB_SHA 98066eea00ecd668ac4f78a4ab839eca50192513
-- Athlete intentions are independent of trainer-confirmed attendance.
-- The application must authorize actor-to-athlete mapping and group eligibility.
CREATE TABLE ulc_linz_training_registration (
  organization_id text NOT NULL,
  session_id text NOT NULL,
  athlete_id text NOT NULL,
  intention text NOT NULL DEFAULT 'unknown'
    CONSTRAINT ulc_linz_training_registration_intention_check
    CHECK (intention IN ('unknown', 'attending', 'not_attending', 'maybe')),
  revision integer NOT NULL DEFAULT 1
    CONSTRAINT ulc_linz_training_registration_revision_check CHECK (revision >= 1),
  updated_by_identity_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, athlete_id)
);
--> statement-breakpoint
CREATE INDEX ulc_linz_training_registration_org_athlete_idx
  ON ulc_linz_training_registration (organization_id, athlete_id, session_id);
--> statement-breakpoint
CREATE TABLE ulc_linz_training_registration_change (
  id text PRIMARY KEY,
  organization_id text NOT NULL,
  session_id text NOT NULL,
  athlete_id text NOT NULL,
  intention text NOT NULL
    CONSTRAINT ulc_linz_training_registration_change_intention_check
    CHECK (intention IN ('unknown', 'attending', 'not_attending', 'maybe')),
  revision integer NOT NULL CHECK (revision >= 1),
  actor_identity_id text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, athlete_id, revision)
);
--> statement-breakpoint
CREATE INDEX ulc_linz_training_registration_change_org_idx
  ON ulc_linz_training_registration_change (organization_id, session_id, athlete_id);
-- END_VERIFIED_SOURCE apps/ulc-linz/migrations/0008_ulc_linz_session_registration.sql

-- BEGIN_VERIFIED_SOURCE apps/ulc-linz/migrations/0009_ulc_linz_functionary_role.sql GIT_BLOB_SHA 2755cd00daf9588938683ac1554a6cbeeec82fe1
-- ULC native organization functionary role. This migration must be applied
-- explicitly to the isolated Preview before functionary provisioning is enabled.
-- Existing member, trainer, athlete, and admin rows are untouched.
ALTER TABLE ulc_linz_membership
  DROP CONSTRAINT ulc_linz_membership_source_role_check;
ALTER TABLE ulc_linz_membership
  ADD CONSTRAINT ulc_linz_membership_source_role_check
  CHECK (source_role IN ('admin', 'trainer', 'athlete', 'parent', 'functionary'));
--> statement-breakpoint
ALTER TABLE ulc_linz_lifecycle_deletion
  DROP CONSTRAINT ulc_linz_lifecycle_deletion_source_role_check;
ALTER TABLE ulc_linz_lifecycle_deletion
  ADD CONSTRAINT ulc_linz_lifecycle_deletion_source_role_check
  CHECK (source_role IN ('trainer', 'athlete', 'parent', 'functionary'));

-- Permission role ulc-linz:functionary is provisioned by the permissions owner
-- through ULC_LINZ_M5_PERMISSION_PROVISIONING_BUNDLE, not by an app migration.
-- Operators must apply that owner provisioning separately before activating
-- functionary account creation; its existing readiness check fails closed.
-- END_VERIFIED_SOURCE apps/ulc-linz/migrations/0009_ulc_linz_functionary_role.sql

-- BEGIN_VERIFIED_SOURCE apps/ulc-linz/migrations/0010_ulc_linz_registration_notes.sql GIT_BLOB_SHA adaa0ef4b95e8b24471382327f57b31be25b6095
-- A02.3: An optional athlete/day registration note is distinct from the
-- session-wide trainer note. Keep historical actor and athlete attribution.
-- Privacy: bounded text, no new public reader or independently retained table.
ALTER TABLE ulc_linz_training_registration
  ADD COLUMN note text NULL
    CONSTRAINT ulc_linz_training_registration_note_check
    CHECK (note IS NULL OR (char_length(note) <= 160 AND note !~ '[[:cntrl:]]'));
--> statement-breakpoint
ALTER TABLE ulc_linz_training_registration_change
  ADD COLUMN note text NULL
    CONSTRAINT ulc_linz_training_registration_change_note_check
    CHECK (note IS NULL OR (char_length(note) <= 160 AND note !~ '[[:cntrl:]]'));
-- END_VERIFIED_SOURCE apps/ulc-linz/migrations/0010_ulc_linz_registration_notes.sql

-- BEGIN_VERIFIED_SOURCE apps/ulc-linz/migrations/0011_ulc_linz_youth_training_content.sql GIT_BLOB_SHA 04111e4a05fb434655604e964a8eee67b32f8075
-- ULC v12: short youth-training content titles belong to the training date;
-- per-athlete slot assignments belong to existing attendance rows so the
-- established athlete-retention/delete path removes them with attendance.
-- Expand-only: all existing sessions/attendance retain their previous meaning.
ALTER TABLE ulc_linz_training_session
  ADD COLUMN training_content_titles text[] NOT NULL DEFAULT ARRAY[]::text[];
--> statement-breakpoint
ALTER TABLE ulc_linz_training_session
  ADD CONSTRAINT ulc_linz_training_content_titles_check
  CHECK (
    cardinality(training_content_titles) <= 5
    AND array_position(training_content_titles, NULL) IS NULL
    AND char_length(array_to_string(training_content_titles, '')) <= 600
  );
--> statement-breakpoint
ALTER TABLE ulc_linz_training_attendance
  ADD COLUMN training_content_slots smallint[] NOT NULL DEFAULT ARRAY[]::smallint[];
--> statement-breakpoint
ALTER TABLE ulc_linz_training_attendance
  ADD CONSTRAINT ulc_linz_training_content_slots_check
  CHECK (
    cardinality(training_content_slots) <= 5
    AND array_position(training_content_slots, NULL) IS NULL
    AND training_content_slots <@ ARRAY[1, 2, 3, 4, 5]::smallint[]
    AND (status = 'present' OR cardinality(training_content_slots) = 0)
  );
-- END_VERIFIED_SOURCE apps/ulc-linz/migrations/0011_ulc_linz_youth_training_content.sql

-- BEGIN_VERIFIED_SOURCE apps/ulc-linz/migrations/0012_ulc_linz_youth_training_catalog.sql GIT_BLOB_SHA b2c377a979adce989b1604269fa9501fa5999639
-- ULC v13: stable youth-content category IDs and per-training notes.
-- Existing free-text titles and attendance slots remain untouched; legacy
-- records have an empty metadata array and can be categorized later.
-- Session-owned JSONB is covered by the existing session retention/deletion.
ALTER TABLE ulc_linz_training_session
  ADD COLUMN training_content_items jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE ulc_linz_training_session
  ADD CONSTRAINT ulc_linz_training_content_items_check
  CHECK (
    jsonb_typeof(training_content_items) = 'array'
    AND jsonb_array_length(training_content_items) <= 5
    AND (
      jsonb_array_length(training_content_items) = 0
      OR jsonb_array_length(training_content_items) = cardinality(training_content_titles)
    )
  );
-- END_VERIFIED_SOURCE apps/ulc-linz/migrations/0012_ulc_linz_youth_training_catalog.sql

-- BEGIN_VERIFIED_SOURCE apps/ulc-linz/migrations/0013_ulc_linz_youth_categories.sql GIT_BLOB_SHA 1c5c20ad1092d3ca121164818e867b6c321d2139
-- ULC schema v14. Shared club-wide categories for U12, U14 and Kindertraining.
-- Never mutate historical training_content_titles/content_slots or session JSON.
CREATE TABLE ulc_linz_youth_content_category (
  organization_id text NOT NULL,
  code text NOT NULL,
  label text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ulc_linz_youth_category_pk PRIMARY KEY (organization_id, code),
  CONSTRAINT ulc_linz_youth_category_code_check
    CHECK (code ~ '^[a-z][a-z0-9_]{0,79}$'),
  CONSTRAINT ulc_linz_youth_category_label_check
    CHECK (char_length(label) BETWEEN 1 AND 120 AND label = btrim(label)
           AND label !~ '[[:cntrl:]]'),
  CONSTRAINT ulc_linz_youth_category_revision_check CHECK (revision > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX ulc_linz_youth_category_name_unique
  ON ulc_linz_youth_content_category (organization_id, lower(label));
--> statement-breakpoint
CREATE INDEX ulc_linz_youth_category_active_idx
  ON ulc_linz_youth_content_category (organization_id, is_active, label);
-- END_VERIFIED_SOURCE apps/ulc-linz/migrations/0013_ulc_linz_youth_categories.sql

-- BEGIN_VERIFIED_SOURCE apps/ulc-linz/migrations/0014_ulc_linz_youth_group_categories.sql GIT_BLOB_SHA 1e252cab3dac33d31bf4ea2539f9ce2e5b1c008a
-- ULC lifecycle schema v15: independent U14 and Kindertraining category catalogs.
-- Existing v14 table and historical U12 training data remain untouched.
CREATE TABLE ulc_linz_youth_group_category (
  organization_id text NOT NULL,
  training_area text NOT NULL,
  code text NOT NULL,
  label text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ulc_linz_youth_group_category_pk
    PRIMARY KEY (organization_id, training_area, code),
  CONSTRAINT ulc_linz_youth_group_category_area_check
    CHECK (training_area IN ('u14', 'kindertraining')),
  CONSTRAINT ulc_linz_youth_group_category_code_check
    CHECK (code ~ '^[a-z][a-z0-9_]{0,79}$'),
  CONSTRAINT ulc_linz_youth_group_category_label_check
    CHECK (char_length(label) BETWEEN 1 AND 120 AND label = btrim(label)
           AND label !~ '[[:cntrl:]]'),
  CONSTRAINT ulc_linz_youth_group_category_revision_check CHECK (revision > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX ulc_linz_youth_group_category_name_unique
  ON ulc_linz_youth_group_category (organization_id, training_area, lower(label));
--> statement-breakpoint
CREATE INDEX ulc_linz_youth_group_category_active_idx
  ON ulc_linz_youth_group_category (organization_id, training_area, is_active, label);
-- END_VERIFIED_SOURCE apps/ulc-linz/migrations/0014_ulc_linz_youth_group_categories.sql

-- BEGIN_VERIFIED_SOURCE apps/ulc-linz/migrations/0015_ulc_linz_training_trainer_attendance.sql GIT_BLOB_SHA 5bcbca80a3b42db33bb5f3fe17c393427fbe5bd0
-- v16: additive, app-owned trainer presence per youth training session.
-- Only selected present trainers have a row; absence is represented by no row.
-- Keep historical presence when a trainer leaves a group; service scopes the roster.
CREATE TABLE ulc_linz_training_trainer_attendance (
  organization_id text NOT NULL,
  session_id text NOT NULL REFERENCES ulc_linz_training_session(id) ON DELETE CASCADE,
  trainer_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ulc_linz_training_trainer_attendance_pk PRIMARY KEY (session_id, trainer_id)
);
--> statement-breakpoint
CREATE INDEX ulc_linz_training_trainer_attendance_org_session_idx
  ON ulc_linz_training_trainer_attendance (organization_id, session_id);
-- END_VERIFIED_SOURCE apps/ulc-linz/migrations/0015_ulc_linz_training_trainer_attendance.sql
