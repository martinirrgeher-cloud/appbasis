import { readFile } from "node:fs/promises";

import { createPostgresDatabase } from "@appbasis/database";

export const rootAdminBaseURL = "http://localhost:3000";
export const rootAdminSecret =
  "technical-root-admin-e2e-secret-at-least-32-characters";

export async function withRootAdminDatabase(
  databaseUrl: string,
  suffix: string,
  run: (
    isolatedUrl: string,
    connection: ReturnType<typeof createPostgresDatabase>,
  ) => Promise<void>,
): Promise<void> {
  const adminConnection = createPostgresDatabase(databaseUrl);
  const databaseName = `appbasis_${suffix}_e2e`;
  const isolated = new URL(databaseUrl);
  isolated.pathname = `/${databaseName}`;

  try {
    await adminConnection.client.unsafe(
      `DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`,
    );
    await adminConnection.client.unsafe(`CREATE DATABASE ${databaseName}`);
    const connection = createPostgresDatabase(isolated.toString());

    try {
      for (const migration of ["0000", "0001"]) {
        const sql = await readFile(
          new URL(`../drizzle/${migration}_appbasis_identity_foundation.sql`, import.meta.url),
          "utf8",
        );
        for (const statement of sql.split("--> statement-breakpoint")) {
          if (statement.trim() !== "") await connection.client.unsafe(statement);
        }
      }
      await run(isolated.toString(), connection);
    } finally {
      await connection.client.end();
    }
  } finally {
    await adminConnection.client.unsafe(
      `DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`,
    );
    await adminConnection.client.end();
  }
}
