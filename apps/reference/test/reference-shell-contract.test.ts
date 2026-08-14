import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const tasksStyles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const rolesStyles = readFileSync(
  new URL('../src/roles/role-overview.css', import.meta.url),
  'utf8',
);
const tasksConsumer = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const rolesConsumer = readFileSync(
  new URL('../src/roles/RoleAdminShell.tsx', import.meta.url),
  'utf8',
);
const tokens = readFileSync(new URL('../../../packages/ui/tokens.css', import.meta.url), 'utf8');

function cssBlock(source: string, selector: string): string {
  const marker = `${selector} {`;
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error(`Missing CSS block: ${selector}`);
  }

  const openIndex = markerIndex + marker.length - 1;
  let depth = 1;

  for (let index = openIndex + 1; index < source.length; index += 1) {
    if (source[index] === '{') {
      depth += 1;
      continue;
    }
    if (source[index] !== '}') continue;

    depth -= 1;
    if (depth === 0) {
      return source.slice(openIndex + 1, index);
    }
  }

  throw new Error(`Unclosed CSS block: ${selector}`);
}

describe('Reference shared shell contract', () => {
  it('wires the contracted shell classes into both real React consumers', () => {
    expect(tasksConsumer).toContain('<div className="app-shell">');
    expect(tasksConsumer).toContain('<nav className="navigation" aria-label="Hauptnavigation">');

    expect(rolesConsumer).toContain('<div className="roles-app">');
    expect(rolesConsumer).toContain('<DesktopSidebar />');
    expect(rolesConsumer).toContain('<MobileNavigation />');
    expect(rolesConsumer).toContain('<aside className="roles-sidebar">');
    expect(rolesConsumer).toContain(
      '<nav className="roles-mobile-nav" aria-label="Mobile Hauptnavigation">',
    );
  });

  it('keeps both real consumers mobile-first with bottom navigation', () => {
    const taskNavigation = cssBlock(tasksStyles, '.navigation');
    const roleNavigation = cssBlock(rolesStyles, '.roles-mobile-nav');

    for (const navigation of [taskNavigation, roleNavigation]) {
      expect(navigation).toContain('position: fixed;');
      expect(navigation).toContain('bottom: 0;');
    }

    expect(cssBlock(rolesStyles, '.roles-sidebar')).toContain('display: none;');
  });

  it('switches both real consumers to a sticky desktop sidebar at the documented 1024px boundary', () => {
    const taskDesktop = cssBlock(tasksStyles, '@media (min-width: 64rem)');
    const roleDesktop = cssBlock(rolesStyles, '@media (min-width: 1024px)');

    expect(cssBlock(taskDesktop, '.shell-body')).toContain(
      'grid-template-columns: 14rem minmax(0, 1fr);',
    );
    const taskNavigation = cssBlock(taskDesktop, '.navigation');
    expect(taskNavigation).toContain('position: sticky;');
    expect(taskNavigation).toContain('top: 4rem;');

    expect(cssBlock(roleDesktop, '.roles-app')).toContain(
      'grid-template-columns: 244px minmax(0, 1fr);',
    );
    expect(cssBlock(roleDesktop, '.roles-mobile-header,\n  .roles-mobile-nav')).toContain(
      'display: none;',
    );
    const roleSidebar = cssBlock(roleDesktop, '.roles-sidebar');
    expect(roleSidebar).toContain('display: flex;');
    expect(roleSidebar).toContain('position: sticky;');
    expect(roleSidebar).toContain('top: 0;');
  });

  it('uses the same semantic shell and brand tokens in both consumers', () => {
    const taskShell = cssBlock(tasksStyles, '.app-shell');
    const roleShell = cssBlock(rolesStyles, '.roles-app');

    for (const shell of [taskShell, roleShell]) {
      expect(shell).toContain('background: var(--ab-surface-page);');
      expect(shell).toContain('color: var(--ab-text-primary);');
    }

    const taskBrandMark = cssBlock(tasksStyles, '.brand-mark');
    const roleBrandMark = cssBlock(rolesStyles, '.roles-brand__mark');

    for (const brandMark of [taskBrandMark, roleBrandMark]) {
      expect(brandMark).toContain('background: var(--ab-brand-primary);');
      expect(brandMark).toContain('color: var(--ab-text-inverse);');
    }
  });

  it('keeps primary navigation targets on the shared 44px touch-target contract', () => {
    expect(cssBlock(tokens, ':root')).toContain('--ab-touch-target: 44px;');
    expect(cssBlock(tasksStyles, '.nav-link')).toContain(
      'min-height: var(--ab-touch-target);',
    );
    expect(cssBlock(rolesStyles, '.roles-nav-item')).toContain(
      'min-height: var(--ab-touch-target);',
    );
  });
});
