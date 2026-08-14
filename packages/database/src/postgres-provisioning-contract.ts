import type { PostgresRuntimeParameter } from "./node-runtime-contract";

export interface PostgresProvisioningTransaction {
  unsafe(
    query: string,
    parameters?: PostgresRuntimeParameter[],
  ): PromiseLike<readonly Record<string, unknown>[]>;
}

export interface PostgresProvisioningSqlClient
  extends PostgresProvisioningTransaction {
  begin<T>(
    callback: (transaction: PostgresProvisioningTransaction) => Promise<T>,
  ): Promise<T>;
  end(): Promise<void>;
}

export interface PostgresProvisioningConnection {
  readonly client: PostgresProvisioningSqlClient;
}

export declare function createPostgresDatabase(
  connectionString: string,
): PostgresProvisioningConnection;
