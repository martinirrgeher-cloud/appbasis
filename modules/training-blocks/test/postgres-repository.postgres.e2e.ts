import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createPostgresDatabase } from "@appbasis/database/postgres-provisioning";
import {
  InMemoryTrainingBlockRepository,
  PostgresTrainingBlockRepository,
  TrainingBlockConflictError,
  TrainingBlockInactiveError,
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

  it("rejects direct PostgreSQL creation that violates the shared revision-one contract", async () => {
    const repository = new PostgresTrainingBlockRepository(
      postgresClient(requiredConnection().client),
    );
    const invalidRevision = Object.freeze({
      id: "direct-invalid-revision",
      organizationId: "org-direct",
      isActive: true,
      currentRevision: 2,
      createdAt: "2026-10-10T10:00:00.000Z",
      updatedAt: "2026-10-10T10:00:00.000Z",
      revision: Object.freeze({
        organizationId: "org-direct",
        blockId: "direct-invalid-revision",
        revision: 2,
        name: "Invalid",
        audienceId: null,
        durationMinutes: null,
        note: null,
        exercises: Object.freeze([]),
        createdAt: "2026-10-10T10:00:00.000Z",
      }),
    });
    const invalidScope = Object.freeze({
      ...invalidRevision,
      id: "direct-invalid-scope",
      currentRevision: 1,
      revision: Object.freeze({
        ...invalidRevision.revision,
        blockId: "other-block",
        revision: 1,
      }),
    });

    await expect(repository.create(invalidRevision)).rejects.toThrow(
      "Training block creation must start at revision 1.",
    );
    await expect(repository.create(invalidScope)).rejects.toThrow(
      "Training block revision escaped its block scope.",
    );
    await expect(repository.listCurrent("org-direct")).resolves.toEqual([]);
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

  it("serializes update versus deactivation so an archived block cannot receive a later revision", async () => {
    const seed = serviceFor(requiredConnection(), ["block-lifecycle", "item-lifecycle"]);
    await seed.create("org-lifecycle", {
      name: "Lifecycle",
      exercises: [{ exerciseId: "exercise-1" }],
    });

    const updateConnection = createPostgresDatabase(isolatedDatabaseUrl);
    const deactivateConnection = createPostgresDatabase(isolatedDatabaseUrl);
    try {
      const updater = serviceFor(updateConnection, []);
      const deactivator = serviceFor(deactivateConnection, []);
      const results = await Promise.allSettled([
        updater.update("org-lifecycle", "block-lifecycle", 1, {
          name: "Lifecycle updated",
          exercises: [{ itemId: "item-lifecycle", exerciseId: "exercise-1" }],
        }),
        deactivator.deactivate("org-lifecycle", "block-lifecycle", 1),
      ]);

      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((result) => result.status === "rejected");
      expect(rejected).toMatchObject({ status: "rejected" });
      if (rejected?.status === "rejected") {
        expect(
          rejected.reason instanceof TrainingBlockConflictError ||
            rejected.reason instanceof TrainingBlockInactiveError,
        ).toBe(true);
      }

      const current = await seed.findCurrent("org-lifecycle", "block-lifecycle");
      expect(current).toBeDefined();
      if (current?.isActive) {
        expect(current.currentRevision).toBe(2);
        await expect(seed.listRevisions("org-lifecycle", "block-lifecycle")).resolves.toHaveLength(2);
      } else {
        expect(current?.currentRevision).toBe(1);
        await expect(seed.listRevisions("org-lifecycle", "block-lifecycle")).resolves.toHaveLength(1);
      }
    } finally {
      await updateConnection.client.end();
      await deactivateConnection.client.end();
    }
  });

  it("rejects a stale revision append after deactivation even when the revision number still matches", async () => {
    const repository = new PostgresTrainingBlockRepository(
      postgresClient(requiredConnection().client),
    );
    const service = new TrainingBlockService({
      repository,
      createId: () => "block-archived",
      now: () => new Date("2026-10-10T10:00:00.000Z"),
    });
    const created = await service.create("org-archived", { name: "Archived" });
    await service.deactivate("org-archived", "block-archived", 1);

    const staleRevision = Object.freeze({
      ...created.revision,
      revision: 2,
      name: "Stale autosave",
      createdAt: "2026-10-10T10:05:00.000Z",
    });
    await expect(
      repository.appendRevision("org-archived", "block-archived", 1, staleRevision),
    ).resolves.toEqual({ status: "inactive", currentRevision: 1 });
    await expect(service.listRevisions("org-archived", "block-archived")).resolves.toHaveLength(1);
  });

  it("persists maximum-size create and update payloads with bulk child inserts", async () => {
    const itemIds = Array.from({ length: 200 }, (_, index) => `item-max-${index}`);
    const service = serviceFor(requiredConnection(), ["block-max", ...itemIds]);
    const createExercises = Array.from({ length: 200 }, (_, exerciseIndex) => ({
      exerciseId: `exercise-${exerciseIndex}`,
      parameterOverrides: Array.from({ length: 50 }, (_, parameterIndex) => ({
        key: `parameter-${parameterIndex}`,
        value: `create-${exerciseIndex}-${parameterIndex}`,
      })),
    }));
    await service.create("org-max", {
      name: "Maximum block",
      exercises: createExercises,
    });

    const updateExercises = createExercises.map((exercise, exerciseIndex) => ({
      itemId: itemIds[exerciseIndex]!,
      exerciseId: exercise.exerciseId,
      parameterOverrides: exercise.parameterOverrides.map((override, parameterIndex) => ({
        key: override.key,
        value: `update-${exerciseIndex}-${parameterIndex}`,
      })),
    }));
    await expect(
      service.update("org-max", "block-max", 1, {
        name: "Maximum block v2",
        exercises: updateExercises,
      }),
    ).resolves.toMatchObject({ currentRevision: 2 });

    const counts = await requiredConnection().client.unsafe(
      `SELECT
         (SELECT count(*)::int
            FROM appbasis_training_block_revision_item
           WHERE organization_id = 'org-max'
             AND block_id = 'block-max') AS item_count,
         (SELECT count(*)::int
            FROM appbasis_training_block_revision_item_parameter
           WHERE organization_id = 'org-max'
             AND block_id = 'block-max') AS parameter_count`,
    );
    expect(Number(counts[0]?.item_count)).toBe(400);
    expect(Number(counts[0]?.parameter_count)).toBe(20_000);
  });

  it("keeps list ordering identical across in-memory and PostgreSQL adapters", async () => {
    const ids = ["sort-z", "sort-umlaut", "sort-alpha-b", "sort-alpha-a"];
    const postgres = serviceFor(requiredConnection(), [...ids]);
    let memoryIndex = 0;
    const memory = new TrainingBlockService({
      repository: new InMemoryTrainingBlockRepository(),
      createId: () => ids[memoryIndex++] ?? `memory-${memoryIndex}`,
      now: () => new Date("2026-10-10T10:00:00.000Z"),
    });
    const drafts = [
      { name: "z" },
      { name: "ä" },
      { name: "Alpha" },
      { name: "alpha" },
    ];
    for (const draft of drafts) {
      await postgres.create("org-ordering", draft);
      await memory.create("org-ordering", draft);
    }

    const postgresOrder = (await postgres.list("org-ordering")).map((block) => block.id);
    const memoryOrder = (await memory.list("org-ordering")).map((block) => block.id);
    expect(postgresOrder).toEqual(memoryOrder);
    expect(postgresOrder[0]).toBe("sort-umlaut");
    expect(postgresOrder.at(-1)).toBe("sort-z");
  });

  it("keeps globally unique block identities isolated by organization", async () => {
    const orgA = serviceFor(requiredConnection(), ["block-a"]);
    const orgB = serviceFor(requiredConnection(), ["block-b"]);
    await orgA.create("org-a", { name: "A" });
    await orgB.create("org-b", { name: "B" });

    await expect(orgA.list("org-a")).resolves.toEqual([
      expect.objectContaining({ id: "block-a", revision: expect.objectContaining({ name: "A" }) }),
    ]);
    await expect(orgB.list("org-b")).resolves.toEqual([
      expect.objectContaining({ id: "block-b", revision: expect.objectContaining({ name: "B" }) }),
    ]);
    await expect(orgA.findCurrent("org-a", "block-b")).resolves.toBeUndefined();
    await expect(orgB.findCurrent("org-b", "block-a")).resolves.toBeUndefined();
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
