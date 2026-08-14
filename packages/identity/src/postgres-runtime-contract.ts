import type { IdentityHttpService } from "./http";

export type IdentityPostgresRuntimeParameter =
  | string
  | number
  | boolean
  | null;

export interface IdentityPostgresRuntimeSqlClient {
  unsafe(
    query: string,
    parameters?: IdentityPostgresRuntimeParameter[],
  ): PromiseLike<readonly Record<string, unknown>[]>;
}

export interface PostgresIdentityApplicationRuntime {
  readonly identity: IdentityHttpService;
  readonly sql: IdentityPostgresRuntimeSqlClient;
  close(): Promise<void>;
}

export interface PostgresIdentityApplicationRuntimeOptions {
  readonly connectionString: string;
  readonly baseURL: string;
  readonly secret: string;
}

export declare function createPostgresIdentityApplicationRuntime(
  options: PostgresIdentityApplicationRuntimeOptions,
): Promise<PostgresIdentityApplicationRuntime>;
