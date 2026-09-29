ALTER TABLE "appbasis_identity_operation"
  ADD COLUMN "provisioning_owner" text,
  ADD COLUMN "actor_principal_id" text,
  ADD COLUMN "reason" text;
--> statement-breakpoint
ALTER TABLE "appbasis_identity_operation"
  ADD CONSTRAINT "appbasis_identity_operation_provisioning_audit_shape_check"
  CHECK (
    (
      "provisioning_owner" IS NULL
      AND "actor_principal_id" IS NULL
      AND "reason" IS NULL
    )
    OR
    (
      "kind" = 'provision'
      AND "provisioning_owner" IS NOT NULL
      AND "actor_principal_id" IS NOT NULL
      AND "reason" IS NOT NULL
      AND char_length("provisioning_owner") BETWEEN 1 AND 120
      AND "provisioning_owner" = btrim("provisioning_owner")
      AND char_length("actor_principal_id") BETWEEN 1 AND 200
      AND "actor_principal_id" = btrim("actor_principal_id")
      AND char_length("reason") BETWEEN 1 AND 500
      AND "reason" = btrim("reason")
    )
  );
