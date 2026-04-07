import { describe, expect, it } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';

import Home from './page';

describe('Home', () => {
  it('renders the template heading and capability list', () => {
    const html = renderToStaticMarkup(<Home />);

    expect(html).toContain('Strict monorepo template');
    expect(html).toContain('NestJS API template');
  });
});
