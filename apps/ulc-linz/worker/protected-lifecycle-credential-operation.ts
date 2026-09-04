import { createPostgresDatabase } from "@appbasis/database";
import { createBetterAuthRuntime } from "@appbasis/identity/better-auth";
import { BetterAuthIdentityBackend } from "@appbasis/identity/server";

import {
  createUlcLinzProtectedLifecycleOperations,
  type UlcLinzProtectedLifecycleOperations,
} from "./protected-lifecycle-operations";

export type UlcLinzProtectedLifecycleCredentialOperation = "preflight" | "retention";

export interface UlcLinzProtectedLifecycleCredentialOptions {
  readonly connectionString: string;
  readonly baseURL: string;
  readonly secret: string;
  readonly administratorUsername: string;
  readonly administratorPassword: string;
}

export async function runUlcLinzProtectedLifecycleWithAdministratorCredentials(
  options: UlcLinzProtectedLifecycleCredentialOptions,
  operation: UlcLinzProtectedLifecycleCredentialOperation,
) {
  const connectionString = requiredText(options.connectionString, "connectionString");
  const baseURL = requiredHttpsOrigin(options.baseURL);
  const secret = requiredSecret(options.secret);
  const administratorUsername = requiredText(
    options.administratorUsername,
    "administratorUsername",
  );
  const administratorPassword = requiredPassword(options.administratorPassword);
  if (operation !== "preflight" && operation !== "retention") {
    throw new Error("ULC protected lifecycle operation is invalid.");
  }

  const connection = createPostgresDatabase(connectionString);
  const auth = createBetterAuthRuntime({
    database: connection.database,
    baseURL,
    secret,
  });
  const backend = new BetterAuthIdentityBackend({
    auth,
    sql: connection.client,
    baseURL,
  });

  let sessionToken: string | null = null;
  let lifecycle: UlcLinzProtectedLifecycleOperations | null = null;
  let primaryError: unknown = null;
  try {
    const session = await backend.signInWithUsername({
      username: administratorUsername,
      password: administratorPassword,
    });
    sessionToken = session.sessionToken;
    lifecycle = await createUlcLinzProtectedLifecycleOperations({
      connectionString,
      baseURL,
      secret,
      administrativeSessionToken: sessionToken,
    });
    await lifecycle.verifyBinding();
    if (operation === "preflight") {
      return Object.freeze({ status: "verified" as const });
    }
    const result = await lifecycle.runRetention();
    return Object.freeze({ status: "completed" as const, result });
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    let cleanupError: unknown = null;
    if (lifecycle !== null) {
      try {
        await lifecycle.close();
      } catch (error) {
        cleanupError = error;
      }
    }
    if (sessionToken !== null) {
      try {
        await backend.endSession(sessionToken);
        if ((await backend.getSession(sessionToken)) !== null) {
          throw new Error("ULC protected lifecycle transient administrator session cleanup failed.");
        }
      } catch (error) {
        cleanupError ??= error;
      }
    }
    try {
      await connection.client.end();
    } catch (error) {
      cleanupError ??= error;
    }
    if (primaryError === null && cleanupError !== null) throw cleanupError;
  }
}

function requiredText(value: string, field: string): string {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
    throw new Error(`ULC protected lifecycle ${field} is invalid.`);
  }
  return value;
}

function requiredHttpsOrigin(value: string): string {
  const raw = requiredText(value, "baseURL");
  try {
    const url = new URL(raw);
    if (
      url.protocol !== "https:" ||
      url.hostname.length === 0 ||
      url.username.length > 0 ||
      url.password.length > 0 ||
      (url.pathname !== "" && url.pathname !== "/") ||
      url.search.length > 0 ||
      url.hash.length > 0
    ) {
      throw new Error("invalid");
    }
    return url.origin;
  } catch {
    throw new Error("ULC protected lifecycle baseURL is invalid.");
  }
}

function requiredSecret(value: string): string {
  const secret = requiredText(value, "secret");
  if (secret.length < 32) {
    throw new Error("ULC protected lifecycle secret is invalid.");
  }
  return secret;
}

function requiredPassword(value: string): string {
  if (
    typeof value !== "string" ||
    value.length < 8 ||
    value.length > 128 ||
    value.trim().length === 0
  ) {
    throw new Error("ULC protected lifecycle administrator password is invalid.");
  }
  return value;
}
