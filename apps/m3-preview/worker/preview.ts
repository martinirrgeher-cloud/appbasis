import { createPostgresDatabase } from "@appbasis/database/postgres-runtime";

import generatedWorker from "./index";

const DATABASE_HEALTH_PATH = "/api/health/database";
const DATABASE_HEALTH_QUERY =
  "SELECT 1::integer AS appbasis_database_health";

interface PreviewWorker {
  fetch(request: Request, env: unknown): Promise<Response>;
}

interface PreviewDatabaseClient {
  unsafe(query: string): PromiseLike<unknown>;
  end(): PromiseLike<unknown>;
}

type PreviewDatabaseFactory = (connectionString: string) => {
  client: PreviewDatabaseClient;
};

export function createGeneratedPreviewWorker(
  delegate: PreviewWorker = generatedWorker,
  databaseFactory: PreviewDatabaseFactory = defaultDatabaseFactory,
) {
  return Object.freeze({
    async fetch(request: Request, env: unknown): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname !== DATABASE_HEALTH_PATH || request.method !== "GET") {
        return delegate.fetch(request, env);
      }

      const connectionString = hyperdriveConnectionString(env);
      if (connectionString === null) {
        return databaseUnavailable("DATABASE_NOT_CONFIGURED");
      }

      try {
        await verifyGeneratedPreviewDatabaseConnection(
          connectionString,
          databaseFactory,
        );
        return Response.json({
          status: "ok",
          appId: "m3-preview",
          database: "reachable",
        });
      } catch {
        return databaseUnavailable("DATABASE_UNAVAILABLE");
      }
    },
  });
}

export async function verifyGeneratedPreviewDatabaseConnection(
  connectionString: string,
  databaseFactory: PreviewDatabaseFactory = defaultDatabaseFactory,
): Promise<void> {
  const normalized = requiredPostgresConnectionString(connectionString);
  const connection = databaseFactory(normalized);

  try {
    const result = await connection.client.unsafe(DATABASE_HEALTH_QUERY);
    if (!isSuccessfulHealthResult(result)) {
      throw new Error("Generated preview database health query returned an invalid result.");
    }
  } finally {
    await connection.client.end();
  }
}

function defaultDatabaseFactory(connectionString: string) {
  const connection = createPostgresDatabase(connectionString);
  return {
    client: {
      unsafe(query: string) {
        return connection.client.unsafe(query);
      },
      end() {
        return connection.client.end();
      },
    },
  };
}

function hyperdriveConnectionString(env: unknown): string | null {
  if (!isRecord(env) || !isRecord(env.HYPERDRIVE)) return null;
  const value = env.HYPERDRIVE.connectionString;
  if (typeof value !== "string" || value.trim() !== value) return null;
  try {
    return requiredPostgresConnectionString(value);
  } catch {
    return null;
  }
}

function requiredPostgresConnectionString(value: string): string {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
    throw new Error("A canonical PostgreSQL connection string is required.");
  }
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "postgres:" && url.protocol !== "postgresql:") ||
      url.hostname.length === 0
    ) {
      throw new Error("invalid");
    }
    return value;
  } catch {
    throw new Error("A canonical PostgreSQL connection string is required.");
  }
}

function isSuccessfulHealthResult(value: unknown): boolean {
  if (!Array.isArray(value) || value.length !== 1) return false;
  const row = value[0];
  return isRecord(row) && Number(row.appbasis_database_health) === 1;
}

function databaseUnavailable(
  code: "DATABASE_NOT_CONFIGURED" | "DATABASE_UNAVAILABLE",
): Response {
  return Response.json(
    {
      error: {
        code,
        message: "The generated preview database is unavailable.",
      },
    },
    { status: 503 },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export default createGeneratedPreviewWorker();
