import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createPostgresDatabase } from "@appbasis/database/postgres-provisioning";
import {
  PostgresTrainingPlanRepository,
  TrainingPlanConflictError,
  TrainingPlanLifecycleService,
  TrainingPlanService,
  TrainingPlanSubjectDeletedError,
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
  const migrations = await Promise.all(
    [
      "../migrations/0000_appbasis_training_plans_foundation.sql",
      "../migrations/0001_appbasis_training_plan_subject_deletion.sql",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );
  for (const migration of migrations) {
    await requiredConnection().client.unsafe(migration);
  }
});

beforeEach(async () => {
  await requiredConnection().client.unsafe(
    `TRUNCATE TABLE
       appbasis_training_plan_revision_item,
       appbasis_training_plan_revision,
       appbasis_training_plan,
       appbasis_training_plan_subject_deletion`,
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
      source.currentRevision,
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
    await expect(
      service.listForSubjectsDateRange(
        "org-a",
        ["athlete-a", "athlete-b"],
        "2026-10-12",
        "2026-10-14",
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "source-plan",
        subjectId: "athlete-a",
        planDate: "2026-10-12",
      }),
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

  it("purges one subject with all historical revisions without crossing organization scope", async () => {
    const repository = new PostgresTrainingPlanRepository(
      postgresClient(requiredConnection().client),
    );
    const plans = new TrainingPlanService({
      repository,
      createId: (() => {
        const ids = [
          "delete-plan-1",
          "delete-block",
          "delete-child",
          "delete-standalone",
          "delete-plan-2",
          "delete-day-2",
          "keep-plan",
          "other-org-plan",
        ];
        let index = 0;
        return () => ids[index++] ?? `delete-generated-${index}`;
      })(),
      now: () => new Date("2026-10-15T10:00:00.000Z"),
    });
    const lifecycle = new TrainingPlanLifecycleService({ repository });

    await plans.create("org-delete", {
      subjectId: "athlete-delete",
      planDate: "2026-10-12",
      items: [
        {
          kind: "block",
          name: "Block",
          exercises: [{ name: "Child", comment: "Sensitive note" }],
        },
      ],
    });
    await plans.update("org-delete", "delete-plan-1", 1, {
      note: "Historical note",
      items: [
        {
          kind: "block",
          itemId: "delete-block",
          name: "Block",
          exercises: [
            {
              itemId: "delete-child",
              name: "Child",
              comment: "Changed note",
            },
          ],
        },
        {
          kind: "exercise",
          name: "Standalone",
          comment: "Another note",
        },
      ],
    });
    await plans.create("org-delete", {
      subjectId: "athlete-delete",
      planDate: "2026-10-13",
      items: [{ kind: "exercise", name: "Second day" }],
    });
    await plans.create("org-delete", {
      subjectId: "athlete-keep",
      planDate: "2026-10-12",
    });
    await plans.create("org-other", {
      subjectId: "athlete-delete",
      planDate: "2026-10-12",
    });

    await expect(
      lifecycle.deleteSubjectData("org-delete", "athlete-delete"),
    ).resolves.toEqual({
      deletedPlans: 2,
      deletedRevisions: 3,
      deletedItems: 6,
    });

    await expect(
      plans.listForSubjectDateRange(
        "org-delete",
        "athlete-delete",
        "2026-10-01",
        "2026-10-31",
      ),
    ).resolves.toEqual([]);
    await expect(
      plans.findCurrent("org-delete", "keep-plan"),
    ).resolves.toBeDefined();
    await expect(
      plans.findCurrent("org-other", "other-org-plan"),
    ).resolves.toBeDefined();

    const revisionRows = await requiredConnection().client.unsafe(
      `SELECT plan_id
       FROM appbasis_training_plan_revision
       WHERE organization_id = 'org-delete'
         AND plan_id IN ('delete-plan-1', 'delete-plan-2')`,
    );
    const itemRows = await requiredConnection().client.unsafe(
      `SELECT plan_id
       FROM appbasis_training_plan_revision_item
       WHERE organization_id = 'org-delete'
         AND plan_id IN ('delete-plan-1', 'delete-plan-2')`,
    );
    expect(revisionRows).toEqual([]);
    expect(itemRows).toEqual([]);

    await expect(
      plans.create("org-delete", {
        subjectId: "athlete-delete",
        planDate: "2026-10-14",
      }),
    ).rejects.toBeInstanceOf(TrainingPlanSubjectDeletedError);

    const markers = await lifecycle.listCurrentDeletionMarkers();
    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({
      organizationId: "org-delete",
      subjectId: "athlete-delete",
    });
    expect(
      markers[0]!.purgeAfter.getTime() - markers[0]!.completedAt.getTime(),
    ).toBe(35 * 24 * 60 * 60 * 1000);
  });

  it("keeps the 35-day deletion marker duration fixed across a DST timezone", async () => {
    const connection = createPostgresDatabase(isolatedDatabaseUrl);
    try {
      const repository = new PostgresTrainingPlanRepository({
        unsafe(query, parameters) {
          return connection.client.unsafe(query, parameters);
        },
        async begin(callback) {
          return connection.client.begin(async (transaction) => {
            await transaction.unsafe("SET LOCAL TIME ZONE 'Europe/Vienna'");
            return callback({
              unsafe(query, parameters) {
                return transaction.unsafe(query, parameters);
              },
            });
          });
        },
      });
      const deletedAt = new Date("2026-10-15T10:00:00.000Z");
      const lifecycle = new TrainingPlanLifecycleService({
        repository,
        now: () => deletedAt,
      });

      await expect(
        lifecycle.deleteSubjectData("org-dst", "athlete-dst"),
      ).resolves.toEqual({
        deletedPlans: 0,
        deletedRevisions: 0,
        deletedItems: 0,
      });

      const markers = await lifecycle.listCurrentDeletionMarkers();
      expect(markers).toHaveLength(1);
      expect(markers[0]).toMatchObject({
        organizationId: "org-dst",
        subjectId: "athlete-dst",
      });
      expect(markers[0]!.completedAt.toISOString()).toBe(
        deletedAt.toISOString(),
      );
      expect(
        markers[0]!.purgeAfter.getTime() - markers[0]!.completedAt.getTime(),
      ).toBe(35 * 24 * 60 * 60 * 1000);
    } finally {
      await connection.client.end();
    }
  });

  it("never lets a create queued behind purge resurrect the subject", async () => {
    const createConnection = createPostgresDatabase(isolatedDatabaseUrl);
    const lifecycleConnection = createPostgresDatabase(isolatedDatabaseUrl);

    let signalPurgeLock!: () => void;
    const purgeLockAcquired = new Promise<void>((resolve) => {
      signalPurgeLock = resolve;
    });
    let releasePurge!: () => void;
    const purgeMayContinue = new Promise<void>((resolve) => {
      releasePurge = resolve;
    });
    let signalCreateLockAttempt!: () => void;
    const createLockAttempted = new Promise<void>((resolve) => {
      signalCreateLockAttempt = resolve;
    });

    try {
      const lifecycleRepository = new PostgresTrainingPlanRepository({
        unsafe(query, parameters) {
          return lifecycleConnection.client.unsafe(query, parameters);
        },
        async begin(callback) {
          return lifecycleConnection.client.begin(async (transaction) =>
            callback({
              async unsafe(query, parameters) {
                const rows = await transaction.unsafe(query, parameters);
                if (query.includes("pg_catalog.pg_advisory_xact_lock")) {
                  signalPurgeLock();
                  await purgeMayContinue;
                }
                return rows;
              },
            }),
          );
        },
      });
      const creatorRepository = new PostgresTrainingPlanRepository({
        unsafe(query, parameters) {
          return createConnection.client.unsafe(query, parameters);
        },
        async begin(callback) {
          return createConnection.client.begin(async (transaction) =>
            callback({
              unsafe(query, parameters) {
                if (query.includes("pg_catalog.pg_advisory_xact_lock")) {
                  signalCreateLockAttempt();
                }
                return transaction.unsafe(query, parameters);
              },
            }),
          );
        },
      });
      const creator = new TrainingPlanService({
        repository: creatorRepository,
        createId: () => "queued-create-plan",
        now: () => new Date("2026-10-15T09:59:59.000Z"),
      });
      const lifecycle = new TrainingPlanLifecycleService({
        repository: lifecycleRepository,
        now: () => new Date("2026-10-15T10:00:00.000Z"),
      });

      const deletePromise = lifecycle.deleteSubjectData(
        "org-queued-create",
        "athlete-queued-create",
      );
      await purgeLockAcquired;

      const createPromise = creator.create("org-queued-create", {
        subjectId: "athlete-queued-create",
        planDate: "2026-10-12",
      });
      await createLockAttempted;
      releasePurge();

      await expect(deletePromise).resolves.toEqual({
        deletedPlans: 0,
        deletedRevisions: 0,
        deletedItems: 0,
      });
      await expect(createPromise).rejects.toBeInstanceOf(
        TrainingPlanSubjectDeletedError,
      );

      const verifier = serviceFor(requiredConnection(), []);
      await expect(
        verifier.listForSubjectDateRange(
          "org-queued-create",
          "athlete-queued-create",
          "2026-10-01",
          "2026-10-31",
        ),
      ).resolves.toEqual([]);
    } finally {
      releasePurge?.();
      await createConnection.client.end();
      await lifecycleConnection.client.end();
    }
  });

  it("serializes a subject purge against a concurrent revision append without deadlock", async () => {
    const seed = serviceFor(requiredConnection(), ["purge-race-plan"]);
    await seed.create("org-purge-race", {
      subjectId: "athlete-purge-race",
      planDate: "2026-10-12",
      note: "Before race",
    });

    const updateConnection = createPostgresDatabase(isolatedDatabaseUrl);
    const lifecycleConnection = createPostgresDatabase(isolatedDatabaseUrl);
    try {
      const updater = serviceFor(updateConnection, []);
      const lifecycleRepository = new PostgresTrainingPlanRepository(
        postgresClient(lifecycleConnection.client),
      );
      const lifecycle = new TrainingPlanLifecycleService({
        repository: lifecycleRepository,
      });

      const [updateResult, deleteResult] = await Promise.allSettled([
        updater.update("org-purge-race", "purge-race-plan", 1, {
          note: "Concurrent revision",
        }),
        lifecycle.deleteSubjectData(
          "org-purge-race",
          "athlete-purge-race",
        ),
      ]);

      expect(updateResult.status).toBe("fulfilled");
      expect(deleteResult.status).toBe("fulfilled");
      if (deleteResult.status === "fulfilled") {
        expect(deleteResult.value.deletedPlans).toBe(1);
        expect([1, 2]).toContain(deleteResult.value.deletedRevisions);
      }
      await expect(
        seed.findCurrent("org-purge-race", "purge-race-plan"),
      ).resolves.toBeUndefined();
    } finally {
      await updateConnection.client.end();
      await lifecycleConnection.client.end();
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
