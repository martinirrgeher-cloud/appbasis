import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createPostgresDatabase } from "@appbasis/database/postgres-provisioning";
import {
  PostgresTrainingPlanRepository,
  TrainingPlanConflictError,
  TrainingPlanService,
  TrainingPlanTargetExistsError,
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
  "appbasis_training_plans_" +
  randomUUID().replaceAll("-", "").slice(0, 18);
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
  it("persists immutable revisions with nested blocks and stable item ids", async () => {
    const service = serviceFor(requiredConnection(), [
      "plan-1",
      "block-a",
      "child-a",
      "top-a",
      "child-b",
    ]);

    const created = await service.create("org-a", {
      subjectId: "athlete-1",
      planDate: "2026-10-12",
      note: "Original",
      items: [
        {
          kind: "block",
          sourceBlockId: "block-template",
          sourceBlockRevision: 5,
          name: "Sprint",
          exercises: [
            {
              sourceExerciseId: "exercise-1",
              name: "30 m",
              repetitions: "3",
            },
          ],
        },
        {
          kind: "exercise",
          name: "Auslaufen",
          amount: "10",
          unit: "min",
        },
      ],
    });

    expect(created.revision.items).toMatchObject([
      {
        kind: "block",
        itemId: "block-a",
        exercises: [{ itemId: "child-a" }],
      },
      { kind: "exercise", itemId: "top-a" },
    ]);

    const updated = await service.update("org-a", "plan-1", 1, {
      note: "Angepasst",
      items: [
        {
          kind: "exercise",
          itemId: "top-a",
          name: "Auslaufen",
          amount: "12",
          unit: "min",
        },
        {
          kind: "block",
          itemId: "block-a",
          sourceBlockId: "block-template",
          sourceBlockRevision: 5,
          name: "Sprint individuell",
          exercises: [
            {
              itemId: "child-a",
              sourceExerciseId: "exercise-1",
              name: "30 m",
              repetitions: "4",
            },
            {
              sourceExerciseId: "exercise-2",
              name: "Steigerung",
            },
          ],
        },
      ],
    });

    expect(updated).toMatchObject({
      currentRevision: 2,
      revision: {
        items: [
          { itemId: "top-a" },
          {
            itemId: "block-a",
            exercises: [
              { itemId: "child-a" },
              { itemId: "child-b" },
            ],
          },
        ],
      },
    });

    await expect(
      service.findRevision("org-a", "plan-1", 1),
    ).resolves.toMatchObject({
      revision: 1,
      note: "Original",
      items: [
        {
          itemId: "block-a",
          name: "Sprint",
          exercises: [{ itemId: "child-a", repetitions: "3" }],
        },
        { itemId: "top-a", amount: "10" },
      ],
    });
    await expect(
      service.listRevisions("org-a", "plan-1"),
    ).resolves.toEqual([
      expect.objectContaining({ revision: 2 }),
      expect.objectContaining({ revision: 1 }),
    ]);
  });

  it("serializes concurrent updates so exactly one expected revision wins", async () => {
    const seed = serviceFor(requiredConnection(), ["plan-race"]);
    await seed.create("org-race", {
      subjectId: "athlete-1",
      planDate: "2026-10-12",
    });

    const first = serviceFor(requiredConnection(), []);
    const second = serviceFor(requiredConnection(), []);
    const results = await Promise.allSettled([
      first.update("org-race", "plan-race", 1, { note: "first" }),
      second.update("org-race", "plan-race", 1, { note: "second" }),
    ]);

    const fulfilled = results.filter(
      (result) => result.status === "fulfilled",
    );
    const rejected = results.filter(
      (result) => result.status === "rejected",
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(
      rejected[0]?.status === "rejected" ? rejected[0].reason : null,
    ).toBeInstanceOf(TrainingPlanConflictError);

    await expect(
      seed.findCurrent("org-race", "plan-race"),
    ).resolves.toMatchObject({ currentRevision: 2 });
    await expect(
      seed.listRevisions("org-race", "plan-race"),
    ).resolves.toHaveLength(2);
  });

  it("protects an existing subject/day target without changing it", async () => {
    const originalService = serviceFor(requiredConnection(), [
      "plan-original",
    ]);
    const duplicateService = serviceFor(requiredConnection(), [
      "plan-duplicate",
    ]);
    await originalService.create("org-target", {
      subjectId: "athlete-1",
      planDate: "2026-10-12",
      note: "Original",
    });

    await expect(
      duplicateService.create("org-target", {
        subjectId: "athlete-1",
        planDate: "2026-10-12",
        note: "Do not overwrite",
      }),
    ).rejects.toBeInstanceOf(TrainingPlanTargetExistsError);

    await expect(
      originalService.findForSubjectDate(
        "org-target",
        "athlete-1",
        "2026-10-12",
      ),
    ).resolves.toMatchObject({
      id: "plan-original",
      currentRevision: 1,
      revision: { note: "Original" },
    });
  });

  it("filters current plans by subject and inclusive date range", async () => {
    const service = serviceFor(requiredConnection(), [
      "plan-12",
      "plan-14",
      "plan-other",
    ]);
    await service.create("org-list", {
      subjectId: "athlete-a",
      planDate: "2026-10-12",
    });
    await service.create("org-list", {
      subjectId: "athlete-a",
      planDate: "2026-10-14",
    });
    await service.create("org-list", {
      subjectId: "athlete-b",
      planDate: "2026-10-13",
    });

    await expect(
      service.list("org-list", {
        subjectId: "athlete-a",
        fromDate: "2026-10-13",
        toDate: "2026-10-14",
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "plan-14",
        planDate: "2026-10-14",
      }),
    ]);
  });

  it("enforces block-only parents in the real PostgreSQL schema", async () => {
    const service = serviceFor(requiredConnection(), [
      "plan-parent",
      "exercise-parent",
    ]);
    await service.create("org-parent", {
      subjectId: "athlete-1",
      planDate: "2026-10-12",
      items: [{ kind: "exercise", name: "Top exercise" }],
    });

    await expect(
      requiredConnection().client.unsafe(
        `INSERT INTO appbasis_training_plan_revision_item (
           organization_id, plan_id, revision, item_id, item_kind,
           parent_block_item_id, sort_order, name
         )
         VALUES (
           'org-parent', 'plan-parent', 1, 'illegal-child', 'exercise',
           'exercise-parent', 0, 'Illegal child'
         )`,
      ),
    ).rejects.toThrow();

    const rows = await requiredConnection().client.unsafe(
      `SELECT count(*)::int AS count
       FROM appbasis_training_plan_revision_item
       WHERE organization_id = 'org-parent'
         AND plan_id = 'plan-parent'`,
    );
    expect(Number(rows[0]?.count)).toBe(1);
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
    now: () => new Date(Date.UTC(2026, 9, 12, 8, tick++)),
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
