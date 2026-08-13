import { createPostgresDatabase } from '@appbasis/database';
import {
  BetterAuthIdentityBackend,
  normalizeUsername,
} from '@appbasis/identity';
import { createBetterAuthRuntime } from '@appbasis/identity/better-auth';

import {
  bootstrapReferenceDemoUser,
  normalizeReferenceDemoUserBootstrapOptions,
  type ReferenceDemoUserBootstrapResult,
} from './bootstrap';

const MINIMUM_CREDENTIAL_LENGTH = 8;
const MAXIMUM_CREDENTIAL_LENGTH = 128;

export interface ReferenceDemoUserCredentialBootstrapOptions {
  readonly connectionString: string;
  readonly secret: string;
  readonly baseURL: string;
  readonly administratorUsername: string;
  readonly administratorCredential: string;
  readonly username: string;
  readonly displayName: string;
  readonly temporaryPassword: string;
  readonly contactEmail?: string;
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

export async function bootstrapReferenceDemoUserWithAdministratorCredentials(
  options: ReferenceDemoUserCredentialBootstrapOptions,
): Promise<ReferenceDemoUserBootstrapResult> {
  const normalized = normalizeReferenceDemoUserCredentialBootstrapOptions(options);
  const connection = createPostgresDatabase(normalized.connectionString);

  try {
    const auth = createBetterAuthRuntime({
      database: connection.database,
      baseURL: normalized.baseURL,
      secret: normalized.secret,
    });
    const backend = new BetterAuthIdentityBackend({
      auth,
      sql: connection.client,
      baseURL: normalized.baseURL,
    });

    let session;
    try {
      session = await backend.signInWithUsername({
        username: normalized.administratorUsername,
        password: normalized.administratorCredential,
      });
    } catch {
      throw new ReferenceDemoUserBootstrapAuthenticationError();
    }

    try {
      return await bootstrapReferenceDemoUser({
        connectionString: normalized.connectionString,
        secret: normalized.secret,
        baseURL: normalized.baseURL,
        administrativeSessionToken: session.sessionToken,
        username: normalized.username,
        displayName: normalized.displayName,
        temporaryPassword: normalized.temporaryPassword,
        ...(normalized.contactEmail === undefined
          ? {}
          : { contactEmail: normalized.contactEmail }),
      });
    } finally {
      await backend.endSession(session.sessionToken);
      if ((await backend.getSession(session.sessionToken)) !== null) {
        throw new ReferenceDemoUserBootstrapCleanupError();
      }
    }
  } finally {
    await connection.client.end();
  }
}

export function normalizeReferenceDemoUserCredentialBootstrapOptions(
  options: ReferenceDemoUserCredentialBootstrapOptions,
) {
  const target = normalizeReferenceDemoUserBootstrapOptions({
    connectionString: options.connectionString,
    secret: options.secret,
    baseURL: options.baseURL,
    administrativeSessionToken: 'validation-only',
    username: options.username,
    displayName: options.displayName,
    temporaryPassword: options.temporaryPassword,
    ...(options.contactEmail === undefined
      ? {}
      : { contactEmail: options.contactEmail }),
  });
  requireSecureOperationalOrigin(target.baseURL);

  let administratorUsername: string;
  try {
    administratorUsername = normalizeUsername(options.administratorUsername);
  } catch {
    throw new TypeError('administratorUsername is invalid.');
  }
  const administratorCredential = requiredCredential(
    options.administratorCredential,
    'administratorCredential',
  );
  if (administratorUsername === target.username) {
    throw new TypeError(
      'administratorUsername and username must refer to different identities.',
    );
  }

  return {
    connectionString: target.connectionString,
    secret: target.secret,
    baseURL: target.baseURL,
    administratorUsername,
    administratorCredential,
    username: target.username,
    displayName: target.displayName,
    temporaryPassword: target.temporaryPassword,
    ...(target.contactEmail === undefined ? {} : { contactEmail: target.contactEmail }),
  };
}

function requireSecureOperationalOrigin(value: string): void {
  const url = new URL(value);
  const loopback =
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '[::1]' ||
    url.hostname === '::1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new TypeError(
      'baseURL must be a credential-free HTTPS origin, or loopback HTTP for tests.',
    );
  }
}

function requiredCredential(value: string, field: string): string {
  if (value.length === 0 || value.trim().length === 0) {
    throw new TypeError(`${field} is required.`);
  }
  if (value.length < MINIMUM_CREDENTIAL_LENGTH || value.length > MAXIMUM_CREDENTIAL_LENGTH) {
    throw new TypeError(
      `${field} must contain ${MINIMUM_CREDENTIAL_LENGTH}-${MAXIMUM_CREDENTIAL_LENGTH} characters.`,
    );
  }
  return value;
}
