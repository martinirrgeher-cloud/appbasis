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

function runtimeRole(name) {
  return {
    rolname: name,
    rolcanlogin: true,
    rolsuper: false,
    rolcreatedb: false,
    rolcreaterole: false,
    rolreplication: false,
    rolbypassrls: false,
  };
}

function emptyOwnership() {
  return [{
    owned_database_count: 0,
    owned_schema_count: 0,
    owned_relation_count: 0,
    owned_function_count: 0,
    owned_type_count: 0,
  }];
}

function exactSecurityDirectGrants() {
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

function applicationAccessRow() {
  return {
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
  };
}

function securityAccessRow(overrides = {}) {
  return {
    current_user: "ulc_preview_security_ingest",
    schema_create: false,
    non_security_schema_create_count: 0,
    non_security_table_access_count: 0,
    non_security_sequence_access_count: 0,
    inherited_role_count: 0,
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
    ...overrides,
  };
}

function ownerClient({
  ownership = emptyOwnership(),
  memberships = new Map(),
  preAcl = [],
  postAcl = exactSecurityDirectGrants(),
  statements = [],
} = {}) {
  let aclReads = 0;
  return {
    async unsafe(sql, params) {
      if (sql.includes("WHERE rolname = ANY($1::text[])")) {
        return [
          runtimeRole("ulc_preview_app"),
          runtimeRole("ulc_preview_security_ingest"),
        ];
      }
      if (sql.includes("FROM pg_catalog.pg_auth_members")) {
        return memberships.get(params?.[0]) ?? [];
      }
      if (sql.includes("AS owned_database_count")) {
        return ownership;
      }
      if (sql.includes("'database'::text AS object_kind")) {
        const result = aclReads === 0 ? preAcl : postAcl;
        aclReads += 1;
        return result;
      }
      throw new Error("Unexpected owner SQL: " + sql);
    },
    async begin(callback) {
      return callback({
        async unsafe(sql) {
          statements.push(sql);
          return [];
        },
      });
    },
    async end() {},
  };
}

function databaseFactory({
  owner = ownerClient(),
  securityRow = securityAccessRow(),
  ended = [],
} = {}) {
  return (url) => {
    if (url === MIGRATION_URL) {
      return {
        client: {
          ...owner,
          async end() {
            ended.push("owner");
            await owner.end?.();
          },
        },
      };
    }
    if (url === APPLICATION_URL) {
      return {
        client: {
          async unsafe(sql) {
            assert.match(sql, /all_runtime_table_dml/);
            return [applicationAccessRow()];
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
            assert.match(sql, /non_security_schema_create_count/);
            assert.match(sql, /inherited_role_count/);
            assert.doesNotMatch(sql, /pg_has_role/);
            return [securityRow];
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

async function reconcileWith(factory) {
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

test("reconciles security runtime with direct database-local ingest grants and no inherited role", async () => {
  const statements = [];
  const ended = [];
  const result = await reconcileWith(
    databaseFactory({
      owner: ownerClient({ statements }),
      ended,
    }),
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
  assert.ok(
    statements.some((sql) =>
      sql.includes(
        'GRANT INSERT ("schema_version", "app_id", "category", "event_type"',
      ),
    ),
  );
  assert.ok(
    statements.some((sql) =>
      sql.includes(
        'GRANT USAGE ON SEQUENCE public.ulc_linz_security_event_log_id_seq TO "ulc_preview_security_ingest"',
      ),
    ),
  );
  assert.equal(
    statements.some((sql) => /GRANT\s+"ulc_linz_security_event_ingest"/.test(sql)),
    false,
  );
  assert.deepEqual(ended.sort(), ["application", "owner", "security"]);
});

test("accepts an already exact direct ACL for idempotent reconciliation", async () => {
  const exact = exactSecurityDirectGrants();
  await reconcileWith(
    databaseFactory({
      owner: ownerClient({ preAcl: exact, postAcl: exact }),
    }),
  );
});

test("rejects a security login that owns user objects", async () => {
  const owner = ownerClient({
    ownership: [{
      owned_database_count: 0,
      owned_schema_count: 0,
      owned_relation_count: 1,
      owned_function_count: 0,
      owned_type_count: 0,
    }],
  });
  await assert.rejects(
    reconcileWith(databaseFactory({ owner })),
    /owns database objects/,
  );
});

test("rejects any inherited role on the preview security login", async () => {
  const memberships = new Map([
    ["ulc_preview_security_ingest", [{
      parent: "ulc_linz_security_event_ingest",
      member: "ulc_preview_security_ingest",
      admin_option: false,
      inherit_option: true,
      set_option: true,
    }]],
  ]);
  await assert.rejects(
    reconcileWith(
      databaseFactory({
        owner: ownerClient({ memberships }),
      }),
    ),
    /must not inherit another database role/,
  );
});

test("rejects stale direct privileges outside the exact ingest ACL", async () => {
  const stale = [{
    object_kind: "function",
    schema_name: "public",
    object_name: "appbasis_ulc_linz_purge_expired_security_events",
    column_name: null,
    privilege_type: "EXECUTE",
    is_grantable: false,
  }];
  await assert.rejects(
    reconcileWith(
      databaseFactory({
        owner: ownerClient({ preAcl: stale }),
      }),
    ),
    /direct ACL is not exact/,
  );
});

test("rejects effective access from the security login to objects in any user schema", async () => {
  await assert.rejects(
    reconcileWith(
      databaseFactory({
        securityRow: securityAccessRow({
          non_security_table_access_count: 1,
        }),
      }),
    ),
    /security-log ingest ACL is not exact/,
  );
});

test("rejects CREATE access inherited on any non-system schema", async () => {
  await assert.rejects(
    reconcileWith(
      databaseFactory({
        securityRow: securityAccessRow({
          non_security_schema_create_count: 1,
        }),
      }),
    ),
    /security-log ingest ACL is not exact/,
  );
});

test("rejects inherited runtime roles even if object ACLs look exact", async () => {
  await assert.rejects(
    reconcileWith(
      databaseFactory({
        securityRow: securityAccessRow({
          inherited_role_count: 1,
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
