import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createPostgresDatabase } from "@appbasis/database/postgres-provisioning";
import {
  PostgresTrainingDocumentationRepository,
  TrainingDocumentationConflictError,
  TrainingDocumentationService,
  TrainingDocumentationTargetOccupiedError,
} from "../src/index";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error(
    "DATABASE_URL is required for training-documentation PostgreSQL E2E tests.",
  );
}

const administrativeConnection = createPostgresDatabase(databaseUrl);
const isolatedDatabaseName =
  "appbasis_training_documentation_" +
  randomUUID().replaceAll("-", "").slice(0, 12);
const isolatedDatabaseUrl = databaseUrlForName(databaseUrl, isolatedDatabaseName);
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
      "../migrations/0000_appbasis_training_documentation_foundation.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await requiredConnection().client.unsafe(migration);
});

beforeEach(async () => {
  await requiredConnection().client.unsafe(
    `TRUNCATE TABLE
       appbasis_training_documentation_revision,
       appbasis_training_documentation
       CASCADE`,
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

describe("training-documentation PostgreSQL repository", () => {
  it("persists plan provenance, actual values and completion revisions", async () => {
    const service = serviceFor(requiredConnection(), ["documentation-1"]);

    const created = await service.create("org-1", {
      subjectId: "athlete-1",
      sessionDate: "2026-10-26",
      sourcePlanId: "plan-1",
      sourcePlanRevision: 4,
      note: "Plan übernommen",
      items: [
        {
          kind: "exercise",
          sourceItemId: "item-1",
          sourceExerciseId: "exercise-1",
          name: "30 m Sprint",
          plannedRepetitions: "6",
          actualRepetitions: "6",
          performed: true,
        },
      ],
      attendance: [
        {
          participantId: "athlete-1",
          displayName: "Anna Beispiel",
          status: "present",
        },
      ],
    });

    expect(created).toMatchObject({
      currentRevision: 1,
      sourcePlanId: "plan-1",
      sourcePlanRevision: 4,
      status: "draft",
    });

    const updated = await service.update("org-1", created.id, 1, {
      note: "Eine Wiederholung weniger",
      items: [
        {
          kind: "exercise",
          sourceItemId: "item-1",
          sourceExerciseId: "exercise-1",
          name: "30 m Sprint",
          plannedRepetitions: "6",
          actualRepetitions: "5",
          performed: true,
        },
      ],
    });
    expect(updated).toMatchObject({
      currentRevision: 2,
      revision: {
        note: "Eine Wiederholung weniger",
        items: [{ actualRepetitions: "5" }],
      },
    });

    const completed = await service.complete("org-1", created.id, 2);
    expect(completed).toMatchObject({
      currentRevision: 3,
      status: "completed",
    });
    expect(completed?.completedAt).toMatch(/^2026-10-26T10:/);

    const current = await service.findCurrent("org-1", created.id);
    expect(current).toMatchObject({
      sourcePlanId: "plan-1",
      sourcePlanRevision: 4,
      currentRevision: 3,
      status: "completed",
      revision: {
        items: [{ plannedRepetitions: "6", actualRepetitions: "5" }],
        attendance: [{ participantId: "athlete-1", status: "present" }],
      },
    });

    const revisions = await service.listRevisions("org-1", created.id);
    expect(revisions.map((entry) => entry.revision)).toEqual([3, 2, 1]);

    const reopened = await service.reopen("org-1", created.id, 3);
    expect(reopened).toMatchObject({
      currentRevision: 4,
      status: "draft",
      completedAt: null,
    });
  });

  it("serializes stale updates and protects one subject/day target", async () => {
    const seed = serviceFor(requiredConnection(), [
      "documentation-race",
      "documentation-target-a",
    ]);
    await seed.create("org-race", {
      subjectId: "athlete-race",
      sessionDate: "2026-10-26",
      sourcePlanId: "plan-race",
      sourcePlanRevision: 1,
    });

    const leftConnection = createPostgresDatabase(isolatedDatabaseUrl);
    const rightConnection = createPostgresDatabase(isolatedDatabaseUrl);
    try {
      const left = serviceFor(leftConnection, []);
      const right = serviceFor(rightConnection, []);
      const updates = await Promise.allSettled([
        left.update("org-race", "documentation-race", 1, { note: "Left" }),
        right.update("org-race", "documentation-race", 1, { note: "Right" }),
      ]);
      expect(updates.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
      const rejected = updates.find((entry) => entry.status === "rejected");
      expect(rejected).toMatchObject({ status: "rejected" });
      if (rejected?.status === "rejected") {
        expect(rejected.reason).toBeInstanceOf(TrainingDocumentationConflictError);
      }
    } finally {
      await leftConnection.client.end();
      await rightConnection.client.end();
    }

    const first = await seed.create("org-target", {
      subjectId: "athlete-target",
      sessionDate: "2026-10-27",
      sourcePlanId: "plan-a",
      sourcePlanRevision: 1,
    });
    expect(first.id).toBe("documentation-target-a");

    const duplicateService = serviceFor(requiredConnection(), [
      "documentation-target-b",
    ]);
    await expect(
      duplicateService.create("org-target", {
        subjectId: "athlete-target",
        sessionDate: "2026-10-27",
        sourcePlanId: "plan-b",
        sourcePlanRevision: 1,
      }),
    ).rejects.toBeInstanceOf(TrainingDocumentationTargetOccupiedError);
  });

  it("reads dates and timestamps independently of session formatting", async () => {
    const connection = createPostgresDatabase(isolatedDatabaseUrl);
    try {
      await connection.client.unsafe("SET DateStyle TO 'German, DMY'");
      await connection.client.unsafe("SET TIME ZONE 'Europe/Vienna'");
      const service = serviceFor(connection, ["documentation-format"]);
      const created = await service.create("org-format", {
        subjectId: "athlete-format",
        sessionDate: "2026-10-26",
        sourcePlanId: "plan-format",
        sourcePlanRevision: 1,
      });
      await expect(
        service.findCurrent("org-format", created.id),
      ).resolves.toMatchObject({
        sessionDate: "2026-10-26",
        createdAt: "2026-10-26T10:00:00.000Z",
      });
    } finally {
      await connection.client.end();
    }
  });
});

function serviceFor(
  connection: ReturnType<typeof createPostgresDatabase>,
  ids: readonly string[],
) {
  let idIndex = 0;
  let minute = 0;
  return new TrainingDocumentationService({
    repository: new PostgresTrainingDocumentationRepository({
      unsafe(query, parameters) {
        return connection.client.unsafe(query, parameters);
      },
      begin(callback) {
        return connection.client.begin(async (transaction) =>
          callback({
            unsafe(query, parameters) {
              return transaction.unsafe(query, parameters);
            },
          }),
        );
      },
    }),
    createId: () => ids[idIndex++] ?? "unused-" + String(idIndex),
    now: () =>
      new Date(
        "2026-10-26T10:" + String(minute++).padStart(2, "0") + ":00.000Z",
      ),
  });
}

function requiredConnection() {
  if (isolatedConnection === null) {
    throw new Error("Training documentation test database is unavailable.");
  }
  return isolatedConnection;
}

function databaseUrlForName(connectionString: string, databaseName: string) {
  const url = new URL(connectionString);
  url.pathname = "/" + databaseName;
  return url.toString();
}
