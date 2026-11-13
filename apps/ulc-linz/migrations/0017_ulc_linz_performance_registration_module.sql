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

--> statement-breakpoint
-- Audit is written in the same transaction as the IRG assignment and survives
-- removal of an ordinary training group; it is retained for exactly 12 months.
-- REVIEW ONLY: retention/export/legal review is still required before activation.
CREATE TABLE ulc_linz_irg_module_assignment_audit (
  event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL CHECK (
    char_length(organization_id) BETWEEN 1 AND 200 AND organization_id=btrim(organization_id)
  ),
  group_id text NOT NULL CHECK (
    char_length(group_id) BETWEEN 1 AND 200 AND group_id=btrim(group_id)
  ),
  module_id text NOT NULL DEFAULT 'performance_registration'
    CHECK (module_id='performance_registration'),
  actor_identity_id text NOT NULL CHECK (
    char_length(actor_identity_id) BETWEEN 1 AND 200 AND actor_identity_id=btrim(actor_identity_id)
  ),
  event_type text NOT NULL DEFAULT 'assign'
    CHECK (event_type='assign'),
  reason text NOT NULL CHECK (
    char_length(reason) BETWEEN 12 AND 300 AND reason=btrim(reason)
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  retained_until timestamptz NOT NULL DEFAULT (now() + interval '12 months'),
  CONSTRAINT ulc_linz_irg_module_assignment_audit_retention_check
    CHECK (retained_until=created_at+interval '12 months'),
  -- No silent reclassification/reuse of an IRG group after removal.
  CONSTRAINT ulc_linz_irg_module_assignment_once
    UNIQUE (organization_id,group_id,event_type)
);
--> statement-breakpoint
CREATE INDEX ulc_linz_irg_module_assignment_audit_retention_idx
  ON ulc_linz_irg_module_assignment_audit(retained_until);
