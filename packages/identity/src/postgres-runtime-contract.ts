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

export interface IdentityPostgresLifecycleOwner {
  assertAdministrativeSessionAuthorized(): Promise<void>;
  disableIdentity(identityId: string): Promise<unknown>;
}

export interface PostgresIdentityApplicationRuntime {
  readonly identity: IdentityHttpService;
  readonly lifecycleIdentity: IdentityPostgresLifecycleOwner;
  readonly sql: IdentityPostgresRuntimeSqlClient;
  close(): Promise<void>;
}

export interface PostgresIdentityApplicationRuntimeOptions {
  readonly connectionString: string;
  readonly baseURL: string;
  readonly secret: string;
  readonly administrativeSessionToken?: string;
}

export declare function createPostgresIdentityApplicationRuntime(
  options: PostgresIdentityApplicationRuntimeOptions,
): Promise<PostgresIdentityApplicationRuntime>;
