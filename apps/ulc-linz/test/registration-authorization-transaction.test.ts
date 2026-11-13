import { describe, expect, it } from "vitest";

import {
  PostgresUlcTrainingSessionRepository,
  UlcTrainingSessionPersistenceError,
  type UlcTrainingSessionSqlClient,
} from "../worker/training-session-postgres";

describe("N01 guarded registration transaction boundary", () => {
  it("fails closed without PostgreSQL transactions, before authorization or writes", async () => {
    const events: string[] = [];
    const repository = new PostgresUlcTrainingSessionRepository({
      async unsafe() {
        events.push("unscoped-sql");
        return [];
      },
    });

    await expect(repository.withAuthorizedRegistrationTransaction(
      async () => { events.push("authorize"); },
      async () => { events.push("write"); },
    )).rejects.toBeInstanceOf(UlcTrainingSessionPersistenceError);
    expect(events).toEqual([]);
  });

  it("executes a successful authorization first and passes only a transaction-bound writer", async () => {
    const events: string[] = [];
    const transaction: UlcTrainingSessionSqlClient = {
      async unsafe(query) {
        events.push("transaction-query:" + query);
        return [{ allowed: true }];
      },
    };
    let active = false;

    const transactionalClient = {
      async unsafe() {
        throw new Error("Unscoped SQL should never run.");
      },
      async begin<T>(callback: (sql: UlcTrainingSessionSqlClient) => Promise<T>): Promise<T> {
        active = true;
        events.push("begin");
        try {
          return await callback(transaction);
        } finally {
          events.push("end");
          active = false;
        }
      },
    };
    const repository = new PostgresUlcTrainingSessionRepository(transactionalClient);

    const result = await repository.withAuthorizedRegistrationTransaction(
      async (sql) => {
        expect(active).toBe(true);
        expect(sql).toBe(transaction);
        const rows = await sql.unsafe("SELECT n01_authorized");
        expect(rows[0]?.allowed).toBe(true);
        events.push("authorized");
      },
      async (sessions) => {
        expect(active).toBe(true);
        expect(sessions).toBeInstanceOf(PostgresUlcTrainingSessionRepository);
        events.push("write");
        return "written";
      },
    );

    expect(result).toBe("written");
    expect(active).toBe(false);
    expect(events).toEqual([
      "begin",
      "transaction-query:SELECT n01_authorized",
      "authorized",
      "write",
      "end",
    ]);
  });

  it("never invokes the writer if authorization rejects and propagates a writer failure", async () => {
    const events: string[] = [];
    const transaction: UlcTrainingSessionSqlClient = {
      async unsafe() { return []; },
    };
    const transactionalClient = {
      async unsafe() { throw new Error("Unscoped SQL should never run."); },
      async begin<T>(callback: (sql: UlcTrainingSessionSqlClient) => Promise<T>): Promise<T> {
        events.push("begin");
        try {
          return await callback(transaction);
        } finally {
          events.push("end");
        }
      },
    };
    const repository = new PostgresUlcTrainingSessionRepository(transactionalClient);

    await expect(repository.withAuthorizedRegistrationTransaction(
      async () => {
        events.push("denied");
        throw new Error("N01_AUTHORIZATION_DENIED");
      },
      async () => { events.push("write"); },
    )).rejects.toThrow("N01_AUTHORIZATION_DENIED");
    expect(events).toEqual(["begin", "denied", "end"]);

    events.length = 0;
    await expect(repository.withAuthorizedRegistrationTransaction(
      async () => { events.push("authorized"); },
      async () => {
        events.push("write");
        throw new Error("N01_WRITE_FAILED");
      },
    )).rejects.toThrow("N01_WRITE_FAILED");
    expect(events).toEqual(["begin", "authorized", "write", "end"]);
  });
});
