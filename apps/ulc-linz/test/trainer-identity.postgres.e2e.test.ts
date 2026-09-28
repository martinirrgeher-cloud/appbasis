import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresDatabase } from "../../../packages/database/src/client.ts";

import {
  PostgresUlcLinzTrainerIdentityLinks,
  UlcLinzTrainerIdentityConflictError,
  UlcLinzTrainerIdentityNotFoundError,
} from "../worker/trainer-identity-postgres";

const databaseUrl = process.env.DATABASE_URL;

type DatabaseManifest = {
  owners: readonly {
    migrations: readonly string[];
  }[];
};

if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  describe.skip("ULC trainer identity PostgreSQL E2E", () => {
    it("requires DATABASE_URL", () => {});
  });
} else {
  describe("ULC trainer identity PostgreSQL E2E", () => {
    const administrativeConnection = createPostgresDatabase(databaseUrl);
    const isolatedDatabaseName =
      "appbasis_ulc_trainer_identity_" +
      randomUUID().replaceAll("-", "").slice(0, 10);
    const isolatedDatabaseUrl = databaseUrlForName(
      databaseUrl,
      isolatedDatabaseName,
    );
    let isolatedConnection: ReturnType<typeof createPostgresDatabase> | null = null;
    let isolatedDatabaseCreated = false;

    beforeAll(async () => {
      await administrativeConnection.client.unsafe(
        "CREATE DATABASE " + isolatedDatabaseName,
      );
      isolatedDatabaseCreated = true;
      isolatedConnection = createPostgresDatabase(isolatedDatabaseUrl);
      await applyManifestMigrations(requiredConnection().client);
    });

    afterAll(async () => {
      if (isolatedConnection !== null) {
        await isolatedConnection.client.end();
        isolatedConnection = null;
      }
      if (isolatedDatabaseCreated) {
        await administrativeConnection.client.unsafe(
          "DROP DATABASE " + isolatedDatabaseName + " WITH (FORCE)",
        );
      }
      await administrativeConnection.client.end();
    });

    it("binds active trainer identities to same-organization trainer subjects fail-closed", async () => {
      const client = requiredConnection().client;
      await client.unsafe(
        `INSERT INTO "user" (id, name, email, username, banned)
         VALUES
           ('identity-1', 'Trainer One', 'trainer1@example.test', 'trainer.one', false),
           ('identity-2', 'Trainer Two', 'trainer2@example.test', 'trainer.two', false),
           ('identity-foreign', 'Trainer Foreign', 'trainer3@example.test', 'trainer.foreign', false)`,
      );
      await client.unsafe(
        `INSERT INTO appbasis_trainer (
           id, organization_id, first_name, last_name, is_active
         ) VALUES
           ('trainer-1', 'verein-1', 'Anna', 'Auer', true),
           ('trainer-2', 'verein-1', 'Berta', 'Bauer', true),
           ('trainer-foreign', 'verein-2', 'Fremd', 'Trainer', true)`,
      );
      await client.unsafe(
        `INSERT INTO ulc_linz_membership (
           identity_id, organization_id, subject_id, source_role, active
         ) VALUES
           ('identity-1', 'verein-1', 'placeholder-1', 'trainer', true),
           ('identity-2', 'verein-1', 'placeholder-2', 'trainer', true),
           ('identity-foreign', 'verein-2', 'placeholder-3', 'trainer', true)`,
      );

      const repository = new PostgresUlcLinzTrainerIdentityLinks(client);

      await expect(repository.listBindings("verein-1")).resolves.toEqual([
        {
          identityId: "identity-1",
          username: "trainer.one",
          displayName: "Trainer One",
          trainerId: null,
        },
        {
          identityId: "identity-2",
          username: "trainer.two",
          displayName: "Trainer Two",
          trainerId: null,
        },
      ]);

      await expect(
        repository.bindTrainer({
          organizationId: "verein-1",
          identityId: "identity-1",
          trainerId: "trainer-1",
        }),
      ).resolves.toEqual({
        identityId: "identity-1",
        username: "trainer.one",
        displayName: "Trainer One",
        trainerId: "trainer-1",
      });

      await expect(
        repository.bindTrainer({
          organizationId: "verein-1",
          identityId: "identity-2",
          trainerId: "trainer-1",
        }),
      ).rejects.toBeInstanceOf(UlcLinzTrainerIdentityConflictError);

      await client.unsafe(
        `UPDATE "user"
         SET banned = true
         WHERE id = 'identity-1'`,
      );

      await expect(
        repository.bindTrainer({
          organizationId: "verein-1",
          identityId: "missing-identity",
          trainerId: "trainer-1",
        }),
      ).rejects.toBeInstanceOf(UlcLinzTrainerIdentityNotFoundError);

      const staleBindingAfterRejectedRelink = await client.unsafe(
        `SELECT subject_id
         FROM ulc_linz_membership
         WHERE identity_id = 'identity-1'`,
      );
      expect(staleBindingAfterRejectedRelink).toEqual([
        { subject_id: "trainer-1" },
      ]);

      await expect(
        repository.bindTrainer({
          organizationId: "verein-1",
          identityId: "identity-2",
          trainerId: "trainer-1",
        }),
      ).resolves.toEqual({
        identityId: "identity-2",
        username: "trainer.two",
        displayName: "Trainer Two",
        trainerId: "trainer-1",
      });

      await expect(
        repository.bindTrainer({
          organizationId: "verein-1",
          identityId: "identity-2",
          trainerId: "trainer-foreign",
        }),
      ).rejects.toBeInstanceOf(UlcLinzTrainerIdentityNotFoundError);

      await client.unsafe(
        `UPDATE appbasis_trainer
         SET is_active = false
         WHERE id = 'trainer-1'`,
      );
      await expect(repository.listBindings("verein-1")).resolves.toEqual([
        {
          identityId: "identity-2",
          username: "trainer.two",
          displayName: "Trainer Two",
          trainerId: null,
        },
      ]);
      await expect(
        repository.bindTrainer({
          organizationId: "verein-1",
          identityId: "identity-2",
          trainerId: "trainer-1",
        }),
      ).rejects.toBeInstanceOf(UlcLinzTrainerIdentityNotFoundError);

      const rows = await client.unsafe(
        `SELECT identity_id, subject_id
         FROM ulc_linz_membership
         WHERE organization_id = 'verein-1'
         ORDER BY identity_id`,
      );
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ identity_id: "identity-1" });
      expect(rows[0]?.subject_id).toMatch(/^ulc-detached-trainer:[a-f0-9]{32}$/);
      expect(rows[1]).toEqual({
        identity_id: "identity-2",
        subject_id: "trainer-1",
      });
    });

    function requiredConnection() {
      if (isolatedConnection === null) {
        throw new Error("The isolated trainer identity database is not ready.");
      }
      return isolatedConnection;
    }
  });
}

async function applyManifestMigrations(
  client: ReturnType<typeof createPostgresDatabase>["client"],
) {
  const manifest = JSON.parse(
    await readFile(new URL("../appbasis.database.json", import.meta.url), "utf8"),
  ) as DatabaseManifest;
  const migrations = manifest.owners.flatMap((owner) => owner.migrations);
  if (migrations.length !== 13 || new Set(migrations).size !== migrations.length) {
    throw new Error(
      "ULC trainer identity E2E requires the exact manifest-owned migration set.",
    );
  }

  for (const migration of migrations) {
    const sql = await readFile(
      new URL(`../../../${migration}`, import.meta.url),
      "utf8",
    );
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim() !== "") await client.unsafe(statement);
    }
  }
}

function databaseUrlForName(baseUrl: string, databaseName: string): string {
  const url = new URL(baseUrl);
  url.pathname = "/" + databaseName;
  return url.toString();
}
