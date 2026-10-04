export type ExerciseCatalogParameterInputType = "number" | "text";

export interface ExerciseCatalogCategory {
  readonly key: string;
  readonly label: string;
}

export interface ExerciseCatalogDefinition {
  readonly categories: readonly ExerciseCatalogCategory[];
  readonly parameterKeys: readonly string[];
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
  readonly goal: string | null;
  readonly description: string | null;
  readonly coachingCues: string | null;
  readonly commonMistakes: string | null;
  readonly equipment: readonly string[];
  readonly videoUrl: string | null;
  readonly audienceIds: readonly string[];
  readonly parameters: readonly ExerciseCatalogParameter[];
  readonly isActive: boolean;
}

export interface CreateExerciseCatalogItemInput {
  readonly name: string;
  readonly categoryKey: string;
  readonly subcategory?: string | null;
  readonly goal?: string | null;
  readonly description?: string | null;
  readonly coachingCues?: string | null;
  readonly commonMistakes?: string | null;
  readonly equipment?: readonly string[];
  readonly videoUrl?: string | null;
  readonly audienceIds?: readonly string[];
  readonly parameters?: readonly ExerciseCatalogParameterInput[];
  readonly isActive?: boolean;
}
