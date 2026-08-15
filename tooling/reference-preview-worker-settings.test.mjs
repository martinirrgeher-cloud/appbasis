import assert from 'node:assert/strict';
import test from 'node:test';

import { verifyReferencePreviewWorkerSettings } from './reference-preview-worker-settings.mjs';

const previewOrigin = 'https://preview.example.test';

function settingsWith(...bindings) {
  return {
    success: true,
    result: {
      bindings: [
        { name: 'HYPERDRIVE', type: 'hyperdrive', id: 'provider-id' },
        { name: 'BETTER_AUTH_SECRET', type: 'secret_text' },
        { name: 'APPBASIS_BASE_URL', type: 'plain_text', text: previewOrigin },
        ...bindings,
      ],
    },
  };
}

test('accepts only the repository-owned plaintext binding while allowing runtime resources and secrets', () => {
  assert.deepEqual(
    verifyReferencePreviewWorkerSettings(settingsWith(), `${previewOrigin}/`),
    { plainTextBindingCount: 1 },
  );
});

test('rejects either historical permission allowlist binding as plaintext or JSON', () => {
  for (const name of [
    'APPBASIS_REFERENCE_MEMBER_IDENTITY_IDS',
    'APPBASIS_REFERENCE_ADMIN_IDENTITY_IDS',
  ]) {
    for (const binding of [
      { name, type: 'plain_text', text: 'legacy-principal' },
      { name, type: 'json', json: ['legacy-principal'] },
    ]) {
      assert.throws(
        () => verifyReferencePreviewWorkerSettings(settingsWith(binding), previewOrigin),
        /legacy unencrypted permission bindings/,
      );
    }
  }
});

test('rejects any unexpected plaintext or JSON variable binding', () => {
  for (const binding of [
    { name: 'UNEXPECTED_TEXT', type: 'plain_text', text: 'value' },
    { name: 'UNEXPECTED_JSON', type: 'json', json: { enabled: true } },
    { name: 'APPBASIS_BASE_URL', type: 'json', json: previewOrigin },
  ]) {
    assert.throws(
      () => verifyReferencePreviewWorkerSettings(settingsWith(binding), previewOrigin),
      /unexpected unencrypted variable bindings/,
    );
  }
});

test('rejects missing, duplicate or mismatched APPBASIS_BASE_URL bindings', () => {
  const missing = settingsWith();
  missing.result.bindings = missing.result.bindings.filter(
    (binding) => binding.name !== 'APPBASIS_BASE_URL',
  );
  assert.throws(
    () => verifyReferencePreviewWorkerSettings(missing, previewOrigin),
    /APPBASIS_BASE_URL binding does not match/,
  );

  assert.throws(
    () =>
      verifyReferencePreviewWorkerSettings(
        settingsWith({
          name: 'APPBASIS_BASE_URL',
          type: 'plain_text',
          text: previewOrigin,
        }),
        previewOrigin,
      ),
    /APPBASIS_BASE_URL binding does not match/,
  );

  const mismatched = settingsWith();
  const base = mismatched.result.bindings.find(
    (binding) => binding.name === 'APPBASIS_BASE_URL',
  );
  base.text = 'https://wrong.example.test';
  assert.throws(
    () => verifyReferencePreviewWorkerSettings(mismatched, previewOrigin),
    /APPBASIS_BASE_URL binding does not match/,
  );
});

test('fails closed on malformed Cloudflare settings responses', () => {
  for (const settings of [
    null,
    {},
    { success: false, result: { bindings: [] } },
    { success: true, result: {} },
    { success: true, result: { bindings: [null] } },
  ]) {
    assert.throws(
      () => verifyReferencePreviewWorkerSettings(settings, previewOrigin),
      /Reference Worker settings/,
    );
  }
});
