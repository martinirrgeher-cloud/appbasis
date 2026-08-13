import { createPostgresDatabase } from "@appbasis/database/node-runtime";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { admin, username } from "better-auth/plugins";

import * as authSchema from "./schema/auth.ts";
import {
  normalizeUsername,
  technicalEmailForUsername,
} from "./technical-email.ts";

const MINIMUM_PASSWORD_LENGTH = 8;
const MAXIMUM_PASSWORD_LENGTH = 128;

export class TechnicalRootAdminConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "TechnicalRootAdminConfigurationError";
  }
}

export class TechnicalRootAdminStateError extends Error {
  constructor(message) {
    super(message);
    this.name = "TechnicalRootAdminStateError";
  }
}

export class TechnicalRootAdminExecutionError extends Error {
  constructor() {
    super("Technical root administrator bootstrap failed.");
    this.name = "TechnicalRootAdminExecutionError";
  }
}

export function normalizeTechnicalRootAdminOptions(options) {
  const connectionString = requiredTrimmed(
    options.connectionString,
    "connectionString",
  );
  validatePostgresConnectionString(connectionString);

  const secret = requiredTrimmed(options.secret, "secret");
  if (secret.length < 32) {
    throw new TechnicalRootAdminConfigurationError(
      "secret must contain at least 32 characters.",
    );
  }

  const baseURL = normalizeBaseURL(options.baseURL);
  const displayName = requiredTrimmed(options.displayName, "displayName");
  const password = requiredUntrimmed(options.password, "password");
  if (
    password.length < MINIMUM_PASSWORD_LENGTH ||
    password.length > MAXIMUM_PASSWORD_LENGTH
  ) {
    throw new TechnicalRootAdminConfigurationError(
      `password must contain ${MINIMUM_PASSWORD_LENGTH}-${MAXIMUM_PASSWORD_LENGTH} characters.`,
    );
  }

  let normalizedUsername;
  try {
    normalizedUsername = normalizeUsername(options.username);
  } catch {
    throw new TechnicalRootAdminConfigurationError("username is invalid.");
  }

  return {
    connectionString,
    secret,
    baseURL,
    username: normalizedUsername,
    displayName,
    password,
  };
}

export async function createInitialTechnicalAdmin(options) {
  const normalized = normalizeTechnicalRootAdminOptions(options);
  const connection = createPostgresDatabase(normalized.connectionString);

  try {
    const existingRows = await connection.client`
      SELECT count(*)::int AS count
      FROM "user"
    `;
    if ((existingRows[0]?.count ?? -1) !== 0) {
      throw new TechnicalRootAdminStateError(
        "Technical root administrator bootstrap requires zero existing Better Auth users.",
      );
    }

    const technicalEmail = await technicalEmailForUsername(normalized.username);
    const auth = createRootBootstrapAuthRuntime({
      database: connection.database,
      secret: normalized.secret,
      baseURL: normalized.baseURL,
    });

    await auth.api.createUser({
      body: {
        email: technicalEmail,
        password: normalized.password,
        name: normalized.displayName,
        role: "user",
        data: {
          username: normalized.username,
          displayUsername: normalized.username,
        },
      },
    });

    const createdRows = await connection.client`
      SELECT id, username, role
      FROM "user"
      WHERE email = ${technicalEmail}
      LIMIT 1
    `;
    const created = createdRows[0];
    if (created === undefined) throw new TechnicalRootAdminExecutionError();

    const finalization = await connection.client.begin(async (transaction) => {
      await transaction.unsafe('LOCK TABLE "user" IN EXCLUSIVE MODE');

      const users = await transaction`
        SELECT id, username, role
        FROM "user"
        ORDER BY id
      `;
      const onlyUser = users[0];
      if (
        users.length !== 1 ||
        onlyUser === undefined ||
        onlyUser.id !== created.id ||
        onlyUser.username !== normalized.username ||
        onlyUser.role !== "user"
      ) {
        await transaction`
          DELETE FROM "user"
          WHERE id = ${created.id}
        `;
        return { ok: false, reason: "user-set-changed" };
      }

      const stateRows = await transaction`
        SELECT count(*)::int AS count
        FROM appbasis_identity_security_state
        WHERE identity_id = ${created.id}
      `;
      if ((stateRows[0]?.count ?? -1) !== 0) {
        return { ok: false, reason: "appbasis-state-exists" };
      }

      const promotedRows = await transaction`
        UPDATE "user"
        SET role = 'admin', updated_at = NOW()
        WHERE id = ${created.id} AND role = 'user'
        RETURNING id, username, role
      `;
      const promoted = promotedRows[0];
      if (
        promoted === undefined ||
        promoted.username !== normalized.username ||
        promoted.role !== "admin"
      ) {
        return { ok: false, reason: "promotion-failed" };
      }

      const finalStateRows = await transaction`
        SELECT count(*)::int AS count
        FROM appbasis_identity_security_state
        WHERE identity_id = ${created.id}
      `;
      if ((finalStateRows[0]?.count ?? -1) !== 0) {
        throw new TechnicalRootAdminExecutionError();
      }

      return {
        ok: true,
        identityId: promoted.id,
        username: promoted.username,
      };
    });

    if (!finalization.ok) {
      throw new TechnicalRootAdminStateError(
        finalization.reason === "appbasis-state-exists"
          ? "Technical root administrator target unexpectedly has AppBasis identity state."
          : "Technical root administrator bootstrap lost the exclusive empty-user invariant.",
      );
    }

    return {
      identityId: finalization.identityId,
      username: finalization.username,
      role: "admin",
    };
  } catch (error) {
    if (
      error instanceof TechnicalRootAdminConfigurationError ||
      error instanceof TechnicalRootAdminStateError ||
      error instanceof TechnicalRootAdminExecutionError
    ) {
      throw error;
    }
    throw new TechnicalRootAdminExecutionError();
  } finally {
    await connection.client.end();
  }
}

function createRootBootstrapAuthRuntime(options) {
  return betterAuth({
    baseURL: options.baseURL,
    secret: options.secret,
    database: drizzleAdapter(options.database, {
      provider: "pg",
      schema: authSchema,
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
    },
    disabledPaths: [
      "/sign-up/email",
      "/sign-in/email",
      "/is-username-available",
    ],
    plugins: [
      username({
        minUsernameLength: 3,
        maxUsernameLength: 30,
        usernameValidator: (value) => /^[a-z0-9._]+$/.test(value),
      }),
      admin(),
    ],
    telemetry: {
      enabled: false,
    },
  });
}

function requiredTrimmed(value, field) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized.length === 0) {
    throw new TechnicalRootAdminConfigurationError(`${field} is required.`);
  }
  return normalized;
}

function requiredUntrimmed(value, field) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim().length === 0
  ) {
    throw new TechnicalRootAdminConfigurationError(`${field} is required.`);
  }
  return value;
}

function normalizeBaseURL(value) {
  const raw = requiredTrimmed(value, "baseURL");
  try {
    const url = new URL(raw);
    const loopback =
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]" ||
      url.hostname === "::1";
    if (
      (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
      url.username.length > 0 ||
      url.password.length > 0
    ) {
      throw new Error("invalid");
    }
    return url.origin;
  } catch {
    throw new TechnicalRootAdminConfigurationError(
      "baseURL must be a credential-free HTTPS origin, or loopback HTTP for tests.",
    );
  }
}

function validatePostgresConnectionString(value) {
  try {
    if (!/^postgres(?:ql)?:\/\//i.test(value)) throw new Error("invalid");
    const url = new URL(value);
    if (
      (url.protocol !== "postgres:" && url.protocol !== "postgresql:") ||
      url.hostname.length === 0
    ) {
      throw new Error("invalid");
    }
  } catch {
    throw new TechnicalRootAdminConfigurationError(
      "connectionString must be an absolute PostgreSQL URL with an authority and hostname.",
    );
  }
}
