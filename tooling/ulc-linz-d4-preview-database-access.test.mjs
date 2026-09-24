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

test("reconciles separated application and security runtime access through the migration owner", async () => {
  const statements = [];
  let securityMembershipBound = false;
  const ended = [];

  const databaseFactory = (url) => {
    if (url === MIGRATION_URL) {
      return {
        client: {
          async unsafe(sql, params) {
            if (sql.includes("FROM pg_catalog.pg_roles")) {
              return [
                runtimeRole("ulc_linz_security_event_ingest", false),
                runtimeRole("ulc_preview_app", true),
                runtimeRole("ulc_preview_security_ingest", true),
              ];
            }
            if (sql.includes("FROM pg_catalog.pg_auth_members")) {
              const member = params?.[0];
              if (member === "ulc_preview_app") return [];
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
