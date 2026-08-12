import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { schema } from "./schema/index";

export function createPostgresDatabase(connectionString: string) {
  const client = postgres(connectionString, {
    prepare: false,
  });

  return {
    client,
    database: drizzle(client, { schema }),
  };
}
