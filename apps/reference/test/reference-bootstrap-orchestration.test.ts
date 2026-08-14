import { describe, expect, it } from 'vitest';

import { PermissionProvisioningStateError } from '@appbasis/permissions/provisioning';

import { safeReferenceDemoBootstrapDiagnostic } from '../tooling/bootstrap-reference-demo-orchestration';
import { normalizeReferenceDemoUserCredentialBootstrapOptions } from '../worker/bootstrap-credentials';

const adminValue = `a-${'x'.repeat(20)}`;
const targetValue = `t-${'y'.repeat(20)}`;
const valid = {
  connectionString: 'postgres://demo:demo@localhost:5432/appbasis',
  secret: 's'.repeat(40),
  baseURL: 'https://preview.example.test',
  administratorUsername: 'Preview.Admin',
  administratorCredential: adminValue,
  username: 'Demo.User',
  displayName: ' Demo User ',
  temporaryPassword: targetValue,
  contactEmail: ' demo@example.test ',
};

describe('Reference transient administrator bootstrap configuration', () => {
  it('normalizes identifiers while preserving credentials', () => {
    const normalized = normalizeReferenceDemoUserCredentialBootstrapOptions(valid);
    expect(normalized.administratorUsername).toBe('preview.admin');
    expect(normalized.administratorCredential).toBe(adminValue);
    expect(normalized.username).toBe('demo.user');
    expect(normalized.displayName).toBe('Demo User');
    expect(normalized.temporaryPassword).toBe(targetValue);
    expect(normalized.contactEmail).toBe('demo@example.test');
  });

  it('rejects insecure remote origins', () => {
    expect(() =>
      normalizeReferenceDemoUserCredentialBootstrapOptions({
        ...valid,
        baseURL: 'http://preview.example.test',
      }),
    ).toThrow('credential-free HTTPS origin');
  });

  it('rejects invalid administrator identity or short credential', () => {
    expect(() =>
      normalizeReferenceDemoUserCredentialBootstrapOptions({
        ...valid,
        administratorUsername: 'not valid!',
      }),
    ).toThrow('administratorUsername is invalid');
    expect(() =>
      normalizeReferenceDemoUserCredentialBootstrapOptions({
        ...valid,
        administratorCredential: 'short',
      }),
    ).toThrow('administratorCredential must contain 8-128');
  });

  it('keeps administrator and target identities distinct', () => {
    expect(() =>
      normalizeReferenceDemoUserCredentialBootstrapOptions({
        ...valid,
        username: 'preview.admin',
      }),
    ).toThrow('must refer to different identities');
  });

  it('reports only allowlisted operational diagnostics', () => {
    expect(
      safeReferenceDemoBootstrapDiagnostic(
        new Error('Better Auth admin create-user failed: 403'),
      ),
    ).toBe('better-auth-admin-create-user-http-403');
    expect(
      safeReferenceDemoBootstrapDiagnostic(
        new PermissionProvisioningStateError('conflicting permission role state'),
      ),
    ).toBe('permission-provisioning');

    const secretBearingError = new Error(
      'database password=super-secret-value token=also-secret',
    );
    expect(safeReferenceDemoBootstrapDiagnostic(secretBearingError)).toBe('unknown');
    expect(safeReferenceDemoBootstrapDiagnostic('raw secret')).toBe('unknown');
  });
});
