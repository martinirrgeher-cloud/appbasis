import { describe, expect, it } from 'vitest';

import {
  normalizeReferenceDemoUserBootstrapOptions,
  ReferenceDemoUserBootstrapConfigurationError,
} from '../worker/bootstrap';

const validSecret = 'reference-bootstrap-secret-32-chars-minimum';

describe('Reference demo user bootstrap configuration', () => {
  it('normalizes non-sensitive configuration while preserving the temporary password verbatim', () => {
    const normalized = normalizeReferenceDemoUserBootstrapOptions({
      connectionString: '  postgres://demo:demo@localhost:5432/appbasis  ',
      secret: `  ${validSecret}  `,
      baseURL: ' https://demo.example.test/some/path?ignored=yes ',
      username: '  Demo.User  ',
      displayName: '  Demo User  ',
      temporaryPassword: '  Temporary Password  ',
      contactEmail: '  demo.user@example.test  ',
    });

    expect(normalized).toEqual({
      connectionString: 'postgres://demo:demo@localhost:5432/appbasis',
      secret: validSecret,
      baseURL: 'https://demo.example.test',
      username: 'demo.user',
      displayName: 'Demo User',
      temporaryPassword: '  Temporary Password  ',
      contactEmail: 'demo.user@example.test',
    });
  });

  it('omits a blank optional contact email', () => {
    const normalized = normalizeReferenceDemoUserBootstrapOptions({
      connectionString: 'postgres://demo:demo@localhost:5432/appbasis',
      secret: validSecret,
      baseURL: 'http://localhost:8787',
      username: 'demo.user',
      displayName: 'Demo User',
      temporaryPassword: 'temporary-password',
      contactEmail: '   ',
    });

    expect(normalized.contactEmail).toBeUndefined();
  });

  it.each([
    {
      label: 'non-PostgreSQL connection string',
      mutate: { connectionString: 'https://example.test/database' },
    },
    {
      label: 'short Better Auth secret',
      mutate: { secret: 'too-short' },
    },
    {
      label: 'non-HTTP base URL',
      mutate: { baseURL: 'ftp://demo.example.test' },
    },
    {
      label: 'base URL credentials',
      mutate: { baseURL: 'https://user:password@demo.example.test' },
    },
    {
      label: 'invalid username',
      mutate: { username: 'not valid!' },
    },
    {
      label: 'blank temporary password',
      mutate: { temporaryPassword: '   ' },
    },
  ])('rejects $label without reflecting credentials in the error', ({ mutate }) => {
    const secret = 'this-secret-must-never-appear-in-errors';
    const temporaryPassword = 'this-password-must-never-appear-in-errors';

    expect(() =>
      normalizeReferenceDemoUserBootstrapOptions({
        connectionString: 'postgres://demo:demo@localhost:5432/appbasis',
        secret,
        baseURL: 'https://demo.example.test',
        username: 'demo.user',
        displayName: 'Demo User',
        temporaryPassword,
        ...mutate,
      }),
    ).toThrow(ReferenceDemoUserBootstrapConfigurationError);

    try {
      normalizeReferenceDemoUserBootstrapOptions({
        connectionString: 'postgres://demo:demo@localhost:5432/appbasis',
        secret,
        baseURL: 'https://demo.example.test',
        username: 'demo.user',
        displayName: 'Demo User',
        temporaryPassword,
        ...mutate,
      });
    } catch (error) {
      expect(String(error)).not.toContain(secret);
      expect(String(error)).not.toContain(temporaryPassword);
    }
  });
});
