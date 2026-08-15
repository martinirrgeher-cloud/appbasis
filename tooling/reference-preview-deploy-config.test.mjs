import assert from 'node:assert/strict';
import test from 'node:test';

import {
  renderReferencePreviewWranglerConfig,
  validateReferencePreviewOrigin,
} from './reference-preview-deploy-config.mjs';

const previewOrigin = 'https://preview.example.test';
const baseConfig = JSON.stringify({
  name: 'appbasis-reference',
  main: './worker/index.ts',
  compatibility_date: '2026-08-11',
  compatibility_flags: ['nodejs_compat'],
  keep_vars: false,
  assets: {
    not_found_handling: 'single-page-application',
    run_worker_first: ['/api/*'],
  },
});

test('injects exactly the owned plaintext base URL and runtime Hyperdrive binding', () => {
  const rendered = renderReferencePreviewWranglerConfig(
    baseConfig,
    '01234567-89ab-cdef-0123-456789abcdef',
    `${previewOrigin}/`,
  );

  assert.deepEqual(rendered.vars, {
    APPBASIS_BASE_URL: previewOrigin,
  });
  assert.deepEqual(rendered.hyperdrive, [
    {
      binding: 'HYPERDRIVE',
      id: '01234567-89ab-cdef-0123-456789abcdef',
    },
  ]);
  assert.equal(rendered.keep_vars, false);
  assert.equal(rendered.name, 'appbasis-reference');
  assert.equal(rendered.main, './worker/index.ts');
});

test('accepts only a credential-free canonical HTTPS preview origin', () => {
  assert.equal(
    validateReferencePreviewOrigin('  https://preview.example.test  '),
    previewOrigin,
  );
  assert.equal(
    validateReferencePreviewOrigin('https://preview.example.test/'),
    previewOrigin,
  );

  for (const value of [
    undefined,
    '',
    'http://preview.example.test',
    'ftp://preview.example.test',
    'https://user:password@preview.example.test',
    'https://preview.example.test/path',
    'https://preview.example.test?query=yes',
    'https://preview.example.test#fragment',
    'not-a-url',
  ]) {
    assert.throws(
      () => validateReferencePreviewOrigin(value),
      /APPBASIS_PREVIEW_URL/,
    );
  }
});

test('rejects missing or unsafe provider identifiers', () => {
  for (const value of [undefined, '', '   ', 'id with spaces', 'id\nwith-control']) {
    assert.throws(
      () => renderReferencePreviewWranglerConfig(baseConfig, value, previewOrigin),
      /APPBASIS_HYPERDRIVE_ID/,
    );
  }
});

test('rejects a persisted Hyperdrive binding in the repository config', () => {
  const source = JSON.stringify({
    ...JSON.parse(baseConfig),
    hyperdrive: [{ binding: 'HYPERDRIVE', id: 'persisted-provider-id' }],
  });

  assert.throws(
    () => renderReferencePreviewWranglerConfig(source, 'runtime-provider-id', previewOrigin),
    /must not persist a Hyperdrive binding/,
  );
});

test('rejects persisted environment-specific variables in the repository config', () => {
  const source = JSON.stringify({
    ...JSON.parse(baseConfig),
    vars: { APPBASIS_BASE_URL: previewOrigin },
  });

  assert.throws(
    () => renderReferencePreviewWranglerConfig(source, 'runtime-provider-id', previewOrigin),
    /must not persist environment-specific variables/,
  );
});

test('requires deploys to replace remote plaintext variables from generated config', () => {
  const source = JSON.stringify({ ...JSON.parse(baseConfig), keep_vars: true });

  assert.throws(
    () => renderReferencePreviewWranglerConfig(source, 'runtime-provider-id', previewOrigin),
    /must replace remote plaintext variables/,
  );
});

test('fails closed when the repository Wrangler file stops being JSON-compatible', () => {
  assert.throws(
    () => renderReferencePreviewWranglerConfig('{ // comment\n }', 'runtime-provider-id', previewOrigin),
    /JSON-compatible JSONC/,
  );
});
