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

type SqlClient = ReturnType<typeof createPostgresDatabase>["client"];
type AuthRuntime = ReturnType<typeof createRootBootstrapAuthRuntime>;

type RootUserRow = {
  id: string;
  email: string;
  username: string | null;
  role: string | null;
  banned: boolean | null;
};

type CredentialRow = {
  provider_id: string;
  password: string | null;
};

type RootCandidate = {
  identityId: string;
  username: string;
  technicalEmail: string;
};

type PreparedCandidate =
  | { kind: "empty" }
  | { kind: "credentialed"; candidate: RootCandidate };

type FinalizationResult =
  | { ok: true; identityId: string; username: string }
  | { ok: false; reason: "user-set-changed" | "appbasis-state-exists" | "credential-state-changed" };

export interface TechnicalRootAdminOptions {
  readonly connectionString: string;
  readonly secret: string;
  readonly baseURL: string;
  readonly username: string;
  readonly displayName: string;
  readonly password: string;
}

export interface NormalizedTechnicalRootAdminOptions
  extends TechnicalRootAdminOptions {}

export interface TechnicalRootAdminResult {
  readonly identityId: string;
  readonly username: string;
  readonly role: "admin";
}

export class TechnicalRootAdminConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TechnicalRootAdminConfigurationError";
  }
}

export class TechnicalRootAdminStateError extends Error {
  constructor(message: string) {
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

export function normalizeTechnicalRootAdminOptions(
  options: TechnicalRootAdminOptions,
): NormalizedTechnicalRootAdminOptions {
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

  let normalizedUsername: string;
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

export async function createInitialTechnicalAdmin(
  options: TechnicalRootAdminOptions,
): Promise<TechnicalRootAdminResult> {
  const normalized = normalizeTechnicalRootAdminOptions(options);
  const connection = createPostgresDatabase(normalized.connectionString);

  try {
    const technicalEmail = await technicalEmailForUsername(normalized.username);
    const auth = createRootBootstrapAuthRuntime({
      database: connection.database,
      secret: normalized.secret,
      baseURL: normalized.baseURL,
    });

    let prepared = await prepareCandidate(
      connection.client,
      normalized.username,
      technicalEmail,
    );

    if (prepared.kind === "empty") {
      prepared = {
        kind: "credentialed",
        candidate: await createCredentialedCandidateWithRecovery(
          auth,
          connection.client,
          normalized,
          technicalEmail,
        ),
      };
    }

    await requireMatchingCredential(
      auth,
      normalized,
      prepared.candidate.identityId,
    );

    const finalization = await finalizeCandidate(
      connection.client,
      prepared.candidate,
    );
    if (!finalization.ok) {
      throw new TechnicalRootAdminStateError(
        finalization.reason === "appbasis-state-exists"
          ? "Technical root administrator target unexpectedly has AppBasis identity state."
          : "Technical root administrator bootstrap lost its exclusive candidate invariant.",
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

async function prepareCandidate(
  sql: SqlClient,
  expectedUsername: string,
  technicalEmail: string,
): Promise<PreparedCandidate> {
  return sql.begin(async (transaction) => {
    await transaction`LOCK TABLE "user" IN EXCLUSIVE MODE`;
    const users = await transaction<RootUserRow[]>`
      SELECT id, email, username, role, banned
      FROM "user"
      ORDER BY id
    `;
    if (users.length === 0) return { kind: "empty" };
    if (users.length !== 1) {
      throw new TechnicalRootAdminStateError(
        "Technical root administrator bootstrap requires an empty or recoverable Better Auth user set.",
      );
    }

    const candidate = users[0];
    if (
      candidate === undefined ||
      candidate.email !== technicalEmail ||
      candidate.username !== expectedUsername ||
      candidate.role !== "user" ||
      candidate.banned === true
    ) {
      throw new TechnicalRootAdminStateError(
        "Technical root administrator bootstrap found a non-recoverable Better Auth user.",
      );
    }

    const stateRows = await transaction<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM appbasis_identity_security_state
      WHERE identity_id = ${candidate.id}
    `;
    if ((stateRows[0]?.count ?? -1) !== 0) {
      throw new TechnicalRootAdminStateError(
        "Technical root administrator target unexpectedly has AppBasis identity state.",
      );
    }

    const credentials = await transaction<CredentialRow[]>`
      SELECT provider_id, password
      FROM account
      WHERE user_id = ${candidate.id}
      ORDER BY id
    `;
    if (credentials.length === 0) {
      await transaction`
        DELETE FROM "user"
        WHERE id = ${candidate.id}
      `;
      return { kind: "empty" };
    }
    if (
      credentials.length !== 1 ||
      credentials[0]?.provider_id !== "credential" ||
      credentials[0]?.password === null
    ) {
      throw new TechnicalRootAdminStateError(
        "Technical root administrator bootstrap found non-recoverable credential state.",
      );
    }

    return {
      kind: "credentialed",
      candidate: {
        identityId: candidate.id,
        username: expectedUsername,
        technicalEmail,
      },
    };
  });
}

async function createCredentialedCandidateWithRecovery(
  auth: AuthRuntime,
  sql: SqlClient,
  options: NormalizedTechnicalRootAdminOptions,
  technicalEmail: string,
): Promise<RootCandidate> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await auth.api.createUser({
        body: {
          email: technicalEmail,
          password: options.password,
          name: options.displayName,
          role: "user",
          data: {
            username: options.username,
            displayUsername: options.username,
          },
        },
      });
      return requireCreatedCandidate(sql, options.username, technicalEmail);
    } catch (error) {
      const prepared = await prepareCandidate(
        sql,
        options.username,
        technicalEmail,
      );
      if (prepared.kind === "credentialed") return prepared.candidate;
      if (attempt === 1) throw error;
    }
  }
  throw new TechnicalRootAdminExecutionError();
}

async function requireCreatedCandidate(
  sql: SqlClient,
  expectedUsername: string,
  technicalEmail: string,
): Promise<RootCandidate> {
  const rows = await sql<RootUserRow[]>`
    SELECT id, email, username, role, banned
    FROM "user"
    WHERE email = ${technicalEmail}
    LIMIT 1
  `;
  const candidate = rows[0];
  if (
    candidate === undefined ||
    candidate.email !== technicalEmail ||
    candidate.username !== expectedUsername ||
    candidate.role !== "user" ||
    candidate.banned === true
  ) {
    throw new TechnicalRootAdminExecutionError();
  }
  return {
    identityId: candidate.id,
    username: expectedUsername,
    technicalEmail,
  };
}

async function requireMatchingCredential(
  auth: AuthRuntime,
  options: NormalizedTechnicalRootAdminOptions,
  expectedIdentityId: string,
): Promise<void> {
  const response = await auth.handler(
    new Request(`${options.baseURL}/api/auth/sign-in/username`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: options.username,
        password: options.password,
      }),
    }),
  );
  if (!response.ok) {
    if (response.status >= 500) throw new TechnicalRootAdminExecutionError();
    throw new TechnicalRootAdminStateError(
      "Technical root administrator recovery credential does not match the candidate.",
    );
  }
  const body = (await response.json()) as { user?: { id?: string } };
  if (body.user?.id !== expectedIdentityId) {
    throw new TechnicalRootAdminStateError(
      "Technical root administrator recovery resolved an unexpected identity.",
    );
  }
}

async function finalizeCandidate(
  sql: SqlClient,
  candidate: RootCandidate,
): Promise<FinalizationResult> {
  return sql.begin(async (transaction) => {
    await transaction`LOCK TABLE "user" IN EXCLUSIVE MODE`;
    const users = await transaction<RootUserRow[]>`
      SELECT id, email, username, role, banned
      FROM "user"
      ORDER BY id
    `;
    const onlyUser = users[0];
    if (
      users.length !== 1 ||
      onlyUser === undefined ||
      onlyUser.id !== candidate.identityId ||
      onlyUser.email !== candidate.technicalEmail ||
      onlyUser.username !== candidate.username ||
      onlyUser.role !== "user" ||
      onlyUser.banned === true
    ) {
      const ownCandidate = users.find(
        (user) =>
          user.id === candidate.identityId &&
          user.email === candidate.technicalEmail &&
          user.username === candidate.username &&
          user.role === "user",
      );
      if (users.length > 1 && ownCandidate !== undefined) {
        await transaction`
          DELETE FROM "user"
          WHERE id = ${candidate.identityId}
        `;
      }
      return { ok: false, reason: "user-set-changed" };
    }

    const stateRows = await transaction<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM appbasis_identity_security_state
      WHERE identity_id = ${candidate.identityId}
    `;
    if ((stateRows[0]?.count ?? -1) !== 0) {
      return { ok: false, reason: "appbasis-state-exists" };
    }

    const credentials = await transaction<CredentialRow[]>`
      SELECT provider_id, password
      FROM account
      WHERE user_id = ${candidate.identityId}
      ORDER BY id
    `;
    if (
      credentials.length !== 1 ||
      credentials[0]?.provider_id !== "credential" ||
      credentials[0]?.password === null
    ) {
      return { ok: false, reason: "credential-state-changed" };
    }

    await transaction`
      DELETE FROM session
      WHERE user_id = ${candidate.identityId}
    `;
    const promotedRows = await transaction<
      { id: string; username: string | null; role: string | null }[]
    >`
      UPDATE "user"
      SET role = 'admin', updated_at = NOW()
      WHERE id = ${candidate.identityId} AND role = 'user'
      RETURNING id, username, role
    `;
    const promoted = promotedRows[0];
    if (
      promoted === undefined ||
      promoted.username !== candidate.username ||
      promoted.role !== "admin"
    ) {
      return { ok: false, reason: "user-set-changed" };
    }

    const finalStateRows = await transaction<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM appbasis_identity_security_state
      WHERE identity_id = ${candidate.identityId}
    `;
    if ((finalStateRows[0]?.count ?? -1) !== 0) {
      throw new TechnicalRootAdminExecutionError();
    }

    return {
      ok: true,
      identityId: promoted.id,
      username: candidate.username,
    };
  });
}

function createRootBootstrapAuthRuntime(options: {
  database: Parameters<typeof drizzleAdapter>[0];
  secret: string;
  baseURL: string;
}) {
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

function requiredTrimmed(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new TechnicalRootAdminConfigurationError(`${field} is required.`);
  }
  return normalized;
}

function requiredUntrimmed(value: string, field: string): string {
  if (value.length === 0 || value.trim().length === 0) {
    throw new TechnicalRootAdminConfigurationError(`${field} is required.`);
  }
  return value;
}

function normalizeBaseURL(value: string): string {
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

function validatePostgresConnectionString(value: string): void {
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
