import { useMemo, useState } from 'react';

import {
  DEMO_KNOWN_CAPABILITIES,
  DEMO_ROLE_BUNDLES,
  type CapabilityId,
} from '@appbasis/permissions';

import { Icon, RoleAdminShell } from './RoleAdminShell';
import { roleLabel } from './role-overview-model';
import './role-editor.css';

type RoleEditorTab = 'general' | 'permissions' | 'users';

export function RoleEditor({ roleId }: { readonly roleId?: string }) {
  const existingRole = useMemo(
    () => DEMO_ROLE_BUNDLES.find((role) => String(role.roleId) === roleId),
    [roleId],
  );
  const isNew = roleId === undefined;
  const [activeTab, setActiveTab] = useState<RoleEditorTab>('general');
  const [displayName, setDisplayName] = useState(isNew ? '' : roleLabel(roleId));
  const [technicalId, setTechnicalId] = useState(isNew ? '' : roleId);
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);
  const [selectedCapabilities, setSelectedCapabilities] = useState<readonly CapabilityId[]>(
    existingRole?.capabilities ?? [],
  );

  if (!isNew && existingRole === undefined) {
    return (
      <RoleAdminShell>
        <div className="roles-content">
          <div className="ab-empty-state ab-surface">
            <Icon name="shield" />
            <strong>Rolle nicht gefunden</strong>
            <span>Die angeforderte Role-ID ist in der Reference-App nicht vorhanden.</span>
            <a className="ab-button ab-button--secondary" href="#roles">Zur Rollenübersicht</a>
          </div>
        </div>
      </RoleAdminShell>
    );
  }

  const protectedSystemRole = !isNew;
  const title = isNew ? 'Neue Rolle' : displayName;
  const subtitle = isNew ? 'Managed Rolle anlegen' : `Systemrolle · ${technicalId}`;

  function toggleCapability(capability: CapabilityId) {
    if (protectedSystemRole) return;
    setSelectedCapabilities((current) =>
      current.includes(capability)
        ? current.filter((candidate) => candidate !== capability)
        : [...current, capability],
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
                <h1>{title || 'Neue Rolle'}</h1>
                <p>{subtitle}</p>
              </div>
              <div className="role-editor-actions">
                <button
                  className="ab-button ab-button--primary role-editor-save"
                  type="button"
                  disabled
                  title="Persistentes Speichern wird erst verdrahtet, wenn die Reference-Runtime dieselbe PostgreSQL-Permission-Authority verwendet."
                >
                  <Icon name="save" />
                  <span>Speichern</span>
                </button>
                <a className="ab-icon-button ab-icon-button--ghost role-editor-close" href="#roles" aria-label="Editor schließen">
                  <Icon name="close" />
                </a>
              </div>
            </div>
          </div>

          <nav className="role-editor-tabs" aria-label="Rollenbereiche">
            <EditorTab id="general" activeTab={activeTab} onSelect={setActiveTab}>Allgemein</EditorTab>
            <EditorTab id="permissions" activeTab={activeTab} onSelect={setActiveTab}>Berechtigungen</EditorTab>
            <EditorTab id="users" activeTab={activeTab} onSelect={setActiveTab}>Benutzer</EditorTab>
          </nav>
        </header>

        <div className="role-editor-content">
          <aside className={`role-editor-notice${protectedSystemRole ? ' role-editor-notice--protected' : ''}`} role="note">
            <Icon name={protectedSystemRole ? 'shield' : 'info'} />
            <div>
              <strong>{protectedSystemRole ? 'Geschützte Systemrolle' : 'UI-Referenz für Managed Rollen'}</strong>
              <p>
                {protectedSystemRole
                  ? 'Systemrollen sind im neuen Lifecycle absichtlich nicht über die Managed-Rollenverwaltung veränderbar.'
                  : 'Die Felder und Interaktionen sind bereits verbindlich gestaltet. Speichern bleibt in der Reference-App deaktiviert, bis ihre Laufzeit-Rechte auf dieselbe persistente Permission-Authority umgestellt werden.'}
              </p>
            </div>
          </aside>

          {activeTab === 'general' && (
            <GeneralTab
              isNew={isNew}
              protectedSystemRole={protectedSystemRole}
              displayName={displayName}
              technicalId={technicalId}
              description={description}
              active={active}
              onDisplayNameChange={setDisplayName}
              onTechnicalIdChange={setTechnicalId}
              onDescriptionChange={setDescription}
              onActiveChange={setActive}
            />
          )}

          {activeTab === 'permissions' && (
            <PermissionsTab
              protectedSystemRole={protectedSystemRole}
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

function EditorTab({
  id,
  activeTab,
  onSelect,
  children,
}: {
  readonly id: RoleEditorTab;
  readonly activeTab: RoleEditorTab;
  readonly onSelect: (tab: RoleEditorTab) => void;
  readonly children: string;
}) {
  const active = activeTab === id;
  return (
    <button
      className={`role-editor-tab${active ? ' role-editor-tab--active' : ''}`}
      type="button"
      aria-selected={active}
      role="tab"
      onClick={() => onSelect(id)}
    >
      {children}
    </button>
  );
}

function GeneralTab({
  isNew,
  protectedSystemRole,
  displayName,
  technicalId,
  description,
  active,
  onDisplayNameChange,
  onTechnicalIdChange,
  onDescriptionChange,
  onActiveChange,
}: {
  readonly isNew: boolean;
  readonly protectedSystemRole: boolean;
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
        <div>
          <h2 id="role-general-title">Allgemeine Informationen</h2>
          <p>Name, Beschreibung und Lifecycle der Rolle.</p>
        </div>
        <span className="ab-badge ab-badge--info">{protectedSystemRole ? 'System' : 'Managed'}</span>
      </div>

      <div className="role-editor-form-grid">
        <label className="role-editor-field">
          <span>Anzeigename</span>
          <input
            className="ab-input"
            value={displayName}
            onChange={(event) => onDisplayNameChange(event.target.value)}
            placeholder="z. B. Trainer"
            disabled={protectedSystemRole}
            maxLength={120}
          />
          <small>Dieser Name wird Administratoren und Benutzern angezeigt.</small>
        </label>

        <label className="role-editor-field">
          <span>Technische Role-ID</span>
          <input
            className="ab-input"
            value={technicalId}
            onChange={(event) => onTechnicalIdChange(event.target.value)}
            placeholder="z. B. training:trainer"
            disabled={!isNew}
            autoCapitalize="none"
            spellCheck={false}
          />
          <small>Nach dem Anlegen stabil und nicht mehr änderbar.</small>
        </label>

        <label className="role-editor-field role-editor-field--wide">
          <span>Beschreibung</span>
          <textarea
            className="role-editor-textarea"
            value={description}
            onChange={(event) => onDescriptionChange(event.target.value)}
            placeholder="Kurz erklären, wofür diese Rolle gedacht ist …"
            rows={4}
            disabled={protectedSystemRole}
            maxLength={500}
          />
          <small>Maximal 500 Zeichen.</small>
        </label>

        <div className="role-editor-status role-editor-field--wide">
          <div>
            <strong>Status</strong>
            <span>
              {active
                ? 'Aktive Rollen können über ihre Zuweisungen Berechtigungen erteilen.'
                : 'Inaktive Rollen bleiben zugewiesen, erteilen aber keine Rechte.'}
            </span>
          </div>
          <label className="role-switch">
            <span className="sr-only">Rolle aktiv</span>
            <input
              type="checkbox"
              checked={active}
              disabled={protectedSystemRole}
              onChange={(event) => onActiveChange(event.target.checked)}
            />
            <span className="role-switch__track" aria-hidden="true"><span /></span>
            <strong>{active ? 'Aktiv' : 'Inaktiv'}</strong>
          </label>
        </div>
      </div>
    </section>
  );
}

function PermissionsTab({
  protectedSystemRole,
  selectedCapabilities,
  onToggleCapability,
}: {
  readonly protectedSystemRole: boolean;
  readonly selectedCapabilities: readonly CapabilityId[];
  readonly onToggleCapability: (capability: CapabilityId) => void;
}) {
  const groups = groupCapabilities(DEMO_KNOWN_CAPABILITIES);

  return (
    <section className="role-editor-panel ab-surface" aria-labelledby="role-permissions-title">
      <div className="role-editor-section-heading">
        <div>
          <h2 id="role-permissions-title">Berechtigungen</h2>
          <p>Capabilities werden aus dem bestehenden Permission-Modell zugewiesen.</p>
        </div>
        <span className="ab-badge ab-badge--info">{selectedCapabilities.length} gewählt</span>
      </div>

      <div className="role-capability-groups">
        {groups.map((group) => (
          <section className="role-capability-group" key={group.id}>
            <div className="role-capability-group__header">
              <strong>{capabilityGroupLabel(group.id)}</strong>
              <span>{group.capabilities.length}</span>
            </div>
            <div className="role-capability-options">
              {group.capabilities.map((capability) => {
                const selected = selectedCapabilities.includes(capability);
                return (
                  <label className="role-capability-option" key={capability}>
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={protectedSystemRole}
                      onChange={() => onToggleCapability(capability)}
                    />
                    <span className="role-capability-option__check" aria-hidden="true">
                      {selected && <Icon name="check" />}
                    </span>
                    <span>
                      <strong>{capabilityLabel(capability)}</strong>
                      <code>{capability}</code>
                    </span>
                  </label>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function UsersTab({ protectedSystemRole }: { readonly protectedSystemRole: boolean }) {
  return (
    <section className="role-editor-panel ab-surface" aria-labelledby="role-users-title">
      <div className="role-editor-section-heading">
        <div>
          <h2 id="role-users-title">Benutzer</h2>
          <p>Eine Person kann mehrere Rollen gleichzeitig erhalten.</p>
        </div>
        <span className="ab-badge">Mehrfachrollen</span>
      </div>

      <div className="role-users-summary">
        <span className="roles-role-icon"><Icon name="users" /></span>
        <div>
          <strong>Benutzerzuordnung ist im Permission-Modell vorbereitet</strong>
          <p>
            `PrincipalPermissions.roleIds[]` und die persistente Principal-Role-Tabelle unterstützen mehrere Rollen.
            In der Reference-App wird die Benutzerliste erst angebunden, wenn ihre Runtime dieselbe persistente
            Permission-Authority verwendet.
          </p>
        </div>
      </div>

      <div className="ab-empty-state role-users-empty">
        <Icon name="users" />
        <strong>Noch keine persistente Benutzeransicht</strong>
        <span>{protectedSystemRole ? 'Systemrollenzuweisungen werden hier später nur lesend bzw. geschützt angezeigt.' : 'Nach der Runtime-Anbindung können Benutzer hier gesucht und mehrfach zugewiesen werden.'}</span>
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

  return [...groups.entries()]
    .map(([id, entries]) => ({ id, capabilities: entries }))
    .sort((left, right) => left.id.localeCompare(right.id, 'de'));
}

function capabilityGroupLabel(group: string) {
  const labels: Record<string, string> = {
    app: 'App',
    tasks: 'Aufgaben',
    users: 'Benutzer',
  };
  return labels[group] ?? roleLabel(group);
}

function capabilityLabel(capability: CapabilityId) {
  const labels: Record<string, string> = {
    'app:use': 'App verwenden',
    'tasks:manage': 'Aufgaben verwalten',
    'users:manage': 'Benutzer verwalten',
  };
  return labels[String(capability)] ?? roleLabel(String(capability).replace(':', '-'));
}
