import { describe, expect, it } from "vitest";

import { createInitialTechnicalAdmin } from "../src/root-admin.mjs";
import {
  rootAdminBaseURL,
  rootAdminSecret,
  withRootAdminDatabase,
} from "./root-admin-postgres-helpers";

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl === undefined ? describe.skip : describe;

describeWithPostgres("root bootstrap concurrency", () => {
  it("leaves one user when two empty-database attempts overlap", async () => {
    await withRootAdminDatabase(
      databaseUrl ?? "",
      "root_bootstrap_race",
      async (isolatedUrl, connection) => {
        const common = {
          connectionString: isolatedUrl,
          secret: rootAdminSecret,
          baseURL: rootAdminBaseURL,
          password: `test-${"x".repeat(24)}-42!`,
        };
        const outcomes = await Promise.allSettled([
          createInitialTechnicalAdmin({
            ...common,
            username: "preview.root_one",
            displayName: "Preview Root One",
          }),
          createInitialTechnicalAdmin({
            ...common,
            username: "preview.root_two",
            displayName: "Preview Root Two",
          }),
        ]);

        const fulfilled = outcomes.filter((entry) => entry.status === "fulfilled");
        expect(fulfilled).toHaveLength(1);
        expect(outcomes.filter((entry) => entry.status === "rejected")).toHaveLength(1);
        if (fulfilled[0]?.status !== "fulfilled") throw new Error("Expected one winner");
        expect(fulfilled[0].value.role).toBe("admin");

        const userCount = await connection.client<{ count: number }[]>`
          SELECT count(*)::int AS count FROM "user"
        `;
        const stateCount = await connection.client<{ count: number }[]>`
          SELECT count(*)::int AS count FROM appbasis_identity_security_state
        `;
        expect(userCount[0]?.count).toBe(1);
        expect(stateCount[0]?.count).toBe(0);
      },
    );
  });
});
