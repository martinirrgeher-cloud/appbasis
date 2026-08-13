import { describe, expect, it } from "vitest";

import { createInitialTechnicalAdmin } from "../src/root-admin";
import {
  rootAdminBaseURL,
  rootAdminSecret,
  withRootAdminDatabase,
} from "./root-admin-postgres-helpers";

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl === undefined ? describe.skip : describe;

describeWithPostgres("root bootstrap PostgreSQL", () => {
  it("persists exactly one technical admin credential without AppBasis identity state or session", async () => {
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
        const users = await connection.client<
          { id: string; username: string | null; role: string | null }[]
        >`SELECT id, username, role FROM "user"`;
        expect(users).toEqual([
          { id: result.identityId, username: "preview.root", role: "admin" },
        ]);

        const credentialRows = await connection.client<{ count: number }[]>`
          SELECT count(*)::int AS count
          FROM account
          WHERE user_id = ${result.identityId}
            AND provider_id = 'credential'
            AND password IS NOT NULL
        `;
        const stateRows = await connection.client<{ count: number }[]>`
          SELECT count(*)::int AS count
          FROM appbasis_identity_security_state
          WHERE identity_id = ${result.identityId}
        `;
        const sessionRows = await connection.client<{ count: number }[]>`
          SELECT count(*)::int AS count FROM session
          WHERE user_id = ${result.identityId}
        `;
        expect(credentialRows[0]?.count).toBe(1);
        expect(stateRows[0]?.count).toBe(0);
        expect(sessionRows[0]?.count).toBe(0);
      },
    );
  });
});
