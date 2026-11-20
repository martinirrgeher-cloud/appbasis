import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createPostgresDatabase } from "@appbasis/database/postgres-provisioning";
import {
  PostgresTrainingBlockRepository,
  TrainingBlockService,
  type TrainingBlockPostgresClient,
} from "@appbasis/training-blocks";
import {
  PostgresTrainingPlanRepository,
  TrainingPlanService,
  type TrainingPlanPostgresClient,
} from "@appbasis/training-plans";

import { createUlcTrainingPlanVerifiedUsageBooking } from "../worker/training-plan-verified-usage-booking";
import { trainingPlanUsageEventId } from "../worker/training-plans-service";

/**
 * P2-D owner integration test. All writes are to a fresh synthetic ephemeral
 * PostgreSQL database, NEVER Neon/Preview/production.
 */
const DATABASE_URL = process.env.DATABASE_URL;
const ORG = "p02-d-organization";
const OTHER_ORG = "p02-d-other-organization";
const SUBJECT = "p02-d-athlete";
const BLOCK = "p02-d-block";
const PLAN = "p02-d-plan";
const ITEM = "p02-d-item";

type Connection = ReturnType<typeof createPostgresDatabase>;
let admin: Connection | null = null;
let isolated: Connection | null = null;
let created = false;
const name = "ulc_p02_d_" + randomUUID().replaceAll("-", "").slice(0, 16);
const url = DATABASE_URL ? new URL(DATABASE_URL) : null;
if (url) url.pathname = "/" + name;

function db(): Connection {
  if (isolated === null) throw new Error("Isolated P2-D database not initialized.");
  return isolated;
}

function planClient(connection: Connection): TrainingPlanPostgresClient {
  return {
    unsafe(query, params) {
      return connection.client.unsafe(query, params);
    },
    async begin(callback) {
      return connection.client.begin(async (tx) =>
        callback({ unsafe(query, params) { return tx.unsafe(query, params); } }),
      );
    },
  };
}

function blockClient(connection: Connection): TrainingBlockPostgresClient {
  return {
    unsafe(query, params) {
      return connection.client.unsafe(query, params);
    },
    async begin(callback) {
      return connection.client.begin(async (tx) =>
        callback({ unsafe(query, params) { return tx.unsafe(query, params); } }),
      );
    },
  };
}

if (!DATABASE_URL || !url) {
  describe.skip("P2-D verified block usage recovery PostgreSQL E2E", () => {
    it("requires DATABASE_URL for the isolated PostgreSQL test", () => {});
  });
} else {
  beforeAll(async () => {
    admin = createPostgresDatabase(DATABASE_URL);
    await admin.client.unsafe("CREATE DATABASE " + name);
    created = true;
    isolated = createPostgresDatabase(url.toString());
    for (const file of [
      "../../../modules/training-blocks/migrations/0000_appbasis_training_blocks_foundation.sql",
      "../../../modules/training-blocks/migrations/0001_appbasis_training_blocks_parity_metadata.sql",
      "../../../modules/training-blocks/migrations/0002_appbasis_training_block_multi_audience.sql",
      "../../../modules/training-blocks/migrations/0003_appbasis_training_block_category.sql",
      "../../../modules/training-blocks/migrations/0004_appbasis_training_block_favorite_deletion.sql",
      "../../../modules/training-blocks/migrations/0005_appbasis_training_block_usage_subject.sql",
      "../../../modules/training-plans/migrations/0000_appbasis_training_plans_foundation.sql",
      "../../../modules/training-plans/migrations/0001_appbasis_training_plan_subject_deletion.sql",
    ]) {
      const migration = await readFile(new URL(file, import.meta.url), "utf8");
      await db().client.unsafe(migration);
    }
  });

  beforeEach(async () => {
    await db().client.unsafe(`
      TRUNCATE TABLE
        appbasis_training_block_usage_subject_deletion,
        appbasis_training_block_usage_subject,
        appbasis_training_block_usage,
        appbasis_training_block_favorite_deletion,
        appbasis_training_block_favorite,
        appbasis_training_block_revision_item_parameter,
        appbasis_training_block_revision_item,
        appbasis_training_block_revision,
        appbasis_training_block,
        appbasis_training_plan_revision_item,
        appbasis_training_plan_revision,
        appbasis_training_plan,
        appbasis_training_plan_subject_deletion
      CASCADE
    `);
  });

  afterAll(async () => {
    if (isolated !== null) {
      await isolated.client.end();
      isolated = null;
    }
    if (created && admin !== null) {
      await admin.client.unsafe("DROP DATABASE " + name + " WITH (FORCE)");
    }
    if (admin !== null) {
      await admin.client.end();
      admin = null;
    }
  });

  async function seeded() {
    const planRepo = new PostgresTrainingPlanRepository(planClient(db()));
    const blockRepo = new PostgresTrainingBlockRepository(blockClient(db()));
    const blocks = new TrainingBlockService({
      repository: blockRepo,
      createId: () => BLOCK,
      now: () => new Date("2026-10-12T09:00:00.000Z"),
    });
    await blocks.create(ORG, { name: "Synthetic verified sprint block" });
    let nextId = 0;
    let tick = 0;
    const plans = new TrainingPlanService({
      repository: planRepo,
      createId: () => [PLAN, ITEM][nextId++] ?? "generated-" + nextId,
      now: () => new Date(Date.UTC(2026, 9, 12, 10 + tick++)),
    });
    const saved = await plans.create(ORG, {
      subjectId: SUBJECT,
      planDate: "2026-10-12",
      items: [{
        kind: "block",
        sourceBlockId: BLOCK,
        sourceBlockRevision: 1,
        name: "Sprint block",
        exercises: [],
      }],
    });
    expect(saved.revision.items[0]).toMatchObject({
      kind: "block",
      itemId: ITEM,
      sourceBlockId: BLOCK,
    });
    const book = createUlcTrainingPlanVerifiedUsageBooking({
      plans: planRepo,
      usage: blockRepo,
    });
    return { saved, plans, book, blockRepo, planRepo };
  }

  async function counts(organizationId: string = ORG) {
    const rows = await db().client.unsafe(`
      SELECT
        (SELECT count(*)::int FROM appbasis_training_block_usage
         WHERE organization_id = $1) AS events,
        (SELECT count(*)::int FROM appbasis_training_block_usage_subject
         WHERE organization_id = $1) AS subjects
    `, [organizationId]);
    return { events: Number(rows[0]?.events), subjects: Number(rows[0]?.subjects) };
  }

  describe("P2-D verified block usage recovery PostgreSQL E2E", () => {
    it("books once under parallel retries and never changes event identity on a later autosave", async () => {
      const h = await seeded();
      const [one, two, three] = await Promise.all([
        h.book.book(ORG, h.saved, ITEM),
        h.book.book(ORG, h.saved, ITEM),
        h.book.book(ORG, h.saved, ITEM),
      ]);
      expect(one).toEqual(two);
      expect(two).toEqual(three);
      expect(one.id).toBe(await trainingPlanUsageEventId(ORG, PLAN, ITEM));
      expect(one.occurredAt).toBe(h.saved.revision.createdAt);
      expect(await counts()).toEqual({ events: 1, subjects: 1 });

      const latest = await h.plans.update(ORG, PLAN, 1, {
        note: "Changed after first usage",
        items: [{
          kind: "block",
          itemId: ITEM,
          sourceBlockId: BLOCK,
          sourceBlockRevision: 1,
          name: "Sprint block renamed",
          exercises: [],
        }],
      });
      expect(latest).toMatchObject({ currentRevision: 2 });
      if (!latest) throw new Error("Updated plan is missing.");
      await expect(h.book.book(ORG, h.saved, ITEM)).rejects.toThrow(/stale/);
      const replay = await h.book.book(ORG, latest, ITEM);
      expect(replay).toEqual(one);
      expect(await counts()).toEqual({ events: 1, subjects: 1 });
    });

    it("finishes a saved but initially unbooked plan and never revives usage after subject deletion", async () => {
      const h = await seeded();
      expect(await counts()).toEqual({ events: 0, subjects: 0 });
      // Crash/permission failure after plan persistence: re-reading the
      // exact current plan and retrying the deterministic event is safe.
      const current = await h.planRepo.findCurrent(ORG, PLAN);
      expect(current).toEqual(h.saved);
      const booked = await h.book.book(ORG, current!, ITEM);
      expect(await counts()).toEqual({ events: 1, subjects: 1 });
      await expect(h.book.book(OTHER_ORG, current!, ITEM))
        .rejects.toThrow(/scope/);

      await h.blockRepo.markSubjectDeletedAndRemoveAttributedUsage(
        ORG, SUBJECT, new Date("2026-11-19T12:00:00.000Z"),
      );
      expect(await counts()).toEqual({ events: 0, subjects: 0 });
      await expect(h.book.book(ORG, current!, ITEM))
        .rejects.toThrow(/deletion marker/);
      expect(booked.id).toBe(await trainingPlanUsageEventId(ORG, PLAN, ITEM));
      expect(await counts()).toEqual({ events: 0, subjects: 0 });
    });
  });
}
