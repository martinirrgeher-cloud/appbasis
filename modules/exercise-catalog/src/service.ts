import {
  ExerciseCatalogValidationError,
  assertExerciseCatalogDefinition,
} from "./domain/catalog";
import { createExerciseCatalogItem } from "./domain/item";
import type {
  CreateExerciseCatalogItemInput,
  ExerciseCatalogDefinition,
  ExerciseCatalogDuplicateCandidate,
  ExerciseCatalogItem,
  ExerciseCatalogPrivateMedia,
  ExerciseCatalogUsageEvent,
  ExerciseCatalogUsageSummary,
  RecordExerciseCatalogUsageInput,
  RegisterExerciseCatalogPrivateMediaInput,
} from "./domain/types";
import {
  requiredIdentifier,
  requiredKey,
  requiredText,
} from "./domain/validation";
import type { ExerciseCatalogRepository } from "./repository";

export type UpdateExerciseCatalogItemInput =
  Partial<CreateExerciseCatalogItemInput>;

export interface ExerciseCatalogItemView {
  readonly item: ExerciseCatalogItem;
  readonly isFavorite: boolean;
}

export interface ExerciseCatalogServiceOptions {
  readonly repository: ExerciseCatalogRepository;
  readonly definition: ExerciseCatalogDefinition;
  readonly createId?: () => string;
}

export class ExerciseCatalogService {
  readonly #repository: ExerciseCatalogRepository;
  readonly #definition: ExerciseCatalogDefinition;
  readonly #createId: () => string;

  constructor(options: ExerciseCatalogServiceOptions) {
    if (
      options === null ||
      typeof options !== "object" ||
      Array.isArray(options) ||
      options.repository === null ||
      typeof options.repository !== "object"
    ) {
      throw new ExerciseCatalogValidationError(
        "Exercise catalog service options are invalid.",
      );
    }
    this.#repository = options.repository;
    this.#definition = assertExerciseCatalogDefinition(options.definition);
    this.#createId = options.createId ?? (() => crypto.randomUUID());
  }

  get definition(): ExerciseCatalogDefinition {
    return this.#definition;
  }

  async list(
    organizationId: string,
    principalId?: string | null,
  ): Promise<readonly ExerciseCatalogItemView[]> {
    const organization = requiredIdentifier(
      organizationId,
      "Organization id",
    );
    const principal = optionalPrincipalId(principalId);
    const snapshot =
      principal === null
        ? Object.freeze({
            items: await this.#repository.listItems(organization),
            favoriteExerciseIds: Object.freeze([] as string[]),
          })
        : await this.#repository.listItemsWithFavorites(
            organization,
            principal,
          );
    const storedItems = snapshot.items;
    const favoriteIds = snapshot.favoriteExerciseIds;

    const items = storedItems.map((item) =>
      this.#normalizePersistedItem(item, organization),
    );
    const ids = new Set(items.map((item) => item.id));
    for (const favoriteId of favoriteIds) {
      if (!ids.has(favoriteId)) {
        throw new Error(
          "Exercise catalog favorite references an unknown item.",
        );
      }
    }
    const favorites = new Set(favoriteIds);
    return Object.freeze(
      items.map((item) =>
        Object.freeze({
          item,
          isFavorite: favorites.has(item.id),
        }),
      ),
    );
  }

  async findById(
    organizationId: string,
    exerciseId: string,
    principalId?: string | null,
  ): Promise<ExerciseCatalogItemView | undefined> {
    const organization = requiredIdentifier(
      organizationId,
      "Organization id",
    );
    const id = requiredIdentifier(exerciseId, "Exercise id");
    const principal = optionalPrincipalId(principalId);
    const stored = await this.#repository.findItemById(organization, id);
    if (stored === undefined) return undefined;
    const item = this.#normalizePersistedItem(stored, organization);
    const favoriteIds =
      principal === null
        ? []
        : await this.#repository.listFavoriteExerciseIds(
            organization,
            principal,
          );
    return Object.freeze({
      item,
      isFavorite: favoriteIds.includes(item.id),
    });
  }

  async create(
    organizationId: string,
    input: CreateExerciseCatalogItemInput,
  ): Promise<ExerciseCatalogItem> {
    const organization = requiredIdentifier(
      organizationId,
      "Organization id",
    );
    const id = requiredIdentifier(this.#createId(), "Generated exercise id");
    const item = createExerciseCatalogItem(input, {
      id,
      organizationId: organization,
      definition: this.#definition,
    });
    const stored = await this.#repository.createItem(item);
    return this.#normalizePersistedItem(stored, organization);
  }

  async update(
    organizationId: string,
    exerciseId: string,
    input: UpdateExerciseCatalogItemInput,
  ): Promise<ExerciseCatalogItem | undefined> {
    const organization = requiredIdentifier(
      organizationId,
      "Organization id",
    );
    const id = requiredIdentifier(exerciseId, "Exercise id");
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      throw new ExerciseCatalogValidationError(
        "Exercise catalog update input is invalid.",
      );
    }

    const stored = await this.#repository.updateItemFromCurrent(
      organization,
      id,
      (current) => {
        const normalizedCurrent = this.#normalizePersistedItem(
          current,
          organization,
        );
        return createExerciseCatalogItem(
          mergeUpdateInput(normalizedCurrent, input),
          {
            id,
            organizationId: organization,
            definition: this.#definition,
          },
        );
      },
    );
    if (stored === undefined) return undefined;
    return this.#normalizePersistedItem(stored, organization);
  }

  async deactivate(
    organizationId: string,
    exerciseId: string,
  ): Promise<ExerciseCatalogItem | undefined> {
    return this.update(organizationId, exerciseId, { isActive: false });
  }

  async findDuplicateCandidates(
    organizationId: string,
    input: CreateExerciseCatalogItemInput,
    excludeExerciseId?: string | null,
  ): Promise<readonly ExerciseCatalogDuplicateCandidate[]> {
    const organization = requiredIdentifier(
      organizationId,
      "Organization id",
    );
    const exclude =
      excludeExerciseId === undefined || excludeExerciseId === null
        ? null
        : requiredIdentifier(excludeExerciseId, "Exercise id");
    const probe = createExerciseCatalogItem(input, {
      id: exclude ?? "duplicate-probe",
      organizationId: organization,
      definition: this.#definition,
    });
    const candidates = await this.#repository.listItems(organization);
    return Object.freeze(
      candidates
        .filter((candidate) => candidate.id !== exclude)
        .map((candidate) =>
          duplicateCandidate(probe, this.#normalizePersistedItem(candidate, organization)),
        )
        .filter(
          (
            candidate,
          ): candidate is ExerciseCatalogDuplicateCandidate =>
            candidate !== null,
        )
        .sort(
          (left, right) =>
            right.score - left.score ||
            left.name.localeCompare(right.name, "de") ||
            left.exerciseId.localeCompare(right.exerciseId),
        )
        .slice(0, 10),
    );
  }

  async listUsageSummaries(
    organizationId: string,
  ): Promise<readonly ExerciseCatalogUsageSummary[]> {
    const organization = requiredIdentifier(
      organizationId,
      "Organization id",
    );
    return this.#repository.listUsageSummaries(organization);
  }

  async listUsage(
    organizationId: string,
    exerciseId: string,
    limit = 50,
  ): Promise<readonly ExerciseCatalogUsageEvent[]> {
    const organization = requiredIdentifier(
      organizationId,
      "Organization id",
    );
    const id = requiredIdentifier(exerciseId, "Exercise id");
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
      throw new ExerciseCatalogValidationError(
        "Exercise usage limit is invalid.",
      );
    }
    return this.#repository.listUsageEvents(organization, id, limit);
  }

  async recordUsage(
    organizationId: string,
    exerciseId: string,
    input: RecordExerciseCatalogUsageInput,
  ): Promise<ExerciseCatalogUsageEvent | undefined> {
    const organization = requiredIdentifier(
      organizationId,
      "Organization id",
    );
    const id = requiredIdentifier(exerciseId, "Exercise id");
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      throw new ExerciseCatalogValidationError(
        "Exercise usage input is invalid.",
      );
    }
    const item = await this.#repository.findItemById(organization, id);
    if (item === undefined) return undefined;
    this.#normalizePersistedItem(item, organization);
    const event = Object.freeze({
      id: requiredIdentifier(this.#createId(), "Generated usage id"),
      organizationId: organization,
      exerciseId: id,
      occurredAt: normalizedIsoTimestamp(input.occurredAt),
      sourceKind: requiredKey(input.sourceKind, "Exercise usage source kind"),
      sourceRef: optionalBoundedText(
        input.sourceRef,
        "Exercise usage source reference",
        500,
      ),
      note: optionalBoundedText(input.note, "Exercise usage note", 2_000),
    });
    await this.#repository.recordUsage(event);
    return event;
  }

  async listPrivateMedia(
    organizationId: string,
    exerciseId: string,
  ): Promise<readonly ExerciseCatalogPrivateMedia[]> {
    const organization = requiredIdentifier(
      organizationId,
      "Organization id",
    );
    const id = requiredIdentifier(exerciseId, "Exercise id");
    return this.#repository.listPrivateMedia(organization, id);
  }

  async registerPrivateMedia(
    organizationId: string,
    exerciseId: string,
    input: RegisterExerciseCatalogPrivateMediaInput,
  ): Promise<ExerciseCatalogPrivateMedia | undefined> {
    const organization = requiredIdentifier(
      organizationId,
      "Organization id",
    );
    const exercise = requiredIdentifier(exerciseId, "Exercise id");
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      throw new ExerciseCatalogValidationError(
        "Exercise private media input is invalid.",
      );
    }
    const item = await this.#repository.findItemById(organization, exercise);
    if (item === undefined) return undefined;
    this.#normalizePersistedItem(item, organization);
    const sizeBytes = requiredIntegerInRange(
      input.sizeBytes,
      "Exercise private media size",
      1,
      500 * 1024 * 1024,
    );
    const media = Object.freeze({
      id: requiredIdentifier(input.id, "Exercise private media id"),
      organizationId: organization,
      exerciseId: exercise,
      fileName: requiredText(
        input.fileName,
        "Exercise private media file name",
        1,
        255,
      ),
      storageKey: requiredText(
        input.storageKey,
        "Exercise private media storage key",
        1,
        1_000,
      ),
      contentType: requiredText(
        input.contentType,
        "Exercise private media content type",
        1,
        200,
      ),
      sizeBytes,
      createdAt: new Date().toISOString(),
    });
    await this.#repository.registerPrivateMedia(media);
    return media;
  }

  async deletePrivateMedia(
    organizationId: string,
    exerciseId: string,
    mediaId: string,
  ): Promise<ExerciseCatalogPrivateMedia | undefined> {
    const organization = requiredIdentifier(
      organizationId,
      "Organization id",
    );
    const exercise = requiredIdentifier(exerciseId, "Exercise id");
    const media = requiredIdentifier(mediaId, "Exercise private media id");
    return this.#repository.deletePrivateMedia(
      organization,
      exercise,
      media,
    );
  }

  async setFavorite(
    organizationId: string,
    principalId: string,
    exerciseId: string,
    favorite: boolean,
  ): Promise<boolean> {
    const organization = requiredIdentifier(
      organizationId,
      "Organization id",
    );
    const principal = requiredIdentifier(principalId, "Principal id");
    const id = requiredIdentifier(exerciseId, "Exercise id");
    if (typeof favorite !== "boolean") {
      throw new ExerciseCatalogValidationError(
        "Exercise favorite flag is invalid.",
      );
    }
    const item = await this.#repository.findItemById(organization, id);
    if (item === undefined) return false;
    this.#normalizePersistedItem(item, organization);
    await this.#repository.setFavorite(
      organization,
      principal,
      id,
      favorite,
    );
    return true;
  }

  #normalizePersistedItem(
    item: ExerciseCatalogItem,
    expectedOrganizationId: string,
  ): ExerciseCatalogItem {
    if (
      item === null ||
      typeof item !== "object" ||
      Array.isArray(item) ||
      item.organizationId !== expectedOrganizationId
    ) {
      throw new Error(
        "Exercise catalog repository returned an invalid organization scope.",
      );
    }
    return createExerciseCatalogItem(
      {
        name: item.name,
        categoryKey: item.categoryKey,
        subcategory: item.subcategory,
        difficultyKey: item.difficultyKey,
        goal: item.goal,
        description: item.description,
        coachingCues: item.coachingCues,
        commonMistakes: item.commonMistakes,
        equipment: item.equipment,
        videoUrl: item.videoUrl,
        videoUrls: item.videoUrls,
        audienceIds: item.audienceIds,
        similarExerciseIds: item.similarExerciseIds,
        parameters: item.parameters,
        isActive: item.isActive,
      },
      {
        id: item.id,
        organizationId: item.organizationId,
        definition: this.#definition,
      },
    );
  }
}

function optionalPrincipalId(value: string | null | undefined): string | null {
  return value === undefined || value === null
    ? null
    : requiredIdentifier(value, "Principal id");
}

function mergeUpdateInput(
  current: ExerciseCatalogItem,
  input: UpdateExerciseCatalogItemInput,
): CreateExerciseCatalogItemInput {
  return {
    name: input.name === undefined ? current.name : input.name,
    categoryKey:
      input.categoryKey === undefined
        ? current.categoryKey
        : input.categoryKey,
    subcategory:
      input.subcategory === undefined
        ? current.subcategory
        : input.subcategory,
    difficultyKey:
      input.difficultyKey === undefined
        ? current.difficultyKey
        : input.difficultyKey,
    goal: input.goal === undefined ? current.goal : input.goal,
    description:
      input.description === undefined
        ? current.description
        : input.description,
    coachingCues:
      input.coachingCues === undefined
        ? current.coachingCues
        : input.coachingCues,
    commonMistakes:
      input.commonMistakes === undefined
        ? current.commonMistakes
        : input.commonMistakes,
    equipment:
      input.equipment === undefined ? current.equipment : input.equipment,
    videoUrl:
      input.videoUrl === undefined && input.videoUrls === undefined
        ? current.videoUrl
        : input.videoUrl,
    videoUrls:
      input.videoUrls === undefined && input.videoUrl === undefined
        ? current.videoUrls
        : input.videoUrls,
    audienceIds:
      input.audienceIds === undefined
        ? current.audienceIds
        : input.audienceIds,
    similarExerciseIds:
      input.similarExerciseIds === undefined
        ? current.similarExerciseIds
        : input.similarExerciseIds,
    parameters:
      input.parameters === undefined ? current.parameters : input.parameters,
    isActive:
      input.isActive === undefined ? current.isActive : input.isActive,
  };
}

function duplicateCandidate(
  probe: ExerciseCatalogItem,
  candidate: ExerciseCatalogItem,
): ExerciseCatalogDuplicateCandidate | null {
  const probeName = normalizedWords(probe.name);
  const candidateName = normalizedWords(candidate.name);
  const exactName = probeName.join(" ") === candidateName.join(" ");
  const nameScore = jaccard(probeName, candidateName);
  let score = exactName ? 1 : nameScore * 0.7;
  const reasons: string[] = [];
  if (exactName) reasons.push("gleicher normalisierter Name");
  else if (nameScore >= 0.5) reasons.push("ähnlicher Name");

  if (probe.categoryKey === candidate.categoryKey) {
    score += 0.12;
    reasons.push("gleiche Kategorie");
  }
  if (
    probe.subcategory !== null &&
    candidate.subcategory !== null &&
    normalizedText(probe.subcategory) === normalizedText(candidate.subcategory)
  ) {
    score += 0.08;
    reasons.push("gleiche Unterkategorie");
  }
  const equipmentScore = jaccard(
    probe.equipment.map(normalizedText),
    candidate.equipment.map(normalizedText),
  );
  if (equipmentScore > 0) {
    score += Math.min(0.1, equipmentScore * 0.1);
    reasons.push("ähnliches Material");
  }

  const bounded = Math.min(1, score);
  if (bounded < 0.5) return null;
  return Object.freeze({
    exerciseId: candidate.id,
    name: candidate.name,
    score: Math.round(bounded * 1000) / 1000,
    reasons: Object.freeze(reasons),
  });
}

function normalizedWords(value: string): readonly string[] {
  return Object.freeze(
    normalizedText(value)
      .split(/[^a-z0-9]+/u)
      .filter((entry) => entry.length > 0),
  );
}

function normalizedText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("de")
    .trim();
}

function jaccard(
  leftValues: readonly string[],
  rightValues: readonly string[],
): number {
  const left = new Set(leftValues);
  const right = new Set(rightValues);
  if (left.size === 0 && right.size === 0) return 0;
  let intersection = 0;
  for (const entry of left) if (right.has(entry)) intersection += 1;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}

function normalizedIsoTimestamp(value: string | undefined): string {
  if (value === undefined) return new Date().toISOString();
  if (typeof value !== "string" || value.trim() !== value) {
    throw new ExerciseCatalogValidationError(
      "Exercise usage timestamp is invalid.",
    );
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    throw new ExerciseCatalogValidationError(
      "Exercise usage timestamp is invalid.",
    );
  }
  return parsed.toISOString();
}

function optionalBoundedText(
  value: unknown,
  label: string,
  maximumLength: number,
): string | null {
  if (value === undefined || value === null || value === "") return null;
  return requiredText(value, label, 1, maximumLength);
}

function requiredIntegerInRange(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new ExerciseCatalogValidationError(label + " is invalid.");
  }
  return value;
}
