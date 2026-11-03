import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PostgresAthleteMasterdataRepository } from "@appbasis/athletes";
import { createPostgresDatabase } from "@appbasis/database/postgres-provisioning";
import { principalId, roleId, type PermissionStore } from "@appbasis/permissions";
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

import { type UlcLinzCurrentIdentity } from "../worker/authorization";
import {
  deleteUlcLinzAthleteSubjectDependentsAfterRetention,
  type UlcLinzAthleteSubjectDeletionDependencies,
} from "../worker/lifecycle-service";
import { trainingPlanUsageEventId } from "../worker/training-plans-service";

const databaseUrl = process.env.DATABASE_URL;
const ORG = "org-athlete-follow-up";
const OTHER_ORG = "org-elsewhere";
const SUBJECT = "athlete-retained-1";
const OTHER_SUBJECT = "athlete-keep-1";
const ADMIN = "admin-follow-up-1";
const NOW = new Date("2026-11-03T05:00:00.000Z");

function current(): UlcLinzCurrentIdentity {
  return {
    identity: {
      identityId: ADMIN,
      username: "ulc.retention.admin",
      displayName: "Retention administrator",
      contactEmail: null,
      personId: null,
      mustChangePassword: false,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      passwordChangedAt: new Date("2026-01-01T00:00:00.000Z"),
      disabledAt: null,
      accountStatus: "active",
    },
    access: "full",
    sessionToken: "test-session",
  };
}

function permissions(): PermissionStore {
  return {
    async findPrincipal(id) {
      if (id !== principalId(ADMIN)) return null;
      return {
        principalId: id,
        roleIds: [roleId("ulc-linz:admin")],
        grants: [], revokes: [],
      };
    },
    async findRole() { return null; },
    async isKnownCapability() { return false; },
  };
}

if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  describe.skip("ULC athlete post-retention dependent PostgreSQL E2E", () => {
    it("requires DATABASE_URL", () => {});
  });
} else {
  describe("ULC athlete post-retention dependent PostgreSQL E2E", () => {
    const administration = createPostgresDatabase(databaseUrl);
    const dbName = "appbasis_ulc_athlete_followup_" +
      randomUUID().replaceAll("-", "").slice(0, 12);
    const targetUrl = new URL(databaseUrl);
    targetUrl.pathname = "/" + dbName;
    let connection: ReturnType<typeof createPostgresDatabase> | null = null;
    let created = false;

    beforeAll(async () => {
      await administration.client.unsafe("CREATE DATABASE " + dbName);
      created = true;
      connection = createPostgresDatabase(targetUrl.toString());
      // Each owner owns and migrates only its own schema.
      const paths = [
        "../../../modules/athletes/migrations/0000_appbasis_athletes_foundation.sql",
        "../../../modules/athletes/migrations/0001_appbasis_athletes_deletion_markers.sql",
        "../../../modules/athletes/migrations/0002_appbasis_athlete_contacts.sql",
        "../../../modules/athletes/migrations/0003_appbasis_training_group_attendance_mode.sql",
        "../../../modules/training-plans/migrations/0000_appbasis_training_plans_foundation.sql",
        "../../../modules/training-plans/migrations/0001_appbasis_training_plan_subject_deletion.sql",
        "../../../modules/training-blocks/migrations/0000_appbasis_training_blocks_foundation.sql",
        "../../../modules/training-blocks/migrations/0001_appbasis_training_blocks_parity_metadata.sql",
        "../../../modules/training-blocks/migrations/0002_appbasis_training_block_multi_audience.sql",
        "../../../modules/training-blocks/migrations/0003_appbasis_training_block_category.sql",
        "../../../modules/training-blocks/migrations/0004_appbasis_training_block_favorite_deletion.sql",
        "../../../modules/training-blocks/migrations/0005_appbasis_training_block_usage_subject.sql",
      ];
      for (const path of paths) {
        const sql = await readFile(new URL(path, import.meta.url), "utf8");
        await required().client.unsafe(sql);
      }
    });

    afterAll(async () => {
      if (connection !== null) {
        await connection.client.end();
        connection = null;
      }
      if (created) {
        await administration.client.unsafe("DROP DATABASE " + dbName + " WITH (FORCE)");
      }
      await administration.client.end();
    });

    function required() {
      if (connection === null) throw new Error("Test database is not ready.");
      return connection;
    }

    function pgClient() {
      const client = required().client;
      const base = {
        unsafe(query: string, parameters?: (string | number | boolean | readonly string[] | null)[]) {
          return client.unsafe(query, parameters);
        },
        async begin<T>(
          callback: (transaction: { unsafe(
            query: string, parameters?: (string | number | boolean | readonly string[] | null)[]
          ): PromiseLike<readonly Record<string, unknown>[]> }) => Promise<T>,
        ): Promise<T> {
          return client.begin(async (transaction) => callback({
            unsafe(query, parameters) {
              return transaction.unsafe(query, parameters);
            },
          })) as unknown as Promise<T>;
        },
      };
      return base;
    }

    it("requires completed athlete retention, preserves other data and retries partial owner failures", async () => {
      let athleteIndex = 0;
      const athleteIds = [SUBJECT, OTHER_SUBJECT];
      const athletes = new PostgresAthleteMasterdataRepository(
        required().client, () => athleteIds[athleteIndex++]!,
      );
      const target = await athletes.createAthlete(ORG, {
        firstName: "Data", lastName: "Delete", birthYear: 2014,
      });
      const neighbor = await athletes.createAthlete(ORG, {
        firstName: "Data", lastName: "Keep", birthYear: 2012,
      });
      expect(target.id).toBe(SUBJECT);
      expect(neighbor.id).toBe(OTHER_SUBJECT);

      const plansRepository = new PostgresTrainingPlanRepository(
        pgClient() as TrainingPlanPostgresClient,
      );
      let planIndex = 0;
      const plans = new TrainingPlanService({
        repository: plansRepository,
        createId: () => ["delete-plan", "delete-plan-item", "keep-plan", "keep-item"][planIndex++]!,
        now: () => new Date("2026-10-12T12:00:00.000Z"),
      });
      const targetPlan = await plans.create(ORG, {
        subjectId: SUBJECT, planDate: "2026-10-12",
        items: [{ kind: "exercise", name: "Sensitive workout", comment: "Private note" }],
      });
      const keepPlan = await plans.create(ORG, {
        subjectId: OTHER_SUBJECT, planDate: "2026-10-12",
        items: [{ kind: "exercise", name: "Unrelated workout" }],
      });

      const blockRepository = new PostgresTrainingBlockRepository(
        pgClient() as TrainingBlockPostgresClient,
      );
      const blocks = new TrainingBlockService({
        repository: blockRepository,
        createId: () => "block-data-retention",
        now: () => new Date("2026-10-12T12:00:00.000Z"),
      });
      const block = await blocks.create(ORG, { name: "Workout block" });
      const event = (
        usageId: string, organizationId: string, subjectId: string,
      ) => ({
        event: {
          id: usageId, organizationId, blockId: block.id,
          occurredAt: "2026-10-12T12:00:00.000Z",
          sourceKind: "training_plan",
          sourceRef: targetPlan.id + ":item-1", note: null,
        },
        subjectId, sourcePlanId: targetPlan.id, sourceItemId: "item-1",
      });
      const usageTarget = event(
        await trainingPlanUsageEventId(ORG, targetPlan.id, "item-1"), ORG, SUBJECT,
      );
      const usageNeighbor = event("neighbor-usage", ORG, OTHER_SUBJECT);
      await blockRepository.recordVerifiedSubjectUsageOnce(usageTarget);
      await blockRepository.recordVerifiedSubjectUsageOnce(usageNeighbor);
      await blocks.recordUsageOnce(ORG, block.id, "legacy-unattributed", {
        occurredAt: "2026-10-12T12:00:00.000Z",
        sourceKind: "manual",
        note: "Legacy sensitive note – not attributable",
      });

      const calls: string[] = [];
      let failUsageOnce = true;
      const dependencies: UlcLinzAthleteSubjectDeletionDependencies = {
        permissions: permissions(),
        scopes: {
          async resolveMembership({ identityId, organizationId }) {
            return identityId === ADMIN && organizationId === ORG
              ? { organizationId: ORG, sourceRole: "admin", active: true }
              : null;
          },
          async hasRelation() { return false; },
        },
        athletes,
        plans: {
          async deleteSubjectData(org, subject, completed) {
            calls.push("plans");
            return plansRepository.deleteSubjectData(org, subject, completed);
          },
        },
        usage: {
          async markSubjectDeletedAndRemoveAttributedUsage(org, subject, completed) {
            calls.push("usage");
            if (failUsageOnce) {
              failUsageOnce = false;
              throw new Error("temporary usage-owner outage");
            }
            return blockRepository.markSubjectDeletedAndRemoveAttributedUsage(
              org, subject, completed,
            );
          },
        },
        now: () => NOW,
      };

      const run = () => deleteUlcLinzAthleteSubjectDependentsAfterRetention(
        current(), dependencies, { organizationId: ORG, subjectId: SUBJECT },
      );
      await expect(run()).rejects.toThrow();
      expect(calls).toEqual([]);
      await expect(athletes.deactivateAthlete(ORG, SUBJECT)).resolves.toBe(true);
      await expect(run()).rejects.toThrow();
      expect(calls).toEqual([]);
      // Backdate a DEACTIVATED test athlete so the module's real 12-month
      // retention writer produces an authoritative completed marker.
      await required().client.unsafe(
        `UPDATE appbasis_athlete SET updated_at = $3::timestamptz
         WHERE organization_id = $1 AND id = $2`,
        [ORG, SUBJECT, "2025-09-01T00:00:00.000Z"],
      );
      const purged = await athletes.purgeDeactivatedPersonalData(NOW);
      expect(purged.deletedAthletes).toBe(1);
      expect(await athletes.findCurrentAthleteDeletionMarker(ORG, SUBJECT, NOW))
        .toMatchObject({ entityType: "athlete", organizationId: ORG, entityId: SUBJECT });
      await expect(athletes.findCurrentAthleteDeletionMarker(OTHER_ORG, SUBJECT, NOW))
        .resolves.toBeNull();
      // A genuine second-owner outage is NOT a successful app-wide delete.
      await expect(run()).rejects.toThrow(/temporary usage-owner outage/);
      expect(calls).toEqual(["plans", "usage"]);
      expect(await plansRepository.findCurrent(ORG, targetPlan.id)).toBeUndefined();
      expect(await plansRepository.findCurrent(ORG, keepPlan.id)).toBeDefined();
      expect(await blockRepository.listUsageEvents(ORG, block.id)).toHaveLength(3);

      await expect(run()).resolves.toMatchObject({
        organizationId: ORG, subjectId: SUBJECT,
        deletedPlans: 0, deletedAttributedUsageEvents: 1,
        usageMarkerInserted: true,
      });
      await expect(run()).resolves.toMatchObject({
        deletedPlans: 0, deletedAttributedUsageEvents: 0,
        usageMarkerInserted: false,
      });
      const remaining = await blockRepository.listUsageEvents(ORG, block.id);
      expect(remaining.map((row) => row.id).sort())
        .toEqual(["legacy-unattributed", "neighbor-usage"]);
      await expect(blockRepository.recordVerifiedSubjectUsageOnce(usageTarget))
        .rejects.toThrow(/deletion marker/);
      const planMarkers = await required().client.unsafe(
        `SELECT completed_at FROM appbasis_training_plan_subject_deletion
         WHERE organization_id = $1 AND subject_id = $2`, [ORG, SUBJECT],
      );
      const usageMarkers = await required().client.unsafe(
        `SELECT completed_at FROM appbasis_training_block_usage_subject_deletion
         WHERE organization_id = $1 AND subject_id = $2`, [ORG, SUBJECT],
      );
      expect(planMarkers).toHaveLength(1);
      expect(usageMarkers).toHaveLength(1);
      expect(new Date(String(planMarkers[0]?.completed_at)).toISOString())
        .toBe(new Date(String(usageMarkers[0]?.completed_at)).toISOString());
      await expect(deleteUlcLinzAthleteSubjectDependentsAfterRetention(
        current(), dependencies, { organizationId: OTHER_ORG, subjectId: SUBJECT },
      )).rejects.toThrow();
    });
  });
}
