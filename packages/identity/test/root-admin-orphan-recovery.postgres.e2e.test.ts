import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createBetterAuthRuntime } from "../src/better-auth";
import {
  createInitialTechnicalAdmin,
  TechnicalRootAdminStateError,
} from "../src/root-admin";
import { technicalEmailForUsername } from "../src/technical-email";
import {
  rootAdminBaseURL,
  rootAdminSecret,
  withRootAdminDatabase,
} from "./root-admin-postgres-helpers";

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl === undefined ? describe.skip : describe;
const recoveryPassword = `recovery-${"x".repeat(24)}-42!`;

describeWithPostgres("root bootstrap recovery", () => {
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
          password: recoveryPassword,
        });

        expect(result.identityId).not.toBe(orphanId);
        const users = await connection.client<
          { id: string; role: string | null }[]
        >`SELECT id, role FROM "user"`;
        expect(users).toEqual([{ id: result.identityId, role: "admin" }]);
      },
    );
  });

  it("resumes an exact credentialed candidate only with its matching password", async () => {
    await withRootAdminDatabase(
      databaseUrl ?? "",
      "root_credential_recovery",
      async (isolatedUrl, connection) => {
        const username = "preview.recovery_credential";
        const email = await technicalEmailForUsername(username);
        const auth = createBetterAuthRuntime({
          database: connection.database,
          baseURL: rootAdminBaseURL,
          secret: rootAdminSecret,
        });
        await auth.api.createUser({
          body: {
            email,
            password: recoveryPassword,
            name: "Interrupted Root",
            role: "user",
            data: { username, displayUsername: username },
          },
        });
        const seeded = await connection.client<{ id: string }[]>`
          SELECT id FROM "user" WHERE username = ${username}
        `;
        const seededId = seeded[0]?.id;
        if (seededId === undefined) throw new Error("Expected recovery candidate");

        await expect(
          createInitialTechnicalAdmin({
            connectionString: isolatedUrl,
            secret: rootAdminSecret,
            baseURL: rootAdminBaseURL,
            username,
            displayName: "Recovered Root",
            password: `${recoveryPassword}.wrong`,
          }),
        ).rejects.toBeInstanceOf(TechnicalRootAdminStateError);

        const beforeRetry = await connection.client<{ role: string | null }[]>`
          SELECT role FROM "user" WHERE id = ${seededId}
        `;
        expect(beforeRetry[0]?.role).toBe("user");

        const result = await createInitialTechnicalAdmin({
          connectionString: isolatedUrl,
          secret: rootAdminSecret,
          baseURL: rootAdminBaseURL,
          username,
          displayName: "Recovered Root",
          password: recoveryPassword,
        });
        expect(result.identityId).toBe(seededId);

        const finalized = await connection.client<
          { role: string | null; sessions: number }[]
        >`
          SELECT u.role,
            (SELECT count(*)::int FROM session s WHERE s.user_id = u.id) AS sessions
          FROM "user" u WHERE u.id = ${seededId}
        `;
        expect(finalized[0]).toEqual({ role: "admin", sessions: 0 });
      },
    );
  });
});
