import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createPostgresDatabase } from "@appbasis/database/postgres-provisioning";
import {
  PostgresTrainingBlockRepository,
  TrainingBlockConflictError,
  TrainingBlockService,
  type TrainingBlockPostgresClient,
} from "../src/index";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error("DATABASE_URL is required for training-blocks PostgreSQL E2E tests.");
}

const administrativeConnection = createPostgresDatabase(databaseUrl);
const isolatedDatabaseName =
  "appbasis_training_blocks_" + randomUUID().replaceAll("-", "").slice(0, 18);
const isolatedDatabaseUrl = databaseUrlForName(databaseUrl, isolatedDatabaseName);
let isolatedConnection: ReturnType<typeof createPostgresDatabase> | null = null;
let isolatedDatabaseCreated = false;

beforeAll(async () => {
  await administrativeConnection.client.unsafe("CREATE DATABASE " + isolatedDatabaseName);
  isolatedDatabaseCreated = true;
  isolatedConnection = createPostgresDatabase(isolatedDatabaseUrl);
  const migration = await readFile(
    new URL("../migrations/0000_appbasis_training_blocks_foundation.sql", import.meta.url),
    "utf8",
  );
  await requiredConnection().client.unsafe(migration);
});

beforeEach(async () => {
  await requiredConnection().client.unsafe(
    `TRUNCATE TABLE
       appbasis_training_block_revision_item_parameter,
       appbasis_training_block_revision_item,
       appbasis_training_block_revision,
       appbasis_training_block`,
  );
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

describe("training-blocks PostgreSQL repository", () => {
  it("persists immutable revisions, current-only reads and deactivation", async () => {
    const service = serviceFor(requiredConnection(), [
      "block-1",
      "item-a",
      "item-b",
      "item-c",
    ]);
    const created = await service.create("org-a", {
      name: "Sprint",
      audienceId: "group-a",
      exercises: [
        { exerciseId: "exercise-1" },
        { exerciseId: "exercise-1" },
      ],
    });
    expect(created.revision.exercises.map((item) => item.itemId)).toEqual([
      "item-a",
      "item-b",
    ]);

    const updated = await service.update("org-a", "block-1", 1, {
      name: "Sprint v2",
      audienceId: "group-a",
      exercises: [
        { itemId: "item-b", exerciseId: "exercise-1", note: "first" },
        { itemId: "item-a", exerciseId: "exercise-1" },
        { exerciseId: "exercise-2", parameterOverrides: [{ key: "sets", value: "4" }] },
      ],
    });
    expect(updated).toMatchObject({ currentRevision: 2 });
    expect(updated?.revision.exercises.map((item) => item.itemId)).toEqual([
      "item-b",
      "item-a",
      "item-c",
    ]);

    await expect(service.list("org-a")).resolves.toEqual([
      expect.objectContaining({
        currentRevision: 2,
        revision: expect.objectContaining({ name: "Sprint v2", revision: 2 }),
      }),
    ]);
    await expect(service.findRevision("org-a", "block-1", 1)).resolves.toMatchObject({
      name: "Sprint",
      exercises: [
        { itemId: "item-a", sortOrder: 0 },
        { itemId: "item-b", sortOrder: 1 },
      ],
    });
    await expect(service.listRevisions("org-a", "block-1")).resolves.toEqual([
      expect.objectContaining({ revision: 2 }),
      expect.objectContaining({ revision: 1 }),
    ]);

    await expect(service.deactivate("org-a", "block-1", 2)).resolves.toMatchObject({
      isActive: false,
      currentRevision: 2,
    });
    await expect(service.listRevisions("org-a", "block-1")).resolves.toHaveLength(2);
  });

  it("serializes concurrent updates so exactly one expected revision wins", async () => {
    const seed = serviceFor(requiredConnection(), ["block-race", "item-race"]);
    await seed.create("org-race", {
      name: "Race",
      exercises: [{ exerciseId: "exercise-1" }],
    });

    const leftConnection = createPostgresDatabase(isolatedDatabaseUrl);
    const rightConnection = createPostgresDatabase(isolatedDatabaseUrl);
    try {
      const left = serviceFor(leftConnection, []);
      const right = serviceFor(rightConnection, []);
      const results = await Promise.allSettled([
        left.update("org-race", "block-race", 1, {
          name: "Left",
          exercises: [{ itemId: "item-race", exerciseId: "exercise-1" }],
        }),
        right.update("org-race", "block-race", 1, {
          name: "Right",
          exercises: [{ itemId: "item-race", exerciseId: "exercise-1" }],
        }),
      ]);

      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((result) => result.status === "rejected");
      expect(rejected).toMatchObject({ status: "rejected" });
      if (rejected?.status === "rejected") {
        expect(rejected.reason).toBeInstanceOf(TrainingBlockConflictError);
      }
      await expect(seed.listRevisions("org-race", "block-race")).resolves.toHaveLength(2);
    } finally {
      await leftConnection.client.end();
      await rightConnection.client.end();
    }
  });

  it("keeps identical block ids isolated by organization", async () => {
    await requiredConnection().client.begin(async (transaction) => {
      await transaction.unsafe(
        `INSERT INTO appbasis_training_block (
           id, organization_id, current_revision
         ) VALUES
           ('shared', 'org-a', 1),
           ('shared', 'org-b', 1)`,
      );
      await transaction.unsafe(
        `INSERT INTO appbasis_training_block_revision (
           organization_id, block_id, revision, name
         ) VALUES
           ('org-a', 'shared', 1, 'A'),
           ('org-b', 'shared', 1, 'B')`,
      );
    });

    const service = serviceFor(requiredConnection(), []);
    await expect(service.list("org-a")).resolves.toEqual([
      expect.objectContaining({ id: "shared", revision: expect.objectContaining({ name: "A" }) }),
    ]);
    await expect(service.list("org-b")).resolves.toEqual([
      expect.objectContaining({ id: "shared", revision: expect.objectContaining({ name: "B" }) }),
    ]);
  });
});

function serviceFor(
  connection: ReturnType<typeof createPostgresDatabase>,
  ids: string[],
): TrainingBlockService {
  let index = 0;
  let tick = 0;
  return new TrainingBlockService({
    repository: new PostgresTrainingBlockRepository(postgresClient(connection.client)),
    createId: () => ids[index++] ?? `generated-${index}`,
    now: () => new Date(Date.UTC(2026, 9, 10, 10, tick++)),
  });
}

function postgresClient(
  client: ReturnType<typeof createPostgresDatabase>["client"],
): TrainingBlockPostgresClient {
  return {
    unsafe(query, parameters) {
      return client.unsafe(query, parameters);
    },
    async begin(callback) {
      return client.begin(async (transaction) =>
        callback({
          unsafe(query, parameters) {
            return transaction.unsafe(query, parameters);
          },
        }),
      );
    },
  };
}

function requiredConnection(): ReturnType<typeof createPostgresDatabase> {
  if (isolatedConnection === null) throw new Error("Isolated database is not ready.");
  return isolatedConnection;
}

function databaseUrlForName(baseUrl: string, databaseName: string): string {
  const url = new URL(baseUrl);
  url.pathname = "/" + databaseName;
  return url.toString();
}
