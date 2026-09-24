import assert from "node:assert/strict";
import test from "node:test";

import { reconcileUlcLinzD4PreviewDatabaseAccess } from "./ulc-linz-d4-preview-database-access.mjs";

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

function emptySecurityGroupOwnership() {
  return [{
    group_owned_database_count: 0,
    group_owned_schema_count: 0,
    group_owned_relation_count: 0,
    group_owned_function_count: 0,
    group_owned_type_count: 0,
  }];
}

function exactSecurityGroupGrants() {
  return [
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

test("reconciles separated application and security runtime access through the migration owner", async () => {
  const statements = [];
  let securityMembershipBound = false;
  const ended = [];

  const databaseFactory = (url) => {
    if (url === MIGRATION_URL) {
      return {
        client: {
          async unsafe(sql, params) {
            if (sql.includes("WHERE rolname = ANY($1::text[])")) {
              return [
                runtimeRole("ulc_linz_security_event_ingest", false),
                runtimeRole("ulc_preview_app", true),
                runtimeRole("ulc_preview_security_ingest", true),
              ];
            }
            if (sql.includes("FROM pg_catalog.pg_auth_members")) {
              const member = params?.[0];
              if (
                member === "ulc_preview_app" ||
                member === "ulc_linz_security_event_ingest"
              ) {
                return [];
              }
              if (member === "ulc_preview_security_ingest") {
                return securityMembershipBound
                  ? [
                      {
                        parent: "ulc_linz_security_event_ingest",
                        member: "ulc_preview_security_ingest",
                        admin_option: false,
                        inherit_option: true,
                        set_option: true,
                      },
                    ]
                  : [];
              }
            }
            if (sql.includes("AS group_owned_database_count")) {
              return emptySecurityGroupOwnership();
            }
            if (sql.includes("'database'::text AS object_kind")) {
              return exactSecurityGroupGrants();
            }
            if (sql.includes("AS owned_database_count")) {
              return [
                {
                  owned_database_count: 0,
                  owned_schema_count: 0,
                  owned_relation_count: 0,
                  owned_function_count: 0,
                  owned_type_count: 0,
                  direct_grant_count: 0,
                },
              ];
            }
            throw new Error("Unexpected owner SQL: " + sql);
          },
          async begin(callback) {
            return callback({
              async unsafe(sql) {
                statements.push(sql);
                if (sql.startsWith("GRANT \"ulc_linz_security_event_ingest\"")) {
                  securityMembershipBound = true;
                }
                return [];
              },
            });
          },
          async end() {
            ended.push("owner");
          },
        },
      };
    }
    if (url === APPLICATION_URL) {
      return {
        client: {
          async unsafe(sql) {
            assert.match(sql, /all_runtime_table_dml/);
            return [
              {
                current_user: "ulc_preview_app",
                schema_usage: true,
                schema_create: false,
                all_runtime_table_dml: true,
                all_runtime_sequence_access: true,
                owned_relations: 0,
                security_select: false,
                security_insert: false,
                security_update: false,
                security_delete: false,
                security_sequence_usage: false,
              },
            ];
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
            assert.match(sql, /can_insert_allowed_columns/);
            return [
              {
                current_user: "ulc_preview_security_ingest",
                schema_create: false,
                non_security_table_access_count: 0,
                non_security_sequence_access_count: 0,
                has_ingest_role: true,
                has_table_insert: false,
                can_insert_allowed_columns: true,
                can_insert_recorded_at: false,
                can_use_sequence: true,
                can_select: false,
                can_update: false,
                can_delete: false,
                can_truncate: false,
                can_select_sequence: false,
                can_update_sequence: false,
              },
            ];
          },
          async end() {
            ended.push("security");
          },
        },
      };
    }
    throw new Error("Unexpected database URL");
  };

  const result = await reconcileUlcLinzD4PreviewDatabaseAccess(
    {
      migrationDatabaseUrl: MIGRATION_URL,
      applicationDatabaseUrl: APPLICATION_URL,
      securityLogDatabaseUrl: SECURITY_URL,
      apply: true,
    },
    { databaseFactory },
  );

  assert.deepEqual(result, {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "generated-preview-ulc-linz",
    migrationPrincipalSeparated: true,
    applicationRuntimeAccessVerified: true,
    securityLogRuntimeAccessVerified: true,
    securityLogDatabaseIsolationVerified: true,
  });
  assert.equal(securityMembershipBound, true);
  assert.ok(
    statements.some((sql) =>
      sql.includes("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES"),
    ),
  );
  assert.ok(
    statements.some((sql) =>
      sql.includes(
        "REVOKE ALL ON TABLE public.ulc_linz_security_event_log FROM \"ulc_preview_app\"",
      ),
    ),
  );
  assert.deepEqual(ended.sort(), ["application", "owner", "security"]);
});

test("rejects a security login that owns user objects or has direct grants", async () => {
  const databaseFactory = (url) => {
    if (url !== MIGRATION_URL) {
      throw new Error("Unexpected database URL");
    }
    return {
      client: {
        async unsafe(sql, params) {
          if (sql.includes("WHERE rolname = ANY($1::text[])")) {
            return [
              runtimeRole("ulc_linz_security_event_ingest", false),
              runtimeRole("ulc_preview_app", true),
              runtimeRole("ulc_preview_security_ingest", true),
            ];
          }
          if (sql.includes("FROM pg_catalog.pg_auth_members")) {
            return [];
          }
          if (sql.includes("AS group_owned_database_count")) {
              return emptySecurityGroupOwnership();
            }
            if (sql.includes("'database'::text AS object_kind")) {
              return exactSecurityGroupGrants();
            }
            if (sql.includes("AS owned_database_count")) {
            return [
              {
                owned_database_count: 0,
                owned_schema_count: 0,
                owned_relation_count: 1,
                owned_function_count: 0,
                owned_type_count: 0,
                direct_grant_count: 1,
              },
            ];
          }
          throw new Error("Unexpected owner SQL: " + sql + String(params));
        },
        async end() {},
      },
    };
  };

  await assert.rejects(
    reconcileUlcLinzD4PreviewDatabaseAccess(
      {
        migrationDatabaseUrl: MIGRATION_URL,
        applicationDatabaseUrl: APPLICATION_URL,
        securityLogDatabaseUrl: SECURITY_URL,
        apply: true,
      },
      { databaseFactory },
    ),
    /owns database objects or has direct grants/,
  );
});

test("rejects a protected ingest group that inherits another database role", async () => {
  const databaseFactory = (url) => {
    if (url !== MIGRATION_URL) {
      throw new Error("Unexpected database URL");
    }
    return {
      client: {
        async unsafe(sql, params) {
          if (sql.includes("WHERE rolname = ANY($1::text[])")) {
            return [
              runtimeRole("ulc_linz_security_event_ingest", false),
              runtimeRole("ulc_preview_app", true),
              runtimeRole("ulc_preview_security_ingest", true),
            ];
          }
          if (sql.includes("FROM pg_catalog.pg_auth_members")) {
            const member = params?.[0];
            if (member === "ulc_preview_app") return [];
            if (member === "ulc_linz_security_event_ingest") {
              return [
                {
                  parent: "unexpected_parent",
                  member: "ulc_linz_security_event_ingest",
                  admin_option: false,
                  inherit_option: true,
                  set_option: true,
                },
              ];
            }
            return [];
          }
          throw new Error("Unexpected owner SQL: " + sql);
        },
        async end() {},
      },
    };
  };

  await assert.rejects(
    reconcileUlcLinzD4PreviewDatabaseAccess(
      {
        migrationDatabaseUrl: MIGRATION_URL,
        applicationDatabaseUrl: APPLICATION_URL,
        securityLogDatabaseUrl: SECURITY_URL,
        apply: true,
      },
      { databaseFactory },
    ),
    /ingest group must not inherit/,
  );
});

test("rejects effective access from the security login to non-security tables", async () => {
  let securityMembershipBound = false;
  const databaseFactory = (url) => {
    if (url === MIGRATION_URL) {
      return {
        client: {
          async unsafe(sql, params) {
            if (sql.includes("WHERE rolname = ANY($1::text[])")) {
              return [
                runtimeRole("ulc_linz_security_event_ingest", false),
                runtimeRole("ulc_preview_app", true),
                runtimeRole("ulc_preview_security_ingest", true),
              ];
            }
            if (sql.includes("FROM pg_catalog.pg_auth_members")) {
              const member = params?.[0];
              if (
                member === "ulc_preview_app" ||
                member === "ulc_linz_security_event_ingest"
              ) return [];
              if (member === "ulc_preview_security_ingest") {
                return securityMembershipBound
                  ? [{
                      parent: "ulc_linz_security_event_ingest",
                      member: "ulc_preview_security_ingest",
                      admin_option: false,
                      inherit_option: true,
                      set_option: true,
                    }]
                  : [];
              }
            }
            if (sql.includes("AS group_owned_database_count")) {
              return emptySecurityGroupOwnership();
            }
            if (sql.includes("'database'::text AS object_kind")) {
              return exactSecurityGroupGrants();
            }
            if (sql.includes("AS owned_database_count")) {
              return [{
                owned_database_count: 0,
                owned_schema_count: 0,
                owned_relation_count: 0,
                owned_function_count: 0,
                owned_type_count: 0,
                direct_grant_count: 0,
              }];
            }
            throw new Error("Unexpected owner SQL: " + sql);
          },
          async begin(callback) {
            return callback({
              async unsafe(sql) {
                if (sql.startsWith("GRANT \"ulc_linz_security_event_ingest\"")) {
                  securityMembershipBound = true;
                }
                return [];
              },
            });
          },
          async end() {},
        },
      };
    }
    if (url === APPLICATION_URL) {
      return {
        client: {
          async unsafe() {
            return [{
              current_user: "ulc_preview_app",
              schema_usage: true,
              schema_create: false,
              all_runtime_table_dml: true,
              all_runtime_sequence_access: true,
              owned_relations: 0,
              security_select: false,
              security_insert: false,
              security_update: false,
              security_delete: false,
              security_sequence_usage: false,
            }];
          },
          async end() {},
        },
      };
    }
    if (url === SECURITY_URL) {
      return {
        client: {
          async unsafe() {
            return [{
              current_user: "ulc_preview_security_ingest",
              schema_create: false,
              non_security_table_access_count: 1,
              non_security_sequence_access_count: 0,
              has_ingest_role: true,
              has_table_insert: false,
              can_insert_allowed_columns: true,
              can_insert_recorded_at: false,
              can_use_sequence: true,
              can_select: false,
              can_update: false,
              can_delete: false,
              can_truncate: false,
              can_select_sequence: false,
              can_update_sequence: false,
            }];
          },
          async end() {},
        },
      };
    }
    throw new Error("Unexpected database URL");
  };

  await assert.rejects(
    reconcileUlcLinzD4PreviewDatabaseAccess(
      {
        migrationDatabaseUrl: MIGRATION_URL,
        applicationDatabaseUrl: APPLICATION_URL,
        securityLogDatabaseUrl: SECURITY_URL,
        apply: true,
      },
      { databaseFactory },
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
