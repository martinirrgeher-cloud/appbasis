import { describe, expect, it, vi } from "vitest";

import {
  createGeneratedPreviewWorker,
  verifyGeneratedPreviewDatabaseConnection,
} from "../worker/preview";

const CONNECTION_STRING =
  "postgresql://user:password@database.example.test/appbasis_tasks_preview";
const VALID_ENV = Object.freeze({
  HYPERDRIVE: Object.freeze({ connectionString: CONNECTION_STRING }),
});

function databaseFactory(result: unknown, closeError?: Error) {
  const unsafe = vi.fn(async () => result);
  const end = vi.fn(async () => {
    if (closeError !== undefined) throw closeError;
  });
  return {
    factory: vi.fn(() => ({ client: { unsafe, end } })),
    unsafe,
    end,
  };
}

describe("generated preview database health adapter", () => {
  it("delegates every non-database-health request unchanged", async () => {
    const delegated = Response.json({ delegated: true }, { status: 202 });
    const delegate = {
      fetch: vi.fn(async () => delegated),
    };
    const factory = vi.fn(() => {
      throw new Error("database must not be touched");
    });
    const worker = createGeneratedPreviewWorker(delegate, factory);
    const request = new Request("https://preview.example.test/api/health");

    const response = await worker.fetch(request, undefined);

    expect(response).toBe(delegated);
    expect(delegate.fetch).toHaveBeenCalledWith(request, undefined);
    expect(factory).not.toHaveBeenCalled();
  });

  it("forces an actual PostgreSQL query and closes the connection before success", async () => {
    const database = databaseFactory([{ appbasis_database_health: 1 }]);
    const delegate = { fetch: vi.fn() };
    const worker = createGeneratedPreviewWorker(delegate, database.factory);

    const response = await worker.fetch(
      new Request("https://preview.example.test/api/health/database"),
      VALID_ENV,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      appId: "tasks-minimal",
      database: "reachable",
    });
    expect(database.factory).toHaveBeenCalledWith(CONNECTION_STRING);
    expect(database.unsafe).toHaveBeenCalledTimes(1);
    expect(database.unsafe.mock.calls[0]?.[0]).toMatch(
      /SELECT 1::integer AS appbasis_database_health/,
    );
    expect(database.end).toHaveBeenCalledTimes(1);
    expect(delegate.fetch).not.toHaveBeenCalled();
  });

  it("returns a distinct 503 when Hyperdrive or PostgreSQL is unavailable", async () => {
    const missingBinding = await createGeneratedPreviewWorker({
      fetch: vi.fn(),
    }).fetch(
      new Request("https://preview.example.test/api/health/database"),
      {},
    );
    expect(missingBinding.status).toBe(503);
    await expect(missingBinding.json()).resolves.toMatchObject({
      error: { code: "DATABASE_NOT_CONFIGURED" },
    });

    const delegate = { fetch: vi.fn() };
    const failingFactory = vi.fn(() => ({
      client: {
        async unsafe() {
          throw new Error("postgresql://secret-host/internal");
        },
        async end() {},
      },
    }));
    const unavailable = await createGeneratedPreviewWorker(
      delegate,
      failingFactory,
    ).fetch(
      new Request("https://preview.example.test/api/health/database"),
      VALID_ENV,
    );
    expect(unavailable.status).toBe(503);
    const body = JSON.stringify(await unavailable.json());
    expect(body).toContain("DATABASE_UNAVAILABLE");
    expect(body).not.toContain("secret-host");
    expect(delegate.fetch).not.toHaveBeenCalled();
  });

  it("fails the health proof when query results or connection close are invalid", async () => {
    const invalidResult = databaseFactory([]);
    await expect(
      verifyGeneratedPreviewDatabaseConnection(
        CONNECTION_STRING,
        invalidResult.factory,
      ),
    ).rejects.toThrow(/invalid result/);
    expect(invalidResult.end).toHaveBeenCalledTimes(1);

    const closeFailure = databaseFactory(
      [{ appbasis_database_health: 1 }],
      new Error("close failed"),
    );
    await expect(
      verifyGeneratedPreviewDatabaseConnection(
        CONNECTION_STRING,
        closeFailure.factory,
      ),
    ).rejects.toThrow(/close failed/);
  });

  it("does not treat POST as a database-health probe", async () => {
    const delegate = {
      fetch: vi.fn(async () => new Response(null, { status: 404 })),
    };
    const factory = vi.fn(() => {
      throw new Error("database must not be touched");
    });
    const worker = createGeneratedPreviewWorker(delegate, factory);
    const request = new Request(
      "https://preview.example.test/api/health/database",
      { method: "POST" },
    );

    const response = await worker.fetch(request, VALID_ENV);

    expect(response.status).toBe(404);
    expect(delegate.fetch).toHaveBeenCalledWith(request, VALID_ENV);
    expect(factory).not.toHaveBeenCalled();
  });
});
