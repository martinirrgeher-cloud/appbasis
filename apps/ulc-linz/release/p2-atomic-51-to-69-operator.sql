-- ULC LINZ P2 ONE-TRANSACTION PRODUCTION 51→69 MIGRATION (NOT AUTO-RUN).
-- DO NOT RUN VIA THE APPBASIS EMPTY-SCHEMA INSTALLER.
-- Approved operator cutover only after valid up-to-date backup and clone/restore PASS.
-- Expected baseline: Neon bold-dew-01343606/br-muddy-heart-b1vtydvc/neondb.
-- Source main git SHA: 7badb82c640fbb4599db32a9127bd8061369f758
-- Operator uses Neon run_sql_transaction with SQL split on top-level semicolons.
-- PostgreSQL rolls back ALL stages if any precondition or statement fails.
DO $$ BEGIN IF current_database()<>'neondb' OR current_user<>'neondb_owner' OR (SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname='public')<>51 OR (SELECT count(*) FROM information_schema.columns WHERE table_schema='public')<>378 OR (SELECT count(*) FROM pg_catalog.pg_indexes WHERE schemaname='public')<>111 OR to_regclass('public.ulc_linz_training_registration') IS NOT NULL OR to_regclass('public.ulc_linz_training_subject_deletion') IS NOT NULL OR (SELECT count(*) FROM ulc_linz_membership)<>1 THEN RAISE EXCEPTION 'ULC P2 production baseline drift or wrong role/database';END IF;END $$;
DO $$ DECLARE rec record; n bigint; total bigint:=0;BEGIN FOR rec IN SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public' LOOP EXECUTE format('SELECT count(*) FROM public.%I',rec.tablename) INTO n;total:=total+n;END LOOP;IF total<>141 THEN RAISE EXCEPTION 'ULC P2 total persisted rows drifted';END IF;END $$;
LOCK TABLE public."account", public."appbasis_athlete", public."appbasis_athlete_group_membership", public."appbasis_athletes_deletion", public."appbasis_exercise_catalog_audience", public."appbasis_exercise_catalog_favorite", public."appbasis_exercise_catalog_item", public."appbasis_exercise_catalog_parameter", public."appbasis_exercise_catalog_private_media", public."appbasis_exercise_catalog_similarity", public."appbasis_exercise_catalog_usage", public."appbasis_exercise_catalog_video", public."appbasis_identity_operation", public."appbasis_identity_security_state", public."appbasis_permission_administration_audit", public."appbasis_permission_capability", public."appbasis_permission_principal", public."appbasis_permission_principal_grant", public."appbasis_permission_principal_revoke", public."appbasis_permission_principal_role", public."appbasis_permission_role", public."appbasis_permission_role_capability", public."appbasis_person", public."appbasis_trainer", public."appbasis_trainer_group_membership", public."appbasis_training_block", public."appbasis_training_block_favorite", public."appbasis_training_block_revision", public."appbasis_training_block_revision_item", public."appbasis_training_block_revision_item_parameter", public."appbasis_training_block_usage", public."appbasis_training_group", public."appbasis_training_plan", public."appbasis_training_plan_revision", public."appbasis_training_plan_revision_item", public."session", public."ulc_linz_exercise_catalog_item", public."ulc_linz_exercise_favorite", public."ulc_linz_exercise_group", public."ulc_linz_exercise_parameter", public."ulc_linz_lifecycle_audit", public."ulc_linz_lifecycle_deletion", public."ulc_linz_membership", public."ulc_linz_security_event_log", public."ulc_linz_subject_scope", public."ulc_linz_trainer_identity_audit", public."ulc_linz_training_attendance", public."ulc_linz_training_module_group", public."ulc_linz_training_session", public."user", public."verification" IN ACCESS EXCLUSIVE MODE NOWAIT;
-- BEGIN P2 51-TO-64: apps/ulc-linz/release/p2-51to64-source-bundle.sql / Git blob 46dd870d8a2e2d0c7d57b2dce6df8a517d8aff99
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
-- END P2 51-TO-64
DO $$ BEGIN IF (SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname='public')<>64 THEN RAISE EXCEPTION 'ULC P2 expected exactly 64 tables'; END IF; END $$;

-- BEGIN P2 64-TO-66: apps/ulc-linz/migrations/0016_ulc_linz_registration_calendar.sql / Git blob 689683c521d1bc851d434e099005d1307147ccd1
-- G-04: clean, non-personal app-owned registration calendar.
-- REVIEW ONLY until registered as schema-v17 in appbasis.database.json under
-- a separate approved migration gate. This file is NOT part of active runtime.
-- Existing registration/attendance records are not modified or dropped.
-- A missing group policy retains unrestricted legacy 7-day registration.
CREATE TABLE ulc_linz_registration_calendar_rule (
  organization_id text NOT NULL CHECK (
    char_length(organization_id) BETWEEN 1 AND 200
    AND organization_id = btrim(organization_id)
  ),
  -- A physical group DELETE (not is_active=false) atomically removes only
  -- this group's calendar configuration. Other training/registration owners
  -- retain their own independent deletion and retention contracts.
  group_id text NOT NULL REFERENCES appbasis_training_group(id) ON DELETE CASCADE,
  weekdays_mask smallint NOT NULL CHECK (weekdays_mask BETWEEN 1 AND 127),
  weeks_ahead smallint NOT NULL CHECK (weeks_ahead BETWEEN 0 AND 26),
  deadline_days_before smallint NULL CHECK (deadline_days_before BETWEEN 0 AND 14),
  deadline_local_time text NULL CHECK (
    deadline_local_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  ),
  late_mode text NOT NULL CHECK (late_mode IN ('allow', 'block')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, group_id),
  CONSTRAINT ulc_linz_calendar_deadline_pair CHECK (
    (deadline_days_before IS NULL) = (deadline_local_time IS NULL)
  )
);
--> statement-breakpoint
-- An explicit per-date exception. "extra" opens an unscheduled day;
-- "cancelled" closes a regular or exceptional day; "none" resets it
-- without reusing a stale CAS revision. No identity, note or
-- free-text field: calendar state is separated from member registrations.
CREATE TABLE ulc_linz_registration_calendar_exception (
  organization_id text NOT NULL CHECK (
    char_length(organization_id) BETWEEN 1 AND 200
    AND organization_id = btrim(organization_id)
  ),
  -- A physical group DELETE (not is_active=false) atomically removes only
  -- this group's calendar configuration. Other training/registration owners
  -- retain their own independent deletion and retention contracts.
  group_id text NOT NULL REFERENCES appbasis_training_group(id) ON DELETE CASCADE,
  session_date date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('extra', 'cancelled', 'none')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, group_id, session_date)
);

--> statement-breakpoint
-- Defence in depth: enforce date, exception and deadline inside each registration
-- INSERT/UPDATE, not only in the UI or API. Locks serialize against rule and
-- exception CAS writes, which acquire FOR UPDATE on the same training group.
-- This is still an UNPUBLISHED migration candidate; no Preview/Production DDL.
CREATE FUNCTION ulc_linz_registration_calendar_guard()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $calendar_guard$
DECLARE
  v_group text;
  v_date date;
  v_state text;
  v_module text;
  v_policy public.ulc_linz_registration_calendar_rule%ROWTYPE;
  v_kind text;
  v_allowed boolean;
  v_today date;
  v_deadline_local timestamp without time zone;
  v_cutoff timestamptz;
  v_first timestamptz;
  v_local_guess timestamp without time zone;
BEGIN
  SELECT session.group_id, session.session_date, session.state, session.module_id
    INTO v_group, v_date, v_state, v_module
    FROM public.ulc_linz_training_session AS session
   WHERE session.id = NEW.session_id
     AND session.organization_id = NEW.organization_id;
  IF NOT FOUND OR v_state <> 'scheduled' THEN
    RAISE EXCEPTION 'Registration session unavailable' USING ERRCODE = 'UL024';
  END IF;
  IF v_module <> 'kindertraining' THEN
    RETURN NEW;
  END IF;

  PERFORM 1 FROM public.appbasis_training_group AS training_group
   WHERE training_group.id = v_group
     AND training_group.organization_id = NEW.organization_id
     AND training_group.is_active = true
     AND training_group.attendance_mode = 'self_registration'
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registration group unavailable' USING ERRCODE = 'UL024';
  END IF;

  SELECT * INTO v_policy FROM public.ulc_linz_registration_calendar_rule
   WHERE organization_id = NEW.organization_id AND group_id = v_group
   FOR SHARE;
  -- Even when no weekly rule exists, an explicit cancellation still blocks.
  SELECT kind INTO v_kind FROM public.ulc_linz_registration_calendar_exception
   WHERE organization_id = NEW.organization_id
     AND group_id = v_group AND session_date = v_date
   FOR SHARE;
  IF v_kind = 'cancelled' THEN
    RAISE EXCEPTION 'Training day cancelled' USING ERRCODE = 'UL024';
  END IF;
  IF v_policy.group_id IS NULL THEN
    RETURN NEW; -- Legacy unconfigured groups keep their seven-day behavior.
  END IF;

  v_allowed := (v_policy.weekdays_mask &
    (1 << (EXTRACT(ISODOW FROM v_date)::int - 1))) <> 0;
  IF NOT v_allowed AND v_kind IS DISTINCT FROM 'extra' THEN
    RAISE EXCEPTION 'Not an approved training day' USING ERRCODE = 'UL024';
  END IF;
  v_today := (clock_timestamp() AT TIME ZONE 'Europe/Vienna')::date;
  IF v_date < v_today OR
     date_trunc('week', v_date::timestamp) >
     date_trunc('week', v_today::timestamp) +
       make_interval(weeks => v_policy.weeks_ahead) THEN
    RAISE EXCEPTION 'Registration outside allowed date window' USING ERRCODE = 'UL024';
  END IF;
  IF v_policy.deadline_days_before IS NOT NULL AND v_policy.late_mode = 'block' THEN
    v_deadline_local :=
      (v_date - v_policy.deadline_days_before)::date +
      v_policy.deadline_local_time::time;
    -- On Vienna autumn DST overlap choose the EARLIER occurrence. Never reopen.
    v_cutoff := v_deadline_local AT TIME ZONE 'Europe/Vienna';
    v_first := v_cutoff - interval '1 hour';
    IF (v_first AT TIME ZONE 'Europe/Vienna') = v_deadline_local THEN
      v_cutoff := v_first;
    ELSE
      -- Nonexistent spring-clock local times close at the first valid minute.
      v_local_guess := v_cutoff AT TIME ZONE 'Europe/Vienna';
      IF v_local_guess > v_deadline_local THEN
        v_cutoff := date_trunc('hour', v_local_guess) AT TIME ZONE 'Europe/Vienna';
      END IF;
    END IF;
    IF clock_timestamp() > v_cutoff THEN
      RAISE EXCEPTION 'Registration deadline passed' USING ERRCODE = 'UL024';
    END IF;
  END IF;
  RETURN NEW;
END;
$calendar_guard$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION ulc_linz_registration_calendar_guard() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER ulc_linz_registration_calendar_guard_trg
BEFORE INSERT OR UPDATE ON ulc_linz_training_registration
FOR EACH ROW EXECUTE FUNCTION ulc_linz_registration_calendar_guard();
-- END P2 64-TO-66
DO $$ BEGIN IF (SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname='public')<>66 THEN RAISE EXCEPTION 'ULC P2 expected exactly 66 tables'; END IF; END $$;

-- BEGIN P2 66-TO-68: modules/exercise-catalog/migrations/0004_appbasis_exercise_catalog_subject_lifecycle.sql / Git blob 82fe7b01914e6f3913a06cdc942a9d9258e6df8b
-- Published ULC owner migration. The SQL DDL below is identical to
-- the CI-tested, operator-approved isolated Preview candidate.
-- This file is for fresh installations only. Existing Preview has already
-- applied this DDL; use an explicit read-only schema reconciliation instead.
-- No automatic retention, purge, production upgrade, or global GRANT.
CREATE TABLE appbasis_exercise_catalog_favorite_deletion (
  organization_id text NOT NULL,
  principal_id text NOT NULL,
  completed_at timestamptz NOT NULL,
  purge_after timestamptz NOT NULL,
  PRIMARY KEY (organization_id, principal_id),
  CONSTRAINT appbasis_exercise_catalog_favorite_deletion_org_check
    CHECK (
      char_length(organization_id) BETWEEN 1 AND 200
      AND btrim(organization_id) = organization_id
    ),
  CONSTRAINT appbasis_exercise_catalog_favorite_deletion_principal_check
    CHECK (
      char_length(principal_id) BETWEEN 1 AND 200
      AND btrim(principal_id) = principal_id
    ),
  CONSTRAINT appbasis_exercise_catalog_favorite_deletion_retention_check
    CHECK (purge_after = completed_at + interval '840 hours')
);
--> statement-breakpoint
-- Explicit usage attribution. Historical usage is NOT attributed from notes.
CREATE TABLE appbasis_exercise_catalog_usage_subject (
  organization_id text NOT NULL,
  usage_id text NOT NULL,
  principal_id text NOT NULL,
  verified_by text NOT NULL,
  PRIMARY KEY (organization_id, usage_id),
  CONSTRAINT appbasis_exercise_catalog_usage_subject_usage_fk
    FOREIGN KEY (organization_id, usage_id)
    REFERENCES appbasis_exercise_catalog_usage (organization_id, id)
    ON DELETE CASCADE,
  CONSTRAINT appbasis_exercise_catalog_usage_subject_principal_check
    CHECK (char_length(principal_id) BETWEEN 1 AND 200
      AND btrim(principal_id) = principal_id),
  CONSTRAINT appbasis_exercise_catalog_usage_subject_verified_check
    CHECK (verified_by IN ('identity', 'athletes'))
);
--> statement-breakpoint
CREATE INDEX appbasis_exercise_catalog_usage_subject_principal_idx
  ON appbasis_exercise_catalog_usage_subject
    (organization_id, principal_id, usage_id);
-- END P2 66-TO-68
DO $$ BEGIN IF (SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname='public')<>68 THEN RAISE EXCEPTION 'ULC P2 expected exactly 68 tables'; END IF; END $$;

-- BEGIN P2 68-TO-69: apps/ulc-linz/migrations/0017_ulc_linz_training_subject_write_fence.sql / Git blob 298d01b9a14987d5bd3afd91dacb8f1e03f5426e
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
-- END P2 68-TO-69
DO $$ BEGIN IF (SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname='public')<>69 THEN RAISE EXCEPTION 'ULC P2 expected exactly 69 tables'; END IF; END $$;

-- BEGIN P2 APP-ROLE-ACL: apps/ulc-linz/test/fixtures/p02-h-application-privileges.candidate.sql / Git blob dc06089493000419189788ed250b78f74deae46f
-- P02-H candidate only: app-only least-privilege expansion on 17 of the 18
-- NEW post-51 relations. The 18th relation,
-- public.ulc_linz_training_subject_deletion, deliberately gets ZERO
-- permissions, including SELECT, to the ordinary application SQL role.
--
-- Use ONLY on an explicitly approved isolated copy. No production/Preview
-- execution, no schema/manifest activation and no grants to PUBLIC.
-- This file does NOT provision the privileged erasure coordinator.
-- Historical role privileges outside these 18 relations are unchanged.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.appbasis_athlete_contact TO ulc_linz_application;
--> statement-breakpoint
GRANT SELECT ON TABLE public.appbasis_exercise_catalog_favorite_deletion TO ulc_linz_application;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE public.appbasis_exercise_catalog_usage_subject TO ulc_linz_application;
--> statement-breakpoint
GRANT SELECT ON TABLE public.appbasis_training_block_favorite_deletion TO ulc_linz_application;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE public.appbasis_training_block_usage_subject TO ulc_linz_application;
--> statement-breakpoint
GRANT SELECT ON TABLE public.appbasis_training_block_usage_subject_deletion TO ulc_linz_application;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE public.appbasis_training_documentation TO ulc_linz_application;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE public.appbasis_training_documentation_revision TO ulc_linz_application;
--> statement-breakpoint
GRANT SELECT ON TABLE public.appbasis_training_documentation_subject_deletion TO ulc_linz_application;
--> statement-breakpoint
GRANT SELECT ON TABLE public.appbasis_training_plan_subject_deletion TO ulc_linz_application;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE public.ulc_linz_registration_calendar_exception TO ulc_linz_application;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE public.ulc_linz_registration_calendar_rule TO ulc_linz_application;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE public.ulc_linz_training_registration TO ulc_linz_application;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE public.ulc_linz_training_registration_change TO ulc_linz_application;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ulc_linz_training_trainer_attendance TO ulc_linz_application;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE public.ulc_linz_youth_content_category TO ulc_linz_application;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE public.ulc_linz_youth_group_category TO ulc_linz_application;
-- END P2 APP-ROLE-ACL
DO $$ DECLARE n int;BEGIN
IF (SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname='public')<>69 OR
   (SELECT count(*) FROM information_schema.columns WHERE table_schema='public')<>501 OR
   (SELECT count(*) FROM pg_catalog.pg_indexes WHERE schemaname='public')<>145
THEN RAISE EXCEPTION 'ULC P2 final schema cardinality mismatch';END IF;
SELECT count(*) INTO n FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid JOIN pg_catalog.pg_namespace s ON s.oid=c.relnamespace WHERE s.nspname='public' AND NOT t.tgisinternal AND t.tgenabled IN ('O','A') AND t.tgfoid=to_regprocedure('public.ulc_linz_training_subject_write_fence()');
IF n<>3 THEN RAISE EXCEPTION 'ULC P2 three active write fences missing';END IF;
IF EXISTS(SELECT 1 FROM (VALUES ('appbasis_athlete_contact','SELECT'),('appbasis_athlete_contact','INSERT'),('appbasis_athlete_contact','UPDATE'),('appbasis_athlete_contact','DELETE'),('appbasis_exercise_catalog_favorite_deletion','SELECT'),('appbasis_exercise_catalog_usage_subject','SELECT'),('appbasis_exercise_catalog_usage_subject','INSERT'),('appbasis_training_block_favorite_deletion','SELECT'),('appbasis_training_block_usage_subject','SELECT'),('appbasis_training_block_usage_subject','INSERT'),('appbasis_training_block_usage_subject_deletion','SELECT'),('appbasis_training_documentation','SELECT'),('appbasis_training_documentation','INSERT'),('appbasis_training_documentation','UPDATE'),('appbasis_training_documentation_revision','SELECT'),('appbasis_training_documentation_revision','INSERT'),('appbasis_training_documentation_subject_deletion','SELECT'),('appbasis_training_plan_subject_deletion','SELECT'),('ulc_linz_registration_calendar_exception','SELECT'),('ulc_linz_registration_calendar_exception','INSERT'),('ulc_linz_registration_calendar_exception','UPDATE'),('ulc_linz_registration_calendar_rule','SELECT'),('ulc_linz_registration_calendar_rule','INSERT'),('ulc_linz_registration_calendar_rule','UPDATE'),('ulc_linz_training_registration','SELECT'),('ulc_linz_training_registration','INSERT'),('ulc_linz_training_registration','UPDATE'),('ulc_linz_training_registration_change','SELECT'),('ulc_linz_training_registration_change','INSERT'),('ulc_linz_training_trainer_attendance','SELECT'),('ulc_linz_training_trainer_attendance','INSERT'),('ulc_linz_training_trainer_attendance','UPDATE'),('ulc_linz_training_trainer_attendance','DELETE'),('ulc_linz_youth_content_category','SELECT'),('ulc_linz_youth_content_category','INSERT'),('ulc_linz_youth_content_category','UPDATE'),('ulc_linz_youth_group_category','SELECT'),('ulc_linz_youth_group_category','INSERT'),('ulc_linz_youth_group_category','UPDATE')) AS perms(t,p) WHERE NOT has_table_privilege('ulc_linz_application','public.'||perms.t,perms.p))
THEN RAISE EXCEPTION 'ULC P2 catalog/documentation/application role permissions missing';END IF;
IF has_table_privilege('ulc_linz_application','public.ulc_linz_training_subject_deletion','SELECT') OR
   has_table_privilege('ulc_linz_application','public.ulc_linz_training_subject_deletion','INSERT') OR
   has_table_privilege('ulc_linz_application','public.ulc_linz_training_subject_deletion','UPDATE') OR
   has_table_privilege('ulc_linz_application','public.ulc_linz_training_subject_deletion','DELETE')
THEN RAISE EXCEPTION 'ULC P2 deletion marker exposed to ordinary app';END IF;END $$;

DO $$ DECLARE rec record; n bigint; total bigint:=0;BEGIN FOR rec IN SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public' LOOP EXECUTE format('SELECT count(*) FROM public.%I',rec.tablename) INTO n;total:=total+n;END LOOP;IF total<>141 THEN RAISE EXCEPTION 'ULC P2 total persisted rows drifted';END IF;END $$;
-- End single transaction. No user data erasure, no Worker deployment.
