import type { AthleteMasterdataSnapshot } from "@appbasis/athletes";
import type {
  ExerciseCatalogDuplicateCandidate,
  ExerciseCatalogPrivateMedia,
  ExerciseCatalogUsageEvent,
  ExerciseCatalogUsageSummary,
  RecordExerciseCatalogUsageInput,
  RegisterExerciseCatalogPrivateMediaInput,
} from "@appbasis/exercise-catalog";

import {
  createUlcExerciseCatalogItem,
  type CreateUlcExerciseCatalogItemInput,
  type UlcExerciseCatalogItem,
} from "./exercise-catalog-domain";
import type {
  UlcExerciseCatalogRecord,
} from "./exercise-catalog-postgres";

export interface UlcExerciseCatalogRepository {
  list(
    organizationId: string,
    identityId: string,
  ): Promise<readonly UlcExerciseCatalogRecord[]>;
  read(
    organizationId: string,
    identityId: string,
    exerciseId: string,
  ): Promise<UlcExerciseCatalogRecord | null>;
  create(item: UlcExerciseCatalogItem): Promise<void>;
  update(item: UlcExerciseCatalogItem): Promise<void>;
  deactivate(organizationId: string, exerciseId: string): Promise<void>;
  setFavorite(
    organizationId: string,
    identityId: string,
    exerciseId: string,
    favorite: boolean,
  ): Promise<void>;
  findDuplicateCandidates(
    organizationId: string,
    input: CreateUlcExerciseCatalogItemInput,
    excludeExerciseId?: string | null,
  ): Promise<readonly ExerciseCatalogDuplicateCandidate[]>;
  listUsageSummaries(
    organizationId: string,
  ): Promise<readonly ExerciseCatalogUsageSummary[]>;
  listUsage(
    organizationId: string,
    exerciseId: string,
    limit?: number,
  ): Promise<readonly ExerciseCatalogUsageEvent[]>;
  recordUsage(
    organizationId: string,
    exerciseId: string,
    input: RecordExerciseCatalogUsageInput,
  ): Promise<ExerciseCatalogUsageEvent | undefined>;
  listPrivateMedia(
    organizationId: string,
    exerciseId: string,
  ): Promise<readonly ExerciseCatalogPrivateMedia[]>;
  registerPrivateMedia(
    organizationId: string,
    exerciseId: string,
    input: RegisterExerciseCatalogPrivateMediaInput,
  ): Promise<ExerciseCatalogPrivateMedia | undefined>;
  requestPrivateMediaDeletion(
    organizationId: string,
    exerciseId: string,
    mediaId: string,
  ): Promise<ExerciseCatalogPrivateMedia | undefined>;
  completePrivateMediaDeletion(
    organizationId: string,
    exerciseId: string,
    mediaId: string,
  ): Promise<boolean>;
}

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
  repository: UlcExerciseCatalogRepository;
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
    if (
      snapshot.trainingGroups.some(
        (group) => group.organizationId !== organizationId,
      )
    ) {
      throw new Error("Athletes snapshot crossed the exercise catalog organization boundary.");
    }
    const groups = snapshot.trainingGroups
      .filter((group) => group.isActive === true)
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

    findDuplicateCandidates(
      organizationId: string,
      input: CreateUlcExerciseCatalogItemInput,
      excludeExerciseId?: string | null,
    ) {
      return repository.findDuplicateCandidates(
        organizationId,
        input,
        excludeExerciseId,
      );
    },

    listUsageSummaries(organizationId: string) {
      return repository.listUsageSummaries(organizationId);
    },

    listUsage(
      organizationId: string,
      exerciseId: string,
      limit?: number,
    ) {
      return repository.listUsage(organizationId, exerciseId, limit);
    },

    recordUsage(
      organizationId: string,
      exerciseId: string,
      input: RecordExerciseCatalogUsageInput,
    ) {
      return repository.recordUsage(organizationId, exerciseId, input);
    },

    listPrivateMedia(
      organizationId: string,
      exerciseId: string,
    ) {
      return repository.listPrivateMedia(organizationId, exerciseId);
    },

    registerPrivateMedia(
      organizationId: string,
      exerciseId: string,
      input: RegisterExerciseCatalogPrivateMediaInput,
    ) {
      return repository.registerPrivateMedia(
        organizationId,
        exerciseId,
        input,
      );
    },

    requestPrivateMediaDeletion(
      organizationId: string,
      exerciseId: string,
      mediaId: string,
    ) {
      return repository.requestPrivateMediaDeletion(
        organizationId,
        exerciseId,
        mediaId,
      );
    },

    completePrivateMediaDeletion(
      organizationId: string,
      exerciseId: string,
      mediaId: string,
    ) {
      return repository.completePrivateMediaDeletion(
        organizationId,
        exerciseId,
        mediaId,
      );
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
