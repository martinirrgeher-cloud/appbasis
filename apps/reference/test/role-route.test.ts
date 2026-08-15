import { describe, expect, it } from 'vitest';

import { roleEditorHash, roleIdFromEditorHash } from '../src/roles/role-route';

describe('Reference role detail routing', () => {
  it('keeps the backend-valid role ID new distinct from the create route', () => {
    expect(roleEditorHash('new')).toBe('#roles/view/new');
    expect(roleIdFromEditorHash('#roles/view/new')).toBe('new');
    expect(roleIdFromEditorHash('#roles/new')).toBeNull();
  });

  it('encodes and restores technical role IDs without changing their value', () => {
    const hash = roleEditorHash('managed:trainer');
    expect(hash).toBe('#roles/view/managed%3Atrainer');
    expect(roleIdFromEditorHash(hash)).toBe('managed:trainer');
  });

  it('rejects empty or malformed encoded detail hashes', () => {
    expect(roleIdFromEditorHash('#roles/view/')).toBeNull();
    expect(roleIdFromEditorHash('#roles/view/%')).toBeNull();
  });
});
