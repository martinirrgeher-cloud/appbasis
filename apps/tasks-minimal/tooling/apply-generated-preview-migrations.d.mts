export const GENERATED_PREVIEW_APP_ID: "tasks-minimal";
export const GENERATED_PREVIEW_MIGRATION_TARGET: "generated-tasks-preview";
export const GENERATED_PREVIEW_DATABASE_NAME: "appbasis_tasks_preview";

export class GeneratedPreviewMigrationConfigurationError extends Error {}
export class GeneratedPreviewMigrationExecutionError extends Error {}

export interface GeneratedPreviewMigrationPlanEntry {
  readonly ownerId: string;
  readonly relativePath: string;
  readonly statements: readonly string[];
}

export interface GeneratedPreviewMigrationResult {
  readonly migrationCount: number;
  readonly statementCount: number;
}

export function loadGeneratedPreviewMigrationPlan(): Promise<GeneratedPreviewMigrationPlanEntry[]>;

export function applyGeneratedPreviewMigrations(input: {
  connectionString: string;
}): Promise<GeneratedPreviewMigrationResult>;

export function assertGeneratedPreviewMigrationEnvironment(
  environment?: Record<string, string | undefined>,
): void;
