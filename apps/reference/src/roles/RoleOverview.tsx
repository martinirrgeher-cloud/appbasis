import { useMemo, useState, type ReactNode } from 'react';

import { DEMO_KNOWN_CAPABILITIES, DEMO_ROLE_BUNDLES } from '@appbasis/permissions';

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
    <div className="roles-app">
      <MobileHeader />
      <DesktopSidebar />

      <main className="roles-main">
        <div className="roles-content">
          <header className="ab-page-header roles-page-header">
            <div className="ab-page-header__copy">
              <p className="roles-eyebrow">Administration</p>
              <h1 className="ab-page-title">Rollen</h1>
              <p className="ab-page-summary">Rollen und ihre vorhandenen Berechtigungen verwalten.</p>
            </div>
            <button
              className="ab-button ab-button--primary roles-create-button"
              type="button"
              disabled
              title="Rollen anlegen folgt nach der fachlichen Metadaten-Entscheidung."
            >
              <Icon name="plus" />
              <span>Rolle anlegen</span>
            </button>
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
              <strong>Bewusste Architekturgrenze dieses Slices</strong>
              <p>
                Das bestehende Rollenmodell kennt derzeit technische Role-IDs und Capabilities, aber noch keinen
                Anzeigenamen, keine Beschreibung und keinen Aktiv/Inaktiv-Status. Diese Daten werden hier nicht
                erfunden oder parallel gespeichert.
              </p>
            </div>
          </aside>
        </div>
      </main>

      <MobileNavigation />
    </div>
  );
}

function RoleTableRow({ role }: { readonly role: RoleOverviewItem }) {
  return (
    <div className="roles-table__row" role="row">
      <div className="roles-role-cell" role="cell">
        <span className="roles-role-icon"><Icon name="shield" /></span>
        <div>
          <strong>{role.label}</strong>
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
    <article className="roles-card">
      <div className="roles-card__topline">
        <span className="roles-role-icon"><Icon name="shield" /></span>
        <span className="ab-badge ab-badge--info">{role.capabilities.length} Rechte</span>
      </div>
      <h3>{role.label}</h3>
      <code>{role.id}</code>
      <div className="roles-capabilities roles-capabilities--mobile">
        {role.capabilities.map((capability) => <span className="ab-badge" key={capability}>{capability}</span>)}
      </div>
    </article>
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

function MobileHeader() {
  return (
    <header className="roles-mobile-header">
      <Brand />
      <button className="ab-icon-button ab-icon-button--ghost" type="button" aria-label="Benutzermenü">
        <span className="roles-avatar" aria-hidden="true">AB</span>
      </button>
    </header>
  );
}

function DesktopSidebar() {
  return (
    <aside className="roles-sidebar">
      <Brand />
      <nav className="roles-sidebar__nav" aria-label="Hauptnavigation">
        <NavItem href="#dashboard" icon="home">Übersicht</NavItem>
        <NavItem href="#tasks" icon="check">Aufgaben</NavItem>
        <NavItem href="#roles" icon="roles" active>Rollen</NavItem>
      </nav>
      <div className="roles-sidebar__footer">
        <span>AppBasis</span>
        <small>Design System v0.1</small>
      </div>
    </aside>
  );
}

function MobileNavigation() {
  return (
    <nav className="roles-mobile-nav" aria-label="Mobile Hauptnavigation">
      <NavItem href="#dashboard" icon="home">Übersicht</NavItem>
      <NavItem href="#tasks" icon="check">Aufgaben</NavItem>
      <NavItem href="#roles" icon="roles" active>Rollen</NavItem>
      <NavItem href="#roles" icon="more">Mehr</NavItem>
    </nav>
  );
}

function Brand() {
  return (
    <a className="roles-brand" href="#dashboard" aria-label="AppBasis Startseite">
      <span className="roles-brand__mark" aria-hidden="true">A</span>
      <span>AppBasis</span>
    </a>
  );
}

function NavItem({
  href,
  icon,
  active = false,
  children,
}: {
  readonly href: string;
  readonly icon: IconName;
  readonly active?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <a className={`roles-nav-item${active ? ' roles-nav-item--active' : ''}`} href={href} aria-current={active ? 'page' : undefined}>
      <Icon name={icon} />
      <span>{children}</span>
    </a>
  );
}

type IconName = 'check' | 'home' | 'info' | 'layers' | 'more' | 'plus' | 'roles' | 'search' | 'shield';

function Icon({ name }: { readonly name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    check: <><path d="M5 12.5 9 16l10-10" /><path d="M5 5h14v14H5z" /></>,
    home: <><path d="m4 11 8-7 8 7" /><path d="M6 10v10h12V10M10 20v-6h4v6" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5h.01" /></>,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    roles: <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="10" r="2.5" /><path d="M3.5 20c.5-4 2.4-6 5.5-6s5 2 5.5 6M14 15c3.4-.4 5.4 1.3 6 5" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m16.5 16.5 4 4" /></>,
    shield: <><path d="M12 3 20 6v5c0 5-3.3 8.6-8 10-4.7-1.4-8-5-8-10V6l8-3Z" /><path d="m9 12 2 2 4-4" /></>,
  };

  return (
    <svg className="roles-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}
