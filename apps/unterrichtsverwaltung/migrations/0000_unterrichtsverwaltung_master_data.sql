CREATE TABLE "unterrichtsverwaltung_class" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "school_year" text NOT NULL,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "unterrichtsverwaltung_class_name_check"
    CHECK (length(btrim("name")) BETWEEN 1 AND 80),
  CONSTRAINT "unterrichtsverwaltung_class_school_year_check"
    CHECK ("school_year" ~ '^[0-9]{4}/[0-9]{2}$'),
  CONSTRAINT "unterrichtsverwaltung_class_school_year_name_unique"
    UNIQUE ("school_year", "name")
);
--> statement-breakpoint
CREATE INDEX "unterrichtsverwaltung_class_school_year_idx"
  ON "unterrichtsverwaltung_class" ("school_year", "name");
--> statement-breakpoint
CREATE TABLE "unterrichtsverwaltung_student" (
  "id" text PRIMARY KEY NOT NULL,
  "class_id" text NOT NULL REFERENCES "unterrichtsverwaltung_class" ("id") ON DELETE RESTRICT,
  "first_name" text NOT NULL,
  "last_name" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "unterrichtsverwaltung_student_first_name_check"
    CHECK (length(btrim("first_name")) BETWEEN 1 AND 80),
  CONSTRAINT "unterrichtsverwaltung_student_last_name_check"
    CHECK (length(btrim("last_name")) BETWEEN 1 AND 80)
);
--> statement-breakpoint
CREATE INDEX "unterrichtsverwaltung_student_class_idx"
  ON "unterrichtsverwaltung_student" ("class_id", "last_name", "first_name");
