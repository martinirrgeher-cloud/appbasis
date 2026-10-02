const ULC_APP_ID = "ulc-linz";

export function extendUlcLinzDatabaseAssetsTemplate(input, generated) {
  if (input?.appId !== ULC_APP_ID) return generated;

  const assets = generatedUlcLinzDatabaseAssets();
  for (const asset of assets) {
    if (generated.files.some((entry) => entry.path === asset.path)) {
      throw new Error(`ULC Linz database asset path is already generated: ${asset.path}.`);
    }
  }

  return Object.freeze({
    ...generated,
    files: Object.freeze([...generated.files, ...assets]),
  });
}

export function generatedUlcLinzDatabaseAssets() {
  return Object.freeze([
    file("migrations/0000_ulc_linz_lifecycle_scope.sql", lifecycleScopeMigration()),
    file(
      "migrations/0001_ulc_linz_retention_deletion_claim.sql",
      retentionDeletionClaimMigration(),
    ),
    file(
      "migrations/0004_ulc_linz_training_sessions.sql",
      trainingSessionsMigration(),
    ),
    file(
      "migrations/0005_ulc_linz_trainer_identity_audit.sql",
      trainerIdentityAuditMigration(),
    ),
    file(
      "migrations/0006_ulc_linz_training_module_groups.sql",
      trainingModuleGroupsMigration(),
    ),
  ]);
}

function lifecycleScopeMigration() {
  return `CREATE TABLE "ulc_linz_membership" (\n  "identity_id" text PRIMARY KEY NOT NULL,\n  "organization_id" text NOT NULL,\n  "subject_id" text NOT NULL,\n  "source_role" text NOT NULL,\n  "active" boolean DEFAULT true NOT NULL,\n  "ended_at" timestamp with time zone,\n  "retention_exception_reason" text,\n  "retention_exception_actor" text,\n  "retention_exception_created_at" timestamp with time zone,\n  "retention_review_at" timestamp with time zone,\n  "created_at" timestamp with time zone DEFAULT now() NOT NULL,\n  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,\n  CONSTRAINT "ulc_linz_membership_source_role_check"\n    CHECK ("source_role" IN ('admin', 'trainer', 'athlete', 'parent')),\n  CONSTRAINT "ulc_linz_membership_lifecycle_state_check"\n    CHECK (\n      ("active" = true AND "ended_at" IS NULL)\n      OR\n      ("active" = false AND "ended_at" IS NOT NULL AND "source_role" <> 'admin')\n    ),\n  CONSTRAINT "ulc_linz_membership_retention_exception_check"\n    CHECK (\n      (\n        "retention_exception_reason" IS NULL\n        AND "retention_exception_actor" IS NULL\n        AND "retention_exception_created_at" IS NULL\n        AND "retention_review_at" IS NULL\n      )\n      OR\n      (\n        "active" = false\n        AND "source_role" <> 'admin'\n        AND "retention_exception_reason" IS NOT NULL\n        AND "retention_exception_actor" IS NOT NULL\n        AND "retention_exception_created_at" IS NOT NULL\n        AND "retention_review_at" IS NOT NULL\n        AND "retention_review_at" > "retention_exception_created_at"\n      )\n    )\n);\n--> statement-breakpoint\nCREATE UNIQUE INDEX "ulc_linz_membership_subject_id_unique"\n  ON "ulc_linz_membership" ("subject_id");\n--> statement-breakpoint\nCREATE INDEX "ulc_linz_membership_retention_idx"\n  ON "ulc_linz_membership" ("active", "ended_at");\n--> statement-breakpoint\nCREATE TABLE "ulc_linz_subject_scope" (\n  "identity_id" text NOT NULL,\n  "organization_id" text NOT NULL,\n  "subject_id" text NOT NULL,\n  "relation_type" text NOT NULL,\n  "created_at" timestamp with time zone DEFAULT now() NOT NULL,\n  CONSTRAINT "ulc_linz_subject_scope_relation_type_check"\n    CHECK ("relation_type" IN ('self', 'managed')),\n  CONSTRAINT "ulc_linz_subject_scope_pk"\n    PRIMARY KEY ("identity_id", "organization_id", "subject_id", "relation_type")\n);\n--> statement-breakpoint\nCREATE INDEX "ulc_linz_subject_scope_subject_idx"\n  ON "ulc_linz_subject_scope" ("organization_id", "subject_id");\n--> statement-breakpoint\nCREATE TABLE "ulc_linz_lifecycle_deletion" (\n  "identity_id" text PRIMARY KEY NOT NULL,\n  "organization_id" text NOT NULL,\n  "subject_id" text NOT NULL,\n  "source_role" text NOT NULL,\n  "completed_at" timestamp with time zone NOT NULL,\n  "purge_after" timestamp with time zone NOT NULL,\n  CONSTRAINT "ulc_linz_lifecycle_deletion_source_role_check"\n    CHECK ("source_role" IN ('trainer', 'athlete', 'parent')),\n  CONSTRAINT "ulc_linz_lifecycle_deletion_purge_after_check"\n    CHECK ("purge_after" = "completed_at" + interval '35 days')\n);\n--> statement-breakpoint\nCREATE INDEX "ulc_linz_lifecycle_deletion_purge_idx"\n  ON "ulc_linz_lifecycle_deletion" ("purge_after");\n--> statement-breakpoint\nCREATE TABLE "ulc_linz_lifecycle_audit" (\n  "event_id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,\n  "event_type" text NOT NULL,\n  "actor_principal_id" text NOT NULL,\n  "target_identity_id" text NOT NULL,\n  "organization_id" text NOT NULL,\n  "reason" text NOT NULL,\n  "review_at" timestamp with time zone,\n  "created_at" timestamp with time zone NOT NULL,\n  CONSTRAINT "ulc_linz_lifecycle_audit_event_type_check"\n    CHECK ("event_type" IN ('identity.delete.completed', 'retention.exception.set')),\n  CONSTRAINT "ulc_linz_lifecycle_audit_shape_check"\n    CHECK (\n      ("event_type" = 'identity.delete.completed' AND "review_at" IS NULL)\n      OR\n      ("event_type" = 'retention.exception.set' AND "review_at" IS NOT NULL AND "review_at" > "created_at")\n    )\n);\n--> statement-breakpoint\nCREATE INDEX "ulc_linz_lifecycle_audit_created_idx"\n  ON "ulc_linz_lifecycle_audit" ("created_at");\n--> statement-breakpoint\nCREATE INDEX "ulc_linz_lifecycle_audit_target_idx"\n  ON "ulc_linz_lifecycle_audit" ("target_identity_id", "created_at");\n`;
}

function retentionDeletionClaimMigration() {
  return `ALTER TABLE "ulc_linz_membership"\n  ADD COLUMN "retention_deletion_claimed_at" timestamp with time zone;\n--> statement-breakpoint\nALTER TABLE "ulc_linz_membership"\n  ADD CONSTRAINT "ulc_linz_membership_retention_deletion_claim_check"\n  CHECK (\n    "retention_deletion_claimed_at" IS NULL\n    OR (\n      "active" = false\n      AND "ended_at" IS NOT NULL\n      AND "source_role" <> 'admin'\n      AND "ended_at" + interval '12 months' < "retention_deletion_claimed_at"\n      AND (\n        "retention_review_at" IS NULL\n        OR "retention_review_at" <= "retention_deletion_claimed_at"\n      )\n    )\n  );\n`;
}

function trainingSessionsMigration() {
  return `CREATE TABLE "ulc_linz_training_session" (\n  "id" text PRIMARY KEY NOT NULL,\n  "organization_id" text NOT NULL,\n  "module_id" text NOT NULL,\n  "group_id" text NOT NULL,\n  "session_date" date NOT NULL,\n  "state" text DEFAULT 'scheduled' NOT NULL,\n  "note" text,\n  "created_at" timestamp with time zone DEFAULT now() NOT NULL,\n  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,\n  CONSTRAINT "ulc_linz_training_session_module_check"\n    CHECK ("module_id" IN ('kindertraining', 'u12', 'u14')),\n  CONSTRAINT "ulc_linz_training_session_state_check"\n    CHECK ("state" IN ('scheduled', 'cancelled')),\n  CONSTRAINT "ulc_linz_training_session_note_check"\n    CHECK ("note" IS NULL OR char_length("note") <= 3000),\n  CONSTRAINT "ulc_linz_training_session_scope_unique"\n    UNIQUE ("organization_id", "module_id", "group_id", "session_date")\n);\n--> statement-breakpoint\nCREATE INDEX "ulc_linz_training_session_scope_idx"\n  ON "ulc_linz_training_session" (\n    "organization_id",\n    "module_id",\n    "group_id",\n    "session_date"\n  );\n--> statement-breakpoint\nCREATE TABLE "ulc_linz_training_attendance" (\n  "organization_id" text NOT NULL,\n  "session_id" text NOT NULL,\n  "athlete_id" text NOT NULL,\n  "status" text DEFAULT 'open' NOT NULL,\n  "created_at" timestamp with time zone DEFAULT now() NOT NULL,\n  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,\n  CONSTRAINT "ulc_linz_training_attendance_status_check"\n    CHECK ("status" IN ('open', 'present', 'excused', 'absent')),\n  CONSTRAINT "ulc_linz_training_attendance_pk"\n    PRIMARY KEY ("session_id", "athlete_id")\n);\n--> statement-breakpoint\nCREATE INDEX "ulc_linz_training_attendance_org_athlete_idx"\n  ON "ulc_linz_training_attendance" (\n    "organization_id",\n    "athlete_id",\n    "session_id"\n  );\n`;
}

function trainerIdentityAuditMigration() {
  return `CREATE TABLE "ulc_linz_trainer_identity_audit" (\n  "event_id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,\n  "event_type" text NOT NULL,\n  "actor_principal_id" text NOT NULL,\n  "organization_id" text NOT NULL,\n  "target_identity_id" text NOT NULL,\n  "previous_subject_id" text NOT NULL,\n  "new_subject_id" text NOT NULL,\n  "created_at" timestamp with time zone DEFAULT now() NOT NULL,\n  "retained_until" timestamp with time zone DEFAULT (now() + interval '12 months') NOT NULL,\n  CONSTRAINT "ulc_linz_trainer_identity_audit_event_type_check"\n    CHECK ("event_type" IN ('trainer.identity.bind', 'trainer.identity.detach-stale')),\n  CONSTRAINT "ulc_linz_trainer_identity_audit_actor_check"\n    CHECK (char_length("actor_principal_id") BETWEEN 1 AND 200 AND "actor_principal_id" = btrim("actor_principal_id")),\n  CONSTRAINT "ulc_linz_trainer_identity_audit_organization_check"\n    CHECK (char_length("organization_id") BETWEEN 1 AND 200 AND "organization_id" = btrim("organization_id")),\n  CONSTRAINT "ulc_linz_trainer_identity_audit_target_check"\n    CHECK (char_length("target_identity_id") BETWEEN 1 AND 200 AND "target_identity_id" = btrim("target_identity_id")),\n  CONSTRAINT "ulc_linz_trainer_identity_audit_previous_subject_check"\n    CHECK (char_length("previous_subject_id") BETWEEN 1 AND 200 AND "previous_subject_id" = btrim("previous_subject_id")),\n  CONSTRAINT "ulc_linz_trainer_identity_audit_new_subject_check"\n    CHECK (char_length("new_subject_id") BETWEEN 1 AND 200 AND "new_subject_id" = btrim("new_subject_id")),\n  CONSTRAINT "ulc_linz_trainer_identity_audit_retention_check"\n    CHECK ("retained_until" = "created_at" + interval '12 months')\n);\n--> statement-breakpoint\nCREATE INDEX "ulc_linz_trainer_identity_audit_target_idx"\n  ON "ulc_linz_trainer_identity_audit" ("organization_id", "target_identity_id", "created_at" DESC);\n--> statement-breakpoint\nCREATE INDEX "ulc_linz_trainer_identity_audit_actor_idx"\n  ON "ulc_linz_trainer_identity_audit" ("actor_principal_id", "created_at" DESC);\n--> statement-breakpoint\nCREATE INDEX "ulc_linz_trainer_identity_audit_retention_idx"\n  ON "ulc_linz_trainer_identity_audit" ("retained_until");\n`;
}

function trainingModuleGroupsMigration() {
  return `CREATE TABLE "ulc_linz_training_module_group" (\n  "organization_id" text NOT NULL,\n  "module_id" text NOT NULL,\n  "group_id" text NOT NULL,\n  "created_at" timestamp with time zone DEFAULT now() NOT NULL,\n  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,\n  CONSTRAINT "ulc_linz_training_module_group_pk"\n    PRIMARY KEY ("organization_id", "module_id"),\n  CONSTRAINT "ulc_linz_training_module_group_group_unique"\n    UNIQUE ("organization_id", "group_id"),\n  CONSTRAINT "ulc_linz_training_module_group_module_check"\n    CHECK ("module_id" IN ('kindertraining', 'u12', 'u14')),\n  CONSTRAINT "ulc_linz_training_module_group_organization_check"\n    CHECK (char_length("organization_id") BETWEEN 1 AND 200 AND "organization_id" = btrim("organization_id")),\n  CONSTRAINT "ulc_linz_training_module_group_group_check"\n    CHECK (char_length("group_id") BETWEEN 1 AND 200 AND "group_id" = btrim("group_id"))\n);\n`;
}

function file(path, content) {
  return Object.freeze({ path, content });
}
