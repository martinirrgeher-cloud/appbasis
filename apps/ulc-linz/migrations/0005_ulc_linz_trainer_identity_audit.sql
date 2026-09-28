CREATE TABLE "ulc_linz_trainer_identity_audit" (
  "event_id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "event_type" text NOT NULL,
  "actor_principal_id" text NOT NULL,
  "organization_id" text NOT NULL,
  "target_identity_id" text NOT NULL,
  "previous_subject_id" text NOT NULL,
  "new_subject_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "retained_until" timestamp with time zone DEFAULT (now() + interval '12 months') NOT NULL,
  CONSTRAINT "ulc_linz_trainer_identity_audit_event_type_check"
    CHECK ("event_type" IN ('trainer.identity.bind', 'trainer.identity.detach-stale')),
  CONSTRAINT "ulc_linz_trainer_identity_audit_actor_check"
    CHECK (char_length("actor_principal_id") BETWEEN 1 AND 200 AND "actor_principal_id" = btrim("actor_principal_id")),
  CONSTRAINT "ulc_linz_trainer_identity_audit_organization_check"
    CHECK (char_length("organization_id") BETWEEN 1 AND 200 AND "organization_id" = btrim("organization_id")),
  CONSTRAINT "ulc_linz_trainer_identity_audit_target_check"
    CHECK (char_length("target_identity_id") BETWEEN 1 AND 200 AND "target_identity_id" = btrim("target_identity_id")),
  CONSTRAINT "ulc_linz_trainer_identity_audit_previous_subject_check"
    CHECK (char_length("previous_subject_id") BETWEEN 1 AND 200 AND "previous_subject_id" = btrim("previous_subject_id")),
  CONSTRAINT "ulc_linz_trainer_identity_audit_new_subject_check"
    CHECK (char_length("new_subject_id") BETWEEN 1 AND 200 AND "new_subject_id" = btrim("new_subject_id")),
  CONSTRAINT "ulc_linz_trainer_identity_audit_retention_check"
    CHECK ("retained_until" = "created_at" + interval '12 months')
);
--> statement-breakpoint
CREATE INDEX "ulc_linz_trainer_identity_audit_target_idx"
  ON "ulc_linz_trainer_identity_audit" ("organization_id", "target_identity_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX "ulc_linz_trainer_identity_audit_actor_idx"
  ON "ulc_linz_trainer_identity_audit" ("actor_principal_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX "ulc_linz_trainer_identity_audit_retention_idx"
  ON "ulc_linz_trainer_identity_audit" ("retained_until");
