import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createInitialTechnicalAdmin } from "../src/root-admin";
import { technicalEmailForUsername } from "../src/technical-email";
import {
  rootAdminBaseURL,
  rootAdminSecret,
  withRootAdminDatabase,
} from "./root-admin-postgres-helpers";

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl === undefined ? describe.skip : describe;

describeWithPostgres("root bootstrap orphan recovery", () => {
  it("replaces an exact user row that has no credential account", async () => {
    await withRootAdminDatabase(
      databaseUrl ?? "",
      "root_orphan_recovery",
      async (isolatedUrl, connection) => {
        const username = "preview.recovery_orphan";
        const email = await technicalEmailForUsername(username);
        const orphanId = randomUUID();
        await connection.client`
          INSERT INTO "user"
            (id, name, email, email_verified, username, display_username, role)
          VALUES
            (${orphanId}, 'Interrupted Root', ${email}, false,
             ${username}, ${username}, 'user')
        `;

        const result = await createInitialTechnicalAdmin({
          connectionString: isolatedUrl,
          secret: rootAdminSecret,
          baseURL: rootAdminBaseURL,
          username,
          displayName: "Recovered Root",
          password: `recovery-${"x".repeat(24)}-42!`,
        });

        expect(result.identityId).not.toBe(orphanId);
        const users = await connection.client<
          { id: string; role: string | null }[]
        >`SELECT id, role FROM "user"`;
        expect(users).toEqual([{ id: result.identityId, role: "admin" }]);
      },
    );
  });
});
