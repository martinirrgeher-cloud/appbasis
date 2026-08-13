export class ReferenceMigrationConfigurationError extends Error {}
export class ReferenceMigrationExecutionError extends Error {}

export interface ReferenceMigrationPlanEntry {
  readonly ownerId: string;
  readonly relativePath: string;
  readonly statements: readonly string[];
}

export interface ReferenceMigrationResult {
  readonly migrationCount: number;
  readonly statementCount: number;
}

export function loadReferenceMigrationPlan(): Promise<ReferenceMigrationPlanEntry[]>;

export function applyReferenceMigrations(input: {
  connectionString: string;
}): Promise<ReferenceMigrationResult>;

export function migrationStatements(sql: unknown): string[];

export function validatePostgresConnectionString(value: unknown): string;
