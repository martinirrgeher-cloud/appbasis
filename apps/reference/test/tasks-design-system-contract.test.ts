import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

describe('Reference tasks design-system contract', () => {
  it('consumes the shared AppBasis foundation instead of owning a parallel theme', () => {
    expect(styles).toContain("@import '../../../packages/ui/foundation.css';");
    expect(styles).toContain('background: var(--ab-surface-page);');
    expect(styles).toContain('color: var(--ab-text-primary);');
    expect(styles).toContain('background: var(--ab-action-primary);');
    expect(styles).toContain('box-shadow: 0 0 0 3px var(--ab-focus-ring);');
  });

  it('keeps interactive task controls on the shared 44px touch-target contract', () => {
    expect(styles).toContain('min-height: var(--ab-touch-target);');
    expect(styles).toContain('width: var(--ab-touch-target);');
    expect(styles).toContain('height: var(--ab-touch-target);');
  });

  it('keeps task form and heading rules scoped away from the roles route', () => {
    expect(styles).toContain('.app-shell h1');
    expect(styles).toContain('.app-shell input,');
    expect(styles).toContain('.app-shell textarea');
    expect(styles).toContain('.app-shell button:focus-visible');
    expect(styles).not.toMatch(/(^|\n)h1\s*\{/u);
    expect(styles).not.toMatch(/(^|\n)input,\s*\ntextarea\s*\{/u);
  });

  it('keeps mobile navigation primary and switches that navigation to the sidebar only at 1024px', () => {
    const desktopMarker = '@media (min-width: 64rem)';
    const desktopMarkerIndex = styles.indexOf(desktopMarker);

    expect(desktopMarkerIndex).toBeGreaterThan(0);
    const beforeDesktop = styles.slice(0, desktopMarkerIndex);
    const desktop = styles.slice(desktopMarkerIndex);

    expect(beforeDesktop).toContain('.navigation {\n  position: fixed;');
    expect(beforeDesktop).not.toContain('.navigation {\n    position: sticky;');
    expect(desktop).toContain('.navigation {\n    position: sticky;');
    expect(beforeDesktop).toContain('@media (min-width: 40rem)');
  });
});
