export type ExerciseCatalogParameterInputType = "number" | "text";

export interface ExerciseCatalogCategory {
  readonly key: string;
  readonly label: string;
}

export interface ExerciseCatalogDifficulty {
  readonly key: string;
  readonly label: string;
}

export interface ExerciseCatalogDefinition {
  readonly categories: readonly ExerciseCatalogCategory[];
  readonly parameterKeys: readonly string[];
  readonly difficulties: readonly ExerciseCatalogDifficulty[];
}

export interface ExerciseCatalogParameterInput {
  readonly key: string;
  readonly label: string;
  readonly unit?: string;
  readonly inputType: ExerciseCatalogParameterInputType;
  readonly defaultValue?: string | null;
  readonly minValue?: number | null;
  readonly maxValue?: number | null;
  readonly stepValue?: number | null;
  readonly isRequired?: boolean;
  readonly sortOrder?: number;
}

export interface ExerciseCatalogParameter {
  readonly key: string;
  readonly label: string;
  readonly unit: string;
  readonly inputType: ExerciseCatalogParameterInputType;
  readonly defaultValue: string | null;
  readonly minValue: number | null;
  readonly maxValue: number | null;
  readonly stepValue: number | null;
  readonly isRequired: boolean;
  readonly sortOrder: number;
}

export interface ExerciseCatalogItem {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly categoryKey: string;
  readonly subcategory: string | null;
  readonly difficultyKey: string | null;
  readonly goal: string | null;
  readonly description: string | null;
  readonly coachingCues: string | null;
  readonly commonMistakes: string | null;
  readonly equipment: readonly string[];
  /**
   * Compatibility alias for the first entry in videoUrls.
   * New consumers should use videoUrls.
   */
  readonly videoUrl: string | null;
  readonly videoUrls: readonly string[];
  readonly audienceIds: readonly string[];
  readonly similarExerciseIds: readonly string[];
  readonly parameters: readonly ExerciseCatalogParameter[];
  readonly isActive: boolean;
}

export interface CreateExerciseCatalogItemInput {
  readonly name: string;
  readonly categoryKey: string;
  readonly subcategory?: string | null;
  readonly difficultyKey?: string | null;
  readonly goal?: string | null;
  readonly description?: string | null;
  readonly coachingCues?: string | null;
  readonly commonMistakes?: string | null;
  readonly equipment?: readonly string[];
  /**
   * Backward-compatible single-link input. If videoUrls is supplied as well,
   * videoUrl must equal its first entry.
   */
  readonly videoUrl?: string | null;
  readonly videoUrls?: readonly string[];
  readonly audienceIds?: readonly string[];
  readonly similarExerciseIds?: readonly string[];
  readonly parameters?: readonly ExerciseCatalogParameterInput[];
  readonly isActive?: boolean;
}

export interface ExerciseCatalogUsageEvent {
  readonly id: string;
  readonly organizationId: string;
  readonly exerciseId: string;
  readonly occurredAt: string;
  readonly sourceKind: string;
  readonly sourceRef: string | null;
  readonly note: string | null;
}

export interface RecordExerciseCatalogUsageInput {
  readonly occurredAt?: string;
  readonly sourceKind: string;
  readonly sourceRef?: string | null;
  readonly note?: string | null;
}

export interface ExerciseCatalogUsageSummary {
  readonly exerciseId: string;
  readonly usageCount: number;
  readonly lastUsedAt: string | null;
}

export interface ExerciseCatalogPrivateMedia {
  readonly id: string;
  readonly organizationId: string;
  readonly exerciseId: string;
  readonly fileName: string;
  readonly storageKey: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly createdAt: string;
}

export interface RegisterExerciseCatalogPrivateMediaInput {
  readonly id: string;
  readonly fileName: string;
  readonly storageKey: string;
  readonly contentType: string;
  readonly sizeBytes: number;
}

export interface ExerciseCatalogDuplicateCandidate {
  readonly exerciseId: string;
  readonly name: string;
  readonly score: number;
  readonly reasons: readonly string[];
}
