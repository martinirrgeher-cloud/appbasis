ALTER TABLE appbasis_permission_administration_audit
  DROP CONSTRAINT appbasis_permission_administration_audit_event_type_check;

ALTER TABLE appbasis_permission_administration_audit
  ADD CONSTRAINT appbasis_permission_administration_audit_event_type_check
    CHECK (event_type IN (
      'role.create',
      'role.update',
      'role.state',
      'role.delete',
      'principal.roles.replace',
      'principal.permissions.replace'
    ));
