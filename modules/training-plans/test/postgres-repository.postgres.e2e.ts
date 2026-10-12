import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createPostgresDatabase } from "@appbasis/database/postgres-provisioning";
import {
  PostgresTrainingPlanRepository,
  TrainingPlanConflictError,
  TrainingPlanService,
  TrainingPlanTargetOccupiedError,
  type TrainingPlanPostgresClient,
} from "../src/index";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error(
    "DATABASE_URL is required for training-plans PostgreSQL E2E tests.",
  );
}

const administrativeConnection = createPostgresDatabase(databaseUrl);
const isolatedDatabaseName =
  "appbasis_training_plans_" + randomUUID().replaceAll("-", "").slice(0, 18);
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
  const migration = await readFile(
    new URL(
      "../migrations/0000_appbasis_training_plans_foundation.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await requiredConnection().client.unsafe(migration);
});

beforeEach(async () => {
  await requiredConnection().client.unsafe(
    `TRUNCATE TABLE
       appbasis_training_plan_revision_item,
       appbasis_training_plan_revision,
       appbasis_training_plan`,
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

describe("training-plans PostgreSQL repository", () => {
  it("persists revisions, date-range reads and independent plan copies", async () => {
    const service = serviceFor(requiredConnection(), [
      "source-plan",
      "source-block",
      "source-child",
      "copy-plan",
      "copy-block",
      "copy-child",
    ]);

    const source = await service.create("org-a", {
      subjectId: "athlete-a",
      planDate: "2026-10-12",
      note: "Original",
      items: [
        {
          kind: "block",
          sourceBlockId: "template-1",
          sourceBlockRevision: 4,
          name: "Sprint",
          exercises: [
            {
              sourceExerciseId: "exercise-1",
              name: "30 m",
              repetitions: "3",
            },
          ],
        },
      ],
    });
    expect(source.currentRevision).toBe(1);

    const copy = await service.copyCurrentTo(
      "org-a",
      source.id,
      "athlete-b",
      "2026-10-13",
    );
    expect(copy).toMatchObject({
      id: "copy-plan",
      currentRevision: 1,
      subjectId: "athlete-b",
      revision: {
        items: [
          {
            itemId: "copy-block",
            sourceBlockId: "template-1",
            sourceBlockRevision: 4,
            exercises: [{ itemId: "copy-child", repetitions: "3" }],
          },
        ],
      },
    });

    await service.update("org-a", source.id, 1, {
      note: "Quelle v2",
      items: [
        {
          kind: "block",
          itemId: "source-block",
          sourceBlockId: "template-1",
          sourceBlockRevision: 4,
          name: "Sprint v2",
          exercises: [
            {
              itemId: "source-child",
              sourceExerciseId: "exercise-1",
              name: "30 m",
              repetitions: "6",
            },
          ],
        },
      ],
    });

    await expect(service.findCurrent("org-a", source.id)).resolves.toMatchObject({
      currentRevision: 2,
      revision: {
        note: "Quelle v2",
        items: [{ name: "Sprint v2", exercises: [{ repetitions: "6" }] }],
      },
    });
    await expect(service.findCurrent("org-a", "copy-plan")).resolves.toMatchObject({
      currentRevision: 1,
      revision: {
        note: "Original",
        items: [{ name: "Sprint", exercises: [{ repetitions: "3" }] }],
      },
    });
    await expect(service.listRevisions("org-a", source.id)).resolves.toEqual([
      expect.objectContaining({ revision: 2 }),
      expect.objectContaining({ revision: 1 }),
    ]);
    await expect(
      service.listForSubjectDateRange(
        "org-a",
        "athlete-b",
        "2026-10-12",
        "2026-10-14",
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "copy-plan",
        subjectId: "athlete-b",
        planDate: "2026-10-13",
      }),
    ]);
  });

  it("reads dates and timestamps independently of PostgreSQL session formatting", async () => {
    const connection = createPostgresDatabase(isolatedDatabaseUrl);
    try {
      await connection.client.unsafe("SET DateStyle TO 'German, DMY'");
      await connection.client.unsafe("SET TIME ZONE 'Europe/Vienna'");

      const service = serviceFor(connection, ["plan-format"]);
      await service.create("org-format", {
        subjectId: "athlete-format",
        planDate: "2026-10-12",
        note: "Format",
      });
      await service.update("org-format", "plan-format", 1, {
        note: "Format v2",
      });

      await expect(
        service.findCurrent("org-format", "plan-format"),
      ).resolves.toMatchObject({
        planDate: "2026-10-12",
        createdAt: "2026-10-12T10:00:00.000Z",
        updatedAt: "2026-10-12T10:01:00.000Z",
        revision: {
          createdAt: "2026-10-12T10:01:00.000Z",
        },
      });
      await expect(
        service.listRevisions("org-format", "plan-format"),
      ).resolves.toEqual([
        expect.objectContaining({
          revision: 2,
          createdAt: "2026-10-12T10:01:00.000Z",
        }),
        expect.objectContaining({
          revision: 1,
          createdAt: "2026-10-12T10:00:00.000Z",
        }),
      ]);
    } finally {
      await connection.client.end();
    }
  });

  it("serializes concurrent updates so exactly one expected revision wins", async () => {
    const seed = serviceFor(requiredConnection(), ["plan-race"]);
    await seed.create("org-race", {
      subjectId: "athlete-race",
      planDate: "2026-10-12",
    });

    const leftConnection = createPostgresDatabase(isolatedDatabaseUrl);
    const rightConnection = createPostgresDatabase(isolatedDatabaseUrl);
    try {
      const left = serviceFor(leftConnection, []);
      const right = serviceFor(rightConnection, []);
      const results = await Promise.allSettled([
        left.update("org-race", "plan-race", 1, { note: "Left" }),
        right.update("org-race", "plan-race", 1, { note: "Right" }),
      ]);

      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((result) => result.status === "rejected");
      expect(rejected).toMatchObject({ status: "rejected" });
      if (rejected?.status === "rejected") {
        expect(rejected.reason).toBeInstanceOf(TrainingPlanConflictError);
      }
      await expect(seed.listRevisions("org-race", "plan-race")).resolves.toHaveLength(2);
    } finally {
      await leftConnection.client.end();
      await rightConnection.client.end();
    }
  });

  it("protects one subject/day target atomically across concurrent creators", async () => {
    const leftConnection = createPostgresDatabase(isolatedDatabaseUrl);
    const rightConnection = createPostgresDatabase(isolatedDatabaseUrl);
    try {
      const left = serviceFor(leftConnection, ["plan-left"]);
      const right = serviceFor(rightConnection, ["plan-right"]);
      const results = await Promise.allSettled([
        left.create("org-target", {
          subjectId: "athlete-a",
          planDate: "2026-10-12",
          note: "Left",
        }),
        right.create("org-target", {
          subjectId: "athlete-a",
          planDate: "2026-10-12",
          note: "Right",
        }),
      ]);

      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((result) => result.status === "rejected");
      expect(rejected).toMatchObject({ status: "rejected" });
      if (rejected?.status === "rejected") {
        expect(rejected.reason).toBeInstanceOf(TrainingPlanTargetOccupiedError);
      }

      const verifier = serviceFor(requiredConnection(), []);
      await expect(
        verifier.findCurrentBySubjectDate(
          "org-target",
          "athlete-a",
          "2026-10-12",
        ),
      ).resolves.toBeDefined();
    } finally {
      await leftConnection.client.end();
      await rightConnection.client.end();
    }
  });

  it("enforces block-only parent rows in PostgreSQL", async () => {
    const service = serviceFor(requiredConnection(), [
      "plan-parent",
      "block-parent",
      "exercise-parent",
    ]);
    await service.create("org-parent", {
      subjectId: "athlete-a",
      planDate: "2026-10-12",
      items: [
        {
          kind: "block",
          name: "Block",
          exercises: [{ name: "Child" }],
        },
      ],
    });

    await expect(
      requiredConnection().client.unsafe(
        `INSERT INTO appbasis_training_plan_revision_item (
           organization_id, plan_id, revision, item_id, item_kind,
           parent_block_item_id, sort_order, name
         )
         VALUES (
           'org-parent', 'plan-parent', 1, 'rogue-child', 'exercise',
           'exercise-parent', 1, 'Rogue'
         )`,
      ),
    ).rejects.toThrow();
  });
});

function serviceFor(
  connection: ReturnType<typeof createPostgresDatabase>,
  ids: string[],
): TrainingPlanService {
  let index = 0;
  let tick = 0;
  return new TrainingPlanService({
    repository: new PostgresTrainingPlanRepository(
      postgresClient(connection.client),
    ),
    createId: () => ids[index++] ?? `generated-${index}`,
    now: () => new Date(Date.UTC(2026, 9, 12, 10, tick++)),
  });
}

function postgresClient(
  client: ReturnType<typeof createPostgresDatabase>["client"],
): TrainingPlanPostgresClient {
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
  if (isolatedConnection === null) {
    throw new Error("Isolated database is not ready.");
  }
  return isolatedConnection;
}

function databaseUrlForName(baseUrl: string, databaseName: string): string {
  const url = new URL(baseUrl);
  url.pathname = "/" + databaseName;
  return url.toString();
}
