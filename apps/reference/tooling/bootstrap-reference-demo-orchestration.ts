import { pathToFileURL } from 'node:url';

import {
  bootstrapReferenceDemoUserWithAdministratorCredentials,
  type ReferenceDemoUserCredentialBootstrapOptions,
} from '../worker/bootstrap-credentials';

export class ReferenceDemoBootstrapEnvironmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReferenceDemoBootstrapEnvironmentError';
  }
}

export function readReferenceDemoBootstrapEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): ReferenceDemoUserCredentialBootstrapOptions {
  if (env.APPBASIS_DEMO_BOOTSTRAP_TARGET !== 'reference-preview') {
    throw new ReferenceDemoBootstrapEnvironmentError('Invalid demo bootstrap target.');
  }
  if (env.APPBASIS_DEMO_BOOTSTRAP_APPLY !== '1') {
    throw new ReferenceDemoBootstrapEnvironmentError('Demo bootstrap not confirmed.');
  }

  const contactEmail = optional(env.APPBASIS_DEMO_USER_CONTACT_EMAIL);
  return {
    connectionString: required(env.APPBASIS_DATABASE_URL, 'database'),
    secret: required(env.APPBASIS_BETTER_AUTH_SECRET, 'auth secret'),
    baseURL: required(env.APPBASIS_PREVIEW_URL, 'preview origin'),
    administratorUsername: required(env.APPBASIS_ROOT_ADMIN_USERNAME, 'administrator'),
    administratorCredential: requiredRaw(env.APPBASIS_ROOT_ADMIN_PASSWORD, 'administrator credential'),
    username: required(env.APPBASIS_DEMO_USER_USERNAME, 'demo username'),
    displayName: required(env.APPBASIS_DEMO_USER_DISPLAY_NAME, 'demo display name'),
    temporaryPassword: requiredRaw(env.APPBASIS_DEMO_USER_TEMPORARY_PASSWORD, 'demo credential'),
    ...(contactEmail === undefined ? {} : { contactEmail }),
  };
}

export async function runReferenceDemoBootstrap(env: NodeJS.ProcessEnv = process.env) {
  return bootstrapReferenceDemoUserWithAdministratorCredentials(
    readReferenceDemoBootstrapEnvironment(env),
  );
}

export function safeReferenceDemoBootstrapDiagnostic(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown';

  const createUserMatch = /^Better Auth admin create-user failed: ([1-5][0-9]{2})$/.exec(
    error.message,
  );
  if (createUserMatch?.[1] !== undefined) {
    return `better-auth-admin-create-user-http-${createUserMatch[1]}`;
  }

  switch (error.name) {
    case 'ReferenceDemoUserBootstrapAuthenticationError':
      return 'administrator-authentication';
    case 'ReferenceDemoUserBootstrapCleanupError':
      return 'administrator-session-cleanup';
    case 'ReferenceDemoBootstrapEnvironmentError':
      return 'environment-configuration';
    case 'ReferenceDemoUserBootstrapConfigurationError':
      return 'bootstrap-configuration';
    case 'IdentityError':
      return 'identity-operation';
    case 'TypeError':
      return 'input-validation';
    default:
      return 'unknown';
  }
}

function required(value: string | undefined, label: string): string {
  const normalized = value?.trim() ?? '';
  if (normalized.length === 0) {
    throw new ReferenceDemoBootstrapEnvironmentError(`${label} is required.`);
  }
  return normalized;
}

function requiredRaw(value: string | undefined, label: string): string {
  if (value === undefined || value.length === 0 || value.trim().length === 0) {
    throw new ReferenceDemoBootstrapEnvironmentError(`${label} is required.`);
  }
  return value;
}

function optional(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized === undefined || normalized.length === 0 ? undefined : normalized;
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  try {
    const result = await runReferenceDemoBootstrap();
    console.log(`Reference demo bootstrap completed for username ${result.username}.`);
  } catch (error) {
    console.error(
      `Reference demo bootstrap failed: ${safeReferenceDemoBootstrapDiagnostic(error)}.`,
    );
    process.exitCode = 1;
  }
}
