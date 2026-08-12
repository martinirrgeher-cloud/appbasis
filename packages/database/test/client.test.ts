import { describe, expect, it } from "vitest";

import { createPostgresDatabase } from "../src/index";

describe("createPostgresDatabase", () => {
  it("creates a schema-neutral PostgreSQL client", async () => {
    const { client, database } = createPostgresDatabase(
      "postgres://appbasis:appbasis@localhost:5432/appbasis",
    );

    expect(database).toBeDefined();
    await client.end();
  });
});
