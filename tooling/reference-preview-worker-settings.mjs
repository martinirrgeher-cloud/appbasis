import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateReferencePreviewOrigin } from './reference-preview-deploy-config.mjs';

const EXPECTED_PLAINTEXT_BINDING = 'APPBASIS_BASE_URL';
const EXPECTED_ROLE_ADMIN_SERVICE = Object.freeze({
  name: 'ROLE_ADMIN',
  service: 'appbasis-reference-role-admin',
});
const UNENCRYPTED_VARIABLE_TYPES = new Set(['plain_text', 'json']);
const LEGACY_PERMISSION_BINDINGS = new Set([
  'APPBASIS_REFERENCE_MEMBER_IDENTITY_IDS',
  'APPBASIS_REFERENCE_ADMIN_IDENTITY_IDS',
]);

export function verifyReferencePreviewWorkerSettings(settings, previewURL) {
  const bindings = parsedBindings(settings, 'Reference Worker');
  const plainTextBindingCount = verifyOwnedPlaintextAuthority(bindings, previewURL, 'Reference Worker');
  const serviceBindings = bindings.filter((binding) => binding.type === 'service');
  if (
    serviceBindings.length !== 1 ||
    serviceBindings[0]?.name !== EXPECTED_ROLE_ADMIN_SERVICE.name ||
    serviceBindings[0]?.service !== EXPECTED_ROLE_ADMIN_SERVICE.service
  ) {
    throw new Error('Reference Worker ROLE_ADMIN service binding does not match the internal control-plane target.');
  }
  return Object.freeze({ plainTextBindingCount, roleAdminServiceBindingCount: 1 });
}

export function verifyReferenceRoleAdminWorkerSettings(settings, previewURL) {
  const bindings = parsedBindings(settings, 'Reference role administration Worker');
  const plainTextBindingCount = verifyOwnedPlaintextAuthority(
    bindings,
    previewURL,
    'Reference role administration Worker',
  );
  const secrets = bindings.filter(
    (binding) => binding.type === 'secret_text' && binding.name === 'BETTER_AUTH_SECRET',
  );
  if (secrets.length !== 1) {
    throw new Error('Reference role administration Worker must retain BETTER_AUTH_SECRET as a secret.');
  }
  const hyperdrive = bindings.filter(
    (binding) => binding.type === 'hyperdrive' && binding.name === 'HYPERDRIVE',
  );
  if (hyperdrive.length !== 1) {
    throw new Error('Reference role administration Worker must bind exactly one HYPERDRIVE resource.');
  }
  if (bindings.some((binding) => binding.type === 'service')) {
    throw new Error('Reference role administration Worker must not expose outbound service bindings.');
  }
  return Object.freeze({
    plainTextBindingCount,
    secretBindingCount: secrets.length,
    hyperdriveBindingCount: hyperdrive.length,
  });
}

function parsedBindings(settings, label) {
  if (!isRecord(settings) || settings.success !== true || !isRecord(settings.result)) {
    throw new Error(`${label} settings response is invalid.`);
  }
  if (!Array.isArray(settings.result.bindings)) {
    throw new Error(`${label} settings contain no bindings array.`);
  }
  return settings.result.bindings.map((binding) => {
    if (!isRecord(binding)) {
      throw new Error(`${label} settings contain an invalid binding.`);
    }
    return binding;
  });
}

function verifyOwnedPlaintextAuthority(bindings, previewURL, label) {
  const expectedOrigin = validateReferencePreviewOrigin(previewURL);
  const unencryptedVariableBindings = bindings.filter(
    (binding) =>
      typeof binding.type === 'string' && UNENCRYPTED_VARIABLE_TYPES.has(binding.type),
  );

  if (
    unencryptedVariableBindings.some(
      (binding) =>
        typeof binding.name === 'string' && LEGACY_PERMISSION_BINDINGS.has(binding.name),
    )
  ) {
    throw new Error(`${label} still contains legacy unencrypted permission bindings.`);
  }

  const unexpected = unencryptedVariableBindings.filter(
    (binding) =>
      binding.type !== 'plain_text' || binding.name !== EXPECTED_PLAINTEXT_BINDING,
  );
  if (unexpected.length > 0) {
    throw new Error(`${label} contains unexpected unencrypted variable bindings.`);
  }

  const baseURLBindings = unencryptedVariableBindings.filter(
    (binding) => binding.name === EXPECTED_PLAINTEXT_BINDING,
  );
  if (
    baseURLBindings.length !== 1 ||
    baseURLBindings[0]?.type !== 'plain_text' ||
    baseURLBindings[0]?.text !== expectedOrigin
  ) {
    throw new Error(
      `${label} APPBASIS_BASE_URL binding does not match the protected preview origin.`,
    );
  }
  return baseURLBindings.length;
}

async function main(env = process.env) {
  const referencePath = optionalAbsolutePath(env.APPBASIS_REFERENCE_DEPLOYED_WORKER_SETTINGS_PATH);
  const roleAdminPath = optionalAbsolutePath(
    env.APPBASIS_REFERENCE_ROLE_ADMIN_DEPLOYED_WORKER_SETTINGS_PATH,
  );
  if ((referencePath === null) === (roleAdminPath === null)) {
    throw new Error('Exactly one Reference deployed Worker settings path must be provided.');
  }

  if (roleAdminPath !== null) {
    const settings = await readSettings(roleAdminPath, 'Reference role administration Worker');
    const result = verifyReferenceRoleAdminWorkerSettings(settings, env.APPBASIS_PREVIEW_URL);
    console.log(
      `Reference role administration Worker authority verified: ${result.plainTextBindingCount} repository-owned plaintext binding, ${result.secretBindingCount} auth secret and ${result.hyperdriveBindingCount} Hyperdrive binding.`,
    );
    return;
  }

  const settings = await readSettings(referencePath, 'Reference Worker');
  const result = verifyReferencePreviewWorkerSettings(settings, env.APPBASIS_PREVIEW_URL);
  console.log(
    `Reference preview Worker authority verified: ${result.plainTextBindingCount} repository-owned plaintext binding, no JSON variables and ${result.roleAdminServiceBindingCount} internal role-admin service binding.`,
  );
}

async function readSettings(settingsPath, label) {
  try {
    return JSON.parse(await readFile(settingsPath, 'utf8'));
  } catch {
    throw new Error(`${label} settings snapshot could not be read.`);
  }
}

function optionalAbsolutePath(value) {
  const normalized = value?.trim();
  if (normalized === undefined || normalized.length === 0) return null;
  if (!path.isAbsolute(normalized) || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new Error('Reference deployed Worker settings path is invalid.');
  }
  return normalized;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && path.resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Reference Worker settings verification failed.');
    process.exitCode = 1;
  }
}
