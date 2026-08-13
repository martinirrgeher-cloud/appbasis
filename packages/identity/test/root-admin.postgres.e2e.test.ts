import { describe, expect, it } from "vitest";

import { createInitialTechnicalAdmin } from "../src/root-admin.mjs";
import {
  rootAdminBaseURL,
  rootAdminSecret,
  withRootAdminDatabase,
} from "./root-admin-postgres-helpers";

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl === undefined ? describe.skip : describe;

describeWithPostgres("root bootstrap PostgreSQL", () => {
  it("persists one root identity without AppBasis identity state", async () => {
    await withRootAdminDatabase(
      databaseUrl ?? "",
      "root_bootstrap_single",
      async (isolatedUrl, connection) => {
        const result = await createInitialTechnicalAdmin({
          connectionString: isolatedUrl,
          secret: rootAdminSecret,
          baseURL: rootAdminBaseURL,
          username: "preview.root",
          displayName: "Preview Root Test",
          password: `test-${"x".repeat(24)}-42!`,
        });
        const userCount = await connection.client<{ count: number }[]>`
          SELECT count(*)::int AS count FROM "user"
        `;
        const stateCount = await connection.client<{ count: number }[]>`
          SELECT count(*)::int AS count FROM appbasis_identity_security_state
        `;
        expect(userCount[0]?.count).toBe(1);
        expect(stateCount[0]?.count).toBe(0);
        expect(result.role).toBe("admin");
      },
    );
  });
});
