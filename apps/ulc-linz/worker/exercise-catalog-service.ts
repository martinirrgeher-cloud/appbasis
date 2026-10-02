import type { AthleteMasterdataSnapshot } from "@appbasis/athletes";

import {
  createUlcExerciseCatalogItem,
  type CreateUlcExerciseCatalogItemInput,
  type UlcExerciseCatalogItem,
} from "./exercise-catalog-domain";
import {
  PostgresUlcExerciseCatalogRepository,
  type UlcExerciseCatalogRecord,
} from "./exercise-catalog-postgres";

export interface UlcExerciseCatalogTrainingGroup {
  readonly id: string;
  readonly name: string;
  readonly shortName: string | null;
  readonly sortOrder: number;
}

export interface UlcExerciseCatalogOverview {
  readonly items: readonly UlcExerciseCatalogRecord[];
  readonly trainingGroups: readonly UlcExerciseCatalogTrainingGroup[];
}

export class UlcExerciseCatalogGroupNotFoundError extends Error {
  readonly code = "EXERCISE_CATALOG_GROUP_NOT_FOUND";

  constructor() {
    super("Exercise catalog training group was not found.");
    this.name = "UlcExerciseCatalogGroupNotFoundError";
  }
}

export function createUlcExerciseCatalogService({
  repository,
  masterdata,
  createId = () => crypto.randomUUID(),
}: {
  repository: PostgresUlcExerciseCatalogRepository;
  masterdata: Pick<
    {
      readOrganizationSnapshot(
        organizationId: string,
      ): Promise<AthleteMasterdataSnapshot>;
    },
    "readOrganizationSnapshot"
  >;
  createId?: () => string;
}) {
  async function activeGroups(
    organizationId: string,
  ): Promise<readonly UlcExerciseCatalogTrainingGroup[]> {
    const snapshot = await masterdata.readOrganizationSnapshot(organizationId);
    const groups = snapshot.trainingGroups
      .filter(
        (group) =>
          group.organizationId === organizationId && group.isActive === true,
      )
      .map((group) =>
        Object.freeze({
          id: group.id,
          name: group.name,
          shortName: group.shortName,
          sortOrder: group.sortOrder,
        }),
      )
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder ||
          left.name.localeCompare(right.name, "de") ||
          left.id.localeCompare(right.id),
      );
    return Object.freeze(groups);
  }

  async function normalizedForWrite(
    organizationId: string,
    exerciseId: string,
    input: CreateUlcExerciseCatalogItemInput,
  ): Promise<UlcExerciseCatalogItem> {
    const item = createUlcExerciseCatalogItem(
      { ...input, isActive: true },
      { id: exerciseId, organizationId },
    );
    const groups = await activeGroups(organizationId);
    const activeGroupIds = new Set(groups.map((group) => group.id));
    if (item.groupIds.some((groupId) => !activeGroupIds.has(groupId))) {
      throw new UlcExerciseCatalogGroupNotFoundError();
    }
    return item;
  }

  return Object.freeze({
    async list(
      organizationId: string,
      identityId: string,
    ): Promise<UlcExerciseCatalogOverview> {
      const [items, trainingGroups] = await Promise.all([
        repository.list(organizationId, identityId),
        activeGroups(organizationId),
      ]);
      return Object.freeze({
        items,
        trainingGroups,
      });
    },

    async read(
      organizationId: string,
      identityId: string,
      exerciseId: string,
    ): Promise<UlcExerciseCatalogRecord | null> {
      return repository.read(organizationId, identityId, exerciseId);
    },

    async create(
      organizationId: string,
      identityId: string,
      input: CreateUlcExerciseCatalogItemInput,
    ): Promise<UlcExerciseCatalogRecord> {
      const id = requiredGeneratedId(createId());
      const item = await normalizedForWrite(organizationId, id, input);
      await repository.create(item);
      const created = await repository.read(organizationId, identityId, id);
      if (created === null) throw new Error("Created exercise catalog item is unavailable.");
      return created;
    },

    async update(
      organizationId: string,
      identityId: string,
      exerciseId: string,
      input: CreateUlcExerciseCatalogItemInput,
    ): Promise<UlcExerciseCatalogRecord> {
      const item = await normalizedForWrite(
        organizationId,
        exerciseId,
        input,
      );
      await repository.update(item);
      const updated = await repository.read(
        organizationId,
        identityId,
        exerciseId,
      );
      if (updated === null) throw new Error("Updated exercise catalog item is unavailable.");
      return updated;
    },

    deactivate(
      organizationId: string,
      exerciseId: string,
    ): Promise<void> {
      return repository.deactivate(organizationId, exerciseId);
    },

    async setFavorite(
      organizationId: string,
      identityId: string,
      exerciseId: string,
      favorite: boolean,
    ): Promise<UlcExerciseCatalogRecord> {
      await repository.setFavorite(
        organizationId,
        identityId,
        exerciseId,
        favorite,
      );
      const item = await repository.read(
        organizationId,
        identityId,
        exerciseId,
      );
      if (item === null) throw new Error("Favorited exercise catalog item is unavailable.");
      return item;
    },
  });
}

function requiredGeneratedId(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 200 ||
    value.trim() !== value
  ) {
    throw new Error("Generated exercise catalog id is invalid.");
  }
  return value;
}
