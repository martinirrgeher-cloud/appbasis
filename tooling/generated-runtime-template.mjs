import { createIdentityRuntimeTemplate as createCoreIdentityRuntimeTemplate } from "./generated-runtime-template-core.mjs";

const POSTGRES_E2E_PATH = "test/app.postgres.e2e.ts";
const PREVIEW_ENTRYPOINT_PATH = "worker/preview.ts";
const PERMISSION_FOUNDATION_BLOCK = `const permissionMigrationUrl = new URL(
  "../../../packages/permissions/migrations/0000_appbasis_permissions_foundation.sql",
  import.meta.url,
);`;
const PERMISSION_LIFECYCLE_BLOCK = `const permissionRoleLifecycleMigrationUrl = new URL(
  "../../../packages/permissions/migrations/0001_appbasis_permission_role_lifecycle.sql",
  import.meta.url,
);`;
const PERMISSION_AUDIT_BLOCK = `const permissionAdministrationAuditMigrationUrl = new URL(
  "../../../packages/permissions/migrations/0002_appbasis_permission_administration_audit.sql",
  import.meta.url,
);`;
const APPLY_PERMISSION_FOUNDATION = "  await applyMigration(permissionMigrationUrl);";
const APPLY_PERMISSION_LIFECYCLE =
  "  await applyMigration(permissionRoleLifecycleMigrationUrl);";
const APPLY_PERMISSION_AUDIT =
  "  await applyMigration(permissionAdministrationAuditMigrationUrl);";

export function createIdentityRuntimeTemplate(input) {
  const generated = createCoreIdentityRuntimeTemplate(input);
  const files = [];

  for (const entry of generated.files) {
    const renderedEntry =
      entry.path === POSTGRES_E2E_PATH
        ? Object.freeze({
            ...entry,
            content: withPermissionMigrations(entry.content),
          })
        : entry;
    files.push(renderedEntry);

    if (entry.path === "worker/index.ts") {
      files.push(
        Object.freeze({
          path: PREVIEW_ENTRYPOINT_PATH,
          content: generatedPreviewEntrypoint(generated.appId),
        }),
      );
    }
  }

  return Object.freeze({
    ...generated,
    files: Object.freeze(files),
  });
}

function generatedPreviewEntrypoint(appId) {
  return `import { createPostgresDatabase } from "@appbasis/database/postgres-runtime";

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
          appId: "${appId}",
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
`;
}

function withPermissionMigrations(content) {
  let next = content;

  if (!next.includes("0001_appbasis_permission_role_lifecycle.sql")) {
    if (!next.includes(PERMISSION_FOUNDATION_BLOCK)) {
      throw new Error(
        "Generated PostgreSQL E2E template is missing the permission foundation migration block.",
      );
    }
    if (!next.includes(APPLY_PERMISSION_FOUNDATION)) {
      throw new Error(
        "Generated PostgreSQL E2E template is missing the permission foundation migration application.",
      );
    }
    next = next
      .replace(
        PERMISSION_FOUNDATION_BLOCK,
        `${PERMISSION_FOUNDATION_BLOCK}\n${PERMISSION_LIFECYCLE_BLOCK}`,
      )
      .replace(
        APPLY_PERMISSION_FOUNDATION,
        `${APPLY_PERMISSION_FOUNDATION}\n${APPLY_PERMISSION_LIFECYCLE}`,
      );
  }

  if (!next.includes("0002_appbasis_permission_administration_audit.sql")) {
    if (!next.includes(PERMISSION_LIFECYCLE_BLOCK)) {
      throw new Error(
        "Generated PostgreSQL E2E template is missing the permission lifecycle migration block.",
      );
    }
    if (!next.includes(APPLY_PERMISSION_LIFECYCLE)) {
      throw new Error(
        "Generated PostgreSQL E2E template is missing the permission lifecycle migration application.",
      );
    }
    next = next
      .replace(
        PERMISSION_LIFECYCLE_BLOCK,
        `${PERMISSION_LIFECYCLE_BLOCK}\n${PERMISSION_AUDIT_BLOCK}`,
      )
      .replace(
        APPLY_PERMISSION_LIFECYCLE,
        `${APPLY_PERMISSION_LIFECYCLE}\n${APPLY_PERMISSION_AUDIT}`,
      );
  }

  return next;
}
