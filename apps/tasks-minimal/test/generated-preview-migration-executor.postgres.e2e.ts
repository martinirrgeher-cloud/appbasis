import { afterAll, describe, expect, it } from "vitest";

import { createPostgresDatabase } from "@appbasis/database";
import {
  applyGeneratedPreviewMigrations,
  GeneratedPreviewMigrationConfigurationError,
  GeneratedPreviewMigrationExecutionError,
} from "../tooling/apply-generated-preview-migrations.mjs";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error("DATABASE_URL is required for generated preview migration PostgreSQL E2E tests.");
}

const databaseName = "appbasis_tasks_preview";
const targetUrl = new URL(databaseUrl);
targetUrl.pathname = `/${databaseName}`;
const adminConnection = createPostgresDatabase(databaseUrl);

describe("Generated preview migration executor PostgreSQL E2E", () => {
  afterAll(async () => {
    await adminConnection.client.unsafe(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
    await adminConnection.client.end();
  });

  it("applies only the generated manifest to its named empty database and refuses a second run", async () => {
    await adminConnection.client.unsafe(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
    await adminConnection.client.unsafe(`CREATE DATABASE ${databaseName}`);

    const result = await applyGeneratedPreviewMigrations({
      connectionString: targetUrl.toString(),
    });
    expect(result.migrationCount).toBe(4);
    expect(result.statementCount).toBeGreaterThan(0);

    const verification = createPostgresDatabase(targetUrl.toString());
    try {
      const rows = await verification.client<{ table_name: string }[]>`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN (
            'user',
            'appbasis_identity_security_state',
            'appbasis_identity_operation',
            'appbasis_permission_capability',
            'appbasis_permission_principal',
            'appbasis_task'
          )
        ORDER BY table_name
      `;
      expect(rows.map((row) => row.table_name)).toEqual([
        'appbasis_identity_operation',
        'appbasis_identity_security_state',
        'appbasis_permission_capability',
        'appbasis_permission_principal',
        'appbasis_task',
        'user',
      ]);
    } finally {
      await verification.client.end();
    }

    await expect(
      applyGeneratedPreviewMigrations({ connectionString: targetUrl.toString() }),
    ).rejects.toBeInstanceOf(GeneratedPreviewMigrationExecutionError);
  });

  it("rejects a PostgreSQL connection that points at a different logical database", async () => {
    await expect(
      applyGeneratedPreviewMigrations({ connectionString: databaseUrl }),
    ).rejects.toBeInstanceOf(GeneratedPreviewMigrationConfigurationError);
  });
});
