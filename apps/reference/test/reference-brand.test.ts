import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const brandSource = readFileSync(
  new URL('../src/shell/ReferenceBrand.tsx', import.meta.url),
  'utf8',
);

describe('ReferenceBrand', () => {
  it('owns the shared AppBasis identity semantics while leaving presentation classes to the consumer', () => {
    expect(brandSource).toContain('className={classes.root}');
    expect(brandSource).toContain('href="#dashboard"');
    expect(brandSource).toContain('aria-label="AppBasis Startseite"');
    expect(brandSource).toContain('className={classes.mark}');
    expect(brandSource).toContain('aria-hidden="true">A</span>');
    expect(brandSource).toContain('<span>AppBasis</span>');
  });
});
