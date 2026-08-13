import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const sourceConfigPath = path.join(repositoryRoot, 'apps', 'reference', 'wrangler.jsonc');
const defaultOutputPath = path.join(
  repositoryRoot,
  'apps',
  'reference',
  'wrangler.preview.generated.json',
);

export function renderReferencePreviewWranglerConfig(sourceText, hyperdriveId) {
  const normalizedHyperdriveId = requiredProviderId(hyperdriveId);

  let parsed;
  try {
    parsed = JSON.parse(sourceText);
  } catch {
    throw new Error('Reference Wrangler config must remain JSON-compatible JSONC.');
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Reference Wrangler config must contain one JSON object.');
  }
  if (Object.hasOwn(parsed, 'hyperdrive')) {
    throw new Error('Reference Wrangler config must not persist a Hyperdrive binding.');
  }
  if (parsed.keep_vars !== true) {
    throw new Error('Reference Wrangler config must preserve dashboard variables on deploy.');
  }

  return {
    ...parsed,
    hyperdrive: [
      {
        binding: 'HYPERDRIVE',
        id: normalizedHyperdriveId,
      },
    ],
  };
}

export async function writeReferencePreviewWranglerConfig({
  hyperdriveId,
  outputPath = defaultOutputPath,
} = {}) {
  const sourceText = await readFile(sourceConfigPath, 'utf8');
  const rendered = renderReferencePreviewWranglerConfig(sourceText, hyperdriveId);
  await writeFile(outputPath, `${JSON.stringify(rendered, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  return outputPath;
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
  await writeReferencePreviewWranglerConfig({
    hyperdriveId: process.env.APPBASIS_HYPERDRIVE_ID,
  });
  console.log('Reference preview deployment config rendered.');
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && path.resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  await main();
}
