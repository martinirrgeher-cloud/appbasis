import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const navigationLinkSource = readFileSync(
  new URL('../src/shell/ReferenceNavigationLink.tsx', import.meta.url),
  'utf8',
);
const tasksConsumer = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const rolesConsumer = readFileSync(
  new URL('../src/roles/RoleAdminShell.tsx', import.meta.url),
  'utf8',
);

describe('ReferenceNavigationLink', () => {
  it('owns shared active-link semantics while leaving presentation classes to each consumer', () => {
    expect(navigationLinkSource).toContain('readonly root: string;');
    expect(navigationLinkSource).toContain('readonly active: string;');
    expect(navigationLinkSource).toContain(
      "const className = `${classes.root}${active ? ` ${classes.active}` : ''}`;",
    );
    expect(navigationLinkSource).toContain(
      "aria-current={active ? 'page' : undefined}",
    );
  });

  it('is adopted by Tasks without changing the Tasks navigation contract', () => {
    expect(tasksConsumer).toContain(
      "import { ReferenceNavigationLink } from './shell/ReferenceNavigationLink';",
    );
    expect(tasksConsumer).toContain("root: 'nav-link'");
    expect(tasksConsumer).toContain("active: 'nav-link--active'");
    expect(tasksConsumer).toContain(
      '<ReferenceNavigationLink classes={taskNavigationLinkClasses} href="#dashboard" active>',
    );
    expect(tasksConsumer).toContain(
      '<ReferenceNavigationLink classes={taskNavigationLinkClasses} href="#tasks">',
    );
    expect(tasksConsumer).toContain(
      '<nav className="navigation" aria-label="Hauptnavigation">',
    );
    expect(tasksConsumer).not.toContain(
      '<a className="nav-link nav-link--active" href="#dashboard">',
    );
  });

  it('is adopted by Roles while preserving its separate desktop/mobile navigation structure', () => {
    expect(rolesConsumer).toContain(
      "import { ReferenceNavigationLink } from '../shell/ReferenceNavigationLink';",
    );
    expect(rolesConsumer).toContain("root: 'roles-nav-item'");
    expect(rolesConsumer).toContain("active: 'roles-nav-item--active'");
    expect(rolesConsumer).toContain(
      '<ReferenceNavigationLink classes={roleNavigationLinkClasses} href={href} active={active}>',
    );
    expect(rolesConsumer).toContain('<DesktopSidebar />');
    expect(rolesConsumer).toContain('<MobileNavigation />');
    expect(rolesConsumer).toContain('<Icon name={icon} />');
    expect(rolesConsumer).not.toContain(
      '<a className={`roles-nav-item${active ? \' roles-nav-item--active\' : \'\'}`}',
    );
  });
});
