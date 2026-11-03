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
  const subjectMigration = await readFile(
    new URL(
      "../migrations/0001_appbasis_training_documentation_subject_deletion.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await requiredConnection().client.unsafe(subjectMigration);
});

beforeEach(async () => {
  await requiredConnection().client.unsafe(
    `TRUNCATE TABLE
       appbasis_training_documentation_revision,
       appbasis_training_documentation,
       appbasis_training_documentation_subject_deletion
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
  it("atomically deletes owned documentation and redacts matching third-party attendance in every historical revision", async () => {
    const organization = "org-privacy-delete";
    const subject = "subject-privacy-target";
    const victimName = "Sensitive Person To Remove";
    const service = serviceFor(requiredConnection(), [
      "doc-privacy-subject", "doc-privacy-other", "doc-privacy-foreign",
    ]);
    const own = await service.create(organization, {
      subjectId: subject,
      sessionDate: "2026-10-26",
      sourcePlanId: "plan-owned", sourcePlanRevision: 1,
      note: "Private owner's training note",
      attendance: [
        { participantId: subject, displayName: victimName, status: "present" },
      ],
    });
    const other = await service.create(organization, {
      subjectId: "different-athlete",
      sessionDate: "2026-10-27",
      sourcePlanId: "plan-other", sourcePlanRevision: 1,
      note: "Keep unrelated training note",
      attendance: [
        { participantId: subject, displayName: victimName, status: "present" },
        { participantId: "different-athlete", displayName: "Person Kept", status: "excused" },
      ],
    });
    await service.update(organization, other.id, 1, {
      note: "Keep newer unrelated note",
      attendance: [
        { participantId: "different-athlete", displayName: "Person Kept", status: "present" },
        { participantId: subject, displayName: victimName, status: "absent" },
      ],
    });
    const foreign = await service.create("other-organization", {
      subjectId: "different-athlete",
      sessionDate: "2026-10-27",
      sourcePlanId: "plan-foreign", sourcePlanRevision: 1,
      attendance: [
        { participantId: subject, displayName: victimName, status: "present" },
      ],
    });

    const repository = repositoryFor(requiredConnection());
    await expect(repository.inspectSubjectPrivacy(organization, subject))
      .resolves.toMatchObject({
        ownedDocuments: 1, ownedRevisions: 1,
        otherSubjectDocumentsWithParticipant: 1,
        otherSubjectRevisionsWithParticipant: 2,
      });
    const completedAt = new Date(Date.now() - 3_600_000);
    await expect(repository.removeSubjectDataAfterVerifiedDeletion(
      organization, subject, completedAt,
    )).resolves.toEqual({
      markerInserted: true,
      deletedDocuments: 1, deletedRevisions: 1,
      redactedOtherSubjectRevisions: 2,
    });
    await expect(service.findCurrent(organization, own.id)).resolves.toBeUndefined();
    await expect(repository.inspectSubjectPrivacy(organization, subject))
      .resolves.toMatchObject({
        ownedDocuments: 0, ownedRevisions: 0,
        otherSubjectDocumentsWithParticipant: 0,
        otherSubjectRevisionsWithParticipant: 0,
      });
    const historical = await service.listRevisions(organization, other.id);
    expect(historical).toHaveLength(2);
    expect(historical.every((rev) =>
      rev.attendance.length === 1 &&
      rev.attendance[0]?.participantId === "different-athlete" &&
      !JSON.stringify(rev).includes(victimName)
    )).toBe(true);
    expect(historical.map((rev) => rev.note)).toEqual([
      "Keep newer unrelated note", "Keep unrelated training note",
    ]);
    await expect(service.listRevisions("other-organization", foreign.id))
      .resolves.toMatchObject([{
        attendance: [{ participantId: subject, displayName: victimName }],
      }]);
    await expect(repository.removeSubjectDataAfterVerifiedDeletion(
      organization, subject, completedAt,
    )).resolves.toEqual({
      markerInserted: false,
      deletedDocuments: 0, deletedRevisions: 0,
      redactedOtherSubjectRevisions: 0,
    });
    // The v2 triggers block the previously live editor's stale snapshot.
    await expect(service.create(organization, {
      subjectId: subject, sessionDate: "2026-10-28",
      sourcePlanId: "plan-reborn", sourcePlanRevision: 1,
    })).rejects.toThrow(/deletion marker/i);
    await expect(service.update(organization, other.id, 2, {
      attendance: [
        { participantId: subject, displayName: victimName, status: "present" },
      ],
    })).rejects.toThrow(/deletion marker/i);
    // An unrelated athlete can still update their documentation.
    await expect(service.update(organization, other.id, 2, {
      note: "Other athlete can edit",
    })).resolves.toMatchObject({ currentRevision: 3 });
    await expect(repository.removeSubjectDataAfterVerifiedDeletion(
      organization, subject, new Date(completedAt.getTime() - 1_000),
    )).rejects.toThrow(/conflicts/i);
    await expect(repository.inspectSubjectPrivacy(organization, subject))
      .resolves.toMatchObject({
        ownedDocuments: 0, otherSubjectRevisionsWithParticipant: 0,
      });
  });

  it("rejects missing provenance, expired timestamps and stale direct SQL subject resurrection", async () => {
    const repo = repositoryFor(requiredConnection());
    const now = new Date();
    for (const date of [
      new Date(NaN),
      new Date(now.getTime() + 60_000),
      new Date(now.getTime() - 36 * 24 * 60 * 60 * 1000),
    ]) {
      await expect(repo.removeSubjectDataAfterVerifiedDeletion(
        "org-invalid", "athlete-one", date,
      )).rejects.toThrow();
    }
    await expect(repo.removeSubjectDataAfterVerifiedDeletion(
      "org-invalid", "", now,
    )).rejects.toThrow();
    const service = serviceFor(requiredConnection(), ["doc-writer-barrier"]);
    const saved = await service.create("org-direct", {
      subjectId: "other-athlete", sessionDate: "2026-10-26",
      sourcePlanId: "plan-direct", sourcePlanRevision: 1,
    });
    const removedAt = new Date(Date.now() - 3_600_000);
    await repo.removeSubjectDataAfterVerifiedDeletion(
      "org-direct", "athlete-private", removedAt,
    );
    // Even a direct database revision insert outside the application service
    // cannot reintroduce a deletion-marked participant.
    await expect(requiredConnection().client.unsafe(
      `INSERT INTO appbasis_training_documentation_revision (
          organization_id, documentation_id, revision, status, note,
          items_json, attendance_json, created_at
        ) VALUES ($1, $2, 2, 'draft', NULL, '[]'::jsonb,
          $3::jsonb, now())`,
      ["org-direct", saved.id, JSON.stringify([
        { participantId: "athlete-private", displayName: "Private", status: "present" },
      ])],
    )).rejects.toThrow(/deletion marker/i);
    await expect(service.listRevisions("org-direct", saved.id))
      .resolves.toHaveLength(1);
    await expect(repo.removeSubjectDataAfterVerifiedDeletion(
      "other-org", "athlete-private", removedAt,
    )).resolves.toMatchObject({ markerInserted: true, deletedDocuments: 0 });
  });

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

function repositoryFor(connection: ReturnType<typeof createPostgresDatabase>) {
  return new PostgresTrainingDocumentationRepository({
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
  });
}

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
