import { pathToFileURL } from 'node:url';

import {
  bootstrapReferenceDemoUserWithAdministratorCredentials,
  type ReferenceDemoUserCredentialBootstrapOptions,
} from '../worker/bootstrap';

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
    throw new ReferenceDemoBootstrapEnvironmentError(
      'APPBASIS_DEMO_BOOTSTRAP_TARGET must equal reference-preview.',
    );
  }
  if (env.APPBASIS_DEMO_BOOTSTRAP_APPLY !== '1') {
    throw new ReferenceDemoBootstrapEnvironmentError(
      'Reference demo user bootstrap was not explicitly confirmed.',
    );
  }

  const contactEmail = optionalTrimmed(env.APPBASIS_DEMO_USER_CONTACT_EMAIL);
  return {
    connectionString: required(env.APPBASIS_DATABASE_URL, 'APPBASIS_DATABASE_URL'),
    secret: required(env.APPBASIS_BETTER_AUTH_SECRET, 'APPBASIS_BETTER_AUTH_SECRET'),
    baseURL: required(env.APPBASIS_PREVIEW_URL, 'APPBASIS_PREVIEW_URL'),
    administratorUsername: required(env.APPBASIS_ROOT_ADMIN_USERNAME, 'APPBASIS_ROOT_ADMIN_USERNAME'),
    administratorPassword: requiredUntrimmed(env.APPBASIS_ROOT_ADMIN_PASSWORD, 'APPBASIS_ROOT_ADMIN_PASSWORD'),
    username: required(env.APPBASIS_DEMO_USER_USERNAME, 'APPBASIS_DEMO_USER_USERNAME'),
    displayName: required(env.APPBASIS_DEMO_USER_DISPLAY_NAME, 'APPBASIS_DEMO_USER_DISPLAY_NAME'),
    temporaryPassword: requiredUntrimmed(env.APPBASIS_DEMO_USER_TEMPORARY_PASSWORD, 'APPBASIS_DEMO_USER_TEMPORARY_PASSWORD'),
    ...(contactEmail === undefined ? {} : { contactEmail }),
  };
}

export async function runReferenceDemoBootstrap(env: NodeJS.ProcessEnv = process.env) {
  return bootstrapReferenceDemoUserWithAdministratorCredentials(
    readReferenceDemoBootstrapEnvironment(env),
  );
}

function required(value: string | undefined, name: string): string {
  const normalized = value?.trim() ?? '';
  if (normalized.length === 0) throw new ReferenceDemoBootstrapEnvironmentError(`${name} is required.`);
  return normalized;
}

function requiredUntrimmed(value: string | undefined, name: string): string {
  if (value === undefined || value.length === 0 || value.trim().length === 0) {
    throw new ReferenceDemoBootstrapEnvironmentError(`${name} is required.`);
  }
  return value;
}

function optionalTrimmed(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  return normalized.length === 0 ? undefined : normalized;
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  try {
    const result = await runReferenceDemoBootstrap();
    console.log(`Reference demo bootstrap completed for username ${result.username}.`);
  } catch {
    console.error('Reference demo user bootstrap failed.');
    process.exitCode = 1;
  }
}
