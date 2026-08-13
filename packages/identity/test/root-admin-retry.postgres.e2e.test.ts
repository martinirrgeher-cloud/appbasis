import { describe, expect, it } from "vitest";

import {
  createInitialTechnicalAdmin,
  TechnicalRootAdminStateError,
} from "../src/root-admin.mjs";
import {
  rootAdminBaseURL,
  rootAdminSecret,
  withRootAdminDatabase,
} from "./root-admin-postgres-helpers";

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl === undefined ? describe.skip : describe;

describeWithPostgres("root bootstrap retry", () => {
  it("refuses a second run after the first user exists", async () => {
    await withRootAdminDatabase(
      databaseUrl ?? "",
      "root_bootstrap_retry",
      async (isolatedUrl, connection) => {
        const common = {
          connectionString: isolatedUrl,
          secret: rootAdminSecret,
          baseURL: rootAdminBaseURL,
          password: `test-${"x".repeat(24)}-42!`,
        };
        await createInitialTechnicalAdmin({
          ...common,
          username: "preview.root",
          displayName: "Preview Root",
        });

        await expect(
          createInitialTechnicalAdmin({
            ...common,
            username: "preview.other",
            displayName: "Other Root",
          }),
        ).rejects.toBeInstanceOf(TechnicalRootAdminStateError);

        const users = await connection.client<{ count: number }[]>`
          SELECT count(*)::int AS count FROM "user"
        `;
        expect(users[0]?.count).toBe(1);
      },
    );
  });
});
