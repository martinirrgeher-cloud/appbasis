import assert from "node:assert/strict";
import test from "node:test";

import {
  preflightUlcLinzD4PreviewDatabaseAccess,
  reconcileUlcLinzD4PreviewDatabaseAccess,
} from "./ulc-linz-d4-preview-database-access.mjs";

const HOST = "ep-ulc-preview.eu-central-1.aws.neon.tech";
const DATABASE = "appbasis_ulc_linz_preview";
const MIGRATION_URL =
  "postgresql://ulc_preview_owner:owner-password@" +
  HOST +
  "/" +
  DATABASE +
  "?sslmode=require";
const APPLICATION_URL =
  "postgresql://ulc_preview_app:app-password@" +
  HOST +
  "/" +
  DATABASE +
  "?sslmode=require";
const SECURITY_URL =
  "postgresql://ulc_preview_security_ingest:security-password@" +
  HOST +
  "/" +
  DATABASE +
  "?sslmode=require";
const PREVIEW_SECURITY_GROUP = "appbasis_ulc_linz_preview_security_ingest";

const SECURITY_INGEST_COLUMNS = [
  "schema_version",
  "app_id",
  "category",
  "event_type",
  "occurred_at",
  "actor_principal_id",
  "organization_id",
  "action",
  "target_type",
  "target_id",
  "operation",
  "http_status",
  "error_code",
  "reason_code",
  "retained_until",
];

function runtimeRole(name, login) {
  return {
    rolname: name,
    rolcanlogin: login,
    rolsuper: false,
    rolcreatedb: false,
    rolcreaterole: false,
    rolreplication: false,
    rolbypassrls: false,
  };
}

function exactGroupGrants() {
  return [
    {
      object_kind: "schema",
      schema_name: null,
      object_name: "public",
      column_name: null,
      privilege_type: "USAGE",
      is_grantable: false,
    },
    ...SECURITY_INGEST_COLUMNS.map((column_name) => ({
      object_kind: "column",
      schema_name: "public",
      object_name: "ulc_linz_security_event_log",
      column_name,
      privilege_type: "INSERT",
      is_grantable: false,
    })),
    {
      object_kind: "sequence",
      schema_name: "public",
      object_name: "ulc_linz_security_event_log_id_seq",
      column_name: null,
      privilege_type: "USAGE",
      is_grantable: false,
    },
  ];
}

function exactSecurityAccess(overrides = {}) {
  return {
    current_user: "ulc_preview_security_ingest",
    database_create: false,
    schema_usage: true,
    schema_create: false,
    non_security_schema_create_count: 0,
    non_security_table_access_count: 0,
    non_security_sequence_access_count: 0,
    non_security_function_access_count: 0,
    inherited_role_count: 1,
    has_ingest_role: true,
    has_table_insert: false,
    can_insert_allowed_columns: true,
    can_insert_id: false,
    can_insert_recorded_at: false,
    can_use_sequence: true,
    can_select: false,
    can_select_any_column: false,
    can_update: false,
    can_update_any_column: false,
    can_reference: false,
    can_reference_any_column: false,
    can_delete: false,
    can_truncate: false,
    can_trigger: false,
    can_maintain: false,
    can_select_sequence: false,
    can_update_sequence: false,
    ...overrides,
  };
}

function exactApplicationAccess(overrides = {}) {
  return {
    current_user: "ulc_preview_app",
    database_create: false,
    schema_usage: true,
    schema_create: false,
    all_runtime_table_dml: true,
    all_runtime_sequence_access: true,
    non_public_schema_create_count: 0,
    non_public_table_access_count: 0,
    non_public_sequence_access_count: 0,
    non_public_function_access_count: 0,
    owned_database_count: 0,
    owned_schema_count: 0,
    owned_relation_count: 0,
    owned_function_count: 0,
    owned_type_count: 0,
    security_select: false,
    security_insert: false,
    security_update: false,
    security_delete: false,
    security_truncate: false,
    security_references: false,
    security_trigger: false,
    security_maintain: false,
    security_column_select: false,
    security_column_insert: false,
    security_column_update: false,
    security_column_references: false,
    security_sequence_usage: false,
    security_sequence_select: false,
    security_sequence_update: false,
    security_purge_execute: false,
    ...overrides,
  };
}

function migrationCreatorMembership(overrides = {}) {
  return {
    parent: PREVIEW_SECURITY_GROUP,
    member: "ulc_preview_owner",
    grantor: "cloud_admin",
    admin_option: true,
    inherit_option: false,
    set_option: false,
    ...overrides,
  };
}

function securityMembership() {
  return {
    parent: PREVIEW_SECURITY_GROUP,
    member: "ulc_preview_security_ingest",
    grantor: "ulc_preview_owner",
    admin_option: false,
    inherit_option: true,
    set_option: true,
  };
}

function ownerFixture({
  applicationOwnership = {
    owned_database_count: 0,
    owned_schema_count: 0,
    owned_relation_count: 0,
    owned_function_count: 0,
    owned_type_count: 0,
  },
  securityOwnership = {
    owned_database_count: 0,
    owned_schema_count: 0,
    owned_relation_count: 0,
    owned_function_count: 0,
    owned_type_count: 0,
  },
  applicationDirectGrantCount = 0,
  securityDirectGrantCount = 0,
  applicationEffectiveAccess = {
    database_create: false,
    schema_create_count: 0,
    table_access_count: 0,
    sequence_access_count: 0,
    routine_access_count: 0,
  },
  securityEffectiveAccess = {
    database_create: false,
    schema_create_count: 0,
    table_access_count: 0,
    sequence_access_count: 0,
    routine_access_count: 0,
  },
  groupParents = [],
  creatorGroupMembership = migrationCreatorMembership(),
  extraGroupMembers = [],
  groupOwnership = {
    group_owned_database_count: 0,
    group_owned_schema_count: 0,
    group_owned_relation_count: 0,
    group_owned_function_count: 0,
    group_owned_type_count: 0,
  },
  groupGrants = exactGroupGrants(),
  previewGroupPresent = true,
  sharedPreflightBoundary = {
    preflight_shared_role_count: 3,
    preflight_shared_database_create_count: 0,
    preflight_shared_owned_database_count: 0,
    preflight_shared_owned_schema_count: 0,
    preflight_shared_owned_relation_count: 0,
    preflight_shared_owned_function_count: 0,
    preflight_shared_owned_type_count: 0,
    preflight_shared_direct_grant_count: 0,
    preflight_shared_parent_membership_count: 0,
    preflight_shared_schema_create_count: 0,
    preflight_shared_table_access_count: 0,
    preflight_shared_sequence_access_count: 0,
    preflight_shared_routine_access_count: 0,
  },
  sharedBoundary = {
    shared_role_count: 3,
    shared_database_create_count: 0,
    shared_owned_database_count: 0,
    shared_owned_schema_count: 0,
    shared_owned_relation_count: 0,
    shared_owned_function_count: 0,
    shared_owned_type_count: 0,
    shared_direct_grant_count: 0,
    shared_effective_security_access_count: 0,
  },
} = {}) {
  let bound = false;
  const statements = [];

  const client = {
    async unsafe(sql, params) {
      if (
        sql.includes("WHERE rolname = ANY($1::text[])") &&
        !sql.includes("AS shared_role_count") &&
        !sql.includes("AS preflight_shared_role_count")
      ) {
        return [
          ...(previewGroupPresent
            ? [runtimeRole(PREVIEW_SECURITY_GROUP, false)]
            : []),
          runtimeRole("ulc_preview_owner", true),
          runtimeRole("ulc_preview_app", true),
          runtimeRole("ulc_preview_security_ingest", true),
        ];
      }
      if (sql.includes("WHERE child.rolname = $1")) {
        const member = params?.[0];
        if (member === "ulc_preview_app") return [];
        if (member === PREVIEW_SECURITY_GROUP) return groupParents;
        if (member === "ulc_preview_security_ingest") {
          return bound ? [securityMembership()] : [];
        }
      }
      if (sql.includes("WHERE parent.rolname = $1")) {
        assert.equal(params?.[0], PREVIEW_SECURITY_GROUP);
        return [
          ...(creatorGroupMembership === null ? [] : [creatorGroupMembership]),
          ...(bound ? [securityMembership()] : []),
          ...extraGroupMembers,
        ];
      }
      if (sql.includes("AS group_owned_database_count")) {
        assert.equal(params?.[0], PREVIEW_SECURITY_GROUP);
        return [groupOwnership];
      }
      if (sql.includes("'database'::text AS object_kind")) {
        assert.equal(params?.[0], PREVIEW_SECURITY_GROUP);
        return groupGrants;
      }
      if (sql.includes("AS preflight_shared_role_count")) {
        assert.deepEqual(params?.[0], [
          "ulc_linz_security_event_ingest",
          "ulc_linz_security_event_cleanup",
          "ulc_linz_security_event_read",
        ]);
        assert.match(sql, /preflight_shared_database_create_count/);
        assert.match(sql, /preflight_shared_parent_membership_count/);
        assert.match(sql, /preflight_shared_table_access_count/);
        assert.match(sql, /'MAINTAIN'/);
        assert.match(sql, /preflight_shared_sequence_access_count/);
        assert.match(sql, /preflight_shared_routine_access_count/);
        return [sharedPreflightBoundary];
      }
      if (sql.includes("AS shared_role_count")) {
        assert.match(sql, /shared_database_create_count/);
        assert.match(sql, /'MAINTAIN'/);
        assert.deepEqual(params?.[0], [
          "ulc_linz_security_event_ingest",
          "ulc_linz_security_event_cleanup",
          "ulc_linz_security_event_read",
        ]);
        return [sharedBoundary];
      }
      if (sql.includes("AS direct_grant_count")) {
        const role = params?.[0];
        if (role === "ulc_preview_app") {
          return [{ direct_grant_count: applicationDirectGrantCount }];
        }
        assert.equal(role, "ulc_preview_security_ingest");
        return [{ direct_grant_count: securityDirectGrantCount }];
      }
      if (sql.includes("AS owned_database_count")) {
        const role = params?.[0];
        if (role === "ulc_preview_app") return [applicationOwnership];
        assert.equal(role, "ulc_preview_security_ingest");
        return [securityOwnership];
      }
      if (sql.includes("AS schema_create_count")) {
        assert.match(sql, /AS table_access_count/);
        assert.match(sql, /AS sequence_access_count/);
        assert.match(sql, /AS routine_access_count/);
        assert.match(sql, /has_any_column_privilege/);
        assert.match(sql, /'MAINTAIN'/);
        assert.match(sql, /has_function_privilege/);
        const role = params?.[0];
        if (role === "ulc_preview_app") {
          return [applicationEffectiveAccess];
        }
        assert.equal(role, "ulc_preview_security_ingest");
        return [securityEffectiveAccess];
      }
      throw new Error("Unexpected owner SQL: " + sql);
    },
    async begin(callback) {
      return callback({
        async unsafe(sql) {
          statements.push(sql);
          if (sql.startsWith(`GRANT "${PREVIEW_SECURITY_GROUP}"`)) {
            bound = true;
          }
          return [];
        },
      });
    },
    async end() {},
  };

  return { client, statements, wasBound: () => bound };
}

function databaseFactory({
  owner = ownerFixture(),
  applicationAccess = exactApplicationAccess(),
  securityAccess = exactSecurityAccess(),
  applicationAuthenticationError = false,
  securityAuthenticationError = false,
  opened = [],
  ended = [],
} = {}) {
  return (url) => {
    opened.push(url);
    if (url === MIGRATION_URL) {
      return {
        client: {
          ...owner.client,
          async end() {
            ended.push("owner");
            await owner.client.end();
          },
        },
      };
    }
    if (url === APPLICATION_URL) {
      return {
        client: {
          async unsafe(sql) {
            if (sql === "SELECT current_user AS current_user") {
              if (applicationAuthenticationError) {
                throw new Error("authentication failed");
              }
              return [{ current_user: "ulc_preview_app" }];
            }
            assert.match(sql, /all_runtime_table_dml/);
            assert.match(sql, /'TRUNCATE'/);
            assert.match(sql, /'REFERENCES'/);
            assert.match(sql, /'TRIGGER'/);
            assert.match(sql, /'MAINTAIN'/);
            assert.match(sql, /security_maintain/);
            assert.match(sql, /sequence_name\), 'UPDATE'/);
            assert.match(sql, /non_public_schema_create_count/);
            assert.match(sql, /non_public_table_access_count/);
            assert.match(sql, /non_public_sequence_access_count/);
            assert.match(sql, /non_public_function_access_count/);
            assert.match(sql, /has_any_column_privilege/);
            assert.match(sql, /owned_database_count/);
            assert.match(sql, /owned_schema_count/);
            assert.match(sql, /owned_function_count/);
            assert.match(sql, /owned_type_count/);
            assert.match(sql, /security_purge_execute/);
            assert.equal((sql.match(/AS schema_usage/g) ?? []).length, 1);
            return [applicationAccess];
          },
          async end() {
            ended.push("application");
          },
        },
      };
    }
    if (url === SECURITY_URL) {
      return {
        client: {
          async unsafe(sql) {
            if (sql === "SELECT current_user AS current_user") {
              if (securityAuthenticationError) {
                throw new Error("authentication failed");
              }
              return [{ current_user: "ulc_preview_security_ingest" }];
            }
            assert.match(sql, /can_insert_allowed_columns/);
            assert.match(sql, /can_insert_id/);
            assert.match(sql, /can_select_any_column/);
            assert.match(sql, /can_update_any_column/);
            assert.match(sql, /can_reference_any_column/);
            assert.match(sql, /can_maintain/);
            assert.match(sql, /'MAINTAIN'/);
            assert.match(sql, /non_security_schema_create_count/);
            assert.match(sql, /non_security_function_access_count/);
            assert.match(sql, /inherited_role_count/);
            assert.match(sql, /pg_has_role/);
            assert.match(sql, /appbasis_ulc_linz_preview_security_ingest/);
            assert.equal((sql.match(/AS schema_usage/g) ?? []).length, 1);
            return [securityAccess];
          },
          async end() {
            ended.push("security");
          },
        },
      };
    }
    throw new Error("Unexpected database URL");
  };
}

function reconcile(factory) {
  return reconcileUlcLinzD4PreviewDatabaseAccess(
    {
      migrationDatabaseUrl: MIGRATION_URL,
      applicationDatabaseUrl: APPLICATION_URL,
      securityLogDatabaseUrl: SECURITY_URL,
      apply: true,
    },
    { databaseFactory: factory },
  );
}

function preflight(factory) {
  return preflightUlcLinzD4PreviewDatabaseAccess(
    {
      migrationDatabaseUrl: MIGRATION_URL,
      applicationDatabaseUrl: APPLICATION_URL,
      securityLogDatabaseUrl: SECURITY_URL,
    },
    { databaseFactory: factory },
  );
}

test("preflights runtime principals before the preview migration without writes", async () => {
  const owner = ownerFixture({ previewGroupPresent: false });
  const result = await preflight(databaseFactory({ owner }));

  assert.deepEqual(result, {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "generated-preview-ulc-linz",
    runtimePrincipalPreflightVerified: true,
  });
  assert.equal(owner.wasBound(), false);
  assert.deepEqual(owner.statements, []);
});

test("preflight allows shared security roles to be absent on a fresh preview cluster", async () => {
  const owner = ownerFixture({
    previewGroupPresent: false,
    sharedPreflightBoundary: {
      preflight_shared_role_count: 0,
      preflight_shared_database_create_count: 0,
      preflight_shared_owned_database_count: 0,
      preflight_shared_owned_schema_count: 0,
      preflight_shared_owned_relation_count: 0,
      preflight_shared_owned_function_count: 0,
      preflight_shared_owned_type_count: 0,
      preflight_shared_direct_grant_count: 0,
      preflight_shared_parent_membership_count: 0,
      preflight_shared_schema_create_count: 0,
      preflight_shared_table_access_count: 0,
      preflight_shared_sequence_access_count: 0,
      preflight_shared_routine_access_count: 0,
    },
  });
  const result = await preflight(databaseFactory({ owner }));
  assert.equal(result.runtimePrincipalPreflightVerified, true);
  assert.deepEqual(owner.statements, []);
});

test("preflight authenticates application runtime credentials before opening the owner connection", async () => {
  const owner = ownerFixture({ previewGroupPresent: false });
  const opened = [];
  await assert.rejects(
    preflight(
      databaseFactory({
        owner,
        applicationAuthenticationError: true,
        opened,
      }),
    ),
    /application runtime credential authentication failed/,
  );
  assert.deepEqual(opened, [APPLICATION_URL]);
  assert.deepEqual(owner.statements, []);
});

test("preflight authenticates security runtime credentials before opening the owner connection", async () => {
  const owner = ownerFixture({ previewGroupPresent: false });
  const opened = [];
  await assert.rejects(
    preflight(
      databaseFactory({
        owner,
        securityAuthenticationError: true,
        opened,
      }),
    ),
    /security-log runtime credential authentication failed/,
  );
  assert.deepEqual(opened, [APPLICATION_URL, SECURITY_URL]);
  assert.deepEqual(owner.statements, []);
});

test("preflight rejects an already-created preview ingest group", async () => {
  const owner = ownerFixture();
  await assert.rejects(
    preflight(databaseFactory({ owner })),
    /must not exist before migration/,
  );
});

test("preflight rejects application runtime ownership before migration", async () => {
  const owner = ownerFixture({
    previewGroupPresent: false,
    applicationOwnership: {
      owned_database_count: 0,
      owned_schema_count: 1,
      owned_relation_count: 0,
      owned_function_count: 0,
      owned_type_count: 0,
    },
  });
  await assert.rejects(
    preflight(databaseFactory({ owner })),
    /application runtime login owns database objects/,
  );
});

test("preflight rejects direct application runtime grants before migration", async () => {
  const owner = ownerFixture({
    previewGroupPresent: false,
    applicationDirectGrantCount: 1,
  });
  await assert.rejects(
    preflight(databaseFactory({ owner })),
    /application runtime login has direct grants/,
  );
});

test("preflight rejects effective application schema CREATE inherited through PUBLIC", async () => {
  const owner = ownerFixture({
    previewGroupPresent: false,
    applicationEffectiveAccess: {
      schema_create_count: 1,
      table_access_count: 0,
      sequence_access_count: 0,
      routine_access_count: 0,
    },
  });
  await assert.rejects(
    preflight(databaseFactory({ owner })),
    /application runtime login has effective pre-migration access/,
  );
});

test("preflight rejects effective database CREATE inherited through PUBLIC", async () => {
  const owner = ownerFixture({
    previewGroupPresent: false,
    securityEffectiveAccess: {
      database_create: true,
      schema_create_count: 0,
      table_access_count: 0,
      sequence_access_count: 0,
      routine_access_count: 0,
    },
  });
  await assert.rejects(
    preflight(databaseFactory({ owner })),
    /security-log runtime login has effective pre-migration access/,
  );
});

test("preflight rejects effective security table access inherited through PUBLIC", async () => {
  const owner = ownerFixture({
    previewGroupPresent: false,
    securityEffectiveAccess: {
      schema_create_count: 0,
      table_access_count: 1,
      sequence_access_count: 0,
      routine_access_count: 0,
    },
  });
  await assert.rejects(
    preflight(databaseFactory({ owner })),
    /security-log runtime login has effective pre-migration access/,
  );
});

test("preflight rejects effective application sequence access inherited through PUBLIC", async () => {
  const owner = ownerFixture({
    previewGroupPresent: false,
    applicationEffectiveAccess: {
      schema_create_count: 0,
      table_access_count: 0,
      sequence_access_count: 1,
      routine_access_count: 0,
    },
  });
  await assert.rejects(
    preflight(databaseFactory({ owner })),
    /application runtime login has effective pre-migration access/,
  );
});

test("preflight rejects effective security routine access inherited through PUBLIC", async () => {
  const owner = ownerFixture({
    previewGroupPresent: false,
    securityEffectiveAccess: {
      schema_create_count: 0,
      table_access_count: 0,
      sequence_access_count: 0,
      routine_access_count: 1,
    },
  });
  await assert.rejects(
    preflight(databaseFactory({ owner })),
    /security-log runtime login has effective pre-migration access/,
  );
});

test("preflight rejects database CREATE on shared security roles before migration", async () => {
  const owner = ownerFixture({
    previewGroupPresent: false,
    sharedPreflightBoundary: {
      preflight_shared_role_count: 3,
      preflight_shared_database_create_count: 1,
      preflight_shared_owned_database_count: 0,
      preflight_shared_owned_schema_count: 0,
      preflight_shared_owned_relation_count: 0,
      preflight_shared_owned_function_count: 0,
      preflight_shared_owned_type_count: 0,
      preflight_shared_direct_grant_count: 0,
      preflight_shared_parent_membership_count: 0,
      preflight_shared_schema_create_count: 0,
      preflight_shared_table_access_count: 0,
      preflight_shared_sequence_access_count: 0,
      preflight_shared_routine_access_count: 0,
    },
  });
  await assert.rejects(
    preflight(databaseFactory({ owner })),
    /shared security roles are not neutral before preview migration/,
  );
  assert.deepEqual(owner.statements, []);
});

test("preflight rejects shared security role direct grants before migration", async () => {
  const owner = ownerFixture({
    previewGroupPresent: false,
    sharedPreflightBoundary: {
      preflight_shared_role_count: 3,
    preflight_shared_database_create_count: 0,
      preflight_shared_owned_database_count: 0,
      preflight_shared_owned_schema_count: 0,
      preflight_shared_owned_relation_count: 0,
      preflight_shared_owned_function_count: 0,
      preflight_shared_owned_type_count: 0,
      preflight_shared_direct_grant_count: 1,
      preflight_shared_parent_membership_count: 0,
      preflight_shared_schema_create_count: 0,
      preflight_shared_table_access_count: 0,
      preflight_shared_sequence_access_count: 0,
      preflight_shared_routine_access_count: 0,
    },
  });
  await assert.rejects(
    preflight(databaseFactory({ owner })),
    /shared security roles are not neutral before preview migration/,
  );
  assert.deepEqual(owner.statements, []);
});

test("preflight rejects inherited effective access on shared security roles before migration", async () => {
  const owner = ownerFixture({
    previewGroupPresent: false,
    sharedPreflightBoundary: {
      preflight_shared_role_count: 3,
    preflight_shared_database_create_count: 0,
      preflight_shared_owned_database_count: 0,
      preflight_shared_owned_schema_count: 0,
      preflight_shared_owned_relation_count: 0,
      preflight_shared_owned_function_count: 0,
      preflight_shared_owned_type_count: 0,
      preflight_shared_direct_grant_count: 0,
      preflight_shared_parent_membership_count: 1,
      preflight_shared_schema_create_count: 0,
      preflight_shared_table_access_count: 1,
      preflight_shared_sequence_access_count: 0,
      preflight_shared_routine_access_count: 0,
    },
  });
  await assert.rejects(
    preflight(databaseFactory({ owner })),
    /shared security roles are not neutral before preview migration/,
  );
  assert.deepEqual(owner.statements, []);
});

test("preflight rejects unsafe security principal state before migration", async () => {
  const owner = ownerFixture({
    previewGroupPresent: false,
    securityDirectGrantCount: 1,
  });
  await assert.rejects(
    preflight(databaseFactory({ owner })),
    /security-log runtime login has direct grants/,
  );
});

test("binds the security login only to the preview-specific ingest group", async () => {
  const owner = ownerFixture();
  const ended = [];
  const result = await reconcile(databaseFactory({ owner, ended }));

  assert.deepEqual(result, {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "generated-preview-ulc-linz",
    migrationPrincipalSeparated: true,
    applicationRuntimeAccessVerified: true,
    securityLogRuntimeAccessVerified: true,
    securityLogDatabaseIsolationVerified: true,
  });
  assert.equal(owner.wasBound(), true);
  assert.ok(
    owner.statements.some((sql) =>
      sql.startsWith(`GRANT "${PREVIEW_SECURITY_GROUP}"`),
    ),
  );
  assert.equal(
    owner.statements.some((sql) =>
      /GRANT\s+"ulc_linz_security_event_ingest"/.test(sql),
    ),
    false,
  );
  assert.equal(
    owner.statements.some((sql) =>
      sql.includes('TO "ulc_preview_security_ingest"') &&
      (sql.includes("INSERT") || sql.includes("USAGE ON SEQUENCE")),
    ),
    false,
  );
  assert.ok(
    owner.statements.some(
      (sql) =>
        sql.startsWith("REVOKE SELECT (") &&
        sql.includes("), INSERT (") &&
        sql.includes("), UPDATE (") &&
        sql.includes("), REFERENCES (") &&
        sql.includes('FROM "ulc_preview_app"'),
    ),
  );
  assert.deepEqual(ended.sort(), ["application", "owner", "security"]);
});

test("rejects database CREATE on the application runtime after reconciliation", async () => {
  const owner = ownerFixture();
  await assert.rejects(
    reconcile(
      databaseFactory({
        owner,
        applicationAccess: exactApplicationAccess({
          database_create: true,
        }),
      }),
    ),
    /application runtime database ACL is not exact/,
  );
});

test("rejects database CREATE on the security runtime after reconciliation", async () => {
  const owner = ownerFixture();
  await assert.rejects(
    reconcile(
      databaseFactory({
        owner,
        securityAccess: exactSecurityAccess({
          database_create: true,
        }),
      }),
    ),
    /security-log ingest ACL is not exact/,
  );
});

test("rejects application runtime database ownership after reconciliation", async () => {
  const owner = ownerFixture();
  await assert.rejects(
    reconcile(
      databaseFactory({
        owner,
        applicationAccess: exactApplicationAccess({
          owned_database_count: 1,
        }),
      }),
    ),
    /application runtime database ACL is not exact/,
  );
});

test("rejects excess privileges on ordinary application tables", async () => {
  const owner = ownerFixture();
  await assert.rejects(
    reconcile(
      databaseFactory({
        owner,
        applicationAccess: exactApplicationAccess({
          all_runtime_table_dml: false,
        }),
      }),
    ),
    /application runtime database ACL is not exact/,
  );
});

test("rejects excess update privilege on application sequences", async () => {
  const owner = ownerFixture();
  await assert.rejects(
    reconcile(
      databaseFactory({
        owner,
        applicationAccess: exactApplicationAccess({
          all_runtime_sequence_access: false,
        }),
      }),
    ),
    /application runtime database ACL is not exact/,
  );
});

test("rejects application runtime access to tables outside public", async () => {
  const owner = ownerFixture();
  await assert.rejects(
    reconcile(
      databaseFactory({
        owner,
        applicationAccess: exactApplicationAccess({
          non_public_table_access_count: 1,
        }),
      }),
    ),
    /application runtime database ACL is not exact/,
  );
});

test("rejects application runtime routine access outside public", async () => {
  const owner = ownerFixture();
  await assert.rejects(
    reconcile(
      databaseFactory({
        owner,
        applicationAccess: exactApplicationAccess({
          non_public_function_access_count: 1,
        }),
      }),
    ),
    /application runtime database ACL is not exact/,
  );
});

test("rejects MAINTAIN on the security log for the application runtime", async () => {
  const owner = ownerFixture();
  await assert.rejects(
    reconcile(
      databaseFactory({
        owner,
        applicationAccess: exactApplicationAccess({
          security_maintain: true,
        }),
      }),
    ),
    /application runtime database ACL is not exact/,
  );
});

test("rejects stale application column access to the security log", async () => {
  const owner = ownerFixture();
  await assert.rejects(
    reconcile(
      databaseFactory({
        owner,
        applicationAccess: exactApplicationAccess({
          security_column_select: true,
        }),
      }),
    ),
    /application runtime database ACL is not exact/,
  );
});

test("rejects direct grants on the security login", async () => {
  const owner = ownerFixture({ securityDirectGrantCount: 1 });
  await assert.rejects(
    reconcile(databaseFactory({ owner })),
    /security-log runtime login has direct grants/,
  );
});

test("rejects a preview ingest group that inherits another role", async () => {
  const owner = ownerFixture({
    groupParents: [{
      parent: "unexpected_parent",
      member: PREVIEW_SECURITY_GROUP,
      admin_option: false,
      inherit_option: true,
      set_option: true,
    }],
  });
  await assert.rejects(
    reconcile(databaseFactory({ owner })),
    /group must not inherit another database role/,
  );
});

test("rejects unexpected cluster-wide members of the preview group", async () => {
  const owner = ownerFixture({
    extraGroupMembers: [
      {
        parent: PREVIEW_SECURITY_GROUP,
        member: "unexpected_runtime",
        grantor: "unexpected_grantor",
        admin_option: false,
        inherit_option: true,
        set_option: true,
      },
    ],
  });
  await assert.rejects(
    reconcile(databaseFactory({ owner })),
    /unexpected cluster-wide members/,
  );
});

test("accepts only the Neon-managed non-inheriting migration creator edge", async () => {
  for (const creatorGroupMembership of [
    migrationCreatorMembership({ grantor: "unexpected_grantor" }),
    migrationCreatorMembership({ admin_option: false }),
    migrationCreatorMembership({ inherit_option: true }),
    migrationCreatorMembership({ set_option: true }),
    null,
  ]) {
    const owner = ownerFixture({ creatorGroupMembership });
    await assert.rejects(
      reconcile(databaseFactory({ owner })),
      /migration creator membership is unsafe|unexpected cluster-wide members/,
    );
  }
});

test("rejects database CREATE on shared ULC roles after migration", async () => {
  const owner = ownerFixture({
    sharedBoundary: {
      shared_role_count: 3,
      shared_database_create_count: 1,
      shared_owned_database_count: 0,
      shared_owned_schema_count: 0,
      shared_owned_relation_count: 0,
      shared_owned_function_count: 0,
      shared_owned_type_count: 0,
      shared_direct_grant_count: 0,
      shared_effective_security_access_count: 0,
    },
  });
  await assert.rejects(
    reconcile(databaseFactory({ owner })),
    /shared security roles are not neutral/,
  );
});

test("rejects shared ULC roles that retain preview database grants", async () => {
  const owner = ownerFixture({
    sharedBoundary: {
      shared_role_count: 3,
    shared_database_create_count: 0,
      shared_owned_database_count: 0,
      shared_owned_schema_count: 0,
      shared_owned_relation_count: 0,
      shared_owned_function_count: 0,
      shared_owned_type_count: 0,
      shared_direct_grant_count: 1,
      shared_effective_security_access_count: 0,
    },
  });
  await assert.rejects(
    reconcile(databaseFactory({ owner })),
    /shared security roles are not neutral/,
  );
});

test("rejects inherited or PUBLIC effective access on shared ULC roles", async () => {
  const owner = ownerFixture({
    sharedBoundary: {
      shared_role_count: 3,
    shared_database_create_count: 0,
      shared_owned_database_count: 0,
      shared_owned_schema_count: 0,
      shared_owned_relation_count: 0,
      shared_owned_function_count: 0,
      shared_owned_type_count: 0,
      shared_direct_grant_count: 0,
      shared_effective_security_access_count: 1,
    },
  });
  await assert.rejects(
    reconcile(databaseFactory({ owner })),
    /shared security roles are not neutral/,
  );
});

test("rejects security login ownership", async () => {
  const owner = ownerFixture({
    securityOwnership: {
      owned_database_count: 0,
      owned_schema_count: 0,
      owned_relation_count: 1,
      owned_function_count: 0,
      owned_type_count: 0,
    },
  });
  await assert.rejects(
    reconcile(databaseFactory({ owner })),
    /security-log runtime login owns database objects/,
  );
});

test("rejects column-only read access on the security log", async () => {
  const owner = ownerFixture();
  await assert.rejects(
    reconcile(
      databaseFactory({
        owner,
        securityAccess: exactSecurityAccess({
          can_select_any_column: true,
        }),
      }),
    ),
    /security-log ingest ACL is not exact/,
  );
});

test("rejects insert access to forbidden security-log columns", async () => {
  const owner = ownerFixture();
  await assert.rejects(
    reconcile(
      databaseFactory({
        owner,
        securityAccess: exactSecurityAccess({
          can_insert_id: true,
        }),
      }),
    ),
    /security-log ingest ACL is not exact/,
  );
});

test("rejects MAINTAIN on the security log for the security runtime", async () => {
  const owner = ownerFixture();
  await assert.rejects(
    reconcile(
      databaseFactory({
        owner,
        securityAccess: exactSecurityAccess({
          can_maintain: true,
        }),
      }),
    ),
    /security-log ingest ACL is not exact/,
  );
});

test("rejects missing public schema usage for the security runtime", async () => {
  const owner = ownerFixture();
  await assert.rejects(
    reconcile(
      databaseFactory({
        owner,
        securityAccess: exactSecurityAccess({
          schema_usage: false,
        }),
      }),
    ),
    /security-log ingest ACL is not exact/,
  );
});

test("rejects effective access outside the intended ingest path", async () => {
  const owner = ownerFixture();
  await assert.rejects(
    reconcile(
      databaseFactory({
        owner,
        securityAccess: exactSecurityAccess({
          non_security_table_access_count: 1,
        }),
      }),
    ),
    /security-log ingest ACL is not exact/,
  );
});

test("rejects effective function or procedure access outside the ingest path", async () => {
  const owner = ownerFixture();
  await assert.rejects(
    reconcile(
      databaseFactory({
        owner,
        securityAccess: exactSecurityAccess({
          non_security_function_access_count: 1,
        }),
      }),
    ),
    /security-log ingest ACL is not exact/,
  );
});

test("rejects runtime inheritance drift even when effective object ACL looks exact", async () => {
  const owner = ownerFixture();
  await assert.rejects(
    reconcile(
      databaseFactory({
        owner,
        securityAccess: exactSecurityAccess({
          inherited_role_count: 2,
        }),
      }),
    ),
    /security-log ingest ACL is not exact/,
  );
});

test("requires explicit mutation approval", async () => {
  await assert.rejects(
    reconcileUlcLinzD4PreviewDatabaseAccess({
      migrationDatabaseUrl: MIGRATION_URL,
      applicationDatabaseUrl: APPLICATION_URL,
      securityLogDatabaseUrl: SECURITY_URL,
      apply: false,
    }),
    /explicit apply=true/,
  );
});
