import assert from 'node:assert/strict';
import test from 'node:test';

import {
  verifyReferencePreviewWorkerSettings,
  verifyReferenceRoleAdminWorkerSettings,
} from './reference-preview-worker-settings.mjs';

const previewOrigin = 'https://preview.example.test';

function referenceSettingsWith(...bindings) {
  return {
    success: true,
    result: {
      bindings: [
        { name: 'HYPERDRIVE', type: 'hyperdrive', id: 'provider-id' },
        { name: 'BETTER_AUTH_SECRET', type: 'secret_text' },
        { name: 'APPBASIS_BASE_URL', type: 'plain_text', text: previewOrigin },
        {
          name: 'ROLE_ADMIN',
          type: 'service',
          service: 'appbasis-reference-role-admin',
        },
        ...bindings,
      ],
    },
  };
}

function roleAdminSettingsWith(...bindings) {
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

test('accepts the Reference runtime authority and exact internal role-admin service binding', () => {
  assert.deepEqual(
    verifyReferencePreviewWorkerSettings(referenceSettingsWith(), `${previewOrigin}/`),
    { plainTextBindingCount: 1, roleAdminServiceBindingCount: 1 },
  );
});

test('rejects a missing, duplicate or retargeted ROLE_ADMIN service binding', () => {
  const missing = referenceSettingsWith();
  missing.result.bindings = missing.result.bindings.filter(
    (binding) => binding.name !== 'ROLE_ADMIN',
  );
  assert.throws(
    () => verifyReferencePreviewWorkerSettings(missing, previewOrigin),
    /ROLE_ADMIN service binding/,
  );

  assert.throws(
    () =>
      verifyReferencePreviewWorkerSettings(
        referenceSettingsWith({
          name: 'ROLE_ADMIN_DUPLICATE',
          type: 'service',
          service: 'appbasis-reference-role-admin',
        }),
        previewOrigin,
      ),
    /ROLE_ADMIN service binding/,
  );

  const retargeted = referenceSettingsWith();
  const roleAdmin = retargeted.result.bindings.find((binding) => binding.name === 'ROLE_ADMIN');
  roleAdmin.service = 'unexpected-worker';
  assert.throws(
    () => verifyReferencePreviewWorkerSettings(retargeted, previewOrigin),
    /ROLE_ADMIN service binding/,
  );
});

test('accepts the isolated role-admin runtime only with auth secret and Hyperdrive', () => {
  assert.deepEqual(
    verifyReferenceRoleAdminWorkerSettings(roleAdminSettingsWith(), previewOrigin),
    {
      plainTextBindingCount: 1,
      secretBindingCount: 1,
      hyperdriveBindingCount: 1,
    },
  );
});

test('rejects role-admin runtime settings without its required secret or Hyperdrive', () => {
  for (const name of ['BETTER_AUTH_SECRET', 'HYPERDRIVE']) {
    const settings = roleAdminSettingsWith();
    settings.result.bindings = settings.result.bindings.filter((binding) => binding.name !== name);
    assert.throws(
      () => verifyReferenceRoleAdminWorkerSettings(settings, previewOrigin),
      name === 'BETTER_AUTH_SECRET' ? /retain BETTER_AUTH_SECRET/ : /exactly one HYPERDRIVE/,
    );
  }
  assert.throws(
    () =>
      verifyReferenceRoleAdminWorkerSettings(
        roleAdminSettingsWith({
          name: 'OUTBOUND',
          type: 'service',
          service: 'unexpected-worker',
        }),
        previewOrigin,
      ),
    /must not expose outbound service bindings/,
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
        () => verifyReferencePreviewWorkerSettings(referenceSettingsWith(binding), previewOrigin),
        /legacy unencrypted permission bindings/,
      );
      assert.throws(
        () => verifyReferenceRoleAdminWorkerSettings(roleAdminSettingsWith(binding), previewOrigin),
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
      () => verifyReferencePreviewWorkerSettings(referenceSettingsWith(binding), previewOrigin),
      /unexpected unencrypted variable bindings/,
    );
  }
});

test('rejects missing, duplicate or mismatched APPBASIS_BASE_URL bindings', () => {
  const missing = referenceSettingsWith();
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
        referenceSettingsWith({
          name: 'APPBASIS_BASE_URL',
          type: 'plain_text',
          text: previewOrigin,
        }),
        previewOrigin,
      ),
    /APPBASIS_BASE_URL binding does not match/,
  );

  const mismatched = referenceSettingsWith();
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
