import { useCallback, useEffect, useMemo, useState } from 'react';

import type { RoleDetails, RoleId } from '@appbasis/permissions';

import {
  ReferenceApiError,
  referenceApi,
  type ReferenceRolePrincipal,
} from '../api';
import { Icon } from './RoleAdminShell';

interface RolePrincipalAssignmentsProps {
  readonly currentRoleId: string | undefined;
  readonly isNew: boolean;
}

type AssignmentLoadState = 'loading' | 'ready' | 'error';

export function RolePrincipalAssignments({
  currentRoleId,
  isNew,
}: RolePrincipalAssignmentsProps) {
  const [loadState, setLoadState] = useState<AssignmentLoadState>('loading');
  const [loadError, setLoadError] = useState('');
  const [principals, setPrincipals] = useState<readonly ReferenceRolePrincipal[]>([]);
  const [roles, setRoles] = useState<readonly RoleDetails[]>([]);
  const [draftRoleIds, setDraftRoleIds] = useState<Record<string, readonly RoleId[]>>({});
  const [pendingPrincipalId, setPendingPrincipalId] = useState<string | null>(null);
  const [feedbackPrincipalId, setFeedbackPrincipalId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');

  const loadAssignments = useCallback(async () => {
    if (isNew) {
      setLoadState('ready');
      setPrincipals([]);
      setRoles([]);
      setDraftRoleIds({});
      return;
    }

    setLoadState('loading');
    setLoadError('');
    setSaveError('');
    setSaveMessage('');
    try {
      const [loadedPrincipals, loadedRoles] = await Promise.all([
        referenceApi.listRolePrincipals(),
        referenceApi.listRoles(),
      ]);
      setPrincipals(loadedPrincipals);
      setRoles(loadedRoles);
      setDraftRoleIds(roleDrafts(loadedPrincipals));
      setLoadState('ready');
    } catch (error) {
      setLoadError(principalAssignmentErrorMessage(error, 'Die Benutzerzuordnungen konnten nicht geladen werden.'));
      setLoadState('error');
    }
  }, [isNew]);

  useEffect(() => {
    void loadAssignments();
  }, [loadAssignments]);

  const roleById = useMemo(
    () => new Map(roles.map((role) => [String(role.roleId), role] as const)),
    [roles],
  );

  function toggleRole(principal: ReferenceRolePrincipal, role: RoleDetails) {
    if (pendingPrincipalId !== null) return;
    const selected = currentDraft(principal);
    const roleKey = String(role.roleId);
    const currentlySelected = selected.some((candidate) => String(candidate) === roleKey);
    if (role.state === 'inactive' && !currentlySelected) return;

    setDraftRoleIds((current) => ({
      ...current,
      [principal.principalId]: currentlySelected
        ? selected.filter((candidate) => String(candidate) !== roleKey)
        : [...selected, role.roleId],
    }));
    clearFeedback();
  }

  function currentDraft(principal: ReferenceRolePrincipal): readonly RoleId[] {
    return draftRoleIds[principal.principalId] ?? principal.roleIds;
  }

  async function savePrincipal(principal: ReferenceRolePrincipal) {
    const requestedRoleIds = currentDraft(principal);
    if (
      pendingPrincipalId !== null ||
      sameRoleSet(requestedRoleIds, principal.roleIds) ||
      selectedInactiveRole(requestedRoleIds, roleById) !== null
    ) {
      return;
    }

    setPendingPrincipalId(principal.principalId);
    setFeedbackPrincipalId(principal.principalId);
    setSaveError('');
    setSaveMessage('');
    try {
      const saved = await referenceApi.replacePrincipalRoles(
        principal.principalId,
        requestedRoleIds,
      );
      replacePrincipal(saved);
      setDraftRoleIds((current) => ({
        ...current,
        [saved.principalId]: saved.roleIds,
      }));
      setSaveMessage('Die Rollenzuweisungen wurden persistent gespeichert.');
    } catch (error) {
      try {
        const [authoritativePrincipal, authoritativeRoles] = await Promise.all([
          referenceApi.getRolePrincipal(principal.principalId),
          referenceApi.listRoles(),
        ]);
        replacePrincipal(authoritativePrincipal);
        setRoles(authoritativeRoles);
        setDraftRoleIds((current) => ({
          ...current,
          [authoritativePrincipal.principalId]: authoritativePrincipal.roleIds,
        }));
      } catch {
        // Preserve the explicit write error. A manual reload remains authoritative if reconciliation fails.
      }
      setSaveError(principalAssignmentErrorMessage(error, 'Die Rollenzuweisungen konnten nicht gespeichert werden.'));
    } finally {
      setPendingPrincipalId(null);
    }
  }

  function replacePrincipal(saved: ReferenceRolePrincipal) {
    setPrincipals((current) =>
      current.map((principal) =>
        principal.principalId === saved.principalId ? saved : principal,
      ),
    );
  }

  function clearFeedback() {
    setFeedbackPrincipalId(null);
    setSaveError('');
    setSaveMessage('');
  }

  if (isNew || currentRoleId === undefined) {
    return (
      <section className="role-editor-panel ab-surface" aria-labelledby="role-users-title">
        <AssignmentHeading count={0} />
        <div className="ab-empty-state role-users-empty">
          <Icon name="users" />
          <strong>Rolle zuerst speichern</strong>
          <span>Benutzer können erst einer persistent angelegten Rolle zugewiesen werden.</span>
        </div>
      </section>
    );
  }

  if (loadState === 'loading') {
    return (
      <section className="role-editor-panel ab-surface" aria-labelledby="role-users-title">
        <AssignmentHeading count={0} />
        <div className="ab-empty-state role-users-empty" role="status">
          <Icon name="users" />
          <strong>Benutzerzuordnungen werden geladen</strong>
          <span>Identitäten und vorhandene Rollenzuweisungen werden autoritativ geladen.</span>
        </div>
      </section>
    );
  }

  if (loadState === 'error') {
    return (
      <section className="role-editor-panel ab-surface" aria-labelledby="role-users-title">
        <AssignmentHeading count={0} />
        <div className="ab-empty-state role-users-empty" role="alert">
          <Icon name="shield" />
          <strong>Benutzerzuordnungen nicht verfügbar</strong>
          <span>{loadError}</span>
          <button className="ab-button ab-button--secondary" type="button" onClick={() => void loadAssignments()}>
            Erneut versuchen
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="role-editor-panel ab-surface" aria-labelledby="role-users-title">
      <AssignmentHeading count={principals.length} />

      <div className="role-users-summary">
        <span className="roles-role-icon"><Icon name="users" /></span>
        <div>
          <strong>Mehrfachrollen bleiben erhalten</strong>
          <p>Gespeichert wird immer der vollständige Rollensatz eines Benutzers. Inaktive bestehende Zuweisungen bleiben sichtbar und müssen bewusst entfernt werden, bevor weitere Änderungen gespeichert werden können.</p>
        </div>
      </div>

      {principals.length === 0 ? (
        <div className="ab-empty-state role-users-empty">
          <Icon name="users" />
          <strong>Keine zuweisbaren Benutzer vorhanden</strong>
          <span>Es wurden keine AppBasis-Identitäten mit bestehendem Permission-Principal gefunden.</span>
        </div>
      ) : (
        <div className="role-capability-groups">
          {principals.map((principal) => {
            const selectedRoleIds = currentDraft(principal);
            const inactiveSelection = selectedInactiveRole(selectedRoleIds, roleById);
            const dirty = !sameRoleSet(selectedRoleIds, principal.roleIds);
            const pending = pendingPrincipalId === principal.principalId;
            const saveDisabled = pendingPrincipalId !== null || !dirty || inactiveSelection !== null;

            return (
              <section className="role-capability-group" key={principal.principalId}>
                <div className="role-capability-group__header">
                  <div>
                    <strong>{principal.displayName}</strong>
                    <span>@{principal.username}</span>
                  </div>
                  <button
                    className="ab-button ab-button--secondary"
                    type="button"
                    disabled={saveDisabled}
                    onClick={() => void savePrincipal(principal)}
                    title={inactiveSelection === null ? undefined : 'Entferne zuerst alle inaktiven Rollenzuweisungen.'}
                    aria-label={pending ? `Rollenzuweisungen für ${principal.displayName} werden gespeichert` : `Rollenzuweisungen für ${principal.displayName} speichern`}
                  >
                    {pending ? 'Speichert …' : 'Speichern'}
                  </button>
                </div>

                {feedbackPrincipalId === principal.principalId && saveError.length > 0 && (
                  <aside className="role-editor-notice role-editor-notice--protected" role="alert">
                    <Icon name="shield" />
                    <div><strong>Speichern fehlgeschlagen</strong><p>{saveError}</p></div>
                  </aside>
                )}
                {feedbackPrincipalId === principal.principalId && saveMessage.length > 0 && (
                  <aside className="role-editor-notice" role="status" aria-live="polite">
                    <Icon name="check" />
                    <div><strong>Gespeichert</strong><p>{saveMessage}</p></div>
                  </aside>
                )}
                {inactiveSelection !== null && (
                  <aside className="role-editor-notice role-editor-notice--protected" role="note">
                    <Icon name="info" />
                    <div>
                      <strong>Inaktive Zuweisung entfernen</strong>
                      <p>„{inactiveSelection.displayName}“ ist inaktiv. Diese bestehende Zuweisung kann entfernt, aber nicht erneut vergeben werden.</p>
                    </div>
                  </aside>
                )}

                <div className="role-capability-options">
                  {roles.map((role) => {
                    const roleKey = String(role.roleId);
                    const selected = selectedRoleIds.some((candidate) => String(candidate) === roleKey);
                    const inactive = role.state === 'inactive';
                    const disabled = pendingPrincipalId !== null || (inactive && !selected);
                    const current = roleKey === currentRoleId;
                    return (
                      <label className="role-capability-option" key={roleKey}>
                        <input
                          type="checkbox"
                          checked={selected}
                          disabled={disabled}
                          onChange={() => toggleRole(principal, role)}
                        />
                        <span className="role-capability-option__check" aria-hidden="true">{selected && <Icon name="check" />}</span>
                        <span>
                          <strong>{role.displayName}{current ? ' · aktuelle Rolle' : ''}</strong>
                          <code>{roleKey}{inactive ? ' · inaktiv' : ''}</code>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}

function AssignmentHeading({ count }: { readonly count: number }) {
  return (
    <div className="role-editor-section-heading">
      <div><h2 id="role-users-title">Benutzer</h2><p>Eine Person kann mehrere Rollen gleichzeitig erhalten.</p></div>
      <span className="ab-badge">{count} Benutzer</span>
    </div>
  );
}

function roleDrafts(principals: readonly ReferenceRolePrincipal[]): Record<string, readonly RoleId[]> {
  const drafts: Record<string, readonly RoleId[]> = {};
  for (const principal of principals) drafts[principal.principalId] = principal.roleIds;
  return drafts;
}

function selectedInactiveRole(
  selectedRoleIds: readonly RoleId[],
  roleById: ReadonlyMap<string, RoleDetails>,
): RoleDetails | null {
  for (const selectedRoleId of selectedRoleIds) {
    const role = roleById.get(String(selectedRoleId));
    if (role?.state === 'inactive') return role;
  }
  return null;
}

function sameRoleSet(left: readonly RoleId[], right: readonly RoleId[]): boolean {
  if (left.length !== right.length) return false;
  const leftValues = left.map(String).sort();
  const rightValues = right.map(String).sort();
  return leftValues.every((value, index) => value === rightValues[index]);
}

function principalAssignmentErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ReferenceApiError)) return fallback;
  if (error.status === 0) return 'Das Backend ist derzeit nicht erreichbar. Bitte Verbindung prüfen und erneut versuchen.';
  if (error.status === 401) return 'Die Anmeldung ist nicht mehr gültig. Bitte erneut anmelden.';
  if (error.status === 403) return 'Für diese Rollenzuweisung fehlt die erforderliche Berechtigung.';
  if (error.code === 'PRINCIPAL_NOT_FOUND') return 'Der Benutzer ist nicht mehr für Rollenzuweisungen verfügbar. Bitte neu laden.';
  if (error.code === 'ROLE_NOT_FOUND') return 'Mindestens eine ausgewählte Rolle ist nicht mehr aktiv oder verfügbar. Der aktuelle Serverstand wurde neu geladen.';
  if (error.status === 503 || error.code === 'REFERENCE_ROLE_ADMIN_NOT_CONFIGURED') return 'Die persistente Rollenverwaltung ist in dieser Umgebung derzeit nicht verfügbar.';
  return fallback;
}
