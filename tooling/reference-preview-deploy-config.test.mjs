import assert from 'node:assert/strict';
import test from 'node:test';

import {
  renderReferencePreviewRoleAdminWranglerConfig,
  renderReferencePreviewWranglerConfig,
  validateReferencePreviewOrigin,
} from './reference-preview-deploy-config.mjs';

const previewOrigin = 'https://preview.example.test';
const hyperdriveId = '01234567-89ab-cdef-0123-456789abcdef';
const baseConfig = JSON.stringify({
  name: 'appbasis-reference',
  main: './worker/index.ts',
  compatibility_date: '2026-08-11',
  compatibility_flags: ['nodejs_compat'],
  keep_vars: false,
  services: [
    {
      binding: 'ROLE_ADMIN',
      service: 'appbasis-reference-role-admin',
    },
  ],
  assets: {
    not_found_handling: 'single-page-application',
    run_worker_first: ['/api/*'],
  },
});
const roleAdminBaseConfig = JSON.stringify({
  name: 'appbasis-reference-role-admin',
  main: './worker/role-admin.ts',
  compatibility_date: '2026-08-11',
  compatibility_flags: ['nodejs_compat'],
  workers_dev: false,
  preview_urls: false,
  keep_vars: false,
});

test('injects owned runtime bindings while pinning the internal role administration service', () => {
  const rendered = renderReferencePreviewWranglerConfig(
    baseConfig,
    hyperdriveId,
    `${previewOrigin}/`,
  );

  assert.deepEqual(rendered.vars, {
    APPBASIS_BASE_URL: previewOrigin,
  });
  assert.deepEqual(rendered.hyperdrive, [
    {
      binding: 'HYPERDRIVE',
      id: hyperdriveId,
    },
  ]);
  assert.deepEqual(rendered.services, [
    {
      binding: 'ROLE_ADMIN',
      service: 'appbasis-reference-role-admin',
    },
  ]);
  assert.equal(rendered.keep_vars, false);
  assert.equal(rendered.name, 'appbasis-reference');
  assert.equal(rendered.main, './worker/index.ts');
});

test('renders the isolated role administration Worker without public routing', () => {
  const rendered = renderReferencePreviewRoleAdminWranglerConfig(
    roleAdminBaseConfig,
    hyperdriveId,
    previewOrigin,
  );

  assert.equal(rendered.name, 'appbasis-reference-role-admin');
  assert.equal(rendered.main, './worker/role-admin.ts');
  assert.equal(rendered.workers_dev, false);
  assert.equal(rendered.preview_urls, false);
  assert.equal(Object.hasOwn(rendered, 'routes'), false);
  assert.equal(Object.hasOwn(rendered, 'services'), false);
  assert.deepEqual(rendered.vars, { APPBASIS_BASE_URL: previewOrigin });
  assert.deepEqual(rendered.hyperdrive, [{ binding: 'HYPERDRIVE', id: hyperdriveId }]);
});

test('rejects changes that would expose or retarget the role administration service', () => {
  for (const source of [
    JSON.stringify({ ...JSON.parse(baseConfig), services: [] }),
    JSON.stringify({
      ...JSON.parse(baseConfig),
      services: [{ binding: 'ROLE_ADMIN', service: 'unexpected-worker' }],
    }),
  ]) {
    assert.throws(
      () => renderReferencePreviewWranglerConfig(source, hyperdriveId, previewOrigin),
      /ROLE_ADMIN service binding/,
    );
  }

  for (const source of [
    JSON.stringify({ ...JSON.parse(roleAdminBaseConfig), workers_dev: true }),
    JSON.stringify({ ...JSON.parse(roleAdminBaseConfig), preview_urls: true }),
  ]) {
    assert.throws(
      () => renderReferencePreviewRoleAdminWranglerConfig(source, hyperdriveId, previewOrigin),
      /unreachable through workers.dev and Preview URLs/,
    );
  }
  assert.throws(
    () =>
      renderReferencePreviewRoleAdminWranglerConfig(
        JSON.stringify({ ...JSON.parse(roleAdminBaseConfig), routes: ['example.test/*'] }),
        hyperdriveId,
        previewOrigin,
      ),
    /must not declare a public route/,
  );
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
    assert.throws(
      () => renderReferencePreviewRoleAdminWranglerConfig(roleAdminBaseConfig, value, previewOrigin),
      /APPBASIS_HYPERDRIVE_ID/,
    );
  }
});

test('rejects persisted Hyperdrive bindings and environment-specific variables', () => {
  for (const [source, message] of [
    [
      JSON.stringify({
        ...JSON.parse(baseConfig),
        hyperdrive: [{ binding: 'HYPERDRIVE', id: 'persisted-provider-id' }],
      }),
      /must not persist a Hyperdrive binding/,
    ],
    [
      JSON.stringify({
        ...JSON.parse(baseConfig),
        vars: { APPBASIS_BASE_URL: previewOrigin },
      }),
      /must not persist environment-specific variables/,
    ],
  ]) {
    assert.throws(
      () => renderReferencePreviewWranglerConfig(source, 'runtime-provider-id', previewOrigin),
      message,
    );
  }
});

test('requires deploys to replace remote plaintext variables from generated config', () => {
  const source = JSON.stringify({ ...JSON.parse(baseConfig), keep_vars: true });

  assert.throws(
    () => renderReferencePreviewWranglerConfig(source, 'runtime-provider-id', previewOrigin),
    /must replace remote plaintext variables/,
  );
});

test('fails closed when repository Wrangler files stop being JSON-compatible', () => {
  assert.throws(
    () => renderReferencePreviewWranglerConfig('{ // comment\n }', 'runtime-provider-id', previewOrigin),
    /JSON-compatible JSONC/,
  );
  assert.throws(
    () =>
      renderReferencePreviewRoleAdminWranglerConfig(
        '{ // comment\n }',
        'runtime-provider-id',
        previewOrigin,
      ),
    /JSON-compatible JSONC/,
  );
});
