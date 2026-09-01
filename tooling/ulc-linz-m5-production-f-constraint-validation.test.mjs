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

test("canonical retention evidence requires a validated calendar constraint", async () => {
  let ended = false;
  const result = await collectUlcLinzM5EarlyDeletePathEvidence(
    { productionDatabaseUrl: DATABASE_URL },
    {
      databaseFactory: () => ({
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
              return [{ protected_owner_member_count: 0 }];
            }
            throw new Error(`Unexpected query: ${source}`);
          },
          async end() { ended = true; },
        },
      }),
    },
  );

  assert.deepEqual(result, { noEarlyDeletePathVerified: true });
  assert.equal(ended, true);
});
