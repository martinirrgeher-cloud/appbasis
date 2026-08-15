import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateReferencePreviewOrigin } from './reference-preview-deploy-config.mjs';

const EXPECTED_PLAINTEXT_BINDING = 'APPBASIS_BASE_URL';
const LEGACY_PERMISSION_BINDINGS = new Set([
  'APPBASIS_REFERENCE_MEMBER_IDENTITY_IDS',
  'APPBASIS_REFERENCE_ADMIN_IDENTITY_IDS',
]);

export function verifyReferencePreviewWorkerSettings(settings, previewURL) {
  const expectedOrigin = validateReferencePreviewOrigin(previewURL);
  if (!isRecord(settings) || settings.success !== true || !isRecord(settings.result)) {
    throw new Error('Reference Worker settings response is invalid.');
  }
  if (!Array.isArray(settings.result.bindings)) {
    throw new Error('Reference Worker settings contain no bindings array.');
  }

  const bindings = settings.result.bindings.map((binding) => {
    if (!isRecord(binding)) {
      throw new Error('Reference Worker settings contain an invalid binding.');
    }
    return binding;
  });
  const plaintextBindings = bindings.filter((binding) => binding.type === 'plain_text');

  if (
    plaintextBindings.some(
      (binding) =>
        typeof binding.name === 'string' && LEGACY_PERMISSION_BINDINGS.has(binding.name),
    )
  ) {
    throw new Error('Reference Worker still contains legacy plaintext permission bindings.');
  }

  const unexpected = plaintextBindings.filter(
    (binding) => binding.name !== EXPECTED_PLAINTEXT_BINDING,
  );
  if (unexpected.length > 0) {
    throw new Error('Reference Worker contains unexpected plaintext bindings.');
  }

  const baseURLBindings = plaintextBindings.filter(
    (binding) => binding.name === EXPECTED_PLAINTEXT_BINDING,
  );
  if (
    baseURLBindings.length !== 1 ||
    baseURLBindings[0]?.type !== 'plain_text' ||
    baseURLBindings[0]?.text !== expectedOrigin
  ) {
    throw new Error(
      'Reference Worker APPBASIS_BASE_URL binding does not match the protected preview origin.',
    );
  }

  return Object.freeze({ plainTextBindingCount: plaintextBindings.length });
}

async function main(env = process.env) {
  const settingsPath = requiredAbsolutePath(
    env.APPBASIS_REFERENCE_DEPLOYED_WORKER_SETTINGS_PATH,
  );
  let settings;
  try {
    settings = JSON.parse(await readFile(settingsPath, 'utf8'));
  } catch {
    throw new Error('Reference Worker settings snapshot could not be read.');
  }
  const result = verifyReferencePreviewWorkerSettings(
    settings,
    env.APPBASIS_PREVIEW_URL,
  );
  console.log(
    `Reference preview Worker plaintext authority verified: ${result.plainTextBindingCount} repository-owned binding.`,
  );
}

function requiredAbsolutePath(value) {
  const normalized = value?.trim();
  if (
    normalized === undefined ||
    normalized.length === 0 ||
    !path.isAbsolute(normalized) ||
    /[\u0000-\u001f\u007f]/u.test(normalized)
  ) {
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
