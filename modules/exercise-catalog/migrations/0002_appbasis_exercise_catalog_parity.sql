ALTER TABLE appbasis_exercise_catalog_item
  ADD COLUMN difficulty_key text;
--> statement-breakpoint
ALTER TABLE appbasis_exercise_catalog_item
  ADD CONSTRAINT appbasis_exercise_catalog_item_difficulty_check
  CHECK (
    difficulty_key IS NULL OR
    difficulty_key ~ '^[a-z][a-z0-9_-]{0,79}$'
  );
--> statement-breakpoint
CREATE TABLE appbasis_exercise_catalog_video (
  organization_id text NOT NULL,
  exercise_id text NOT NULL,
  video_url text NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT appbasis_exercise_catalog_video_pk
    PRIMARY KEY (organization_id, exercise_id, video_url),
  CONSTRAINT appbasis_exercise_catalog_video_org_check
    CHECK (char_length(organization_id) BETWEEN 1 AND 200 AND organization_id = btrim(organization_id)),
  CONSTRAINT appbasis_exercise_catalog_video_exercise_check
    CHECK (char_length(exercise_id) BETWEEN 1 AND 200 AND exercise_id = btrim(exercise_id)),
  CONSTRAINT appbasis_exercise_catalog_video_url_check
    CHECK (char_length(video_url) BETWEEN 1 AND 2000 AND (video_url LIKE 'https://%' OR video_url LIKE 'http://%')),
  CONSTRAINT appbasis_exercise_catalog_video_sort_check
    CHECK (sort_order BETWEEN 0 AND 100000)
);
--> statement-breakpoint
CREATE INDEX appbasis_exercise_catalog_video_exercise_idx
  ON appbasis_exercise_catalog_video (organization_id, exercise_id, sort_order, video_url);
--> statement-breakpoint
CREATE TABLE appbasis_exercise_catalog_similarity (
  organization_id text NOT NULL,
  exercise_id text NOT NULL,
  similar_exercise_id text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT appbasis_exercise_catalog_similarity_pk
    PRIMARY KEY (organization_id, exercise_id, similar_exercise_id),
  CONSTRAINT appbasis_exercise_catalog_similarity_org_check
    CHECK (char_length(organization_id) BETWEEN 1 AND 200 AND organization_id = btrim(organization_id)),
  CONSTRAINT appbasis_exercise_catalog_similarity_exercise_check
    CHECK (char_length(exercise_id) BETWEEN 1 AND 200 AND exercise_id = btrim(exercise_id)),
  CONSTRAINT appbasis_exercise_catalog_similarity_target_check
    CHECK (char_length(similar_exercise_id) BETWEEN 1 AND 200 AND similar_exercise_id = btrim(similar_exercise_id)),
  CONSTRAINT appbasis_exercise_catalog_similarity_distinct_check
    CHECK (exercise_id <> similar_exercise_id)
);
--> statement-breakpoint
CREATE INDEX appbasis_exercise_catalog_similarity_target_idx
  ON appbasis_exercise_catalog_similarity (organization_id, similar_exercise_id, exercise_id);
--> statement-breakpoint
CREATE TABLE appbasis_exercise_catalog_usage (
  organization_id text NOT NULL,
  id text NOT NULL,
  exercise_id text NOT NULL,
  occurred_at timestamptz NOT NULL,
  source_kind text NOT NULL,
  source_ref text,
  note text,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT appbasis_exercise_catalog_usage_pk
    PRIMARY KEY (organization_id, id),
  CONSTRAINT appbasis_exercise_catalog_usage_org_check
    CHECK (char_length(organization_id) BETWEEN 1 AND 200 AND organization_id = btrim(organization_id)),
  CONSTRAINT appbasis_exercise_catalog_usage_id_check
    CHECK (char_length(id) BETWEEN 1 AND 200 AND id = btrim(id)),
  CONSTRAINT appbasis_exercise_catalog_usage_exercise_check
    CHECK (char_length(exercise_id) BETWEEN 1 AND 200 AND exercise_id = btrim(exercise_id)),
  CONSTRAINT appbasis_exercise_catalog_usage_source_kind_check
    CHECK (source_kind ~ '^[a-z][a-z0-9_-]{0,79}$'),
  CONSTRAINT appbasis_exercise_catalog_usage_source_ref_check
    CHECK (source_ref IS NULL OR (char_length(source_ref) BETWEEN 1 AND 500 AND source_ref = btrim(source_ref))),
  CONSTRAINT appbasis_exercise_catalog_usage_note_check
    CHECK (note IS NULL OR (char_length(note) BETWEEN 1 AND 2000 AND note = btrim(note)))
);
--> statement-breakpoint
CREATE INDEX appbasis_exercise_catalog_usage_exercise_idx
  ON appbasis_exercise_catalog_usage (organization_id, exercise_id, occurred_at DESC, id DESC);
--> statement-breakpoint
CREATE TABLE appbasis_exercise_catalog_private_media (
  organization_id text NOT NULL,
  id text NOT NULL,
  exercise_id text NOT NULL,
  file_name text NOT NULL,
  storage_key text NOT NULL,
  content_type text NOT NULL,
  size_bytes bigint NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT appbasis_exercise_catalog_private_media_pk
    PRIMARY KEY (organization_id, id),
  CONSTRAINT appbasis_exercise_catalog_private_media_org_check
    CHECK (char_length(organization_id) BETWEEN 1 AND 200 AND organization_id = btrim(organization_id)),
  CONSTRAINT appbasis_exercise_catalog_private_media_id_check
    CHECK (char_length(id) BETWEEN 1 AND 200 AND id = btrim(id)),
  CONSTRAINT appbasis_exercise_catalog_private_media_exercise_check
    CHECK (char_length(exercise_id) BETWEEN 1 AND 200 AND exercise_id = btrim(exercise_id)),
  CONSTRAINT appbasis_exercise_catalog_private_media_file_name_check
    CHECK (char_length(file_name) BETWEEN 1 AND 255 AND file_name = btrim(file_name)),
  CONSTRAINT appbasis_exercise_catalog_private_media_storage_key_check
    CHECK (char_length(storage_key) BETWEEN 1 AND 1000 AND storage_key = btrim(storage_key)),
  CONSTRAINT appbasis_exercise_catalog_private_media_content_type_check
    CHECK (char_length(content_type) BETWEEN 1 AND 200 AND content_type = btrim(content_type)),
  CONSTRAINT appbasis_exercise_catalog_private_media_size_check
    CHECK (size_bytes BETWEEN 1 AND 524288000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX appbasis_exercise_catalog_private_media_storage_unique
  ON appbasis_exercise_catalog_private_media (organization_id, storage_key);
--> statement-breakpoint
CREATE INDEX appbasis_exercise_catalog_private_media_exercise_idx
  ON appbasis_exercise_catalog_private_media (organization_id, exercise_id, created_at, id);
