import { describe, expect, it } from "vitest";

import { createInitialTechnicalAdmin } from "../src/root-admin";
import {
  rootAdminBaseURL,
  rootAdminSecret,
  withRootAdminDatabase,
} from "./root-admin-postgres-helpers";

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl === undefined ? describe.skip : describe;

describeWithPostgres("root bootstrap concurrency", () => {
  it("leaves one administrator when two empty-database attempts overlap", async () => {
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

        const users = await connection.client<{ role: string | null }[]>`
          SELECT role FROM "user"
        `;
        const stateCount = await connection.client<{ count: number }[]>`
          SELECT count(*)::int AS count FROM appbasis_identity_security_state
        `;
        expect(users).toEqual([{ role: "admin" }]);
        expect(stateCount[0]?.count).toBe(0);
      },
    );
  });
});
