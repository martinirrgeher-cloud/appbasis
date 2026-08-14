import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const foundation = readFileSync(
  new URL('../../../packages/ui/foundation.css', import.meta.url),
  'utf8',
);

describe('Reference tasks design-system contract', () => {
  it('consumes shared foundation classes instead of keeping local component duplicates', () => {
    expect(styles).toContain("@import '../../../packages/ui/foundation.css';");
    expect(app).toContain('className="ab-button ab-button--primary"');
    expect(app).toContain('className="ab-input"');
    expect(app).toContain('className="ab-textarea"');
    expect(app).toContain('className="ab-surface task-panel"');
    expect(app).toContain('className="ab-badge ab-badge--info"');
    expect(styles).not.toContain('.primary-button');
    expect(styles).not.toContain('.demo-badge');
  });

  it('extends the fachneutral foundation for the real multiline-field consumer', () => {
    expect(foundation).toContain('.ab-input,\n.ab-textarea {');
    expect(foundation).toContain('.ab-textarea:focus-visible');
    expect(foundation).toContain(".ab-textarea[aria-invalid='true']");
    expect(foundation).toContain(
      'min-height: calc(var(--ab-touch-target) + var(--ab-touch-target));',
    );
    expect(foundation).toContain('resize: vertical;');
  });

  it('keeps custom interactive task controls on the shared 44px touch-target contract', () => {
    expect(styles).toContain('min-height: var(--ab-touch-target);');
    expect(styles).toContain('width: var(--ab-touch-target);');
    expect(styles).toContain('height: var(--ab-touch-target);');
  });

  it('keeps task-only presentation scoped away from the roles route', () => {
    expect(styles).toContain('.app-shell h1');
    expect(styles).toContain('.app-shell a:focus-visible');
    expect(styles).not.toContain('.app-shell input');
    expect(styles).not.toContain('.app-shell textarea');
    expect(styles).not.toMatch(/(^|\n)h1\s*\{/u);
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
