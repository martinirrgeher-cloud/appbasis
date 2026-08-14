CREATE TABLE appbasis_permission_capability (
  capability_id text PRIMARY KEY
);

CREATE TABLE appbasis_permission_role (
  role_id text PRIMARY KEY
);

CREATE TABLE appbasis_permission_role_capability (
  role_id text NOT NULL REFERENCES appbasis_permission_role(role_id) ON DELETE CASCADE,
  capability_id text NOT NULL REFERENCES appbasis_permission_capability(capability_id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, capability_id)
);

CREATE TABLE appbasis_permission_principal (
  principal_id text PRIMARY KEY
);

CREATE TABLE appbasis_permission_principal_role (
  principal_id text NOT NULL REFERENCES appbasis_permission_principal(principal_id) ON DELETE CASCADE,
  role_id text NOT NULL REFERENCES appbasis_permission_role(role_id) ON DELETE CASCADE,
  PRIMARY KEY (principal_id, role_id)
);

CREATE TABLE appbasis_permission_principal_grant (
  principal_id text NOT NULL REFERENCES appbasis_permission_principal(principal_id) ON DELETE CASCADE,
  capability_id text NOT NULL REFERENCES appbasis_permission_capability(capability_id) ON DELETE CASCADE,
  PRIMARY KEY (principal_id, capability_id)
);

CREATE TABLE appbasis_permission_principal_revoke (
  principal_id text NOT NULL REFERENCES appbasis_permission_principal(principal_id) ON DELETE CASCADE,
  capability_id text NOT NULL REFERENCES appbasis_permission_capability(capability_id) ON DELETE CASCADE,
  PRIMARY KEY (principal_id, capability_id)
);
