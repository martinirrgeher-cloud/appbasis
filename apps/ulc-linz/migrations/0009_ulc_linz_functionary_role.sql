-- ULC native organization functionary role. This migration must be applied
-- explicitly to the isolated Preview before functionary provisioning is enabled.
-- Existing member, trainer, athlete, and admin rows are untouched.
ALTER TABLE ulc_linz_membership
  DROP CONSTRAINT ulc_linz_membership_source_role_check;
ALTER TABLE ulc_linz_membership
  ADD CONSTRAINT ulc_linz_membership_source_role_check
  CHECK (source_role IN ('admin', 'trainer', 'athlete', 'parent', 'functionary'));
--> statement-breakpoint
ALTER TABLE ulc_linz_lifecycle_deletion
  DROP CONSTRAINT ulc_linz_lifecycle_deletion_source_role_check;
ALTER TABLE ulc_linz_lifecycle_deletion
  ADD CONSTRAINT ulc_linz_lifecycle_deletion_source_role_check
  CHECK (source_role IN ('trainer', 'athlete', 'parent', 'functionary'));

-- Permission role ulc-linz:functionary is provisioned by the permissions owner
-- through ULC_LINZ_M5_PERMISSION_PROVISIONING_BUNDLE, not by an app migration.
-- Operators must apply that owner provisioning separately before activating
-- functionary account creation; its existing readiness check fails closed.
