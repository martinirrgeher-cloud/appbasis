import assert from "node:assert/strict";
import test from "node:test";

import { collectUlcLinzM5EarlyDeletePathEvidence } from "./ulc-linz-m5-production-f-evidence.mjs";

const DATABASE_URL = "postgresql://app_owner:pw@origin.example/neondb";
const CANONICAL_PURGE_BODY = `
DECLARE
  deleted_rows bigint;
BEGIN
  DELETE FROM public.ulc_linz_security_event_log
  WHERE retained_until < statement_timestamp();
  GET DIAGNOSTICS deleted_rows = ROW_COUNT;
  RETURN deleted_rows;
END`;

function databaseFactory({ ownerLogin = false } = {}) {
  let ended = false;
  return {
    factory: () => ({
      client: {
        async unsafe(query) {
          const source = String(query);
          if (source.includes("unexpected_delete_function_count")) {
            return [{ unexpected_delete_function_count: 0 }];
          }
          if (source.includes("unexpected_topology_count")) {
            return [{ unexpected_topology_count: 0 }];
          }
          if (source.includes("pg_get_constraintdef")) {
            assert.match(source, /constraint_row\.convalidated = true/);
            return [{ definition: "CHECK ((retained_until = (occurred_at + '1 year'::interval)))" }];
          }
          if (source.includes("procedure.prosrc AS source_body")) {
            return [{
              security_definer: true,
              argument_count: 0,
              function_kind: "f",
              language_name: "plpgsql",
              return_type: "bigint",
              config: ["search_path=pg_catalog"],
              source_body: CANONICAL_PURGE_BODY,
              public_execute: false,
            }];
          }
          if (source.includes("protected_owner_member_count")) {
            assert.match(source, /pg_catalog\.pg_roles owner/);
            assert.match(source, /owner\.rolcanlogin/);
            assert.match(source, /owner\.rolsuper/);
            assert.match(source, /owner\.rolcreatedb/);
            assert.match(source, /owner\.rolcreaterole/);
            assert.match(source, /owner\.rolreplication/);
            assert.match(source, /owner\.rolbypassrls/);
            return [{
              protected_owner_member_count: 0,
              owner_login: ownerLogin,
              owner_superuser: false,
              owner_create_db: false,
              owner_create_role: false,
              owner_replication: false,
              owner_bypass_rls: false,
            }];
          }
          throw new Error(`Unexpected query: ${source}`);
        },
        async end() { ended = true; },
      },
    }),
    ended: () => ended,
  };
}

test("canonical retention evidence requires a validated calendar constraint and inert owner", async () => {
  const database = databaseFactory();
  const result = await collectUlcLinzM5EarlyDeletePathEvidence(
    { productionDatabaseUrl: DATABASE_URL },
    { databaseFactory: database.factory },
  );

  assert.deepEqual(result, { noEarlyDeletePathVerified: true });
  assert.equal(database.ended(), true);
});

test("canonical retention evidence rejects a login-capable protected owner", async () => {
  const database = databaseFactory({ ownerLogin: true });
  await assert.rejects(
    () => collectUlcLinzM5EarlyDeletePathEvidence(
      { productionDatabaseUrl: DATABASE_URL },
      { databaseFactory: database.factory },
    ),
    /canonical retention contract drift exists/,
  );
  assert.equal(database.ended(), true);
});
