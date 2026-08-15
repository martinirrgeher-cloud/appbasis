import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const sourceConfigPath = path.join(repositoryRoot, 'apps', 'reference', 'wrangler.jsonc');
const roleAdminSourceConfigPath = path.join(
  repositoryRoot,
  'apps',
  'reference',
  'wrangler.role-admin.jsonc',
);
const defaultOutputPath = path.join(
  repositoryRoot,
  'apps',
  'reference',
  'wrangler.preview.generated.json',
);
const defaultRoleAdminOutputPath = path.join(
  repositoryRoot,
  'apps',
  'reference',
  'wrangler.role-admin.preview.generated.json',
);

const ROLE_ADMIN_SERVICE_BINDING = Object.freeze({
  binding: 'ROLE_ADMIN',
  service: 'appbasis-reference-role-admin',
});

export function renderReferencePreviewWranglerConfig(
  sourceText,
  hyperdriveId,
  previewURL,
) {
  const parsed = parseRuntimeWranglerConfig(sourceText, 'Reference');
  assertRuntimeConfigAuthority(parsed, 'Reference');
  assertRoleAdminServiceBinding(parsed);
  return withProtectedRuntimeBindings(parsed, hyperdriveId, previewURL);
}

export function renderReferencePreviewRoleAdminWranglerConfig(
  sourceText,
  hyperdriveId,
  previewURL,
) {
  const parsed = parseRuntimeWranglerConfig(sourceText, 'Reference role administration');
  assertRuntimeConfigAuthority(parsed, 'Reference role administration');
  if (parsed.name !== ROLE_ADMIN_SERVICE_BINDING.service) {
    throw new Error('Reference role administration Worker name must remain pinned.');
  }
  if (parsed.main !== './worker/role-admin.ts') {
    throw new Error('Reference role administration Worker entrypoint must remain pinned.');
  }
  if (parsed.workers_dev !== false || parsed.preview_urls !== false) {
    throw new Error(
      'Reference role administration Worker must remain unreachable through workers.dev and Preview URLs.',
    );
  }
  if (Object.hasOwn(parsed, 'routes') || Object.hasOwn(parsed, 'route')) {
    throw new Error('Reference role administration Worker must not declare a public route.');
  }
  if (Object.hasOwn(parsed, 'services')) {
    throw new Error('Reference role administration Worker must not declare outbound service bindings.');
  }
  return withProtectedRuntimeBindings(parsed, hyperdriveId, previewURL);
}

export function validateReferencePreviewOrigin(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('APPBASIS_PREVIEW_URL is required.');
  }
  const normalized = value.trim();
  let url;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error('APPBASIS_PREVIEW_URL must be a canonical HTTPS origin.');
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname.length === 0 ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    (url.pathname !== '' && url.pathname !== '/') ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw new Error('APPBASIS_PREVIEW_URL must be a canonical HTTPS origin.');
  }
  return url.origin;
}

export async function writeReferencePreviewWranglerConfig({
  hyperdriveId,
  previewURL,
  outputPath = defaultOutputPath,
} = {}) {
  const sourceText = await readFile(sourceConfigPath, 'utf8');
  const rendered = renderReferencePreviewWranglerConfig(sourceText, hyperdriveId, previewURL);
  await writeGeneratedConfig(outputPath, rendered);
  return outputPath;
}

export async function writeReferencePreviewRoleAdminWranglerConfig({
  hyperdriveId,
  previewURL,
  outputPath = defaultRoleAdminOutputPath,
} = {}) {
  const sourceText = await readFile(roleAdminSourceConfigPath, 'utf8');
  const rendered = renderReferencePreviewRoleAdminWranglerConfig(
    sourceText,
    hyperdriveId,
    previewURL,
  );
  await writeGeneratedConfig(outputPath, rendered);
  return outputPath;
}

export async function writeReferencePreviewWranglerConfigs({
  hyperdriveId,
  previewURL,
  outputPath = defaultOutputPath,
  roleAdminOutputPath = defaultRoleAdminOutputPath,
} = {}) {
  const [sourceText, roleAdminSourceText] = await Promise.all([
    readFile(sourceConfigPath, 'utf8'),
    readFile(roleAdminSourceConfigPath, 'utf8'),
  ]);
  const rendered = renderReferencePreviewWranglerConfig(sourceText, hyperdriveId, previewURL);
  const roleAdminRendered = renderReferencePreviewRoleAdminWranglerConfig(
    roleAdminSourceText,
    hyperdriveId,
    previewURL,
  );
  await Promise.all([
    writeGeneratedConfig(outputPath, rendered),
    writeGeneratedConfig(roleAdminOutputPath, roleAdminRendered),
  ]);
  return Object.freeze({ outputPath, roleAdminOutputPath });
}

function parseRuntimeWranglerConfig(sourceText, label) {
  let parsed;
  try {
    parsed = JSON.parse(sourceText);
  } catch {
    throw new Error(`${label} Wrangler config must remain JSON-compatible JSONC.`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} Wrangler config must contain one JSON object.`);
  }
  return parsed;
}

function assertRuntimeConfigAuthority(parsed, label) {
  if (Object.hasOwn(parsed, 'hyperdrive')) {
    throw new Error(`${label} Wrangler config must not persist a Hyperdrive binding.`);
  }
  if (Object.hasOwn(parsed, 'vars')) {
    throw new Error(`${label} Wrangler config must not persist environment-specific variables.`);
  }
  if (parsed.keep_vars !== false) {
    throw new Error(
      `${label} Wrangler config must replace remote plaintext variables from the generated deployment config.`,
    );
  }
}

function assertRoleAdminServiceBinding(parsed) {
  if (
    !Array.isArray(parsed.services) ||
    parsed.services.length !== 1 ||
    parsed.services[0]?.binding !== ROLE_ADMIN_SERVICE_BINDING.binding ||
    parsed.services[0]?.service !== ROLE_ADMIN_SERVICE_BINDING.service ||
    Object.keys(parsed.services[0]).some((key) => key !== 'binding' && key !== 'service')
  ) {
    throw new Error('Reference Wrangler config must pin exactly the internal ROLE_ADMIN service binding.');
  }
}

function withProtectedRuntimeBindings(parsed, hyperdriveId, previewURL) {
  const normalizedHyperdriveId = requiredProviderId(hyperdriveId);
  const normalizedPreviewOrigin = validateReferencePreviewOrigin(previewURL);
  return {
    ...parsed,
    vars: {
      APPBASIS_BASE_URL: normalizedPreviewOrigin,
    },
    hyperdrive: [
      {
        binding: 'HYPERDRIVE',
        id: normalizedHyperdriveId,
      },
    ],
  };
}

async function writeGeneratedConfig(outputPath, rendered) {
  await writeFile(outputPath, `${JSON.stringify(rendered, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

function requiredProviderId(value) {
  if (typeof value !== 'string') {
    throw new Error('APPBASIS_HYPERDRIVE_ID is required.');
  }
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > 256 ||
    /[\u0000-\u001f\u007f\s]/u.test(normalized)
  ) {
    throw new Error('APPBASIS_HYPERDRIVE_ID is invalid.');
  }
  return normalized;
}

async function main() {
  await writeReferencePreviewWranglerConfigs({
    hyperdriveId: process.env.APPBASIS_HYPERDRIVE_ID,
    previewURL: process.env.APPBASIS_PREVIEW_URL,
  });
  console.log('Reference preview deployment configs rendered.');
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && path.resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  await main();
}
