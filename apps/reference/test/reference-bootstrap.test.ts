import { describe, expect, it } from 'vitest';

import {
  normalizeReferenceDemoUserBootstrapOptions,
  ReferenceDemoUserBootstrapConfigurationError,
} from '../worker/bootstrap';

const validSecret = 'reference-bootstrap-secret-32-chars-minimum';
const administrativeSessionToken = 'better-auth.session_token=technical-admin-session';

describe('Reference demo user bootstrap configuration', () => {
  it('normalizes non-sensitive configuration while preserving credentials verbatim where required', () => {
    const normalized = normalizeReferenceDemoUserBootstrapOptions({
      connectionString: '  postgres://demo:demo@localhost:5432/appbasis  ',
      secret: `  ${validSecret}  `,
      baseURL: ' https://demo.example.test/some/path?ignored=yes ',
      administrativeSessionToken: `  ${administrativeSessionToken}  `,
      username: '  Demo.User  ',
      displayName: '  Demo User  ',
      temporaryPassword: '  Temporary Password  ',
      contactEmail: '  demo.user@example.test  ',
    });

    expect(normalized).toEqual({
      connectionString: 'postgres://demo:demo@localhost:5432/appbasis',
      secret: validSecret,
      baseURL: 'https://demo.example.test',
      administrativeSessionToken,
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
      administrativeSessionToken,
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
      label: 'opaque PostgreSQL URL',
      mutate: { connectionString: 'postgres:demo-database' },
    },
    {
      label: 'single-slash PostgreSQL URL',
      mutate: { connectionString: 'postgres:/demo-database' },
    },
    {
      label: 'PostgreSQL URL without hostname',
      mutate: { connectionString: 'postgres:///demo-database' },
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
      label: 'blank administrative session',
      mutate: { administrativeSessionToken: '   ' },
    },
    {
      label: 'invalid username',
      mutate: { username: 'not valid!' },
    },
    {
      label: 'blank temporary password',
      mutate: { temporaryPassword: '   ' },
    },
    {
      label: 'too-short temporary password',
      mutate: { temporaryPassword: '1234567' },
    },
    {
      label: 'too-long temporary password',
      mutate: { temporaryPassword: 'x'.repeat(129) },
    },
  ])('rejects $label without reflecting credentials in the error', ({ mutate }) => {
    const secret = 'this-secret-must-never-appear-in-errors';
    const temporaryPassword = 'this-password-must-never-appear-in-errors';
    const adminSession = 'better-auth.session_token=must-never-appear-in-errors';

    const input = {
      connectionString: 'postgres://demo:demo@localhost:5432/appbasis',
      secret,
      baseURL: 'https://demo.example.test',
      administrativeSessionToken: adminSession,
      username: 'demo.user',
      displayName: 'Demo User',
      temporaryPassword,
      ...mutate,
    };

    expect(() => normalizeReferenceDemoUserBootstrapOptions(input)).toThrow(
      ReferenceDemoUserBootstrapConfigurationError,
    );

    try {
      normalizeReferenceDemoUserBootstrapOptions(input);
    } catch (error) {
      expect(String(error)).not.toContain(secret);
      expect(String(error)).not.toContain(temporaryPassword);
      expect(String(error)).not.toContain(adminSession);
    }
  });
});
