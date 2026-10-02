CREATE TABLE "ulc_linz_training_module_group" (
  "organization_id" text NOT NULL,
  "module_id" text NOT NULL,
  "group_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ulc_linz_training_module_group_pk"
    PRIMARY KEY ("organization_id", "module_id"),
  CONSTRAINT "ulc_linz_training_module_group_group_unique"
    UNIQUE ("organization_id", "group_id"),
  CONSTRAINT "ulc_linz_training_module_group_module_check"
    CHECK ("module_id" IN ('kindertraining', 'u12', 'u14')),
  CONSTRAINT "ulc_linz_training_module_group_organization_check"
    CHECK (char_length("organization_id") BETWEEN 1 AND 200 AND "organization_id" = btrim("organization_id")),
  CONSTRAINT "ulc_linz_training_module_group_group_check"
    CHECK (char_length("group_id") BETWEEN 1 AND 200 AND "group_id" = btrim("group_id"))
);
