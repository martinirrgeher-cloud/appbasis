import { createPostgresDatabase } from '@appbasis/database';
import { createIdentityRuntime, normalizeUsername } from '@appbasis/identity';
import { createBetterAuthRuntime } from '@appbasis/identity/better-auth';

const MINIMUM_PASSWORD_LENGTH = 8;
const MAXIMUM_PASSWORD_LENGTH = 128;

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

export class ReferenceDemoUserBootstrapConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReferenceDemoUserBootstrapConfigurationError';
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
    const identity = createIdentityRuntime({
      auth,
      sql: connection.client,
      baseURL: normalized.baseURL,
      administrativeSessionToken: normalized.administrativeSessionToken,
    });
    const state = await identity.service.createInitialUser({
      username: normalized.username,
      displayName: normalized.displayName,
      temporaryPassword: normalized.temporaryPassword,
      ...(normalized.contactEmail === undefined
        ? {}
        : { contactEmail: normalized.contactEmail }),
    });

    return {
      identityId: state.identityId,
      username: state.username,
      accountStatus: state.accountStatus,
      mustChangePassword: state.mustChangePassword,
    };
  } finally {
    await connection.client.end();
  }
}

export function normalizeReferenceDemoUserBootstrapOptions(
  options: ReferenceDemoUserBootstrapOptions,
): NormalizedReferenceDemoUserBootstrapOptions {
  const connectionString = requiredTrimmed(options.connectionString, 'connectionString');
  validatePostgresConnectionString(connectionString);

  const secret = requiredTrimmed(options.secret, 'secret');
  if (secret.length < 32) {
    throw new ReferenceDemoUserBootstrapConfigurationError(
      'secret must contain at least 32 characters.',
    );
  }

  const baseURL = normalizeBaseURL(options.baseURL);
  const administrativeSessionToken = requiredTrimmed(
    options.administrativeSessionToken,
    'administrativeSessionToken',
  );
  const displayName = requiredTrimmed(options.displayName, 'displayName');
  const temporaryPassword = requiredUntrimmed(options.temporaryPassword, 'temporaryPassword');
  if (
    temporaryPassword.length < MINIMUM_PASSWORD_LENGTH ||
    temporaryPassword.length > MAXIMUM_PASSWORD_LENGTH
  ) {
    throw new ReferenceDemoUserBootstrapConfigurationError(
      `temporaryPassword must contain ${MINIMUM_PASSWORD_LENGTH}-${MAXIMUM_PASSWORD_LENGTH} characters.`,
    );
  }
  const contactEmail = optionalTrimmed(options.contactEmail);

  let username: string;
  try {
    username = normalizeUsername(options.username);
  } catch {
    throw new ReferenceDemoUserBootstrapConfigurationError('username is invalid.');
  }

  return {
    connectionString,
    secret,
    baseURL,
    administrativeSessionToken,
    username,
    displayName,
    temporaryPassword,
    ...(contactEmail === undefined ? {} : { contactEmail }),
  };
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

function normalizeBaseURL(value: string): string {
  const raw = requiredTrimmed(value, 'baseURL');
  try {
    const url = new URL(raw);
    if (
      (url.protocol !== 'https:' && url.protocol !== 'http:') ||
      url.username.length > 0 ||
      url.password.length > 0
    ) {
      throw new Error('invalid');
    }
    return url.origin;
  } catch {
    throw new ReferenceDemoUserBootstrapConfigurationError(
      'baseURL must be an absolute HTTP(S) origin.',
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
