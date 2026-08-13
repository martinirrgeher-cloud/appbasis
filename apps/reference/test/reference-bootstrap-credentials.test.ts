import { describe, expect, it } from 'vitest';

import {
  normalizeReferenceDemoUserCredentialBootstrapOptions,
  ReferenceDemoUserBootstrapConfigurationError,
} from '../worker/bootstrap';

const valid = {
  connectionString: 'postgres://demo:demo@localhost:5432/appbasis',
  secret: 'reference-transient-admin-secret-at-least-32-characters',
  baseURL: 'https://preview.example.test',
  administratorUsername: 'Preview.Admin',
  administratorPassword: '  Administrative Password 42!  ',
  username: 'Demo.User',
  displayName: ' Demo User ',
  temporaryPassword: '  Temporary Password 42!  ',
  contactEmail: ' demo@example.test ',
};

describe('Reference demo bootstrap with transient administrator credentials', () => {
  it('normalizes identifiers while preserving both password values verbatim', () => {
    expect(normalizeReferenceDemoUserCredentialBootstrapOptions(valid)).toEqual({
      connectionString: valid.connectionString,
      secret: valid.secret,
      baseURL: valid.baseURL,
      administratorUsername: 'preview.admin',
      administratorPassword: valid.administratorPassword,
      username: 'demo.user',
      displayName: 'Demo User',
      temporaryPassword: valid.temporaryPassword,
      contactEmail: 'demo@example.test',
    });
  });

  it.each([
    [{ baseURL: 'http://preview.example.test' }, 'credential-free HTTPS origin'],
    [{ administratorUsername: 'not valid!' }, 'administratorUsername is invalid'],
    [{ administratorPassword: '1234567' }, 'administratorPassword must contain 8-128'],
    [{ username: 'preview.admin' }, 'must refer to different identities'],
  ])('rejects unsafe input before database access', (patch, message) => {
    expect(() =>
      normalizeReferenceDemoUserCredentialBootstrapOptions({ ...valid, ...patch }),
    ).toThrowError(ReferenceDemoUserBootstrapConfigurationError);
    expect(() =>
      normalizeReferenceDemoUserCredentialBootstrapOptions({ ...valid, ...patch }),
    ).toThrow(message);
  });

  it('permits loopback HTTP only for isolated tests', () => {
    expect(
      normalizeReferenceDemoUserCredentialBootstrapOptions({
        ...valid,
        baseURL: 'http://localhost:8787/path',
      }).baseURL,
    ).toBe('http://localhost:8787');
  });
});
