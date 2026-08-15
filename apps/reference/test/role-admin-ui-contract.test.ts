import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const overviewSource = readFileSync(
  new URL('../src/roles/RoleOverview.tsx', import.meta.url),
  'utf8',
);
const editorSource = readFileSync(
  new URL('../src/roles/RoleEditor.tsx', import.meta.url),
  'utf8',
);

describe('Reference persistent role UI contract', () => {
  it('reads roles and capabilities through the existing admin gateway client instead of demo bundles', () => {
    expect(overviewSource).toContain('referenceApi.listRoles()');
    expect(overviewSource).toContain('referenceApi.listRoleCapabilities()');
    expect(overviewSource).not.toContain('DEMO_ROLE_BUNDLES');
    expect(overviewSource).not.toContain('DEMO_KNOWN_CAPABILITIES');
  });

  it('loads and writes managed roles through the existing role administration contract', () => {
    expect(editorSource).toContain('referenceApi.getRole(roleId)');
    expect(editorSource).toContain('referenceApi.createRole({');
    expect(editorSource).toContain('referenceApi.updateRole(effectiveRoleId, updateInput)');
    expect(editorSource).toContain('referenceApi.setRoleState(effectiveRoleId, requestedState)');
    expect(editorSource).not.toContain('DEMO_ROLE_BUNDLES');
    expect(editorSource).not.toContain('DEMO_KNOWN_CAPABILITIES');
  });

  it('keeps system roles protected and principal assignment outside this slice', () => {
    expect(editorSource).toContain("persistedRole?.kind === 'system'");
    expect(editorSource).toContain('Systemrollen bleiben absichtlich außerhalb der Managed-Rollenänderungen.');
    expect(editorSource).toContain('Benutzerzuordnung bleibt ein eigener Lifecycle-Slice');
  });

  it('keeps save feedback visible and the mobile icon action accessible', () => {
    expect(editorSource).toContain("aria-label={savePending ? 'Rolle wird gespeichert' : 'Rolle speichern'}");
    expect(editorSource).toContain("feedbackRef.current?.scrollIntoView({ block: 'nearest' });");
  });

  it('does not emit an update audit write for a status-only change or a no-op save', () => {
    expect(editorSource).toContain('roleUpdateChanged(saved, updateInput)');
    expect(editorSource).toContain('hasChanges;');
  });
});
