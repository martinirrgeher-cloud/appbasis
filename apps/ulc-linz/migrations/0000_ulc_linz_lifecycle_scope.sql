CREATE TABLE "ulc_linz_membership" (
  "identity_id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "subject_id" text NOT NULL,
  "source_role" text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "ended_at" timestamp with time zone,
  "retention_exception_reason" text,
  "retention_exception_actor" text,
  "retention_review_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ulc_linz_membership_source_role_check"
    CHECK ("source_role" IN ('admin', 'trainer', 'athlete', 'parent')),
  CONSTRAINT "ulc_linz_membership_retention_exception_check"
    CHECK (
      ("retention_exception_reason" IS NULL AND "retention_exception_actor" IS NULL AND "retention_review_at" IS NULL)
      OR
      ("retention_exception_reason" IS NOT NULL AND "retention_exception_actor" IS NOT NULL AND "retention_review_at" IS NOT NULL)
    )
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ulc_linz_membership_subject_id_unique"
  ON "ulc_linz_membership" ("subject_id");
--> statement-breakpoint
CREATE INDEX "ulc_linz_membership_retention_idx"
  ON "ulc_linz_membership" ("active", "ended_at");
--> statement-breakpoint
CREATE TABLE "ulc_linz_subject_scope" (
  "identity_id" text NOT NULL,
  "organization_id" text NOT NULL,
  "subject_id" text NOT NULL,
  "relation_type" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ulc_linz_subject_scope_relation_type_check"
    CHECK ("relation_type" IN ('self', 'managed')),
  CONSTRAINT "ulc_linz_subject_scope_pk"
    PRIMARY KEY ("identity_id", "organization_id", "subject_id", "relation_type")
);
--> statement-breakpoint
CREATE INDEX "ulc_linz_subject_scope_subject_idx"
  ON "ulc_linz_subject_scope" ("organization_id", "subject_id");
--> statement-breakpoint
CREATE TABLE "ulc_linz_lifecycle_deletion" (
  "identity_id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "source_role" text NOT NULL,
  "completed_at" timestamp with time zone NOT NULL,
  "purge_after" timestamp with time zone NOT NULL,
  CONSTRAINT "ulc_linz_lifecycle_deletion_source_role_check"
    CHECK ("source_role" IN ('trainer', 'athlete', 'parent')),
  CONSTRAINT "ulc_linz_lifecycle_deletion_purge_after_check"
    CHECK ("purge_after" > "completed_at")
);
--> statement-breakpoint
CREATE INDEX "ulc_linz_lifecycle_deletion_purge_idx"
  ON "ulc_linz_lifecycle_deletion" ("purge_after");
