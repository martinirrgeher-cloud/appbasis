import assert from 'node:assert/strict';
import test from 'node:test';

import { renderReferencePreviewWranglerConfig } from './reference-preview-deploy-config.mjs';

const baseConfig = JSON.stringify({
  name: 'appbasis-reference',
  main: './worker/index.ts',
  compatibility_date: '2026-08-11',
  compatibility_flags: ['nodejs_compat'],
  keep_vars: true,
  assets: {
    not_found_handling: 'single-page-application',
    run_worker_first: ['/api/*'],
  },
});

test('injects only the runtime Hyperdrive binding into the deployment config', () => {
  const rendered = renderReferencePreviewWranglerConfig(
    baseConfig,
    '01234567-89ab-cdef-0123-456789abcdef',
  );

  assert.deepEqual(rendered.hyperdrive, [
    {
      binding: 'HYPERDRIVE',
      id: '01234567-89ab-cdef-0123-456789abcdef',
    },
  ]);
  assert.equal(rendered.keep_vars, true);
  assert.equal(rendered.name, 'appbasis-reference');
  assert.equal(rendered.main, './worker/index.ts');
});

test('rejects missing or unsafe provider identifiers', () => {
  for (const value of [undefined, '', '   ', 'id with spaces', 'id\nwith-control']) {
    assert.throws(
      () => renderReferencePreviewWranglerConfig(baseConfig, value),
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
    () => renderReferencePreviewWranglerConfig(source, 'runtime-provider-id'),
    /must not persist a Hyperdrive binding/,
  );
});

test('requires dashboard variables to be preserved during deployment', () => {
  const source = JSON.stringify({ ...JSON.parse(baseConfig), keep_vars: false });

  assert.throws(
    () => renderReferencePreviewWranglerConfig(source, 'runtime-provider-id'),
    /must preserve dashboard variables/,
  );
});

test('fails closed when the repository Wrangler file stops being JSON-compatible', () => {
  assert.throws(
    () => renderReferencePreviewWranglerConfig('{ // comment\n }', 'runtime-provider-id'),
    /JSON-compatible JSONC/,
  );
});
