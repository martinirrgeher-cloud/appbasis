-- N16: v18 REVIEW-ONLY candidate, NOT registered in appbasis.database.json.
-- Execute ONLY in an isolated regression DB until a separate migration gate.
-- No backfill, no IRG group assignments, no permission grants, no user data.
-- The existing UNIQUE (organization_id, group_id) invariant stays intact.
ALTER TABLE ulc_linz_training_module_group
  DROP CONSTRAINT ulc_linz_training_module_group_module_check;
--> statement-breakpoint
ALTER TABLE ulc_linz_training_module_group
  ADD CONSTRAINT ulc_linz_training_module_group_module_check
  CHECK (module_id IN ('kindertraining','u12','u14','performance_registration'));
