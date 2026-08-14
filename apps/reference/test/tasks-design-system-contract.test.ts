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

  it('keeps mobile navigation primary and switches to the desktop sidebar only at 1024px', () => {
    expect(styles).toContain('position: fixed;');
    expect(styles).toContain('@media (min-width: 40rem)');
    expect(styles).toContain('@media (min-width: 64rem)');
    expect(styles).not.toContain('@media (min-width: 48rem)');
  });
});
