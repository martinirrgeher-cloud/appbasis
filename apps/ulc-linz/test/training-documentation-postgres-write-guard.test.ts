import { describe, expect, it } from "vitest";

import {
  PostgresTrainingDocumentationRepository,
  type TrainingDocumentationSnapshot,
} from "@appbasis/training-documentation";
import {
  assertUlcLiveTrainingDocumentationActor,
  UlcTrainingDocumentationActorWriteBlockedError,
} from "../worker/training-documentation-write-actor";

const NOW = "2026-11-21T08:00:00.000Z";
const ROOT: TrainingDocumentationSnapshot = {
  id: "documentation-1",
  organizationId: "ulc-test",
  subjectId: "athlete-1",
  sessionDate: "2026-11-21",
  sourcePlanId: "plan-1",
  sourcePlanRevision: 1,
  currentRevision: 1,
  status: "draft",
  completedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
  revision: {
    organizationId: "ulc-test",
    documentationId: "documentation-1",
    revision: 1,
    status: "draft",
    note: null,
    items: [],
    attendance: [],
    completedAt: null,
    createdAt: NOW,
  },
};

function harness() {
  const statements: string[] = [];
  let transactionCount = 0;
  const sql = {
    async unsafe(query: string) {
      statements.push(query);
      if (query.startsWith("SELECT pg_advisory_xact_lock")) return [];
      if (query.includes("FROM appbasis_training_documentation") &&
          query.includes("FOR UPDATE")) return [{ subject_id: ROOT.subjectId }];
      throw new Error("A protected document mutation reached unapproved SQL.");
    },
  };
  const client = {
    unsafe: sql.unsafe,
    async begin<T>(callback: (transaction: typeof sql) => Promise<T>): Promise<T> {
      transactionCount++;
      return callback(sql);
    },
  };
  const repository = new PostgresTrainingDocumentationRepository(client, {
    writeGuard: assertUlcLiveTrainingDocumentationActor,
  });
  return { repository, statements, transactionCount: () => transactionCount };
}

describe("P03 document writes cannot bypass transaction-locked actor authority", () => {
  it("rejects an INSERT without trusted actor before touching a document table", async () => {
    const f = harness();
    await expect(f.repository.create(ROOT))
      .rejects.toBeInstanceOf(UlcTrainingDocumentationActorWriteBlockedError);
    expect(f.transactionCount()).toBe(1);
    expect(f.statements).toHaveLength(1);
    expect(f.statements[0]).toContain("pg_advisory_xact_lock");
  });

  it("rejects a stale revision actor after locking the exact document row, before any revision INSERT", async () => {
    const f = harness();
    await expect(f.repository.appendRevision(
      ROOT.organizationId,
      ROOT.id,
      1,
      { ...ROOT.revision, revision: 2 },
    )).rejects.toBeInstanceOf(UlcTrainingDocumentationActorWriteBlockedError);
    expect(f.transactionCount()).toBe(1);
    expect(f.statements).toHaveLength(2);
    expect(f.statements[0]).toContain("pg_advisory_xact_lock");
    expect(f.statements[1]).toContain("FOR UPDATE");
    expect(f.statements[1]).toContain("appbasis_training_documentation");
  });
});
