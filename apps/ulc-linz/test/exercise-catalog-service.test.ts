import { describe, expect, it } from "vitest";

import type { AthleteMasterdataSnapshot } from "@appbasis/athletes";

import {
  createUlcExerciseCatalogService,
  UlcExerciseCatalogGroupNotFoundError,
  type UlcExerciseCatalogRepository,
} from "../worker/exercise-catalog-service";
import type { UlcExerciseCatalogRecord } from "../worker/exercise-catalog-postgres";

const ORGANIZATION_ID = "verein-1";
const IDENTITY_ID = "identity-1";

function group(
  id: string,
  isActive = true,
  organizationId = ORGANIZATION_ID,
) {
  return {
    id,
    organizationId,
    name: id === "group-1" ? "Sprint" : "Technik",
    shortName: null,
    description: null,
    isActive,
    sortOrder: id === "group-1" ? 10 : 20,
  };
}

function snapshot(): AthleteMasterdataSnapshot {
  return {
    trainingGroups: [
      group("group-1"),
      group("group-2", false),
    ],
    athletes: [],
    trainers: [],
    athleteGroupMemberships: [],
    trainerGroupMemberships: [],
  };
}

function repository() {
  const items = new Map<string, UlcExerciseCatalogRecord>();
  const repo: UlcExerciseCatalogRepository = {
    async list() {
      return [...items.values()];
    },
    async read(_organizationId, _identityId, exerciseId) {
      return items.get(exerciseId) ?? null;
    },
    async create(item) {
      items.set(item.id, { ...item, isFavorite: false });
    },
    async update(item) {
      const favorite = items.get(item.id)?.isFavorite ?? false;
      items.set(item.id, { ...item, isFavorite: favorite });
    },
    async deactivate(_organizationId, exerciseId) {
      const item = items.get(exerciseId);
      if (item !== undefined) {
        items.set(exerciseId, { ...item, isActive: false });
      }
    },
    async setFavorite(_organizationId, _identityId, exerciseId, favorite) {
      const item = items.get(exerciseId);
      if (item !== undefined) items.set(exerciseId, { ...item, isFavorite: favorite });
    },
    async findDuplicateCandidates() {
      return [];
    },
    async listUsageSummaries() {
      return [];
    },
    async listUsage() {
      return [];
    },
    async recordUsage() {
      return undefined;
    },
    async listPrivateMedia() {
      return [];
    },
    async registerPrivateMedia() {
      return undefined;
    },
    async requestPrivateMediaDeletion() {
      return undefined;
    },
    async completePrivateMediaDeletion() {
      return false;
    },
  };
  return { repo, items };
}

describe("ULC exercise catalog service", () => {
  it("exposes only active same-organization groups in deterministic order", async () => {
    const { repo } = repository();
    const service = createUlcExerciseCatalogService({
      repository: repo,
      masterdata: { async readOrganizationSnapshot() { return snapshot(); } },
      createId: () => "exercise-1",
    });

    await expect(service.list(ORGANIZATION_ID, IDENTITY_ID)).resolves.toEqual({
      items: [],
      trainingGroups: [
        {
          id: "group-1",
          name: "Sprint",
          shortName: null,
          sortOrder: 10,
        },
      ],
    });
  });

  it("fails closed if the server-side Athletes snapshot crosses organization boundaries", async () => {
    const { repo } = repository();
    const service = createUlcExerciseCatalogService({
      repository: repo,
      masterdata: {
        async readOrganizationSnapshot() {
          return {
            ...snapshot(),
            trainingGroups: [
              ...snapshot().trainingGroups,
              group("foreign", true, "verein-2"),
            ],
          };
        },
      },
      createId: () => "exercise-1",
    });

    await expect(
      service.list(ORGANIZATION_ID, IDENTITY_ID),
    ).rejects.toThrow(/organization boundary/);
  });

  it("validates group suitability against the server-side Athletes snapshot before create", async () => {
    const { repo, items } = repository();
    const service = createUlcExerciseCatalogService({
      repository: repo,
      masterdata: { async readOrganizationSnapshot() { return snapshot(); } },
      createId: () => "exercise-1",
    });

    await expect(
      service.create(ORGANIZATION_ID, IDENTITY_ID, {
        name: "Fliegende 30",
        categoryKey: "max_velocity",
        groupIds: ["group-2"],
      }),
    ).rejects.toBeInstanceOf(UlcExerciseCatalogGroupNotFoundError);
    expect(items.size).toBe(0);

    await expect(
      service.create(ORGANIZATION_ID, IDENTITY_ID, {
        name: "Fliegende 30",
        categoryKey: "max_velocity",
        groupIds: ["group-1"],
        equipment: ["Hütchen"],
      }),
    ).resolves.toMatchObject({
      id: "exercise-1",
      organizationId: ORGANIZATION_ID,
      groupIds: ["group-1"],
      isFavorite: false,
      isActive: true,
    });
  });

  it("revalidates groups on update and keeps favorite state personal", async () => {
    const { repo } = repository();
    const service = createUlcExerciseCatalogService({
      repository: repo,
      masterdata: { async readOrganizationSnapshot() { return snapshot(); } },
      createId: () => "exercise-1",
    });

    await service.create(ORGANIZATION_ID, IDENTITY_ID, {
      name: "Sprint",
      categoryKey: "acceleration",
      groupIds: ["group-1"],
    });

    await expect(
      service.update(ORGANIZATION_ID, IDENTITY_ID, "exercise-1", {
        name: "Sprint neu",
        categoryKey: "acceleration",
        subcategory: null,
        goal: null,
        description: null,
        coachingCues: null,
        commonMistakes: null,
        equipment: [],
        videoUrl: null,
        groupIds: ["foreign"],
        parameters: [],
      }),
    ).rejects.toBeInstanceOf(UlcExerciseCatalogGroupNotFoundError);

    await expect(
      service.setFavorite(
        ORGANIZATION_ID,
        IDENTITY_ID,
        "exercise-1",
        true,
      ),
    ).resolves.toMatchObject({ isFavorite: true });
  });
});
