import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ReferenceBrand } from '../src/shell/ReferenceBrand';

describe('ReferenceBrand', () => {
  it('owns the shared AppBasis identity semantics while leaving presentation classes to the consumer', () => {
    const html = renderToStaticMarkup(
      <ReferenceBrand classes={{ root: 'consumer-brand', mark: 'consumer-brand__mark' }} />,
    );

    expect(html).toContain('class="consumer-brand"');
    expect(html).toContain('href="#dashboard"');
    expect(html).toContain('aria-label="AppBasis Startseite"');
    expect(html).toContain('class="consumer-brand__mark"');
    expect(html).toContain('aria-hidden="true">A</span>');
    expect(html).toContain('<span>AppBasis</span>');
  });
});
