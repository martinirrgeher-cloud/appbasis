CREATE TABLE "ulc_linz_training_session" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "module_id" text NOT NULL,
  "group_id" text NOT NULL,
  "session_date" date NOT NULL,
  "state" text DEFAULT 'scheduled' NOT NULL,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ulc_linz_training_session_module_check"
    CHECK ("module_id" IN ('kindertraining', 'u12', 'u14')),
  CONSTRAINT "ulc_linz_training_session_state_check"
    CHECK ("state" IN ('scheduled', 'cancelled')),
  CONSTRAINT "ulc_linz_training_session_note_check"
    CHECK ("note" IS NULL OR char_length("note") <= 3000),
  CONSTRAINT "ulc_linz_training_session_scope_unique"
    UNIQUE ("organization_id", "module_id", "group_id", "session_date")
);
--> statement-breakpoint
CREATE INDEX "ulc_linz_training_session_scope_idx"
  ON "ulc_linz_training_session" (
    "organization_id",
    "module_id",
    "group_id",
    "session_date"
  );
--> statement-breakpoint
CREATE TABLE "ulc_linz_training_attendance" (
  "organization_id" text NOT NULL,
  "session_id" text NOT NULL,
  "athlete_id" text NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ulc_linz_training_attendance_status_check"
    CHECK ("status" IN ('open', 'present', 'excused', 'absent')),
  CONSTRAINT "ulc_linz_training_attendance_pk"
    PRIMARY KEY ("session_id", "athlete_id")
);
--> statement-breakpoint
CREATE INDEX "ulc_linz_training_attendance_org_athlete_idx"
  ON "ulc_linz_training_attendance" (
    "organization_id",
    "athlete_id",
    "session_id"
  );
