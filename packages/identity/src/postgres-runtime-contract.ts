import type { IdentityState } from "./contracts";
import type { IdentityHttpService } from "./http";
import type { CreateInitialUserInput } from "./service";

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
  disableIdentity(identityId: string): Promise<unknown>;
}

export interface IdentityTrustedProvisioningService {
  createInitialUser(input: CreateInitialUserInput): Promise<IdentityState>;
}

export interface PostgresIdentityApplicationRuntime {
  readonly identity: IdentityHttpService;
  readonly lifecycleIdentity: IdentityPostgresLifecycleOwner;
  readonly trustedProvisioningIdentity: IdentityTrustedProvisioningService;
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
