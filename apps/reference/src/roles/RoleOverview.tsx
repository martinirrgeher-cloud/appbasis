import { useMemo, useState } from 'react';

import { DEMO_KNOWN_CAPABILITIES, DEMO_ROLE_BUNDLES } from '@appbasis/permissions';

import { Icon, RoleAdminShell, type IconName } from './RoleAdminShell';
import {
  filterRoleOverviewItems,
  toRoleOverviewItems,
  type RoleOverviewItem,
} from './role-overview-model';
import './role-overview.css';

const roles = toRoleOverviewItems(DEMO_ROLE_BUNDLES);

export function RoleOverview() {
  const [query, setQuery] = useState('');
  const visibleRoles = useMemo(() => filterRoleOverviewItems(roles, query), [query]);

  return (
    <RoleAdminShell>
      <div className="roles-content">
        <header className="ab-page-header roles-page-header">
          <div className="ab-page-header__copy">
            <p className="roles-eyebrow">Administration</p>
            <h1 className="ab-page-title">Rollen</h1>
            <p className="ab-page-summary">Rollen und ihre vorhandenen Berechtigungen verwalten.</p>
          </div>
          <a className="ab-button ab-button--primary roles-create-button" href="#roles/new">
            <Icon name="plus" />
            <span>Rolle anlegen</span>
          </a>
        </header>

        <section className="roles-toolbar" aria-label="Rollen filtern">
          <label className="roles-search">
            <span className="roles-search__icon" aria-hidden="true"><Icon name="search" /></span>
            <span className="sr-only">Rollen durchsuchen</span>
            <input
              className="ab-input roles-search__input"
              type="search"
              placeholder="Rollen oder Berechtigungen durchsuchen …"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <span className="roles-result-count" aria-live="polite">
            {visibleRoles.length} von {roles.length} Rollen
          </span>
        </section>

        <section className="roles-list-surface ab-surface" aria-labelledby="role-list-title">
          <div className="roles-section-heading">
            <div>
              <p className="roles-eyebrow">Permission-Modell</p>
              <h2 id="role-list-title">Vorhandene RoleBundles</h2>
            </div>
            <span className="ab-badge ab-badge--info">deny-by-default</span>
          </div>

          {visibleRoles.length === 0 ? (
            <div className="ab-empty-state">
              <Icon name="search" />
              <strong>Keine Rolle gefunden</strong>
              <span>Ändere den Suchbegriff oder suche nach einer Capability-ID.</span>
            </div>
          ) : (
            <>
              <div className="roles-table" role="table" aria-label="Rollenübersicht">
                <div className="roles-table__head" role="row">
                  <span role="columnheader">Rolle</span>
                  <span role="columnheader">Berechtigungen</span>
                  <span role="columnheader">Capability-IDs</span>
                </div>
                {visibleRoles.map((role) => <RoleTableRow key={role.id} role={role} />)}
              </div>

              <div className="roles-cards">
                {visibleRoles.map((role) => <RoleCard key={role.id} role={role} />)}
              </div>
            </>
          )}
        </section>

        <section className="roles-metrics" aria-label="Permission-Übersicht">
          <MetricCard icon="roles" value={String(roles.length)} label="Rollen" note="aus dem bestehenden Permission-Modell" />
          <MetricCard
            icon="shield"
            value={String(DEMO_KNOWN_CAPABILITIES.length)}
            label="Capabilities"
            note="bekannte Berechtigungen der Referenz-App"
          />
          <MetricCard icon="layers" value="Ja" label="Mehrfachrollen" note="PrincipalPermissions.roleIds[]" />
        </section>

        <aside className="roles-boundary-note" role="note">
          <Icon name="info" />
          <div>
            <strong>Persistenter Lifecycle, bewusst getrennte Reference-Runtime</strong>
            <p>
              Das Permission-Paket besitzt jetzt Anzeigename, Beschreibung, Status und Managed/System-Lifecycle.
              Die Reference-App verwendet für ihre aktuellen Laufzeit-Rechte weiterhin den bestehenden In-Memory-Store;
              der Editor ist deshalb zunächst die verbindliche UI-Referenz und täuscht keine Persistenz vor.
            </p>
          </div>
        </aside>
      </div>
    </RoleAdminShell>
  );
}

function RoleTableRow({ role }: { readonly role: RoleOverviewItem }) {
  return (
    <div className="roles-table__row" role="row">
      <div className="roles-role-cell" role="cell">
        <span className="roles-role-icon"><Icon name="shield" /></span>
        <div>
          <a className="roles-role-link" href={`#roles/${encodeURIComponent(role.id)}`}>{role.label}</a>
          <code>{role.id}</code>
        </div>
      </div>
      <div role="cell"><strong>{role.capabilities.length}</strong></div>
      <div className="roles-capabilities" role="cell">
        {role.capabilities.map((capability) => <span className="ab-badge" key={capability}>{capability}</span>)}
      </div>
    </div>
  );
}

function RoleCard({ role }: { readonly role: RoleOverviewItem }) {
  return (
    <a className="roles-card roles-card--link" href={`#roles/${encodeURIComponent(role.id)}`}>
      <div className="roles-card__topline">
        <span className="roles-role-icon"><Icon name="shield" /></span>
        <span className="ab-badge ab-badge--info">{role.capabilities.length} Rechte</span>
      </div>
      <h3>{role.label}</h3>
      <code>{role.id}</code>
      <div className="roles-capabilities roles-capabilities--mobile">
        {role.capabilities.map((capability) => <span className="ab-badge" key={capability}>{capability}</span>)}
      </div>
    </a>
  );
}

function MetricCard({
  icon,
  value,
  label,
  note,
}: {
  readonly icon: IconName;
  readonly value: string;
  readonly label: string;
  readonly note: string;
}) {
  return (
    <article className="roles-metric ab-surface">
      <span className="roles-metric__icon"><Icon name={icon} /></span>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
        <small>{note}</small>
      </div>
    </article>
  );
}
