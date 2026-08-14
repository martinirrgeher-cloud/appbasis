export type PostgresRuntimeParameter = string | number | boolean | null;

export interface PostgresRuntimeSqlClient {
  unsafe(
    query: string,
    parameters?: PostgresRuntimeParameter[],
  ): PromiseLike<readonly Record<string, unknown>[]>;
  end(): Promise<void>;
}

export interface PostgresRuntimeConnection {
  readonly client: PostgresRuntimeSqlClient;
}

export declare function createPostgresDatabase(
  connectionString: string,
): PostgresRuntimeConnection;
