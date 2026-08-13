export interface TechnicalRootAdminOptions {
  readonly connectionString: string;
  readonly secret: string;
  readonly baseURL: string;
  readonly username: string;
  readonly displayName: string;
  readonly password: string;
}

export interface NormalizedTechnicalRootAdminOptions
  extends TechnicalRootAdminOptions {}

export interface TechnicalRootAdminResult {
  readonly identityId: string;
  readonly username: string;
  readonly role: "admin";
}

export declare class TechnicalRootAdminConfigurationError extends Error {
  constructor(message: string);
}

export declare class TechnicalRootAdminStateError extends Error {
  constructor(message: string);
}

export declare class TechnicalRootAdminExecutionError extends Error {
  constructor();
}

export declare function normalizeTechnicalRootAdminOptions(
  options: TechnicalRootAdminOptions,
): NormalizedTechnicalRootAdminOptions;

export declare function createInitialTechnicalAdmin(
  options: TechnicalRootAdminOptions,
): Promise<TechnicalRootAdminResult>;
