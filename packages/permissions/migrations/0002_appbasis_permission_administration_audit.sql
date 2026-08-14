CREATE TABLE appbasis_permission_administration_audit (
  event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type text NOT NULL,
  actor_principal_id text NOT NULL,
  reason text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  previous_value jsonb,
  new_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT appbasis_permission_administration_audit_event_type_check
    CHECK (event_type IN (
      'role.create',
      'role.update',
      'role.state',
      'role.delete',
      'principal.roles.replace'
    )),
  CONSTRAINT appbasis_permission_administration_audit_actor_check
    CHECK (
      length(actor_principal_id) BETWEEN 1 AND 200
      AND actor_principal_id = btrim(actor_principal_id)
    ),
  CONSTRAINT appbasis_permission_administration_audit_reason_check
    CHECK (
      length(reason) BETWEEN 1 AND 500
      AND reason = btrim(reason)
    ),
  CONSTRAINT appbasis_permission_administration_audit_target_type_check
    CHECK (target_type IN ('role', 'principal')),
  CONSTRAINT appbasis_permission_administration_audit_target_id_check
    CHECK (
      length(target_id) BETWEEN 1 AND 200
      AND target_id = btrim(target_id)
    ),
  CONSTRAINT appbasis_permission_administration_audit_values_check
    CHECK (previous_value IS NOT NULL OR new_value IS NOT NULL)
);

CREATE INDEX appbasis_permission_administration_audit_target_idx
  ON appbasis_permission_administration_audit (target_type, target_id, created_at DESC);

CREATE INDEX appbasis_permission_administration_audit_actor_idx
  ON appbasis_permission_administration_audit (actor_principal_id, created_at DESC);
