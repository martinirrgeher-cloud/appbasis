CREATE TABLE "ulc_linz_exercise_catalog_item" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "name" text NOT NULL,
  "category_key" text NOT NULL,
  "subcategory" text,
  "goal" text,
  "description" text,
  "coaching_cues" text,
  "common_mistakes" text,
  "equipment" text[] DEFAULT '{}'::text[] NOT NULL,
  "video_url" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ulc_linz_exercise_catalog_item_id_check"
    CHECK (char_length("id") BETWEEN 1 AND 200 AND "id" = btrim("id")),
  CONSTRAINT "ulc_linz_exercise_catalog_item_organization_check"
    CHECK (char_length("organization_id") BETWEEN 1 AND 200 AND "organization_id" = btrim("organization_id")),
  CONSTRAINT "ulc_linz_exercise_catalog_item_name_check"
    CHECK (char_length("name") BETWEEN 2 AND 120 AND "name" = btrim("name")),
  CONSTRAINT "ulc_linz_exercise_catalog_item_category_check"
    CHECK ("category_key" IN (
      'warmup',
      'acceleration',
      'max_velocity',
      'speed_endurance',
      'start_reaction',
      'technique',
      'plyometrics',
      'strength',
      'stability',
      'regeneration',
      'other'
    )),
  CONSTRAINT "ulc_linz_exercise_catalog_item_subcategory_check"
    CHECK (
      "subcategory" IS NULL
      OR (
        char_length("subcategory") BETWEEN 1 AND 100
        AND "subcategory" = btrim("subcategory")
      )
    ),
  CONSTRAINT "ulc_linz_exercise_catalog_item_goal_check"
    CHECK (
      "goal" IS NULL
      OR (
        char_length("goal") BETWEEN 1 AND 240
        AND "goal" = btrim("goal")
      )
    ),
  CONSTRAINT "ulc_linz_exercise_catalog_item_description_check"
    CHECK (
      "description" IS NULL
      OR (
        char_length("description") BETWEEN 1 AND 10000
        AND "description" = btrim("description")
      )
    ),
  CONSTRAINT "ulc_linz_exercise_catalog_item_coaching_cues_check"
    CHECK (
      "coaching_cues" IS NULL
      OR (
        char_length("coaching_cues") BETWEEN 1 AND 10000
        AND "coaching_cues" = btrim("coaching_cues")
      )
    ),
  CONSTRAINT "ulc_linz_exercise_catalog_item_common_mistakes_check"
    CHECK (
      "common_mistakes" IS NULL
      OR (
        char_length("common_mistakes") BETWEEN 1 AND 10000
        AND "common_mistakes" = btrim("common_mistakes")
      )
    ),
  CONSTRAINT "ulc_linz_exercise_catalog_item_equipment_check"
    CHECK (
      cardinality("equipment") <= 100
      AND array_position("equipment", NULL) IS NULL
    ),
  CONSTRAINT "ulc_linz_exercise_catalog_item_video_url_check"
    CHECK (
      "video_url" IS NULL
      OR (
        char_length("video_url") BETWEEN 1 AND 2000
        AND ("video_url" LIKE 'https://%' OR "video_url" LIKE 'http://%')
      )
    )
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ulc_linz_exercise_catalog_item_org_name_unique"
  ON "ulc_linz_exercise_catalog_item" ("organization_id", lower("name"));
--> statement-breakpoint
CREATE INDEX "ulc_linz_exercise_catalog_item_org_category_idx"
  ON "ulc_linz_exercise_catalog_item" (
    "organization_id",
    "category_key",
    "is_active"
  );
--> statement-breakpoint
CREATE INDEX "ulc_linz_exercise_catalog_item_org_active_name_idx"
  ON "ulc_linz_exercise_catalog_item" (
    "organization_id",
    "is_active",
    lower("name")
  );
--> statement-breakpoint
CREATE TABLE "ulc_linz_exercise_parameter" (
  "organization_id" text NOT NULL,
  "exercise_id" text NOT NULL,
  "parameter_key" text NOT NULL,
  "label" text NOT NULL,
  "unit" text DEFAULT '' NOT NULL,
  "input_type" text NOT NULL,
  "default_value" text,
  "min_value" numeric,
  "max_value" numeric,
  "step_value" numeric,
  "is_required" boolean DEFAULT false NOT NULL,
  "sort_order" integer DEFAULT 100 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ulc_linz_exercise_parameter_pk"
    PRIMARY KEY ("organization_id", "exercise_id", "parameter_key"),
  CONSTRAINT "ulc_linz_exercise_parameter_organization_check"
    CHECK (char_length("organization_id") BETWEEN 1 AND 200 AND "organization_id" = btrim("organization_id")),
  CONSTRAINT "ulc_linz_exercise_parameter_exercise_check"
    CHECK (char_length("exercise_id") BETWEEN 1 AND 200 AND "exercise_id" = btrim("exercise_id")),
  CONSTRAINT "ulc_linz_exercise_parameter_key_check"
    CHECK ("parameter_key" IN (
      'sets',
      'repetitions',
      'distance_m',
      'weight_kg',
      'duration_s',
      'target_time_s',
      'intensity_percent',
      'rest_s',
      'series_rest_s',
      'approach_distance_m',
      'flying_distance_m',
      'contacts',
      'resistance_kg',
      'height_cm',
      'tempo_text',
      'surface_text',
      'start_position_text',
      'note_text'
    )),
  CONSTRAINT "ulc_linz_exercise_parameter_label_check"
    CHECK (char_length("label") BETWEEN 1 AND 80 AND "label" = btrim("label")),
  CONSTRAINT "ulc_linz_exercise_parameter_unit_check"
    CHECK (char_length("unit") <= 20 AND "unit" = btrim("unit")),
  CONSTRAINT "ulc_linz_exercise_parameter_input_type_check"
    CHECK ("input_type" IN ('number', 'text')),
  CONSTRAINT "ulc_linz_exercise_parameter_default_value_check"
    CHECK ("default_value" IS NULL OR char_length("default_value") <= 200),
  CONSTRAINT "ulc_linz_exercise_parameter_range_check"
    CHECK ("min_value" IS NULL OR "max_value" IS NULL OR "min_value" <= "max_value"),
  CONSTRAINT "ulc_linz_exercise_parameter_step_check"
    CHECK ("step_value" IS NULL OR "step_value" > 0),
  CONSTRAINT "ulc_linz_exercise_parameter_sort_order_check"
    CHECK ("sort_order" BETWEEN 0 AND 100000)
);
--> statement-breakpoint
CREATE INDEX "ulc_linz_exercise_parameter_exercise_idx"
  ON "ulc_linz_exercise_parameter" (
    "organization_id",
    "exercise_id",
    "sort_order",
    "parameter_key"
  );
--> statement-breakpoint
CREATE TABLE "ulc_linz_exercise_group" (
  "organization_id" text NOT NULL,
  "exercise_id" text NOT NULL,
  "group_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ulc_linz_exercise_group_pk"
    PRIMARY KEY ("organization_id", "exercise_id", "group_id"),
  CONSTRAINT "ulc_linz_exercise_group_organization_check"
    CHECK (char_length("organization_id") BETWEEN 1 AND 200 AND "organization_id" = btrim("organization_id")),
  CONSTRAINT "ulc_linz_exercise_group_exercise_check"
    CHECK (char_length("exercise_id") BETWEEN 1 AND 200 AND "exercise_id" = btrim("exercise_id")),
  CONSTRAINT "ulc_linz_exercise_group_group_check"
    CHECK (char_length("group_id") BETWEEN 1 AND 200 AND "group_id" = btrim("group_id"))
);
--> statement-breakpoint
CREATE INDEX "ulc_linz_exercise_group_group_idx"
  ON "ulc_linz_exercise_group" ("organization_id", "group_id", "exercise_id");
--> statement-breakpoint
CREATE TABLE "ulc_linz_exercise_favorite" (
  "organization_id" text NOT NULL,
  "identity_id" text NOT NULL,
  "exercise_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ulc_linz_exercise_favorite_pk"
    PRIMARY KEY ("organization_id", "identity_id", "exercise_id"),
  CONSTRAINT "ulc_linz_exercise_favorite_organization_check"
    CHECK (char_length("organization_id") BETWEEN 1 AND 200 AND "organization_id" = btrim("organization_id")),
  CONSTRAINT "ulc_linz_exercise_favorite_identity_check"
    CHECK (char_length("identity_id") BETWEEN 1 AND 200 AND "identity_id" = btrim("identity_id")),
  CONSTRAINT "ulc_linz_exercise_favorite_exercise_check"
    CHECK (char_length("exercise_id") BETWEEN 1 AND 200 AND "exercise_id" = btrim("exercise_id"))
);
--> statement-breakpoint
CREATE INDEX "ulc_linz_exercise_favorite_identity_idx"
  ON "ulc_linz_exercise_favorite" (
    "organization_id",
    "identity_id",
    "exercise_id"
  );
