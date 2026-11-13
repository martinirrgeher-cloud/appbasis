import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createPostgresDatabase } from "@appbasis/database/postgres-provisioning";
import {
  InMemoryTrainingBlockRepository,
  PostgresTrainingBlockRepository,
  TrainingBlockConflictError,
  TrainingBlockInactiveError,
  TrainingBlockInUseError,
  TrainingBlockService,
  TrainingBlockFavoriteDeletionService,
  reconcileTrainingBlockFavoritesRestoredDatabase,
  reconcileTrainingBlockSubjectUsageRestoredDatabase,
  TrainingBlockValidationError,
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
  const migrations = await Promise.all([
    readFile(
      new URL("../migrations/0000_appbasis_training_blocks_foundation.sql", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../migrations/0001_appbasis_training_blocks_parity_metadata.sql", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../migrations/0002_appbasis_training_block_multi_audience.sql", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../migrations/0003_appbasis_training_block_category.sql", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../migrations/0004_appbasis_training_block_favorite_deletion.sql", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../migrations/0005_appbasis_training_block_usage_subject.sql", import.meta.url),
      "utf8",
    ),
  ]);
  for (const migration of migrations) {
    await requiredConnection().client.unsafe(migration);
  }
});

beforeEach(async () => {
  await requiredConnection().client.unsafe(
    `TRUNCATE TABLE
       appbasis_training_block_usage_subject_deletion,
       appbasis_training_block_usage_subject,
       appbasis_training_block_favorite_deletion,
       appbasis_training_block_usage,
       appbasis_training_block_favorite,
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

  it("inspects scoped attributable usage, not ambiguous legacy events", async () => {
    const connection = requiredConnection();
    const service = serviceFor(connection, ["inspect-subject-block"]);
    const block = await service.create("org-inspect-usage", {
      name: "Shared inspected block",
    });
    const repository = new PostgresTrainingBlockRepository(
      postgresClient(connection.client),
    );
    const makeUsage = (id: string, subjectId: string) => ({
      event: {
        id, organizationId: "org-inspect-usage", blockId: block.id,
        occurredAt: "2026-10-12T10:00:00.000Z",
        sourceKind: "training_plan", sourceRef: "plan:" + id, note: null,
      },
      subjectId, sourcePlanId: "plan", sourceItemId: id,
    });
    await repository.recordVerifiedSubjectUsageOnce(makeUsage("inspect-target", "subject-target"));
    await repository.recordVerifiedSubjectUsageOnce(makeUsage("inspect-neighbor", "subject-neighbor"));
    await service.recordUsageOnce(
      "org-inspect-usage", block.id, "inspect-legacy",
      { occurredAt: "2026-10-12T10:00:00.000Z",
        sourceKind: "manual", note: "Unattributed private legacy note" },
    );
    await expect(repository.inspectSubjectUsageDeletion(
      "org-inspect-usage", "subject-target",
    )).resolves.toEqual({
      organizationId: "org-inspect-usage", subjectId: "subject-target",
      marker: null, remainingAttributedUsageEvents: 1,
    });
    await expect(repository.inspectSubjectUsageDeletion(
      "another-org", "subject-target",
    )).resolves.toEqual({
      organizationId: "another-org", subjectId: "subject-target",
      marker: null, remainingAttributedUsageEvents: 0,
    });
    const completedAt = new Date("2026-11-03T10:00:00.000Z");
    await repository.markSubjectDeletedAndRemoveAttributedUsage(
      "org-inspect-usage", "subject-target", completedAt,
    );
    await expect(repository.inspectSubjectUsageDeletion(
      "org-inspect-usage", "subject-target",
    )).resolves.toEqual({
      organizationId: "org-inspect-usage", subjectId: "subject-target",
      marker: {
        organizationId: "org-inspect-usage", subjectId: "subject-target",
        completedAt, purgeAfter: new Date("2026-12-08T10:00:00.000Z"),
      },
      remainingAttributedUsageEvents: 0,
    });
    await expect(repository.inspectSubjectUsageDeletion(
      "org-inspect-usage", "subject-neighbor",
    )).resolves.toMatchObject({ marker: null, remainingAttributedUsageEvents: 1 });
    const remaining = await repository.listUsageEvents("org-inspect-usage", block.id);
    expect(remaining.map((item) => item.id).sort()).toEqual([
      "inspect-legacy", "inspect-neighbor",
    ]);
  });


  it("reconciles expired subject-usage tombstones into an older offline restore", async () => {
    const connection = requiredConnection();
    const service = serviceFor(connection, [
      "restore-subject-block", "restore-neighbor-block", "legacy-event",
    ]);
    await service.create("org-usage-restore", { name: "Restore block" });
    await service.create("org-other-usage", { name: "Other block" });
    const repository = new PostgresTrainingBlockRepository(
      postgresClient(connection.client),
    );
    const event = (id: string, organizationId: string, blockId: string) => ({
      event: {
        id, organizationId, blockId,
        occurredAt: "2026-10-10T12:00:00.000Z",
        sourceKind: "training_plan", sourceRef: "plan:item", note: null,
      },
      subjectId: "athlete-deleted",
      sourcePlanId: "plan",
      sourceItemId: "item",
    });
    const target = event(
      "target-usage", "org-usage-restore", "restore-subject-block",
    );
    const neighbor = {
      ...event("neighbor-usage", "org-usage-restore", "restore-subject-block"),
      subjectId: "athlete-neighbor",
    };
    const otherOrg = event(
      "other-org-usage", "org-other-usage", "restore-neighbor-block",
    );
    await repository.recordVerifiedSubjectUsageOnce(target);
    await repository.recordVerifiedSubjectUsageOnce(neighbor);
    await repository.recordVerifiedSubjectUsageOnce(otherOrg);
    await service.recordUsageOnce(
      "org-usage-restore", "restore-subject-block", "legacy-event",
      { occurredAt: target.event.occurredAt, sourceKind: "training_plan",
        sourceRef: "plan:item", note: "Ambiguous legacy personal text" },
    );

    const completedAt = new Date("2026-11-01T12:00:00.000Z");
    await expect(repository.markSubjectDeletedAndRemoveAttributedUsage(
      "org-usage-restore", "athlete-deleted", completedAt,
    )).resolves.toEqual({ markerInserted: true, deletedUsageEvents: 1 });

    // The source authority must include markers older than 35 days.
    const now = new Date("2027-01-10T12:00:00.000Z");
    const markers = await repository.listSubjectUsageDeletionMarkers(now);
    expect(markers).toEqual([{
      organizationId: "org-usage-restore",
      subjectId: "athlete-deleted",
      completedAt,
      purgeAfter: new Date("2026-12-06T12:00:00.000Z"),
    }]);

    // Simulate an offline restore from a point before the deletion.
    await connection.client.unsafe(
      `DELETE FROM appbasis_training_block_usage_subject_deletion
       WHERE organization_id = $1 AND subject_id = $2`,
      ["org-usage-restore", "athlete-deleted"],
    );
    await repository.recordVerifiedSubjectUsageOnce(target);
    const authoritative = {
      async listSubjectUsageDeletionMarkers() { return markers; },
    };
    await expect(reconcileTrainingBlockSubjectUsageRestoredDatabase(
      authoritative, repository, now,
    )).resolves.toEqual({
      requiredDeletionCount: 1, insertedMarkerCount: 1, deletedUsageEvents: 1,
    });
    await expect(reconcileTrainingBlockSubjectUsageRestoredDatabase(
      authoritative, repository, now,
    )).resolves.toEqual({
      requiredDeletionCount: 1, insertedMarkerCount: 0, deletedUsageEvents: 0,
    });
    await expect(repository.recordVerifiedSubjectUsageOnce(target))
      .rejects.toThrow(/deletion marker/);
    const remaining = await connection.client.unsafe(
      `SELECT organization_id, id FROM appbasis_training_block_usage
       ORDER BY organization_id, id`,
    );
    expect(remaining).toEqual([
      { organization_id: "org-other-usage", id: "other-org-usage" },
      { organization_id: "org-usage-restore", id: "legacy-event" },
      { organization_id: "org-usage-restore", id: "neighbor-usage" },
    ]);

    // The offline target must fail closed if it contains an independently
    // contradictory marker; never overwrite an older authorization decision.
    await connection.client.unsafe(
      `UPDATE appbasis_training_block_usage_subject_deletion
       SET completed_at = $3::timestamptz,
           purge_after = $3::timestamptz + interval '840 hours'
       WHERE organization_id = $1 AND subject_id = $2`,
      ["org-usage-restore", "athlete-deleted", "2026-11-02T12:00:00.000Z"],
    );
    await expect(repository.reconcileSubjectUsageDeletionMarker(markers[0]!))
      .rejects.toThrow(/conflicts with authoritative/);
    const state = await connection.client.unsafe(
      `SELECT completed_at FROM appbasis_training_block_usage_subject_deletion
       WHERE organization_id = $1 AND subject_id = $2`,
      ["org-usage-restore", "athlete-deleted"],
    );
    expect(new Date(String(state[0]?.completed_at)).toISOString())
      .toBe("2026-11-02T12:00:00.000Z");
  });

  it("fails closed on invalid subject usage restore authority without changing PostgreSQL", async () => {
    const repository = new PostgresTrainingBlockRepository(
      postgresClient(requiredConnection().client),
    );
    const now = new Date("2026-11-03T12:00:00.000Z");
    await expect(repository.listSubjectUsageDeletionMarkers(new Date(NaN)))
      .rejects.toThrow(/timestamp/);
    const future = {
      organizationId: "org-a",
      subjectId: "athlete-a",
      completedAt: new Date("2026-11-04T12:00:00.000Z"),
      purgeAfter: new Date("2026-12-09T12:00:00.000Z"),
    };
    await expect(reconcileTrainingBlockSubjectUsageRestoredDatabase(
      { async listSubjectUsageDeletionMarkers() { return [future]; } },
      repository, now,
    )).rejects.toThrow(/retention/);
    await expect(repository.reconcileSubjectUsageDeletionMarker({
      ...future, purgeAfter: new Date("2026-12-10T12:00:00.000Z"),
    })).rejects.toThrow(/retention/);
    const markers = await requiredConnection().client.unsafe(
      "SELECT count(*)::int AS count FROM appbasis_training_block_usage_subject_deletion",
    );
    expect(markers[0]?.count).toBe(0);
  });

  it("atomically persists exact verified subject ownership and only replays matching events", async () => {
    const connection = requiredConnection();
    const service = serviceFor(connection, ["block-verified-a", "block-verified-b", "usage-legacy"]);
    await service.create("org-verified-a", { name: "A" });
    await service.create("org-verified-b", { name: "B" });
    const repo = new PostgresTrainingBlockRepository(postgresClient(connection.client));
    const occurredAt = "2026-10-10T12:00:00.000Z";
    const event = {
      id: "usage-verified-1", organizationId: "org-verified-a",
      blockId: "block-verified-a", occurredAt,
      sourceKind: "training_plan", sourceRef: "plan-1:item-1", note: "Private data",
    };
    const input = {
      event, subjectId: "athlete-a",
      sourcePlanId: "plan-1", sourceItemId: "item-1",
    };
    await expect(repo.recordVerifiedSubjectUsageOnce(input)).resolves.toEqual(event);
    await expect(repo.recordVerifiedSubjectUsageOnce(input)).resolves.toEqual(event);
    const attributed = await connection.client.unsafe(
      `SELECT subject_id, source_plan_id, source_item_id
       FROM appbasis_training_block_usage_subject
       WHERE organization_id = $1 AND usage_id = $2`,
      ["org-verified-a", "usage-verified-1"],
    );
    expect(attributed).toEqual([{
      subject_id: "athlete-a", source_plan_id: "plan-1", source_item_id: "item-1",
    }]);
    await expect(repo.recordVerifiedSubjectUsageOnce({
      ...input, subjectId: "athlete-b",
    })).rejects.toThrow(/attribution conflicts/);
    await expect(repo.recordVerifiedSubjectUsageOnce({
      ...input, event: { ...event, note: "Altered" },
    })).rejects.toThrow(/different event/);
    await expect(repo.recordVerifiedSubjectUsageOnce({
      ...input, sourceItemId: "item-other",
    })).rejects.toThrow(/provenance/);
    await expect(repo.recordVerifiedSubjectUsageOnce({
      ...input, event: { ...event, id: "usage-missing", blockId: "unknown-block" },
    })).resolves.toBeUndefined();

    await service.recordUsageOnce("org-verified-a", "block-verified-a", "usage-legacy", {
      occurredAt, sourceKind: "training_plan", sourceRef: "plan-1:item-2",
    });
    await expect(repo.recordVerifiedSubjectUsageOnce({
      ...input, event: { ...event, id: "usage-legacy", sourceRef: "plan-1:item-2", note: null },
      sourceItemId: "item-2",
    })).rejects.toThrow(/attribution conflicts/);
    const legacy = await connection.client.unsafe(
      `SELECT count(*)::int AS count
       FROM appbasis_training_block_usage_subject
       WHERE organization_id = $1`,
      ["org-verified-a"],
    );
    expect(legacy[0]?.count).toBe(1);
  });

  it("deletes only attributed usage for the authorized subject and blocks recreation", async () => {
    const connection = requiredConnection();
    const service = serviceFor(connection, ["block-subject-a", "block-subject-b", "usage-legacy"]);
    await service.create("org-subject-a", { name: "A" });
    await service.create("org-subject-b", { name: "B" });
    const repo = new PostgresTrainingBlockRepository(postgresClient(connection.client));
    const createEvent = (id: string, organizationId: string, blockId: string) => ({
      event: {
        id, organizationId, blockId,
        occurredAt: "2026-10-10T12:00:00.000Z",
        sourceKind: "training_plan", sourceRef: "plan:item", note: null,
      },
      subjectId: "athlete-a", sourcePlanId: "plan", sourceItemId: "item",
    });
    const target = createEvent("usage-target", "org-subject-a", "block-subject-a");
    const other = {
      ...createEvent("usage-other", "org-subject-a", "block-subject-a"),
      subjectId: "athlete-b",
    };
    const otherOrganization = createEvent("usage-org-b", "org-subject-b", "block-subject-b");
    await repo.recordVerifiedSubjectUsageOnce(target);
    await repo.recordVerifiedSubjectUsageOnce(other);
    await repo.recordVerifiedSubjectUsageOnce(otherOrganization);
    await service.recordUsageOnce("org-subject-a", "block-subject-a", "usage-legacy", {
      occurredAt: "2026-10-10T12:00:00.000Z",
      sourceKind: "manual",
    });
    const when = new Date("2026-11-02T12:00:00.000Z");
    await expect(repo.markSubjectDeletedAndRemoveAttributedUsage(
      "org-subject-a", "athlete-a", when,
    )).resolves.toEqual({ markerInserted: true, deletedUsageEvents: 1 });
    await expect(repo.markSubjectDeletedAndRemoveAttributedUsage(
      "org-subject-a", "athlete-a", when,
    )).resolves.toEqual({ markerInserted: false, deletedUsageEvents: 0 });
    await expect(repo.recordVerifiedSubjectUsageOnce(target))
      .rejects.toThrow(/deletion marker/);
    const rows = await connection.client.unsafe(
      `SELECT organization_id, id FROM appbasis_training_block_usage
       ORDER BY organization_id, id`,
    );
    expect(rows).toEqual([
      { organization_id: "org-subject-a", id: "usage-legacy" },
      { organization_id: "org-subject-a", id: "usage-other" },
      { organization_id: "org-subject-b", id: "usage-org-b" },
    ]);
    const markers = await connection.client.unsafe(
      `SELECT purge_after::text AS purge_after
       FROM appbasis_training_block_usage_subject_deletion
       WHERE organization_id = $1 AND subject_id = $2`,
      ["org-subject-a", "athlete-a"],
    );
    expect(new Date(String(markers[0]?.purge_after)).toISOString())
      .toBe("2026-12-07T12:00:00.000Z");
    // Even an expired marker remains write-blocking; purge is not activated.
    await expect(repo.recordVerifiedSubjectUsageOnce({
      ...target, event: { ...target.event, id: "usage-reintroduced" },
    })).rejects.toThrow(/deletion marker/);
  });

  it("serializes a verified usage writer against subject deletion on separate connections", async () => {
    const connection = requiredConnection();
    const service = serviceFor(connection, ["block-race-subject"]);
    await service.create("org-race-subject", { name: "Racing" });
    const left = createPostgresDatabase(isolatedDatabaseUrl);
    const right = createPostgresDatabase(isolatedDatabaseUrl);
    try {
      const writer = new PostgresTrainingBlockRepository(postgresClient(left.client));
      const remover = new PostgresTrainingBlockRepository(postgresClient(right.client));
      const input = {
        event: {
          organizationId: "org-race-subject", id: "event-race-subject",
          blockId: "block-race-subject",
          occurredAt: "2026-10-10T12:00:00.000Z",
          sourceKind: "training_plan", sourceRef: "plan-race:item-race", note: null,
        },
        subjectId: "athlete-race", sourcePlanId: "plan-race", sourceItemId: "item-race",
      };
      const [wrote, deleted] = await Promise.allSettled([
        writer.recordVerifiedSubjectUsageOnce(input),
        remover.markSubjectDeletedAndRemoveAttributedUsage(
          "org-race-subject", "athlete-race", new Date("2026-11-02T12:00:00Z"),
        ),
      ]);
      expect(deleted.status).toBe("fulfilled");
      if (wrote.status === "rejected") {
        expect(String(wrote.reason)).toMatch(/deletion marker/);
      } else {
        expect(wrote.value).toEqual(input.event);
      }
      await expect(writer.recordVerifiedSubjectUsageOnce(input))
        .rejects.toThrow(/deletion marker/);
      const leftover = await connection.client.unsafe(
        `SELECT count(*)::int AS count FROM appbasis_training_block_usage
         WHERE organization_id = $1 AND id = $2`,
        ["org-race-subject", "event-race-subject"],
      );
      expect(leftover[0]?.count).toBe(0);
    } finally {
      await left.client.end();
      await right.client.end();
    }
  });

  it("reports only organization-scoped usage privacy counts without exposing personal notes", async () => {
    const service = serviceFor(requiredConnection(), [
      "block-privacy-a", "block-privacy-b",
      "usage-privacy-a1", "usage-privacy-a2",
      "usage-privacy-a3", "usage-privacy-b1",
    ]);
    await service.create("org-privacy-a", { name: "A" });
    await service.create("org-privacy-b", { name: "B" });
    await service.recordUsage("org-privacy-a", "block-privacy-a", {
      occurredAt: "2026-10-10T09:00:00.000Z",
      sourceKind: "training_plan",
      sourceRef: "plan-1:item-1",
      note: "Private athlete name in free-text note",
    });
    await service.recordUsage("org-privacy-a", "block-privacy-a", {
      occurredAt: "2026-10-10T10:00:00.000Z",
      sourceKind: "training_plan",
    });
    await service.recordUsage("org-privacy-a", "block-privacy-a", {
      occurredAt: "2026-10-10T11:00:00.000Z",
      sourceKind: "manual",
      sourceRef: "private-manual-source",
      note: "Private trainer comment",
    });
    await service.recordUsage("org-privacy-b", "block-privacy-b", {
      occurredAt: "2026-10-10T12:00:00.000Z",
      sourceKind: "training_plan",
      sourceRef: "plan-secret:item-secret",
      note: "Private cross-organization name",
    });

    const repository = new PostgresTrainingBlockRepository(
      postgresClient(requiredConnection().client),
    );
    const audit = await repository.inspectUsagePrivacy("org-privacy-a");
    expect(audit).toEqual({
      organizationId: "org-privacy-a",
      totalEvents: 3,
      trainingPlanEvents: 2,
      trainingPlanEventsWithoutReference: 1,
      otherSourceEvents: 1,
      eventsWithFreeTextNote: 2,
      eventsWithSourceReference: 2,
    });
    expect(JSON.stringify(audit)).not.toMatch(/Private|plan-1|manual-source|secret/);
    await expect(repository.inspectUsagePrivacy("org-privacy-b"))
      .resolves.toEqual({
        organizationId: "org-privacy-b",
        totalEvents: 1,
        trainingPlanEvents: 1,
        trainingPlanEventsWithoutReference: 0,
        otherSourceEvents: 0,
        eventsWithFreeTextNote: 1,
        eventsWithSourceReference: 1,
      });
    await expect(repository.inspectUsagePrivacy("org-privacy-empty"))
      .resolves.toEqual({
        organizationId: "org-privacy-empty",
        totalEvents: 0,
        trainingPlanEvents: 0,
        trainingPlanEventsWithoutReference: 0,
        otherSourceEvents: 0,
        eventsWithFreeTextNote: 0,
        eventsWithSourceReference: 0,
      });
    await expect(repository.inspectUsagePrivacy(" org-privacy-a"))
      .rejects.toThrow();
    // No reads performed through this privileged report may change the source.
    await expect(service.listUsage("org-privacy-a", "block-privacy-a"))
      .resolves.toHaveLength(3);
    await expect(service.listUsage("org-privacy-b", "block-privacy-b"))
      .resolves.toHaveLength(1);
  });

  it("inspects expired tombstones read-only and identifies residual favorites without purging", async () => {
    const connection = requiredConnection();
    const repository = new PostgresTrainingBlockRepository(postgresClient(connection.client));
    const service = serviceFor(connection, ["block-expired", "block-current"]);
    await service.create("org-expired", { name: "Expired" });
    await service.create("org-current", { name: "Current" });
    await service.setFavorite("org-expired", "principal-old", "block-expired", true);
    await service.setFavorite("org-expired", "principal-old-2", "block-expired", true);
    await service.setFavorite("org-current", "principal-fresh", "block-current", true);

    const expired = new TrainingBlockFavoriteDeletionService({
      repository, now: () => new Date("2026-09-20T12:00:00.000Z"),
    });
    const fresh = new TrainingBlockFavoriteDeletionService({
      repository, now: () => new Date("2026-11-01T12:00:00.000Z"),
    });
    await expired.deletePrincipalFavorites("org-expired", "principal-old");
    await expired.deletePrincipalFavorites("org-expired", "principal-old-2");
    await fresh.deletePrincipalFavorites("org-current", "principal-fresh");

    // Simulate corruption outside normal repository writes: the inspector must
    // report it and must never silently delete either marker or favorite.
    await connection.client.unsafe(
      `INSERT INTO appbasis_training_block_favorite
         (organization_id, principal_id, block_id)
       VALUES ($1, $2, $3)`,
      ["org-expired", "principal-old", "block-expired"],
    );
    const now = new Date("2026-11-02T12:00:00.000Z");
    const firstPage = await repository.inspectExpiredFavoriteDeletionMarkers(now, 1);
    expect(firstPage).toEqual({
      hasMore: true,
      nextCursor: {
        organizationId: "org-expired",
        principalId: "principal-old",
        purgeAfter: new Date("2026-10-25T12:00:00.000Z"),
      },
      candidates: [{
        marker: {
          organizationId: "org-expired",
          principalId: "principal-old",
          completedAt: new Date("2026-09-20T12:00:00.000Z"),
          purgeAfter: new Date("2026-10-25T12:00:00.000Z"),
        },
        hasResidualFavorites: true,
      }],
    });
    expect(firstPage.nextCursor).not.toBeNull();
    const secondPage = await repository.inspectExpiredFavoriteDeletionMarkers(
      now, 1, firstPage.nextCursor!,
    );
    expect(secondPage).toEqual({
      hasMore: false,
      nextCursor: null,
      candidates: [{
        marker: {
          organizationId: "org-expired",
          principalId: "principal-old-2",
          completedAt: new Date("2026-09-20T12:00:00.000Z"),
          purgeAfter: new Date("2026-10-25T12:00:00.000Z"),
        },
        hasResidualFavorites: false,
      }],
    });
    await expect(repository.inspectExpiredFavoriteDeletionMarkers(now, 0))
      .rejects.toThrow(/limit/);
    await expect(repository.inspectExpiredFavoriteDeletionMarkers(new Date(NaN)))
      .rejects.toThrow(/timestamp/);
    const markers = await connection.client.unsafe(
      "SELECT count(*)::int AS count FROM appbasis_training_block_favorite_deletion",
    );
    expect(markers[0]?.count).toBe(3);
    expect(await repository.listFavoriteBlockIds("org-expired", "principal-old"))
      .toEqual(["block-expired"]);
    await expect(service.setFavorite("org-expired", "principal-old", "block-expired", true))
      .rejects.toThrow(/deletion marker/);
  });

  it("replays authoritative favorite tombstones after an older restore without resurrecting preferences", async () => {
    const connection = requiredConnection();
    const repository = new PostgresTrainingBlockRepository(postgresClient(connection.client));
    const service = serviceFor(connection, ["block-restore", "block-neighbor"]);
    await service.create("org-restore", { name: "Vorlage" });
    await service.create("org-neighbor", { name: "Other organization" });
    await service.setFavorite("org-restore", "principal-a", "block-restore", true);
    await service.setFavorite("org-restore", "principal-b", "block-restore", true);
    await service.setFavorite("org-neighbor", "principal-a", "block-neighbor", true);

    const deletion = new TrainingBlockFavoriteDeletionService({
      repository,
      now: () => new Date("2026-11-01T12:00:00.000Z"),
    });
    await expect(deletion.deletePrincipalFavorites("org-restore", "principal-a"))
      .resolves.toEqual({ markerInserted: true, deletedFavorites: 1 });

    const now = new Date("2026-11-02T12:00:00.000Z");
    const authoritative = await repository.listCurrentDeletionMarkers(now);
    expect(authoritative).toEqual([
      {
        organizationId: "org-restore",
        principalId: "principal-a",
        completedAt: new Date("2026-11-01T12:00:00.000Z"),
        purgeAfter: new Date("2026-12-06T12:00:00.000Z"),
      },
    ]);

    // Simulate restoring a backup from before the deletion; the recovered DB
    // has no tombstone and contains the user's old favorite again.
    await connection.client.unsafe(
      `DELETE FROM appbasis_training_block_favorite_deletion
       WHERE organization_id = $1 AND principal_id = $2`,
      ["org-restore", "principal-a"],
    );
    await service.setFavorite("org-restore", "principal-a", "block-restore", true);
    expect(await repository.listFavoriteBlockIds("org-restore", "principal-a"))
      .toEqual(["block-restore"]);

    const source = { async listCurrentDeletionMarkers() { return authoritative; } };
    await expect(reconcileTrainingBlockFavoritesRestoredDatabase(source, repository, now))
      .resolves.toEqual({
        requiredDeletionCount: 1,
        insertedMarkerCount: 1,
        deletedFavorites: 1,
      });
    await expect(reconcileTrainingBlockFavoritesRestoredDatabase(source, repository, now))
      .resolves.toEqual({
        requiredDeletionCount: 1,
        insertedMarkerCount: 0,
        deletedFavorites: 0,
      });
    expect(await repository.listFavoriteBlockIds("org-restore", "principal-a")).toEqual([]);
    expect(await repository.listFavoriteBlockIds("org-restore", "principal-b"))
      .toEqual(["block-restore"]);
    expect(await repository.listFavoriteBlockIds("org-neighbor", "principal-a"))
      .toEqual(["block-neighbor"]);
    await expect(service.setFavorite("org-restore", "principal-a", "block-restore", true))
      .rejects.toThrow(/deletion marker/);
    expect(await service.listRevisions("org-restore", "block-restore")).toHaveLength(1);

    const conflicting = {
      ...authoritative[0]!,
      completedAt: new Date("2026-10-30T12:00:00.000Z"),
      purgeAfter: new Date("2026-12-04T12:00:00.000Z"),
    };
    await expect(repository.reconcileDeletionMarker(conflicting))
      .rejects.toThrow(/conflicts with authoritative state/);
    expect(await repository.listCurrentDeletionMarkers(now)).toEqual(authoritative);
  });

  it("persists schema-v4 categories as immutable PostgreSQL revision history independent of groups", async () => {
    const service = serviceFor(requiredConnection(), ["block-category"]);
    const created = await service.create("org-category", {
      name: "Schnelligkeit",
      audienceIds: ["group-a"],
      exercises: [],
    });
    expect(created.revision.category).toBeNull();

    const updated = await service.update("org-category", created.id, 1, {
      name: "Schnelligkeit",
      category: "Drills",
      audienceIds: ["group-a"],
      exercises: [],
    });
    expect(updated?.currentRevision).toBe(2);
    expect(updated?.revision.category).toBe("Drills");
    expect(updated?.revision.audienceIds).toEqual(["group-a"]);

    await expect(service.findRevision("org-category", created.id, 1))
      .resolves.toMatchObject({ revision: 1, category: null, audienceIds: ["group-a"] });
    await expect(service.findRevision("org-category", created.id, 2))
      .resolves.toMatchObject({ revision: 2, category: "Drills", audienceIds: ["group-a"] });
    await expect(service.findCurrent("other-org", created.id)).resolves.toBeUndefined();

    const rows = await requiredConnection().client.unsafe(
      `SELECT revision, category
         FROM appbasis_training_block_revision
        WHERE organization_id = $1 AND block_id = $2
        ORDER BY revision`,
      ["org-category", created.id],
    );
    expect(rows.map(row => ({ revision: Number(row.revision), category: row.category })))
      .toEqual([{ revision: 1, category: null }, { revision: 2, category: "Drills" }]);

    await expect(requiredConnection().client.unsafe(
      `UPDATE appbasis_training_block_revision
          SET category = ' '
        WHERE organization_id = $1 AND block_id = $2 AND revision = 2`,
      ["org-category", created.id],
    )).rejects.toThrow();
  });

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

  it("persists club-wide and multi-group audience sets without losing the compatibility audience", async () => {
    const service = serviceFor(requiredConnection(), ["block-multi"]);
    const created = await service.create("org-multi", {
      name: "Mehrgruppen",
      audienceIds: ["group-a", "group-b"],
    });
    expect(created.revision).toMatchObject({
      audienceId: "group-a",
      audienceIds: ["group-a", "group-b"],
    });

    const updated = await service.update("org-multi", "block-multi", 1, {
      name: "Vereinsweit",
      audienceIds: [],
    });
    expect(updated?.revision).toMatchObject({
      audienceId: null,
      audienceIds: [],
    });

    const rows = await requiredConnection().client.unsafe(
      `SELECT audience_id, audience_ids
       FROM appbasis_training_block_revision
       WHERE organization_id = 'org-multi'
         AND block_id = 'block-multi'
       ORDER BY revision ASC`,
    );
    expect(rows).toEqual([
      expect.objectContaining({
        audience_id: "group-a",
        audience_ids: ["group-a", "group-b"],
      }),
      expect.objectContaining({
        audience_id: null,
        audience_ids: [],
      }),
    ]);
  });

  it("reads legacy single-audience revisions whose new audience array is still null", async () => {
    const service = serviceFor(requiredConnection(), ["block-legacy"]);
    await service.create("org-legacy", {
      name: "Legacy",
      audienceId: "group-legacy",
    });
    await requiredConnection().client.unsafe(
      `UPDATE appbasis_training_block_revision
       SET audience_ids = NULL
       WHERE organization_id = 'org-legacy'
         AND block_id = 'block-legacy'
         AND revision = 1`,
    );

    await expect(
      service.findCurrent("org-legacy", "block-legacy"),
    ).resolves.toMatchObject({
      revision: {
        audienceId: "group-legacy",
        audienceIds: ["group-legacy"],
      },
    });
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
        audienceIds: Object.freeze([]),
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

  it("physically deletes only unused blocks and keeps used blocks protected", async () => {
    const service = serviceFor(requiredConnection(), [
      "block-unused",
      "block-used",
      "usage-used",
    ]);
    await service.create("org-delete", { name: "Unused" });
    await service.create("org-delete", { name: "Used" });
    await service.setFavorite(
      "org-delete",
      "principal-a",
      "block-unused",
      true,
    );
    await service.recordUsage("org-delete", "block-used", {
      occurredAt: "2026-10-10T11:00:00.000Z",
      sourceKind: "training_plan",
    });

    await expect(
      service.deleteUnused("org-delete", "block-unused", 1),
    ).resolves.toBe(true);
    await expect(
      service.findCurrent("org-delete", "block-unused"),
    ).resolves.toBeUndefined();

    const deletedCounts = await requiredConnection().client.unsafe(
      `SELECT
         (SELECT count(*)::int
            FROM appbasis_training_block
           WHERE organization_id = 'org-delete'
             AND id = 'block-unused') AS block_count,
         (SELECT count(*)::int
            FROM appbasis_training_block_revision
           WHERE organization_id = 'org-delete'
             AND block_id = 'block-unused') AS revision_count,
         (SELECT count(*)::int
            FROM appbasis_training_block_favorite
           WHERE organization_id = 'org-delete'
             AND block_id = 'block-unused') AS favorite_count`,
    );
    expect(deletedCounts[0]).toMatchObject({
      block_count: 0,
      revision_count: 0,
      favorite_count: 0,
    });

    await expect(
      service.deleteUnused("org-delete", "block-used", 1),
    ).rejects.toBeInstanceOf(TrainingBlockInUseError);
    await expect(
      service.findCurrent("org-delete", "block-used"),
    ).resolves.toBeDefined();
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

  it("deduplicates concurrent idempotent usage appends by the existing usage primary key", async () => {
    const seed = serviceFor(requiredConnection(), ["block-once"]);
    await seed.create("org-once", { name: "Idempotent" });

    const leftConnection = createPostgresDatabase(isolatedDatabaseUrl);
    const rightConnection = createPostgresDatabase(isolatedDatabaseUrl);
    try {
      const left = serviceFor(leftConnection, []);
      const right = serviceFor(rightConnection, []);
      const input = {
        occurredAt: "2026-10-10T11:00:00.000Z",
        sourceKind: "training_plan",
        sourceRef: "plan-1:item-1",
      };
      const [leftResult, rightResult] = await Promise.all([
        left.recordUsageOnce(
          "org-once",
          "block-once",
          "usage-once",
          input,
        ),
        right.recordUsageOnce(
          "org-once",
          "block-once",
          "usage-once",
          input,
        ),
      ]);
      expect(leftResult).toEqual(rightResult);
      await expect(
        seed.listUsage("org-once", "block-once"),
      ).resolves.toEqual([
        expect.objectContaining({
          id: "usage-once",
          sourceRef: "plan-1:item-1",
        }),
      ]);

      await expect(
        seed.recordUsageOnce(
          "org-once",
          "block-once",
          "usage-once",
          { ...input, sourceRef: "plan-1:item-other" },
        ),
      ).rejects.toBeInstanceOf(TrainingBlockValidationError);
    } finally {
      await leftConnection.client.end();
      await rightConnection.client.end();
    }
  });

  it("deletes only an authorized tenant/principal's favorites, never usage or revisions", async () => {
    const service = serviceFor(requiredConnection(), ["personal-block-a", "personal-block-b"]);
    await service.create("org-a", { name: "A" });
    await service.create("org-b", { name: "B" });
    await service.setFavorite("org-a", "principal-a", "personal-block-a", true);
    await service.setFavorite("org-a", "principal-b", "personal-block-a", true);
    await service.setFavorite("org-b", "principal-a", "personal-block-b", true);
    await service.recordUsage("org-a", "personal-block-a", {
      occurredAt: "2026-10-10T12:00:00.000Z",
      sourceKind: "training_plan",
    });

    const { TrainingBlockLifecycleService } = await import("../src/index");
    const privacy = new TrainingBlockLifecycleService({
      repository: new PostgresTrainingBlockRepository(postgresClient(requiredConnection().client)),
    });
    await expect(privacy.deletePrincipalFavorites("org-a", "principal-a")).resolves.toBe(1);
    await expect(privacy.deletePrincipalFavorites("org-a", "principal-a")).resolves.toBe(0);
    const rows = await requiredConnection().client.unsafe(
      `SELECT organization_id, principal_id, block_id
         FROM appbasis_training_block_favorite
        ORDER BY organization_id, principal_id, block_id`,
    );
    expect(rows).toEqual([
      { organization_id: "org-a", principal_id: "principal-b", block_id: "personal-block-a" },
      { organization_id: "org-b", principal_id: "principal-a", block_id: "personal-block-b" },
    ]);
    await expect(service.listRevisions("org-a", "personal-block-a")).resolves.toHaveLength(1);
    await expect(service.listUsage("org-a", "personal-block-a")).resolves.toHaveLength(1);
  });

  it("serializes subject deletion and later concurrent favorite creation under a marker", async () => {
    const service = serviceFor(requiredConnection(), ["favorite-lifecycle-block"]);
    await service.create("org-delete", { name: "Lauftraining" });
    await service.setFavorite("org-delete", "subject-a", "favorite-lifecycle-block", true);
    await service.setFavorite("org-delete", "subject-b", "favorite-lifecycle-block", true);
    const privacy = new TrainingBlockFavoriteDeletionService({
      repository: new PostgresTrainingBlockRepository(postgresClient(requiredConnection().client)),
      now: () => new Date("2026-11-02T19:30:00.000Z"),
    });

    await expect(privacy.deletePrincipalFavorites("org-delete", "subject-a"))
      .resolves.toEqual({ markerInserted: true, deletedFavorites: 1 });
    await expect(privacy.deletePrincipalFavorites("org-delete", "subject-a"))
      .resolves.toEqual({ markerInserted: false, deletedFavorites: 0 });
    await expect(service.setFavorite("org-delete", "subject-a", "favorite-lifecycle-block", true))
      .rejects.toThrow(/deletion marker/);
    const markers = await requiredConnection().client.unsafe(
      `SELECT organization_id, principal_id, completed_at, purge_after
       FROM appbasis_training_block_favorite_deletion
       WHERE organization_id = $1 AND principal_id = $2`,
      ["org-delete", "subject-a"],
    );
    expect(markers).toHaveLength(1);
    expect(new Date(markers[0]!.purge_after as string).getTime() -
      new Date(markers[0]!.completed_at as string).getTime())
      .toBe(35 * 24 * 60 * 60 * 1000);
    await expect(service.listOverview("org-delete", "subject-b"))
      .resolves.toEqual([expect.objectContaining({ isFavorite: true })]);
    await expect(service.listRevisions("org-delete", "favorite-lifecycle-block"))
      .resolves.toHaveLength(1);

    const left = createPostgresDatabase(isolatedDatabaseUrl);
    const right = createPostgresDatabase(isolatedDatabaseUrl);
    try {
      const writer = serviceFor(left, []);
      const deleter = new TrainingBlockFavoriteDeletionService({
        repository: new PostgresTrainingBlockRepository(postgresClient(right.client)),
        now: () => new Date("2026-11-02T19:31:00.000Z"),
      });
      await writer.setFavorite("org-delete", "subject-c", "favorite-lifecycle-block", true);
      const [newWrite] = await Promise.allSettled([
        writer.setFavorite("org-delete", "subject-c", "favorite-lifecycle-block", true),
        deleter.deletePrincipalFavorites("org-delete", "subject-c"),
      ]);
      expect(["fulfilled", "rejected"]).toContain(newWrite.status);
      await expect(writer.setFavorite("org-delete", "subject-c", "favorite-lifecycle-block", true))
        .rejects.toThrow(/deletion marker/);
      const rows = await requiredConnection().client.unsafe(
        `SELECT principal_id
         FROM appbasis_training_block_favorite
         WHERE organization_id = $1 ORDER BY principal_id`,
        ["org-delete"],
      );
      expect(rows).toEqual([{ principal_id: "subject-b" }]);
    } finally {
      await left.client.end();
      await right.client.end();
    }
  });

  it("persists principal favorites and usage summaries in the module owner", async () => {
    const service = serviceFor(requiredConnection(), [
      "block-meta",
      "usage-a",
      "usage-b",
    ]);
    await service.create("org-meta", { name: "Metadaten" });

    await expect(
      service.setFavorite("org-meta", "principal-a", "block-meta", true),
    ).resolves.toBe(true);
    await expect(
      service.listOverview("org-meta", "principal-a"),
    ).resolves.toEqual([
      expect.objectContaining({ isFavorite: true, usageCount: 0 }),
    ]);
    await expect(
      service.listOverview("org-meta", "principal-b"),
    ).resolves.toEqual([
      expect.objectContaining({ isFavorite: false, usageCount: 0 }),
    ]);

    await service.recordUsage("org-meta", "block-meta", {
      occurredAt: "2026-10-10T11:00:00.000Z",
      sourceKind: "training_plan",
      sourceRef: "plan-a",
    });
    await service.recordUsage("org-meta", "block-meta", {
      occurredAt: "2026-10-10T12:00:00.000Z",
      sourceKind: "training_plan",
    });

    await expect(
      service.findOverview("org-meta", "principal-a", "block-meta"),
    ).resolves.toMatchObject({
      isFavorite: true,
      usageCount: 2,
      lastUsedAt: "2026-10-10T12:00:00.000Z",
    });
    await expect(
      service.listUsage("org-meta", "block-meta"),
    ).resolves.toEqual([
      expect.objectContaining({ id: "usage-b" }),
      expect.objectContaining({ id: "usage-a" }),
    ]);

    const rows = await requiredConnection().client.unsafe(
      `SELECT
         (SELECT count(*)::int
            FROM appbasis_training_block_favorite
           WHERE organization_id = 'org-meta') AS favorite_count,
         (SELECT count(*)::int
            FROM appbasis_training_block_usage
           WHERE organization_id = 'org-meta') AS usage_count`,
    );
    expect(Number(rows[0]?.favorite_count)).toBe(1);
    expect(Number(rows[0]?.usage_count)).toBe(2);
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
