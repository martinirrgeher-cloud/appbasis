import type { ReactNode } from 'react';

import { ReferenceBrand } from '../shell/ReferenceBrand';
import { ReferenceNavigationLink } from '../shell/ReferenceNavigationLink';
import './role-overview.css';

const roleBrandClasses = {
  root: 'roles-brand',
  mark: 'roles-brand__mark',
} as const;

const roleNavigationLinkClasses = {
  root: 'roles-nav-item',
  active: 'roles-nav-item--active',
} as const;

export function RoleAdminShell({ children }: { readonly children: ReactNode }) {
  return (
    <div className="roles-app">
      <MobileHeader />
      <DesktopSidebar />
      <main className="roles-main">{children}</main>
      <MobileNavigation />
    </div>
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
  return <ReferenceBrand classes={roleBrandClasses} />;
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
    <ReferenceNavigationLink classes={roleNavigationLinkClasses} href={href} active={active}>
      <Icon name={icon} />
      <span>{children}</span>
    </ReferenceNavigationLink>
  );
}

export type IconName =
  | 'check'
  | 'close'
  | 'home'
  | 'info'
  | 'layers'
  | 'more'
  | 'plus'
  | 'roles'
  | 'save'
  | 'search'
  | 'shield'
  | 'users';

export function Icon({ name }: { readonly name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    check: <><path d="M5 12.5 9 16l10-10" /><path d="M5 5h14v14H5z" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    home: <><path d="m4 11 8-7 8 7" /><path d="M6 10v10h12V10M10 20v-6h4v6" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5h.01" /></>,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    roles: <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="10" r="2.5" /><path d="M3.5 20c.5-4 2.4-6 5.5-6s5 2 5.5 6M14 15c3.4-.4 5.4 1.3 6 5" /></>,
    save: <><path d="M5 4h12l2 2v14H5z" /><path d="M8 4v6h8V4M8 20v-6h8v6" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m16.5 16.5 4 4" /></>,
    shield: <><path d="M12 3 20 6v5c0 5-3.3 8.6-8 10-4.7-1.4-8-5-8-10V6l8-3Z" /><path d="m9 12 2 2 4-4" /></>,
    users: <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="10" r="2.5" /><path d="M3.5 20c.5-4 2.4-6 5.5-6s5 2 5.5 6M14 15c3.4-.4 5.4 1.3 6 5" /></>,
  };

  return (
    <svg className="roles-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}
