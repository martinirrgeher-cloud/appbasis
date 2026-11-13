import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresDatabase } from "@appbasis/database/postgres-provisioning";
import {
  PostgresTrainingBlockRepository,
  TrainingBlockService,
  reconcileTrainingBlockSubjectUsageRestoredDatabase,
  type TrainingBlockPostgresClient,
} from "../src/index";

/**
 * P02-C: independent isolated PostgreSQL proof. We deliberately do NOT edit
 * test/postgres-repository.postgres.e2e.ts because it is pinned by the
 * canonical production evidence contract.
 *
 * These are frozen/synthetic databases only; no live recovery is activated.
 */
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for P02-C PostgreSQL E2E.");

const administrator = createPostgresDatabase(databaseUrl);
const name = "appbasis_p02c_" + randomUUID().replaceAll("-", "").slice(0, 18);
const restoredUrl = new URL(databaseUrl);
restoredUrl.pathname = "/" + name;
let isolated: ReturnType<typeof createPostgresDatabase> | null = null;
let databaseCreated = false;

function required() {
  if (isolated === null) throw new Error("Isolated P02-C database is not ready.");
  return isolated;
}

function repoClient(): TrainingBlockPostgresClient {
  const client = required().client;
  return {
    unsafe(sql, parameters) { return client.unsafe(sql, parameters); },
    async begin(callback) {
      return client.begin(async (tx) =>
        callback({ unsafe(sql, parameters) { return tx.unsafe(sql, parameters); } }),
      );
    },
  };
}

beforeAll(async () => {
  await administrator.client.unsafe("CREATE DATABASE " + name);
  databaseCreated = true;
  isolated = createPostgresDatabase(restoredUrl.toString());
  const paths = [
    "../migrations/0000_appbasis_training_blocks_foundation.sql",
    "../migrations/0001_appbasis_training_blocks_parity_metadata.sql",
    "../migrations/0002_appbasis_training_block_multi_audience.sql",
    "../migrations/0003_appbasis_training_block_category.sql",
    "../migrations/0004_appbasis_training_block_favorite_deletion.sql",
    "../migrations/0005_appbasis_training_block_usage_subject.sql",
  ];
  for (const path of paths) {
    await required().client.unsafe(await readFile(new URL(path, import.meta.url), "utf8"));
  }
});

afterAll(async () => {
  if (isolated) {
    await isolated.client.end();
    isolated = null;
  }
  if (databaseCreated) {
    await administrator.client.unsafe("DROP DATABASE " + name + " WITH (FORCE)");
  }
  await administrator.client.end();
});

describe("ULC P02-C offline cross-organization subject-usage restore", () => {
  it("replays one expired subject marker without deleting the same ID in another organization", async () => {
    let sequence = 0;
    const service = new TrainingBlockService({
      repository: new PostgresTrainingBlockRepository(repoClient()),
      createId: () => ["p02-c-block-a", "p02-c-block-b"][sequence++] ?? "unexpected-id",
      now: () => new Date("2026-10-10T12:00:00.000Z"),
    });
    const blockA = await service.create("p02-c-org-a", { name: "Shared subject org A" });
    const blockB = await service.create("p02-c-org-b", { name: "Shared subject org B" });
    expect(blockA.id).toBe("p02-c-block-a");
    expect(blockB.id).toBe("p02-c-block-b");

    const repository = new PostgresTrainingBlockRepository(repoClient());
    const event = (id: string, org: string, block: string, subject: string) => ({
      event: {
        id, organizationId: org, blockId: block,
        occurredAt: "2026-10-10T12:00:00.000Z",
        sourceKind: "training_plan", sourceRef: "plan:" + id, note: null,
      },
      subjectId: subject, sourcePlanId: "plan", sourceItemId: id,
    });
    const target = event("p02-c-deleted", "p02-c-org-a", blockA.id, "same-athlete-id");
    const otherOrg = event("p02-c-other-org", "p02-c-org-b", blockB.id, "same-athlete-id");
    const neighbor = event("p02-c-neighbor", "p02-c-org-a", blockA.id, "other-athlete-id");
    await repository.recordVerifiedSubjectUsageOnce(target);
    await repository.recordVerifiedSubjectUsageOnce(otherOrg);
    await repository.recordVerifiedSubjectUsageOnce(neighbor);
    await service.recordUsageOnce("p02-c-org-a", blockA.id, "p02-c-legacy", {
      occurredAt: target.event.occurredAt,
      sourceKind: "training_plan", sourceRef: "plan:p02-c-deleted",
      note: "Unknown historical owner - not safe to attribute or erase",
    });

    const completedAt = new Date("2026-11-01T12:00:00.000Z");
    await expect(repository.markSubjectDeletedAndRemoveAttributedUsage(
      "p02-c-org-a", "same-athlete-id", completedAt,
    )).resolves.toEqual({ markerInserted: true, deletedUsageEvents: 1 });
    const afterExpiry = new Date("2027-01-10T12:00:00.000Z");
    const authoritative = await repository.listSubjectUsageDeletionMarkers(afterExpiry);
    expect(authoritative).toEqual([{
      organizationId: "p02-c-org-a", subjectId: "same-athlete-id",
      completedAt,
      purgeAfter: new Date("2026-12-06T12:00:00.000Z"),
    }]);

    // Simulate an older frozen restore target: the subject's row and
    // attribution exist but its deletion marker did not survive the snapshot.
    await required().client.unsafe(
      `DELETE FROM appbasis_training_block_usage_subject_deletion
       WHERE organization_id = $1 AND subject_id = $2`,
      ["p02-c-org-a", "same-athlete-id"],
    );
    await repository.recordVerifiedSubjectUsageOnce(target);
    const source = {
      async listSubjectUsageDeletionMarkers() { return authoritative; },
    };
    await expect(reconcileTrainingBlockSubjectUsageRestoredDatabase(
      source, repository, afterExpiry,
    )).resolves.toEqual({
      requiredDeletionCount: 1, insertedMarkerCount: 1, deletedUsageEvents: 1,
    });
    await expect(reconcileTrainingBlockSubjectUsageRestoredDatabase(
      source, repository, afterExpiry,
    )).resolves.toEqual({
      requiredDeletionCount: 1, insertedMarkerCount: 0, deletedUsageEvents: 0,
    });

    const remaining = await required().client.unsafe(
      `SELECT organization_id, id, note
       FROM appbasis_training_block_usage ORDER BY organization_id, id`,
    );
    expect(remaining).toEqual([
      {
        organization_id: "p02-c-org-a", id: "p02-c-legacy",
        note: "Unknown historical owner - not safe to attribute or erase",
      },
      { organization_id: "p02-c-org-a", id: "p02-c-neighbor", note: null },
      { organization_id: "p02-c-org-b", id: "p02-c-other-org", note: null },
    ]);
    await expect(repository.recordVerifiedSubjectUsageOnce(target))
      .rejects.toThrow(/deletion marker/);
    await expect(repository.inspectSubjectUsageDeletion(
      "p02-c-org-b", "same-athlete-id",
    )).resolves.toMatchObject({
      marker: null, remainingAttributedUsageEvents: 1,
    });
    // The preserved legacy text is still a PRIVACY BLOCKER, not a success.
  });
});
