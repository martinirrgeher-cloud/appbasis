import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const entrySource = readFileSync(
  new URL('../src/ReferenceEntry.tsx', import.meta.url),
  'utf8',
);
const overviewSource = readFileSync(
  new URL('../src/roles/RoleOverview.tsx', import.meta.url),
  'utf8',
);
const editorSource = readFileSync(
  new URL('../src/roles/RoleEditor.tsx', import.meta.url),
  'utf8',
);
const assignmentsSource = readFileSync(
  new URL('../src/roles/RolePrincipalAssignments.tsx', import.meta.url),
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
    expect(editorSource).toContain('referenceApi.deleteRole(effectiveRoleId)');
    expect(editorSource).not.toContain('DEMO_ROLE_BUNDLES');
    expect(editorSource).not.toContain('DEMO_KNOWN_CAPABILITIES');
  });

  it('keeps system role definitions protected while allowing separate principal assignment', () => {
    expect(editorSource).toContain("persistedRole?.kind === 'system'");
    expect(editorSource).toContain('Systemrollen bleiben absichtlich außerhalb der Managed-Rollenänderungen.');
    expect(editorSource).toContain('<RolePrincipalAssignments currentRoleId={effectiveRoleId} isNew={isNew} />');
  });

  it('keeps save feedback visible and the mobile icon action accessible', () => {
    expect(editorSource).toContain("aria-label={savePending ? 'Rolle wird gespeichert' : 'Rolle speichern'}");
    expect(editorSource).toContain("feedbackRef.current?.scrollIntoView({ block: 'nearest' });");
  });

  it('does not emit an update audit write for a status-only change or a no-op save', () => {
    expect(editorSource).toContain('roleUpdateChanged(saved, updateInput)');
    expect(editorSource).toContain('hasChanges;');
  });

  it('uses an unambiguous detail route so backend-valid role IDs cannot collide with the create route', () => {
    expect(entrySource).toContain("if (hash === '#roles/new') return { kind: 'role-editor' };");
    expect(entrySource).toContain("if (hash.startsWith('#roles/view/'))");
    expect(entrySource).toContain('roleIdFromEditorHash(hash)');
    expect(overviewSource).toContain('href={roleEditorHash(role.id)}');
    expect(editorSource).toContain("window.history.replaceState(null, '', roleEditorHash(String(created.roleId)))");
  });

  it('permits hard delete only for persisted inactive unassigned managed roles', () => {
    expect(editorSource).toContain("if (role.kind === 'system')");
    expect(editorSource).toContain("if (role.state !== 'inactive')");
    expect(editorSource).toContain('if (role.assignedPrincipalCount > 0)');
    expect(editorSource).toContain('window.confirm(');
    expect(editorSource).toContain("window.location.hash = '#roles'");
  });

  it('locks all editable role controls while any role write is pending', () => {
    expect(editorSource).toContain('const writePending = savePending || deletePending;');
    expect(editorSource).toContain('fieldsDisabled={protectedSystemRole || writePending}');
    expect(editorSource).toContain('disabled={fieldsDisabled}');
    expect(editorSource).toContain('disabled={!isNew || fieldsDisabled}');
  });

  it('edits complete principal role sets through the persistent admin client', () => {
    expect(assignmentsSource).toContain('referenceApi.listRolePrincipals()');
    expect(assignmentsSource).toContain('referenceApi.listRoles()');
    expect(assignmentsSource).toContain('referenceApi.replacePrincipalRoles(');
    expect(assignmentsSource).toContain('referenceApi.getRolePrincipal(principal.principalId)');
    expect(assignmentsSource).not.toContain('DEMO_ROLE_BUNDLES');
  });

  it('never silently retains or adds inactive roles during a principal replace', () => {
    expect(assignmentsSource).toContain("role.state === 'inactive' && !currentlySelected");
    expect(assignmentsSource).toContain('selectedInactiveRole(requestedRoleIds, roleById) !== null');
    expect(assignmentsSource).toContain('Diese bestehende Zuweisung kann entfernt, aber nicht erneut vergeben werden.');
  });

  it('serializes principal assignment writes per editor and blocks no-op saves', () => {
    expect(assignmentsSource).toContain('pendingPrincipalId !== null');
    expect(assignmentsSource).toContain('sameRoleSet(requestedRoleIds, principal.roleIds)');
    expect(assignmentsSource).toContain('pendingPrincipalId === principal.principalId');
  });
});
