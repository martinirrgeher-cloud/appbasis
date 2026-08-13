import { createPostgresDatabase } from '@appbasis/database';
import { createIdentityRuntime, normalizeUsername } from '@appbasis/identity';
import { createBetterAuthRuntime } from '@appbasis/identity/better-auth';

const MINIMUM_PASSWORD_LENGTH = 8;
const MAXIMUM_PASSWORD_LENGTH = 128;

type ReferenceDatabaseConnection = ReturnType<typeof createPostgresDatabase>;
type ReferenceAuthRuntime = ReturnType<typeof createBetterAuthRuntime>;

export interface ReferenceDemoUserBootstrapOptions {
  readonly connectionString: string;
  readonly secret: string;
  readonly baseURL: string;
  readonly administrativeSessionToken: string;
  readonly username: string;
  readonly displayName: string;
  readonly temporaryPassword: string;
  readonly contactEmail?: string;
}

export interface ReferenceDemoUserCredentialBootstrapOptions {
  readonly connectionString: string;
  readonly secret: string;
  readonly baseURL: string;
  readonly administratorUsername: string;
  readonly administratorPassword: string;
  readonly username: string;
  readonly displayName: string;
  readonly temporaryPassword: string;
  readonly contactEmail?: string;
}

export interface ReferenceDemoUserBootstrapResult {
  readonly identityId: string;
  readonly username: string;
  readonly accountStatus: 'active' | 'disabled';
  readonly mustChangePassword: boolean;
}

interface NormalizedReferenceDemoUserBootstrapOptions
  extends ReferenceDemoUserBootstrapOptions {
  readonly connectionString: string;
  readonly secret: string;
  readonly baseURL: string;
  readonly administrativeSessionToken: string;
  readonly username: string;
  readonly displayName: string;
  readonly temporaryPassword: string;
  readonly contactEmail?: string;
}

interface NormalizedReferenceDemoUserCredentialBootstrapOptions
  extends ReferenceDemoUserCredentialBootstrapOptions {
  readonly connectionString: string;
  readonly secret: string;
  readonly baseURL: string;
  readonly administratorUsername: string;
  readonly administratorPassword: string;
  readonly username: string;
  readonly displayName: string;
  readonly temporaryPassword: string;
  readonly contactEmail?: string;
}

export class ReferenceDemoUserBootstrapConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReferenceDemoUserBootstrapConfigurationError';
  }
}

export class ReferenceDemoUserBootstrapAuthenticationError extends Error {
  constructor() {
    super('Reference demo bootstrap administrator authentication failed.');
    this.name = 'ReferenceDemoUserBootstrapAuthenticationError';
  }
}

export class ReferenceDemoUserBootstrapCleanupError extends Error {
  constructor() {
    super('Reference demo bootstrap transient administrator session cleanup failed.');
    this.name = 'ReferenceDemoUserBootstrapCleanupError';
  }
}

export async function bootstrapReferenceDemoUser(
  options: ReferenceDemoUserBootstrapOptions,
): Promise<ReferenceDemoUserBootstrapResult> {
  const normalized = normalizeReferenceDemoUserBootstrapOptions(options);
  const connection = createPostgresDatabase(normalized.connectionString);

  try {
    const auth = createBetterAuthRuntime({
      database: connection.database,
      baseURL: normalized.baseURL,
      secret: normalized.secret,
    });
    return provisionReferenceDemoUser(
      connection,
      auth,
      normalized.baseURL,
      normalized.administrativeSessionToken,
      normalized,
    );
  } finally {
    await connection.client.end();
  }
}

/**
 * Operational composition for the protected preview workflow. The technical
 * administrator password is exchanged for a request-local Better Auth session,
 * the existing hardened demo-user bootstrap runs with that session, and the
 * session is always ended before this function returns or throws.
 */
export async function bootstrapReferenceDemoUserWithAdministratorCredentials(
  options: ReferenceDemoUserCredentialBootstrapOptions,
): Promise<ReferenceDemoUserBootstrapResult> {
  const normalized = normalizeReferenceDemoUserCredentialBootstrapOptions(options);
  const connection = createPostgresDatabase(normalized.connectionString);
  let administrativeSessionToken: string | undefined;

  try {
    const auth = createBetterAuthRuntime({
      database: connection.database,
      baseURL: normalized.baseURL,
      secret: normalized.secret,
    });
    administrativeSessionToken = await signInTransientAdministrator(
      auth,
      normalized.baseURL,
      normalized.administratorUsername,
      normalized.administratorPassword,
    );

    try {
      return await provisionReferenceDemoUser(
        connection,
        auth,
        normalized.baseURL,
        administrativeSessionToken,
        normalized,
      );
    } finally {
      await endTransientAdministratorSession(
        auth,
        normalized.baseURL,
        administrativeSessionToken,
      );
      administrativeSessionToken = undefined;
    }
  } finally {
    administrativeSessionToken = undefined;
    await connection.client.end();
  }
}

async function provisionReferenceDemoUser(
  connection: ReferenceDatabaseConnection,
  auth: ReferenceAuthRuntime,
  baseURL: string,
  administrativeSessionToken: string,
  input: {
    readonly username: string;
    readonly displayName: string;
    readonly temporaryPassword: string;
    readonly contactEmail?: string;
  },
): Promise<ReferenceDemoUserBootstrapResult> {
  const identity = createIdentityRuntime({
    auth,
    sql: connection.client,
    baseURL,
    administrativeSessionToken,
  });
  const state = await identity.service.createInitialUser({
    username: input.username,
    displayName: input.displayName,
    temporaryPassword: input.temporaryPassword,
    ...(input.contactEmail === undefined ? {} : { contactEmail: input.contactEmail }),
  });

  return {
    identityId: state.identityId,
    username: state.username,
    accountStatus: state.accountStatus,
    mustChangePassword: state.mustChangePassword,
  };
}

async function signInTransientAdministrator(
  auth: ReferenceAuthRuntime,
  baseURL: string,
  username: string,
  password: string,
): Promise<string> {
  const response = await auth.handler(
    new Request(`${baseURL}/api/auth/sign-in/username`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }),
  );
  if (!response.ok) throw new ReferenceDemoUserBootstrapAuthenticationError();

  const body = (await response.json()) as { user?: { id?: string } };
  if (body.user?.id === undefined || body.user.id.length === 0) {
    throw new ReferenceDemoUserBootstrapAuthenticationError();
  }
  return sessionCookie(response);
}

async function endTransientAdministratorSession(
  auth: ReferenceAuthRuntime,
  baseURL: string,
  sessionToken: string,
): Promise<void> {
  const signOut = await auth.handler(
    new Request(`${baseURL}/api/auth/sign-out`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: sessionToken,
      },
      body: '{}',
    }),
  );
  if (!signOut.ok) throw new ReferenceDemoUserBootstrapCleanupError();

  const verification = await auth.handler(
    new Request(`${baseURL}/api/auth/get-session`, {
      method: 'GET',
      headers: { cookie: sessionToken },
    }),
  );
  if (!verification.ok) throw new ReferenceDemoUserBootstrapCleanupError();
  const body = (await verification.json()) as { user?: { id?: string } } | null;
  if (body?.user?.id !== undefined) throw new ReferenceDemoUserBootstrapCleanupError();
}

export function normalizeReferenceDemoUserBootstrapOptions(
  options: ReferenceDemoUserBootstrapOptions,
): NormalizedReferenceDemoUserBootstrapOptions {
  const common = normalizeCommonBootstrapOptions(options, false);
  const administrativeSessionToken = requiredTrimmed(
    options.administrativeSessionToken,
    'administrativeSessionToken',
  );

  return {
    ...common,
    administrativeSessionToken,
  };
}

export function normalizeReferenceDemoUserCredentialBootstrapOptions(
  options: ReferenceDemoUserCredentialBootstrapOptions,
): NormalizedReferenceDemoUserCredentialBootstrapOptions {
  const common = normalizeCommonBootstrapOptions(options, true);
  const administratorUsername = normalizeBootstrapUsername(
    options.administratorUsername,
    'administratorUsername',
  );
  const administratorPassword = normalizePassword(
    options.administratorPassword,
    'administratorPassword',
  );

  if (administratorUsername === common.username) {
    throw new ReferenceDemoUserBootstrapConfigurationError(
      'administratorUsername and username must refer to different identities.',
    );
  }

  return {
    ...common,
    administratorUsername,
    administratorPassword,
  };
}

function normalizeCommonBootstrapOptions(
  options: {
    readonly connectionString: string;
    readonly secret: string;
    readonly baseURL: string;
    readonly username: string;
    readonly displayName: string;
    readonly temporaryPassword: string;
    readonly contactEmail?: string;
  },
  requireSecureRemoteOrigin: boolean,
) {
  const connectionString = requiredTrimmed(options.connectionString, 'connectionString');
  validatePostgresConnectionString(connectionString);

  const secret = requiredTrimmed(options.secret, 'secret');
  if (secret.length < 32) {
    throw new ReferenceDemoUserBootstrapConfigurationError(
      'secret must contain at least 32 characters.',
    );
  }

  const baseURL = normalizeBaseURL(options.baseURL, requireSecureRemoteOrigin);
  const displayName = requiredTrimmed(options.displayName, 'displayName');
  const temporaryPassword = normalizePassword(options.temporaryPassword, 'temporaryPassword');
  const contactEmail = optionalTrimmed(options.contactEmail);
  const username = normalizeBootstrapUsername(options.username, 'username');

  return {
    connectionString,
    secret,
    baseURL,
    username,
    displayName,
    temporaryPassword,
    ...(contactEmail === undefined ? {} : { contactEmail }),
  };
}

function normalizeBootstrapUsername(value: string, field: string): string {
  try {
    return normalizeUsername(value);
  } catch {
    throw new ReferenceDemoUserBootstrapConfigurationError(`${field} is invalid.`);
  }
}

function normalizePassword(value: string, field: string): string {
  const password = requiredUntrimmed(value, field);
  if (password.length < MINIMUM_PASSWORD_LENGTH || password.length > MAXIMUM_PASSWORD_LENGTH) {
    throw new ReferenceDemoUserBootstrapConfigurationError(
      `${field} must contain ${MINIMUM_PASSWORD_LENGTH}-${MAXIMUM_PASSWORD_LENGTH} characters.`,
    );
  }
  return password;
}

function requiredTrimmed(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new ReferenceDemoUserBootstrapConfigurationError(`${field} is required.`);
  }
  return normalized;
}

function requiredUntrimmed(value: string, field: string): string {
  if (value.length === 0 || value.trim().length === 0) {
    throw new ReferenceDemoUserBootstrapConfigurationError(`${field} is required.`);
  }
  return value;
}

function optionalTrimmed(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  return normalized.length === 0 ? undefined : normalized;
}

function normalizeBaseURL(value: string, requireSecureRemoteOrigin = false): string {
  const raw = requiredTrimmed(value, 'baseURL');
  try {
    const url = new URL(raw);
    const loopback =
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname === '[::1]' ||
      url.hostname === '::1';
    if (
      (url.protocol !== 'https:' && url.protocol !== 'http:') ||
      (requireSecureRemoteOrigin && url.protocol !== 'https:' && !loopback) ||
      url.username.length > 0 ||
      url.password.length > 0
    ) {
      throw new Error('invalid');
    }
    return url.origin;
  } catch {
    throw new ReferenceDemoUserBootstrapConfigurationError(
      requireSecureRemoteOrigin
        ? 'baseURL must be a credential-free HTTPS origin, or loopback HTTP for tests.'
        : 'baseURL must be an absolute HTTP(S) origin.',
    );
  }
}

function validatePostgresConnectionString(value: string): void {
  try {
    if (!/^postgres(?:ql)?:\/\//i.test(value)) {
      throw new Error('invalid');
    }
    const url = new URL(value);
    if (
      (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') ||
      url.hostname.length === 0
    ) {
      throw new Error('invalid');
    }
  } catch {
    throw new ReferenceDemoUserBootstrapConfigurationError(
      'connectionString must be an absolute PostgreSQL URL with an authority and hostname.',
    );
  }
}

function sessionCookie(response: Response): string {
  const cookie = response.headers.get('set-cookie');
  if (cookie === null) throw new ReferenceDemoUserBootstrapAuthenticationError();
  const value = cookie.split(';', 1)[0];
  if (value === undefined || value.length === 0) {
    throw new ReferenceDemoUserBootstrapAuthenticationError();
  }
  return value;
}
