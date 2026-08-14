import { describe, expect, it } from 'vitest';

import { DEMO_ROLES } from '@appbasis/permissions';

import {
  ReferencePermissionCutoverConfigurationError,
  legacyPermissionAssignmentsFromWorkerSettings,
  safeReferencePermissionCutoverDiagnostic,
} from '../tooling/reference-preview-permission-cutover';

describe('Reference preview permission cutover inputs', () => {
  it('preserves legacy member/admin semantics with admin precedence', () => {
    expect(
      legacyPermissionAssignmentsFromWorkerSettings({
        success: true,
        result: {
          bindings: [
            {
              name: 'APPBASIS_REFERENCE_MEMBER_IDENTITY_IDS',
              type: 'plain_text',
              text: 'member-1, shared-1, member-1',
            },
            {
              name: 'APPBASIS_REFERENCE_ADMIN_IDENTITY_IDS',
              type: 'plain_text',
              text: 'admin-1, shared-1',
            },
          ],
        },
      }),
    ).toEqual([
      { principalId: 'admin-1', roleId: DEMO_ROLES.admin },
      { principalId: 'member-1', roleId: DEMO_ROLES.member },
      { principalId: 'shared-1', roleId: DEMO_ROLES.admin },
    ]);
  });

  it('fails closed when no legacy assignments can be recovered', () => {
    expect(() =>
      legacyPermissionAssignmentsFromWorkerSettings({
        success: true,
        result: { bindings: [] },
      }),
    ).toThrow(ReferencePermissionCutoverConfigurationError);
  });

  it('rejects non-plain-text legacy permission bindings', () => {
    expect(() =>
      legacyPermissionAssignmentsFromWorkerSettings({
        success: true,
        result: {
          bindings: [
            {
              name: 'APPBASIS_REFERENCE_MEMBER_IDENTITY_IDS',
              type: 'secret_text',
            },
          ],
        },
      }),
    ).toThrow('not one plain-text binding');
  });

  it('does not expose arbitrary cutover errors in diagnostics', () => {
    expect(
      safeReferencePermissionCutoverDiagnostic(
        new ReferencePermissionCutoverConfigurationError('secret-bearing details'),
      ),
    ).toBe('cutover-configuration');
    expect(
      safeReferencePermissionCutoverDiagnostic(
        new Error('password=super-secret token=also-secret'),
      ),
    ).toBe('unknown');
  });
});
