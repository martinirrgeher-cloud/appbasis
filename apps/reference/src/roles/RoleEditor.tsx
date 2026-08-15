import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { CapabilityId, RoleDetails } from '@appbasis/permissions';

import { ReferenceApiError, referenceApi, type ReferenceRoleUpdateInput } from '../api';
import { Icon, RoleAdminShell } from './RoleAdminShell';
import { roleLabel } from './role-overview-model';
import { roleEditorHash } from './role-route';
import './role-editor.css';

type RoleEditorTab = 'general' | 'permissions' | 'users';
type LoadState = 'loading' | 'ready' | 'error';

const ROLE_ID_PATTERN = /^[a-z0-9][a-z0-9:_-]{0,119}$/;

export function RoleEditor({ roleId }: { readonly roleId?: string }) {
  const feedbackRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<RoleEditorTab>('general');
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [savePending, setSavePending] = useState(false);
  const [knownCapabilities, setKnownCapabilities] = useState<readonly CapabilityId[]>([]);
  const [persistedRole, setPersistedRole] = useState<RoleDetails | null>(null);
  const [effectiveRoleId, setEffectiveRoleId] = useState<string | undefined>(roleId);
  const [displayName, setDisplayName] = useState('');
  const [technicalId, setTechnicalId] = useState(roleId ?? '');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);
  const [selectedCapabilities, setSelectedCapabilities] = useState<readonly CapabilityId[]>([]);

  const applyRole = useCallback((role: RoleDetails) => {
    setPersistedRole(role);
    setEffectiveRoleId(String(role.roleId));
    setDisplayName(role.displayName);
    setTechnicalId(String(role.roleId));
    setDescription(role.description ?? '');
    setActive(role.state === 'active');
    setSelectedCapabilities(role.capabilities);
  }, []);

  const loadRoleData = useCallback(async () => {
    setLoadState('loading');
    setLoadError('');
    setSaveError('');
    setSaveMessage('');
    try {
      const [capabilities, loadedRole] = await Promise.all([
        referenceApi.listRoleCapabilities(),
        roleId === undefined ? Promise.resolve(null) : referenceApi.getRole(roleId),
      ]);
      setKnownCapabilities(capabilities);
      if (loadedRole === null) {
        setPersistedRole(null);
        setEffectiveRoleId(undefined);
        setDisplayName('');
        setTechnicalId('');
        setDescription('');
        setActive(true);
        setSelectedCapabilities([]);
      } else {
        applyRole(loadedRole);
      }
      setLoadState('ready');
    } catch (error) {
      setLoadError(roleAdminErrorMessage(error, 'Die Rolle konnte nicht geladen werden.'));
      setLoadState('error');
    }
  }, [applyRole, roleId]);

  useEffect(() => {
    void loadRoleData();
  }, [loadRoleData]);

  const isNew = effectiveRoleId === undefined;
  const protectedSystemRole = persistedRole?.kind === 'system';
  const title = isNew ? 'Neue Rolle' : displayName || roleLabel(effectiveRoleId);
  const subtitle = isNew
    ? 'Managed Rolle anlegen'
    : `${protectedSystemRole ? 'Systemrolle' : 'Managed Rolle'} · ${effectiveRoleId}`;
  const validationMessage = useMemo(
    () => roleValidationMessage(displayName, technicalId, isNew),
    [displayName, technicalId, isNew],
  );
  const updateInput = useMemo<ReferenceRoleUpdateInput>(
    () => ({
      displayName: displayName.trim(),
      description: normalizedDescription(description),
      capabilities: selectedCapabilities,
    }),
    [description, displayName, selectedCapabilities],
  );
  const requestedState = active ? 'active' : 'inactive';
  const hasChanges =
    isNew ||
    (persistedRole !== null &&
      (roleUpdateChanged(persistedRole, updateInput) || persistedRole.state !== requestedState));
  const canSave =
    loadState === 'ready' &&
    !savePending &&
    !protectedSystemRole &&
    validationMessage === null &&
    hasChanges;
  const saveTitle = protectedSystemRole
    ? 'Systemrollen sind geschützt.'
    : validationMessage ?? (hasChanges ? undefined : 'Keine Änderungen zum Speichern.');

  function clearFeedback() {
    setSaveError('');
    setSaveMessage('');
  }

  function revealFeedback() {
    window.requestAnimationFrame(() => {
      feedbackRef.current?.scrollIntoView({ block: 'nearest' });
    });
  }

  function toggleCapability(capability: CapabilityId) {
    if (protectedSystemRole || savePending) return;
    clearFeedback();
    setSelectedCapabilities((current) =>
      current.includes(capability)
        ? current.filter((candidate) => candidate !== capability)
        : [...current, capability],
    );
  }

  async function saveRole() {
    if (!canSave) return;
    setSavePending(true);
    clearFeedback();

    try {
      if (isNew) {
        const created = await referenceApi.createRole({
          roleId: technicalId.trim(),
          ...updateInput,
        });
        applyRole(created);
        window.history.replaceState(null, '', roleEditorHash(String(created.roleId)));
        setSaveMessage('Die Rolle wurde persistent angelegt.');
      } else if (persistedRole !== null) {
        let saved = persistedRole;
        if (roleUpdateChanged(saved, updateInput)) {
          saved = await referenceApi.updateRole(effectiveRoleId, updateInput);
        }
        if (saved.state !== requestedState) {
          saved = await referenceApi.setRoleState(effectiveRoleId, requestedState);
        }
        applyRole(saved);
        setSaveMessage('Die Rolle wurde persistent gespeichert.');
      }
      revealFeedback();
    } catch (error) {
      if (!isNew && effectiveRoleId !== undefined) {
        try {
          const authoritativeRole = await referenceApi.getRole(effectiveRoleId);
          applyRole(authoritativeRole);
        } catch {
          // Keep the explicit write failure below; the next retry/load remains authoritative.
        }
      }
      setSaveError(roleAdminErrorMessage(error, 'Die Rolle konnte nicht gespeichert werden.'));
      revealFeedback();
    } finally {
      setSavePending(false);
    }
  }

  if (loadState === 'loading') {
    return (
      <RoleAdminShell>
        <div className="roles-content">
          <div className="ab-empty-state ab-surface" role="status">
            <Icon name="roles" />
            <strong>Rollenverwaltung wird geladen</strong>
            <span>Rolle und bekannte Capabilities werden aus der persistenten Permission-Authority geladen.</span>
          </div>
        </div>
      </RoleAdminShell>
    );
  }

  if (loadState === 'error') {
    return (
      <RoleAdminShell>
        <div className="roles-content">
          <div className="ab-empty-state ab-surface" role="alert">
            <Icon name="shield" />
            <strong>{loadError.startsWith('Die angeforderte Rolle') ? 'Rolle nicht gefunden' : 'Rollenverwaltung nicht verfügbar'}</strong>
            <span>{loadError}</span>
            <button className="ab-button ab-button--secondary" type="button" onClick={() => void loadRoleData()}>
              Erneut versuchen
            </button>
            <a className="ab-button ab-button--secondary" href="#roles">Zur Rollenübersicht</a>
          </div>
        </div>
      </RoleAdminShell>
    );
  }

  return (
    <RoleAdminShell>
      <div className="role-editor">
        <header className="role-editor-header">
          <div className="role-editor-header__main">
            <a className="role-editor-back" href="#roles" aria-label="Zur Rollenübersicht">
              <span aria-hidden="true">‹</span>
              <span>Rollen</span>
            </a>

            <div className="role-editor-title">
              <div>
                <p className="roles-eyebrow">Rolle bearbeiten</p>
                <h1>{title}</h1>
                <p>{subtitle}</p>
              </div>
              <div className="role-editor-actions">
                <button
                  className="ab-button ab-button--primary role-editor-save"
                  type="button"
                  disabled={!canSave}
                  onClick={() => void saveRole()}
                  title={saveTitle}
                  aria-label={savePending ? 'Rolle wird gespeichert' : 'Rolle speichern'}
                >
                  <Icon name="save" />
                  <span>{savePending ? 'Speichert …' : 'Speichern'}</span>
                </button>
                <a className="ab-icon-button ab-icon-button--ghost role-editor-close" href="#roles" aria-label="Editor schließen">
                  <Icon name="close" />
                </a>
              </div>
            </div>
          </div>

          <nav className="role-editor-tabs" aria-label="Rollenbereiche" role="tablist">
            <EditorTab id="general" activeTab={activeTab} onSelect={setActiveTab}>Allgemein</EditorTab>
            <EditorTab id="permissions" activeTab={activeTab} onSelect={setActiveTab}>Berechtigungen</EditorTab>
            <EditorTab id="users" activeTab={activeTab} onSelect={setActiveTab}>Benutzer</EditorTab>
          </nav>
        </header>

        <div className="role-editor-content">
          <aside className={`role-editor-notice${protectedSystemRole ? ' role-editor-notice--protected' : ''}`} role="note">
            <Icon name={protectedSystemRole ? 'shield' : 'info'} />
            <div>
              <strong>{protectedSystemRole ? 'Geschützte Systemrolle' : 'Persistente Managed Rolle'}</strong>
              <p>
                {protectedSystemRole
                  ? 'Systemrollen bleiben absichtlich außerhalb der Managed-Rollenänderungen.'
                  : isNew
                    ? 'Speichern legt diese Rolle über den geschützten internen Rollenservice an. Neue Rollen starten aktiv.'
                    : 'Änderungen werden über den geschützten internen Rollenservice in der persistenten Permission-Authority gespeichert.'}
              </p>
            </div>
          </aside>

          {(saveError.length > 0 || saveMessage.length > 0) && (
            <div ref={feedbackRef}>
              {saveError.length > 0 && (
                <aside className="role-editor-notice role-editor-notice--protected" role="alert">
                  <Icon name="shield" />
                  <div><strong>Speichern fehlgeschlagen</strong><p>{saveError}</p></div>
                </aside>
              )}
              {saveMessage.length > 0 && (
                <aside className="role-editor-notice" role="status" aria-live="polite">
                  <Icon name="check" />
                  <div><strong>Gespeichert</strong><p>{saveMessage}</p></div>
                </aside>
              )}
            </div>
          )}

          {activeTab === 'general' && (
            <GeneralTab
              isNew={isNew}
              protectedSystemRole={protectedSystemRole}
              fieldsDisabled={protectedSystemRole || savePending}
              statusDisabled={isNew || protectedSystemRole || savePending}
              displayName={displayName}
              technicalId={technicalId}
              description={description}
              active={active}
              onDisplayNameChange={(value) => { setDisplayName(value); clearFeedback(); }}
              onTechnicalIdChange={(value) => { setTechnicalId(value); clearFeedback(); }}
              onDescriptionChange={(value) => { setDescription(value); clearFeedback(); }}
              onActiveChange={(value) => { setActive(value); clearFeedback(); }}
            />
          )}

          {activeTab === 'permissions' && (
            <PermissionsTab
              protectedSystemRole={protectedSystemRole || savePending}
              knownCapabilities={knownCapabilities}
              selectedCapabilities={selectedCapabilities}
              onToggleCapability={toggleCapability}
            />
          )}

          {activeTab === 'users' && <UsersTab protectedSystemRole={protectedSystemRole} />}
        </div>
      </div>
    </RoleAdminShell>
  );
}

function EditorTab({ id, activeTab, onSelect, children }: {
  readonly id: RoleEditorTab;
  readonly activeTab: RoleEditorTab;
  readonly onSelect: (tab: RoleEditorTab) => void;
  readonly children: string;
}) {
  const active = activeTab === id;
  return (
    <button className={`role-editor-tab${active ? ' role-editor-tab--active' : ''}`} type="button" aria-selected={active} role="tab" onClick={() => onSelect(id)}>
      {children}
    </button>
  );
}

function GeneralTab({
  isNew, protectedSystemRole, fieldsDisabled, statusDisabled, displayName, technicalId, description, active,
  onDisplayNameChange, onTechnicalIdChange, onDescriptionChange, onActiveChange,
}: {
  readonly isNew: boolean;
  readonly protectedSystemRole: boolean;
  readonly fieldsDisabled: boolean;
  readonly statusDisabled: boolean;
  readonly displayName: string;
  readonly technicalId: string;
  readonly description: string;
  readonly active: boolean;
  readonly onDisplayNameChange: (value: string) => void;
  readonly onTechnicalIdChange: (value: string) => void;
  readonly onDescriptionChange: (value: string) => void;
  readonly onActiveChange: (value: boolean) => void;
}) {
  return (
    <section className="role-editor-panel ab-surface" aria-labelledby="role-general-title">
      <div className="role-editor-section-heading">
        <div><h2 id="role-general-title">Allgemeine Informationen</h2><p>Name, Beschreibung und Lifecycle der Rolle.</p></div>
        <span className="ab-badge ab-badge--info">{protectedSystemRole ? 'System' : 'Managed'}</span>
      </div>
      <div className="role-editor-form-grid">
        <label className="role-editor-field">
          <span>Anzeigename</span>
          <input className="ab-input" value={displayName} onChange={(event) => onDisplayNameChange(event.target.value)} placeholder="z. B. Trainer" disabled={fieldsDisabled} maxLength={120} />
          <small>Dieser Name wird Administratoren und Benutzern angezeigt.</small>
        </label>
        <label className="role-editor-field">
          <span>Technische Role-ID</span>
          <input className="ab-input" value={technicalId} onChange={(event) => onTechnicalIdChange(event.target.value)} placeholder="z. B. training:trainer" disabled={!isNew || fieldsDisabled} maxLength={120} autoCapitalize="none" spellCheck={false} />
          <small>Nach dem Anlegen stabil und nicht mehr änderbar.</small>
        </label>
        <label className="role-editor-field role-editor-field--wide">
          <span>Beschreibung</span>
          <textarea className="role-editor-textarea" value={description} onChange={(event) => onDescriptionChange(event.target.value)} placeholder="Kurz erklären, wofür diese Rolle gedacht ist …" rows={4} disabled={fieldsDisabled} maxLength={500} />
          <small>Maximal 500 Zeichen.</small>
        </label>
        <div className="role-editor-status role-editor-field--wide">
          <div>
            <strong>Status</strong>
            <span>{isNew ? 'Neue Rollen werden aktiv angelegt. Danach kann der Status geändert werden.' : active ? 'Aktive Rollen können über ihre Zuweisungen Berechtigungen erteilen.' : 'Inaktive Rollen bleiben zugewiesen, erteilen aber keine Rechte.'}</span>
          </div>
          <label className="role-switch">
            <span className="sr-only">Rolle aktiv</span>
            <input type="checkbox" checked={active} disabled={statusDisabled} onChange={(event) => onActiveChange(event.target.checked)} />
            <span className="role-switch__track" aria-hidden="true"><span /></span>
            <strong>{active ? 'Aktiv' : 'Inaktiv'}</strong>
          </label>
        </div>
      </div>
    </section>
  );
}

function PermissionsTab({ protectedSystemRole, knownCapabilities, selectedCapabilities, onToggleCapability }: {
  readonly protectedSystemRole: boolean;
  readonly knownCapabilities: readonly CapabilityId[];
  readonly selectedCapabilities: readonly CapabilityId[];
  readonly onToggleCapability: (capability: CapabilityId) => void;
}) {
  const groups = groupCapabilities(knownCapabilities);
  return (
    <section className="role-editor-panel ab-surface" aria-labelledby="role-permissions-title">
      <div className="role-editor-section-heading">
        <div><h2 id="role-permissions-title">Berechtigungen</h2><p>Capabilities werden aus dem persistenten Permission-Modell zugewiesen.</p></div>
        <span className="ab-badge ab-badge--info">{selectedCapabilities.length} gewählt</span>
      </div>
      {groups.length === 0 ? (
        <div className="ab-empty-state"><Icon name="shield" /><strong>Keine Capabilities verfügbar</strong><span>Der Rollenservice hat keine zuweisbaren Capabilities geliefert.</span></div>
      ) : (
        <div className="role-capability-groups">
          {groups.map((group) => (
            <section className="role-capability-group" key={group.id}>
              <div className="role-capability-group__header"><strong>{capabilityGroupLabel(group.id)}</strong><span>{group.capabilities.length}</span></div>
              <div className="role-capability-options">
                {group.capabilities.map((capability) => {
                  const selected = selectedCapabilities.includes(capability);
                  return (
                    <label className="role-capability-option" key={capability}>
                      <input type="checkbox" checked={selected} disabled={protectedSystemRole} onChange={() => onToggleCapability(capability)} />
                      <span className="role-capability-option__check" aria-hidden="true">{selected && <Icon name="check" />}</span>
                      <span><strong>{capabilityLabel(capability)}</strong><code>{capability}</code></span>
                    </label>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

function UsersTab({ protectedSystemRole }: { readonly protectedSystemRole: boolean }) {
  return (
    <section className="role-editor-panel ab-surface" aria-labelledby="role-users-title">
      <div className="role-editor-section-heading">
        <div><h2 id="role-users-title">Benutzer</h2><p>Eine Person kann mehrere Rollen gleichzeitig erhalten.</p></div>
        <span className="ab-badge">Mehrfachrollen</span>
      </div>
      <div className="role-users-summary">
        <span className="roles-role-icon"><Icon name="users" /></span>
        <div>
          <strong>Benutzerzuordnung bleibt ein eigener Lifecycle-Slice</strong>
          <p>`PrincipalPermissions.roleIds[]` und die persistente Principal-Role-Tabelle unterstützen mehrere Rollen. Dieser Editor verändert bis zur dedizierten Benutzerzuordnung ausschließlich die Rolle selbst.</p>
        </div>
      </div>
      <div className="ab-empty-state role-users-empty">
        <Icon name="users" />
        <strong>Noch keine Benutzerzuordnung in diesem Editor</strong>
        <span>{protectedSystemRole ? 'Systemrollenzuweisungen bleiben geschützt.' : 'Zuweisungen werden erst mit dem separaten Principal-Role-UI-Vertrag freigeschaltet.'}</span>
      </div>
    </section>
  );
}

function groupCapabilities(capabilities: readonly CapabilityId[]) {
  const groups = new Map<string, CapabilityId[]>();
  for (const capability of capabilities) {
    const raw = String(capability);
    const separator = raw.indexOf(':');
    const group = separator === -1 ? 'app' : raw.slice(0, separator);
    const current = groups.get(group) ?? [];
    current.push(capability);
    groups.set(group, current);
  }
  return [...groups.entries()].map(([id, entries]) => ({ id, capabilities: entries })).sort((left, right) => left.id.localeCompare(right.id, 'de'));
}

function capabilityGroupLabel(group: string) {
  const labels: Record<string, string> = { app: 'App', tasks: 'Aufgaben', users: 'Benutzer' };
  return labels[group] ?? roleLabel(group);
}

function capabilityLabel(capability: CapabilityId) {
  const labels: Record<string, string> = { 'app:use': 'App verwenden', 'tasks:manage': 'Aufgaben verwalten', 'users:manage': 'Benutzer verwalten' };
  return labels[String(capability)] ?? roleLabel(String(capability).replace(':', '-'));
}

function normalizedDescription(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function roleValidationMessage(displayName: string, technicalId: string, isNew: boolean): string | null {
  if (displayName.trim().length === 0) return 'Bitte einen Anzeigenamen eingeben.';
  if (!isNew) return null;
  if (!ROLE_ID_PATTERN.test(technicalId.trim())) {
    return 'Die Role-ID muss mit Kleinbuchstabe oder Zahl beginnen und darf nur Kleinbuchstaben, Zahlen, Doppelpunkt, Unterstrich und Bindestrich enthalten.';
  }
  return null;
}

function roleUpdateChanged(role: RoleDetails, input: ReferenceRoleUpdateInput): boolean {
  return (
    role.displayName !== input.displayName ||
    role.description !== input.description ||
    !sameCapabilities(role.capabilities, input.capabilities)
  );
}

function sameCapabilities(left: readonly CapabilityId[], right: readonly CapabilityId[]): boolean {
  if (left.length !== right.length) return false;
  const leftValues = left.map(String).sort();
  const rightValues = right.map(String).sort();
  return leftValues.every((value, index) => value === rightValues[index]);
}

function roleAdminErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ReferenceApiError)) return fallback;
  if (error.status === 0) return 'Das Backend ist derzeit nicht erreichbar. Bitte Verbindung prüfen und erneut versuchen.';
  if (error.status === 401) return 'Die Anmeldung ist nicht mehr gültig. Bitte erneut anmelden.';
  if (error.status === 403) return 'Für diese Rollenänderung fehlt die erforderliche Berechtigung.';
  if (error.code === 'ROLE_NOT_FOUND') return 'Die angeforderte Rolle wurde nicht gefunden.';
  if (error.code === 'ROLE_PROTECTED') return 'Diese Systemrolle ist geschützt und kann nicht verändert werden.';
  if (error.code === 'UNKNOWN_CAPABILITY') return 'Mindestens eine ausgewählte Berechtigung ist nicht mehr verfügbar. Der aktuelle Serverstand wurde neu geladen.';
  if (error.code === 'INVALID_ROLE') return 'Die Rollendaten sind ungültig oder die Role-ID ist bereits vergeben.';
  if (error.status === 503 || error.code === 'REFERENCE_ROLE_ADMIN_NOT_CONFIGURED') return 'Die persistente Rollenverwaltung ist in dieser Umgebung derzeit nicht verfügbar.';
  return fallback;
}
