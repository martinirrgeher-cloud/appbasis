export type PostgresRuntimeParameter = string | number | boolean | null;

export interface PostgresRuntimeTransaction {
  unsafe(
    query: string,
    parameters?: PostgresRuntimeParameter[],
  ): PromiseLike<readonly Record<string, unknown>[]>;
}

export interface PostgresRuntimeSqlClient extends PostgresRuntimeTransaction {
  begin<T>(
    callback: (transaction: PostgresRuntimeTransaction) => Promise<T>,
  ): Promise<T>;
  end(): Promise<void>;
}

export interface PostgresRuntimeConnection {
  readonly client: PostgresRuntimeSqlClient;
}

export declare function createPostgresDatabase(
  connectionString: string,
): PostgresRuntimeConnection;
